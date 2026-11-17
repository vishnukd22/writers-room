'use strict';
// NOTHING TO DECLARE: airport customs, inspired by Sheriff of Nottingham.
// Each round one player is the customs officer. Everyone else packs a suitcase on their phone from a hand of real items,
// picks a lane, and (in the green lane) says what's inside. The officer waves bags through or opens them.
// Contraband found: the traveller pays a fine. Honest bag opened: the officer pays the traveller. Bribes are welcome.
// Supervisor Brenda runs the hall over the tannoy. Biscuit the beagle can sniff one bag per round.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const voice = require('./voice');
const photos = require('./bc-photos');
const { SAY } = require('./ntd-lines');
const { CATS, LEGAL, ITEMS, BY_ID } = require('./ntd-items');

photos.register(ITEMS);

const SPEED = Number(process.env.WR_SPEED || 1);
const ms = (s) => Math.max(30, Math.round(s * 1000 * SPEED));
const uid = () => crypto.randomBytes(6).toString('hex');
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const shuffle = (arr) => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const clip = (s, n) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);
const strip = voice.stripTags;
const fill = (t, o) => String(t).replace(/\{(\w+)\}/g, (_, k) => (o[k] ?? ''));
const aed = (n) => `AED ${Math.round(n).toLocaleString('en-US')}`;
class Cancelled extends Error {}

const COLORS = ['#E8553D', '#1E9C93', '#F2B33D', '#3A6EA5', '#C25B8C', '#6E9C3A', '#8C5BC2', '#D9822B'];
const BOT_NAMES = ['Ahmed', 'Bella', 'Carlos', 'Dina', 'Erik', 'Fatima', 'Gopal', 'Hana'];
const MIN = 2; const MAX = 8;
const START_CASH = 5000;
const GREEN_MAX = 4; const RED_MAX = 6; // the duty-free allowance, and the most a red-lane bag can hold
const DUTY = 0.05; // the red lane's customs duty, the same five percent the UAE charges
const SORRY = 500; // what the officer pays per item when they open an honest bag
const SWAPS = 2; // items you can swap for new ones each round
const BONUS = { first: 3000, second: 1500, smuggler: 5000 };

function bustPool() {
  let nums = [];
  try { nums = fs.readdirSync(path.join(__dirname, '..', 'public', 'assets', 'img')).map((f) => /^bust-(\d+)\.(png|jpe?g|webp)$/i.exec(f)).filter(Boolean).map((m) => Number(m[1])); } catch (e) { nums = []; }
  return nums.length >= 4 ? [...new Set(nums)].sort((a, b) => a - b) : [...Array(16).keys()].map((i) => i + 1);
}
const declText = (cat, n) => `${n} ${n === 1 ? CATS[cat].one : CATS[cat].many}`;
const listText = (names) => (names.length <= 1 ? names[0] || 'nothing' : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);

class NothingToDeclare {
  constructor(code, hooks, opts = {}) {
    this.kind = 'ntd'; this.code = code; this.hooks = hooks; this.test = !!opts.test;
    this.players = []; this.phase = 'LOBBY'; this.d = {}; this.endsAt = null; this.cue = null;
    this.runId = 0; this.waiter = null; this.lastActive = Date.now(); this.syncPending = false;
    this.fx = []; this.fxSeq = 0; this.timers = []; this.busts = bustPool(); this.taught = false;
    this.reset();
  }
  reset() { Object.assign(this, { round: -1, rounds: 0, officer: null, bags: [], deck: [], sniffed: false, choice: null, two: false, awards: null, lastBribeLine: 0 }); }

  // ------------------------------------------------------------ plumbing (same pattern as the other games)
  P(id) { return this.players.find((p) => p.id === id); }
  humans() { return this.players.filter((p) => !p.bot); }
  vip() { return this.humans().find((p) => p.connected) || this.players[0]; }
  pub(p) { return p ? { id: p.id, name: p.name, color: p.color, bust: p.bust, bot: !!p.bot } : null; }
  sync() {
    if (this.syncPending) return; this.syncPending = true;
    setTimeout(() => {
      this.syncPending = false;
      try { this.hooks.toHost(this.view(null)); for (const p of this.players) if (p.connected && !p.bot) this.hooks.toPlayer(p.id, this.view(p)); } catch (e) { console.error('ntd sync', e); }
    }, 40);
  }
  progress() { this.lastProgress = Date.now(); }
  setPhase(phase, d = {}, seconds = null) { this.progress(); this.phase = phase; this.d = d; this.endsAt = seconds ? Date.now() + ms(seconds) : null; this.lastActive = Date.now(); this.sync(); this.botTurn(); }
  setStep(patch, seconds) { Object.assign(this.d, patch); if (seconds !== undefined) this.endsAt = seconds ? Date.now() + ms(seconds) : null; this.progress(); this.sync(); this.botTurn(); }
  sfx(name) { this.fxSeq++; this.fx.push({ id: this.fxSeq, name }); if (this.fx.length > 14) this.fx.shift(); this.sync(); }
  guard(g) { if (g !== this.runId) throw new Cancelled(); }
  later(g, t, fn) { const h = setTimeout(() => { if (g !== this.runId) return; try { fn(); } catch (e) { console.error('ntd timer', e); } }, t); this.timers.push(h); if (this.timers.length > 300) this.timers = this.timers.slice(-150); return h; }
  clearTimers() { this.timers.forEach(clearTimeout); this.timers = []; }
  wait(duration, doneFn = null) {
    if (this.waiter) this.waiter.resolve('replaced');
    return new Promise((resolve) => {
      const w = { doneFn, resolve: (r) => { if (this.waiter === w) this.waiter = null; clearTimeout(w.t); resolve(r); } };
      w.t = setTimeout(() => w.resolve('time'), Math.max(30, duration));
      this.waiter = w;
      if (doneFn && doneFn()) w.resolve('done');
    });
  }
  check() { const w = this.waiter; if (w && w.doneFn && w.doneFn()) w.resolve('done'); }
  wake(reason) { if (this.waiter) this.waiter.resolve(reason); }
  skip(byId) { if (byId && byId !== this.vip()?.id) return; if (['LOBBY', 'END', 'PACK'].includes(this.phase) || (this.phase === 'DESK' && this.d.step === 'talk')) return; this.cue = null; this.wake('skip'); }
  pause(g, s) { return this.wait(ms(s)).then(() => this.guard(g)); }
  shiftClock() { /* nothing in this game counts down on its own */ }

