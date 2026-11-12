'use strict';
// LAND GRAB: hidden roles in a backwater village. Secret Hitler's engine, with a tea shop on top.
// Villagers protect Greenwater. The Godfather's men (and his Puppet) try to sell it.
// One LandGrab per room. The game runs itself as an async script; phones and bots act through act().
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const L = require('./lg-lines');
const voice = require('./voice');

const SPEED = Number(process.env.WR_SPEED || 1);
const BOT_PACE = Number(process.env.LG_BOT_PACE || 1);
const ms = (s) => Math.max(30, Math.round(s * 1000 * SPEED));
const uid = () => crypto.randomBytes(6).toString('hex');
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const shuffle = (arr) => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const clip = (s, n) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);
const fill = (t, o) => t.replace(/\{(\w+)\}/g, (_, k) => (o[k] ?? ''));
const timeout = (p, t) => Promise.race([p, new Promise((r) => setTimeout(() => r(null), t))]);
const strip = voice.stripTags;
class Cancelled extends Error {}

const GOSSIP = () => voice.LG(); // the tea shop gossip: an English voice with an Indian accent (see voice.js)
const COLORS = ['#D9A441', '#5E8C4A', '#B5462F', '#3E7CA6', '#8C6BB1', '#C9637A', '#2F8F86', '#E07A3F', '#6E7F3A', '#9C5B8F'];
const BOT_NAMES = ['Ammu', 'Babu', 'Chinnu', 'Dasan', 'Elsy', 'Felix', 'Gracy', 'Hamza', 'Indu', 'Joji'];
const T = { roles: 45, nominate: 150, vote: 60, files: 60, veto: 25, claims: 35, power: 75, peek: 20, result: 8 };
const MIN = 5; const MAX = 10; const WIN_PROTECT = 5; const WIN_SELL = 6;
const TEAMS = { 5: [3, 1], 6: [4, 1], 7: [4, 2], 8: [5, 2], 9: [5, 3], 10: [6, 3] }; // villagers, Godfather's men (plus 1 Puppet)
// Special powers unlocked by each Sell file, by table size (as in the original game).
function powersFor(n) {
  if (n <= 6) return { 3: 'peek', 4: 'runout', 5: 'runout' };
  if (n <= 8) return { 2: 'inquiry', 3: 'urgent', 4: 'runout', 5: 'runout' };
  return { 1: 'inquiry', 2: 'inquiry', 3: 'urgent', 4: 'runout', 5: 'runout' };
}
const POWER_LABEL = { inquiry: 'Vigilance inquiry', peek: 'Peek at the tray', urgent: 'Urgent meeting', runout: 'Run out of town' };
const teamOf = (role) => (role === 'V' ? 'V' : 'G');
const ROLE_NAME = { V: 'Villager', M: "The Godfather's man", P: 'The Puppet' };

function bustPool() {
  let nums = [];
  try { nums = fs.readdirSync(path.join(__dirname, '..', 'public', 'assets', 'img')).map((f) => /^bust-(\d+)\.(png|jpe?g|webp)$/i.exec(f)).filter(Boolean).map((m) => Number(m[1])); } catch (e) { nums = []; }
  return nums.length >= 4 ? [...new Set(nums)].sort((a, b) => a - b) : [...Array(16).keys()].map((i) => i + 1);
}

class LandGrab {
  constructor(code, hooks, opts = {}) {
    this.kind = 'lg'; this.code = code; this.hooks = hooks; this.test = !!opts.test;
    this.players = []; this.phase = 'LOBBY'; this.d = {}; this.endsAt = null; this.cue = null;
    this.runId = 0; this.waiter = null; this.lastActive = Date.now(); this.syncPending = false;
    this.fx = []; this.fxSeq = 0; this.timers = []; this.busts = bustPool(); this.taught = false;
    this.newBoard();
    for (const t of Object.values(L.SAY)) if (typeof t === 'string' && !t.includes('{')) this.prefetch(t);
  }
  newBoard() {
    Object.assign(this, { protect: 0, sell: 0, tracker: 0, deck: [], bin: [], reg: [], cur: null, rot: -1, special: null, lastPres: null, lastSec: null,
      vetoOn: false, winner: null, rumourQ: [], rumour: null, hand: null, passed: null, signed: null, usedTitles: new Set(), powers: {}, tipsOn: false, tipsDone: new Set() });
  }

  // ------------------------------------------------------------ plumbing (same pattern as Writers' Room)
  P(id) { return this.players.find((p) => p.id === id); }
  live() { return this.players.filter((p) => p.connected); }
  alive() { return this.players.filter((p) => p.alive); }
  humans() { return this.players.filter((p) => !p.bot); }
  vip() { return this.humans().find((p) => p.connected) || this.players[0]; }
  pub(p) { return p ? { id: p.id, name: p.name, color: p.color, bust: p.bust } : null; }
  sync() {
    if (this.syncPending) return; this.syncPending = true;
    setTimeout(() => {
      this.syncPending = false;
      try { this.hooks.toHost(this.view(null)); for (const p of this.players) if (p.connected && !p.bot) this.hooks.toPlayer(p.id, this.view(p)); } catch (e) { console.error('lg sync', e); }
    }, 40);
  }
  setPhase(phase, d = {}, seconds = null) { this.phase = phase; this.d = d; this.endsAt = seconds ? Date.now() + ms(seconds) : null; this.lastActive = Date.now(); this.sync(); this.botTurn(); }
  sfx(name) { this.fxSeq++; this.fx.push({ id: this.fxSeq, name }); if (this.fx.length > 14) this.fx.shift(); this.sync(); }
  guard(g) { if (g !== this.runId) throw new Cancelled(); }
  later(g, t, fn) { const h = setTimeout(() => { if (g === this.runId) fn(); }, t); this.timers.push(h); return h; }
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
  skip(byId) { if (byId && byId !== this.vip()?.id) return; if (this.phase === 'LOBBY' || this.phase === 'END') return; this.cue = null; this.wake('skip'); }
  left() { return Math.max(30, (this.endsAt || Date.now()) - Date.now()); }

