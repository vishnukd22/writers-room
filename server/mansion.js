'use strict';
// Last Night in the Mansion. Escape Hollowmere House together before your one candle burns out.
// A night: arrival, 5 rooms (each a different mini-game), 2 or 3 possessions, then the Front Door.
// Same engine pattern as the other games, plus a game clock that stops dead while the game is paused,
// so every room deadline can simply be stored in game time.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { ROOMS, rint, pick, shuffle } = require('./mn-rooms');
const { POSSESS } = require('./mn-possess');
const { SAY, ROOM_LINES, PX, STORY, ROOM_INTRO, M2 } = require('./mn-lines');
const { ROOMS2, MERCY2, POSSESS: POSSESS2 } = require('./mn-rooms2');
const PXR = require('./mn-px');
const voice = require('./voice');

const SPEED = Number(process.env.WR_SPEED || 1);
const ms = (s) => Math.max(30, Math.round(s * 1000 * SPEED));
const uid = () => crypto.randomBytes(6).toString('hex');
const clip = (s, n) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);
const fill = (t, o) => String(t).replace(/\{(\w+)\}/g, (_, k) => (o[k] ?? ''));
const line = (t, o = {}) => fill(Array.isArray(t) ? pick(t) : t, o);
const timeout = (p, t) => Promise.race([p, new Promise((r) => setTimeout(() => r(null), t))]);
const strip = voice.stripTags;
const fixedLines = (o) => (typeof o === 'string' ? (o.includes('{') ? [] : [o]) : o && typeof o === 'object' ? Object.values(o).flatMap(fixedLines) : []);
class Cancelled extends Error {}

const VOICE = () => voice.MN();
const COLORS = ['#F2C230', '#2FB36B', '#E5484D', '#3E8EDE', '#A970FF', '#FF8A3D', '#26C6C6', '#F06FB0'];
const BOT_NAMES = ['Ahmed', 'Bella', 'Carlos', 'Dina', 'Erik', 'Fatima', 'Gopal', 'Hana'];
const MIN = 2; const MAX = 8; const ROOMS_PER_NIGHT = 4;
const PX_KEYS = ['ice', 'cellar', 'dodge', 'chat'];
const NIGHT_KEYS = Object.keys(ROOMS2); const NIGHT_ROOMS = Math.min(5, NIGHT_KEYS.length);
const SCARES = { mild: 0, spooky: 3, nightmare: 5 };
const BURN = 0.035; // % of candle per second while a room or the door is in play
const TYPES = ['talk', 'timing', 'speed', 'memory'];
const SHAPES = [['◆', 'diamond'], ['▲', 'triangle'], ['●', 'circle'], ['■', 'square'], ['★', 'star'], ['✚', 'cross']];
const ORDN = ['FIRST', 'SECOND', 'THIRD'];

function bustPool() {
  let nums = [];
  try { nums = fs.readdirSync(path.join(__dirname, '..', 'public', 'assets', 'img')).map((f) => /^bust-(\d+)\.(png|jpe?g|webp)$/i.exec(f)).filter(Boolean).map((m) => Number(m[1])); } catch (e) { nums = []; }
  return nums.length >= 4 ? [...new Set(nums)].sort((a, b) => a - b) : [...Array(16).keys()].map((i) => i + 1);
}