  // ------------------------------------------------------------ Brenda, on the tannoy
  prefetch(text, urgent = false) { return voice.get(text, voice.NTD(), urgent, false).catch(() => null); }
  estimate(text) { return Math.min(22000, 700 + strip(text).length * 62); }
  async makeCue(text, opts = {}) {
    let audioId = null;
    if (voice.enabled()) audioId = await Promise.race([this.prefetch(text, opts.urgent !== false), new Promise((r) => setTimeout(() => r(null), opts.maxWait || 7000))]);
    return { id: uid(), text: strip(text), audio: audioId ? `/audio/${audioId}` : null, kind: 'host', mood: opts.mood || 'calm', hall: true };
  }
  async say(g, text, opts = {}) {
    if (!strip(text)) return 'empty';
    const cue = await this.makeCue(text, opts); this.guard(g);
    this.cue = cue; this.cueDone = null; this.sync(); this.progress();
    const est = this.estimate(text);
    const r = await this.wait(cue.audio ? est * 1.7 + 3000 : est * 1.5 + 1500, () => this.cueDone === cue.id);
    this.guard(g);
    if (this.cue === cue) { this.cue = null; this.sync(); }
    return r;
  }
  async sayOver(g, text, opts = {}) { if (!strip(text)) return; const cue = await this.makeCue(text, { maxWait: 1500, ...opts }); if (g !== this.runId) return; this.cue = cue; this.sync(); }
  cueFinished(id) { this.cueDone = id; if (this.cue && this.cue.id === id) this.cue = null; this.check(); }
  prefetchAll() {
    if (this.madeAll) return; this.madeAll = true;
    for (const v of Object.values(SAY)) { if (typeof v === 'string' && !v.includes('{')) this.prefetch(v); else if (Array.isArray(v)) v.filter((t) => !t.includes('{')).forEach((t) => this.prefetch(t)); }
  }

  // ------------------------------------------------------------ lobby
  join(name, token) {
    this.lastActive = Date.now();
    if (token) { const p = this.players.find((x) => x.token === token); if (p) return { player: p }; }
    name = clip(name, 12);
    if (!name) return { error: 'Enter your name' };
    const same = this.players.find((x) => x.name.toLowerCase() === name.toLowerCase());
    if (same && !same.bot && !same.connected) { same.token = uid(); return { player: same }; }
    if (same) return { error: 'That name is taken' };
    if (this.phase !== 'LOBBY') return { error: 'This game has already started. Wait for the next one.' };
    if (this.players.length >= MAX) return { error: `The hall is full (${MAX} players)` };
    const p = this.newPlayer(name, false); this.players.push(p); this.sync();
    return { player: p };
  }
  newPlayer(name, bot) {
    const used = new Set(this.players.map((x) => x.color));
    const free = this.busts.filter((b) => !this.players.some((x) => x.bust === b));
    return { id: uid(), token: uid(), name, color: COLORS.find((c) => !used.has(c)) || pick(COLORS), connected: true, bot, bust: free.length ? pick(free) : pick(this.busts) };
  }
  addBot(fromVip = false) {
    if ((!this.test && !fromVip) || this.phase !== 'LOBBY' || this.players.length >= MAX) return { error: 'No room for more bots' };
    const name = BOT_NAMES.find((n) => !this.players.some((p) => p.name === n)) || `Bot ${this.players.length + 1}`;
    this.players.push(this.newPlayer(name, true)); this.sync(); return { ok: true };
  }
  removeBots() { if (this.phase !== 'LOBBY') return; this.players = this.players.filter((p) => !p.bot); this.sync(); }
  setConnected(id, on) { const p = this.P(id); if (p) { p.connected = on; this.lastActive = Date.now(); this.check(); this.sync(); } }
  setBust(id, n) {
    const p = this.P(id); n = Number(n);
    if (!p || !this.busts.includes(n) || this.players.some((x) => x !== p && x.bust === n)) return { error: 'Someone already picked that one' };
    p.bust = n; this.sync(); return { ok: true };
  }
  kick(byId, target) { if (this.phase !== 'LOBBY' || this.vip()?.id !== byId) return; this.players = this.players.filter((p) => p.id !== target); this.hooks.kicked?.(target); this.sync(); }