  // ------------------------------------------------------------ the gossip's voice
  prefetch(text, urgent) { return voice.get(text, GOSSIP(), urgent); }
  estimate(text) { return Math.min(30000, 900 + strip(text).length * 62); }
  async makeCue(text, opts = {}) {
    let audioId = null;
    if (voice.enabled()) audioId = await timeout(this.prefetch(text, opts.urgent), opts.maxWait || 6000);
    return { id: uid(), text: strip(text), speak: strip(text), audio: audioId ? `/audio/${audioId}` : null, kind: 'host', who: null };
  }
  async say(g, text, opts = {}) {
    if (!strip(text)) return 'empty';
    const cue = await this.makeCue(text, opts); this.guard(g);
    this.cue = cue; this.cueDone = null; this.sync();
    const est = this.estimate(text);
    const r = await this.wait(cue.audio ? est * 1.8 + 5000 : est + 1200, () => this.cueDone === cue.id);
    this.guard(g);
    if (this.cue === cue) { this.cue = null; this.sync(); }
    return r;
  }
  async sayOver(g, text, opts = {}) { if (!strip(text)) return; const cue = await this.makeCue(text, { maxWait: 2500, ...opts }); if (g !== this.runId) return; this.cue = cue; this.sync(); }
  cueFinished(id) { this.cueDone = id; if (this.cue && this.cue.id === id) this.cue = null; this.check(); }
  pause(g, s) { return this.wait(ms(s)).then(() => this.guard(g)); }

  // ------------------------------------------------------------ lobby
  join(name, token) {
    this.lastActive = Date.now();
    if (token) { const p = this.players.find((x) => x.token === token); if (p) return { player: p }; }
    name = clip(name, 14);
    if (!name) return { error: 'Enter your name' };
    const same = this.players.find((x) => x.name.toLowerCase() === name.toLowerCase());
    if (same && !same.bot) { if (!same.connected) { same.token = uid(); return { player: same }; } return { error: 'That name is taken' }; }
    if (same) return { error: 'That name is taken' };
    if (this.phase !== 'LOBBY') return { error: 'This game has already started. Wait for the next one.' };
    if (this.players.length >= MAX) return { error: `The village is full (${MAX} players)` };
    const p = this.newPlayer(name, false); this.players.push(p); this.sync();
    return { player: p };
  }
  newPlayer(name, bot) {
    const used = new Set(this.players.map((x) => x.color));
    return { id: uid(), token: uid(), name, color: COLORS.find((c) => !used.has(c)) || pick(COLORS), connected: true, bot, bust: null, alive: true, role: null, ready: false, notes: [], noteSeq: 0 };
  }
  addBot() {
    if (!this.test || this.phase !== 'LOBBY' || this.players.length >= MAX) return { error: 'No room for more bots' };
    const name = BOT_NAMES.find((n) => !this.players.some((p) => p.name === n)) || `Bot ${this.players.length + 1}`;
    const p = this.newPlayer(name, true);
    const free = this.busts.filter((b) => !this.players.some((x) => x.bust === b)); p.bust = free.length ? pick(free) : pick(this.busts);
    this.players.push(p); this.sync(); return { ok: true };
  }
  removeBots() { if (this.phase !== 'LOBBY') return; this.players = this.players.filter((p) => !p.bot); this.sync(); }
  setConnected(id, on) { const p = this.P(id); if (p) { p.connected = on; this.lastActive = Date.now(); this.check(); this.sync(); } }
  setBust(id, n) {
    const p = this.P(id); n = Number(n);
    if (!p || !this.busts.includes(n) || this.players.some((x) => x !== p && x.bust === n)) return { error: 'Someone already picked that one' };
    p.bust = n; this.sync(); return { ok: true };
  }
  kick(byId, target) { if (this.phase !== 'LOBBY' || this.vip()?.id !== byId) return; this.players = this.players.filter((p) => p.id !== target); this.hooks.kicked?.(target); this.sync(); }
  note(p, text, kind = 'info') { if (!p || p.bot) return; p.noteSeq++; p.notes.push({ id: p.noteSeq, text, kind }); if (p.notes.length > 4) p.notes.shift(); }