// ------------------------------------------------------------------ the Front Door: everyone at once
const DOOR = {
  key: 'door', name: 'The Front Door', secs: 150,
  how: 'Fit the key, crack the lock, watch the ghosts, guard the flame. All at once.',
  setup(X, keys) {
    const s = X.cast(); const jobs = ['key', 'lock', 'lookout', 'flame']; const has = {};
    s.forEach((p) => { has[p.id] = []; });
    jobs.forEach((j, i) => { has[s[i % s.length].id].push(j); });
    // with more than 4 players, the extras get code digits to read out (and help the lookout)
    const missing = Math.max(0, 5 - keys);
    const code = [rint(0, 9), rint(0, 9), rint(0, 9)];
    const holders = s.filter((p) => !has[p.id].includes('lock')); const digits = new Map(s.map((p) => [p.id, []]));
    code.forEach((d, i) => { const who = holders.length ? holders[i % holders.length] : s[0]; digits.get(who.id).push(i); });
    s.forEach((p) => X.role(p, has[p.id][0] || 'helper', has[p.id].map((j) => ({ key: 'The Key', lock: 'The Lock', lookout: 'The Lookout', flame: 'The Flame' }[j])).join(' and ') || 'Helper'));
    return { has, missing, shape: pick(SHAPES), shapes: shuffle(SHAPES), code, dial: [0, 0, 0], open: false, digits,
      ghost: 'creep', gUntil: X.now() + 6000, frozenHits: {}, freezeAt: 0,
      gust: 'calm', wUntil: X.now() + 8000, shield: false, shieldSince: 0, gustHit: false };
  },
  jobs(st, p) { return st.has[p.id] || []; },
  phone(X, p, st) {
    const w = []; const jobs = DOOR.jobs(st, p); const lines = [];
    if (jobs.includes('key')) { w.push({ t: 'head', text: '🗝️ The Key' }); if (st.missing > 0) { w.push({ t: 'note', text: `${st.missing} key piece${st.missing > 1 ? 's' : ''} missing. Its shape is on the TV. Tap the matching piece.` }); w.push({ t: 'btns', cols: 3, act: 'shape', items: st.shapes.map(([e, n]) => ({ id: n, label: n, emoji: e })) }); } else w.push({ t: 'note', text: st.open ? 'The key is in. Hold on!' : 'The key is whole. Help the Lock.' }); lines.push('Fit the key'); }
    if (jobs.includes('lock')) { w.push({ t: 'head', text: '🔒 The Lock' }); w.push({ t: 'dials', act: 'dial', vals: st.dial }); w.push({ t: 'pad', act: 'try', label: st.open ? 'Unlocked!' : 'Try the lock' }); lines.push('Your friends have the three numbers'); }
    if (jobs.includes('lookout')) { w.push({ t: 'head', text: '👁️ The Lookout' }); w.push({ t: 'card', text: st.ghost === 'warn' ? 'THEY ARE TURNING!' : st.ghost === 'look' ? 'THEY ARE LOOKING' : 'The ghosts are creeping closer...', style: st.ghost === 'creep' ? 'plain' : 'alert' }); w.push({ t: 'pad', act: 'freeze', label: 'Shout FREEZE!', hot: st.ghost === 'warn' }); lines.push('Shout FREEZE when they turn'); }
    if (jobs.includes('flame')) { w.push({ t: 'head', text: '🕯️ The Flame' }); w.push({ t: 'card', text: st.gust === 'warn' ? 'A DRAUGHT IS COMING! HOLD!' : st.gust === 'gust' ? 'HOLD, HOLD, HOLD' : 'Still air. Let go of the shield.', style: st.gust === 'calm' ? 'plain' : 'alert' }); w.push({ t: 'pad', act: 'shield', hold: true, label: st.shield ? 'Shielding the flame' : 'Hold to shield the flame' }); lines.push('Hold the shield only during draughts'); }
    for (const i of st.digits.get(p.id) || []) w.push({ t: 'card', text: `The ${ORDN[i]} number is ${st.code[i]}`, sub: 'Tell the Lock.', style: 'page' });
    if (!w.length) w.push({ t: 'note', text: 'Help the others. Watch the ghosts on the TV.' });
    return { role: DOOR_ROLE(jobs), job: lines.join('. ') || 'Help however you can.', w };
  },
  tv(X, st) {
    return { w: [{ t: 'door', ghost: st.ghost, gust: st.gust, missing: st.missing, shape: st.shape[0], open: st.open, dial: st.dial, freeze: X.now() - st.freezeAt < 1600 }],
      prog: { v: (st.missing === 0 ? 1 : 0) + (st.open ? 1 : 0), max: 2, label: 'Key and lock' } };
  },
  act(X, p, a, st) {
    const jobs = DOOR.jobs(st, p);
    // moving while the ghosts look costs wax (once per look, per person). The Lookout and the Flame are allowed.
    if (st.ghost === 'look' && ['shape', 'dial', 'try'].includes(a.a) && !st.frozenHits[p.id]) { st.frozenHits[p.id] = true; X.drip(2, `The ghosts saw ${p.name} move`, p); X.sfx('mn-moan'); }
    if (a.a === 'shape' && jobs.includes('key') && st.missing > 0) {
      if (a.id === st.shape[1]) { st.missing--; X.sfx('mn-unlock'); if (st.missing > 0) { st.shape = pick(SHAPES.filter((x) => x !== st.shape)); st.shapes = shuffle(SHAPES); } DOOR.check(X, st); } else X.drip(3, 'That piece did not fit', p);
    }
    if (a.a === 'dial' && jobs.includes('lock') && !st.open) { const i = Number(a.i); if (i >= 0 && i < 3) { st.dial[i] = (st.dial[i] + (a.dir === 'down' ? 9 : 1)) % 10; X.sfx('mn-tick'); } }
    if (a.a === 'try' && jobs.includes('lock') && !st.open) { if (st.dial.every((d, i) => d === st.code[i])) { st.open = true; X.sfx('mn-unlock'); DOOR.check(X, st); } else X.drip(3, 'The lock did not budge', p); }
    if (a.a === 'freeze' && jobs.includes('lookout')) { st.freezeAt = X.now(); X.flashAll('freeze'); }
    if (a.a === 'down' && jobs.includes('flame')) { st.shield = true; st.shieldSince = X.now(); }
    if (a.a === 'up' && jobs.includes('flame')) st.shield = false;
  },
  check(X, st) { if (st.missing === 0 && st.open) X.win(); },
  tick(X, now, st) {
    if (now >= st.gUntil) {
      if (st.ghost === 'creep') { st.ghost = 'warn'; st.gUntil = now + 1600; } else if (st.ghost === 'warn') { st.ghost = 'look'; st.gUntil = now + 2200; st.frozenHits = {}; X.sfx('mn-whisper'); } else { st.ghost = 'creep'; st.gUntil = now + rint(5000, 9000); }
    }
    if (now >= st.wUntil) {
      if (st.gust === 'calm') { st.gust = 'warn'; st.wUntil = now + 2200; } else if (st.gust === 'warn') { st.gust = 'gust'; st.wUntil = now + 2600; st.gustHit = false; X.sfx('mn-wind'); } else { st.gust = 'calm'; st.wUntil = now + rint(6000, 10000); }
    }
    if (st.gust === 'gust' && !st.shield && !st.gustHit) { st.gustHit = true; X.drip(3, 'A draught hit the flame'); }
    if (st.gust === 'calm' && st.shield && now - st.shieldSince > 3500) { st.shieldSince = now; X.drip(1, 'The flame is choking under the shield'); }
  },
  bot(X, b, now, st) {
    const jobs = DOOR.jobs(st, b); const looking = st.ghost !== 'creep';
    if (jobs.includes('lookout') && st.ghost === 'warn' && X.once(b, `f${st.gUntil}`, 0.3)) { DOOR.act(X, b, { a: 'freeze' }, st); X.bubble(b, 'FREEZE!'); }
    if (jobs.includes('flame')) { const want = st.gust !== 'calm'; if (want && !st.shield) DOOR.act(X, b, { a: 'down' }, st); if (!want && st.shield) DOOR.act(X, b, { a: 'up' }, st); }
    for (const i of st.digits.get(b.id) || []) if (X.after(b, `d${i}`, 6 + i * 2, 9 + i * 2)) X.bubble(b, `The ${ORDN[i]} number is ${st.code[i]}.`);
    if (looking) return;
    if (jobs.includes('key') && st.missing > 0 && X.after(b, 'k', 3, 5)) DOOR.act(X, b, { a: 'shape', id: st.shape[1] }, st);
    if (jobs.includes('lock') && !st.open && X.after(b, 'l', 0.8, 1.4)) { const i = st.dial.findIndex((d, k) => d !== st.code[k]); if (i >= 0) DOOR.act(X, b, { a: 'dial', i, dir: 'up' }, st); else DOOR.act(X, b, { a: 'try' }, st); }
  },
};
const DOOR_ROLE = (jobs) => jobs.map((j) => ({ key: 'The Key', lock: 'The Lock', lookout: 'The Lookout', flame: 'The Flame' }[j])).join(' and ') || 'Helper';

class Mansion {
  constructor(code, hooks, opts = {}) {
    this.kind = 'mn'; this.code = code; this.hooks = hooks; this.test = !!opts.test;
    this.players = []; this.phase = 'LOBBY'; this.d = {}; this.endsAt = null; this.cue = null;
    this.runId = 0; this.waiter = null; this.lastActive = Date.now(); this.syncPending = false;
    this.fx = []; this.fxSeq = 0; this.timers = []; this.busts = bustPool();
    this.pausedMs = 0; this.recent = []; this.best = null; this.nights = 0;
    this.reset();
    [M2.welcome, M2.rules].forEach((t) => this.prefetch(t, true));
    [...fixedLines(M2), SAY.welcomeBots, SAY.lost].forEach((t) => this.prefetch(t)); // made while people join, so none arrive late
  }
  reset() { Object.assign(this, { candle: 100, keys: 0, roomN: 0, plan: [], active: null, results: [], scares: 0, scareBudget: rint(1, 2), scareFx: null, flash: null, warned: {}, dead: false, lastPossessed: null, usedPoss: [], end: null, addedBots: false, ctx: null, scareFx: null, bigScares: 0, vote: null, poss: null, nightPoss: 0, accuse: null }); }

  // ------------------------------------------------------------ plumbing (same as the other games)
  P(id) { return this.players.find((p) => p.id === id); }
  humans() { return this.players.filter((p) => !p.bot); }
  vip() { return this.humans().find((p) => p.connected) || this.humans()[0] || this.players[0]; }
  pub(p) { return p ? { id: p.id, name: p.name, color: p.color, bust: p.bust } : null; }
  nameOf(id) { return this.P(id)?.name || 'Someone'; }
  sync() {
    if (this.syncPending) return; this.syncPending = true;
    setTimeout(() => {
      this.syncPending = false;
      try { this.hooks.toHost(this.view(null)); for (const p of this.players) if (p.connected && !p.bot) this.hooks.toPlayer(p.id, this.view(p)); } catch (e) { console.error('mn sync', e); }
    }, 60);
  }
  progress() { this.lastProgress = Date.now(); }
  setPhase(phase, d = {}, seconds = null) { this.progress(); this.phase = phase; this.d = d; this.endsAt = seconds ? Date.now() + ms(seconds) : null; this.lastActive = Date.now(); this.sync(); }
  sfx(name) { this.fxSeq++; this.fx.push({ id: this.fxSeq, name }); if (this.fx.length > 14) this.fx.shift(); this.sync(); }
  guard(g) { if (g !== this.runId) throw new Cancelled(); }
  later(g, t, fn) { const h = setTimeout(() => { if (g !== this.runId) return; try { fn(); } catch (e) { console.error('mn timer', e); } }, Math.max(0, t)); this.timers.push(h); if (this.timers.length > 400) this.timers = this.timers.slice(-200); return h; }
  clearTimers() { this.timers.forEach(clearTimeout); this.timers = []; clearInterval(this.tickT); clearInterval(this.dog); this.active = null; }
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
  skip(byId) { if (byId && byId !== this.vip()?.id) return; if (this.phase === 'LOBBY' || !this.sayCue) return; this.cue = null; this.wake('skip'); }
  hold(g, s) { return this.wait(ms(s)).then(() => this.guard(g)); }
  note(p, text, kind = 'info') { if (!p || p.bot) return; p.noteSeq++; p.notes.push({ id: p.noteSeq, text, kind }); if (p.notes.length > 4) p.notes.shift(); }
  // the game clock: real time minus every second spent paused
  clock() { return Date.now() - this.pausedMs - (this.pauseInfo ? Date.now() - this.pauseInfo.at : 0); }
  wall(t) { return t == null ? null : t + (Date.now() - this.clock()); }
  shiftClock(dt) { this.pausedMs += dt; }