  start(byId) {
    if (byId && this.vip()?.id !== byId) return { error: 'Only the first player can start' };
    if (this.phase !== 'LOBBY') return {};
    this.players = this.players.filter((p) => p.connected);
    if (this.players.length < MIN) return { error: `Nothing to Declare needs at least ${MIN} players. Add a bot from the first phone.` };
    this.reset(); this.prefetchAll();
    const n = this.players.length;
    this.two = n <= 3; // Two Bags: with 2 or 3 players, every traveller packs two suitcases
    this.rounds = n <= 3 ? 6 : n;
    this.order = shuffle(this.players.map((p) => p.id));
    for (const p of this.players) Object.assign(p, { cash: START_CASH, hand: [], haul: [], swaps: SWAPS, packed: false, draft: null, stats: { fines: 0, comp: 0, bribesPaid: 0, bribesTaken: 0, caught: 0, cleared: 0, barked: 0, opened: 0, biggestBribe: 0 } });
    this.deck = this.newDeck();
    const g = ++this.runId; this.startWatchdog(g);
    this.run(g).catch((e) => { if (!(e instanceof Cancelled)) { console.error('ntd run error', e); this.finishGame(); } });
    return {};
  }
  playAgain(byId) {
    if (this.phase !== 'END' || this.vip()?.id !== byId) return;
    this.runId++; this.clearTimers(); this.players = this.players.filter((p) => p.connected);
    this.cue = null; this.reset(); this.setPhase('LOBBY', {});
  }
  startWatchdog(g) {
    clearInterval(this.dog); this.progress();
    this.dog = setInterval(() => {
      if (g !== this.runId || this.phase === 'END' || this.phase === 'LOBBY') { clearInterval(this.dog); return; }
      if (!this.pauseInfo && Date.now() - this.lastProgress > 150000) { console.error(`ntd ${this.code}: stuck in ${this.phase}, moving on`); this.progress(); this.cue = null; this.wake('watchdog'); this.sync(); }
    }, 5000);
  }

  // ------------------------------------------------------------ the cards
  newDeck() { const d = []; for (const it of ITEMS) for (let i = 0; i < it.copies; i++) d.push(it.id); return shuffle(d); }
  draw() { if (!this.deck.length) this.deck = this.newDeck(); return { uid: uid(), id: this.deck.pop() }; }
  handSize() { return this.two ? 7 : 6; }
  refill(p) { while (p.hand.length < this.handSize()) p.hand.push(this.draw()); }
  item(inst) { const b = BY_ID[inst.id]; return { uid: inst.uid, id: inst.id, name: b.name, cat: b.cat, value: b.value, img: photos.urlFor(inst.id), line: b.line }; }
  travellers() { return this.players.filter((p) => p.id !== this.officer); }