  start(byId) {
    if (byId && this.vip()?.id !== byId) return { error: 'Only the first player can start' };
    if (this.phase !== 'LOBBY') return {};
    this.players = this.players.filter((p) => p.connected);
    const n = this.players.length;
    if (n < MIN) return { error: `Land Grab needs at least ${MIN} players${this.test ? '. Add some bots on the TV.' : ''}` };
    if (n > MAX) return { error: `Land Grab takes at most ${MAX} players` };
    const free = shuffle(this.busts.filter((b) => !this.players.some((p) => p.bust === b)));
    this.players.forEach((p) => { if (!p.bust) p.bust = free.shift() || pick(this.busts); });
    this.newBoard();
    const [v, m] = TEAMS[n];
    const roles = shuffle([...Array(v).fill('V'), ...Array(m).fill('M'), 'P']);
    this.players.forEach((p, i) => Object.assign(p, { role: roles[i], alive: true, ready: false, tip: null, seen: [], rumoured: -1 }));
    this.powers = powersFor(n); this.n = n;
    this.deck = shuffle([...Array(6).fill('P'), ...Array(11).fill('S')]);
    // the tip-off: one villager learns one other name that is definitely a villager
    const vs = shuffle(this.players.filter((p) => p.role === 'V'));
    if (vs.length >= 2) vs[0].tip = vs[1].id;
    this.rot = Math.floor(Math.random() * n) - 1;
    const g = ++this.runId;
    this.run(g).catch((e) => { if (!(e instanceof Cancelled)) { console.error('lg run error', e); this.winner = this.winner || { team: 'V', reason: 'error' }; this.setPhase('END', { step: 'reveal' }); } });
    return {};
  }
  playAgain(byId) {
    if (this.phase !== 'END' || this.vip()?.id !== byId) return;
    this.runId++; this.clearTimers(); this.players = this.players.filter((p) => p.connected);
    this.players.forEach((p) => Object.assign(p, { role: null, alive: true, ready: false, tip: null }));
    this.cue = null; this.newBoard(); this.setPhase('LOBBY', {});
  }

  // ------------------------------------------------------------ the game
  async run(g) {
    this.setPhase('INTRO', { step: 'welcome' }); this.sfx('whoosh');
    await this.say(g, L.SAY.welcome);
    if (!this.taught) { await this.tutorial(g); this.taught = true; this.tipsOn = true; }
    else { this.setPhase('INTRO', { step: 'how' }); await this.say(g, L.SAY.how); }
    this.setPhase('ROLES', {}, T.roles);
    this.sayOver(g, L.SAY.roles);
    await this.wait(ms(T.roles), () => this.players.every((p) => p.ready || !p.connected)); this.guard(g);
    let first = true;
    while (!this.winner) { await this.round(g, first); first = false; }
    await this.ending(g);
  }

  async tutorial(g) {
    this.skipTut = false;
    for (let i = 0; i < L.TUTORIAL.length && !this.skipTut; i++) {
      this.setPhase('TUTORIAL', { step: i }); this.sfx('whoosh');
      await this.say(g, L.TUTORIAL[i].line);
      if (!this.skipTut) await this.pause(g, 0.6);
    }
  }
  async tip(g, key) { if (!this.tipsOn || this.tipsDone.has(key)) return; this.tipsDone.add(key); await this.say(g, L.TIPS[key]); }

  nextPresident() {
    if (this.special) { const p = this.P(this.special); this.special = null; if (p?.alive) return p; }
    const n = this.players.length;
    for (let k = 0; k < n; k++) { this.rot = (this.rot + 1) % n; if (this.players[this.rot].alive) return this.players[this.rot]; }
    return this.alive()[0];
  }
  eligible(presId) {
    const many = this.alive().length > 5;
    return this.alive().filter((p) => p.id !== presId && p.id !== this.lastSec && !(many && p.id === this.lastPres));
  }
  draw(k) {
    if (this.deck.length < k) { this.deck = shuffle([...this.deck, ...this.bin]); this.bin = []; }
    return this.deck.splice(0, k);
  }

