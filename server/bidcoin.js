'use strict';
// BID-COIN! A storage locker bidding war. Peek, bid, bet, reveal. Richest at the end wins.
// Same engine pattern as the other games: one async script per room, players act through act().
// Bids take a fast lane: they are checked and broadcast at once as a tiny message, with no full screen update.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const C = require('./bc-items');
const L = require('./bc-lines');
const voice = require('./voice');
const ai = require('./ai');
const photos = require('./bc-photos');
const PH = (id) => photos.urlFor(id);

const SPEED = Number(process.env.WR_SPEED || 1);
const BOT_PACE = Number(process.env.BC_BOT_PACE || 1);
const ms = (s) => Math.max(30, Math.round(s * 1000 * SPEED));
const uid = () => crypto.randomBytes(6).toString('hex');
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const shuffle = (arr) => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const clip = (s, n) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);
const fill = (t, o) => t.replace(/\{(\w+)\}/g, (_, k) => (o[k] ?? ''));
const timeout = (p, t) => Promise.race([p, new Promise((r) => setTimeout(() => r(null), t))]);
const strip = voice.stripTags;
const money = (n) => Math.round(n).toLocaleString('en-US');
const roundTo = (v) => { const a = Math.abs(v); const s = a >= 10000 ? 500 : a >= 1000 ? 50 : a >= 100 ? 10 : 5; return Math.round(v / s) * s; };
const roll = (table) => { const tot = Object.values(table).reduce((a, b) => a + b, 0); let r = Math.random() * tot; for (const [k, w] of Object.entries(table)) { r -= w; if (r <= 0) return k; } return Object.keys(table)[0]; };
class Cancelled extends Error {}

const VOICE = () => voice.BC();
const COLORS = ['#F2C230', '#2FB36B', '#E5484D', '#3E8EDE', '#A970FF', '#FF8A3D', '#26C6C6', '#F06FB0'];
const BOT_NAMES = ['Ahmed', 'Bella', 'Carlos', 'Dina', 'Erik', 'Fatima', 'Gopal', 'Hana'];
const MIN = 2; const MAX = 8;
// real-world prices: AED 40,000 each, bids in 500s, 1,000s and 5,000s
const START_CASH = 40000; const STAKE = 2000; const HAND = 3; const OPEN = 1000; const INC = [500, 1000, 5000]; const PHANTOM = 3000;
const LOCKERS = () => Math.max(2, Math.min(10, Number(process.env.BC_LOCKERS || 8)));
// seconds. Idle times count from the last bid: going once, going twice, sold.
const T = { peek: 18, bet: 9, after: 8, result: 4, idle: [2, 3.6, 5.2], opening: [7, 8.6, 10.2], freeze: 10, late: 40, lateIdle: [1.6, 2.8, 4] };

const CARDS = {
  xray: { name: 'X-Ray Specs', when: 'peek', text: 'See three more things in this locker.' },
  tip: { name: 'Insider Tip', when: 'peek', text: 'Find out roughly what this locker is worth.' },
  plant: { name: 'The Plant', when: 'peek', text: "Next locker, one thing in everyone else's peek is a fake. Exposed at its reveal." },
  freeze: { name: 'Freeze', when: 'auction', text: 'Lock one rival out of bidding for 10 seconds.', target: true },
  phantom: { name: 'Phantom Bidder', when: 'auction', text: 'A mystery bid of +3,000. If it wins, nobody gets the locker.' },
  steal: { name: 'Steal', when: 'bet', text: 'After SOLD, take the locker for the price plus 50%.' },
  tax: { name: 'Tax Man', when: 'after', text: "Take 15% of this locker's profit." },
  swap: { name: 'Swap Meet', when: 'after', text: "Swap your cheapest find for this locker's second-best one." },
  appraise: { name: 'Appraiser', when: 'after', text: 'Your locker only: its best find is worth 50% more.' },
  curse: { name: 'Pass the Curse', when: 'after', text: 'Give your worst cursed thing to a rival.', target: true },
  lock: { name: 'Lock', when: 'held', text: 'Block a Steal, Tax, Swap, Curse or Freeze aimed at you.' },
};
const CARD_WEIGHT = { xray: 10, tip: 10, plant: 9, freeze: 10, phantom: 8, steal: 8, tax: 9, swap: 8, appraise: 7, curse: 6, lock: 8 };
// the cards a Lock can stop, and how long the target has to stop them (seconds)
const LOCKABLE = ['steal', 'tax', 'swap', 'curse', 'freeze']; const LOCK_WINDOW = 5;
const STEAL_MARKUP = 1.5; const TAX_CUT = 0.15; const APPRAISE = 1.5;
// disasters: about one locker in four hides one behind something innocent. Garages and the mega locker are riskier.
const DISASTER_CHANCE = { normal: 0.22, mystery: 0.25, garage: 0.35, mega: 0.45 };
const GARAGES = [
  { name: "A lock-up garage nobody has opened since 2009", bias: ['cars'] },
  { name: "A car collector's back garage", bias: ['cars', 'jewels'] },
  { name: 'A repair shop that never reopened', bias: ['cars', 'tech', 'office'] },
  { name: "A racing team's old workshop", bias: ['cars', 'sports'] },
];

// How good a locker is, secretly. mix: what most things are. back: the thing at the back.
const GRADES = {
  dud: { w: 30, mix: { j: 58, d: 30, r: 6, l: 0, x: 6 }, back: { j: 20, d: 30, r: 15, x: 35 } },
  fair: { w: 50, mix: { j: 40, d: 38, r: 15, l: 2, x: 5 }, back: { d: 35, r: 40, l: 12, x: 13 } },
  jackpot: { w: 20, mix: { j: 28, d: 32, r: 25, l: 9, x: 6 }, back: { r: 35, l: 55, x: 10 } },
};
const AVG_ITEM = 3000; // what a bot assumes an unseen thing is worth

function bustPool() {
  let nums = [];
  try { nums = fs.readdirSync(path.join(__dirname, '..', 'public', 'assets', 'img')).map((f) => /^bust-(\d+)\.(png|jpe?g|webp)$/i.exec(f)).filter(Boolean).map((m) => Number(m[1])); } catch (e) { nums = []; }
  return nums.length >= 4 ? [...new Set(nums)].sort((a, b) => a - b) : [...Array(16).keys()].map((i) => i + 1);
}

class BidCoin {
  constructor(code, hooks, opts = {}) {
    this.kind = 'bc'; this.code = code; this.hooks = hooks; this.test = !!opts.test;
    this.players = []; this.phase = 'LOBBY'; this.d = {}; this.endsAt = null; this.cue = null;
    this.runId = 0; this.waiter = null; this.lastActive = Date.now(); this.syncPending = false;
    this.fx = []; this.fxSeq = 0; this.timers = []; this.busts = bustPool(); this.taught = false;
    this.splash = null; this.splashSeq = 0;
    this.reset();
    // record the voice lines in the order they're needed: the welcome and the rules first, then the auction calls
    [L.SAY.welcome, ...L.TUTORIAL.map((t) => t.line), L.SAY.once, L.SAY.twice, L.SAY.sold].forEach((t) => this.prefetch(t, true));
    for (const t of Object.values(L.SAY)) for (const x of [].concat(t)) if (!x.includes('{')) this.prefetch(x);
  }
  reset() { Object.assign(this, { lockers: [], li: -1, lk: null, auc: null, log: [], legends: [], atk: [] }); }