  // ------------------------------------------------------------ the night
  async run(g) {
    this.setPhase('INTRO', { step: 'welcome' }); this.sfx('ntd-chime');
    await this.say(g, SAY.welcome, { mood: 'calm' });
    this.setPhase('INTRO', { step: 'rules' });
    await this.say(g, this.taught ? SAY.rulesShort : SAY.rules, { mood: 'calm' });
    if (this.two && !this.taught) await this.say(g, SAY.rulesTwo, { mood: 'calm' });
    this.taught = true;
    for (let r = 0; r < this.rounds; r++) await this.playRound(g, r);
    await this.awardsNight(g);
  }
  async playRound(g, r) {
    this.round = r; this.officer = this.order[r % this.order.length]; this.sniffed = false; this.bags = [];
    for (const p of this.players) { this.refill(p); p.swaps = SWAPS; p.packed = false; p.draft = null; }
    const off = this.P(this.officer);
    this.setPhase('ROUND', { step: 'officer', last: r === this.rounds - 1 }); this.sfx('ntd-chime');
    await this.say(g, r === this.rounds - 1 ? `${SAY.lastRound} ${fill(pick(SAY.officer), { name: off.name })}` : fill(pick(SAY.officer), { name: off.name }), { mood: 'calm' });
    // packing
    const T = this.two ? 80 : 60;
    this.setPhase('PACK', {}, T);
    this.sayOver(g, pick(SAY.pack));
    this.later(g, ms(T - 10), () => { if (this.phase === 'PACK') this.sayOver(g, pick(SAY.packHurry)); });
    await this.wait(ms(T), () => this.travellers().every((p) => p.packed)); this.guard(g);
    for (const p of this.travellers()) if (!p.packed) this.finalisePack(p, true);
    // onto the belt
    this.setPhase('BELT', {}); this.sfx('ntd-belt');
    await this.pause(g, 2.6); this.sfx('ntd-xray');
    await this.pause(g, 1.2);
    // the red lane first: honest, dull, and quick
    const red = this.bags.filter((b) => b.lane === 'red');
    if (red.length) {
      for (const b of red) { const owner = this.P(b.pid); const items = b.items.map((u) => b.inst[u]); const val = items.reduce((s, it) => s + BY_ID[it.id].value, 0); b.duty = Math.ceil((val * DUTY) / 10) * 10; owner.cash -= b.duty; for (const it of items) owner.haul.push({ ...it, smug: false, r }); b.done = true; }
      this.setPhase('RED', { bags: red.map((b) => b.id) }); this.sfx('ntd-stamp');
      await this.say(g, red.length === 1 ? fill(pick(SAY.redLane), { name: this.P(red[0].pid).name }) : fill(pick(SAY.redLane), { name: listText(red.map((b) => this.P(b.pid).name)) }), { mood: 'calm' });
      await this.pause(g, 1.2);
    }
    // the green lane: one bag at a time, at the desk
    const green = shuffle(this.bags.filter((b) => b.lane === 'green'));
    for (const b of green) await this.desk(g, b);
    // the scores
    this.setPhase('SCORES', { last: r === this.rounds - 1 }); this.sfx('ntd-chime');
    await this.say(g, pick(SAY.scores), { mood: 'calm' });
    await this.pause(g, 3);
  }
  async desk(g, bag) {
    const owner = this.P(bag.pid); const off = this.P(this.officer);
    const what = declText(bag.decl, bag.items.length);
    this.choice = null; this.deskBag = bag; bag.sniff = null;
    // Brenda's lines for whatever's inside are recorded now, in case the bag gets opened
    for (const u of bag.items) this.prefetch(BY_ID[bag.inst[u].id].line);
    this.setPhase('DESK', { bag: bag.id, step: 'intro' }); this.sfx('ntd-thud');
    await this.say(g, fill(pick(SAY.desk), { name: owner.name, what }), { mood: 'calm' });
    if (bag.bribe > 0) { this.sfx('ntd-cash'); await this.say(g, fill(pick(SAY.bribe), { name: owner.name, amt: aed(bag.bribe) }), { mood: 'suspicious' }); }
    // the talking: the officer decides, everyone else shouts
    const TALK = this.players.length >= 7 ? 20 : 25;
    this.setStep({ step: 'talk' }, TALK); this.sfx('ntd-tick');
    while (!this.choice) {
      const r = await this.wait(Math.max(30, this.endsAt - Date.now()), () => !!this.choice || this.sniffNow); this.guard(g);
      if (this.sniffNow) {
        this.sniffNow = false; const left = Math.max(10000, this.endsAt - Date.now());
        this.setStep({ step: 'sniff' }, 0); this.sfx('ntd-sniff'); this.sayOver(g, pick(SAY.sniff));
        await this.pause(g, 2.6);
        const bark = bag.items.some((u) => BY_ID[bag.inst[u].id].cat === 'contra');
        bag.sniff = bark ? 'bark' : 'quiet'; if (bark) owner.stats.barked++;
        this.setStep({ step: 'sniffed' }, 0); this.sfx(bark ? 'ntd-bark' : 'ntd-chime');
        await this.say(g, pick(bark ? SAY.bark : SAY.quiet), { mood: bark ? 'gotcha' : 'calm' });
        this.setStep({ step: 'talk' }, Math.round(left / 1000 / SPEED)); this.sfx('ntd-tick');
        continue;
      }
      if (!this.choice && (r === 'time' || r === 'watchdog')) { this.choice = 'timeout'; }
    }
    const choice = this.choice; this.endsAt = null;
    const items = bag.items.map((u) => bag.inst[u]);
    if (choice === 'wave' || choice === 'timeout') {
      const paid = bag.bribe > 0 && owner.cash >= bag.bribe ? bag.bribe : 0;
      if (paid) { owner.cash -= paid; off.cash += paid; owner.stats.bribesPaid += paid; off.stats.bribesTaken += paid; owner.stats.biggestBribe = Math.max(owner.stats.biggestBribe, paid); }
      for (const it of items) owner.haul.push({ ...it, smug: BY_ID[it.id].cat !== bag.decl, r: this.round });
      owner.stats.cleared++;
      bag.result = { kind: 'wave', paid }; bag.done = true;
      this.setStep({ step: 'wave', paid }, 0); this.sfx('ntd-stamp'); if (paid) this.later(g, ms(0.5), () => this.sfx('ntd-cash'));
      await this.say(g, choice === 'timeout' ? SAY.timeout[0] : paid ? fill(pick(SAY.waveBribe), { amt: aed(paid) }) : pick(SAY.wave), { mood: 'calm' });
      await this.pause(g, 1.5);
      return;
    }
    // open it
    off.stats.opened++;
    this.setStep({ step: 'open' }, 0); this.sfx('ntd-drumroll');
    await this.say(g, pick(SAY.open), { mood: 'suspicious' });
    this.sfx('ntd-zip');
    const verdict = items.map((it) => ({ uid: it.uid, ok: BY_ID[it.id].cat === bag.decl }));
    const bad = items.filter((it) => BY_ID[it.id].cat !== bag.decl);
    let fine = 0; let comp = 0;
    if (!bad.length) {
      comp = SORRY * items.length;
      off.cash -= comp; owner.cash += comp; owner.stats.comp += comp;
      for (const it of items) owner.haul.push({ ...it, smug: false, r: this.round });
    } else {
      fine = bad.reduce((s, it) => s + Math.max(100, Math.ceil(BY_ID[it.id].value / 20) * 10), 0);
      owner.cash -= fine; off.cash += fine; owner.stats.fines += fine; owner.stats.caught++;
      for (const it of items) if (BY_ID[it.id].cat === bag.decl) owner.haul.push({ ...it, smug: false, r: this.round });
    }
    bag.result = { kind: bad.length ? 'caught' : 'honest', fine, comp, verdict }; bag.done = true;
    this.setStep({ step: 'reveal', verdict, fine, comp }, 0);
    await this.pause(g, 0.9 + items.length * 0.75);
    if (bad.length) {
      this.sfx('ntd-alarm');
      if (bad.some((it) => it.id === 'ntd-macaw')) this.later(g, ms(0.6), () => this.sfx('ntd-squawk'));
      if (bad.some((it) => BY_ID[it.id].cat === 'contra')) this.later(g, ms(1.1), () => this.sfx('ntd-gasp'));
      this.setStep({ step: 'stamp' }, 0); this.later(g, ms(0.3), () => this.sfx('ntd-stamp'));
      const worst = [...bad].sort((a, b) => BY_ID[b.id].value - BY_ID[a.id].value)[0];
      await this.say(g, `${BY_ID[worst.id].line} ${fill(pick(SAY.caught), { name: owner.name, what: CATS[bag.decl].many, amt: aed(fine) })}`, { mood: 'gotcha' });
      this.sfx('ntd-coins');
    } else {
      this.setStep({ step: 'stamp' }, 0); this.later(g, ms(0.3), () => this.sfx('ntd-stamp')); this.later(g, ms(1), () => this.sfx('ntd-coins'));
      await this.say(g, fill(pick(SAY.honest), { name: owner.name, amt: aed(comp) }), { mood: 'sigh' });
      if (Math.random() < 0.4) this.sfx('ntd-laugh');
    }
    await this.pause(g, 1.6);
  }