  // ------------------------------------------------------------ Mortimer
  // Mortimer uses the expressive voice model so his acting directions ([whispers], [chuckles]) work
  prefetch(text, urgent) { return voice.get(text, VOICE(), urgent, false).catch(() => null); }
  estimate(text) { return Math.min(20000, 700 + strip(text).length * 62); }
  async makeCue(text, opts = {}) {
    let audioId = null;
    if (voice.enabled()) audioId = await timeout(this.prefetch(text, opts.urgent !== false), opts.maxWait || 7000);
    return { id: uid(), text: strip(text), speak: strip(text), audio: audioId ? `/audio/${audioId}` : null, kind: 'host', who: null };
  }
  async say(g, text, opts = {}) {
    if (!strip(text)) return 'empty';
    const cue = await this.makeCue(text, opts); this.guard(g);
    this.cue = cue; this.cueDone = null; this.sync();
    const est = this.estimate(text); this.progress(); this.sayCue = cue.id;
    const r = await this.wait(cue.audio ? est * 1.7 + 3000 : est * 1.6 + 2500, () => this.cueDone === cue.id);
    this.sayCue = null; this.guard(g);
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
    if (/^mortimer$/i.test(name)) return { error: 'There is only one Mortimer.' };
    const same = this.players.find((x) => x.name.toLowerCase() === name.toLowerCase());
    if (same && !same.bot && !same.connected) { same.token = uid(); return { player: same }; }
    if (same) return { error: 'That name is taken' };
    if (this.phase !== 'LOBBY') return { error: 'The night has already started. Wait for the next one.' };
    if (this.players.length >= MAX) return { error: `The house is full (${MAX} guests)` };
    const p = this.newPlayer(name, false); this.players.push(p); this.sync();
    return { player: p };
  }
  newPlayer(name, bot) {
    const used = new Set(this.players.map((x) => x.color));
    const free = this.busts.filter((b) => !this.players.some((x) => x.bust === b));
    return { id: uid(), token: uid(), name, color: COLORS.find((c) => !used.has(c)) || pick(COLORS), connected: true, bot, bust: free.length ? pick(free) : pick(this.busts), notes: [], noteSeq: 0, ...this.fresh() };
  }
  fresh() { return { lastSlip: 0, slips: 0, possWins: 0, possFails: 0, mx: {}, buzz: null, buzzSeq: 0 }; }
  addBot(fromVip = false) {
    if ((!this.test && !fromVip) || this.phase !== 'LOBBY' || this.players.length >= MAX) return { error: 'No room for more guests' };
    const name = BOT_NAMES.find((n) => !this.players.some((p) => p.name === n)) || `Guest ${this.players.length + 1}`;
    this.players.push(this.newPlayer(name, true)); this.sync(); return { ok: true };
  }
  removeBots() { if (this.phase !== 'LOBBY') return; this.players = this.players.filter((p) => !p.bot); this.sync(); }
  setConnected(id, on) { const p = this.P(id); if (p) { p.connected = on; this.lastActive = Date.now(); this.check(); this.sync(); } }
  setBust(id, n) {
    const p = this.P(id); n = Number(n);
    if (!p || p.house || !this.busts.includes(n) || this.players.some((x) => x !== p && x.bust === n)) return { error: 'Someone already picked that one' };
    p.bust = n; this.sync(); return { ok: true };
  }
  kick(byId, target) { if (this.phase !== 'LOBBY' || this.vip()?.id !== byId) return; this.players = this.players.filter((p) => p.id !== target); this.hooks.kicked?.(target); this.sync(); }

  start(byId) {
    if (byId && this.vip()?.id !== byId) return { error: 'Only the first player can start' };
    if (this.phase !== 'LOBBY') return {};
    this.players = this.players.filter((p) => p.connected);
    const humans = this.humans().length;
    if (this.players.length < MIN || (!this.test && humans < 1)) return { error: `You need at least ${MIN} guests${this.test ? '. Add some bots on the TV.' : '. Add a bot from the first phone.'}` };
    this.reset();
    // with only two people, two more "guests" fill the extra jobs
    if (humans === 2 && this.players.length === 2) { this.addBot(true); this.addBot(true); this.addedBots = true; }
    this.players.forEach((p) => Object.assign(p, this.fresh()));
    const g = ++this.runId;
    this.startWatchdog(g);
    this.lastTick = this.clock();
    clearInterval(this.tickT); this.tickT = setInterval(() => { if (g !== this.runId) { clearInterval(this.tickT); return; } try { this.tick(); } catch (e) { console.error('mn tick', e); } }, 200);
    this.run(g).catch((e) => { if (!(e instanceof Cancelled)) { console.error('mn run error', e); this.active = null; this.endNight(false); } });
    return {};
  }
  playAgain(byId) {
    if (this.phase !== 'END' || this.vip()?.id !== byId) return;
    this.runId++; this.clearTimers(); this.players = this.players.filter((p) => p.connected && !(p.bot && this.addedBots));
    this.players.forEach((p) => Object.assign(p, this.fresh()));
    this.cue = null; this.reset(); this.setPhase('LOBBY', {});
  }
  startWatchdog(g) {
    clearInterval(this.dog); this.progress();
    this.dog = setInterval(() => {
      if (g !== this.runId || this.phase === 'END' || this.phase === 'LOBBY') { clearInterval(this.dog); return; }
      if (this.pauseInfo) { this.progress(); return; }
      if (Date.now() - this.lastProgress > 120000) { console.error(`mn ${this.code}: stuck in ${this.phase}, moving on`); this.progress(); this.cue = null; if (this.active) this.active.R.done = this.active.R.done || 'fail'; this.wake('watchdog'); this.sync(); }
    }, 5000);
  }