  async round(g, first) {
    const pres = this.nextPresident();
    const r = { n: this.reg.length + 1, pres: pres.id, sec: null, nom: null, votes: null, passed: null, file: null, claims: {}, shutdown: false, vetoed: false, power: null };
    this.cur = r; this.hand = null; this.passed = null; this.signed = null; this.vetoAsk = false; this.vetoDenied = false;

    // 1. the President picks a Secretary while the room argues (and the tea shop gossips)
    this.setPhase('NOMINATE', {}, T.nominate);
    if (first) await this.say(g, L.SAY.first);
    await this.say(g, fill(pick(L.SAY.nominate), { pres: pres.name }));
    if (this.lastSec) await this.tip(g, 'limited');
    while (!r.nom) {
      const res = await this.wait(this.left(), () => !!r.nom || this.rumourQ.length > 0); this.guard(g);
      if (r.nom) break;
      if (this.rumourQ.length) { const rm = this.rumourQ.shift(); this.rumour = rm; this.sync(); await this.say(g, fill(pick(L.SAY.rumour), { text: rm.text })); continue; }
      if (res === 'time' || res === 'skip' || Date.now() >= (this.endsAt || 0)) { r.nom = pick(this.eligible(pres.id)).id; this.note(pres, 'Time ran out, so a Secretary was picked for you.'); }
    }
    const sec = this.P(r.nom); r.sec = sec.id; this.reg.push(r);

    // 2. everyone votes on the pair
    const votes = {};
    this.setPhase('VOTE', { step: 'vote', votes }, T.vote); this.sfx('drumroll');
    this.sayOver(g, fill(L.SAY.voteNow, { pres: pres.name, sec: sec.name }) + (this.tipsOn && !this.tipsDone.has('vote') ? ` ${L.TIPS.vote}` : '')); this.tipsDone.add('vote');
    await this.wait(ms(T.vote), () => this.alive().every((p) => p.id in votes)); this.guard(g);
    const yes = Object.values(votes).filter(Boolean).length; const no = this.alive().length - yes;
    r.votes = Object.fromEntries(this.alive().map((p) => [p.id, p.id in votes ? votes[p.id] : null]));
    r.passed = yes > no;
    this.setPhase('VOTE', { step: 'result', votes }); this.sfx(r.passed ? 'gavel' : 'lg-murmur');
    await this.pause(g, 2.5);
    if (!r.passed) {
      this.tracker++;
      if (this.tracker >= 3) return this.shutdown(g, r);
      await this.say(g, this.tracker === 2 ? L.SAY.voteFail2 : pick(L.SAY.voteFail));
      await this.tip(g, 'fail');
      return;
    }
    this.tracker = 0; this.lastPres = pres.id; this.lastSec = sec.id;
    if (this.sell >= 3) {
      if (sec.role === 'P') { this.winner = { team: 'G', reason: 'puppetElected', name: sec.name, id: sec.id }; return; }
      await this.say(g, fill(L.SAY.notPuppet, { sec: sec.name }));
    } else await this.say(g, fill(L.SAY.votePass, { pres: pres.name, sec: sec.name }));

    // 3. the files: the President bins one, the Secretary signs one
    this.hand = this.draw(3); r.drew = [...this.hand];
    this.setPhase('FILES', { step: 'pres' }, T.files); this.sfx('lg-paper');
    this.sayOver(g, fill(L.SAY.filesPres, { pres: pres.name }) + (this.tipsOn && !this.tipsDone.has('files') ? ` ${L.TIPS.files}` : '')); this.tipsDone.add('files');
    await this.wait(ms(T.files), () => !!this.passed); this.guard(g);
    if (!this.passed) { const i = Math.floor(Math.random() * 3); this.bin.push(this.hand[i]); this.passed = this.hand.filter((_, j) => j !== i); this.note(pres, 'Time ran out, so a file was binned for you.'); }
    r.passed2 = [...this.passed];
    this.setPhase('FILES', { step: 'sec' }, T.files); this.sfx('lg-paper');
    this.sayOver(g, fill(L.SAY.filesSec, { sec: sec.name }));
    await this.wait(ms(T.files), () => !!this.signed || this.vetoAsk); this.guard(g);
    if (this.vetoAsk && !this.signed) {
      this.setPhase('FILES', { step: 'veto' }, T.veto);
      this.sayOver(g, fill(L.SAY.vetoAsk, { pres: pres.name, sec: sec.name }));
      await this.wait(ms(T.veto), () => this.vetoAnswer !== undefined); this.guard(g);
      if (this.vetoAnswer === true) {
        this.bin.push(...this.passed); r.vetoed = true; this.sfx('lg-shutter');
        await this.say(g, L.SAY.vetoYes);
        this.tracker++;
        if (this.tracker >= 3) return this.shutdown(g, r, true);
        return;
      }
      this.vetoDenied = true; this.setPhase('FILES', { step: 'sec', denied: true }, T.files);
      this.sayOver(g, fill(L.SAY.vetoNo, { sec: sec.name }));
      await this.wait(ms(T.files), () => !!this.signed); this.guard(g);
    }
    if (!this.signed) { const i = Math.floor(Math.random() * 2); this.signed = this.passed[i]; this.bin.push(this.passed[1 - i]); this.note(sec, 'Time ran out, so a file was signed for you.'); }
    await this.enact(g, this.signed, r);
    if (this.winner) return;

    // 4. claims: what did each of them see?
    this.setPhase('CLAIMS', {}, T.claims);
    this.sayOver(g, L.SAY.claims);
    await this.wait(ms(T.claims), () => r.claims.pres !== undefined && r.claims.sec !== undefined); this.guard(g);
    if (r.claims.pres === undefined) r.claims.pres = null;
    if (r.claims.sec === undefined) r.claims.sec = null;
    this.setPhase('CLAIMS', { step: 'show' }); this.sync();
    const pc = r.claims.pres; const sc = r.claims.sec;
    r.clash = pc !== null && sc !== null && (sc < Math.max(0, pc - 1) || sc > Math.min(2, pc));
    if (r.clash) { this.sfx('lg-murmur'); await this.say(g, L.SAY.clash); } else await this.pause(g, 4);
    await this.tip(g, 'claims');

    // 5. a special power for the President, if this Sell file unlocked one
    if (r.file.type === 'S') {
      const kind = this.powers[this.sell];
      if (kind) await this.power(g, kind, pres, r);
      if (this.sell === 5 && !this.vetoOn && !this.winner) { this.vetoOn = true; await this.say(g, L.SAY.vetoUnlocked); }
    }
  }