  // ------------------------------------------------------------ the awards night
  totals() {
    const out = {};
    for (const p of this.players) {
      const goods = p.haul.reduce((s, it) => s + BY_ID[it.id].value, 0);
      out[p.id] = { cash: p.cash, goods, bonus: 0, bonuses: [] };
    }
    // the duty-free crowns: most items of each legal kind (ties share)
    const crowns = [];
    for (const cat of LEGAL) {
      const counts = this.players.map((p) => ({ id: p.id, n: p.haul.filter((it) => BY_ID[it.id].cat === cat).length })).filter((c) => c.n > 0).sort((a, b) => b.n - a.n);
      if (!counts.length) continue;
      const top = counts[0].n; const firsts = counts.filter((c) => c.n === top);
      const rest = counts.filter((c) => c.n < top); const second = rest.length ? rest.filter((c) => c.n === rest[0].n) : [];
      for (const c of firsts) { out[c.id].bonus += BONUS.first; out[c.id].bonuses.push({ cat, place: 1, amt: BONUS.first }); }
      if (firsts.length === 1) for (const c of second) { out[c.id].bonus += BONUS.second; out[c.id].bonuses.push({ cat, place: 2, amt: BONUS.second }); }
      crowns.push({ cat, first: firsts.map((c) => c.id), second: firsts.length === 1 ? second.map((c) => c.id) : [], n: top });
    }
    // Smuggler of the Year: the most contraband through
    const sm = this.players.map((p) => ({ id: p.id, n: p.haul.filter((it) => it.smug && BY_ID[it.id].cat === 'contra').length })).filter((c) => c.n > 0).sort((a, b) => b.n - a.n);
    let smuggler = null;
    if (sm.length) { const top = sm[0].n; const tied = sm.filter((c) => c.n === top); smuggler = { ids: tied.map((c) => c.id), n: top }; for (const c of tied) { out[c.id].bonus += BONUS.smuggler; out[c.id].bonuses.push({ cat: 'contra', place: 1, amt: BONUS.smuggler }); } }
    for (const id of Object.keys(out)) out[id].total = out[id].cash + out[id].goods + out[id].bonus;
    return { out, crowns, smuggler };
  }
  async awardsNight(g) {
    this.setPhase('AWARDS', { step: 'intro' }); this.sfx('ntd-chime');
    await this.say(g, SAY.awardsIntro, { mood: 'calm' });
    // what really got through
    for (const id of this.order) {
      const p = this.P(id); if (!p) continue;
      const sm = p.haul.filter((it) => it.smug).sort((a, b) => BY_ID[b.id].value - BY_ID[a.id].value);
      this.setStep({ step: 'smuggled', who: id }, 0); this.sfx(sm.length ? 'ntd-zip' : 'ntd-thud');
      if (sm.length) {
        const names = sm.slice(0, 2).map((it) => BY_ID[it.id].name.replace(/^(A|An) /, (m) => m.toLowerCase()));
        const what = sm.length > 2 ? `${names.join(', ')} and ${sm.length - 2} more` : listText(names);
        await this.say(g, fill(pick(SAY.smuggled), { name: p.name, what }), { mood: 'sigh' });
        if (sm.some((it) => BY_ID[it.id].cat === 'contra')) this.sfx('ntd-gasp');
      } else await this.say(g, fill(SAY.cleanRecord, { name: p.name }), { mood: 'calm' });
      await this.pause(g, 1.4);
    }
    const t = this.totals(); this.awards = t;
    this.setStep({ step: 'crowns' }, 0); this.sfx('ntd-stamp');
    await this.say(g, SAY.royalty, { mood: 'calm' });
    await this.pause(g, 4);
    if (t.smuggler) {
      this.setStep({ step: 'smuggler' }, 0); this.sfx('ntd-drumroll');
      await this.say(g, fill(SAY.smuggler, { name: listText(t.smuggler.ids.map((id) => this.P(id)?.name || '')) }), { mood: 'suspicious' });
      await this.pause(g, 1.5);
    }
    this.finishGame();
    const ranked = [...this.players].sort((a, b) => t.out[b.id].total - t.out[a.id].total);
    const tied = ranked.filter((p) => t.out[p.id].total === t.out[ranked[0].id].total);
    await this.say(g, tied.length > 1 ? SAY.tie : fill(SAY.winner, { name: ranked[0].name }), { mood: 'gotcha' });
  }
  finishGame() {
    const t = this.awards || this.totals(); this.awards = t;
    const ranked = [...this.players].sort((a, b) => t.out[b.id].total - t.out[a.id].total).map((p) => p.id);
    const st = this.players.map((p) => ({ id: p.id, ...p.stats }));
    const best = (k, min = 1) => { const s = [...st].sort((a, b) => b[k] - a[k])[0]; return s && s[k] >= min ? s : null; };
    const fun = [];
    const bb = best('biggestBribe'); if (bb) fun.push({ title: 'Biggest bribe', who: bb.id, text: aed(bb.biggestBribe) });
    const ca = best('caught'); if (ca) fun.push({ title: 'Most often caught', who: ca.id, text: `${ca.caught} ${ca.caught === 1 ? 'time' : 'times'}` });
    const co = best('comp'); if (co) fun.push({ title: 'Wrongly accused', who: co.id, text: `${aed(co.comp)} in compensation` });
    const bk = best('barked'); if (bk) fun.push({ title: "Biscuit's favourite", who: bk.id, text: `barked at ${bk.barked} ${bk.barked === 1 ? 'time' : 'times'}` });
    const tk = best('bribesTaken'); if (tk) fun.push({ title: 'Most corrupt officer', who: tk.id, text: `${aed(tk.bribesTaken)} taken` });
    this.setPhase('END', { ranked, fun: fun.slice(0, 4) }); this.sfx('ntd-chime');
  }

