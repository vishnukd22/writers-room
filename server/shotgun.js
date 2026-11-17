'use strict';
// SHOTGUN: everyone rides in one car with a wedding cake in the back. Each phone controls one part of the car.
// The TV runs the 3D world and the driving; this file runs the night: jobs, route votes, the cake, Dolly, the ending.
// Phones send their controls here and they go straight on to the TV ('sg:in'). The TV reports what happened ('sg:report').
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const voice = require('./voice');
const { SAY } = require('./sg-lines');

const SPEED = Number(process.env.WR_SPEED || 1);
const ms = (s) => Math.max(30, Math.round(s * 1000 * SPEED));
const uid = () => crypto.randomBytes(6).toString('hex');
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const shuffle = (arr) => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const clip = (s, n) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);
const strip = voice.stripTags;
class Cancelled extends Error {}

const COLORS = ['#FF4F8B', '#3ED6A0', '#FFD23F', '#4FB6FF', '#C58BFF', '#FF8A3D', '#26C6C6', '#E5484D'];
const BOT_NAMES = ['Ahmed', 'Bella', 'Carlos', 'Dina', 'Erik', 'Fatima', 'Gopal', 'Hana'];
const MIN = 2; const MAX = 8;
const STAGES = 6; // Rush Hour, then five more picked by vote, then the Grand Entrance
const POOL = ['park', 'night', 'jump', 'chase', 'pit', 'dunes'];
const LIMIT = { rush: 75, park: 60, night: 75, jump: 55, chase: 75, pit: 50, dunes: 70, entrance: 70 };
const MUSIC = { rush: 'sg-drive1', park: 'sg-drive2', night: 'sg-night', jump: 'sg-drive2', chase: 'sg-chase', pit: 'sg-pit', dunes: 'sg-drive1', entrance: 'sg-entrance' };
const LATE = 12; // cake lost when a stage runs out of time: the icing melts
const PIT_TIME = 10;
// who does what, by how many people are in the car. Each stage the jobs move one seat along.
const J = (n, ...a) => ({ n, a });
const ROLES = {
  2: [J('Driver', 'left', 'right', 'gas', 'brake'), J('Co-pilot', 'nav', 'gear', 'nitro', 'horn', 'lights')],
  3: [J('Steering', 'left', 'right'), J('Pedals', 'gas', 'brake', 'gear'), J('Co-pilot', 'nav', 'nitro', 'horn', 'lights')],
  4: [J('Left', 'left'), J('Right', 'right'), J('Pedals', 'gas', 'brake', 'gear'), J('Co-pilot', 'nav', 'nitro', 'horn', 'lights')],
  5: [J('Left', 'left'), J('Right', 'right'), J('Gas', 'gas', 'gear'), J('Brake', 'brake', 'horn'), J('Navigator', 'nav', 'nitro', 'lights')],
  6: [J('Left', 'left'), J('Right', 'right'), J('Gas', 'gas'), J('Brake', 'brake', 'gear'), J('Horn', 'horn', 'lights'), J('Navigator', 'nav', 'nitro')],
  7: [J('Left', 'left'), J('Right', 'right'), J('Gas', 'gas'), J('Brake', 'brake'), J('Gearbox', 'gear', 'nitro'), J('Horn', 'horn', 'lights'), J('Navigator', 'nav')],
  8: [J('Left', 'left'), J('Right', 'right'), J('Gas', 'gas'), J('Brake', 'brake'), J('Gearbox', 'gear', 'nitro'), J('Horn', 'horn'), J('Lights', 'lights'), J('Navigator', 'nav')],
};
const ATOMS = ['left', 'right', 'gas', 'brake', 'gear', 'nitro', 'horn', 'lights', 'nav'];
const PIT_TASKS = ['tyre', 'fuel', 'wipe', 'jack', 'rose'];

function bustPool() {
  let nums = [];
  try { nums = fs.readdirSync(path.join(__dirname, '..', 'public', 'assets', 'img')).map((f) => /^bust-(\d+)\.(png|jpe?g|webp)$/i.exec(f)).filter(Boolean).map((m) => Number(m[1])); } catch (e) { nums = []; }
  return nums.length >= 4 ? [...new Set(nums)].sort((a, b) => a - b) : [...Array(16).keys()].map((i) => i + 1);
}