  async enact(g, type, r, viaShutdown = false) {
    const list = type === 'P' ? L.PROTECT_FILES : L.SELL_FILES;
    const title = pick(list.filter((t) => !this.usedTitles.has(t))) || pick(list); this.usedTitles.add(title);
    const headline = pick(type === 'P' ? L.HEAD_PROTECT : L.HEAD_SELL);
    r.file = { type, title, headline };
    if (type === 'P') this.protect++; else this.sell++;
    this.setPhase('SIGNED', { type, title, headline, shutdown: viaShutdown }); this.sfx('lg-stamp');
    if (type === 'S') setTimeout(() => this.sfx('lg-cash'), 900);
    await this.say(g, fill(pick(type === 'P' ? L.SAY.protect : L.SAY.sell), { title }));
    await this.pause(g, 2.5);
    if (this.protect >= WIN_PROTECT) this.winner = { team: 'V', reason: 'protect' };
    else if (this.sell >= WIN_SELL) this.winner = { team: 'G', reason: 'sell' };
    else if (type === 'S' && this.sell === 3) { this.tipsDone.delete('three'); const on = this.tipsOn; this.tipsOn = true; await this.tip(g, 'three'); this.tipsOn = on; }
  }

  async shutdown(g, r, afterVeto = false) {
    this.tracker = 0; this.lastPres = null; this.lastSec = null; r.shutdown = true;
    this.setPhase('SHUTDOWN', {}); this.sfx('lg-shutter');
    await this.say(g, L.SAY.shutdown);
    const [top] = this.draw(1);
    await this.enact(g, top, r, true);
    void afterVeto;
  }

  async power(g, kind, pres, r) {
    const others = this.alive().filter((p) => p.id !== pres.id);
    r.power = { kind, target: null };
    if (kind === 'peek') {
      if (this.deck.length < 3) { this.deck = shuffle([...this.deck, ...this.bin]); this.bin = []; }
      this.setPhase('POWER', { kind, step: 'choose', top: this.deck.slice(0, 3) }, T.peek); this.sfx('dundun');
      this.sayOver(g, fill(L.SAY.peek, { pres: pres.name }));
      await this.wait(ms(T.peek), () => !!this.d.done); this.guard(g);
      return;
    }
    const targets = kind === 'inquiry' ? others.filter((p) => !(pres.seen || []).some((s) => s.id === p.id)) : others;
    if (!targets.length) return;
    this.setPhase('POWER', { kind, step: 'choose', targets: targets.map((p) => p.id) }, T.power); this.sfx('dundun');
    await this.say(g, fill(L.SAY[kind], { pres: pres.name }));
    await this.wait(this.left(), () => !!this.d.target); this.guard(g);
    const target = this.P(this.d.target) || pick(targets);
    r.power.target = target.id;
    if (kind === 'inquiry') {
      pres.seen = [...(pres.seen || []), { id: target.id, team: teamOf(target.role) }];
      this.setPhase('POWER', { kind, step: 'result', target: target.id });
      await this.say(g, fill(L.SAY.inquiryDone, { pres: pres.name, target: target.name }));
      await this.pause(g, 3);
    } else if (kind === 'urgent') {
      this.special = target.id;
      this.setPhase('POWER', { kind, step: 'result', target: target.id });
      await this.say(g, fill(L.SAY.urgentDone, { target: target.name }));
    } else if (kind === 'runout') {
      target.alive = false;
      this.setPhase('POWER', { kind, step: 'result', target: target.id }); this.sfx('lg-bus');
      await this.say(g, fill(L.SAY.runoutDone, { target: target.name }));
      if (target.role === 'P') { this.winner = { team: 'V', reason: 'puppetGone', name: target.name, id: target.id }; return; }
      await this.say(g, fill(L.SAY.notPuppetGone, { target: target.name }));
    }
  }

  async ending(g) {
    const w = this.winner;
    this.setPhase('END', { step: 'win' }); this.sfx(w.team === 'V' ? 'applause' : 'dundun');
    const line = w.reason === 'puppetElected' ? fill(L.SAY.winPuppetElected, { name: w.name }) : w.reason === 'puppetGone' ? fill(L.SAY.winPuppetGone, { name: w.name }) : w.team === 'V' ? L.SAY.winVillage : L.SAY.winGodfather;
    await this.say(g, line);
    this.setPhase('END', { step: 'reveal' });
    await this.say(g, L.SAY.reveal);
    await this.pause(g, 4);
    await this.say(g, L.SAY.goodnight);
  }