  // ------------------------------------------------------------ the candle and the helpers every room uses
  drip(amt, why, p) {
    if (!amt) return;
    // one player mashing the wrong button only pays once every 1.2 seconds
    if (p && why) { const t = this.clock(); if (t - (p.lastSlip || 0) < 1200) return; p.lastSlip = t; }
    this.candle = Math.max(0, this.candle - amt);
    const R = this.active?.R; if (p) p.slips += amt;
    if (R && why) { R.events.push({ id: ++R.evSeq, text: `-${Math.round(amt)}% ${why}`, at: Date.now() }); if (R.events.length > 3) R.events.shift(); }
    if (why) this.sfx('mn-drip');
    if (this.candle <= 0) { this.dead = true; if (this.active) this.active.R.done = 'dead'; this.wake('dead'); }
  }
  gain(amt) { this.candle = Math.min(100, this.candle + amt); }
  bubble(p, text) { const R = this.active?.R; if (!R || !p) return; R.bubbles.push({ id: ++R.evSeq, pid: p.id, text: clip(text, 120), at: Date.now() }); if (R.bubbles.length > 3) R.bubbles.shift(); }
  buzz(p, kind) { if (!p || p.bot) return; p.buzzSeq++; p.buzz = { id: p.buzzSeq, kind }; }
  makeX(R) {
    const G = this;
    const X = {
      R, seats: G.players, n: G.players.length, level: R.level || 1,
      P: (id) => G.P(id), now: () => G.clock(), wall: (t) => G.wall(t), gameTime: (w) => w - (Date.now() - G.clock()),
      // a round can only drain so much, however wildly people tap
      drip: (a, why, p) => { if (R.dripCap != null) { if ((R.dripped || 0) >= R.dripCap) return; R.dripped = (R.dripped || 0) + a; } G.drip(a, why, p); }, gain: (a) => G.gain(a), win: () => { if (!R.done) R.done = 'win'; G.wake('done'); }, fail: () => { if (!R.done) R.done = 'fail'; G.wake('done'); },
      bubble: (p, t) => G.bubble(p, t), sfx: (n) => G.sfx(n), note: (p, t, k) => G.note(p, t, k), buzz: (p, k) => G.buzz(p, k),
      flashAll: (k) => { G.flash = { id: (G.flash?.id || 0) + 1, kind: k }; },
      scare: (kind, id) => G.scareNow(kind, id),
      role: (p, key, label) => { if (p) R.roles[p.id] = { key, label }; }, roleOf: (p) => R.roles[p.id]?.key, ofRole: (k) => G.players.filter((p) => R.roles[p.id]?.key === k),
      // humans get the jobs that need doing first; bots fill the rest and "speak" on the TV
      cast: () => [...shuffle(G.players.filter((p) => !p.bot)), ...shuffle(G.players.filter((p) => p.bot))],
      after: (b, tag, lo, hi) => { const now = G.clock(); if (b.mx[tag] == null) b.mx[tag] = now + (lo + Math.random() * (hi - lo)) * 1000 * Math.max(0.2, SPEED); if (now >= b.mx[tag]) { delete b.mx[tag]; return true; } return false; },
      once: (b, tag, delay) => { const k = `once:${tag}`; const now = G.clock(); if (b.mx[k] === 'done') return false; if (b.mx[k] == null) b.mx[k] = now + delay * 1000 * Math.max(0.2, SPEED); if (now >= b.mx[k]) { b.mx[k] = 'done'; return true; } return false; },
    };
    return X;
  }

  tick() {
    if (this.pauseInfo) return;
    const now = this.clock(); const dt = Math.min(1000, now - (this.lastTick || now)); this.lastTick = now;
    const A = this.active; if (!A) return;
    const { X, R, def } = A;
    if (A.px) return this.pxTick(A, now, dt);
    if (R.burn) { this.candle = Math.max(0, this.candle - BURN * dt / 1000); if (this.candle <= 0 && !this.dead) { this.dead = true; R.done = 'dead'; this.wake('dead'); } }
    if (R.done) return;
    try { def.tick?.(X, now, R.st, dt); } catch (e) { console.error('mn room tick', R.key, e); }
    for (const b of this.players.filter((p) => p.bot)) { try { def.bot?.(X, b, now, R.st); } catch (e) { console.error('mn bot', R.key, e); } }
    if (!R.done && now >= R.ends) { if (def.timeout) def.timeout(X, R.st); else R.done = 'fail'; if (!R.done) R.done = 'fail'; this.wake('time'); }
    this.progress(); this.sync();
  }