class Shotgun {
  constructor(code, hooks, opts = {}) {
    this.kind = 'sg'; this.code = code; this.hooks = hooks; this.test = !!opts.test;
    this.players = []; this.phase = 'LOBBY'; this.d = {}; this.endsAt = null; this.cue = null;
    this.runId = 0; this.waiter = null; this.lastActive = Date.now(); this.syncPending = false;
    this.fx = []; this.fxSeq = 0; this.timers = []; this.busts = bustPool(); this.taught = false;
    this.reset();
  }
  reset() { Object.assign(this, { cake: 100, si: -1, stageKey: null, played: [], jobs: [], owner: {}, votes: {}, track: null, tok: null, done: null, pit: null, results: [], lastHit: 0, lastLine: 0, ending: null, lift: {}, stats: {} }); }

  // ------------------------------------------------------------ plumbing (same pattern as the other games)
  P(id) { return this.players.find((p) => p.id === id); }
  humans() { return this.players.filter((p) => !p.bot); }
  vip() { return this.humans().find((p) => p.connected) || this.players[0]; }
  pub(p) { return p ? { id: p.id, name: p.name, color: p.color, bust: p.bust, bot: !!p.bot } : null; }
  sync() {
    if (this.syncPending) return; this.syncPending = true;
    setTimeout(() => {
      this.syncPending = false;
      try { this.hooks.toHost(this.view(null)); for (const p of this.players) if (p.connected && !p.bot) this.hooks.toPlayer(p.id, this.view(p)); } catch (e) { console.error('sg sync', e); }
    }, 40);
  }
  progress() { this.lastProgress = Date.now(); }
  setPhase(phase, d = {}, seconds = null) { this.progress(); this.phase = phase; this.d = d; this.endsAt = seconds ? Date.now() + ms(seconds) : null; this.lastActive = Date.now(); this.sync(); this.botTurn(); }
  sfx(name) { this.fxSeq++; this.fx.push({ id: this.fxSeq, name }); if (this.fx.length > 14) this.fx.shift(); this.sync(); }
  guard(g) { if (g !== this.runId) throw new Cancelled(); }
  later(g, t, fn) { const h = setTimeout(() => { if (g !== this.runId) return; try { fn(); } catch (e) { console.error('sg timer', e); } }, t); this.timers.push(h); if (this.timers.length > 300) this.timers = this.timers.slice(-150); return h; }
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
  skip(byId) { if (byId && byId !== this.vip()?.id) return; if (['LOBBY', 'END', 'DRIVE', 'ENTRANCE', 'PIT'].includes(this.phase)) return; this.cue = null; this.wake('skip'); }
  pause(g, s) { return this.wait(ms(s)).then(() => this.guard(g)); }
  shiftClock(dt) { if (this.d.go) this.d.go += dt; }