  // ------------------------------------------------------------ packing
  // a pack is up to two bags: { items: [uid], lane: 'green'|'red', decl: category, bribe }
  checkPack(p, bags) {
    if (!Array.isArray(bags)) return { error: 'Pack your bag first' };
    bags = bags.slice(0, this.two ? 2 : 1).map((b) => ({ items: [...new Set((b?.items || []).map(String))], lane: b?.lane === 'red' ? 'red' : 'green', decl: String(b?.decl || ''), bribe: Math.max(0, Math.round(Number(b?.bribe) || 0)) }));
    const hand = new Map(p.hand.map((h) => [h.uid, h])); const used = new Set();
    for (const [i, b] of bags.entries()) {
      if (!b.items.length) { if (i === 0) return { error: 'Put at least one thing in your suitcase' }; continue; }
      for (const u of b.items) { if (!hand.has(u) || used.has(u)) return { error: 'That item is not in your hand' }; used.add(u); }
      if (b.lane === 'green') {
        if (b.items.length > GREEN_MAX) return { error: `The green lane allows ${GREEN_MAX} items at most` };
        if (!LEGAL.includes(b.decl)) return { error: 'Say what is in the bag' };
      } else {
        if (b.items.length > RED_MAX) return { error: `A bag holds ${RED_MAX} items at most` };
        if (b.items.some((u) => BY_ID[hand.get(u).id].cat === 'contra')) return { error: 'Contraband cannot go in the red lane. The X-ray sees everything.' };
        b.decl = null; b.bribe = 0;
      }
    }
    const total = bags.filter((b) => b.items.length && b.lane === 'green').reduce((s, b) => s + b.bribe, 0);
    if (total > Math.max(0, p.cash)) return { error: "You don't have that much cash for bribes" };
    return { bags: bags.filter((b) => b.items.length) };
  }
  pack(p, a) {
    if (this.phase !== 'PACK' || p.id === this.officer) return { error: 'Not now' };
    const r = this.checkPack(p, a.bags);
    if (r.error) { if (!a.done) p.draft = null; return a.done ? r : {}; }
    p.draft = r.bags;
    if (a.done) { this.finalisePack(p, false); this.sfx('ntd-zip'); this.check(); }
    this.sync(); return {};
  }
  finalisePack(p, late) {
    if (p.packed) return;
    let bags = p.draft;
    if (!bags || !bags.length) bags = this.botPack(p, late && !p.bot ? 'safe' : null);
    const hand = new Map(p.hand.map((h) => [h.uid, h]));
    for (const [slot, b] of bags.entries()) {
      const inst = {}; for (const u of b.items) inst[u] = hand.get(u);
      this.bags.push({ id: uid(), pid: p.id, slot, items: b.items, inst, lane: b.lane, decl: b.decl, bribe: b.bribe || 0 });
    }
    const used = new Set(bags.flatMap((b) => b.items));
    p.hand = p.hand.filter((h) => !used.has(h.uid));
    p.packed = true; p.draft = null;
  }
  swap(p, u) {
    if (this.phase !== 'PACK' || p.packed) return { error: 'Not now' };
    if (p.swaps <= 0) return { error: 'No swaps left this round' };
    const i = p.hand.findIndex((h) => h.uid === u); if (i < 0) return {};
    p.hand[i] = this.draw(); p.swaps--; p.draft = null; this.sync(); return { ok: true };
  }
  raise(p, amt) {
    if (this.phase !== 'DESK' || !['intro', 'talk', 'sniff', 'sniffed'].includes(this.d.step)) return {};
    const bag = this.deskBag; if (!bag || bag.pid !== p.id) return {};
    amt = Math.round(Number(amt) || 0); if (amt <= bag.bribe) return {};
    if (amt > Math.max(0, p.cash)) return { error: "You don't have that much" };
    bag.bribe = amt; this.sfx('ntd-cash');
    if (Date.now() - this.lastBribeLine > 4000) { this.lastBribeLine = Date.now(); this.sayOver(this.runId, fill(pick(SAY.bribeUp), { amt: aed(amt) })); }
    this.sync(); return {};
  }
  decide(p, what) {
    if (this.phase !== 'DESK' || p.id !== this.officer || this.choice) return {};
    if (what === 'sniff') { if (this.sniffed || this.d.step !== 'talk') return { error: 'Biscuit has already sniffed this round' }; this.sniffed = true; this.sniffNow = true; this.check(); return {}; }
    if (!['wave', 'open'].includes(what) || !['talk', 'sniffed'].includes(this.d.step)) return {};
    this.choice = what; this.check(); return {};
  }