  // ------------------------------------------------------------ the night
  pickRooms() {
    // 5 rooms, at least 4 kinds, never the same kind twice in a row, avoiding last night's rooms
    const order = shuffle(TYPES); order.push(pick(['talk', 'timing', 'talk'])); let seq;
    for (let t = 0; t < 50; t++) { seq = shuffle(order); if (seq.every((x, i) => i === 0 || x !== seq[i - 1])) break; }
    const used = new Set();
    return seq.map((type) => { const pool = Object.values(ROOMS).filter((r) => r.type === type && !used.has(r.key)); const fresh = pool.filter((r) => !this.recent.includes(r.key)); const r = pick(fresh.length ? fresh : pool); used.add(r.key); return r.key; });
  }
  async run(g) {
    this.nights++;
    this.setPhase('INTRO', { step: 'door' }); this.sfx('mn-slam');
    await this.hold(g, 1.5);
    this.setPhase('INTRO', { step: 'welcome' });
    await this.say(g, M2.welcome);
    if (this.addedBots) await this.say(g, SAY.welcomeBots);
    await this.say(g, M2.rules);
    this.sfx('mn-candle-light');
    this.ctx = { todo: shuffle(NIGHT_KEYS), done: [], keys: 0, mercyUsed: false, played: [] };
    for (let i = 0; i < NIGHT_ROOMS; i++) {
      let key = await this.doors(g, i);
      if (key === 'mercy') { await this.mercy2(g); key = await this.doors(g, i); }
      await this.room2(g, key);
      if (this.dead) return this.endNight(false, g);
    }
    await this.collapse(g);
  }
  // ------------------------------------------------------------ scares
  // big: the TV and every phone. personal: one phone. Scare level (picked in the lobby) limits them.
  scareNow(kind, target) {
    const lvl = this.scareLevel || 'spooky';
    if (kind !== 'personal' && this.bigScares >= SCARES[lvl]) return false;
    if (kind !== 'personal') this.bigScares++;
    if (target) { const p = this.P(target); if (p) p.scared = (p.scared || 0) + 1; }
    const id = (this.scareFx?.id || 0) + 1;
    const img = `mn-scare-${rint(1, 4)}`;
    const face = lvl !== 'mild';
    const variant = kind === 'big' ? pick(['flash', 'lights', 'fake']) : kind;
    this.scareFx = { id, kind: variant, img, target: target || null, face, until: this.clock() + (variant === 'lights' || variant === 'fake' ? 4200 : 1800), name: target ? this.P(target)?.name : null };
    if (kind !== 'personal') this.sfx(variant === 'flash' ? 'mn-scare' : 'mn-whisper');
    this.sync(); return true;
  }
  async bigScare(g) {
    if (!this.scareNow('big')) return;
    await this.hold(g, this.scareFx.kind === 'flash' ? 1.4 : 4.4);
    this.sayOver(g, line(M2.afterScare)); await this.hold(g, 1.2);
  }
  // ------------------------------------------------------------ choosing a door
  async doors(g, i) {
    const c = this.ctx; let opts = c.todo.slice(0, 2);
    const mercy = this.candle < 30 && !c.mercyUsed; if (mercy) opts = [...opts, 'mercy'];
    let choice = opts[0];
    if (opts.length > 1) {
      this.vote = { opts, votes: {}, until: this.clock() + ms(14) };
      this.setPhase('DOORS', { step: 'vote' }); this.sfx('mn-creak');
      this.sayOver(g, mercy ? M2.mercyDoor : line(M2.doors));
      const voters = () => this.players.filter((p) => p.connected && !p.bot);
      while (this.clock() < this.vote.until && !(voters().length && voters().every((p) => this.vote.votes[p.id]))) {
        // bots vote too, a little later
        this.players.filter((p) => p.bot && !this.vote.votes[p.id] && Math.random() < 0.08).forEach((p) => { this.vote.votes[p.id] = pick(opts.filter((o) => o !== 'mercy')); });
        await this.wait(250); this.guard(g); this.sync();
      }
      const tally = {}; Object.values(this.vote.votes).forEach((k) => { tally[k] = (tally[k] || 0) + 1; });
      const best = Math.max(0, ...Object.values(tally)); const top = opts.filter((o) => (tally[o] || 0) === best);
      choice = pick(top); this.vote.choice = choice; this.vote.tally = tally;
      this.setPhase('DOORS', { step: 'chosen' }); this.sfx('mn-unlock'); await this.hold(g, 2.2);
    } else { this.vote = { opts, votes: {}, choice }; this.setPhase('DOORS', { step: 'chosen' }); this.sayOver(g, M2.lastDoor); await this.hold(g, 3); }
    if (choice !== 'mercy' && i > 0 && Math.random() < 0.45) await this.bigScare(g);
    return choice;
  }
  // ------------------------------------------------------------ a room: the goal, then two rounds
  async room2(g, key) {
    const def = ROOMS2[key]; const R = this.pxR(key); const X = this.makeX(R); this.active = { px: true, def, X, R };
    const c = this.ctx; c.todo = c.todo.filter((k) => k !== key); this.roomN = c.done.length + 1;
    this.setPhase('PX', { step: 'intro', key }); this.sfx(pick(['mn-creak', 'mn-creak2']));
    await this.say(g, M2.intro[key] || M2.intro2[key]); await this.hold(g, 2.5);
    let wins = 0;
    for (const n of [1, 2]) {
      // round two of some rooms: one player is secretly possessed
      const humans = this.players.filter((p) => !p.bot && p.connected);
      if (n === 2 && POSSESS2[key] && this.nightPoss < 2 && humans.length >= 2 && this.players.length >= 3 && Math.random() < 0.6) { const who = pick(humans); this.poss = { id: who.id, key, power: POSSESS2[key].power }; R.possId = who.id; this.nightPoss++; }
      this.setPhase('PX', { step: 'ready', key, kind: n }); this.sayOver(g, R.possId && n === 2 ? M2.possessed : M2.round[n]); await this.hold(g, R.possId && n === 2 ? 4.5 : 2.5);
      const res = await this.pxStage(g, def, n, 'play');
      if (this.dead) { this.active = null; return; }
      if (res === 'win') { wins++; this.gain(3); this.sfx('mn-clear'); this.setPhase('PX', { step: 'won', key, kind: n }); this.sayOver(g, line(M2.win)); }
      else { this.drip(6, null); this.sfx('mn-fail'); this.setPhase('PX', { step: 'lost', key, kind: n }); this.sayOver(g, line(M2.fail)); }
      if (this.dead) { this.active = null; return; }
      await this.hold(g, 3);
      if (n === 2 && this.poss) await this.accuseVote(g);
    }
    const gotKey = wins >= 1; if (gotKey) { c.keys++; this.keys++; }
    c.done.push(key); c.played.push(key); this.results.push({ key, win: gotKey, wins });
    this.setPhase('PX', { step: 'result', key, wins, gotKey }); this.sfx(gotKey ? 'mn-unlock' : 'mn-fail');
    await this.say(g, line(gotKey ? M2.key : M2.noKey));
    this.active = null;
    if (this.candle < 50 && !this.warned.half) { this.warned.half = true; await this.say(g, M2.candleHalf); }
    if (this.candle < 20 && !this.warned.low) { this.warned.low = true; await this.say(g, M2.candleLow); }
  }
  async accuseVote(g) {
    const poss = this.poss; this.accuse = { votes: {}, until: this.clock() + ms(14), id: poss.id };
    this.setPhase('ACCUSE', { step: 'vote' }); this.sayOver(g, M2.accuse);
    const voters = () => this.players.filter((p) => p.connected && !p.bot);
    while (this.clock() < this.accuse.until && !(voters().every((p) => this.accuse.votes[p.id]))) {
      this.players.filter((p) => p.bot && !this.accuse.votes[p.id] && Math.random() < 0.1).forEach((p) => { this.accuse.votes[p.id] = pick(this.players.filter((o) => o.id !== p.id)).id; });
      await this.wait(250); this.guard(g); this.sync();
    }
    const tally = {}; Object.values(this.accuse.votes).forEach((id) => { tally[id] = (tally[id] || 0) + 1; });
    const best = Math.max(0, ...Object.values(tally)); const top = Object.keys(tally).filter((id) => tally[id] === best);
    const caught = top.length === 1 && top[0] === poss.id; this.accuse.caught = caught; this.accuse.tally = tally;
    if (caught) { this.gain(6); this.sfx('mn-clear'); } else { this.drip(4, null); this.sfx('mn-giggle'); }
    this.setPhase('ACCUSE', { step: 'reveal' }); await this.say(g, line(caught ? M2.caught : M2.missed)); await this.hold(g, 1.5);
    this.poss = null; this.accuse = null;
  }
  async mercy2(g) {
    this.ctx.mercyUsed = true; const def = MERCY2; const R = this.pxR('mercy'); const X = this.makeX(R); this.active = { px: true, def, X, R };
    this.setPhase('PX', { step: 'intro', key: 'mercy' }); await this.say(g, M2.intro.mercy);
    await this.pxStage(g, def, 1, 'play');
    this.setPhase('PX', { step: 'result', key: 'mercy', gained: Math.round((R.st.fed / 1000) * 1.5) }); this.sfx('mn-candle-light'); await this.hold(g, 2.5);
    this.active = null;
  }
  // ------------------------------------------------------------ the finale: every room again, fast, while the house falls down
  async collapse(g) {
    this.setPhase('COLLAPSE', { step: 'intro' }); this.sfx('mn-thunder');
    if (this.ctx.keys) this.gain(this.ctx.keys * 4);
    await this.say(g, M2.collapse);
    const list = this.ctx.played.slice(0, 4);
    for (let i = 0; i < list.length; i++) {
      const key = list[i]; const def = ROOMS2[key]; const R = this.pxR(key); const X = this.makeX(R); this.active = { px: true, def, X, R };
      this.setPhase('COLLAPSE', { step: 'quake', key, n: i + 1, of: list.length }); this.sfx(pick(['mn-thunder', 'mn-chains', 'mn-floor']));
      this.sayOver(g, line(M2.quake)); await this.hold(g, 2.5);
      if (i === 1) await this.bigScare(g);
      const res = await this.pxStage(g, def, 'quick', 'play', { key, n: i + 1, of: list.length });
      if (this.dead) { this.active = null; return this.endNight(false, g); }
      if (res !== 'win') { this.drip(8, null); this.sfx('mn-fail'); } else this.sfx('mn-clear');
      if (this.dead) { this.active = null; return this.endNight(false, g); }
    }
    this.active = null;
    this.setPhase('COLLAPSE', { step: 'door' }); await this.hold(g, 1.5);
    if (this.scareNow('big')) await this.hold(g, 1.6);
    await this.endNight(!this.dead, g);
  }
  // ------------------------------------------------------------ the 8-bit house
  pxR(key) { return { key, roles: {}, bubbles: [], events: [], evSeq: 0, done: null, burn: false, ends: Infinity, st: null }; }
  pxTick(A, now, dt) {
    const { X, R, def } = A; const st = R.st; if (!st) return;
    if (R.burn) { this.candle = Math.max(0, this.candle - BURN * dt / 1000); if (this.candle <= 0 && !this.dead) { this.dead = true; this.wake('dead'); } }
    if (!['play', 'walk', 'practice', 'demo'].includes(this.d.step)) return;
    if (!st.done) {
      try { def.tick?.(X, st, now, dt); } catch (e) { console.error('mn px tick', R.key, e); }
      const bots = this.d.step === 'demo' ? [PXR.GHOST] : this.players.filter((p) => p.bot || (!p.connected && R.key !== 'hub'));
      for (const b of bots) { try { def.bot?.(X, b, st, now); } catch (e) { console.error('mn px bot', R.key, e); } }
      if (!st.done && now >= R.ends) st.done = st.timeout || 'fail';
      if (st.done) this.wake('done');
    }
    this.progress(); this.sync();
  }
  async pxStage(g, def, kind, step, extra = {}) {
    const A = this.active; const { X, R } = A;
    PXR.GHOST.mx = {}; this.players.forEach((p) => { p.mx = {}; });
    const arg = kind === 'boss' || kind === 'hub' ? this.ctx : kind;
    R.dripped = 0; R.dripCap = kind === 'quick' ? 8 : 14;
    R.st = def.make(X, arg); R.st.t0 = this.clock(); R.kind = kind; if (R.possId && kind === 2) R.st.poss = R.possId;
    const secs = def.secs ? def.secs[kind] || 120 : 9999;
    // stage clocks run in real seconds: the attacks and puzzles are played at real speed even in quick tests
    R.start = this.clock(); R.ends = R.start + secs * 1000;
    R.burn = typeof kind === 'number' && def !== PXR.MERCY || kind === 'boss';
    this.setPhase(this.phase, { ...this.d, step, kind, ...extra });
    while (!R.st.done && !this.dead) { await this.wait(400, () => !!R.st.done || this.dead); this.guard(g); }
    R.burn = false;
    return R.st.done;
  }
  async hub(g) {
    const R = this.pxR('hub'); const X = this.makeX(R); this.active = { px: true, def: PXR.HUB, X, R };
    const c = this.ctx; c.mercy = this.candle < 30 && !c.mercyUsed; c.visits++;
    this.setPhase('HUB', { step: 'walk' });
    const line0 = c.visits === 1 ? PX.hubFirst : c.left === 0 ? PX.hubFront : c.mercy ? PX.hubMercy : line(PX.hubAgain);
    this.sayOver(g, line0);
    // after a while, Mortimer picks for you
    const st = PXR.HUB.make(X, c); R.st = st; R.st.t0 = this.clock(); R.start = this.clock(); R.ends = R.start + ms(c.visits === 1 ? 90 : 70);
    st.timeout = 'slow';
    while (!st.done && !st.chosen) { await this.wait(300, () => !!st.chosen || !!st.done); this.guard(g); }
    let choice = st.chosen;
    if (!choice) { choice = c.left === 0 ? 'front' : st.zone && st.zone !== 'front' ? st.zone : PXR.pick(c.todo); st.chosen = choice; await this.say(g, PX.hubSlow); }
    this.sfx('mn-creak');
    if (choice === 'front' && c.left > 0) choice = PXR.pick(c.todo);
    return choice;
  }
  async pxRoom(g, key) {
    const def = PXR.PX_ROOMS[key]; const R = this.pxR(key); const X = this.makeX(R); this.active = { px: true, def, X, R };
    this.roomN = this.ctx.done.length + 1;
    this.setPhase('PX', { step: 'intro', key }); this.sfx(pick(['mn-creak', 'mn-creak2']));
    await this.say(g, ROOM_INTRO[key]);
    // the demo: Mortimer's ghost plays while he explains
    this.sayOver(g, PX.demo[key]);
    const t0 = this.clock(); await this.pxStage(g, def, 'demo', 'demo');
    while (this.cue && this.clock() - t0 < 25000) { await this.wait(300); this.guard(g); }
    // practice
    this.setPhase('PX', { step: 'ready', key, kind: 'practice' }); this.sayOver(g, line(PX.practice)); await this.hold(g, 3);
    await this.pxStage(g, def, 'practice', 'practice');
    let wins = 0;
    for (const n of [1, 2, 3]) {
      this.setPhase('PX', { step: 'ready', key, kind: n }); this.sayOver(g, PX.stage[n]); await this.hold(g, 3);
      const res = await this.pxStage(g, def, n, 'play');
      if (this.dead) { this.active = null; return; }
      if (res === 'win') { wins++; this.gain(2); this.sfx('px-clear'); this.setPhase('PX', { step: 'won', key, kind: n }); this.sayOver(g, line(PX.stageWin)); }
      else { this.drip(6, null); this.sfx('px-fail'); this.setPhase('PX', { step: 'lost', key, kind: n }); this.sayOver(g, line(PX.stageFail)); }
      if (this.dead) { this.active = null; return; }
      await this.hold(g, 3);
    }
    const gotKey = wins >= 2; const c = this.ctx;
    if (gotKey) { c.keys++; this.keys++; }
    c.done.push(key); c.todo = c.todo.filter((k) => k !== key); c.left = c.todo.length; c.memories.push(key);
    this.results.push({ key, win: gotKey, wins });
    this.setPhase('PX', { step: 'result', key, wins, gotKey }); this.sfx(gotKey ? 'mn-clear' : 'mn-fail');
    await this.say(g, line(gotKey ? PX.roomKey : PX.roomNoKey));
    this.active = null;
    await this.candleWarn(g);
  }
  async story(g, key) {
    this.setPhase('STORY', { key }); this.sfx('mn-page');
    await this.say(g, STORY[key]); await this.hold(g, 1);
  }
  async mercyRoom(g) {
    const c = this.ctx; c.mercyUsed = true; c.mercy = false;
    const def = PXR.MERCY; const R = this.pxR('mercy'); const X = this.makeX(R); this.active = { px: true, def, X, R };
    this.setPhase('PX', { step: 'intro', key: 'mercy' });
    await this.say(g, PX.mercy);
    await this.pxStage(g, def, 1, 'play');
    this.setPhase('PX', { step: 'result', key: 'mercy', gained: R.st.gained }); this.sfx('px-heal'); await this.hold(g, 2.5);
    this.active = null;
  }
  async boss(g) {
    const def = PXR.BOSS; const R = this.pxR('boss'); const X = this.makeX(R); this.active = { px: true, def, X, R };
    this.roomN = 5;
    this.setPhase('BOSS', { step: 'intro' }); this.sfx('mn-thunder');
    await this.say(g, PX.boss);
    await this.say(g, PX.bossKeys[this.ctx.keys] || PX.bossKeys.low);
    const res = await this.pxStage(g, def, 'boss', 'play');
    this.active = null;
    await this.endNight(res === 'win' && !this.dead, g);
  }
  async play(g, R, def) {
    const X = this.makeX(R); R.st = def.setup(X, this.keys, R.who); this.active = { X, R, def };
    return X;
  }
  async room(g, key, level) {
    const def = ROOMS[key]; this.roomN = level;
    const R = { key, level, roles: {}, bubbles: [], events: [], evSeq: 0, done: null, burn: false, ends: Infinity };
    this.players.forEach((p) => { p.mx = {}; });
    this.setPhase('ROOM', { step: 'intro', key }); this.sfx(pick(['mn-creak', 'mn-creak2']));
    const X = await this.play(g, R, def);
    await this.say(g, ROOM_LINES[key]);
    this.setPhase('ROOM', { step: 'jobs', key }); this.sfx('mn-page');
    this.sayOver(g, line(SAY.jobs));
    await this.hold(g, 7);
    const secs = def.secs * (this.players.length > 5 ? 1.1 : 1);
    R.start = this.clock(); R.ends = R.start + secs * 1000 * SPEED; R.burn = true;
    this.setPhase('ROOM', { step: 'play', key });
    while (!R.done) { await this.wait(400, () => !!R.done); this.guard(g); }
    R.burn = false;
    const left = Math.max(0, R.ends - this.clock()) / (secs * 1000 * SPEED);
    this.active = { ...this.active, R }; // keep showing the room while we react
    if (R.done === 'dead') { this.active = null; return; }
    if (R.done === 'win') {
      this.keys++; this.gain(2 + 6 * left); this.sfx('mn-clear');
      this.setPhase('ROOM', { step: 'win', key, left });
      await this.say(g, line(left > 0.45 ? SAY.winFast : SAY.win));
    } else {
      this.drip(15, null); this.sfx('mn-fail');
      this.setPhase('ROOM', { step: 'fail', key });
      if (this.scares < this.scareBudget && Math.random() < 0.5) await this.jumpScare(g);
      if (this.dead) { this.active = null; return; }
      await this.say(g, line(SAY.fail));
    }
    this.results.push({ key, win: R.done === 'win' });
    this.active = null;
    await this.candleWarn(g);
  }
  async candleWarn(g) {
    if (this.candle < 50 && !this.warned.half) { this.warned.half = true; await this.say(g, SAY.candleHalf); }
    if (this.candle < 20 && !this.warned.low) { this.warned.low = true; await this.say(g, SAY.candleLow); }
  }
  async jumpScare(g) {
    this.scares++; this.scareFx = { id: this.scares, img: `mn-scare-${rint(1, 4)}` };
    this.flash = { id: (this.flash?.id || 0) + 1, kind: 'scare' };
    this.sfx('mn-scare'); this.sync();
    await this.hold(g, 1.1);
    this.scareFx = null; this.sync();
    this.sayOver(g, line(SAY.scare));
    await this.hold(g, 1.5);
  }
  async possession(g) {
    const humans = this.humans().filter((p) => p.connected);
    const pool = humans.filter((p) => p.id !== this.lastPossessed); const who = pick(pool.length ? pool : humans.length ? humans : this.players);
    this.lastPossessed = who.id;
    const keys = Object.keys(POSSESS).filter((k) => !this.usedPoss.includes(k)); const key = pick(keys.length ? keys : Object.keys(POSSESS)); this.usedPoss.push(key);
    const def = POSSESS[key];
    this.setPhase('POSSESS', { step: 'dark', who: who.id, key });
    await this.hold(g, 1);
    if (this.scares < this.scareBudget && this.scares === 0) await this.jumpScare(g);
    this.setPhase('POSSESS', { step: 'chosen', who: who.id, key }); this.sfx('mn-breath');
    await this.say(g, fill(SAY.possessIntro, { name: who.name }));
    this.sayOver(g, fill(SAY.possessWatch, { name: who.name }));
    const R = { key, level: 1, roles: {}, bubbles: [], events: [], evSeq: 0, done: null, burn: false, ends: Infinity, who: who.id };
    this.players.forEach((p) => { p.mx = {}; });
    this.setPhase('POSSESS', { step: 'ready', who: who.id, key });
    const X = this.makeX(R); R.st = def.setup(X, who); this.active = { X, R, def };
    await this.hold(g, 3);
    R.start = this.clock(); R.ends = R.start + def.secs * 1000; this.buzz(who, 'possess');
    this.setPhase('POSSESS', { step: 'play', who: who.id, key });
    // bots only get possessed when there is nobody else; they muddle through
    while (!R.done) { await this.wait(400, () => !!R.done); this.guard(g); if (who.bot && !R.done && Math.random() < 0.08) R.done = Math.random() < 0.5 ? 'win' : 'fail'; }
    this.active = null;
    if (R.done === 'win') { who.possWins++; this.gain(10); this.sfx('mn-clear'); this.setPhase('POSSESS', { step: 'win', who: who.id, key }); await this.say(g, line(SAY.possessWin, { name: who.name })); } else { who.possFails++; this.drip(15, null); this.sfx('mn-chains'); this.setPhase('POSSESS', { step: 'fail', who: who.id, key }); if (this.dead) return; await this.say(g, line(SAY.possessFail, { name: who.name })); }
    await this.candleWarn(g);
  }
  async door(g) {
    this.roomN = 6;
    const R = { key: 'door', level: 5, roles: {}, bubbles: [], events: [], evSeq: 0, done: null, burn: false, ends: Infinity };
    this.players.forEach((p) => { p.mx = {}; });
    this.setPhase('DOOR', { step: 'intro' }); this.sfx('mn-thunder');
    const X = this.makeX(R); R.st = DOOR.setup(X, this.keys); this.active = { X, R, def: DOOR };
    await this.say(g, SAY.door);
    await this.say(g, SAY.doorPieces[this.keys] || SAY.doorPieces.low);
    this.setPhase('DOOR', { step: 'jobs' });
    await this.hold(g, 6);
    R.start = this.clock(); R.ends = R.start + DOOR.secs * 1000 * SPEED; R.burn = true;
    this.setPhase('DOOR', { step: 'play' });
    let scared = false;
    while (!R.done) {
      await this.wait(400, () => !!R.done); this.guard(g);
      if (!scared && !R.done && this.scares < this.scareBudget && R.ends - this.clock() < 12000 * SPEED) { scared = true; this.jumpScare(g).catch(() => {}); }
    }
    R.burn = false; this.active = null;
    await this.endNight(R.done === 'win', g);
  }
  async endNight(escaped, g) {
    this.active = null;
    const screamer = [...this.players].filter((p) => p.scared).sort((a, b) => b.scared - a.scared)[0];
    const clumsy = [...this.players].sort((a, b) => b.slips - a.slips)[0];
    if (escaped) this.best = Math.max(this.best || 0, Math.round(this.candle));
    this.end = { escaped, candle: Math.round(this.candle), rooms: this.results.filter((r) => r.win).length, of: this.results.length, keys: this.keys, screamer: screamer ? screamer.id : null, clumsy: clumsy && clumsy.slips > 0 ? { id: clumsy.id, slips: Math.round(clumsy.slips) } : null, best: this.best, nights: this.nights };
    this.setPhase('END', { step: escaped ? 'escaped' : 'lost' }); this.sfx(escaped ? 'mn-chime' : 'mn-candle-out');
    if (g === undefined) return;
    try { await this.say(g, escaped ? M2.escape : this.dead ? M2.candleOut : SAY.lost); await this.hold(g, 2); this.setPhase('END', { step: 'stats' }); } catch (e) { if (!(e instanceof Cancelled)) throw e; }
  }