  // ------------------------------------------------------------ plumbing (same as the other games)
  P(id) { return this.players.find((p) => p.id === id); }
  humans() { return this.players.filter((p) => !p.bot); }
  vip() { return this.humans().find((p) => p.connected) || this.players[0]; }
  pub(p) { return p ? { id: p.id, name: p.name, color: p.color, bust: p.bust } : null; }
  nameOf(id) { return this.P(id)?.name || 'Someone'; }
  sync() {
    if (this.syncPending) return; this.syncPending = true;
    setTimeout(() => {
      this.syncPending = false;
      try { this.hooks.toHost(this.view(null)); for (const p of this.players) if (p.connected && !p.bot) this.hooks.toPlayer(p.id, this.view(p)); } catch (e) { console.error('bc sync', e); }
    }, 40);
  }
  progress() { this.lastProgress = Date.now(); }
  setPhase(phase, d = {}, seconds = null) { this.progress(); this.phase = phase; this.d = d; this.endsAt = seconds ? Date.now() + ms(seconds) : null; this.lastActive = Date.now(); this.sync(); this.botTurn(); }
  sfx(name) { this.fxSeq++; this.fx.push({ id: this.fxSeq, name }); if (this.fx.length > 14) this.fx.shift(); this.sync(); }
  blast(ev, data) { try { this.hooks.blast?.(ev, data); } catch (e) { /* fine */ } }
  guard(g) { if (g !== this.runId) throw new Cancelled(); }
  later(g, t, fn) { const h = setTimeout(() => { if (g !== this.runId) return; try { fn(); } catch (e) { console.error('bc timer', e); } }, t); this.timers.push(h); if (this.timers.length > 400) this.timers = this.timers.slice(-200); return h; }
  clearTimers() { this.timers.forEach(clearTimeout); this.timers = []; if (this.aucTick) clearInterval(this.aucTick); this.aucTick = null; }
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
  pause(g, s) { return this.wait(ms(s)).then(() => this.guard(g)); }
  splashOut(k, by, extra = {}) { this.splashSeq++; this.splash = { id: this.splashSeq, k, name: CARDS[k]?.name || k, by, ...extra }; this.sfx(`bc-${k}`); }