  // ------------------------------------------------------------ bots
  // a bot packs: sometimes honest (green or red), sometimes it hides contraband under the most common legal kind
  botPack(p, mode = null) {
    const hand = p.hand.map((h) => ({ ...h, cat: BY_ID[h.id].cat, value: BY_ID[h.id].value }));
    const legal = hand.filter((h) => h.cat !== 'contra'); const contra = hand.filter((h) => h.cat === 'contra').sort((a, b) => b.value - a.value);
    const byCat = {}; for (const h of legal) (byCat[h.cat] = byCat[h.cat] || []).push(h);
    const best = Object.entries(byCat).sort((a, b) => b[1].length - a[1].length || b[1].reduce((s, x) => s + x.value, 0) - a[1].reduce((s, x) => s + x.value, 0))[0];
    const bags = [];
    const cash = Math.max(0, p.cash);
    const mk = (items, lane, decl, bribe = 0) => ({ items: items.map((h) => h.uid), lane, decl: lane === 'green' ? decl : null, bribe: lane === 'green' ? Math.min(cash, bribe) : 0 });
    const smuggle = mode !== 'safe' && contra.length && Math.random() < 0.55;
    if (smuggle) {
      const n = contra[0].value > 20000 ? 1 : Math.min(2, contra.length);
      const hide = contra.slice(0, n); const cover = best ? best[1].slice(0, GREEN_MAX - n) : [];
      const decl = best ? best[0] : pick(LEGAL);
      const val = hide.reduce((s, h) => s + h.value, 0);
      const bribe = Math.random() < 0.5 ? Math.min(3000, Math.round((val * (0.04 + Math.random() * 0.1)) / 100) * 100) : 0;
      bags.push(mk([...hide, ...cover], 'green', decl, bribe));
    } else if (best) {
      const sameKind = best[1].slice(0, GREEN_MAX);
      if (Math.random() < 0.3 && legal.length > sameKind.length) bags.push(mk(legal.slice(0, RED_MAX), 'red'));
      else bags.push(mk(sameKind, 'green', best[0], Math.random() < 0.15 ? 200 + Math.round(Math.random() * 8) * 100 : 0));
    } else bags.push(mk(contra.slice(0, 1), 'green', pick(LEGAL), 0));
    if (this.two) {
      const used = new Set(bags.flatMap((b) => b.items)); const left = legal.filter((h) => !used.has(h.uid));
      const lc = {}; for (const h of left) (lc[h.cat] = lc[h.cat] || []).push(h);
      const b2 = Object.entries(lc).sort((a, b) => b[1].length - a[1].length)[0];
      if (b2) bags.push(mk(b2[1].slice(0, GREEN_MAX), 'green', b2[0]));
    }
    return bags;
  }
  botTurn() {
    const g = this.runId; const bots = this.players.filter((p) => p.bot);
    if (!bots.length) return;
    if (this.phase === 'PACK') {
      for (const b of bots) if (b.id !== this.officer && !b.packed) this.later(g, ms(3 + Math.random() * 12), () => { if (this.phase === 'PACK' && !b.packed) { this.finalisePack(b, false); this.sfx('ntd-zip'); this.check(); this.sync(); } });
    }
    if (this.phase === 'DESK') {
      const bag = this.deskBag; if (!bag) return;
      const off = this.P(this.officer); const owner = this.P(bag.pid);
      if (owner?.bot && this.d.step === 'talk' && !bag.botRaised && Math.random() < 0.3) {
        bag.botRaised = true; const hidden = bag.items.some((u) => BY_ID[bag.inst[u].id].cat !== bag.decl);
        if (hidden && owner.cash > bag.bribe + 500) this.later(g, ms(4 + Math.random() * 6), () => this.raise(owner, bag.bribe + 500 + Math.round(Math.random() * 4) * 250));
      }
      if (off?.bot && (this.d.step === 'talk' || this.d.step === 'sniffed')) {
        this.later(g, ms((this.d.step === 'sniffed' ? 1.5 : 4) + Math.random() * 7), () => {
          if (this.phase !== 'DESK' || this.choice || this.deskBag !== bag || !['talk', 'sniffed'].includes(this.d.step)) return;
          if (!this.sniffed && this.d.step === 'talk' && Math.random() < 0.35) { this.decide(off, 'sniff'); return; }
          let p = 0.36 + (bag.items.length - 1) * 0.06;
          if (bag.sniff === 'bark') p = 0.88; else if (bag.sniff === 'quiet') p = 0.1;
          if (bag.bribe >= 1000) p *= 0.45; else if (bag.bribe > 0) p *= 0.75;
          this.decide(off, Math.random() < p ? 'open' : 'wave');
        });
      }
    }
  }