  // ------------------------------------------------------------ what players do
  act(pid, a) {
    const me = this.P(pid); if (!me) return { error: 'Not in a game' };
    this.lastActive = Date.now();
    switch (a?.type) {
      case 'start': return this.start(pid);
      case 'bust': if (this.phase !== 'LOBBY') return {}; return this.setBust(pid, a.n);
      case 'again': this.playAgain(pid); return {};
      case 'menu': if (this.phase === 'END' && this.vip()?.id === pid) this.hooks.menu?.(); return {};
      case 'skip': this.skip(pid); return {};
      case 'addBot': if (this.phase === 'LOBBY' && this.vip()?.id === pid) return this.addBot(true); return {};
      case 'removeBots': if (this.phase === 'LOBBY' && this.vip()?.id === pid) this.removeBots(); return {};
      case 'kick': this.kick(pid, a.id); return {};
      case 'accuse': { if (this.phase !== 'ACCUSE' || this.d.step !== 'vote' || !this.accuse || a.id === pid || !this.P(a.id)) return {}; this.accuse.votes[pid] = a.id; this.sync(); return { ok: true }; }
      case 'vote': { if (this.phase !== 'DOORS' || this.d.step !== 'vote' || !this.vote || !this.vote.opts.includes(a.k)) return {}; this.vote.votes[pid] = a.k; this.sfx('mn-floor'); this.sync(); return { ok: true }; }
      case 'scareLevel': { if (this.phase !== 'LOBBY' || this.vip()?.id !== pid || !SCARES.hasOwnProperty(a.v)) return {}; this.scareLevel = a.v; this.sync(); return { ok: true }; }
      case 'px': {
        const A = this.active; if (!A || !A.px || !A.R.st || A.R.st.done) return {};
        const step = this.d.step;
        if (a.a === 'skip' && step === 'practice' && this.vip()?.id === pid) { A.R.st.done = 'skip'; this.wake('done'); return {}; }
        if (!['play', 'walk', 'practice'].includes(step)) return {};
        try { A.def.act(A.X, me, a, A.R.st); } catch (e) { console.error('mn px act', A.R.key, e); }
        if (A.R.st.done || A.R.st.chosen) this.wake('done');
        this.sync(); return { ok: true };
      }
      case 'r': {
        const A = this.active; if (!A || A.R.done) return {};
        const step = this.d.step; if (step !== 'play') return {};
        if (this.phase === 'POSSESS' && A.R.who !== pid) return {};
        try { A.def.act(A.X, me, a, A.R.st); } catch (e) { console.error('mn act', A.R.key, e); }
        this.sync(); return { ok: true };
      }
      default: return {};
    }
  }