  // ------------------------------------------------------------ the Auctioneer
  // the auctioneer uses ElevenLabs' quick model, so lines are ready in about a second
  prefetch(text, urgent) { return voice.get(text, VOICE(), urgent, true).catch(() => null); }
  estimate(text) { return Math.min(20000, 700 + strip(text).length * 58); }
  async makeCue(text, opts = {}) {
    let audioId = null;
    if (voice.enabled()) audioId = await timeout(this.prefetch(text, opts.urgent !== false), opts.maxWait || 7000);
    return { id: uid(), text: strip(text), speak: strip(text), audio: audioId ? `/audio/${audioId}` : null, kind: 'host', who: null };
  }
  async say(g, text, opts = {}) {
    if (!strip(text)) return 'empty';
    const cue = await this.makeCue(text, opts); this.guard(g);
    this.cue = cue; this.cueDone = null; this.sync();
    const est = this.estimate(text);
    // the TV says when the line has finished; these limits only matter if the TV goes quiet
    this.progress();
    const r = await this.wait(cue.audio ? est * 1.7 + 3000 : est * 1.6 + 2500, () => this.cueDone === cue.id);
    this.guard(g);
    if (this.cue === cue) { this.cue = null; this.sync(); }
    return r;
  }
  async sayOver(g, text, opts = {}) { if (!strip(text)) return; const cue = await this.makeCue(text, { maxWait: 1500, ...opts }); if (g !== this.runId) return; this.cue = cue; this.sync(); }
  cueFinished(id) { this.cueDone = id; if (this.cue && this.cue.id === id) this.cue = null; this.check(); }

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
    if (this.players.length >= MAX) return { error: `The yard is full (${MAX} players)` };
    const p = this.newPlayer(name, false); this.players.push(p); this.sync();
    return { player: p };
  }
  newPlayer(name, bot) {
    const used = new Set(this.players.map((x) => x.color));
    const free = this.busts.filter((b) => !this.players.some((x) => x.bust === b));
    return { id: uid(), token: uid(), name, color: COLORS.find((c) => !used.has(c)) || pick(COLORS), connected: true, bot, bust: free.length ? pick(free) : pick(this.busts), notes: [], noteSeq: 0, ...this.fresh() };
  }
  fresh() { return { cash: START_CASH, freeLock: true, hand: [], shelf: [], cursed: [], sealed: [], peek: [], tip: null, bids: 0, played: 0, wins: 0, ready: false, est: 0, nextBot: 0 }; }
  // bots: from the TV in test mode, or from the first player's phone in any game (to make up the numbers)
  addBot(fromVip = false) {
    if ((!this.test && !fromVip) || this.phase !== 'LOBBY' || this.players.length >= MAX) return { error: 'No room for more bots' };
    const name = BOT_NAMES.find((n) => !this.players.some((p) => p.name === n)) || `Bot ${this.players.length + 1}`;
    this.players.push(this.newPlayer(name, true)); this.sync(); return { ok: true };
  }
  removeBots() { if (this.phase !== 'LOBBY') return; this.players = this.players.filter((p) => !p.bot); this.sync(); }
  setConnected(id, on) { const p = this.P(id); if (p) { p.connected = on; this.lastActive = Date.now(); this.check(); this.sync(); } }
  kick(byId, target) { if (this.phase !== 'LOBBY' || this.vip()?.id !== byId) return; this.players = this.players.filter((p) => p.id !== target); this.hooks.kicked?.(target); this.sync(); }
  note(p, text, kind = 'info') { if (!p || p.bot) return; p.noteSeq++; p.notes.push({ id: p.noteSeq, text, kind }); if (p.notes.length > 4) p.notes.shift(); }

  start(byId) {
    if (byId && this.vip()?.id !== byId) return { error: 'Only the first player can start' };
    if (this.phase !== 'LOBBY') return {};
    this.players = this.players.filter((p) => p.connected);
    const n = this.players.length;
    if (n < MIN) return { error: `BID-COIN! needs at least ${MIN} players${this.test ? '. Add some bots on the TV.' : ''}` };
    this.reset(); photos.scanLocal();
    this.players.forEach((p) => { Object.assign(p, this.fresh()); p.hand = [this.drawCard(), this.drawCard()]; });
    this.buildLockers();
    const g = ++this.runId;
    this.startWatchdog(g);
    this.run(g).catch((e) => { if (!(e instanceof Cancelled)) { console.error('bc run error', e); this.setPhase('END', { step: 'ranks', ...this.ranking() }); } });
    return {};
  }
  playAgain(byId) {
    if (this.phase !== 'END' || this.vip()?.id !== byId) return;
    this.runId++; this.clearTimers(); this.players = this.players.filter((p) => p.connected);
    this.players.forEach((p) => Object.assign(p, this.fresh()));
    this.cue = null; this.splash = null; this.reset(); this.setPhase('LOBBY', {});
  }

  // ------------------------------------------------------------ cards
  drawCard() { return { id: uid(), k: roll(CARD_WEIGHT) }; }
  giveCard(p, why) {
    if (!p || p.hand.length >= HAND) return false;
    const c = this.drawCard(); p.hand.push(c);
    this.note(p, `New power card: ${CARDS[c.k].name}${why ? ` (${why})` : ''}`, 'good'); return true;
  }
  takeCard(p, k) { const i = p.hand.findIndex((c) => c.k === k); if (i < 0) return false; p.hand.splice(i, 1); p.played++; return true; }

  // ------------------------------------------------------------ building the lockers
  inst(item, extra = {}) {
    const value = roundTo(item.value * (0.85 + Math.random() * 0.3));
    return { uid: uid(), id: item.id, img: item.img || item.id, name: item.name, cat: item.cat, rar: item.rar, value, line: item.line, ...extra };
  }
  pickCar(used, grail) {
    let pool = C.ITEMS.filter((i) => i.rar === 'c' && !used.has(i.id)); if (!pool.length) pool = C.ITEMS.filter((i) => i.rar === 'c');
    // cheap wrecks turn up most; grails are rare (except in the vault)
    const w = (v) => (grail ? (v >= 60000 ? 3 : 1) : v <= 20000 ? 10 : v <= 60000 ? 6 : v <= 120000 ? 2.5 : 0.8);
    let r = Math.random() * pool.reduce((t, i) => t + w(i.value), 0);
    for (const it of pool) { r -= w(it.value); if (r <= 0) { used.add(it.id); return it; } }
    return pool[0];
  }
  makeDisaster(garage, used) {
    let pool = C.DISASTERS.filter((d) => !used.has(d.id) && (!garage || d.garage !== false));
    if (garage && Math.random() < 0.6) { const car = pool.filter((d) => d.garage); if (car.length) pool = car; }
    if (!pool.length) pool = C.DISASTERS;
    const d = pick(pool); used.add(d.id);
    const look = C.BY_ID[pick(d.looks)] || C.BY_ID[d.looks[0]];
    const value = d.pct ? -10000 : -roundTo(d.cost * (0.9 + Math.random() * 0.2));
    return { uid: uid(), id: d.id, img: d.id, name: d.name, cat: d.cat, rar: 'z', value, pct: d.pct || 0, line: d.line,
      look: { id: look.id, img: look.img || look.id, name: look.name, cat: look.cat, line: look.line, value: look.value } };
  }
  pickItem(rar, bias, used) {
    let pool = C.ITEMS.filter((i) => i.rar === rar && !used.has(i.id));
    if (!pool.length) pool = C.ITEMS.filter((i) => i.rar === rar);
    const biased = pool.filter((i) => bias.includes(i.cat));
    const it = biased.length && Math.random() < 0.65 ? pick(biased) : pick(pool);
    used.add(it.id); return it;
  }
  buildLockers() {
    const total = LOCKERS(); const used = new Set();
    const origins = shuffle(C.ORIGINS);
    const mysteryAt = total >= 4 ? 3 + Math.floor(Math.random() * (total - 4)) : -1; // never the first or the last
    // most games get one garage with a car at the back (never the first, the last or the mystery one)
    const spots = []; for (let n = 2; n < total; n++) if (n !== mysteryAt) spots.push(n);
    const garageAt = spots.length && Math.random() < 0.75 ? pick(spots) : -1;
    this.lockers = [];
    for (let n = 1; n <= total; n++) {
      const special = n === total ? 'mega' : n === mysteryAt ? 'mystery' : n === garageAt ? 'garage' : null;
      const mega = special === 'mega'; const garage = special === 'garage';
      const origin = mega ? { name: "A billionaire's private vault", bias: ['jewels', 'art', 'cars', 'antiques'] } : special === 'mystery' ? { name: 'Nobody knows', bias: [] } : garage ? pick(GARAGES) : origins[(n - 1) % origins.length];
      const gname = mega ? roll({ fair: 35, jackpot: 65 }) : roll(Object.fromEntries(Object.entries(GRADES).map(([k, v]) => [k, v.w])));
      const gr = GRADES[gname];
      const mix = { ...gr.mix }; const backT = { ...gr.back };
      if (origin.curse) { mix.x *= 2.2; backT.x = (backT.x || 0) * 2; }
      const count = mega ? 10 : garage ? 5 : 6 + Math.floor(Math.random() * 3);
      const items = [];
      for (let i = 0; i < count; i++) items.push(this.inst(this.pickItem(roll(mix), origin.bias, used), { mega }));
      // a sealed box swaps in for one of them, now and then
      if (Math.random() < (mega ? 0.6 : 0.28)) {
        const box = pick(C.CONTAINERS); const inner = this.pickItem(roll({ d: 35, r: 33, l: 15, x: 17 }), [], used);
        items[Math.floor(Math.random() * items.length)] = { ...this.inst({ ...box, rar: 's', value: 0 }), img: box.id, sealed: true, inner: this.inst(inner, { mega }) };
      }
      // the thing at the back: a car in a garage (and sometimes in the mega locker)
      const backItem = garage || (mega && Math.random() < 0.2) ? this.pickCar(used, mega) : this.pickItem(roll(backT), origin.bias, used);
      items.push(this.inst(backItem, { mega: mega && backItem.rar !== 'c', back: true }));
      // a disaster, dressed up as something harmless
      if (Math.random() < DISASTER_CHANCE[special || 'normal']) {
        const spots2 = items.map((it, i) => i).filter((i) => !items[i].sealed && (!items[i].back || Math.random() < 0.25));
        if (spots2.length) { const i = pick(spots2); const dz = this.makeDisaster(garage, used); if (items[i].back) dz.back = true; items[i] = dz; }
      }
      this.lockers.push({ n, total, origin: origin.name, special, grade: gname, items, price: 0, owner: null, phantom: false, plants: [], bets: {}, shown: 0, stolen: null, effects: [], result: null });
    }
    // one or two one-of-a-kind legends, written by the AI when it can (with a fallback)
    this.makeLegends().catch((e) => console.error('bc legends', e));
    // the first locker's lines are recorded now; each later one while the previous locker plays
    this.prefetchLocker(this.lockers[0]);
    // and every photo in every locker gets looked up first
    photos.warm(this.lockers.flatMap((lk) => lk.items.flatMap((it) => [it.img, it.inner?.img])), true);
  }
  async makeLegends() {
    const want = 1 + (Math.random() < 0.5 ? 1 : 0);
    const slots = shuffle(this.lockers.filter((l) => l.special !== 'mystery').map((l) => l.n)).slice(0, want);
    let found = null;
    try { found = await timeout(ai.bcLegends?.(want, C.ITEMS.filter((i) => 'jdrl'.includes(i.rar)).map((i) => i.id)), 9000); } catch (e) { found = null; }
    const pool = shuffle(C.LEGENDS);
    slots.forEach((n, i) => {
      const lk = this.lockers[n - 1]; if (!lk || this.li >= n - 1) return; // too late for that one
      const f = (found && found[i]) || pool[i];
      const base = C.BY_ID[f.base] || C.BY_ID[pick(C.LEGENDS).base];
      const item = this.inst({ ...base, name: clip(f.name, 60), line: clip(f.line, 90), value: Math.max(15000, Math.min(90000, Number(f.value) || 40000)), rar: 'l', img: base.id }, { mega: lk.special === 'mega', back: true, legend: true });
      item.say = this.sayLineFor(item);
      const bi = lk.items.findIndex((x) => x.back); lk.items[bi] = item;
      if (lk.prefetched) this.prefetch(item.say);
    });
  }
  sayLineFor(it) {
    if (it.legend) return fill(L.SAY.aiLegend, { item: it.name });
    if (it.sealed) return fill(L.SAY.sealed, { item: it.name });
    if (it.rar === 'l') return fill(pick(L.SAY.legend), { item: it.name });
    if (it.rar === 'x') return fill(pick(L.SAY.cursed), { item: it.name });
    if (it.rar === 'z') return it.pct ? fill(pick(L.SAY.disasterPct), { item: it.name, pct: Math.round(it.pct * 100) }) : fill(pick(L.SAY.disaster), { item: it.name, look: it.look.name, cost: money(-it.value) });
    if (it.rar === 'c') return fill(pick(L.SAY.car), { item: it.name });
    return null;
  }
  prefetchLocker(lk) {
    if (!lk || lk.prefetched) return; lk.prefetched = true;
    lk.introLine = lk.special === 'mega' ? L.SAY.mega : lk.special === 'mystery' ? fill(L.SAY.mystery, { n: lk.n }) : fill(pick(L.SAY.locker), { n: lk.n, origin: lk.origin });
    this.prefetch(lk.introLine);
    for (const it of lk.items) { it.say = this.sayLineFor(it); if (it.say) this.prefetch(it.say); }
  }

  // ------------------------------------------------------------ the game
  async run(g) {
    this.setPhase('INTRO', { step: 'welcome' }); this.sfx('bc-door');
    await this.say(g, L.SAY.welcome);
    if (!this.taught) {
      this.skipTut = false;
      for (let i = 0; i < L.TUTORIAL.length && !this.skipTut; i++) { this.setPhase('TUTORIAL', { step: i }); this.sfx('whoosh'); await this.say(g, L.TUTORIAL[i].line); }
      this.taught = true;
    } else { this.setPhase('INTRO', { step: 'how' }); await this.say(g, L.SAY.how); }
    for (let i = 0; i < this.lockers.length; i++) { this.li = i; this.prefetchLocker(this.lockers[i + 1]); await this.locker(g, this.lockers[i]); }
    await this.finale(g);
  }
  // after a pause, every deadline moves forward by the time spent paused
  shiftClock(dt) {
    const a = this.auc;
    if (a) { a.start += dt; a.last += dt; for (const id of Object.keys(a.frozen)) a.frozen[id] += dt; }
    for (const p of this.players) if (p.nextBot) p.nextBot += dt;
    for (const at of this.atk || []) at.until += dt;
  }
  // a safety net: if nothing has moved for two minutes, nudge the game on
  startWatchdog(g) {
    clearInterval(this.dog); this.progress();
    this.dog = setInterval(() => {
      if (g !== this.runId || this.phase === 'END' || this.phase === 'LOBBY') { clearInterval(this.dog); return; }
      if (Date.now() - this.lastProgress > 120000) {
        console.error(`bc ${this.code}: stuck in ${this.phase}, moving on`);
        this.progress(); this.cue = null;
        if (this.auc && !this.auc.done) this.auc.done = true;
        this.wake('watchdog'); this.sync();
      }
    }, 5000);
  }

  standings() { return [...this.players].sort((a, b) => b.cash - a.cash); }

  async locker(g, lk) {
    this.lk = lk; this.auc = null; this.splash = null;
    this.players.forEach((p) => { p.peek = []; p.tip = null; p.ready = false; p.bet = null; p.passed = false; });
    // 1. the door rolls up
    this.setPhase('LOCKER', {}); this.sfx('bc-door');
    await this.say(g, lk.introLine);

    // 2. the peek: everyone sees something different
    this.dealPeeks(lk);
    this.setPhase('PEEK', {}, T.peek);
    this.sayOver(g, lk.special === 'mystery' ? L.SAY.peekMystery : pick(L.SAY.peek));
    await this.wait(ms(T.peek), () => this.players.every((p) => p.ready || !p.connected)); this.guard(g);
    for (const pl of lk.plants) this.prefetch(fill(L.SAY.plant, { item: pl.item.name, name: this.nameOf(pl.by) }));

    // 3. the auction
    await this.auction(g, lk);

    // 4. sold: who got it?
    const a = this.auc;
    if (a.leader && a.leader !== 'phantom') { lk.owner = a.leader; lk.price = a.price; const o = this.P(lk.owner); o.cash -= lk.price; o.wins++; }
    else if (a.leader === 'phantom') { lk.phantom = true; lk.price = a.price; }
    if (!a.leader) {
      this.setPhase('BET', { step: 'none' });
      await this.say(g, L.SAY.noTakers);
    } else {
      // boom or bust, and a last chance to steal it
      this.setPhase('BET', { step: 'bet' }, T.bet);
      if (lk.phantom) await this.say(g, L.SAY.phantomWins);
      else this.sayOver(g, fill(pick(L.SAY.soldTo), { name: this.nameOf(lk.owner), price: money(lk.price) }));
      this.prefetchVerdict(lk);
      await this.wait(ms(T.bet), () => !this.atk.length && this.players.every((p) => p.bet || p.id === lk.owner || !p.connected || p.cash < STAKE)); this.guard(g);
      await this.settleAttacks(g);
    }
    if (lk.owner) this.giveCard(this.P(lk.owner), 'you won a locker');

    // 5. the reveal
    await this.reveal(g, lk);

    // 6. power cards that work on a finished locker
    if (this.afterCards(lk).length) {
      this.players.forEach((p) => { p.passed = false; });
      this.setPhase('AFTER', {}, T.after);
      this.sayOver(g, L.SAY.after);
      await this.wait(ms(T.after), () => !this.atk.length && this.afterCards(lk).length === 0); this.guard(g);
      await this.settleAttacks(g);
    }

    // 7. pay out and show the money
    this.payout(lk);
    this.setPhase('RESULT', {});
    await this.pause(g, T.result);
  }

  dealPeeks(lk) {
    const pool = lk.items.filter((it) => !it.back);
    const fakes = lk.plants || [];
    const last = this.standings()[this.standings().length - 1];
    const order = shuffle(pool); let k = 0;
    if (lk.special === 'mystery') return;
    for (const p of shuffle(this.players)) {
      const n = p === last && this.li > 0 ? 2 : 1;
      for (let i = 0; i < n; i++) { const it = order[k % order.length]; k++; if (!p.peek.some((x) => x.uid === it.uid)) p.peek.push({ uid: it.uid }); }
      if (n === 2) this.note(p, "You're in last place, so you get two peeks.", 'good');
      // a planted fake takes the place of one real thing they'd have seen, so nothing looks different
      const mine = fakes.filter((pl) => pl.by !== p.id);
      if (mine.length) { const pl = pick(mine); const at = Math.floor(Math.random() * p.peek.length); p.peek[at] = { uid: pl.item.uid, fake: true, item: pl.item }; }
    }
  }
  // the next locker that can take a plant (the mystery locker has no peek)
  plantTarget() { for (let i = this.li + 1; i < this.lockers.length; i++) if (this.lockers[i].special !== 'mystery') return this.lockers[i]; return null; }
  peekPub(p) {
    const lk = this.lk; if (!lk) return [];
    return p.peek.map((pk) => {
      if (pk.fake) return { uid: pk.uid, name: pk.item.name, img: PH(pk.item.img), cat: pk.item.cat, line: pk.item.line };
      const it = lk.items.find((x) => x.uid === pk.uid); if (!it) return null;
      if (it.look) return { uid: it.uid, name: it.look.name, img: PH(it.look.img), cat: it.look.cat, line: it.look.line, xray: !!pk.xray };
      return { uid: it.uid, name: it.name, img: PH(it.img), cat: it.cat, line: it.line, sealed: !!it.sealed, xray: !!pk.xray };
    }).filter(Boolean);
  }

  // ------------------------------------------------------------ the auction: fast, server decides the order
  aucPub() {
    const a = this.auc; if (!a) return null;
    const now = Date.now(); const th = this.thresholds();
    const fz = {}; for (const [id, t] of Object.entries(a.frozen)) if (t > now) fz[id] = t - now;
    return { price: a.price, leader: a.leader, n: a.n, calls: a.calls, dl: Math.max(0, a.last + ms(th[2]) - now), win: ms(th[2]), hist: a.hist.slice(-5), frozen: fz, done: a.done, seq: a.seq };
  }
  thresholds() { const a = this.auc; if (!a.n) return T.opening; return Date.now() - a.start > ms(T.late) ? T.lateIdle : T.idle; }
  blastAuc() { this.auc.seq++; this.blast('bc:b', this.aucPub()); }
  async auction(g, lk) {
    const a = this.auc = { price: OPEN, leader: null, n: 0, calls: 0, start: Date.now(), last: Date.now(), hist: [], frozen: {}, phantomBy: null, done: false, seq: 0 };
    this.setPhase('AUCTION', {});
    this.sayOver(g, pick(L.SAY.open));
    for (const b of this.players.filter((p) => p.bot)) { b.est = this.botEstimate(b, lk); b.nextBot = Date.now() + ms(0.8 + Math.random() * 2); }
    this.aucTick = setInterval(() => { try {
      if (g !== this.runId || a.done || this.pauseInfo) return;
      const idle = Date.now() - a.last; const th = this.thresholds();
      if (idle >= ms(th[2])) { a.done = true; this.check(); return; }
      if (idle >= ms(th[1]) && a.calls < 2 && a.leader) { a.calls = 2; this.callOut('twice'); }
      else if (idle >= ms(th[0]) && a.calls < 1 && a.leader) { a.calls = 1; this.callOut('once'); }
      this.botsBid(lk);
    } catch (e) { console.error('bc auction tick', e); } }, 50);
    await this.wait(10 * 60 * 1000, () => a.done);
    clearInterval(this.aucTick); this.aucTick = null; a.done = true;
    this.guard(g);
    this.blastAuc();
    if (a.leader) { this.sfx('bc-gavel'); await this.say(g, L.SAY.sold, { maxWait: 300 }); }
  }
  async callOut(which) {
    const g = this.runId; const a = this.auc; const seq = a.seq;
    this.blastAuc(); this.sfx(which === 'once' ? 'bc-tick' : 'bc-tick2');
    const c = await this.makeCue(L.SAY[which], { maxWait: 250 });
    if (g === this.runId && this.auc === a && a.seq === seq + 1 && !a.done) { this.cue = c; this.sync(); }
  }
  bid(me, inc, at) {
    const a = this.auc;
    if (this.phase !== 'AUCTION' || !a || a.done) return { error: 'Bidding is closed' };
    inc = Number(inc); if (!INC.includes(inc)) return { error: 'Pick a bid' };
    if (a.leader === me.id) return { error: "You're already winning!" };
    if ((a.frozen[me.id] || 0) > Date.now()) return { error: "You're frozen!" };
    // the bid is "my number plus this much". If someone beat you to a higher number, it doesn't count.
    const seen = Number.isFinite(Number(at)) ? Math.min(Number(at), a.price) : a.price;
    const price = seen + inc;
    if (price <= a.price) return { stale: true, error: `${a.leader === 'phantom' ? 'The mystery bidder' : this.nameOf(a.leader)} got there first`, auc: this.aucPub() };
    if (price > me.cash) return { error: `You only have AED ${money(me.cash)}` };
    a.price = price; a.leader = me.id; a.n++; a.calls = 0; a.last = Date.now(); a.hist.push({ who: me.id, inc, price }); if (a.hist.length > 8) a.hist.shift();
    me.bids++; this.lastActive = Date.now(); this.progress();
    if (this.cue && /Going/.test(this.cue.text)) this.cue = null;
    this.blastAuc();
    return { ok: true, auc: this.aucPub() };
  }

  // ------------------------------------------------------------ reveal
  found(lk) { return lk.items.reduce((s, it) => s + (it.sealed ? 0 : it.value), 0); }
  prefetchVerdict(lk) {
    if (!lk.owner) { this.prefetch(fill(L.SAY.unsoldTotal, { total: money(this.found(lk)) })); return; }
    this.prefetch(this.verdictLine(lk));
  }
  verdictLine(lk) {
    const profit = this.found(lk) - lk.price; const name = this.nameOf(lk.owner);
    if (Math.abs(profit) < Math.max(600, lk.price * 0.05)) return fill(L.SAY.even, { name });
    return profit > 0 ? fill(pick(L.SAY.boom), { name, profit: money(profit) }) : fill(pick(L.SAY.bust), { name, loss: money(-profit) });
  }
  async reveal(g, lk) {
    const own = this.P(lk.owner);
    const avg = this.players.reduce((t, p) => t + Math.max(0, p.cash), 0) / Math.max(1, this.players.length);
    for (const it of lk.items) if (it.rar === 'z' && it.pct) it.value = -roundTo(Math.max(0, own ? own.cash : avg) * it.pct);
    const order = [...shuffle(lk.items.filter((x) => !x.back)), ...lk.items.filter((x) => x.back)];
    lk.items = order; lk.shown = 0;
    this.setPhase('REVEAL', { step: 'open' });
    await this.say(g, pick(L.SAY.reveal));
    const quick = !lk.owner && !lk.phantom;
    for (let i = 0; i < order.length; i++) {
      const it = order[i];
      if (it.back) { this.d = { step: 'back' }; this.sync(); this.sfx('drumroll'); await this.say(g, L.SAY.back); }
      lk.shown = i + 1; this.d = { step: it.back ? 'back' : 'item' }; this.sync();
      this.sfx(it.sealed ? 'bc-lock' : it.rar === 'z' ? 'bc-bust' : it.rar === 'x' ? 'bc-curse' : it.rar === 'l' || it.rar === 'c' ? 'bc-legend' : it.rar === 'r' ? 'bc-cash' : 'bc-thud');
      if (it.say && (!quick || it.rar === 'l' || it.rar === 'z' || it.rar === 'c' || it.legend)) await this.say(g, it.say);
      else await this.pause(g, quick ? 0.7 : it.rar === 'r' ? 1.5 : 1.15);
    }
    // the plants: things people "saw" that were never there
    for (const pl of lk.plants) {
      lk.plantShown = (lk.plantShown || 0) + 1; this.d = { step: 'plant' }; this.sync(); this.sfx('bc-plant');
      await this.say(g, fill(L.SAY.plant, { item: pl.item.name, name: this.nameOf(pl.by) }));
    }
    // cursed things go home with the owner straight away, so they can be passed on
    const owner = this.P(lk.owner);
    if (owner) for (const it of lk.items) if (it.rar === 'x' && !it.taken) { it.taken = true; owner.cursed.push({ ...it, from: lk.n }); }
    // the verdict
    this.d = { step: 'verdict' };
    lk.verdict = this.verdict(lk); this.sync();
    if (lk.owner || lk.phantom) {
      this.sfx(lk.verdict.profit > 0 ? 'bc-boom' : 'bc-bust');
      if (lk.owner) await this.say(g, this.verdictLine(lk));
      this.settleBets(lk);
      this.sync();
      if (Object.keys(lk.bets).length) await this.pause(g, 2.6);
    } else await this.say(g, fill(L.SAY.unsoldTotal, { total: money(this.found(lk)) }));
  }
  verdict(lk) { const found = this.found(lk); return { found, price: lk.price, profit: found - lk.price }; }
  settleBets(lk) {
    const boom = lk.verdict.profit > 0;
    for (const [pid, pickd] of Object.entries(lk.bets)) {
      const p = this.P(pid); if (!p) continue;
      const won = (pickd === 'boom') === boom;
      p.cash += won ? STAKE : -STAKE;
      lk.bets[pid] = { pick: pickd, won };
      if (won) this.giveCard(p, 'you won your bet');
    }
  }

  // ------------------------------------------------------------ after the reveal: tax, swap, appraise, curse
  afterCards(lk) {
    // who still holds a card they could use right now (and hasn't passed)
    return this.players.filter((p) => !p.passed && p.connected && p.hand.some((c) => this.cardUsable(p, c.k, lk, 'AFTER')));
  }
  cardUsable(p, k, lk = this.lk, ph = this.phase) {
    if (!lk) return false;
    const owner = lk.owner;
    const best = this.bestFind(lk);
    switch (k) {
      case 'xray': case 'tip': return ph === 'PEEK' && !(k === 'tip' && p.tip) && !(k === 'xray' && p.peek.some((x) => x.xray));
      case 'plant': { const nx = this.plantTarget(); return ph === 'PEEK' && !!nx && !nx.plants.some((x) => x.by === p.id); }
      case 'freeze': return ph === 'AUCTION' && this.auc && !this.auc.done;
      case 'phantom': return ph === 'AUCTION' && this.auc && !this.auc.done && this.auc.leader !== 'phantom' && !this.auc.phantomBy;
      case 'steal': return ph === 'BET' && this.d.step === 'bet' && owner && owner !== p.id && !lk.stolen && !this.atk.some((x) => x.k === 'steal') && p.cash >= this.stealPrice(lk);
      case 'tax': return ph === 'AFTER' && owner && owner !== p.id && this.projected(lk).profit > 0 && !lk.effects.some((e) => e.k === 'tax' && e.by === p.id);
      case 'swap': return ph === 'AFTER' && owner && owner !== p.id && !!this.swapFind(lk) && !this.atk.some((x) => x.k === 'swap');
      case 'appraise': return ph === 'AFTER' && owner === p.id && best && !best.appraised;
      case 'curse': return ph === 'AFTER' && p.cursed.length > 0;
      default: return false;
    }
  }
  stealPrice(lk) { return roundTo(lk.price * STEAL_MARKUP); }
  finds(lk) { return lk.items.filter((it) => !it.sealed && it.rar !== 'x' && it.rar !== 'z' && !it.swapped).sort((a, b) => b.value - a.value); }
  bestFind(lk) { return this.finds(lk)[0] || null; }
  // Swap can never take the single best thing: it takes the second best
  swapFind(lk) { return this.finds(lk)[1] || null; }
  projected(lk) { const found = lk.items.reduce((s, it) => s + (it.sealed || it.swapped ? 0 : it.value), 0) + lk.effects.filter((e) => e.k === 'swap').reduce((s, e) => s + e.give, 0); return { found, profit: found - lk.price }; }

  playCard(me, k, target) {
    const lk = this.lk;
    if (!me.hand.some((c) => c.k === k)) return { error: "You don't have that card" };
    if (!this.cardUsable(me, k, lk)) return { error: `${CARDS[k]?.name || 'That card'} can't be used right now` };
    const T_ = target ? this.P(target) : null;
    if (CARDS[k].target && (!T_ || T_ === me)) return { error: 'Pick a rival first' };
    if (k === 'curse' && T_ && T_.id === me.id) return { error: 'Pick a rival' };
    this.takeCard(me, k);
    switch (k) {
      case 'xray': {
        const unseen = shuffle(lk.items.filter((it) => !me.peek.some((x) => x.uid === it.uid))).slice(0, 3);
        unseen.forEach((it) => me.peek.push({ uid: it.uid, xray: true }));
        break;
      }
      case 'tip': {
        const tot = this.found(lk); const lo = Math.max(0, roundTo(tot * (0.68 + Math.random() * 0.25))); me.tip = { lo, hi: roundTo(Math.max(lo + 2000, lo * 1.45)) };
        break;
      }
      case 'plant': {
        // baked into the next locker's peek from the start, in place of something real, and not always flashy
        const nx = this.plantTarget(); const real = new Set(nx.items.map((i) => i.id));
        const rar = roll({ d: 30, r: 42, l: 28 });
        const fake = this.inst(pick(C.ITEMS.filter((i) => i.rar === rar && !real.has(i.id))), { mega: nx.special === 'mega' });
        nx.plants.push({ by: me.id, item: fake });
        this.note(me, `Planted. In locker ${nx.n}, everyone else will "see" a ${fake.name} that isn't there.`, 'good');
        break;
      }
      case 'freeze': {
        // a freeze lands straight away; a Lock breaks it
        const a = this.auc; a.frozen[T_.id] = Date.now() + ms(T.freeze);
        this.splashOut('freeze', me.id, { target: T_.id }); this.blastAuc();
        this.note(T_, `${me.name} froze you! No bidding for 10 seconds.`, 'bad');
        this.attack('freeze', me, T_, null, () => { delete a.frozen[T_.id]; this.blastAuc(); });
        break;
      }
      case 'phantom': {
        const a = this.auc; a.price += PHANTOM; a.leader = 'phantom'; a.phantomBy = me.id; a.n++; a.calls = 0; a.last = Date.now(); a.hist.push({ who: 'phantom', inc: PHANTOM, price: a.price });
        this.splashOut('phantom', null); this.blastAuc();
        break;
      }
      case 'steal': {
        this.attack('steal', me, this.P(lk.owner), () => this.doSteal(me, lk));
        break;
      }
      case 'tax': this.attack('tax', me, this.P(lk.owner), () => { lk.effects.push({ k, by: me.id }); this.splashOut('tax', me.id, { target: lk.owner }); }); break;
      case 'appraise': { const b = this.bestFind(lk); b.appraised = true; b.value = roundTo(b.value * APPRAISE); lk.effects.push({ k, by: me.id, item: b.name, value: b.value }); this.splashOut('appraise', me.id, { item: b.name }); break; }
      case 'swap': this.attack('swap', me, this.P(lk.owner), () => this.doSwap(me, lk)); break;
      case 'curse': this.attack('curse', me, T_, () => this.doCurse(me, T_, lk)); break;
      default: break;
    }
    this.lastActive = Date.now(); this.check(); this.sync(); this.botTurn();
    return { ok: true };
  }
  doSteal(me, lk) {
    const old = this.P(lk.owner); const price = this.stealPrice(lk);
    if (!old || old === me || lk.stolen || me.cash < price) { this.note(me, 'The steal fizzled.', 'bad'); return; }
    old.cash += lk.price; me.cash -= price; old.wins--; me.wins++;
    lk.stolen = { from: old.id, by: me.id, was: lk.price }; lk.owner = me.id; lk.price = price; delete lk.bets[me.id];
    this.splashOut('steal', me.id, { target: old.id, price });
    this.note(old, `${me.name} stole your locker! You got your AED ${money(lk.stolen.was)} back.`, 'bad');
    this.prefetchVerdict(lk);
    this.later(this.runId, 10, () => this.sayOver(this.runId, fill(L.SAY.stolen, { name: me.name })));
  }
  doSwap(me, lk) {
    const b = this.swapFind(lk); if (!b) { this.note(me, 'Nothing left to swap.', 'bad'); return; }
    const mine = me.shelf.filter((x) => !x.gone).sort((x, y) => x.value - y.value)[0] || null;
    b.swapped = true; const give = mine ? mine.value : Math.round(b.value / 2);
    if (mine) { mine.gone = true; this.P(lk.owner).shelf.push({ ...mine, gone: false, from: 'swap' }); }
    lk.effects.push({ k: 'swap', by: me.id, take: b.value, give, item: b.name, mine: mine?.name || null });
    me.shelf.push({ ...b, from: 'swap' }); me.cash += b.value - give;
    this.splashOut('swap', me.id, { target: lk.owner, item: b.name, mine: mine?.name || null });
  }
  doCurse(me, T_, lk) {
    if (!me.cursed.length) return;
    const worst = [...me.cursed].sort((a, b) => a.value - b.value)[0];
    me.cursed = me.cursed.filter((c) => c !== worst); T_.cursed.push(worst);
    lk.effects.push({ k: 'curse', by: me.id, target: T_.id, item: worst.name });
    this.splashOut('curse', me.id, { target: T_.id, item: worst.name });
    this.note(T_, `${me.name} passed you their ${worst.name}. It costs AED ${money(-worst.value)} at the end.`, 'bad');
  }

  // ------------------------------------------------------------ the Lock: a few seconds to block a card aimed at you
  hasLock(p) { return !!p && (p.freeLock || p.hand.some((c) => c.k === 'lock')); }
  attack(k, me, target, apply, undo = null) {
    if (!target || target === me || !this.hasLock(target) || !target.connected) { apply?.(); return; }
    const g = this.runId;
    const at = { id: uid(), k, by: me.id, target: target.id, until: Date.now() + ms(LOCK_WINDOW), apply, undo, done: false };
    this.atk.push(at);
    this.note(target, `${me.name} played ${CARDS[k].name} on you! Tap Lock to block it.`, 'bad');
    if (target.bot) this.later(g, ms(0.7 + Math.random() * 1.6), () => { if (Math.random() < 0.6) this.block(target, at.id); });
    this.later(g, ms(LOCK_WINDOW), () => this.resolveAttack(at));
    this.sync();
  }
  resolveAttack(at) {
    if (at.done) return; at.done = true; this.atk = this.atk.filter((x) => x !== at);
    if (!at.undo) at.apply?.();
    this.check(); this.sync();
  }
  block(p, id) {
    const at = this.atk.find((x) => x.id === id && !x.done);
    if (!at || at.target !== p.id) return { error: 'Too late to block' };
    if (!this.hasLock(p)) return { error: 'No Lock left' };
    if (p.freeLock) p.freeLock = false; else this.takeCard(p, 'lock');
    at.done = true; at.blocked = true; this.atk = this.atk.filter((x) => x !== at);
    at.undo?.();
    this.splashOut('lock', p.id, { target: at.by, blocked: at.k });
    const by = this.P(at.by); if (by) this.note(by, `${p.name} locked your ${CARDS[at.k].name}. Wasted!`, 'bad');
    this.check(); this.sync();
    return { ok: true };
  }
  // before the game moves on, every card still in its block window lands (or gets blocked)
  async settleAttacks(g) {
    const t0 = Date.now();
    while (this.atk.length && Date.now() - t0 < ms(LOCK_WINDOW) + 1500) { await this.wait(200); this.guard(g); }
    for (const at of [...this.atk]) this.resolveAttack(at);
  }

  payout(lk) {
    const o = this.P(lk.owner);
    if (o) {
      let found = 0; let disaster = 0;
      for (const it of lk.items) {
        if (it.swapped || it.rar === 'x') continue;
        if (it.rar === 'z') { disaster += it.value; continue; }
        if (it.sealed) { o.sealed.push({ ...it, from: lk.n }); continue; }
        found += it.value; o.shelf.push({ uid: it.uid, id: it.id, img: it.img, name: it.name, value: it.value, rar: it.rar, from: lk.n });
      }
      found += lk.effects.filter((e) => e.k === 'swap').reduce((s, e) => s + e.give, 0);
      let profit = found - lk.price;
      for (const e of lk.effects.filter((x) => x.k === 'tax')) {
        const cut = profit > 0 ? roundTo(profit * TAX_CUT) : 0; e.cut = cut; found -= cut; profit -= cut;
        const t = this.P(e.by); if (t) t.cash += cut;
      }
      o.cash += found;
      // a disaster is paid on the spot, but it can't take anyone below zero
      if (disaster) { const hit = Math.min(-disaster, Math.max(0, o.cash)); o.cash -= hit; disaster = -hit; profit = found - lk.price + disaster; }
      // cursed things count against what you found, but are paid for at the end
      const cursed = lk.items.filter((it) => it.rar === 'x').reduce((s, it) => s + it.value, 0);
      lk.result = { owner: o.id, price: lk.price, paid: found, profit, cursed, disaster };
    } else lk.result = { owner: null, price: lk.price, paid: 0, profit: 0, phantom: lk.phantom };
    this.log.push({ n: lk.n, owner: lk.owner, price: lk.price, profit: lk.result.profit, best: [...lk.items].sort((a, b) => b.value - a.value)[0]?.name });
  }

  // ------------------------------------------------------------ the end
  async finale(g) {
    this.lk = null; this.auc = null;
    const boxes = this.players.flatMap((p) => p.sealed.map((s) => ({ p, s })));
    this.setPhase('FINALE', { step: 'intro' });
    await this.say(g, boxes.length ? L.SAY.finale : L.SAY.noSealed);
    for (const { p, s } of boxes) {
      this.setPhase('FINALE', { step: 'box', who: p.id, box: { name: s.name, img: PH(s.img) }, inner: null });
      this.sfx('drumroll');
      await this.say(g, fill(L.SAY.sealedOpen, { name: p.name, item: s.name }));
      const inner = s.inner; p.cash += inner.value; p.sealed = p.sealed.filter((x) => x !== s);
      this.d.inner = { name: inner.name, img: PH(inner.img), value: inner.value, rar: inner.rar, line: inner.line }; this.sync();
      this.sfx(inner.rar === 'x' ? 'bc-curse' : inner.rar === 'l' ? 'bc-legend' : 'bc-cash');
      await this.say(g, inner.rar === 'x' ? fill(L.SAY.sealedBad, { item: inner.name, value: money(-inner.value) }) : fill(pick(L.SAY.sealedIn), { item: inner.name, value: money(inner.value) }));
    }
    const cursed = this.players.filter((p) => p.cursed.length);
    if (cursed.length) {
      this.setPhase('FINALE', { step: 'curse', bills: cursed.map((p) => ({ id: p.id, items: p.cursed.map((c) => ({ name: c.name, value: c.value, img: PH(c.img) })), total: p.cursed.reduce((s, c) => s + c.value, 0) })) });
      this.sfx('bc-curse');
      await this.say(g, L.SAY.cursedPay);
      for (const p of cursed) { p.cash += p.cursed.reduce((s, c) => s + c.value, 0); p.cursed = []; }
      this.sync(); await this.pause(g, 3);
    }
    const r = this.ranking();
    this.setPhase('END', { step: 'ranks', ...r }); this.sfx('fanfare');
    await this.say(g, fill(L.SAY.winner, { name: r.ranks[0]?.name || 'Nobody', cash: money(r.ranks[0]?.cash || 0) }));
    await this.pause(g, 3);
    await this.say(g, L.SAY.goodnight);
  }
  ranking() {
    const ranks = this.standings().map((p) => ({ ...this.pub(p), cash: p.cash }));
    const awards = [];
    const sold = this.log.filter((l) => l.owner);
    const best = [...sold].sort((a, b) => b.profit - a.profit)[0]; const worst = [...sold].sort((a, b) => a.profit - b.profit)[0];
    if (best && best.profit > 0) awards.push({ title: 'Best buy', who: best.owner, text: `Locker ${best.n}: +AED ${money(best.profit)}` });
    if (worst && worst.profit < 0) awards.push({ title: 'Worst buy', who: worst.owner, text: `Locker ${worst.n}: -AED ${money(-worst.profit)}` });
    const bidder = [...this.players].sort((a, b) => b.bids - a.bids)[0]; if (bidder?.bids) awards.push({ title: 'Loudest paddle', who: bidder.id, text: `${bidder.bids} bids` });
    const shark = [...this.players].sort((a, b) => b.played - a.played)[0]; if (shark?.played) awards.push({ title: 'Card shark', who: shark.id, text: `${shark.played} power cards played` });
    return { ranks, awards: awards.slice(0, 4) };
  }

  // ------------------------------------------------------------ what players do
  act(pid, a) {
    const me = this.P(pid); if (!me) return { error: 'Not in a game' };
    this.lastActive = Date.now();
    const lk = this.lk;
    switch (a.type) {
      case 'bid': return this.bid(me, a.inc, a.at);
      case 'start': return this.start(pid);
      case 'again': this.playAgain(pid); return {};
      case 'menu': if (this.phase === 'END' && this.vip()?.id === pid) this.hooks.menu?.(); return {};
      case 'skip': this.skip(pid); return {};
      case 'addBot': if (this.phase === 'LOBBY' && this.vip()?.id === pid) return this.addBot(true); return {};
      case 'removeBots': if (this.phase === 'LOBBY' && this.vip()?.id === pid) this.removeBots(); return {};
      case 'kick': this.kick(pid, a.id); return {};
      case 'skipTutorial': if (this.phase === 'TUTORIAL' && this.vip()?.id === pid) { this.skipTut = true; this.cue = null; this.wake('skip'); } return {};
      case 'ready': if (this.phase === 'PEEK') { me.ready = true; this.check(); this.sync(); } return {};
      case 'card': return this.playCard(me, a.k, a.target);
      case 'block': return this.block(me, a.id);
      case 'bet': {
        if (this.phase !== 'BET' || this.d.step !== 'bet' || !lk || lk.owner === pid || me.bet) return {};
        if (me.cash < STAKE) return { error: `A bet costs AED ${STAKE}` };
        if (!['boom', 'bust', 'none'].includes(a.pick)) return {};
        me.bet = a.pick; if (a.pick !== 'none') lk.bets[pid] = a.pick; this.check(); this.sync(); return { ok: true };
      }
      case 'pass': if (this.phase === 'AFTER') { me.passed = true; this.check(); this.sync(); } return {};
      default: return {};
    }
  }

  // ------------------------------------------------------------ bots (test mode)
  botEstimate(b, lk) {
    const mult = lk.special === 'mega' ? 1.6 : lk.special === 'garage' ? 1.5 : 1;
    const seen = this.peekPub(b);
    const known = b.peek.map((pk) => { if (pk.fake) return pk.item.value; const it = lk.items.find((x) => x.uid === pk.uid); return it ? (it.look ? it.look.value : it.value) : 0; }).reduce((s, v) => s + Math.max(0, v), 0) + seen.filter((x) => x.sealed).length * 4000;
    let est = known + Math.max(0, lk.items.length - seen.length) * AVG_ITEM * mult;
    if (b.tip) est = (b.tip.lo + b.tip.hi) / 2;
    return Math.round(est * (0.65 + Math.random() * 0.45));
  }
  botsBid(lk) {
    const a = this.auc; const now = Date.now();
    for (const b of this.players.filter((p) => p.bot)) {
      if (now < b.nextBot || a.leader === b.id || (a.frozen[b.id] || 0) > now) continue;
      b.nextBot = now + ms((0.5 + Math.random() * 2.2) * BOT_PACE);
      const cap = Math.min(b.est, b.cash);
      // a few powers, now and then
      if (a.leader && a.leader !== 'phantom' && a.leader !== b.id && b.hand.some((c) => c.k === 'freeze') && Math.random() < 0.25) { this.playCard(b, 'freeze', a.leader); continue; }
      if (a.n > 0 && a.price < b.est * 0.5 && b.hand.some((c) => c.k === 'phantom') && Math.random() < 0.15) { this.playCard(b, 'phantom'); continue; }
      if (a.price + 500 > cap) continue;
      if (Math.random() < 0.35) continue; // hesitate
      const gap = cap - a.price;
      const inc = gap > 15000 && Math.random() < 0.35 ? 5000 : gap > 2500 ? 1000 : 500;
      if (a.price + inc <= cap) this.bid(b, inc, a.price);
    }
  }
  botTurn() {
    const bots = this.players.filter((p) => p.bot); if (!bots.length) return;
    const g = this.runId; const key = `${this.phase}|${this.d.step || ''}|${this.li}`; const lk = this.lk;
    const go = (fn, base = 1) => this.later(g, Math.round((base + Math.random() * 2) * 1000 * BOT_PACE * Math.min(1, SPEED * 4)), () => { if (`${this.phase}|${this.d.step || ''}|${this.li}` === key) fn(); });
    for (const b of bots) {
      const has = (k) => b.hand.some((c) => c.k === k);
      if (this.phase === 'PEEK') {
        go(() => { if (has('xray') && Math.random() < 0.5) this.playCard(b, 'xray'); if (has('tip') && Math.random() < 0.5) this.playCard(b, 'tip'); if (has('plant') && Math.random() < 0.35) this.playCard(b, 'plant'); this.act(b.id, { type: 'ready' }); }, 1.5);
      }
      if (this.phase === 'BET' && this.d.step === 'bet' && lk) {
        go(() => {
          if (has('steal') && lk.owner && lk.owner !== b.id && !lk.stolen && b.est > lk.price * 1.5 && b.cash >= this.stealPrice(lk) && Math.random() < 0.6) this.playCard(b, 'steal');
          if (lk.owner !== b.id) this.act(b.id, { type: 'bet', pick: b.cash >= STAKE + 3000 && Math.random() < 0.8 ? (b.est > lk.price ? 'boom' : 'bust') : 'none' });
        }, 1);
      }
      if (this.phase === 'AFTER' && lk) {
        go(() => {
          if (has('appraise') && this.cardUsable(b, 'appraise')) this.playCard(b, 'appraise');
          if (has('tax') && this.cardUsable(b, 'tax') && Math.random() < 0.8) this.playCard(b, 'tax');
          if (has('swap') && this.cardUsable(b, 'swap') && (this.bestFind(lk)?.value || 0) > 3000 && Math.random() < 0.6) this.playCard(b, 'swap');
          if (has('curse') && this.cardUsable(b, 'curse') && Math.random() < 0.9) { const t = this.standings().find((p) => p !== b); if (t) this.playCard(b, 'curse', t.id); }
          b.passed = true; this.check();
        }, 1);
      }
    }
  }

  // ------------------------------------------------------------ what each screen sees
  itemPub(it) { return it ? { uid: it.uid, name: it.name, img: PH(it.img), credit: photos.creditFor(it.img), cat: it.cat, rar: it.sealed ? 's' : it.rar, value: it.sealed ? null : it.value, line: it.line, sealed: !!it.sealed, back: !!it.back, legend: !!it.legend, appraised: !!it.appraised, swapped: !!it.swapped, was: it.look ? it.look.name : null, pct: it.pct || 0 } : null; }
  lockerPub() {
    const lk = this.lk; if (!lk) return null;
    const out = { n: lk.n, total: lk.total, origin: lk.origin, special: lk.special, count: lk.items.length, owner: lk.owner, price: lk.price, phantom: lk.phantom, stolen: lk.stolen, result: lk.result };
    if (['REVEAL', 'AFTER', 'RESULT'].includes(this.phase)) {
      out.shown = lk.items.slice(0, lk.shown).map((it) => this.itemPub(it));
      out.plants = lk.plants.slice(0, lk.plantShown || 0).map((p) => ({ by: p.by, item: { name: p.item.name, img: PH(p.item.img), cat: p.item.cat } }));
      out.verdict = lk.verdict || null; out.effects = lk.effects; out.projected = lk.owner ? this.projected(lk) : null;
      out.bets = lk.verdict && Object.values(lk.bets).some((b) => typeof b === 'object') ? lk.bets : null;
    }
    if (this.phase === 'BET') out.betCount = Object.keys(lk.bets).length;
    return out;
  }
  view(me) {
    const ph = this.phase; const d = this.d; const lk = this.lk;
    const v = {
      game: 'bc', phase: ph, step: d.step || null, code: this.code, endsAt: this.endsAt, now: Date.now(), vipId: this.vip()?.id, test: this.test,
      players: this.players.map((p) => ({ ...this.pub(p), connected: p.connected, bot: p.bot, cash: p.cash, cards: p.hand.length, cursed: p.cursed.length, sealed: p.sealed.length, ready: !!p.ready, bet: !!p.bet, passed: !!p.passed })),
      locker: this.lockerPub(), auc: ph === 'AUCTION' || ph === 'BET' ? this.aucPub() : null, splash: this.splash, fx: this.fx, x: {},
      rules: { start: START_CASH, stake: STAKE, inc: INC, hand: HAND, lockers: this.lockers.length || LOCKERS() },
    };
    const x = v.x;
    if (!me) {
      v.cue = this.cue; v.joinUrl = this.joinUrl; v.qr = this.qr; v.voiceOn = voice.enabled();
      // the TV warms up every picture in the locker while people peek
      if (lk && ['LOCKER', 'PEEK', 'AUCTION', 'BET'].includes(ph)) v.preload = [...lk.items.map((i) => PH(i.img)), ...lk.items.filter((i) => i.inner).map((i) => PH(i.inner.img)), ...lk.plants.map((p) => PH(p.item.img))].filter(Boolean);
    } else {
      v.me = { ...this.pub(me), vip: this.vip()?.id === me.id, cash: me.cash, notes: me.notes, ready: !!me.ready, bet: me.bet || null, passed: !!me.passed,
        hand: me.hand.map((c) => ({ id: c.id, k: c.k, usable: this.cardUsable(me, c.k) })),
        cursed: me.cursed.map((c) => ({ name: c.name, value: c.value })), sealed: me.sealed.map((s) => ({ name: s.name })), shelf: me.shelf.filter((s) => !s.gone).length,
        peek: ['PEEK', 'AUCTION', 'BET'].includes(ph) ? this.peekPub(me) : [], tip: me.tip,
        freeLock: !!me.freeLock, locks: (me.freeLock ? 1 : 0) + me.hand.filter((c) => c.k === 'lock').length,
        incoming: this.atk.filter((x) => x.target === me.id && !x.done).map((x) => ({ id: x.id, k: x.k, by: this.nameOf(x.by), until: x.until })) };
      if (lk && ph === 'BET') { x.canBet = lk.owner !== me.id && !me.bet && me.cash >= STAKE && d.step === 'bet'; x.stealPrice = lk.owner ? this.stealPrice(lk) : 0; }
    }
    if (ph === 'TUTORIAL') { x.slide = d.step; x.slides = L.TUTORIAL.length; x.key = L.TUTORIAL[d.step]?.key; x.title = L.TUTORIAL[d.step]?.title; }
    if (ph === 'FINALE') { x.step = d.step; x.who = d.who; x.box = d.box; x.inner = d.inner; x.bills = d.bills; }
    if (ph === 'END') { x.ranks = d.ranks; x.awards = d.awards; }
    if (ph === 'LOBBY') x.min = MIN;
    return v;
  }
}

module.exports = { BidCoin, CARDS };