  // ------------------------------------------------------------ what players do
  act(pid, a) {
    const me = this.P(pid); if (!me) return { error: 'Not in a game' };
    this.lastActive = Date.now();
    switch (a.type) {
      case 'start': return this.start(pid);
      case 'bust': if (this.phase !== 'LOBBY') return {}; return this.setBust(pid, a.n);
      case 'again': this.playAgain(pid); return {};
      case 'menu': if (this.phase === 'END' && this.vip()?.id === pid) this.hooks.menu?.(); return {};
      case 'skip': this.skip(pid); return {};
      case 'addBot': if (this.phase === 'LOBBY' && this.vip()?.id === pid) return this.addBot(true); return {};
      case 'removeBots': if (this.phase === 'LOBBY' && this.vip()?.id === pid) this.removeBots(); return {};
      case 'kick': this.kick(pid, a.id); return {};
      case 'pack': return this.pack(me, a);
      case 'swap': return this.swap(me, String(a.uid || ''));
      case 'bribe': return this.raise(me, a.amt);
      case 'decide': return this.decide(me, String(a.what || ''));
      default: return {};
    }
  }

  // ------------------------------------------------------------ what each screen sees
  bagPub(b, reveal = false) {
    if (!b) return null;
    const o = { id: b.id, pid: b.pid, slot: b.slot, n: b.items.length, lane: b.lane, decl: b.decl, declText: b.decl ? declText(b.decl, b.items.length) : null, bribe: b.bribe, sniff: b.sniff || null, done: !!b.done, result: b.result ? { kind: b.result.kind, paid: b.result.paid || 0, fine: b.result.fine || 0, comp: b.result.comp || 0 } : null, duty: b.duty || 0 };
    if (reveal) { o.items = b.items.map((u) => this.item(b.inst[u])); if (b.result?.verdict) o.verdict = b.result.verdict; }
    return o;
  }
  view(me) {
    const ph = this.phase; const d = this.d;
    const v = {
      game: 'ntd', phase: ph, step: d.step || null, code: this.code, endsAt: this.endsAt, now: Date.now(), vipId: this.vip()?.id, test: this.test,
      players: this.players.map((p) => ({ ...this.pub(p), connected: p.connected, cash: p.cash ?? START_CASH, goods: p.haul ? p.haul.length : 0, packed: !!p.packed, bags: this.bags.filter((b) => b.pid === p.id).length })),
      round: this.round, rounds: this.rounds, officer: this.officer, two: this.two, fx: this.fx, x: {}, cats: CATS,
      rules: { greenMax: GREEN_MAX, redMax: RED_MAX, duty: DUTY, sorry: SORRY, swaps: SWAPS },
    };
    const x = v.x;
    if (ph === 'LOBBY') { x.min = MIN; x.busts = this.busts.map((n) => ({ n, by: this.players.find((p) => p.bust === n)?.id || null })); }
    if (ph === 'ROUND') x.last = !!d.last;
    if (ph === 'BELT') x.bags = this.bags.map((b) => this.bagPub(b));
    if (ph === 'RED') x.bags = (d.bags || []).map((id) => { const b = this.bags.find((y) => y.id === id); return this.bagPub(b, true); });
    if (ph === 'DESK') {
      const b = this.deskBag; const open = ['reveal', 'stamp'].includes(d.step);
      x.bag = this.bagPub(b, open); x.sniffed = this.sniffed; x.queue = this.bags.filter((y) => y.lane === 'green').map((y) => ({ id: y.id, pid: y.pid, done: !!y.done }));
      if (open) { x.fine = d.fine || 0; x.comp = d.comp || 0; }
      if (d.step === 'wave') x.paid = d.paid || 0;
    }
    if (ph === 'SCORES') x.last = !!d.last;
    if (ph === 'AWARDS' || ph === 'END') {
      x.step = ph === 'END' ? 'final' : d.step;
      if (d.who) { const p = this.P(d.who); x.who = d.who; x.smuggled = (p?.haul || []).filter((it) => it.smug).map((it) => ({ ...this.item(it) })); x.declared = (p?.haul || []).filter((it) => !it.smug).length; }
      if (this.awards) {
        const t = this.awards; x.crowns = t.crowns; x.smuggler = t.smuggler;
        if (['smuggler', 'final'].includes(x.step) || ph === 'END') x.totals = t.out;
        else x.totals = Object.fromEntries(Object.entries(t.out).map(([id, o]) => [id, { bonuses: o.bonuses }]));
      }
      if (ph === 'END') { x.ranked = d.ranked; x.fun = d.fun; x.hauls = Object.fromEntries(this.players.map((p) => [p.id, (p.haul || []).map((it) => this.item(it)).sort((a, b) => b.value - a.value).slice(0, 8)])); }
    }
    if (!me) { v.cue = this.cue; v.joinUrl = this.joinUrl; v.qr = this.qr; v.voiceOn = voice.enabled(); v.preload = this.preloadList(); }
    else {
      const officer = me.id === this.officer;
      v.me = { ...this.pub(me), vip: this.vip()?.id === me.id, cash: me.cash ?? START_CASH, officer, packed: !!me.packed, swaps: me.swaps ?? 0,
        hand: (me.hand || []).map((h) => this.item(h)), bags: this.bags.filter((b) => b.pid === me.id).map((b) => this.bagPub(b, true)),
        haul: ph === 'END' ? null : (me.haul || []).length };
      if (ph === 'DESK' && this.deskBag?.pid === me.id) v.me.atDesk = this.bagPub(this.deskBag, true);
      if (ph === 'DESK' && officer) v.me.canSniff = !this.sniffed && d.step === 'talk';
    }
    return v;
  }
  preloadList() {
    // the photos the TV will need next: what's at the desk now
    const b = this.deskBag; if (!b || this.phase !== 'DESK') return [];
    return b.items.map((u) => photos.urlFor(b.inst[u].id)).filter(Boolean);
  }
}

module.exports = { NothingToDeclare };