  // ------------------------------------------------------------ what each screen sees
  view(me) {
    const ph = this.phase; const d = this.d; const A = this.active;
    const v = {
      game: 'mn', phase: ph, step: d.step || null, code: this.code, now: Date.now(), vipId: this.vip()?.id, test: this.test,
      players: this.players.map((p) => ({ ...this.pub(p), connected: p.connected, bot: p.bot })),
      candle: Math.round(this.candle * 10) / 10, keys: this.keys, roomN: this.roomN, rooms: NIGHT_ROOMS,
      scare: this.scareFx && this.clock() < this.scareFx.until && (!this.scareFx.target || !me || this.scareFx.target === me.id || this.scareFx.kind !== 'personal') ? this.scareFx : null, flash: this.flash, fx: this.fx, x: {},
      night: PX_KEYS.map((k) => { const r = this.results.find((o) => o.key === k); return { key: k, name: PXR.PX_ROOMS[k].name, res: r ? (r.win ? 'win' : 'fail') : null }; }),
    };
    const x = v.x;
    if (ph === 'ROOM' || ph === 'DOOR') {
      const def = ph === 'DOOR' ? DOOR : ROOMS[d.key];
      x.room = { key: def.key, name: def.name, type: def.type, how: def.how };
      if (A && A.R.key === def.key) { x.ends = A.R.ends === Infinity ? null : this.wall(A.R.ends); x.start = this.wall(A.R.start); x.bubbles = A.R.bubbles; x.events = A.R.events; }
      if (d.step === 'win') x.left = d.left;
    }
    if (ph === 'HALL') x.next = d.next;
    if (ph === 'POSSESS') { const def = POSSESS[d.key]; x.who = d.who; x.poss = { key: def.key, name: def.name, how: def.how }; if (A && A.R.key === d.key) { x.ends = A.R.ends === Infinity ? null : this.wall(A.R.ends); x.start = this.wall(A.R.start); } }
    if (ph === 'END') x.end = this.end;
    x.scareLevel = this.scareLevel || 'spooky';
    if (ph === 'DOORS' && this.vote) x.doors = { opts: this.vote.opts.map((k) => { const df = k === 'mercy' ? MERCY2 : ROOMS2[k]; return { key: k, name: df.name, goal: df.goal, art: df.art, style: df.style }; }), voted: Object.keys(this.vote.votes), mine: me ? this.vote.votes[me.id] || null : null, choice: this.vote.choice || null, tally: d.step === 'chosen' ? this.vote.tally || null : null, until: this.vote.until ? this.wall(this.vote.until) : null };
    if (ph === 'COLLAPSE') x.collapse = { n: d.n || 0, of: d.of || 0 };
    if (ph === 'ACCUSE' && this.accuse) x.accuse = { voted: Object.keys(this.accuse.votes), mine: me ? this.accuse.votes[me.id] || null : null, until: this.wall(this.accuse.until), reveal: d.step === 'reveal' ? { id: this.accuse.id, caught: this.accuse.caught, tally: this.accuse.tally } : null };
    if (me && this.poss && this.poss.id === me.id && ['PX', 'ACCUSE'].includes(ph)) x.poss = { power: this.poss.power, key: this.poss.key };
    if (this.poss && ['PX'].includes(ph)) x.possActive = true;
    if (['HUB', 'PX', 'STORY', 'BOSS', 'COLLAPSE'].includes(ph)) {
      const def = d.key === 'mercy' ? MERCY2 : ROOMS2[d.key] || (ph === 'HUB' ? PXR.HUB : ph === 'BOSS' ? PXR.BOSS : PXR.PX_ROOMS[d.key]);
      if (def) x.room = { key: def.key, name: def.name, style: def.style, how: def.goal || def.how, goal: (d.kind === 2 && def.goal2) || def.goal || def.how, art: def.art, music: def.music };
      x.kind = d.kind ?? null; x.wins = d.wins; x.gotKey = d.gotKey; x.gained = d.gained;
      if (ph === 'STORY') x.story = { key: d.key, mem: PXR.MEMORIES[d.key]?.act || '', text: STORY[d.key] };
      if (this.ctx) x.ctx = { done: this.ctx.done, keys: this.ctx.keys };
      if (A && A.px && A.R.st) { x.ends = A.R.ends === Infinity ? null : this.wall(A.R.ends); x.start = this.wall(A.R.start); }
    }
    if (ph === 'LOBBY') { x.min = MIN; x.busts = this.busts.map((n) => ({ n, by: this.players.find((p) => p.bust === n)?.id || null })); }
    if (!me) {
      v.cue = this.cue; v.joinUrl = this.joinUrl; v.qr = this.qr; v.voiceOn = voice.enabled();
      if (A && A.px && A.R.st && ['walk', 'play', 'practice', 'demo', 'won', 'lost'].includes(d.step)) { try { x.px = A.def.tv(A.X, A.R.st); } catch (e) { console.error('mn px tv', A.R.key, e); } }
      if (A && !A.px) x.roles = Object.fromEntries(Object.entries(A.R.roles).map(([id, r]) => [id, r.label]));
      if (A && !A.px && ((ph === 'ROOM' && ['play', 'win', 'fail'].includes(d.step)) || ph === 'DOOR' || (ph === 'POSSESS' && ['play', 'ready', 'win', 'fail'].includes(d.step)))) { try { x.tv = A.def.tv(A.X, A.R.st); } catch (e) { console.error('mn tv view', A.R.key, e); } }
      return v;
    }
    const m = { ...this.pub(me), vip: this.vip()?.id === me.id, notes: me.notes, buzz: me.buzz };
    v.me = m;
    if (A && A.px && A.R.st && ['walk', 'play', 'practice'].includes(d.step)) { try { m.px = A.def.phone(A.X, me, A.R.st); } catch (e) { console.error('mn px phone', A.R.key, e); } }
    if (A && !A.px && (ph === 'ROOM' || ph === 'DOOR')) {
      const r = A.R.roles[me.id]; m.role = r?.label || '';
      if (['jobs', 'play'].includes(d.step) || (ph === 'DOOR' && d.step !== 'intro')) { try { const s = A.def.phone(A.X, me, A.R.st); m.role = s.role || m.role; m.job = s.job; if (d.step === 'play') m.w = s.w; } catch (e) { console.error('mn phone view', A.R.key, e); } }
    }
    if (A && ph === 'POSSESS' && A.R.who === me.id && ['ready', 'play'].includes(d.step)) { try { const s = A.def.phone(A.X, me, A.R.st); m.role = 'Possessed'; m.job = s.job; if (d.step === 'play') m.w = s.w; } catch (e) { console.error('mn possess view', e); } }
    return v;
  }
}

module.exports = { Mansion, __door: DOOR };