  // ------------------------------------------------------------ what players do
  act(pid, a) {
    const me = this.P(pid); if (!me) return { error: 'Not in a game' };
    this.lastActive = Date.now();
    const r = this.cur; const isPres = r && r.pres === pid; const isSec = r && r.sec === pid;
    switch (a.type) {
      case 'start': return this.start(pid);
      case 'again': this.playAgain(pid); return {};
      case 'menu': if (this.phase === 'END' && this.vip()?.id === pid) this.hooks.menu?.(); return {};
      case 'skip': this.skip(pid); return {};
      case 'kick': this.kick(pid, a.id); return {};
      case 'bust': if (this.phase !== 'LOBBY') return {}; return this.setBust(pid, a.n);
      case 'skipTutorial': if (this.phase === 'TUTORIAL' && this.vip()?.id === pid) { this.skipTut = true; this.cue = null; this.wake('skip'); } return {};
      case 'ready': if (this.phase === 'ROLES') { me.ready = true; this.check(); this.sync(); } return {};
      case 'nominate': {
        if (this.phase !== 'NOMINATE' || !isPres || r.nom) return {};
        if (!this.eligible(pid).some((p) => p.id === a.id)) return { error: "They can't be Secretary this round" };
        r.nom = a.id; this.check(); this.sync(); return { ok: true };
      }
      case 'vote': {
        if (this.phase !== 'VOTE' || this.d.step !== 'vote' || !me.alive) return {};
        this.d.votes[pid] = !!a.yes; this.check(); this.sync(); return { ok: true };
      }
      case 'discard': {
        if (this.phase !== 'FILES' || this.d.step !== 'pres' || !isPres || this.passed) return {};
        const i = Number(a.i); if (!(i >= 0 && i < 3)) return {};
        this.bin.push(this.hand[i]); this.passed = this.hand.filter((_, j) => j !== i); this.sfx('lg-paper'); this.check(); this.sync(); return { ok: true };
      }
      case 'sign': {
        if (this.phase !== 'FILES' || this.d.step !== 'sec' || !isSec || this.signed || this.vetoAsk && !this.vetoDenied) return {};
        const i = Number(a.i); if (!(i >= 0 && i < 2)) return {};
        this.signed = this.passed[i]; this.bin.push(this.passed[1 - i]); this.check(); this.sync(); return { ok: true };
      }
      case 'veto': {
        if (this.phase !== 'FILES' || this.d.step !== 'sec' || !isSec || !this.vetoOn || this.vetoDenied || this.signed || this.vetoAsk) return {};
        this.vetoAsk = true; this.vetoAnswer = undefined; this.check(); this.sync(); return { ok: true };
      }
      case 'vetoAnswer': {
        if (this.phase !== 'FILES' || this.d.step !== 'veto' || !isPres || this.vetoAnswer !== undefined) return {};
        this.vetoAnswer = !!a.yes; this.check(); this.sync(); return { ok: true };
      }
      case 'claim': {
        if (this.phase !== 'CLAIMS' || this.d.step === 'show' || !(isPres || isSec)) return {};
        const v = a.v === null ? null : Number(a.v); const max = isPres ? 3 : 2;
        if (v !== null && !(v >= 0 && v <= max)) return {};
        if (isPres && r.claims.pres === undefined) r.claims.pres = v;
        if (isSec && r.claims.sec === undefined) r.claims.sec = v;
        this.check(); this.sync(); return { ok: true };
      }
      case 'power': {
        if (this.phase !== 'POWER' || this.d.step !== 'choose' || !isPres) return {};
        if (this.d.kind === 'peek') { this.d.done = true; this.check(); this.sync(); return {}; }
        if (this.d.target || !(this.d.targets || []).includes(a.id)) return {};
        this.d.target = a.id; this.check(); this.sync(); return { ok: true };
      }
      case 'rumour': {
        if (['LOBBY', 'INTRO', 'END'].includes(this.phase)) return { error: 'Not now' };
        const round = this.reg.length;
        if (me.rumoured === round) return { error: 'One rumour per round. Save it for the next one.' };
        const text = clip(a.text, 90); if (text.length < 3) return { error: 'Write a rumour first' };
        me.rumoured = round; this.rumourQ.push({ id: uid(), text, at: Date.now() }); if (this.rumourQ.length > 6) this.rumourQ.shift();
        this.check(); this.sync(); return { ok: true };
      }
      default: return {};
    }
  }

