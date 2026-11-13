'use strict';
// RIGGED! A trivia game show where everything is for sale and the rules never stay still.
// Same engine pattern as the other games: one async script per room, players act through act().
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const C = require('./rg-content');
const { SAY } = require('./rg-lines');
const voice = require('./voice');

const SPEED = Number(process.env.WR_SPEED || 1);
const BOT_PACE = Number(process.env.RG_BOT_PACE || 1);
const ms = (s) => Math.max(30, Math.round(s * 1000 * SPEED));
const uid = () => crypto.randomBytes(6).toString('hex');
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const shuffle = (arr) => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const clip = (s, n) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);
const fill = (t, o) => String(t).replace(/\{(\w+)\}/g, (_, k) => (o[k] ?? ''));
const line = (t, o = {}) => fill(Array.isArray(t) ? pick(t) : t, o);
const timeout = (p, t) => Promise.race([p, new Promise((r) => setTimeout(() => r(null), t))]);
const strip = voice.stripTags;
const bucks = (n) => Math.round(n).toLocaleString('en-US');
const norm = (s) => String(s || '').toLowerCase().replace(/^(a|an|the)\s+/, '').replace(/[^a-z0-9]/g, '');
const listNames = (arr) => (arr.length <= 1 ? arr.join('') : `${arr.slice(0, -1).join(', ')} and ${arr[arr.length - 1]}`);
function lev(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
const tooClose = (lie, truth) => { const a = norm(lie); const b = norm(truth); if (!a) return true; return a === b || (b.length >= 5 && lev(a, b) <= 1) || (b.length >= 4 && a.includes(b)); };
class Cancelled extends Error {}

const VOICE = () => voice.RG();
const COLORS = ['#F2C230', '#2FB36B', '#E5484D', '#3E8EDE', '#A970FF', '#FF8A3D', '#26C6C6', '#F06FB0'];
const BOT_NAMES = ['Ahmed', 'Bella', 'Carlos', 'Dina', 'Erik', 'Fatima', 'Gopal', 'Hana'];
const MIN = 2; const MAX = 8; const START = 1000; const GRACE = 1000;
// seconds
const T = { dossier: 90, mc: 15, write: 45, vote: 20, who: 15, layWrite: 40, num: 20, bet: 10, wheel: 20, veto: 7, ladder: 180, catVote: 5, reveal: 3.6 };
const ROUND_NAMES = { 1: 'The Warm-Up', 2: 'Lie Detector', 3: 'Who In This Room?', 4: 'The Bomb', 5: 'Closest Number', 6: 'Double Trouble', 7: 'The Rigged Ladder', 8: 'The Results' };
const SAB_KINDS = ['mc', 'num', 'bomb'];
const COPY_KINDS = ['mc', 'vote', 'who', 'lay', 'num'];
const REMOTE_KINDS = ['mc', 'vote', 'who', 'lay', 'num', 'write', 'bomb'];
const TIMED_KINDS = ['mc', 'vote', 'who', 'lay', 'num', 'write', 'laywrite']; // a Stopwatch or a Boo can shorten these
const ALIAS = { lay: 'who', laywrite: 'write' };
const LADDER_RUNGS = 7; const RUNG_PAY = 250; const TOP_PAY = 2000; const LIFT = 800; const GREASE = 600;

function bustPool() {
  let nums = [];
  try { nums = fs.readdirSync(path.join(__dirname, '..', 'public', 'assets', 'img')).map((f) => /^bust-(\d+)\.(png|jpe?g|webp)$/i.exec(f)).filter(Boolean).map((m) => Number(m[1])); } catch (e) { nums = []; }
  return nums.length >= 4 ? [...new Set(nums)].sort((a, b) => a - b) : [...Array(16).keys()].map((i) => i + 1);
}

class Rigged {
  constructor(code, hooks, opts = {}) {
    this.kind = 'rg'; this.code = code; this.hooks = hooks; this.test = !!opts.test;
    this.players = []; this.phase = 'LOBBY'; this.d = {}; this.endsAt = null; this.cue = null;
    this.runId = 0; this.waiter = null; this.lastActive = Date.now(); this.syncPending = false;
    this.fx = []; this.fxSeq = 0; this.timers = []; this.busts = bustPool();
    this.splash = null; this.splashSeq = 0; this.settings = { passPhone: true };
    this.seen = { mc: new Set(), tf: new Set(), num: new Set(), lie: new Set(), dos: new Set() };
    this.reset();
    [SAY.welcome, SAY.welcomeHouse, SAY.dossier, SAY.round[1]].forEach((t) => this.prefetch(t, true));
  }
  reset() {
    Object.assign(this, { roundN: 0, rules: [], lastCard: null, pending: { passphone: false, jackpot: false, pot: 0, spin: false }, alliance: null, spinUsed: {}, q: null, cur: null, rev: null, qd: {}, qSeq: 0, unlock: { sab: false, bribe: false, copy: false, remote: false }, ladder: null, lastChat: 0 });
  }

  // ------------------------------------------------------------ plumbing (same as the other games)
  P(id) { return this.players.find((p) => p.id === id); }
  humans() { return this.players.filter((p) => !p.bot); }
  vip() { return this.humans().find((p) => p.connected) || this.humans()[0] || this.players[0]; }
  pub(p) { return p ? { id: p.id, name: p.name, color: p.color, bust: p.bust, house: !!p.house } : null; }
  nameOf(id) { return this.P(id)?.name || 'Someone'; }
  sync() {
    if (this.syncPending) return; this.syncPending = true;
    setTimeout(() => {
      this.syncPending = false;
      try { this.hooks.toHost(this.view(null)); for (const p of this.players) if (p.connected && !p.bot) this.hooks.toPlayer(p.id, this.view(p)); } catch (e) { console.error('rg sync', e); }
    }, 40);
  }
  progress() { this.lastProgress = Date.now(); }
  setPhase(phase, d = {}, seconds = null) { this.progress(); this.phase = phase; this.d = d; this.endsAt = seconds ? Date.now() + ms(seconds) : null; this.lastActive = Date.now(); this.sync(); this.botTurn(); }
  sfx(name) { this.fxSeq++; this.fx.push({ id: this.fxSeq, name }); if (this.fx.length > 14) this.fx.shift(); this.sync(); }
  guard(g) { if (g !== this.runId) throw new Cancelled(); }
  later(g, t, fn) { const h = setTimeout(() => { if (g !== this.runId) return; try { fn(); } catch (e) { console.error('rg timer', e); } }, Math.max(0, t)); this.timers.push(h); if (this.timers.length > 600) this.timers = this.timers.slice(-300); return h; }
  clearTimers() { this.timers.forEach(clearTimeout); this.timers = []; clearInterval(this.ladderTick); clearInterval(this.dog); }
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
  // Skip only cuts Vince off mid-line. It never ends a question early.
  skip(byId) { if (byId && byId !== this.vip()?.id) return; if (this.phase === 'LOBBY' || !this.sayCue) return; this.cue = null; this.wake('skip'); }
  pause(g, s) { return this.wait(ms(s)).then(() => this.guard(g)); }
  splashOut(k, extra = {}) { this.splashSeq++; this.splash = { id: this.splashSeq, k, ...extra }; this.sync(); }
  note(p, text, kind = 'info') { if (!p || p.bot) return; p.noteSeq++; p.notes.push({ id: p.noteSeq, text, kind }); if (p.notes.length > 4) p.notes.shift(); }

  // ------------------------------------------------------------ Vince
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
    this.progress(); this.sayCue = cue.id;
    const r = await this.wait(cue.audio ? est * 1.7 + 3000 : est * 1.6 + 2500, () => this.cueDone === cue.id);
    this.sayCue = null;
    this.guard(g);
    if (this.cue === cue) { this.cue = null; this.sync(); }
    return r;
  }
  async sayOver(g, text, opts = {}) { if (!strip(text)) return; const cue = await this.makeCue(text, { maxWait: 1500, ...opts }); if (g !== this.runId) return; this.cue = cue; this.lastChat = Date.now(); this.sync(); }
  // banter during a question: never more than one line every few seconds
  chat(text, force = false) { if (!force && Date.now() - this.lastChat < 3800) return; this.lastChat = Date.now(); this.sayOver(this.runId, text, { maxWait: 1200 }); }
  cueFinished(id) { this.cueDone = id; if (this.cue && this.cue.id === id) this.cue = null; this.check(); }

  // ------------------------------------------------------------ lobby
  join(name, token) {
    this.lastActive = Date.now();
    if (token) { const p = this.players.find((x) => x.token === token); if (p) return { player: p }; }
    name = clip(name, 12);
    if (!name) return { error: 'Enter your name' };
    if (/^the house$/i.test(name)) return { error: 'Nice try. Pick another name.' };
    const same = this.players.find((x) => x.name.toLowerCase() === name.toLowerCase());
    if (same && !same.bot && !same.connected) { same.token = uid(); return { player: same }; }
    if (same) return { error: 'That name is taken' };
    if (this.phase !== 'LOBBY') return { error: 'This game has already started. Wait for the next one.' };
    if (this.players.length >= MAX) return { error: `The studio is full (${MAX} players)` };
    const p = this.newPlayer(name, false); this.players.push(p); this.sync();
    return { player: p };
  }
  newPlayer(name, bot, house = false) {
    const used = new Set(this.players.map((x) => x.color));
    const free = this.busts.filter((b) => !this.players.some((x) => x.bust === b));
    return { id: uid(), token: uid(), name, color: house ? '#D4AF37' : COLORS.find((c) => !used.has(c)) || pick(COLORS), connected: true, bot, house, bust: house ? 0 : free.length ? pick(free) : pick(this.busts), notes: [], noteSeq: 0, ...this.fresh() };
  }
  fresh() { return { cash: START, spent: { bribe: 0, sab: 0, copy: 0, other: 0 }, hits: 0, attacks: 0, fooled: 0, rights: 0, minCash: START, dossier: [], shield: false, cheer: false, stopwatch: false, vetos: 0, fxs: [], rung: 0, lift: false, grease: false, lockUntil: 0, lq: null, lastBoo: 0, fxSeq: 0 }; }
  addBot(fromVip = false) {
    if ((!this.test && !fromVip) || this.phase !== 'LOBBY' || this.players.length >= MAX) return { error: 'No room for more bots' };
    const name = BOT_NAMES.find((n) => !this.players.some((p) => p.name === n)) || `Bot ${this.players.length + 1}`;
    this.players.push(this.newPlayer(name, true)); this.sync(); return { ok: true };
  }
  removeBots() { if (this.phase !== 'LOBBY') return; this.players = this.players.filter((p) => !p.bot); this.sync(); }
  setConnected(id, on) { const p = this.P(id); if (p) { p.connected = on; this.lastActive = Date.now(); this.check(); this.sync(); } }
  kick(byId, target) { if (this.phase !== 'LOBBY' || this.vip()?.id !== byId) return; this.players = this.players.filter((p) => p.id !== target); this.hooks.kicked?.(target); this.sync(); }

  start(byId) {
    if (byId && this.vip()?.id !== byId) return { error: 'Only the first player can start' };
    if (this.phase !== 'LOBBY') return {};
    this.players = this.players.filter((p) => p.connected && !p.house);
    const n = this.players.length;
    if (n < MIN) return { error: `RIGGED! needs at least ${MIN} players${this.test ? '. Add some bots on the TV.' : '. Add a bot from the first phone.'}` };
    this.reset();
    this.players.forEach((p) => Object.assign(p, this.fresh()));
    if (n === 2) this.players.push(this.newPlayer('The House', true, true));
    const g = ++this.runId;
    this.startWatchdog(g);
    this.run(g).catch((e) => { if (!(e instanceof Cancelled)) { console.error('rg run error', e); this.setPhase('END', this.ranking()); } });
    return {};
  }
  playAgain(byId) {
    if (this.phase !== 'END' || this.vip()?.id !== byId) return;
    this.runId++; this.clearTimers(); this.players = this.players.filter((p) => p.connected && !p.house);
    this.players.forEach((p) => Object.assign(p, this.fresh()));
    this.cue = null; this.splash = null; this.reset(); this.setPhase('LOBBY', {});
  }
  startWatchdog(g) {
    clearInterval(this.dog); this.progress();
    this.dog = setInterval(() => {
      if (g !== this.runId || this.phase === 'END' || this.phase === 'LOBBY') { clearInterval(this.dog); return; }
      if (Date.now() - this.lastProgress > 120000) { console.error(`rg ${this.code}: stuck in ${this.phase}, moving on`); this.progress(); this.cue = null; this.wake('watchdog'); this.sync(); }
    }, 5000);
  }

  // ------------------------------------------------------------ money
  standings() { return [...this.players].sort((a, b) => b.cash - a.cash || a.name.localeCompare(b.name)); }
  spentTotal(p) { return p.spent.bribe + p.spent.sab + p.spent.copy + p.spent.other; }
  leader() { return this.standings()[0]; }
  lastPlace() { const s = this.standings(); const low = s[s.length - 1].cash; return s.filter((p) => p.cash === low).sort((a, b) => this.spentTotal(a) - this.spentTotal(b))[0]; }
  rule(k) { return this.phase !== 'LADDER' && this.rules.some((r) => r.k === k); }
  price(base, kind) {
    let c = base;
    if (kind === 'sab') { if (this.rule('sale')) c *= 0.5; if (this.q?.dt) c *= 0.5; }
    if (this.rule('taxman')) c *= 1.5;
    return Math.round(c / 10) * 10;
  }
  // every win goes through here: never below zero, Alliance partners share
  earn(p, amt, why = '') {
    if (!p || !amt) return 0;
    amt = Math.round(amt);
    if (amt > 0 && this.alliance && this.alliance.round === this.roundN && this.alliance.pair[p.id] && !why.startsWith('share')) {
      const mate = this.P(this.alliance.pair[p.id]); const half = Math.floor(amt / 2);
      if (mate && half > 0) { this.earn(mate, half, `share:${p.id}`); amt -= half; }
    }
    const before = p.cash; p.cash = Math.max(0, p.cash + amt); const real = p.cash - before;
    p.minCash = Math.min(p.minCash, p.cash);
    this.qd[p.id] = (this.qd[p.id] || 0) + real;
    return real;
  }
  spend(p, cost, cat) { if (p.cash < cost) return false; p.cash -= cost; p.spent[cat] = (p.spent[cat] || 0) + cost; p.minCash = Math.min(p.minCash, p.cash); this.qd[p.id] = (this.qd[p.id] || 0) - cost; return true; }
  mult(p, q) {
    let m = 1;
    if (this.rule('double')) m *= 2;
    if (q?.dt) m *= 2;
    if (this.rule('lastlaugh') && q?.lastAtStart === p.id) m *= 3;
    if (p.cheer) { m *= 2; p.cheer = false; }
    return m;
  }

  // ------------------------------------------------------------ picking content
  draw(kind, list, filter = () => true) {
    let pool = list.filter((x) => !this.seen[kind].has(x.id) && filter(x));
    if (!pool.length) { list.forEach((x) => this.seen[kind].delete(x.id)); pool = list.filter(filter); }
    const it = pick(pool); this.seen[kind].add(it.id); return it;
  }
  mcPick(d, cat) { return this.draw('mc', C.MC, (q) => (!d || q.d === d) && (!cat || q.cat === cat)); }

  // ------------------------------------------------------------ the show
  async run(g) {
    const house = this.players.some((p) => p.house);
    this.setPhase('INTRO', {}); this.sfx('applause');
    await this.say(g, SAY.welcome);
    if (house) { this.sfx('rg-house'); await this.say(g, SAY.welcomeHouse); }
    await this.dossier(g);
    // Round 1: the first question is clean, then the tricks arrive one by one
    await this.roundIntro(g, 1);
    const r1 = [this.mcPick(1), this.mcPick(1), this.mcPick(2), this.mcPick(2)];
    r1.forEach((q) => this.prefetch(q.q));
    for (let i = 0; i < 4; i++) {
      if (i === 1) { await this.demo(g, 'sab', SAY.demoSab); this.unlock.sab = true; await this.demo(g, 'remote', SAY.demoRemote); this.unlock.remote = true; }
      if (i === 2) { await this.demo(g, 'bribe', SAY.demoBribe); this.unlock.bribe = true; }
      if (i === 3) { await this.demo(g, 'copy', SAY.demoCopy); this.unlock.copy = true; }
      await this.mcQ(g, r1[i], i + 1, 4);
    }
    await this.endRound(g);
    await this.roundIntro(g, 2); await this.lieRound(g); await this.endRound(g);
    const lay = this.players.filter((p) => !p.house).length < 3 || house;
    await this.roundIntro(g, 3, lay ? 3.5 : 3); if (lay) await this.layRound(g); else await this.whoRound(g); await this.endRound(g);
    await this.roundIntro(g, 4); await this.bombRound(g); await this.endRound(g);
    await this.roundIntro(g, 5); await this.numRound(g); await this.endRound(g);
    await this.roundIntro(g, 6);
    const r6 = [this.mcPick(2), this.mcPick(2), this.mcPick(3), this.mcPick(3)];
    r6.forEach((q) => this.prefetch(q.q));
    for (let i = 0; i < 4; i++) await this.mcQ(g, r6[i], i + 1, 4, { dt: true });
    this.players.forEach((p) => { p.shield = false; });
    await this.roundIntro(g, 7); await this.ladderRound(g);
    await this.finish(g);
  }
  async roundIntro(g, n, sayKey = n) {
    this.roundN = n; this.players.forEach((p) => { p.shield = false; });
    if (this.alliance && this.alliance.round < n) this.alliance = null;
    this.setPhase('ROUND', { n, name: ROUND_NAMES[n], lay: sayKey === 3.5 }); this.sfx('rg-sting');
    await this.say(g, SAY.round[sayKey]);
    // record the next round's lines while this one plays
    if (SAY.round[n + 1]) this.prefetch(SAY.round[n + 1]);
  }
  async demo(g, key, text) { this.setPhase('DEMO', { key }); this.sfx('whoosh'); await this.say(g, text); }
  async endRound(g) {
    this.alliance = this.alliance && this.alliance.round > this.roundN ? this.alliance : null;
    // the standings, and who gets to pick the next rule
    const s = this.standings();
    this.setPhase('SCORES', { n: this.roundN });
    const last = this.lastPlace();
    const say = this.rule('amnesia') ? line(SAY.amnesiaLie, { name: pick(this.players).name }) : `${line(SAY.leader, { name: s[0].name })} ${line(SAY.bottom, { name: last.name })}`;
    await this.say(g, say);
    await this.pause(g, 1.5);
    if (this.roundN < 6) await this.wheel(g);
  }

  // ------------------------------------------------------------ the Dossier
  async dossier(g) {
    const pool = shuffle(C.DOSSIER);
    let k = 0;
    for (const p of this.players) {
      p.dossier = [0, 1, 2].map(() => { const d = pool[k++ % pool.length]; return { id: d.id, q: d.q, a: null, auto: false, fallback: d.fallback }; });
      if (p.bot) p.dossier.forEach((e) => { e.a = pick(e.fallback); e.auto = true; });
    }
    this.setPhase('DOSSIER', {}, T.dossier);
    this.sayOver(g, SAY.dossier);
    const done = () => this.humans().every((p) => !p.connected || p.dossier.every((e) => e.a));
    const t0 = Date.now();
    const nudge = this.later(g, ms(35), () => { if (this.phase === 'DOSSIER') this.chat(line(SAY.dossierMid), true); });
    await this.wait(ms(T.dossier), done); this.guard(g); clearTimeout(nudge);
    for (const p of this.players) p.dossier.forEach((e) => { if (!e.a) { e.a = pick(e.fallback); e.auto = true; } });
    if (Date.now() - t0 > 3000) { this.setPhase('DOSSIER', { done: true }); await this.say(g, SAY.dossierDone); }
  }

  // ------------------------------------------------------------ questions: the shared machinery
  // Opens a question for the given players. Stopwatch halves someone's time; Copycat shows a rival's pick.
  openQ(kind, secs, ids, extra = {}) {
    const now = Date.now(); const dur = ms(secs);
    const leader = this.leader(); const last = this.lastPlace();
    const q = { kind, seq: ++this.qSeq, open: true, start: now, dur, per: {}, picks: {}, hit: {}, attacked: {}, bribed: {}, hint: {}, peek: {}, spam: {}, rival: {}, fix: {}, copied: {},
      eligible: ids, leaderAtStart: leader?.id, lastAtStart: last?.id, remote: last?.id, remoteUsed: false, dt: this.roundN === 6, pass: false, ...extra };
    for (const id of ids) {
      const p = this.P(id); let per = dur;
      if (p?.stopwatch && TIMED_KINDS.includes(kind)) { per = Math.round(dur / 2); p.stopwatch = false; this.note(p, 'Somebody bought a Stopwatch on you. Half the time on this one!', 'bad'); }
      q.per[id] = now + per;
    }
    q.ends = Math.max(now + 500, ...Object.values(q.per));
    if (this.pending.passphone && ['mc', 'vote', 'who', 'lay', 'num'].includes(kind)) { q.pass = true; this.pending.passphone = false; }
    if (this.rule('copycat') && COPY_KINDS.includes(kind)) for (const id of ids) { const others = ids.filter((x) => x !== id); if (others.length) q.rival[id] = pick(others); }
    this.q = q; this.qd = {};
    return q;
  }
  qDone() { const q = this.q; return !q || q.eligible.every((id) => { const p = this.P(id); return !p || q.picks[id]?.locked || (!p.bot && !p.connected); }); }
  async waitQ(g) { const q = this.q; await this.wait(Math.max(50, q.ends - Date.now() + 400), () => this.qDone()); this.guard(g); this.closeQ(); }
  closeQ() { const q = this.q; if (!q || !q.open) return; q.open = false; for (const id of Object.keys(q.picks)) { const pk = q.picks[id]; if (!pk.locked) { pk.locked = true; pk.lockAt = q.per[id] || q.ends; } } this.sync(); }
  timeLeft(id) { const q = this.q; return q ? (q.per[id] || q.ends) - Date.now() : 0; }
  // the right-or-wrong scoring all the quiz formats share. rows: [{p, right, answered, at}]
  scoreRight(rows, base) {
    const q = this.q; const opp = this.rule('opposite');
    rows.forEach((r) => { r.win = opp ? r.answered && !r.right : r.right; });
    const winners = rows.filter((r) => r.win).sort((a, b) => a.at - b.at);
    if (this.rule('speedtax') && winners.length >= 2) winners[winners.length - 1].taxed = true;
    for (const r of winners) {
      r.p.rights++;
      if (r.taxed) continue;
      let amt = typeof base === 'function' ? base(r) : base;
      amt *= this.mult(r.p, q);
      if (this.rule('hothands') && r.hot) amt *= 2;
      this.earn(r.p, amt, 'right');
    }
    if (this.rule('double')) rows.filter((r) => r.answered && !r.win).forEach((r) => this.earn(r.p, -300 * (q.dt ? 2 : 1), 'wrong'));
    const first = winners[0];
    const notes = [];
    if (first && this.pending.jackpot) { this.pending.jackpot = false; this.earn(first.p, 1000, 'jackpot'); notes.push(line(SAY.jackpotWon, { name: first.p.name })); }
    if (first && this.pending.pot) { const pot = this.pending.pot; this.pending.pot = 0; this.earn(first.p, pot, 'pot'); notes.push(line(SAY.potWon, { name: first.p.name, amount: bucks(pot) })); }
    if (this.rule('bounty')) {
      const L = this.P(q.leaderAtStart); const lr = rows.find((r) => r.p === L && r.win);
      for (const r of winners) if (r.p !== L && L && (!lr || r.at < lr.at) && L.cash > 0) { const take = Math.min(150, L.cash); this.earn(L, -take, 'bounty'); this.earn(r.p, take, 'bounty'); }
    }
    return { winners, notes };
  }
  async afterQ(g) {
    const q = this.q;
    if (this.rule('robin')) {
      const L = this.leader(); const last = this.lastPlace();
      if (L && last && L !== last && L.cash > 0) { const t = Math.min(200, L.cash); L.cash -= t; last.cash += t; this.qd[L.id] = (this.qd[L.id] || 0) - t; this.qd[last.id] = (this.qd[last.id] || 0) + t; this.splashOut('robin', { by: L.id, target: last.id }); }
    }
    if (q?.pass) { this.chat(SAY.passBack, true); }
    if (this.pending.spin) { this.pending.spin = false; await this.wheel(g, true); }
  }

  // ------------------------------------------------------------ trivia
  async mcQ(g, item, n, of, opts = {}) {
    const answers = shuffle([item.right, ...item.wrong]);
    this.cur = { kind: 'mc', item, text: item.q, cat: C.CATS[item.cat], answers, correct: answers.indexOf(item.right), n, of, dt: !!opts.dt };
    const ids = this.players.map((p) => p.id);
    const q = this.openQ('mc', T.mc, ids);
    this.setPhase('Q', { kind: 'mc', step: 'open' }); this.endsAt = q.ends; this.sfx('rg-question');
    this.sayOver(g, item.q, { maxWait: 2500 });
    this.lastChat = Date.now() + 2500;
    const tick = this.later(g, Math.max(0, q.ends - Date.now() - 5000), () => { if (this.q === q && q.open && !this.qDone()) this.chat(line(SAY.lastSecs)); });
    await this.waitQ(g); clearTimeout(tick);
    // score it
    const rows = ids.map((id) => {
      const p = this.P(id); const pk = q.picks[id];
      const answered = !!pk; const right = answered && pk.v === this.cur.correct;
      return { p, right, answered, at: pk ? pk.lockAt : Infinity, hot: pk && pk.lockAt - q.start <= 3000 * SPEED, pk };
    });
    const { winners, notes } = this.scoreRight(rows, (r) => 300 + Math.round(200 * Math.max(0, 1 - (r.at - q.start) / Math.max(1, (q.per[r.p.id] || q.ends) - q.start)) / 10) * 10);
    const copiedWrong = rows.filter((r) => r.pk?.copied && !r.right).map((r) => line(SAY.copyWrong, { by: r.p.name, target: this.nameOf(r.pk.copied) }));
    this.rev = { correct: this.cur.correct, picks: Object.fromEntries(rows.filter((r) => r.pk).map((r) => [r.p.id, r.pk.v])), deltas: { ...this.qd }, winners: winners.map((w) => w.p.id) };
    this.setPhase('Q', { kind: 'mc', step: 'reveal' }); this.sfx(winners.length ? 'rg-ding' : 'rg-buzzer');
    const answer = item.right;
    const right = rows.filter((r) => r.right);
    let say = line(SAY.reveal, { answer });
    if (!right.length) say += ` ${line(SAY.nobody)}`;
    else if (right.length === 1 && rows.length > 2) say += ` ${line(SAY.oneRight, { name: right[0].p.name })}`;
    else if (right.length === rows.length && rows.length > 2) say += ` ${line(SAY.everyone)}`;
    if (copiedWrong.length) say += ` ${copiedWrong[0]}`;
    if (notes.length) say += ` ${notes.join(' ')}`;
    await this.say(g, say);
    await this.afterQ(g); this.rev.deltas = { ...this.qd };
    this.sync(); await this.pause(g, T.reveal);
    await this.scoreLine(g);
  }
  // now and then Vince says who's winning (or lies about it)
  async scoreLine(g) {
    if (Math.random() > 0.3) return;
    if (this.rule('amnesia')) this.chat(line(SAY.amnesiaLie, { name: pick(this.players).name }), true);
    else this.chat(line(SAY.leader, { name: this.leader().name }), true);
  }

  // ------------------------------------------------------------ Round 2: Lie Detector
  async lieRound(g) {
    const facts = [this.draw('lie', C.LIES), this.draw('lie', C.LIES)];
    facts.forEach((f) => this.prefetch(f.q.replace('___', 'blank')));
    for (let i = 0; i < facts.length; i++) await this.lieQ(g, facts[i], i + 1, facts.length);
  }
  async lieQ(g, fact, n, of) {
    const ids = this.players.map((p) => p.id);
    this.cur = { kind: 'write', fact, text: fact.q, n, of };
    const decoys = shuffle(fact.decoys);
    const lies = {}; // pid -> text
    const q = this.openQ('write', T.write, ids.filter((id) => !this.P(id).house), { lies, vinceLie: decoys[0], spare: decoys.slice(1) });
    this.setPhase('Q', { kind: 'write', step: 'open' }); this.endsAt = q.ends; this.sfx('rg-question');
    this.sayOver(g, `${fact.q.replace('___', 'blank')} ${line(SAY.lieWrite)}`, { maxWait: 2500 });
    await this.waitQ(g);
    // the House (or Vince) lies too; quiet players get a stand-in lie
    const used = new Set([norm(fact.a), ...Object.values(lies).map(norm)]);
    const vinceLie = q.vinceLie; used.add(norm(vinceLie));
    const nextDecoy = () => { const d = q.spare.find((x) => !used.has(norm(x))); if (d) used.add(norm(d)); return d || null; };
    for (const id of q.eligible) if (!lies[id] && !this.P(id).bot) { const d = nextDecoy(); if (d) lies[id] = d; }
    const fixed = new Set(Object.keys(q.fix));
    // options: merge identical lies, Fix the Fact ones go first in bold
    const groups = [];
    const add = (text, author, extra = {}) => { const k = norm(text); let gr = groups.find((x) => norm(x.text) === k); if (!gr) { gr = { id: `o${groups.length}`, text, authors: [], voters: [], ...extra }; groups.push(gr); } if (author) gr.authors.push(author); if (extra.vince) gr.vince = true; if (extra.truth) gr.truth = true; if (author && fixed.has(author)) gr.bold = true; return gr; };
    const truth = add(fact.a, null, { truth: true });
    const house = this.players.find((p) => p.house);
    add(vinceLie, house ? house.id : null, { vince: true });
    for (const id of q.eligible) if (lies[id]) add(lies[id], id);
    const opts = [...shuffle(groups.filter((x) => x.bold)), ...shuffle(groups.filter((x) => !x.bold))];
    this.cur = { kind: 'vote', fact, text: fact.q, n, of, opts: opts.map((o) => ({ id: o.id, text: o.text, bold: !!o.bold })) };
    this.cur.groups = opts;
    const vq = this.openQ('vote', T.vote, ids);
    this.setPhase('Q', { kind: 'vote', step: 'open' }); this.endsAt = vq.ends; this.sfx('whoosh');
    this.sayOver(g, line(SAY.lieVote));
    await this.waitQ(g);
    for (const id of ids) { const pk = vq.picks[id]; if (pk) { const gr = opts.find((o) => o.id === pk.v); if (gr) gr.voters.push(id); } }
    // money
    const rows = ids.map((id) => { const pk = vq.picks[id]; return { p: this.P(id), answered: !!pk, right: !!pk && pk.v === truth.id, at: pk ? pk.lockAt : Infinity }; });
    const { notes } = this.scoreRight(rows, 500);
    for (const gr of opts) {
      if (gr.truth) continue;
      for (const v of gr.voters) {
        const voter = this.P(v);
        if (gr.vince) { this.earn(voter, -200, 'vince'); if (house) this.earn(house, 200, 'fooled'); }
        for (const a of gr.authors) { if (a === v) continue; const au = this.P(a); if (au && !au.house) { this.earn(au, 300, 'fooled'); au.fooled++; } else if (au?.house && !gr.vince) this.earn(au, 300, 'fooled'); }
      }
    }
    // the reveal: every lie that fooled someone, then the truth
    const reveal = opts.filter((o) => !o.truth && o.voters.length).sort((a, b) => a.voters.length - b.voters.length);
    this.rev = { groups: opts.map((o) => ({ id: o.id, text: o.text, authors: o.authors, voters: o.voters, truth: !!o.truth, vince: !!o.vince })), shown: [], deltas: {} };
    for (const gr of reveal) {
      this.rev.shown.push(gr.id); this.setPhase('Q', { kind: 'vote', step: 'reveal', at: gr.id }); this.sfx('rg-buzzer');
      const names = listNames(gr.voters.map((v) => this.nameOf(v)));
      if (gr.vince) await this.say(g, line(SAY.lieVince, { names }));
      else await this.say(g, line(SAY.lieFooled, { names, author: listNames(gr.authors.map((a) => this.nameOf(a))) }));
    }
    this.rev.shown.push(truth.id); this.rev.deltas = { ...this.qd };
    this.setPhase('Q', { kind: 'vote', step: 'reveal', at: truth.id, truth: true }); this.sfx('rg-ding');
    await this.say(g, `${line(SAY.lieTruth, { answer: fact.a })}${notes.length ? ` ${notes.join(' ')}` : ''}`);
    await this.afterQ(g); this.rev.deltas = { ...this.qd }; this.sync();
    await this.pause(g, T.reveal);
  }
  writeLie(me, text) {
    const q = this.q; if (!q || !q.open || q.kind !== 'write' || !q.eligible.includes(me.id)) return {};
    if (Date.now() > q.per[me.id] + GRACE) return { error: "Time's up" };
    const t = clip(text, 40); if (!t) return { error: 'Write something!' };
    if (tooClose(t, this.cur.fact.a)) return { error: "That's the real answer! Write a fake one.", truth: true };
    q.lies[me.id] = t; q.picks[me.id] = { v: t, locked: true, lockAt: Date.now() }; this.check(); this.sync(); return { ok: true };
  }

  // ------------------------------------------------------------ Round 3: Who In This Room? (or Lie About Yourself, with 2 players)
  async whoRound(g) {
    const cands = shuffle(this.players.filter((p) => !p.house));
    const items = [];
    // one answer from as many different people as possible, real answers first
    for (let pass = 0; pass < 3 && items.length < 4; pass++) for (const p of cands) { if (items.length >= 4) break; const real = p.dossier.filter((e) => !e.auto && !e.used); const e = (real.length ? pick(real) : pick(p.dossier.filter((x) => !x.used))); if (e) { e.used = true; items.push({ p, e }); } }
    for (let i = 0; i < items.length; i++) {
      const { p: author, e } = items[i];
      const ids = this.players.filter((x) => !x.house && x !== author).map((x) => x.id);
      const choices = this.players.filter((x) => !x.house).map((x) => x.id);
      this.cur = { kind: 'who', text: e.q, answer: e.a, choices, n: i + 1, of: items.length, author: author.id };
      const q = this.openQ('who', T.who, ids);
      this.setPhase('Q', { kind: 'who', step: 'open' }); this.endsAt = q.ends; this.sfx('rg-question');
      this.sayOver(g, `${e.q} "${e.a}". ${line(SAY.whoAsk)}`, { maxWait: 2500 });
      await this.waitQ(g);
      const rows = ids.map((id) => { const pk = q.picks[id]; return { p: this.P(id), answered: !!pk, right: !!pk && pk.v === author.id, at: pk ? pk.lockAt : Infinity }; });
      const { notes } = this.scoreRight(rows, 400);
      const fooled = rows.filter((r) => r.answered && !r.right).length;
      if (fooled) { this.earn(author, 100 * fooled, 'fooled'); author.fooled += fooled; }
      this.rev = { author: author.id, picks: Object.fromEntries(rows.filter((r) => r.answered).map((r) => [r.p.id, q.picks[r.p.id].v])), deltas: { ...this.qd } };
      this.setPhase('Q', { kind: 'who', step: 'reveal' }); this.sfx('rg-reveal');
      await this.say(g, `${line(SAY.whoReveal, { name: author.name })}${notes.length ? ` ${notes.join(' ')}` : ''}`);
      await this.afterQ(g); this.rev.deltas = { ...this.qd }; this.sync();
      await this.pause(g, T.reveal);
    }
  }
  async layRound(g) {
    const people = this.players; // both players and the House
    const items = people.map((p) => { const real = p.dossier.filter((e) => !e.auto); return { p, e: real.length ? pick(real) : pick(p.dossier), fake: null }; });
    // write a fake answer next to your real one
    this.cur = { kind: 'laywrite', items: items.map((it) => ({ id: it.p.id, q: it.e.q, a: it.e.a })) };
    const q = this.openQ('laywrite', T.layWrite, people.filter((p) => !p.bot).map((p) => p.id), { fakes: {} });
    this.setPhase('Q', { kind: 'laywrite', step: 'open' }); this.endsAt = q.ends; this.sfx('rg-question');
    this.sayOver(g, line(SAY.layWrite));
    await this.waitQ(g);
    for (const it of items) {
      it.fake = q.fakes[it.p.id] || pick(it.e.fallback.filter((f) => norm(f) !== norm(it.e.a))) || 'I plead the fifth';
    }
    for (let i = 0; i < items.length; i++) {
      const it = items[i]; const real = Math.random() < 0.5 ? 0 : 1;
      const pair = real === 0 ? [it.e.a, it.fake] : [it.fake, it.e.a];
      const ids = people.filter((p) => p !== it.p).map((p) => p.id);
      this.cur = { kind: 'lay', text: it.e.q, pair, owner: it.p.id, n: i + 1, of: items.length };
      const vq = this.openQ('lay', T.who, ids);
      this.setPhase('Q', { kind: 'lay', step: 'open' }); this.endsAt = vq.ends; this.sfx('rg-question');
      this.sayOver(g, `${it.e.q} ${line(SAY.layAsk, { name: it.p.name })}`, { maxWait: 2500 });
      await this.waitQ(g);
      const rows = ids.map((id) => { const pk = vq.picks[id]; return { p: this.P(id), answered: !!pk, right: !!pk && pk.v === real, at: pk ? pk.lockAt : Infinity }; });
      const { notes } = this.scoreRight(rows, 400);
      const fooled = rows.filter((r) => r.answered && !r.right).length;
      if (fooled) { this.earn(it.p, 100 * fooled, 'fooled'); it.p.fooled += fooled; }
      this.rev = { real, picks: Object.fromEntries(rows.filter((r) => r.answered).map((r) => [r.p.id, vq.picks[r.p.id].v])), deltas: { ...this.qd } };
      this.setPhase('Q', { kind: 'lay', step: 'reveal' }); this.sfx('rg-reveal');
      await this.say(g, `${it.p.name} really wrote "${it.e.a}".${notes.length ? ` ${notes.join(' ')}` : ''}`);
      await this.afterQ(g); this.rev.deltas = { ...this.qd }; this.sync();
      await this.pause(g, T.reveal);
    }
  }
  layFake(me, text) {
    const q = this.q; if (!q || !q.open || q.kind !== 'laywrite' || !q.eligible.includes(me.id)) return {};
    const t = clip(text, 60); if (!t) return { error: 'Write something!' };
    const mine = this.cur.items.find((x) => x.id === me.id);
    if (mine && norm(mine.a) === norm(t)) return { error: "That's your real answer. Make one up!" };
    q.fakes[me.id] = t; q.picks[me.id] = { v: t, locked: true, lockAt: Date.now() }; this.check(); this.sync(); return { ok: true };
  }

  // ------------------------------------------------------------ Round 4: The Bomb
  async bombRound(g) {
    const seats = this.players;
    let at = Math.floor(Math.random() * seats.length);
    for (let b = 1; b <= 3; b++) {
      let passes = 0;
      this.cur = { kind: 'bomb', n: b, of: 3, holder: seats[at].id, passes: 0, fuse: 8, text: '', boom: null };
      this.setPhase('Q', { kind: 'bomb', step: 'start' }); this.sfx('rg-fuse');
      await this.say(g, line(SAY.bombStart, { n: b, name: seats[at].name }));
      for (;;) {
        const holder = seats[at];
        const st = this.draw('tf', C.TF);
        const fuse = passes >= 16 ? 2 : Math.max(3, 8 - passes);
        this.cur = { kind: 'bomb', n: b, of: 3, holder: holder.id, passes, fuse, text: st.q, st, boom: null };
        const q = this.openQ('bomb', fuse, [holder.id]);
        this.setPhase('Q', { kind: 'bomb', step: 'open' }); this.endsAt = q.ends; this.sfx('rg-tick');
        await this.waitQ(g);
        const pk = q.picks[holder.id];
        if (pk && pk.v === st.a) {
          const amt = 200 * this.mult(holder, q); this.earn(holder, amt, 'pass'); holder.rights++;
          passes++; at = (at + 1) % seats.length; this.sfx('rg-pass');
          if (passes % 3 === 0) this.chat(line(SAY.bombPass));
          continue;
        }
        // boom
        this.earn(holder, -500, 'boom');
        this.cur = { ...this.cur, boom: holder.id, answer: st.a, picked: pk ? pk.v : null };
        this.rev = { deltas: { ...this.qd } };
        this.setPhase('Q', { kind: 'bomb', step: 'boom' }); this.sfx('rg-boom');
        await this.say(g, line(SAY.bombBoom, { name: holder.name }));
        await this.afterQ(g); this.sync();
        await this.pause(g, 1.6);
        at = (at + 1) % seats.length;
        break;
      }
    }
  }

  // ------------------------------------------------------------ Round 5: Closest Number
  async numRound(g) {
    const qs = [this.draw('num', C.NUM), this.draw('num', C.NUM), this.draw('num', C.NUM)];
    qs.forEach((x) => this.prefetch(`${x.q} Guess a number.`));
    for (let i = 0; i < qs.length; i++) await this.numQ(g, qs[i], i + 1, qs.length);
  }
  async numQ(g, item, n, of) {
    const ids = this.players.map((p) => p.id);
    this.cur = { kind: 'num', item, text: item.q, unit: item.unit, n, of };
    const q = this.openQ('num', T.num, ids);
    this.setPhase('Q', { kind: 'num', step: 'open' }); this.endsAt = q.ends; this.sfx('rg-question');
    this.sayOver(g, line(SAY.numAsk, { q: item.q }), { maxWait: 2500 });
    await this.waitQ(g);
    const guesses = {}; for (const id of ids) if (q.picks[id] && Number.isFinite(q.picks[id].v)) guesses[id] = q.picks[id].v;
    // a side bet on who will be the furthest off
    this.cur = { ...this.cur, kind: 'bet', guesses };
    const bq = this.openQ('bet', T.bet, ids.filter((id) => this.P(id).cash >= 100), { bets: {} });
    this.setPhase('Q', { kind: 'bet', step: 'open' }); this.endsAt = bq.ends;
    this.sayOver(g, line(SAY.numBet));
    await this.waitQ(g);
    const bets = {}; for (const id of Object.keys(bq.picks)) { const v = bq.picks[id].v; if (v && this.P(v)) bets[id] = v; }
    this.q = q; this.qd = {};
    for (const id of Object.keys(bets)) this.spend(this.P(id), 100, 'other');
    // rank by distance; Opposite Day flips it
    const dist = Object.entries(guesses).map(([id, v]) => ({ id, v, d: Math.abs(v - item.a) })).sort((a, b) => a.d - b.d);
    const opp = this.rule('opposite');
    const order = opp ? [...dist].reverse() : dist;
    const notes = [];
    if (order.length) {
      const firstD = order[0].d; const firsts = order.filter((x) => x.d === firstD);
      const rest = order.filter((x) => x.d !== firstD); const secondD = rest[0]?.d; const seconds = rest.filter((x) => x.d === secondD);
      for (const x of firsts) { const p = this.P(x.id); p.rights++; this.earn(p, 600 * this.mult(p, q), 'closest'); }
      if (firsts.length === 1) for (const x of seconds) { const p = this.P(x.id); this.earn(p, 300 * this.mult(p, q), 'second'); }
      const fp = this.P(firsts[0].id);
      if (this.pending.jackpot) { this.pending.jackpot = false; this.earn(fp, 1000, 'jackpot'); notes.push(line(SAY.jackpotWon, { name: fp.name })); }
      if (this.pending.pot) { const pot = this.pending.pot; this.pending.pot = 0; this.earn(fp, pot, 'pot'); notes.push(line(SAY.potWon, { name: fp.name, amount: bucks(pot) })); }
    }
    const maxD = dist.length ? dist[dist.length - 1].d : null; const furthest = dist.filter((x) => x.d === maxD).map((x) => x.id);
    for (const [id, on] of Object.entries(bets)) if (furthest.includes(on)) this.earn(this.P(id), 400, 'bet');
    this.cur = { ...this.cur, kind: 'num', answer: item.a };
    this.rev = { answer: item.a, list: dist, bets, furthest, closest: order.length ? order.filter((x) => x.d === order[0].d).map((x) => x.id) : [], deltas: { ...this.qd } };
    this.setPhase('Q', { kind: 'num', step: 'reveal' }); this.sfx('rg-reveal');
    let say = line(SAY.numReveal, { answer: Number.isInteger(item.a) && item.unit ? bucks(item.a) : String(item.a) });
    if (this.rev.closest.length) say += ` ${line(SAY.numClosest, { name: listNames(this.rev.closest.map((id) => this.nameOf(id))) })}`;
    if (furthest.length && dist.length > 1) say += ` ${line(SAY.numFurthest, { name: listNames(furthest.map((id) => this.nameOf(id))) })}`;
    if (notes.length) say += ` ${notes.join(' ')}`;
    await this.say(g, say);
    await this.afterQ(g); this.rev.deltas = { ...this.qd }; this.sync();
    await this.pause(g, T.reveal);
  }

  // ------------------------------------------------------------ the Rule Wheel
  deal(n = 3) {
    const live = new Set(this.rules.map((r) => r.k));
    const pool = Object.keys(C.RULES).filter((k) => !live.has(k) && k !== this.lastCard && !(k === 'passphone' && !this.settings.passPhone) && !(k === 'alliance' && (this.roundN >= 6 || this.players.length < 3)) && !(k === 'switch' && this.players.length < 2));
    const out = [];
    while (out.length < n && pool.length) {
      const w = pool.map((k) => (C.RULES[k].type === 'lasting' ? 3 : 1.6)); const tot = w.reduce((a, b) => a + b, 0);
      let r = Math.random() * tot; let i = 0; for (; i < pool.length; i++) { r -= w[i]; if (r <= 0) break; }
      out.push(pool.splice(Math.min(i, pool.length - 1), 1)[0]);
    }
    return out;
  }
  async wheel(g, spun = false) {
    const picker = this.lastPlace();
    const offer = this.deal(3); if (!offer.length) return;
    this.setPhase('WHEEL', { step: 'pick', picker: picker.id, offer, spun }, T.wheel); this.sfx('rg-wheel');
    this.sayOver(g, line(SAY.wheel, { name: picker.name }));
    this.wheelPick = null;
    await this.wait(ms(T.wheel), () => !!this.wheelPick); this.guard(g);
    const k = this.wheelPick || pick(offer);
    // anyone holding a Veto gets a few seconds to kill it
    const holders = this.players.filter((p) => p.vetos > 0);
    if (holders.length) {
      this.vetoBy = null; this.vetoPass = new Set();
      this.setPhase('WHEEL', { step: 'veto', picker: picker.id, card: k, holders: holders.map((p) => p.id) }, T.veto);
      await this.wait(ms(T.veto), () => !!this.vetoBy || holders.every((p) => this.vetoPass.has(p.id) || (!p.bot && !p.connected))); this.guard(g);
      if (this.vetoBy) {
        const v = this.P(this.vetoBy); v.vetos--; this.lastCard = k;
        this.setPhase('WHEEL', { step: 'vetoed', card: k, by: v.id }); this.sfx('rg-buzzer');
        await this.say(g, line(SAY.vetoed, { by: v.name })); return;
      }
    }
    this.lastCard = k;
    const R = C.RULES[k];
    this.setPhase('WHEEL', { step: 'card', card: k, picker: picker.id }); this.sfx('rg-card');
    await this.say(g, `${line(SAY.wheelPicked, { name: picker.name, card: R.name })} ${R.text}`);
    await this.applyCard(g, k);
  }
  async applyCard(g, k) {
    const R = C.RULES[k];
    if (R.type === 'lasting') {
      this.rules.push({ k, at: Date.now() });
      if (this.rules.length > 3) { const off = this.rules.shift(); this.setPhase('WHEEL', { step: 'off', card: off.k }); await this.say(g, fill(SAY.ruleOff, { card: C.RULES[off.k].name })); }
      this.sync(); return;
    }
    const ps = this.players;
    if (k === 'chairs') { const cash = ps.map((p) => p.cash); ps.forEach((p, i) => { p.cash = cash[(i + 1) % ps.length]; p.minCash = Math.min(p.minCash, p.cash); }); this.setPhase('WHEEL', { step: 'did', card: k }); this.sfx('rg-swap'); await this.say(g, SAY.chairs); }
    if (k === 'switch') { const [a, b] = shuffle(ps).slice(0, 2); [a.cash, b.cash] = [b.cash, a.cash]; a.minCash = Math.min(a.minCash, a.cash); b.minCash = Math.min(b.minCash, b.cash); this.setPhase('WHEEL', { step: 'did', card: k, a: a.id, b: b.id }); this.sfx('rg-swap'); await this.say(g, fill(SAY.switch, { name: a.name, target: b.name })); }
    if (k === 'passphone') { this.pending.passphone = true; this.setPhase('WHEEL', { step: 'did', card: k }); await this.say(g, SAY.passphone); }
    if (k === 'alliance') {
      const sh = shuffle(ps); const pair = {};
      for (let i = 0; i + 1 < sh.length; i += 2) { pair[sh[i].id] = sh[i + 1].id; pair[sh[i + 1].id] = sh[i].id; }
      this.alliance = { round: this.roundN + 1, pair };
      this.setPhase('WHEEL', { step: 'did', card: k, pairs: Object.entries(pair).filter(([a, b]) => a < b) }); await this.say(g, SAY.alliance);
    }
    if (k === 'jackpot') { this.pending.jackpot = true; this.setPhase('WHEEL', { step: 'did', card: k }); await this.say(g, SAY.jackpot); }
    if (k === 'house') { let pot = 0; for (const p of ps) { const t = Math.round(p.cash * 0.1 / 10) * 10; p.cash -= t; pot += t; } this.pending.pot += pot; this.setPhase('WHEEL', { step: 'did', card: k, pot: this.pending.pot }); this.sfx('rg-cash'); await this.say(g, SAY.house); }
  }

  // ------------------------------------------------------------ the finale: the Rigged Ladder
  async ladderRound(g) {
    const L = { start: Date.now(), ends: Date.now() + ms(T.ladder), winner: null, votes: {}, log: [] };
    this.ladder = L; this.q = null; this.cur = { kind: 'ladder' };
    for (const p of this.players) { p.rung = 0; p.lockUntil = 0; p.lq = null; p.lift = false; p.grease = false; p.wait = null; this.ladderAsk(p, 2, pick(Object.keys(C.CATS))); }
    this.setPhase('LADDER', { step: 'climb' }); this.endsAt = L.ends; this.sfx('rg-go');
    this.sayOver(g, SAY.ladderGo);
    clearInterval(this.ladderTick);
    this.ladderTick = setInterval(() => { try { if (g !== this.runId) { clearInterval(this.ladderTick); return; } this.ladderStep(g); } catch (e) { console.error('rg ladder', e); } }, 250);
    await this.wait(ms(T.ladder) + 200, () => !!L.winner); this.guard(g);
    clearInterval(this.ladderTick);
    L.done = true;
    if (L.winner) { const w = this.P(L.winner); this.setPhase('LADDER', { step: 'top', who: w.id }); this.sfx('rg-fanfare'); await this.say(g, fill(SAY.ladderTop, { name: w.name })); }
    else { this.setPhase('LADDER', { step: 'time' }); this.sfx('rg-buzzer'); await this.say(g, SAY.ladderTime); }
    await this.pause(g, 1.5);
  }
  ladderAsk(p, d, cat) {
    const item = this.mcPick(d, cat);
    const answers = shuffle([item.right, ...item.wrong]);
    p.lq = { id: item.id, item, cat, d, text: item.q, answers, correct: answers.indexOf(item.right), at: Date.now(), seq: (p.lq?.seq || 0) + 1 };
    p.wait = null;
    if (p.bot) p.botAt = Date.now() + ms((p.house ? 2.2 : 2.6) + Math.random() * (p.house ? 2 : 3.5)) * BOT_PACE;
  }
  ladderClimb(p, by = 'right') {
    const L = this.ladder; if (!L || L.winner || L.done) return;
    p.rung = Math.min(LADDER_RUNGS, p.rung + 1); this.earn(p, RUNG_PAY, 'rung'); this.sfx('rg-climb');
    if (p.rung >= LADDER_RUNGS) { L.winner = p.id; this.earn(p, TOP_PAY, 'top'); this.check(); return; }
    if (by === 'lift') return;
    // the room picks your next category: easy, medium or brutal
    const cats = shuffle(Object.keys(C.CATS)).slice(0, 3);
    p.lq = null;
    p.wait = { until: Date.now() + ms(T.catVote), offer: [{ cat: cats[0], d: 1 }, { cat: cats[1], d: 2 }, { cat: cats[2], d: 3 }], votes: {}, seq: (p.wait?.seq || 0) + 1 };
    this.sync();
  }
  ladderResolve(p) {
    const w = p.wait; if (!w) return;
    const tally = [0, 0, 0]; Object.values(w.votes).forEach((i) => { tally[i]++; });
    const top = Math.max(...tally); const best = [0, 1, 2].filter((i) => tally[i] === top);
    const ch = w.offer[pick(best)];
    p.lastCat = { ...ch, votes: tally };
    this.ladderAsk(p, ch.d, ch.cat); this.sync();
  }
  ladderStep(g) {
    const L = this.ladder; if (!L || L.done || L.winner) return;
    const now = Date.now(); this.progress();
    if (now >= L.ends) { this.check(); this.wake('time'); return; }
    for (const p of this.players) {
      if (p.wait) {
        const voters = this.players.filter((x) => x !== p && (x.bot || x.connected));
        if (now >= p.wait.until || voters.every((x) => p.wait.votes[x.id] !== undefined)) this.ladderResolve(p);
      }
    }
    // bots
    for (const b of this.players.filter((x) => x.bot)) {
      for (const p of this.players) if (p !== b && p.wait && p.wait.votes[b.id] === undefined && Math.random() < 0.25) {
        const lead = [...this.players].sort((x, y) => y.rung - x.rung)[0];
        p.wait.votes[b.id] = p === lead || (b.house && Math.random() < 0.8) ? 2 : Math.floor(Math.random() * 3);
      }
      if (b.lq && now >= b.botAt && now >= b.lockUntil) {
        const acc = { 1: 0.82, 2: 0.62, 3: 0.42 }[b.lq.d] + (b.house ? 0.03 : 0);
        this.ladderAnswer(b, Math.random() < acc ? b.lq.correct : pick([0, 1, 2, 3].filter((i) => i !== b.lq.correct)), b.lq.seq);
      }
      if (!b.lift && b.cash >= LIFT + 600 && b.rung <= 5 && Math.random() < 0.004) this.ladderBuy(b, 'lift');
      if (!b.grease && b.cash >= GREASE + 400 && Math.random() < 0.004) { const lead = [...this.players].filter((x) => x !== b).sort((x, y) => y.rung - x.rung)[0]; if (lead && lead.rung >= b.rung + 1) this.ladderBuy(b, 'grease', lead.id); }
      const holder = this.lastPlace();
      if (holder === b && now - b.lastBoo > ms(20) && Math.random() < 0.01) { const lead = [...this.players].filter((x) => x !== b).sort((x, y) => y.rung - x.rung)[0]; if (lead) this.ladderBoo(b, lead.id); }
    }
  }
  ladderAnswer(p, i, seq) {
    const L = this.ladder; if (!L || L.done || L.winner || !p.lq) return {};
    if (seq !== undefined && seq !== p.lq.seq) return { stale: true };
    if (Date.now() < p.lockUntil) return { error: 'Locked out for a moment!' };
    if (i === p.lq.correct) { p.rights++; this.ladderClimb(p); } else { p.lockUntil = Date.now() + ms(3); this.sfx('rg-buzzer'); this.note(p, 'Wrong! Wait 3 seconds.', 'bad'); this.ladderAsk(p, p.lq.d, p.lq.cat); p.lockUntil = Date.now() + ms(3); }
    this.sync(); return { ok: true };
  }
  ladderBuy(p, what, target) {
    const L = this.ladder; if (!L || L.done || L.winner) return {};
    if (what === 'lift') {
      if (p.lift) return { error: 'You already used your Lift' };
      if (!this.spend(p, LIFT, 'other')) return { error: `A Lift costs $${bucks(LIFT)}` };
      p.lift = true; this.splashOut('lift', { by: p.id }); this.chat(fill(SAY.ladderLift, { name: p.name }), true);
      this.ladderClimb(p, 'lift'); this.sync(); return { ok: true };
    }
    if (what === 'grease') {
      const t = this.P(target); if (!t || t === p) return { error: 'Pick a rival' };
      if (p.grease) return { error: 'You already used your Grease' };
      if (t.rung <= 0) return { error: `${t.name} is already on the floor` };
      if (!this.spend(p, GREASE, 'other')) return { error: `Grease costs $${bucks(GREASE)}` };
      p.grease = true; t.rung--; t.hits++; this.splashOut('grease', { by: p.id, target: t.id }); this.sfx('rg-slip'); this.chat(fill(SAY.ladderGrease, { by: p.name, target: t.name }), true);
      this.note(t, `${p.name} greased your rung! Down one.`, 'bad'); this.sync(); return { ok: true };
    }
    return {};
  }
  ladderBoo(p, target) {
    if (this.lastPlace() !== p) return { error: 'Only last place holds the remote' };
    if (Date.now() - p.lastBoo < ms(20)) return { error: 'The remote is recharging' };
    const t = this.P(target); if (!t || t === p) return {};
    p.lastBoo = Date.now(); t.lockUntil = Math.max(t.lockUntil, Date.now() + ms(5)); t.hits++;
    this.splashOut('boo', { by: p.id, target: t.id }); this.sfx('boo'); this.chat(line(SAY.boo, { by: p.name, target: t.name }), true);
    this.note(t, `${p.name} booed you! Frozen for 5 seconds.`, 'bad'); this.sync(); return { ok: true };
  }
  ladderVote(me, forId, i) { const p = this.P(forId); if (!p || p === me || !p.wait || p.wait.votes[me.id] !== undefined || ![0, 1, 2].includes(i)) return {}; p.wait.votes[me.id] = i; this.sync(); return { ok: true }; }

  // ------------------------------------------------------------ the end
  async finish(g) {
    this.q = null; this.cur = null; this.roundN = 8;
    this.setPhase('END', { step: 'count', ...this.ranking() });
    await this.say(g, SAY.results);
    const r = this.ranking();
    this.setPhase('END', { step: 'ranks', ...r }); this.sfx('rg-fanfare');
    const top = r.ranks[0];
    await this.say(g, top?.house ? SAY.houseWins : fill(SAY.winner, { name: top?.name || 'Nobody', amount: bucks(top?.cash || 0) }));
    await this.pause(g, 2);
    await this.say(g, SAY.goodnight);
  }
  ranking() {
    const ranks = this.standings().map((p) => ({ ...this.pub(p), cash: p.cash }));
    const awards = []; const ps = this.players.filter((p) => !p.house);
    const most = (f) => [...ps].sort((a, b) => f(b) - f(a))[0];
    const br = most((p) => p.spent.bribe); if (br?.spent.bribe) awards.push({ title: C.AWARD_TITLES.briber, who: br.id, text: `$${bucks(br.spent.bribe)} in bribes` });
    const hit = most((p) => p.hits); if (hit?.hits) awards.push({ title: C.AWARD_TITLES.hit, who: hit.id, text: `Hit ${hit.hits} times` });
    const liar = most((p) => p.fooled); if (liar?.fooled) awards.push({ title: C.AWARD_TITLES.liar, who: liar.id, text: `Fooled people ${liar.fooled} times` });
    const back = most((p) => p.cash - p.minCash); if (back && back.cash - back.minCash > 500) awards.push({ title: C.AWARD_TITLES.comeback, who: back.id, text: `Up $${bucks(back.cash - back.minCash)} from rock bottom` });
    const atk = most((p) => p.attacks); if (atk?.attacks && awards.length < 4) awards.push({ title: C.AWARD_TITLES.attacker, who: atk.id, text: `${atk.attacks} attacks` });
    const brain = most((p) => p.rights); if (brain?.rights && awards.length < 4) awards.push({ title: C.AWARD_TITLES.brain, who: brain.id, text: `${brain.rights} right answers` });
    return { ranks, awards: awards.slice(0, 4), houseWon: !!ranks[0]?.house };
  }

  // ------------------------------------------------------------ what players do
  act(pid, a) {
    const me = this.P(pid); if (!me) return { error: 'Not in a game' };
    this.lastActive = Date.now();
    switch (a.type) {
      case 'start': return this.start(pid);
      case 'again': this.playAgain(pid); return {};
      case 'menu': if (this.phase === 'END' && this.vip()?.id === pid) this.hooks.menu?.(); return {};
      case 'skip': this.skip(pid); return {};
      case 'addBot': if (this.phase === 'LOBBY' && this.vip()?.id === pid) return this.addBot(true); return {};
      case 'removeBots': if (this.phase === 'LOBBY' && this.vip()?.id === pid) this.removeBots(); return {};
      case 'kick': this.kick(pid, a.id); return {};
      case 'setting': if (this.phase === 'LOBBY' && this.vip()?.id === pid && a.k === 'passPhone') { this.settings.passPhone = !!a.v; this.sync(); } return {};
      case 'dossier': {
        if (this.phase !== 'DOSSIER') return {};
        const e = me.dossier[a.i]; if (!e) return {};
        const t = clip(a.text, 60); if (!t) return { error: 'Write something!' };
        e.a = t; e.auto = false; this.check(); this.sync(); return { ok: true };
      }
      case 'answer': return this.answer(me, a.v, !!a.lock, a.seq);
      case 'lock': return this.answer(me, undefined, true, a.seq);
      case 'lie': return this.writeLie(me, a.text);
      case 'fake': return this.layFake(me, a.text);
      case 'sab': return this.sabotage(me, a.k, a.target);
      case 'shield': return this.buyShield(me);
      case 'bribe': return this.bribe(me, a.k, a.target);
      case 'copy': return this.copy(me, a.mode, a.target);
      case 'remote': return this.remote(me, a.k, a.target, a.h);
      case 'wheel': if (this.phase === 'WHEEL' && this.d.step === 'pick' && this.d.picker === pid && this.d.offer.includes(a.k)) { this.wheelPick = a.k; this.check(); } return {};
      case 'veto': if (this.phase === 'WHEEL' && this.d.step === 'veto' && me.vetos > 0) { if (a.use) this.vetoBy = pid; else this.vetoPass.add(pid); this.check(); this.sync(); } return {};
      case 'ladder': return this.ladderAnswer(me, a.i, a.seq);
      case 'lift': return this.ladderBuy(me, 'lift');
      case 'grease': return this.ladderBuy(me, 'grease', a.target);
      case 'boo': return this.phase === 'LADDER' ? this.ladderBoo(me, a.target) : {};
      case 'catvote': return this.phase === 'LADDER' ? this.ladderVote(me, a.for, a.i) : {};
      default: return {};
    }
  }
  frozen(p) { return p.fxs.some((f) => f.k === 'freeze' && f.until > Date.now()); }
  answer(me, v, lock, seq) {
    const q = this.q;
    if (!q || !q.open || !q.eligible.includes(me.id) || this.phase !== 'Q') return { stale: true };
    if (seq !== undefined && seq !== q.seq) return { stale: true };
    if (Date.now() > (q.per[me.id] || q.ends) + GRACE) return { error: "Time's up!" };
    if (this.frozen(me)) return { error: 'Frozen! Wait a moment.' };
    const cur = q.picks[me.id];
    if (cur?.locked) return { error: 'Already locked in' };
    if (v === undefined) { if (!cur) return {}; cur.locked = true; cur.lockAt = Date.now(); this.after(q); return { ok: true }; }
    const k = q.kind;
    if (k === 'mc') { if (!(Number.isInteger(v) && (v >= 0 && v <= 3 || (v === 4 && q.spam[me.id])))) return {}; if (q.hint[me.id]?.includes(v)) return {}; }
    if (k === 'vote') { const o = this.cur.groups?.find((x) => x.id === v); if (!o || o.authors.includes(me.id)) return { error: "You can't pick your own lie" }; }
    if (k === 'who') { if (!this.cur.choices.includes(v) || v === me.id) return {}; }
    if (k === 'lay') { if (![0, 1].includes(v)) return {}; }
    if (k === 'num') { v = Number(String(v).replace(/,/g, '')); if (!Number.isFinite(v) || v < 0 || v > 1e12) return { error: 'Type a number' }; lock = true; }
    if (k === 'bomb') { if (typeof v !== 'boolean') return {}; lock = true; }
    if (k === 'bet') { if (v !== null && !this.P(v)) return {}; lock = true; }
    // Hot Hands: anything in the first 3 seconds is locked on the spot
    if (k === 'mc' && this.rule('hothands') && Date.now() - q.start <= 3000 * SPEED) lock = true;
    q.picks[me.id] = { v, at: Date.now(), locked: lock, lockAt: lock ? Date.now() : null };
    this.after(q); return { ok: true };
  }
  after() { this.check(); this.sync(); }
  sabOpen(me, target) {
    const q = this.q;
    if (!q || !q.open || !this.unlock.sab || !SAB_KINDS.includes(q.kind)) return 'Sabotage opens during trivia, the Bomb and Closest Number';
    if (q.attacked[me.id]) return 'One attack per question';
    if (target) {
      if (target === me.id) return "You can't attack yourself";
      if (!q.eligible.includes(target)) return q.kind === 'bomb' ? 'Only the bomb holder can be hit' : 'They are not playing this one';
      if ((q.hit[target] || 0) >= 2) return 'Protected: they have been hit twice already';
      if (q.picks[target]?.locked) return 'Too late, they already locked in';
      const left = this.timeLeft(target); const closeAt = q.kind === 'bomb' ? Math.min(4000, q.dur * 0.35) : 4000 * SPEED;
      if (left < closeAt) return 'Sabotage closes in the last seconds';
    }
    return null;
  }
  sabotage(me, k, target) {
    const S = C.SABOTAGE[k]; if (!S) return {};
    const err = this.sabOpen(me, target); if (err) return { error: err };
    if (S.mcOnly && this.q.kind !== 'mc') return { error: 'Spam only works on trivia' };
    const cost = this.price(S.cost, 'sab');
    if (!this.spend(me, cost, 'sab')) return { error: `You need $${bucks(cost)}` };
    const q = this.q; q.attacked[me.id] = true; me.attacks++;
    let T_ = this.P(target); let bounced = false;
    const leaderDT = q.dt && T_.id === q.leaderAtStart;
    if (T_.shield && !leaderDT) { T_.shield = false; bounced = true; T_ = me; }
    q.hit[T_.id] = (q.hit[T_.id] || 0) + 1; T_.hits++;
    const secs = q.kind === 'bomb' ? S.secs / 2 : S.secs;
    if (k === 'spam') q.spam[T_.id] = this.spamFor();
    T_.fxSeq++; T_.fxs.push({ id: `${T_.id}${T_.fxSeq}`, k, until: Date.now() + Math.round(secs * 1000), by: me.id, bounced });
    T_.fxs = T_.fxs.filter((f) => f.until > Date.now() - 2000 || f.k === 'spam').slice(-6);
    this.splashOut('sab', { s: k, by: bounced ? target : me.id, target: T_.id, bounced });
    this.sfx(`rg-${k}`);
    this.chat(bounced ? line(SAY.sabBounce, { by: me.name, target: this.nameOf(target) }) : line(SAY.sabHit, { by: me.name, target: T_.name }));
    if (!T_.bot) this.note(T_, bounced ? `Your own ${S.name} bounced back at you!` : `${me.name} hit you with ${S.name}!`, 'bad');
    if (bounced) this.note(this.P(target), `Your shield bounced ${me.name}'s ${S.name}!`, 'good');
    this.sync(); return { ok: true };
  }
  // a fake fifth answer that looks like it belongs
  spamFor() {
    const it = this.cur.item; const have = new Set(this.cur.answers.map(norm));
    const n = Number(String(it.right).replace(/[^0-9.]/g, ''));
    if (/^[\d,.$ ]+$/.test(it.right) && Number.isFinite(n) && n > 0) { for (let i = 0; i < 20; i++) { const f = Math.round(n * (0.6 + Math.random() * 0.9)); const s = it.right.includes(',') || f >= 10000 ? f.toLocaleString('en-US') : String(f); const out = it.right.startsWith('$') ? `$${s}` : s; if (!have.has(norm(out))) return out; } }
    const same = C.MC.filter((x) => x.cat === it.cat && x.id !== it.id);
    for (let i = 0; i < 30; i++) { const w = pick(pick(same).wrong); if (!have.has(norm(w))) return w; }
    return 'None of the above';
  }
  buyShield(me) {
    const q = this.q;
    if (!q || !q.open || !this.unlock.sab || !SAB_KINDS.includes(q.kind)) return { error: 'Shields are sold while a question is open' };
    if (me.shield) return { error: 'You already have a shield' };
    if (q.dt && q.leaderAtStart === me.id) return { error: "The leader can't be shielded in Double Trouble" };
    const cost = this.price(C.SHIELD.cost, 'shop');
    if (!this.spend(me, cost, 'sab')) return { error: `You need $${bucks(cost)}` };
    me.shield = true; this.sfx('rg-shield'); this.sync(); return { ok: true };
  }
  bribe(me, k, target) {
    const B = C.BRIBES[k]; const q = this.q; if (!B) return {};
    if (!q || !q.open || !this.unlock.bribe) return { error: 'Bribes are only open during a question' };
    const kind = q.kind === 'write' ? 'write' : ALIAS[q.kind] || q.kind;
    if (!B.when.includes(kind) || (k === 'fix' && q.kind !== 'write')) return { error: `${B.name} doesn't work right now` };
    q.bribed[me.id] = q.bribed[me.id] || {};
    if (q.bribed[me.id][k]) return { error: 'Already bought' };
    if (q.eligible.includes(me.id) && q.picks[me.id]?.locked && ['hint', 'peek'].includes(k)) return { error: 'You already locked in' };
    if (k === 'hint' && !q.eligible.includes(me.id)) return {};
    let T_ = null;
    if (B.target) { T_ = this.P(target); if (!T_ || T_ === me) return { error: 'Pick a rival' }; }
    const cost = this.price(B.cost, 'shop');
    if (!this.spend(me, cost, 'bribe')) return { error: `You need $${bucks(cost)}` };
    q.bribed[me.id][k] = true;
    if (k === 'hint') { const wrong = [0, 1, 2, 3].filter((i) => i !== this.cur.correct); q.hint[me.id] = shuffle(wrong).slice(0, 2); }
    if (k === 'peek') {
      const count = {}; for (const [id, pk] of Object.entries(q.picks)) if (id !== me.id) count[pk.v] = (count[pk.v] || 0) + 1;
      const best = Object.entries(count).sort((a, b) => b[1] - a[1])[0];
      q.peek[me.id] = best ? { v: q.kind === 'who' || q.kind === 'lay' || q.kind === 'vote' ? (q.kind === 'lay' ? Number(best[0]) : best[0]) : Number(best[0]), n: best[1] } : { v: null, n: 0 };
    }
    if (k === 'stopwatch') { T_.stopwatch = true; this.note(T_, 'Someone bribed Vince. Your next question has half the time!', 'bad'); }
    if (k === 'veto') me.vetos++;
    if (k === 'fix') q.fix[me.id] = true;
    this.splashOut('bribe', { b: k, by: this.rule('snitches') ? me.id : null });
    this.sfx('rg-cash');
    this.chat(this.rule('snitches') ? line(SAY.bribeSnitch, { by: me.name, card: B.name }) : line(SAY.bribeHint));
    this.sync(); return { ok: true, peek: q.peek[me.id] };
  }
  copy(me, mode, target) {
    const q = this.q;
    if (!q || !q.open || !this.unlock.copy || !COPY_KINDS.includes(q.kind)) return { error: 'Copying works once someone has locked an answer' };
    if (!q.eligible.includes(me.id)) return {};
    if (q.picks[me.id]?.locked) return { error: 'You already locked in' };
    if (this.frozen(me)) return { error: 'Frozen! Wait a moment.' };
    const ok = (id) => { const pk = q.picks[id]; if (id === me.id || !pk?.locked) return false; if (q.kind === 'vote') { const o = this.cur.groups.find((x) => x.id === pk.v); if (o?.authors.includes(me.id)) return false; } if (q.kind === 'who' && pk.v === me.id) return false; return true; };
    let from = null;
    if (mode === 'name') { if (!ok(target)) return { error: "You can't copy them right now" }; from = target; }
    else { const c = q.eligible.filter(ok); if (!c.length) return { error: 'Nobody to copy yet' }; from = pick(c); mode = 'blind'; }
    const cost = this.price(C.COPY[mode], 'shop');
    if (!this.spend(me, cost, 'copy')) return { error: `You need $${bucks(cost)}` };
    const src = this.P(from);
    q.picks[me.id] = { v: q.picks[from].v, at: Date.now(), locked: true, lockAt: Date.now(), copied: from };
    q.copied[me.id] = from;
    this.earn(src, C.COPY.royalty, 'royalty');
    this.note(src, `${me.name} paid to copy you. +$${C.COPY.royalty} royalty!`, 'good');
    this.splashOut('copy', { by: me.id, target: from, blind: mode === 'blind' });
    this.sfx('rg-copy'); this.chat(line(SAY.copied, { by: me.name, target: src.name }));
    this.check(); this.sync();
    return { ok: true, from: mode === 'name' ? from : null };
  }
  remote(me, k, target, h) {
    const q = this.q;
    if (!q || !q.open || !this.unlock.remote || !REMOTE_KINDS.includes(q.kind)) return { error: 'The remote works while a question is open' };
    if (q.remote !== me.id) return { error: 'Only last place holds the remote' };
    if (q.remoteUsed) return { error: 'One button per question' };
    const T_ = this.P(target);
    if (k === 'boo') {
      if (q.kind === 'bomb') return { error: "Boo doesn't work on the Bomb" };
      if (!T_ || T_ === me || !q.eligible.includes(T_.id)) return { error: 'Pick a rival who is answering' };
      q.per[T_.id] = Math.max(Date.now() + 1500, (q.per[T_.id] || q.ends) - 5000); T_.hits++;
      this.splashOut('boo', { by: me.id, target: T_.id }); this.sfx('boo'); this.chat(line(SAY.boo, { by: me.name, target: T_.name }), true);
      this.note(T_, `${me.name} booed you. Five seconds gone!`, 'bad');
    } else if (k === 'cheer') {
      if (!T_) return { error: 'Pick someone to cheer' };
      T_.cheer = true; this.splashOut('cheer', { by: me.id, target: T_.id }); this.sfx('applause'); this.chat(T_ === me ? `${me.name} is cheering for themselves. Bold.` : line(SAY.cheer, { by: me.name, target: T_.name }), true);
      this.note(T_, `${me.name} cheered you on. Your next right answer pays double!`, 'good');
    } else if (k === 'spin') {
      if (this.spinUsed[this.roundN] || this.roundN >= 6) return { error: 'The wheel has already been spun this round' };
      this.spinUsed[this.roundN] = true; this.pending.spin = true;
      this.splashOut('spin', { by: me.id }); this.sfx('rg-wheel'); this.chat(line(SAY.spin, { by: me.name }), true);
    } else if (k === 'heckle') {
      const text = C.HECKLES[h]; if (!text || !T_ || T_ === me) return { error: 'Pick a heckle and a rival' };
      this.splashOut('heckle', { by: me.id, target: T_.id, text }); this.chat(line(SAY.heckle, { by: me.name, target: T_.name, heckle: text }), true);
    } else return {};
    q.remoteUsed = true; this.sync(); return { ok: true };
  }

  // ------------------------------------------------------------ bots
  botTurn() {
    const bots = this.players.filter((p) => p.bot); if (!bots.length) return;
    const g = this.runId; const q = this.q; const ph = this.phase; const d = this.d;
    if (ph === 'WHEEL' && d.step === 'pick') { const b = this.P(d.picker); if (b?.bot) this.later(g, ms(2 + Math.random() * 2.5) * BOT_PACE, () => { if (this.phase === 'WHEEL' && this.d.step === 'pick') { this.wheelPick = pick(d.offer); this.check(); } }); }
    if (ph === 'WHEEL' && d.step === 'veto') for (const b of bots.filter((x) => x.vetos > 0)) this.later(g, ms(1.5 + Math.random() * 2), () => { if (this.phase === 'WHEEL' && this.d.step === 'veto') this.act(b.id, { type: 'veto', use: Math.random() < 0.35 }); });
    if (ph !== 'Q' || !q || !q.open || d.step !== 'open') return;
    const seq = q.seq;
    const live = () => this.q === q && q.open;
    for (const b of bots) {
      const mine = q.eligible.includes(b.id);
      const room = Math.max(400, this.timeLeft(b.id) - 700);
      const when = (lo, hi) => Math.min(room, ms(lo + Math.random() * (hi - lo)) * BOT_PACE);
      const tricks = () => {
        if (!live()) return;
        if (this.unlock.sab && SAB_KINDS.includes(q.kind) && b.cash > 700 && Math.random() < (b.house ? 0.55 : 0.22)) {
          const targets = q.eligible.filter((id) => id !== b.id && !this.sabOpen(b, id));
          if (targets.length) { const lead = this.leader(); const t = targets.includes(lead.id) && (b.house || Math.random() < 0.6) ? lead.id : pick(targets); const ks = Object.keys(C.SABOTAGE).filter((k) => q.kind === 'mc' || !C.SABOTAGE[k].mcOnly); this.sabotage(b, pick(ks), t); }
        }
        if (this.unlock.sab && SAB_KINDS.includes(q.kind) && !b.shield && b === this.leader() && b.cash > 1500 && Math.random() < 0.15) this.buyShield(b);
        if (this.unlock.bribe && mine && q.kind === 'mc' && b.cash > 900 && Math.random() < 0.12) this.bribe(b, 'hint');
        if (this.unlock.bribe && b.cash > 1600 && b.vetos === 0 && Math.random() < 0.012) this.bribe(b, 'veto');
        if (this.unlock.bribe && b.cash > 1200 && Math.random() < 0.05 && ['mc', 'num', 'vote'].includes(q.kind)) { const t = pick(this.players.filter((x) => x !== b)); if (t) this.bribe(b, 'stopwatch', t.id); }
        if (this.unlock.remote && q.remote === b.id && !q.remoteUsed && Math.random() < 0.5) {
          const k = pick(q.kind === 'bomb' ? ['cheer', 'heckle'] : ['boo', 'cheer', 'heckle', 'boo']);
          const rivals = this.players.filter((x) => x !== b && (k !== 'boo' || q.eligible.includes(x.id)));
          if (rivals.length) this.remote(b, k, (k === 'cheer' ? b : this.leader() !== b ? this.leader() : pick(rivals)).id, Math.floor(Math.random() * C.HECKLES.length));
        }
      };
      this.later(g, when(1.2, 4), tricks);
      if (!mine) continue;
      const answer = () => {
        if (!live() || q.picks[b.id]?.locked) return;
        if (this.frozen(b)) { this.later(g, 900, answer); return; }
        const k = q.kind;
        if (k === 'mc') {
          if (this.unlock.copy && Math.random() < 0.08 && q.eligible.some((id) => id !== b.id && q.picks[id]?.locked) && b.cash > 600) { if (this.copy(b, 'blind').ok) return; }
          const acc = { 1: 0.78, 2: 0.6, 3: 0.42 }[this.cur.item.d] + (q.hint[b.id] ? 0.25 : 0) + (b.house ? 0.03 : 0);
          const opts = [0, 1, 2, 3].filter((i) => !q.hint[b.id]?.includes(i));
          let v = Math.random() < acc ? this.cur.correct : pick(opts.filter((i) => i !== this.cur.correct));
          if (q.spam[b.id] && Math.random() < 0.15) v = 4;
          this.answer(b, v, true, seq);
        } else if (k === 'vote') {
          const opts = this.cur.groups.filter((o) => !o.authors.includes(b.id));
          const truth = opts.find((o) => o.truth);
          this.answer(b, (Math.random() < 0.42 ? truth : pick(opts)).id, true, seq);
        } else if (k === 'who') this.answer(b, pick(this.cur.choices.filter((id) => id !== b.id)), true, seq);
        else if (k === 'lay') this.answer(b, Math.random() < 0.5 ? 0 : 1, true, seq);
        else if (k === 'num') { const it = this.cur.item; const a = it.a; const f = Math.exp((Math.random() - 0.5) * 1.4); const v = !it.unit ? Math.round(a - 60 + Math.random() * 90) : a < 20 ? Math.max(0, Math.round(a * f * 10) / (Number.isInteger(a) ? 10 : 10)) : Math.round(a * f / (a > 1000 ? 10 : 1)) * (a > 1000 ? 10 : 1); this.answer(b, Number.isInteger(a) ? Math.round(v) : v, true, seq); }
        else if (k === 'bet') { if (Math.random() < 0.75) { const g2 = this.cur.guesses || {}; const a = this.cur.item.a; const far = Object.entries(g2).sort((x, y) => Math.abs(y[1] - a) - Math.abs(x[1] - a))[0]; this.answer(b, far && Math.random() < 0.5 ? far[0] : pick(this.players).id, true, seq); } else { q.picks[b.id] = { v: null, locked: true, lockAt: Date.now() }; this.check(); } }
        else if (k === 'write') { const taken = new Set(Object.values(q.lies || {}).map(norm)); const free = (q.spare || []).filter((x) => !taken.has(norm(x))); if (free.length) this.writeLie(b, pick(free)); else { q.picks[b.id] = { v: null, locked: true, lockAt: Date.now() }; this.check(); } }
        else if (k === 'bomb') this.answer(b, Math.random() < (b.house ? 0.75 : 0.72) ? this.cur.st.a : !this.cur.st.a, true, seq);
      };
      const k = q.kind;
      const delay = k === 'bomb' ? when(0.8, Math.min(3.5, q.dur / 1000 * 0.75)) : k === 'mc' ? when(2.5, 9) : k === 'num' ? when(4, 13) : k === 'bet' ? when(1.5, 5) : when(3, 11);
      this.later(g, delay, answer);
    }
  }

  // ------------------------------------------------------------ what each screen sees
  qPub(me) {
    const q = this.q; const c = this.cur; if (!c) return null;
    const out = { kind: c.kind, text: c.text || '', cat: c.cat || null, n: c.n, of: c.of, dt: !!c.dt };
    if (c.kind === 'mc') out.answers = c.answers;
    if (c.kind === 'vote') out.opts = c.opts;
    if (c.kind === 'who') { out.answer = c.answer; out.choices = c.choices; }
    if (c.kind === 'lay') { out.pair = c.pair; out.owner = c.owner; }
    if (c.kind === 'num' || c.kind === 'bet') { out.unit = c.unit; }
    if (c.kind === 'bet') out.guessers = Object.keys(c.guesses || {});
    if (c.kind === 'bomb') { out.holder = c.holder; out.fuse = c.fuse; out.passes = c.passes; out.boom = c.boom; if (c.boom) { out.answer = c.answer; out.picked = c.picked; } }
    if (c.kind === 'laywrite') out.count = c.items.length;
    if (q) {
      out.seq = q.seq; out.open = q.open; out.ends = q.ends; out.start = q.start;
      out.locked = q.eligible.filter((id) => q.picks[id]?.locked); out.eligible = q.eligible; out.pass = q.pass; out.remote = q.remote;
    }
    return out;
  }
  revPub() {
    const r = this.rev; if (!r || this.phase !== 'Q' || this.d.step === 'open') return null;
    return r;
  }
  view(me) {
    const ph = this.phase; const d = this.d; const q = this.q; const now = Date.now();
    const hide = this.rule('amnesia') && ph !== 'END';
    const v = {
      game: 'rg', phase: ph, step: d.step || null, kind: d.kind || null, code: this.code, endsAt: this.endsAt, now, vipId: this.vip()?.id, test: this.test,
      round: this.roundN, roundName: ROUND_NAMES[this.roundN] || '', settings: this.settings, unlock: this.unlock, amnesia: hide,
      players: this.players.map((p) => ({ ...this.pub(p), connected: p.connected, bot: p.bot, cash: hide ? null : p.cash, rung: p.rung, shield: p.shield,
        fx: p.fxs.filter((f) => f.until > now && f.k !== 'spam').map((f) => f.k), done: !!(p.dossier.length && p.dossier.every((e) => e.a && !e.auto)) })),
      rules: this.rules.map((r) => ({ k: r.k, ...C.RULES[r.k] })), pending: { jackpot: this.pending.jackpot, pot: this.pending.pot, passphone: this.pending.passphone },
      alliance: this.alliance && this.alliance.round === this.roundN ? this.alliance.pair : null,
      q: ph === 'Q' ? this.qPub(me) : null, rev: this.revPub(), splash: this.splash, fx: this.fx, x: {},
    };
    const x = v.x;
    if (ph === 'ROUND') { x.n = d.n; x.name = d.name; x.lay = d.lay; }
    if (ph === 'DEMO') x.key = d.key;
    if (ph === 'SCORES') { x.n = d.n; x.order = this.standings().map((p) => p.id); x.last = this.lastPlace()?.id; }
    if (ph === 'Q') x.at = d.at || null;
    if (ph === 'WHEEL') { Object.assign(x, d); x.offer = (d.offer || []).map((k) => ({ k, ...C.RULES[k] })); if (d.card) x.cardInfo = { k: d.card, ...C.RULES[d.card] }; }
    if (ph === 'LADDER' && this.ladder) {
      const L = this.ladder;
      x.ends = L.ends; x.winner = L.winner; x.rungs = LADDER_RUNGS; x.step = d.step;
      x.climbers = this.players.map((p) => ({ id: p.id, rung: p.rung, lock: p.lockUntil > now ? p.lockUntil : 0, cat: p.lq ? C.CATS[p.lq.cat] : null, d: p.lq?.d || p.wait?.offer && null, waiting: !!p.wait, last: p.lastCat ? { cat: C.CATS[p.lastCat.cat], d: p.lastCat.d } : null }));
      x.votes = this.players.filter((p) => p.wait).map((p) => ({ for: p.id, until: p.wait.until, offer: p.wait.offer.map((o) => ({ cat: C.CATS[o.cat], d: o.d })), n: Object.keys(p.wait.votes).length }));
      x.remote = this.lastPlace()?.id;
    }
    if (ph === 'END') { x.ranks = d.ranks; x.awards = d.awards; x.houseWon = d.houseWon; x.step = d.step; }
    if (ph === 'LOBBY') x.min = MIN;
    if (!me) {
      v.cue = this.cue; v.joinUrl = this.joinUrl; v.qr = this.qr; v.voiceOn = voice.enabled();
      return v;
    }
    // ---- this phone only
    const m = { ...this.pub(me), vip: this.vip()?.id === me.id, cash: hide ? null : me.cash, notes: me.notes, shield: me.shield, vetos: me.vetos, cheer: me.cheer,
      fx: me.fxs.filter((f) => f.until > now || (f.k === 'spam' && q?.spam[me.id])).map((f) => ({ id: f.id, k: f.k, until: f.until, by: this.nameOf(f.by), bounced: f.bounced })) };
    v.me = m;
    if (ph === 'DOSSIER') m.dossier = me.dossier.map((e, i) => ({ i, q: e.q, a: e.auto ? null : e.a }));
    if (ph === 'Q' && q) {
      const mine = q.eligible.includes(me.id);
      m.can = mine && q.open; m.ends = q.per[me.id] || q.ends;
      const pk = q.picks[me.id]; m.pick = pk ? { v: pk.v, locked: !!pk.locked, copied: pk.copied ? this.nameOf(pk.copied) : null } : null;
      m.hint = q.hint[me.id] || null; m.peek = q.peek[me.id] || null; m.spam = q.spam[me.id] || null;
      if (q.rival[me.id]) { const rp = q.picks[q.rival[me.id]]; m.rival = { id: q.rival[me.id], name: this.nameOf(q.rival[me.id]), v: rp ? rp.v : null }; }
      if (q.kind === 'write') m.lie = q.lies?.[me.id] || null;
      if (q.kind === 'laywrite') { const it = this.cur.items.find((i) => i.id === me.id); m.lay = it ? { q: it.q, a: it.a, fake: q.fakes?.[me.id] || null } : null; }
      if (q.kind === 'vote') m.ownOpts = (this.cur.groups || []).filter((o) => o.authors.includes(me.id)).map((o) => o.id);
      if (q.pass) { const hs = this.humans(); const i = hs.indexOf(me); m.passTo = hs.length > 1 ? hs[(i + 1) % hs.length].name : null; }
      // the tray: what you can do right now
      if (q.open) {
        const kind = q.kind;
        const tray = { sab: null, bribes: null, copy: null, remote: null };
        if (this.unlock.sab && SAB_KINDS.includes(kind)) {
          tray.sab = { list: Object.entries(C.SABOTAGE).filter(([, s]) => !s.mcOnly || kind === 'mc').map(([k, s]) => ({ k, cost: this.price(s.cost, 'sab') })), used: !!q.attacked[me.id],
            targets: q.eligible.filter((id) => id !== me.id).map((id) => ({ id, ok: !this.sabOpen(me, id), why: this.sabOpen(me, id) })),
            shield: { cost: this.price(C.SHIELD.cost, 'shop'), have: me.shield, ok: !me.shield && !(q.dt && q.leaderAtStart === me.id) } };
        }
        const bk = kind === 'write' ? 'write' : ALIAS[kind] || kind;
        if (this.unlock.bribe && kind !== 'bomb' && kind !== 'bet') {
          tray.bribes = Object.entries(C.BRIBES).filter(([k, b]) => b.when.includes(bk) && !(k === 'fix' && kind !== 'write') && !(k === 'hint' && !mine)).map(([k, b]) => ({ k, cost: this.price(b.cost, 'shop'), used: !!q.bribed[me.id]?.[k], target: !!b.target }));
        }
        if (this.unlock.copy && COPY_KINDS.includes(kind) && mine && !pk?.locked) {
          const others = q.eligible.filter((id) => id !== me.id && q.picks[id]?.locked);
          tray.copy = { blind: this.price(C.COPY.blind, 'shop'), name: this.price(C.COPY.name, 'shop'), targets: others };
        }
        if (this.unlock.remote && REMOTE_KINDS.includes(kind) && q.remote === me.id) tray.remote = { used: q.remoteUsed, spin: !this.spinUsed[this.roundN] && this.roundN < 6, boo: kind !== 'bomb', heckles: C.HECKLES };
        m.tray = tray;
      }
    }
    if (ph === 'WHEEL') { m.picker = d.picker === me.id; m.canVeto = d.step === 'veto' && me.vetos > 0 && !this.vetoPass?.has(me.id); }
    if (ph === 'LADDER' && this.ladder) {
      m.lq = me.lq ? { text: me.lq.text, answers: me.lq.answers, cat: C.CATS[me.lq.cat], d: me.lq.d, seq: me.lq.seq } : null;
      m.lock = me.lockUntil > now ? me.lockUntil : 0; m.rung = me.rung; m.lift = me.lift; m.grease = me.grease;
      m.wait = me.wait ? { until: me.wait.until } : null;
      m.voteFor = this.players.filter((p) => p !== me && p.wait && p.wait.votes[me.id] === undefined).map((p) => ({ for: p.id, name: p.name, until: p.wait.until, offer: p.wait.offer.map((o) => ({ cat: C.CATS[o.cat], d: o.d })) }));
      m.remote = this.lastPlace() === me ? { ready: now - me.lastBoo >= ms(20), at: me.lastBoo + ms(20) } : null;
      m.costs = { lift: LIFT, grease: GREASE };
    }
    return v;
  }
}

module.exports = { Rigged };