  // ------------------------------------------------------------ Dolly
  // her lines use ElevenLabs v3, so the [tags] become real emotion
  prefetch(text, urgent = false) { return voice.get(text, voice.SG(), urgent, false).catch(() => null); }
  estimate(text) { return Math.min(20000, 700 + strip(text).length * 62); }
  async makeCue(text, opts = {}) {
    let audioId = null;
    if (voice.enabled()) audioId = await Promise.race([this.prefetch(text, opts.urgent !== false), new Promise((r) => setTimeout(() => r(null), opts.maxWait || 7000))]);
    return { id: uid(), text: strip(text), audio: audioId ? `/audio/${audioId}` : null, kind: 'host', mood: opts.mood || 'calm' };
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
  async sayOver(g, text, opts = {}) { if (!strip(text)) return; const cue = await this.makeCue(text, { maxWait: 1200, ...opts }); if (g !== this.runId) return; this.cue = cue; this.sync(); }
  cueFinished(id) { this.cueDone = id; if (this.cue && this.cue.id === id) this.cue = null; this.check(); }
  // every fixed line is recorded once, right when the game starts
  prefetchAll() {
    if (this.madeAll) return; this.madeAll = true;
    const all = [];
    for (const v of Object.values(SAY)) { if (typeof v === 'string') all.push(v); else if (Array.isArray(v)) all.push(...v); }
    for (const k of Object.keys(SAY.stage)) all.push(SAY.stage[k]);
    all.forEach((t) => this.prefetch(t));
  }
  // a quick reaction while driving, never more than one every few seconds
  react(kind, mood = 'panic', force = false) {
    const now = Date.now(); if (!force && now - this.lastLine < 4500) return; this.lastLine = now;
    const pool = SAY[kind]; if (!pool) return;
    this.sayOver(this.runId, Array.isArray(pool) ? pick(pool) : pool, { mood });
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
    if (this.players.length >= MAX) return { error: `The car is full (${MAX} players)` };
    const p = this.newPlayer(name, false); this.players.push(p); this.sync();
    return { player: p };
  }
  newPlayer(name, bot) {
    const used = new Set(this.players.map((x) => x.color));
    const free = this.busts.filter((b) => !this.players.some((x) => x.bust === b));
    return { id: uid(), token: uid(), name, color: COLORS.find((c) => !used.has(c)) || pick(COLORS), connected: true, bot, bust: free.length ? pick(free) : pick(this.busts), notes: [], noteSeq: 0 };
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
    if (this.players.length < MIN) return { error: `Shotgun needs at least ${MIN} players. Add a bot from the first phone.` };
    this.reset(); this.prefetchAll();
    this.players.forEach((p) => { this.stats[p.id] = { honks: 0, nitros: 0, lifts: 0 }; });
    this.order = shuffle(this.players.map((p) => p.id));
    const g = ++this.runId; this.startWatchdog(g);
    this.run(g).catch((e) => { if (!(e instanceof Cancelled)) { console.error('sg run error', e); this.finish('ruined'); } });
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
      if (!this.pauseInfo && Date.now() - this.lastProgress > 150000) { console.error(`sg ${this.code}: stuck in ${this.phase}, moving on`); this.progress(); this.cue = null; this.wake('watchdog'); this.sync(); }
    }, 5000);
  }

  // ------------------------------------------------------------ the night
  async run(g) {
    this.setPhase('INTRO', { step: 'welcome' }); this.sfx('sg-msg');
    await this.say(g, SAY.welcome, { mood: 'panic' });
    this.setPhase('INTRO', { step: 'rules' });
    await this.say(g, this.taught ? SAY.rulesShort : SAY.rules, { mood: 'calm' }); this.taught = true;
    const pool = shuffle(POOL);
    // testing only: SG_FIRST=pit,park puts those stages up for the first votes
    for (const k of (process.env.SG_FIRST || '').split(',').reverse()) if (pool.includes(k)) { pool.splice(pool.indexOf(k), 1); pool.unshift(k); }
    for (let i = 0; i < STAGES; i++) {
      let key = 'rush';
      if (i > 0) { const opts = pool.splice(0, 2); key = await this.vote(g, opts); const other = opts.find((k) => k !== key); if (other) pool.push(other); }
      await this.stage(g, i, key);
      if (this.cake <= 0) break;
    }
    if (this.cake > 0) await this.entrance(g);
    await this.end(g);
  }
  // highway or shortcut: everyone votes for the next stage
  async vote(g, opts) {
    this.votes = {};
    this.setPhase('MAP', { opts, step: 'vote' }, 14);
    this.sayOver(g, pick(SAY.votePrompt), { mood: 'panic' });
    await this.wait(ms(14), () => this.humans().filter((p) => p.connected).every((p) => this.votes[p.id] != null)); this.guard(g);
    const count = opts.map((_, i) => Object.values(this.votes).filter((v) => v === i).length);
    const best = Math.max(...count); const win = shuffle(opts.map((_, i) => i).filter((i) => count[i] === best))[0];
    this.d = { opts, step: 'result', win, count }; this.sfx('sg-msg'); this.sync();
    await this.pause(g, 2.2);
    return opts[win];
  }
  dealJobs(i) {
    const n = this.players.length; const roles = ROLES[Math.min(8, Math.max(2, n))];
    const order = this.order.map((id) => this.P(id)).filter(Boolean);
    this.jobs = []; this.owner = {};
    order.forEach((p, j) => {
      let r = roles[(j + i) % roles.length];
      // the Lights job only matters at night; the rest of the time that person watches the map too
      if (this.stageKey !== 'night' && r.a.length === 1 && r.a[0] === 'lights') r = J('Spotter', 'nav');
      this.jobs.push({ pid: p.id, role: r.n, atoms: r.a });
      for (const a of r.a) if (!this.owner[a] || a === 'nav') this.owner[a] = this.owner[a] || p.id;
    });
  }
  async stage(g, i, key) {
    this.si = i; this.stageKey = key; this.played.push(key); this.done = null; this.pit = null; this.track = null; this.lift = {};
    this.tok = `${this.runId}.${i}.${key}`; this.seed = Math.floor(Math.random() * 1e9);
    this.dealJobs(i);
    this.setPhase('JOBS', { key });
    this.sfx('sg-msg');
    await this.say(g, i === 0 ? SAY.stage[key] : `${pick(SAY.jobsReady)} ${SAY.stage[key]}`, { mood: key === 'chase' || key === 'jump' ? 'panic' : 'calm' });
    await this.pause(g, 2.5);
    const limit = LIMIT[key];
    this.hitsAtStart = this.cake;
    this.setPhase('DRIVE', { key, go: Date.now() + 3500 }, limit + 3.5);
    this.sfx('sg-countdown');
    await this.wait(ms(limit + 3.5), () => !!this.done || !!this.pit || this.cake <= 0); this.guard(g);
    if (this.cake <= 0) return this.cakeGone(g);
    if (this.pit) await this.pitStop(g);
    let late = false;
    if (!this.done) { late = true; this.hit(LATE, 'late'); }
    if (this.cake <= 0) return this.cakeGone(g);
    const lost = Math.max(0, Math.round(this.hitsAtStart - this.cake));
    this.results.push({ key, lost, late, cake: Math.round(this.cake) });
    this.setPhase('RESULT', { key, lost, late, cake: Math.round(this.cake), pit: this.pitResult || null });
    this.sfx(late || lost > 15 ? 'sg-gasp' : 'sg-cheer');
    await this.say(g, late ? pick(SAY.late) : lost <= 4 ? pick(SAY.good) : pick(SAY.bad), { mood: late || lost > 15 ? 'furious' : lost <= 4 ? 'happy' : 'panic' });
    await this.pause(g, 2);
    this.pitResult = null;
  }
  async cakeGone(g) {
    this.cake = 0; this.setPhase('RESULT', { key: this.stageKey, gone: true, cake: 0 }); this.sfx('sg-splat');
    await this.say(g, SAY.cakeGone, { mood: 'furious' });
  }
  // the pit stop: the car is in the box, and everybody gets ten seconds and one job on their phone
  async pitStop(g) {
    const tasks = {}; shuffle(this.players).forEach((p, i) => { tasks[p.id] = PIT_TASKS[i % PIT_TASKS.length]; });
    this.pitTasks = tasks; this.pitScore = {};
    this.setPhase('PIT', { tasks }, PIT_TIME + 1);
    this.sfx('sg-wrench'); this.sayOver(g, SAY.pitIntro, { mood: 'panic' });
    for (const b of this.players.filter((p) => p.bot)) this.later(g, ms(3 + Math.random() * 6), () => { this.pitScore[b.id] = 0.55 + Math.random() * 0.4; this.check(); this.sync(); });
    await this.wait(ms(PIT_TIME + 1), () => this.players.every((p) => this.pitScore[p.id] != null || !p.connected)); this.guard(g);
    const scores = this.players.map((p) => this.pitScore[p.id] ?? 0);
    const avg = scores.reduce((a, b) => a + b, 0) / Math.max(1, scores.length);
    const fix = Math.round(avg * 14);
    this.cake = Math.min(100, this.cake + fix); this.hitsAtStart = Math.min(100, this.hitsAtStart + fix);
    this.pitResult = { avg, fix }; this.done = { pit: true };
    this.setPhase('PIT', { tasks, step: 'done', fix, avg }); this.sfx(avg > 0.6 ? 'sg-cheer' : 'sg-wrench');
    await this.say(g, avg > 0.6 ? SAY.pitGood : SAY.pitBad, { mood: avg > 0.6 ? 'happy' : 'calm' });
  }
  async entrance(g) {
    this.stageKey = 'entrance'; this.si = STAGES; this.done = null; this.tok = `${this.runId}.E`; this.seed = Math.floor(Math.random() * 1e9);
    // half the room holds the left side of the tray, half the right
    this.sides = {}; this.order.forEach((id, i) => { this.sides[id] = i % 2 ? 'R' : 'L'; });
    this.setPhase('JOBS', { key: 'entrance' }); this.sfx('sg-msg');
    await this.say(g, SAY.entranceIntro, { mood: 'happy' });
    await this.pause(g, 2);
    this.setPhase('ENTRANCE', { key: 'entrance', go: Date.now() + 3500 }, LIMIT.entrance + 3.5);
    this.sfx('sg-countdown');
    await this.wait(ms(LIMIT.entrance + 3.5), () => !!this.done || this.cake <= 0); this.guard(g);
    if (this.done?.fell) this.cake = 0;
  }
  async end(g) {
    const ending = this.cake <= 0 ? 'ruined' : this.cake >= 70 ? 'perfect' : 'damaged';
    this.finish(ending);
    await this.say(g, ending === 'perfect' ? SAY.endPerfect : ending === 'damaged' ? SAY.endDamaged : SAY.endRuined, { mood: ending === 'perfect' ? 'happy' : ending === 'damaged' ? 'calm' : 'furious' });
  }
  finish(ending) {
    this.ending = ending;
    const st = Object.entries(this.stats);
    const top = (k) => st.sort((a, b) => b[1][k] - a[1][k])[0];
    const awards = [];
    const h = top('honks'); if (h && h[1].honks) awards.push({ title: 'Most honks', who: h[0], text: `${h[1].honks} honks` });
    const n = top('nitros'); if (n && n[1].nitros) awards.push({ title: 'Nitro addict', who: n[0], text: `${n[1].nitros} boosts` });
    this.setPhase('END', { ending, cake: Math.round(Math.max(0, this.cake)), results: this.results, awards });
    this.sfx(ending === 'ruined' ? 'sg-lose' : 'sg-win');
  }

  // ------------------------------------------------------------ the cake
  hit(amt, kind) {
    amt = Math.max(0, Math.min(25, Number(amt) || 0)); if (!amt) return;
    this.cake = Math.max(0, this.cake - amt); this.progress();
    if (kind !== 'late') this.react(kind === 'scratch' ? 'scratch' : kind === 'offroad' ? 'offroad' : kind === 'splash' ? 'splash' : kind === 'police' ? 'caught' : 'hit', 'furious', amt >= 10);
    if (this.cake <= 0) this.check();
    this.sync();
  }
  // what the TV tells us
  report(a) {
    if (!a || a.tok !== this.tok) return;
    switch (a.type) {
      case 'hit': if (['DRIVE', 'ENTRANCE'].includes(this.phase) && !this.pauseInfo) this.hit(a.amt, a.kind); break;
      case 'done': if (['DRIVE', 'ENTRANCE'].includes(this.phase) && !this.done) { this.done = { fell: !!a.fell, t: a.t }; this.check(); } break;
      case 'pit': if (this.phase === 'DRIVE' && this.stageKey === 'pit' && !this.pit) { this.pit = true; this.check(); } break;
      case 'track': this.track = { pts: (a.pts || []).slice(0, 400), marks: (a.marks || []).slice(0, 80) }; this.sync(); break;
      case 'pos': this.hooks.blast?.('sg:pos', { x: a.x, z: a.z, h: a.h, p: a.p, cops: a.cops || null, r: a.r ?? null }); this.progress(); break;
      case 'say': if (['nitro', 'uncle', 'waiter', 'toddler', 'steps'].includes(a.k)) this.react(a.k, a.k === 'nitro' ? 'happy' : 'panic', a.k === 'steps'); break;
      default: break;
    }
  }

  // ------------------------------------------------------------ what players do
  act(pid, a) {
    const me = this.P(pid); if (!me) return { error: 'Not in a game' };
    this.lastActive = Date.now();
    switch (a.type) {
      case 'in': return this.input(me, a);
      case 'start': return this.start(pid);
      case 'bust': if (this.phase !== 'LOBBY') return {}; return this.setBust(pid, a.n);
      case 'again': this.playAgain(pid); return {};
      case 'menu': if (this.phase === 'END' && this.vip()?.id === pid) this.hooks.menu?.(); return {};
      case 'skip': this.skip(pid); return {};
      case 'addBot': if (this.phase === 'LOBBY' && this.vip()?.id === pid) return this.addBot(true); return {};
      case 'removeBots': if (this.phase === 'LOBBY' && this.vip()?.id === pid) this.removeBots(); return {};
      case 'kick': this.kick(pid, a.id); return {};
      case 'vote': if (this.phase === 'MAP' && this.d.step === 'vote' && [0, 1].includes(a.i)) { this.votes[pid] = a.i; this.check(); this.sync(); } return {};
      case 'pitDone': if (this.phase === 'PIT' && this.pitScore[pid] == null) { this.pitScore[pid] = Math.max(0, Math.min(1, Number(a.score) || 0)); this.check(); this.sync(); } return {};
      default: return {};
    }
  }
  // a control press: checked against your job, then straight to the TV
  input(me, a) {
    const k = String(a.k || ''); const v = Number(a.v) || 0;
    if (this.phase === 'ENTRANCE') { if (k !== 'lift') return {}; this.lift[me.id] = v ? 1 : 0; if (v) this.stats[me.id].lifts++; this.hooks.host?.('sg:in', { p: me.id, k, v: v ? 1 : 0, side: this.sides[me.id] }); return {}; }
    if (this.phase !== 'DRIVE') return {};
    const job = this.jobs.find((j) => j.pid === me.id);
    const lean = k === 'lean' && this.stageKey === 'jump';
    if (!lean && (!job || !job.atoms.includes(k) || !ATOMS.includes(k))) return {};
    if (k === 'horn' && v) this.stats[me.id].honks++;
    if (k === 'nitro' && v) this.stats[me.id].nitros++;
    this.hooks.host?.('sg:in', { p: me.id, k, v: Math.max(-1, Math.min(1, v)) });
    return {};
  }
  botTurn() {
    const g = this.runId; const bots = this.players.filter((p) => p.bot); if (!bots.length) return;
    if (this.phase === 'MAP' && this.d.step === 'vote') for (const b of bots) this.later(g, 600 + Math.random() * 3000, () => { if (this.phase === 'MAP' && this.d.step === 'vote' && this.votes[b.id] == null) { this.votes[b.id] = Math.random() < 0.5 ? 0 : 1; this.check(); this.sync(); } });
  }

  // ------------------------------------------------------------ what each screen sees
  view(me) {
    const ph = this.phase; const d = this.d;
    const v = {
      game: 'sg', phase: ph, step: d.step || null, code: this.code, endsAt: this.endsAt, now: Date.now(), vipId: this.vip()?.id, test: this.test,
      players: this.players.map((p) => ({ ...this.pub(p), connected: p.connected })),
      cake: Math.round(this.cake * 10) / 10, fx: this.fx, x: {},
      stage: this.stageKey ? { key: this.stageKey, i: this.si, total: STAGES, title: SAY.title[this.stageKey], sub: SAY.sub[this.stageKey], music: MUSIC[this.stageKey], tok: this.tok, seed: this.seed, go: d.go || null } : null,
      jobs: this.jobs, owner: this.owner, sides: this.sides || null,
    };
    const x = v.x;
    if (ph === 'MAP') { x.opts = d.opts.map((k, i) => ({ key: k, title: SAY.title[k], sub: SAY.sub[k], route: i === 0 ? 'Highway' : 'Shortcut', votes: Object.values(this.votes).filter((t) => t === i).length })); x.win = d.win ?? null; x.voted = Object.keys(this.votes).length; }
    if (ph === 'RESULT') Object.assign(x, d);
    if (ph === 'PIT') { x.step = d.step || 'go'; x.fix = d.fix ?? null; x.done = Object.keys(this.pitScore || {}).length; }
    if (ph === 'END') Object.assign(x, d);
    if (ph === 'LOBBY') { x.min = MIN; x.busts = this.busts.map((n) => ({ n, by: this.players.find((p) => p.bust === n)?.id || null })); }
    if (['DRIVE', 'PIT', 'RESULT'].includes(ph) && this.track) x.track = this.track;
    if (!me) { v.cue = this.cue; v.joinUrl = this.joinUrl; v.qr = this.qr; v.voiceOn = voice.enabled(); v.lift = this.lift; }
    else {
      const job = this.jobs.find((j) => j.pid === me.id);
      v.me = { ...this.pub(me), vip: this.vip()?.id === me.id, role: job?.role || null, atoms: job?.atoms || [], vote: this.votes[me.id] ?? null, side: this.sides?.[me.id] || null,
        task: ph === 'PIT' ? this.pitTasks?.[me.id] : null, taskDone: ph === 'PIT' ? this.pitScore?.[me.id] != null : false };
    }
    return v;
  }
}

module.exports = { Shotgun, ROLES };