  // ------------------------------------------------------------ bots (test mode): simple, believable choices
  suspicion(id) { return this.reg.reduce((s, r) => s + ((r.file && !r.shutdown && (r.pres === id || r.sec === id)) ? (r.file.type === 'S' ? 1 : -0.5) : 0), 0); }
  botTurn() {
    const bots = this.players.filter((p) => p.bot && p.alive); if (!bots.length) return;
    const g = this.runId; const key = `${this.phase}|${this.d.step || ''}|${this.reg.length}`;
    const go = (p, fn, base = 1.5) => this.later(g, Math.round((base + Math.random() * 2.5) * 1000 * BOT_PACE * Math.min(1, SPEED * 4)), () => { if (`${this.phase}|${this.d.step || ''}|${this.reg.length}` === key) fn(); });
    const r = this.cur; const ph = this.phase; const step = this.d.step;
    for (const b of bots) {
      const team = teamOf(b.role); const pres = r && r.pres === b.id; const sec = r && r.sec === b.id;
      if (ph === 'ROLES') go(b, () => this.act(b.id, { type: 'ready' }), 0.5);
      if (ph === 'NOMINATE' && pres) go(b, () => this.act(b.id, { type: 'nominate', id: this.botNominee(b) }), 3);
      if (ph === 'NOMINATE' && Math.random() < 0.3) go(b, () => this.act(b.id, { type: 'rumour', text: this.botRumour(b) }), 1);
      if (ph === 'VOTE' && step === 'vote') go(b, () => this.act(b.id, { type: 'vote', yes: this.botVote(b) }));
      if (ph === 'FILES' && step === 'pres' && pres) go(b, () => this.act(b.id, { type: 'discard', i: this.botDiscard(b) }), 2);
      if (ph === 'FILES' && step === 'sec' && sec) go(b, () => { const c = this.botSign(b); this.act(b.id, c === 'veto' ? { type: 'veto' } : { type: 'sign', i: c }); }, 2);
      if (ph === 'FILES' && step === 'veto' && pres) go(b, () => this.act(b.id, { type: 'vetoAnswer', yes: team === 'V' && this.passed.every((f) => f === 'S') }));
      if (ph === 'CLAIMS' && step !== 'show' && (pres || sec)) go(b, () => this.act(b.id, { type: 'claim', v: this.botClaim(b, pres) }));
      if (ph === 'POWER' && step === 'choose' && pres) go(b, () => this.act(b.id, { type: 'power', id: this.botTarget(b) }), 2.5);
    }
  }
  botNominee(b) {
    const el = this.eligible(b.id); if (!el.length) return null;
    if (teamOf(b.role) === 'G') {
      const puppet = el.find((p) => p.role === 'P');
      if (puppet && this.sell >= 3 && Math.random() < 0.85) return puppet.id;
      const mates = el.filter((p) => teamOf(p.role) === 'G');
      if (mates.length && Math.random() < 0.6) return pick(mates).id;
      return pick(el).id;
    }
    const known = (b.seen || []).filter((s) => s.team === 'V').map((s) => s.id).concat(b.tip ? [b.tip] : []);
    const trusted = el.filter((p) => known.includes(p.id));
    if (trusted.length) return pick(trusted).id;
    return [...el].sort((x, y) => this.suspicion(x.id) - this.suspicion(y.id) + (Math.random() - 0.5))[0].id;
  }
  botVote(b) {
    const r = this.cur; const pres = this.P(r.pres); const sec = this.P(r.sec);
    if (teamOf(b.role) === 'G') {
      if (this.sell >= 3 && sec.role === 'P') return true;
      if (teamOf(pres.role) === 'G' || teamOf(sec.role) === 'G') return Math.random() < 0.85;
      return Math.random() < 0.45;
    }
    const known = (b.seen || []); const bad = known.filter((s) => s.team === 'G').map((s) => s.id);
    if (bad.includes(pres.id) || bad.includes(sec.id)) return false;
    if (this.tracker === 2) return Math.random() < 0.8;
    const s = this.suspicion(pres.id) + this.suspicion(sec.id);
    return Math.random() < (s <= 0.5 ? 0.78 : s <= 1.5 ? 0.5 : 0.25);
  }
  botDiscard(b) {
    const h = this.hand; const want = teamOf(b.role) === 'V' ? 'S' : (Math.random() < 0.85 ? 'P' : 'S');
    const i = h.indexOf(want); return i >= 0 ? i : Math.floor(Math.random() * 3);
  }
  botSign(b) {
    const h = this.passed; const team = teamOf(b.role);
    if (team === 'V' && this.vetoOn && !this.vetoDenied && h.every((f) => f === 'S')) return 'veto';
    const want = team === 'V' ? 'P' : (Math.random() < 0.85 ? 'S' : 'P');
    const i = h.indexOf(want); return i >= 0 ? i : 0;
  }
  botClaim(b, asPres) {
    const r = this.cur; const truth = asPres ? r.drew.filter((f) => f === 'P').length : r.passed2.filter((f) => f === 'P').length;
    if (teamOf(b.role) === 'G' && r.file?.type === 'S' && Math.random() < 0.7) return 0; // "it was all Sell, I had no choice"
    if (Math.random() < 0.1) return null;
    return truth;
  }
  botTarget(b) {
    const ts = (this.d.targets || []).map((id) => this.P(id)).filter(Boolean); if (!ts.length) return null;
    if (teamOf(b.role) === 'G') { const vs = ts.filter((p) => p.role === 'V'); return pick(vs.length ? vs : ts).id; }
    if (this.d.kind === 'urgent') { const ok = ts.filter((p) => (b.seen || []).some((s) => s.id === p.id && s.team === 'V') || p.id === b.tip); if (ok.length) return pick(ok).id; }
    const bad = ts.filter((p) => (b.seen || []).some((s) => s.id === p.id && s.team === 'G'));
    if (this.d.kind === 'runout' && bad.length) return pick(bad).id;
    return [...ts].sort((x, y) => this.suspicion(y.id) - this.suspicion(x.id) + (Math.random() - 0.5))[0].id;
  }
  botRumour(b) {
    const others = this.alive().filter((p) => p.id !== b.id);
    const a = pick(others); const c = pick(others.filter((p) => p !== a)) || a;
    return fill(pick(L.BOT_RUMOURS), { a: a.name, b: c.name });
  }

  // ------------------------------------------------------------ what each screen sees
  regPub(r) {
    return {
      n: r.n, pres: r.pres, sec: r.sec, passed: r.passed, votes: r.votes, shutdown: r.shutdown, vetoed: r.vetoed, clash: !!r.clash,
      file: r.file ? { type: r.file.type, title: r.file.title } : null,
      claims: { pres: r.claims.pres === undefined ? undefined : r.claims.pres, sec: r.claims.sec === undefined ? undefined : r.claims.sec },
      power: r.power ? { kind: r.power.kind, label: POWER_LABEL[r.power.kind], target: r.power.target } : null,
    };
  }
  view(me) {
    const ph = this.phase; const d = this.d; const r = this.cur; const started = !['LOBBY'].includes(ph);
    const nAlive = this.alive().length;
    const v = {
      game: 'lg', phase: ph, step: d.step || null, code: this.code, endsAt: this.endsAt, now: Date.now(), vipId: this.vip()?.id, test: this.test,
      players: this.players.map((p) => ({ ...this.pub(p), connected: p.connected, bot: p.bot, alive: p.alive,
        pres: !!(r && r.pres === p.id && started), sec: !!(r && r.sec === p.id && ['VOTE', 'FILES', 'SIGNED', 'CLAIMS', 'POWER'].includes(ph)),
        limited: started && (p.id === this.lastSec || (nAlive > 5 && p.id === this.lastPres)), ready: !!p.ready })),
      board: { protect: this.protect, sell: this.sell, tracker: this.tracker, deck: this.deck.length, powers: this.powers, veto: this.vetoOn, n: this.n || this.players.length, winProtect: WIN_PROTECT, winSell: WIN_SELL },
      reg: this.reg.map((x) => this.regPub(x)), rumour: this.rumour, fx: this.fx, x: {},
    };
    const x = v.x;
    if (!me) { v.cue = this.cue; v.joinUrl = this.joinUrl; v.qr = this.qr; v.voiceOn = voice.enabled(); }
    else {
      const team = me.role ? teamOf(me.role) : null;
      const know = !me.role ? [] : me.role === 'M' || (me.role === 'P' && this.n <= 6) ? this.players.filter((p) => p !== me && teamOf(p.role) === 'G').map((p) => ({ ...this.pub(p), role: p.role, roleName: ROLE_NAME[p.role] })) : [];
      v.me = { ...this.pub(me), vip: this.vip()?.id === me.id, alive: me.alive, role: me.role, roleName: ROLE_NAME[me.role] || null, team, know,
        tip: me.tip ? this.pub(this.P(me.tip)) : null, seen: (me.seen || []).map((s) => ({ ...this.pub(this.P(s.id)), team: s.team })),
        rumoured: me.rumoured === this.reg.length, notes: me.notes, pres: !!(r && r.pres === me.id), sec: !!(r && r.sec === me.id), ready: !!me.ready };
    }
    if (ph === 'LOBBY') x.busts = this.busts.map((n) => ({ n, by: this.players.find((p) => p.bust === n)?.id || null }));
    if (ph === 'TUTORIAL') { x.slide = d.step; x.slides = L.TUTORIAL.length; x.title = L.TUTORIAL[d.step]?.title; x.key = L.TUTORIAL[d.step]?.key; x.n = this.players.length; x.counts = TEAMS[Math.min(MAX, Math.max(MIN, this.players.length))]; x.powers = this.powers; }
    if (ph === 'ROLES') x.ready = this.players.filter((p) => p.ready).length;
    if (r) { x.pres = this.pub(this.P(r.pres)); x.sec = this.pub(this.P(r.sec || r.nom)); }
    if (ph === 'NOMINATE' && me && v.me.pres) x.eligible = this.eligible(me.id).map((p) => p.id);
    if (ph === 'VOTE') {
      x.voted = Object.keys(d.votes || {}).length; x.voters = nAlive;
      if (d.step === 'result') { x.votes = r.votes; x.passed = r.passed; }
      if (me) x.myVote = d.votes && me.id in d.votes ? d.votes[me.id] : null;
    }
    if (ph === 'FILES') {
      x.vetoOn = this.vetoOn; x.denied = !!this.vetoDenied;
      if (me && v.me.pres && d.step === 'pres') x.hand = this.passed ? null : this.hand;
      if (me && v.me.pres && d.step === 'veto') x.passed = this.passed;
      if (me && v.me.sec && d.step === 'sec') x.passed = this.signed ? null : this.passed;
      x.binned = !!this.passed; x.asked = !!this.vetoAsk;
    }
    if (ph === 'SIGNED') { x.type = d.type; x.title = d.title; x.headline = d.headline; x.shutdown = !!d.shutdown; }
    if (ph === 'CLAIMS') {
      x.show = d.step === 'show';
      x.claims = { pres: r.claims.pres, sec: r.claims.sec };
      if (me) x.needClaim = v.me.pres && r.claims.pres === undefined ? 'pres' : v.me.sec && r.claims.sec === undefined ? 'sec' : null;
      x.file = r.file ? { type: r.file.type, title: r.file.title } : null;
    }
    if (ph === 'POWER') {
      x.kind = d.kind; x.label = POWER_LABEL[d.kind]; x.target = d.target ? this.pub(this.P(d.target)) : null;
      if (me && v.me.pres && d.step === 'choose') { if (d.kind === 'peek') x.top = d.top; else x.targets = d.targets; }
      if (me && v.me.pres && d.kind === 'inquiry' && d.step === 'result') x.found = (me.seen || []).find((s) => s.id === d.target)?.team || null;
    }
    if (ph === 'END') {
      x.winner = this.winner; x.step = d.step;
      x.roles = this.players.map((p) => ({ ...this.pub(p), role: p.role, roleName: ROLE_NAME[p.role], alive: p.alive }));
    }
    return v;
  }
}

module.exports = { LandGrab, teamOf };
