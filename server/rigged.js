'use strict';
// RIGGED! A trivia game show where the host cheats and the rules never stay still.
// Flow: Dossier, trivia, Lie Detector, harder trivia, the Bomb, a Grudge Match, then the Rigged Race finale.
// A Showdown (leader against last place) ends every round. Bucks only buy a head start in the race; the race decides the winner.
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
const T = { dossier: 60, mc: 15, who: 15, write: 40, vote: 18, sdBet: 8, sd: 12, rule: 15, grudge: 12, race: 15, reveal: 3 };
const ROUND_NAMES = { 1: 'Round One', 2: 'The Lie Detector', 3: 'Round Three', 4: 'The Bomb', 5: 'The Grudge Match', 6: 'The Rigged Race', 7: 'The Results' };
const SAB_KINDS = ['mc', 'who', 'bomb', 'duel']; // when the one sabotage can be used
const BET = 200; // a Showdown bet
const RACE_LEN = 15; const RACE_QS = 9; const MAX_HEAD = 4; const GRUDGE_HEAD = 2;

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
    this.splash = null; this.splashSeq = 0;
    this.seen = { mc: new Set(), tf: new Set(), lie: new Set(), race: new Set() };
    this.reset();
    [SAY.welcome, SAY.welcomeHouse, SAY.rules, SAY.dossier, SAY.round[1]].forEach((t) => this.prefetch(t, true));
  }
  reset() {
    Object.assign(this, { roundN: 0, live: null, q: null, cur: null, rev: null, qd: {}, qSeq: 0, sd: null, race: null, lastLie: null, grudgeWin: null, winner: null, lastChat: 0, sabDemo: false });
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
  clearTimers() { this.timers.forEach(clearTimeout); this.timers = []; clearInterval(this.dog); }
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
  fresh() { return { cash: START, hits: 0, fooled: 0, rights: 0, duels: 0, minCash: START, dossier: [], fxs: [], fxSeq: 0, sab: false, pos: 0, head: 0 }; }
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
  // after a pause, every deadline moves forward by the time spent paused
  shiftClock(dt) {
    const q = this.q;
    if (q) { q.start += dt; q.ends += dt; for (const id of Object.keys(q.per)) q.per[id] += dt; }
    for (const p of this.players) { if (p.botAt) p.botAt += dt; for (const f of p.fxs || []) f.until += dt; }
  }
  startWatchdog(g) {
    clearInterval(this.dog); this.progress();
    this.dog = setInterval(() => {
      if (g !== this.runId || this.phase === 'END' || this.phase === 'LOBBY') { clearInterval(this.dog); return; }
      if (Date.now() - this.lastProgress > 120000) { console.error(`rg ${this.code}: stuck in ${this.phase}, moving on`); this.progress(); this.cue = null; this.wake('watchdog'); this.sync(); }
    }, 5000);
  }

  // ------------------------------------------------------------ money and rules
  standings() { return [...this.players].sort((a, b) => b.cash - a.cash || a.name.localeCompare(b.name)); }
  leader() { return this.standings()[0]; }
  lastPlace() { const s = this.standings(); return s[s.length - 1]; }
  // only one rule card is live at a time, and none in the finale
  rule(k) { return this.live === k && this.phase !== 'FINALE'; }
  earn(p, amt) {
    if (!p || !amt) return 0;
    const before = p.cash; p.cash = Math.max(0, p.cash + Math.round(amt)); const real = p.cash - before;
    p.minCash = Math.min(p.minCash, p.cash);
    this.qd[p.id] = (this.qd[p.id] || 0) + real;
    return real;
  }
  mult(p, q) {
    let m = 1;
    if (this.rule('double')) m *= 2;
    if (this.rule('lastlaugh') && q?.lastAtStart === p.id) m *= 3;
    return m;
  }

  // ------------------------------------------------------------ picking content
  draw(kind, list, filter = () => true) {
    let pool = list.filter((x) => !this.seen[kind].has(x.id) && filter(x));
    if (!pool.length) { list.forEach((x) => this.seen[kind].delete(x.id)); pool = list.filter(filter); }
    const it = pick(pool); this.seen[kind].add(it.id); return it;
  }
  mcPick(d) { return this.draw('mc', C.MC, (q) => !d || q.d === d); }
  // a real Dossier answer (not a stand-in) that hasn't been used yet, from this person if given
  dossierEntry(p, mark = true) {
    const pool = p.dossier.filter((e) => !e.used);
    const real = pool.filter((e) => !e.auto);
    const e = real.length ? pick(real) : pool.length ? pick(pool) : pick(p.dossier);
    if (e && mark) e.used = true;
    return e;
  }

  // ------------------------------------------------------------ the show
  async run(g) {
    const house = this.players.some((p) => p.house);
    this.setPhase('INTRO', {}); this.sfx('applause');
    await this.say(g, SAY.welcome);
    if (house) { this.sfx('rg-house'); await this.say(g, SAY.welcomeHouse); }
    await this.say(g, SAY.rules);
    await this.dossier(g);

    // Round 1: five questions (only the first is easy) and one from the Dossier
    await this.roundIntro(g, 1);
    const r1 = [this.mcPick(1), this.mcPick(2), this.mcPick(2), this.mcPick(2), this.mcPick(3)];
    r1.forEach((q) => this.prefetch(q.q));
    for (let i = 0; i < 5; i++) {
      if (i === 1 && !this.sabDemo) { this.sabDemo = true; this.setPhase('DEMO', { key: 'sab' }); this.sfx('whoosh'); await this.say(g, SAY.demoSab); }
      if (i === 3) await this.whoQ(g, 4, 6);
      await this.mcQ(g, r1[i], i < 3 ? i + 1 : i + 2, 6);
    }
    await this.showdown(g, 'mc');
    await this.endRound(g, true);

    // Round 2: the Lie Detector
    await this.roundIntro(g, 2); await this.lieRound(g);
    await this.showdown(g, this.lastLie ? 'truth' : 'mc');
    await this.endRound(g, true);

    // Round 3: harder trivia and another Dossier question
    await this.roundIntro(g, 3);
    const r3 = [this.mcPick(2), this.mcPick(3), this.mcPick(3), this.mcPick(3), this.mcPick(3)];
    r3.forEach((q) => this.prefetch(q.q));
    for (let i = 0; i < 5; i++) {
      if (i === 2) await this.whoQ(g, 3, 6);
      await this.mcQ(g, r3[i], i < 2 ? i + 1 : i + 2, 6);
    }
    await this.showdown(g, 'whosaid');
    await this.endRound(g, true);

    // Round 4: the Bomb
    await this.roundIntro(g, 4); await this.bombRound(g);
    await this.showdown(g, 'mc');
    await this.endRound(g, false);

    // the Grudge Match, then the Rigged Race
    this.live = null; this.sync();
    await this.grudge(g);
    await this.raceRound(g);
    await this.finish(g);
  }
  async roundIntro(g, n) {
    this.roundN = n;
    this.setPhase('ROUND', { n, name: ROUND_NAMES[n] }); this.sfx('rg-sting');
    await this.say(g, SAY.round[n]);
    if (SAY.round[n + 1]) this.prefetch(SAY.round[n + 1]);
  }
  async endRound(g, pickRule) {
    const s = this.standings();
    this.setPhase('SCORES', { n: this.roundN });
    const last = this.lastPlace();
    await this.say(g, `${line(SAY.leader, { name: s[0].name })} ${line(SAY.bottom, { name: last.name })}`);
    await this.roast(g, Math.random() < 0.6 ? last : pick(this.players.filter((p) => !p.house)));
    if (pickRule) await this.rulePick(g);
  }
  // Vince reads from someone's Dossier
  async roast(g, p) {
    if (!p) return;
    const e = this.dossierEntry(p);
    if (!e) return;
    this.setPhase('SCORES', { n: this.roundN, roast: { who: p.id, q: e.q, a: e.a } });
    await this.say(g, line(SAY.roast, { name: p.name, q: e.q, a: e.a }));
  }

  // ------------------------------------------------------------ the Dossier
  async dossier(g) {
    const pool = shuffle(C.DOSSIER);
    let k = 0;
    for (const p of this.players) {
      p.dossier = [0, 1, 2].map(() => { const d = pool[k++ % pool.length]; return { id: d.id, q: d.q, a: null, auto: false, fallback: d.fallback, used: false }; });
      if (p.bot) p.dossier.forEach((e) => { e.a = pick(e.fallback); e.auto = !p.house ? false : true; });
    }
    this.setPhase('DOSSIER', {}, T.dossier);
    this.sayOver(g, SAY.dossier);
    const done = () => this.humans().every((p) => !p.connected || p.dossier.every((e) => e.a));
    const t0 = Date.now();
    const nudge = this.later(g, ms(38), () => { if (this.phase === 'DOSSIER') this.chat(line(SAY.dossierMid), true); });
    await this.wait(ms(T.dossier), done); this.guard(g); clearTimeout(nudge);
    for (const p of this.players) p.dossier.forEach((e) => { if (!e.a) { e.a = pick(e.fallback); e.auto = true; } });
    if (Date.now() - t0 > 3000) { this.setPhase('DOSSIER', { done: true }); await this.say(g, SAY.dossierDone); }
  }

  // ------------------------------------------------------------ questions: the shared machinery
  openQ(kind, secs, ids, extra = {}) {
    const now = Date.now(); const dur = ms(secs);
    const leader = this.leader(); const last = this.lastPlace();
    const q = { kind, seq: ++this.qSeq, open: true, start: now, dur, per: {}, picks: {}, hit: {}, rival: {}, eligible: ids, leaderAtStart: leader?.id, lastAtStart: last?.id, ...extra };
    for (const id of ids) q.per[id] = now + dur;
    q.ends = now + dur;
    if (this.rule('copycat') && ['mc', 'who'].includes(kind)) for (const id of ids) { const others = ids.filter((x) => x !== id); if (others.length) q.rival[id] = pick(others); }
    this.q = q; this.qd = {};
    return q;
  }
  qDone() { const q = this.q; return !q || q.eligible.every((id) => { const p = this.P(id); return !p || q.picks[id]?.locked || (!p.bot && !p.connected); }); }
  async waitQ(g, doneFn = null) { const q = this.q; await this.wait(Math.max(50, q.ends - Date.now() + 400), doneFn || (() => this.qDone())); this.guard(g); this.closeQ(); }
  closeQ() { const q = this.q; if (!q || !q.open) return; q.open = false; for (const id of Object.keys(q.picks)) { const pk = q.picks[id]; if (!pk.locked) { pk.locked = true; pk.lockAt = q.per[id] || q.ends; } } this.sync(); }
  timeLeft(id) { const q = this.q; return q ? (q.per[id] || q.ends) - Date.now() : 0; }
  // the right-or-wrong scoring the quiz formats share. rows: [{p, right, answered, at}]
  scoreRight(rows, base) {
    const q = this.q;
    rows.forEach((r) => { r.win = r.right; });
    const winners = rows.filter((r) => r.win).sort((a, b) => a.at - b.at);
    if (this.rule('speedtax') && winners.length >= 2) winners[winners.length - 1].taxed = true;
    for (const r of winners) {
      r.p.rights++;
      if (r.taxed) continue;
      let amt = typeof base === 'function' ? base(r) : base;
      amt *= this.mult(r.p, q);
      if (this.rule('hothands') && r.hot) amt *= 2;
      this.earn(r.p, amt);
    }
    if (this.rule('double')) rows.filter((r) => r.answered && !r.win).forEach((r) => this.earn(r.p, -200));
    if (this.rule('bounty')) {
      const L = this.P(q.leaderAtStart); const lr = rows.find((r) => r.p === L && r.win);
      for (const r of winners) if (r.p !== L && L && (!lr || r.at < lr.at) && L.cash > 0) { const take = Math.min(150, L.cash); this.earn(L, -take); this.earn(r.p, take); }
    }
    return { winners };
  }
  afterQ() {
    if (this.rule('robin')) {
      const L = this.leader(); const last = this.lastPlace();
      if (L && last && L !== last && L.cash > 0) { const t = Math.min(200, L.cash); this.earn(L, -t); this.earn(last, t); this.splashOut('robin', { by: L.id, target: last.id }); }
    }
  }

  // ------------------------------------------------------------ trivia
  async mcQ(g, item, n, of) {
    const answers = shuffle([item.right, ...item.wrong]);
    this.cur = { kind: 'mc', item, text: item.q, cat: C.CATS[item.cat], answers, correct: answers.indexOf(item.right), n, of, d: item.d };
    const ids = this.players.map((p) => p.id);
    const q = this.openQ('mc', T.mc, ids);
    this.setPhase('Q', { kind: 'mc', step: 'open' }); this.endsAt = q.ends; this.sfx('rg-question');
    this.sayOver(g, item.q, { maxWait: 2500 });
    this.lastChat = Date.now() + 2500;
    const tick = this.later(g, Math.max(0, q.ends - Date.now() - 5000), () => { if (this.q === q && q.open && !this.qDone()) this.chat(line(SAY.lastSecs)); });
    await this.waitQ(g); clearTimeout(tick);
    const rows = ids.map((id) => {
      const p = this.P(id); const pk = q.picks[id];
      const answered = !!pk; const right = answered && pk.v === this.cur.correct;
      return { p, right, answered, at: pk ? pk.lockAt : Infinity, hot: pk && pk.lockAt - q.start <= 3000 * SPEED, pk };
    });
    const pay = 200 + item.d * 100; // harder questions pay more
    const { winners } = this.scoreRight(rows, (r) => pay + Math.round(200 * Math.max(0, 1 - (r.at - q.start) / Math.max(1, (q.per[r.p.id] || q.ends) - q.start)) / 10) * 10);
    this.rev = { correct: this.cur.correct, picks: Object.fromEntries(rows.filter((r) => r.pk).map((r) => [r.p.id, r.pk.v])), deltas: { ...this.qd }, winners: winners.map((w) => w.p.id) };
    this.setPhase('Q', { kind: 'mc', step: 'reveal' }); this.sfx(winners.length ? 'rg-ding' : 'rg-buzzer');
    const right = rows.filter((r) => r.right);
    let say = line(SAY.reveal, { answer: item.right });
    if (!right.length) say += ` ${line(SAY.nobody)}`;
    else if (right.length === 1 && rows.length > 2) say += ` ${line(SAY.oneRight, { name: right[0].p.name })}`;
    else if (right.length === rows.length && rows.length > 2) say += ` ${line(SAY.everyone)}`;
    await this.say(g, say);
    this.afterQ(); this.rev.deltas = { ...this.qd };
    this.sync(); await this.pause(g, T.reveal);
  }
  // "who said this?" from the Dossier, inside a trivia round
  async whoQ(g, n, of) {
    const cands = shuffle(this.players.filter((p) => !p.house && p.dossier.some((e) => !e.used)));
    const author = cands.find((p) => p.dossier.some((e) => !e.used && !e.auto)) || cands[0];
    if (!author) return;
    const e = this.dossierEntry(author);
    const ids = this.players.filter((x) => x !== author).map((x) => x.id);
    const choices = this.players.map((x) => x.id);
    this.cur = { kind: 'who', text: e.q, answer: e.a, choices, n, of, author: author.id, cat: 'From the Dossier' };
    const q = this.openQ('who', T.who, ids);
    this.setPhase('Q', { kind: 'who', step: 'open' }); this.endsAt = q.ends; this.sfx('rg-question');
    this.sayOver(g, `${line(SAY.whoAsk)} ${e.q} "${e.a}".`, { maxWait: 2500 });
    await this.waitQ(g);
    const rows = ids.map((id) => { const pk = q.picks[id]; return { p: this.P(id), answered: !!pk, right: !!pk && pk.v === author.id, at: pk ? pk.lockAt : Infinity, hot: pk && pk.lockAt - q.start <= 3000 * SPEED }; });
    this.scoreRight(rows, 400);
    const fooled = rows.filter((r) => r.answered && !r.right).length;
    if (fooled) { this.earn(author, 100 * fooled); author.fooled += fooled; }
    this.rev = { author: author.id, picks: Object.fromEntries(rows.filter((r) => r.answered).map((r) => [r.p.id, q.picks[r.p.id].v])), deltas: { ...this.qd } };
    this.setPhase('Q', { kind: 'who', step: 'reveal' }); this.sfx('rg-reveal');
    await this.say(g, line(SAY.whoReveal, { name: author.name }));
    this.afterQ(); this.rev.deltas = { ...this.qd }; this.sync();
    await this.pause(g, T.reveal);
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
    const lies = {};
    const q = this.openQ('write', T.write, ids.filter((id) => !this.P(id).house), { lies, vinceLie: decoys[0], spare: decoys.slice(1) });
    this.setPhase('Q', { kind: 'write', step: 'open' }); this.endsAt = q.ends; this.sfx('rg-question');
    this.sayOver(g, `${fact.q.replace('___', 'blank')} ${line(SAY.lieWrite)}`, { maxWait: 2500 });
    await this.waitQ(g);
    const used = new Set([norm(fact.a), ...Object.values(lies).map(norm)]);
    const vinceLie = q.vinceLie; used.add(norm(vinceLie));
    const nextDecoy = () => { const d = q.spare.find((x) => !used.has(norm(x))); if (d) used.add(norm(d)); return d || null; };
    for (const id of q.eligible) if (!lies[id] && !this.P(id).bot) { const d = nextDecoy(); if (d) lies[id] = d; }
    const groups = [];
    const add = (text, author, extra = {}) => { const k = norm(text); let gr = groups.find((x) => norm(x.text) === k); if (!gr) { gr = { id: `o${groups.length}`, text, authors: [], voters: [], ...extra }; groups.push(gr); } if (author) gr.authors.push(author); if (extra.vince) gr.vince = true; if (extra.truth) gr.truth = true; return gr; };
    const truth = add(fact.a, null, { truth: true });
    const house = this.players.find((p) => p.house);
    add(vinceLie, house ? house.id : null, { vince: true });
    for (const id of q.eligible) if (lies[id]) add(lies[id], id);
    const opts = shuffle(groups);
    this.cur = { kind: 'vote', fact, text: fact.q, n, of, opts: opts.map((o) => ({ id: o.id, text: o.text })), groups: opts };
    const vq = this.openQ('vote', T.vote, ids);
    this.setPhase('Q', { kind: 'vote', step: 'open' }); this.endsAt = vq.ends; this.sfx('whoosh');
    this.sayOver(g, line(SAY.lieVote));
    await this.waitQ(g);
    for (const id of ids) { const pk = vq.picks[id]; if (pk) { const gr = opts.find((o) => o.id === pk.v); if (gr) gr.voters.push(id); } }
    const rows = ids.map((id) => { const pk = vq.picks[id]; return { p: this.P(id), answered: !!pk, right: !!pk && pk.v === truth.id, at: pk ? pk.lockAt : Infinity }; });
    this.scoreRight(rows, 500);
    for (const gr of opts) {
      if (gr.truth) continue;
      for (const v of gr.voters) {
        const voter = this.P(v);
        if (gr.vince) { this.earn(voter, -200); if (house) this.earn(house, 200); }
        for (const a of gr.authors) { if (a === v) continue; const au = this.P(a); if (au && !au.house) { this.earn(au, 300); au.fooled++; } else if (au?.house && !gr.vince) this.earn(au, 300); }
      }
    }
    // the lie that fooled the most people comes back in the Showdown
    const best = opts.filter((o) => !o.truth).sort((a, b) => b.voters.length - a.voters.length)[0];
    if (best && (!this.lastLie || best.voters.length >= this.lastLie.votes)) this.lastLie = { q: fact.q, truth: fact.a, lie: best.text, votes: best.voters.length, authors: best.authors };
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
    await this.say(g, line(SAY.lieTruth, { answer: fact.a }));
    this.afterQ(); this.rev.deltas = { ...this.qd }; this.sync();
    await this.pause(g, T.reveal);
  }
  writeLie(me, text) {
    const q = this.q; if (!q || !q.open || q.kind !== 'write' || !q.eligible.includes(me.id)) return {};
    if (Date.now() > q.per[me.id] + GRACE) return { error: "Time's up" };
    const t = clip(text, 40); if (!t) return { error: 'Write something!' };
    if (tooClose(t, this.cur.fact.a)) return { error: "That's the real answer! Write a fake one.", truth: true };
    q.lies[me.id] = t; q.picks[me.id] = { v: t, locked: true, lockAt: Date.now() }; this.check(); this.sync(); return { ok: true };
  }

  // ------------------------------------------------------------ Round 4: The Bomb
  async bombRound(g) {
    const seats = this.players;
    let at = Math.floor(Math.random() * seats.length);
    for (let b = 1; b <= 2; b++) {
      let passes = 0;
      this.cur = { kind: 'bomb', n: b, of: 2, holder: seats[at].id, passes: 0, fuse: 8, text: '', boom: null };
      this.setPhase('Q', { kind: 'bomb', step: 'start' }); this.sfx('rg-fuse');
      await this.say(g, line(SAY.bombStart, { n: b, name: seats[at].name }));
      for (;;) {
        const holder = seats[at];
        const st = this.draw('tf', C.TF);
        const fuse = passes >= 14 ? 2 : Math.max(3, 8 - passes);
        this.cur = { kind: 'bomb', n: b, of: 2, holder: holder.id, passes, fuse, text: st.q, st, boom: null };
        const q = this.openQ('bomb', fuse, [holder.id]);
        this.setPhase('Q', { kind: 'bomb', step: 'open' }); this.endsAt = q.ends; this.sfx('rg-tick');
        await this.waitQ(g);
        const pk = q.picks[holder.id];
        if (pk && pk.v === st.a) {
          this.earn(holder, 200 * this.mult(holder, q)); holder.rights++;
          passes++; at = (at + 1) % seats.length; this.sfx('rg-pass');
          if (passes % 3 === 0) this.chat(line(SAY.bombPass));
          continue;
        }
        this.earn(holder, -500);
        this.cur = { ...this.cur, boom: holder.id, answer: st.a, picked: pk ? pk.v : null };
        this.rev = { deltas: { ...this.qd } };
        this.setPhase('Q', { kind: 'bomb', step: 'boom' }); this.sfx('rg-boom');
        await this.say(g, line(SAY.bombBoom, { name: holder.name }));
        this.sync();
        await this.pause(g, 1.6);
        at = (at + 1) % seats.length;
        break;
      }
    }
  }

  // ------------------------------------------------------------ rule cards: one live at a time, last place picks
  async rulePick(g) {
    const picker = this.lastPlace();
    const offer = shuffle(Object.keys(C.RULES).filter((k) => k !== this.live)).slice(0, 3);
    this.rulePicked = null;
    this.setPhase('RULE', { step: 'pick', picker: picker.id, offer }, T.rule); this.sfx('rg-wheel');
    this.sayOver(g, line(SAY.rulePick, { name: picker.name }));
    await this.wait(ms(T.rule), () => !!this.rulePicked); this.guard(g);
    const k = this.rulePicked || pick(offer);
    const old = this.live; this.live = k;
    const R = C.RULES[k];
    this.setPhase('RULE', { step: 'card', card: k, picker: picker.id, old }); this.sfx('rg-card');
    await this.say(g, `${line(SAY.rulePicked, { name: picker.name, card: R.name })} ${R.text}${old ? ` ${fill(SAY.ruleReplaced, { old: C.RULES[old].name })}` : ''}`);
  }

  // ------------------------------------------------------------ Showdowns: two players, one question, fastest right answer
  async showdown(g, kind) {
    const s = this.standings(); const a = s[0]; const b = s[s.length - 1];
    if (!a || !b || a === b) return;
    const pot = Math.max(200, Math.min(800, Math.round((a.cash + b.cash) * 0.1 / 50) * 50));
    const intro = kind === 'whosaid' ? line(SAY.showdownDossier, { a: a.name, b: b.name }) : kind === 'truth' ? line(SAY.showdownLie) : null;
    await this.duel(g, a, b, kind, { pot, intro: line(this.players.length <= 2 ? SAY.showdownHouse : SAY.showdown, { a: a.name, b: b.name }), intro2: intro });
  }
  async duel(g, a, b, kind, opts = {}) {
    const sd = { a: a.id, b: b.id, kind, pot: opts.pot || 0, grudge: !!opts.grudge, bets: {}, winner: null, at: {} };
    this.sd = sd;
    // everyone else bets on who wins
    const bettors = this.players.filter((p) => p !== a && p !== b && p.cash >= 100);
    this.setPhase('SHOWDOWN', { step: 'bet' }, bettors.length ? T.sdBet : null); this.sfx('rg-sting');
    if (bettors.length) {
      this.sayOver(g, opts.intro);
      await this.wait(ms(T.sdBet), () => bettors.every((p) => sd.bets[p.id] || (!p.bot && !p.connected))); this.guard(g);
    } else await this.say(g, opts.intro);
    if (opts.intro2) { this.setPhase('SHOWDOWN', { step: 'ready' }); await this.say(g, opts.intro2); }
    // the question
    let cur;
    if (kind === 'whosaid') {
      const owner = Math.random() < 0.5 ? a : b; const e = this.dossierEntry(owner);
      cur = { kind: 'duel', sub: 'whosaid', text: e.q, quote: e.a, answers: [a.name, b.name], correct: owner === a ? 0 : 1, cat: 'Dossier Duel' };
    } else if (kind === 'truth' && this.lastLie) {
      const L = this.lastLie; const two = shuffle([L.truth, L.lie]);
      cur = { kind: 'duel', sub: 'truth', text: L.q, answers: two, correct: two.indexOf(L.truth), cat: 'Lie Detector callback' };
    } else {
      const it = this.mcPick(3); const answers = shuffle([it.right, ...it.wrong]);
      cur = { kind: 'duel', sub: 'mc', text: it.q, answers, correct: answers.indexOf(it.right), cat: C.CATS[it.cat] };
    }
    this.cur = cur;
    const q = this.openQ('duel', T.sd, [a.id, b.id]);
    // done as soon as someone is right, or both have answered
    this.setPhase('SHOWDOWN', { step: 'q' }); this.endsAt = q.ends; this.sfx('rg-question');
    this.sayOver(g, cur.sub === 'whosaid' ? `${cur.text} "${cur.quote}"` : cur.text, { maxWait: 2000 });
    await this.waitQ(g, () => this.qDone() || [a, b].some((p) => q.picks[p.id]?.v === cur.correct));
    const right = [a, b].filter((p) => q.picks[p.id]?.v === cur.correct).sort((x, y) => q.picks[x.id].lockAt - q.picks[y.id].lockAt);
    const w = right[0] || null; const l = w ? (w === a ? b : a) : null;
    sd.winner = w ? w.id : null; sd.picks = { [a.id]: q.picks[a.id]?.v ?? null, [b.id]: q.picks[b.id]?.v ?? null };
    this.qd = {};
    if (w) {
      w.duels++;
      if (sd.pot) { const take = Math.min(sd.pot, l.cash); this.earn(l, -take); this.earn(w, take); sd.took = take; }
      for (const [pid, on] of Object.entries(sd.bets)) { const p = this.P(pid); if (!p) continue; this.earn(p, on === w.id ? BET : -BET); }
    }
    sd.deltas = { ...this.qd };
    this.setPhase('SHOWDOWN', { step: 'result' }); this.sfx(w ? 'rg-ding' : 'rg-buzzer');
    let say;
    if (!w) say = line(SAY.showdownNone);
    else if (sd.grudge) say = line(SAY.grudgeWin, { name: w.name });
    else say = line(SAY.showdownWin, { name: w.name, target: l.name, amount: bucks(sd.took || 0) });
    const smart = Object.entries(sd.bets).filter(([, on]) => w && on === w.id).map(([pid]) => this.nameOf(pid));
    if (w && smart.length && !sd.grudge) say += ` ${line(SAY.betsPaid, { name: listNames(smart) })}`;
    await this.say(g, say);
    await this.pause(g, 1.5);
    this.sd = { ...sd, done: true };
    return w;
  }
  bet(me, on) {
    const sd = this.sd;
    if (this.phase !== 'SHOWDOWN' || this.d.step !== 'bet' || !sd || sd.done) return {};
    if (me.id === sd.a || me.id === sd.b) return { error: "You're in the Showdown!" };
    if (![sd.a, sd.b].includes(on)) return {};
    if (sd.bets[me.id]) return { error: 'Bet placed' };
    if (me.cash < 100) return { error: 'Not enough Bucks' };
    sd.bets[me.id] = on; this.check(); this.sync(); return { ok: true };
  }

  // ------------------------------------------------------------ the Grudge Match: last place picks a rival
  async grudge(g) {
    this.roundN = 5;
    const picker = this.lastPlace();
    const others = this.players.filter((p) => p !== picker);
    if (!others.length) return;
    this.grudgeTarget = null;
    this.setPhase('GRUDGE', { step: 'pick', picker: picker.id }, T.grudge); this.sfx('rg-sting');
    this.sayOver(g, line(SAY.grudge, { name: picker.name }));
    await this.wait(ms(T.grudge), () => !!this.grudgeTarget); this.guard(g);
    let target = this.P(this.grudgeTarget);
    if (!target || target === picker) { const L = this.leader(); target = L !== picker ? L : pick(others); }
    this.setPhase('GRUDGE', { step: 'picked', picker: picker.id, target: target.id });
    await this.say(g, line(SAY.grudgePicked, { name: picker.name, target: target.name }));
    const w = await this.duel(g, picker, target, Math.random() < 0.4 ? 'whosaid' : 'mc', { grudge: true, intro: `${picker.name} against ${target.name}. Everyone else, place your bets.`, intro2: null });
    this.grudgeWin = w ? w.id : null;
  }

  // ------------------------------------------------------------ the finale: the Rigged Race
  // one shared question at a time, tap every answer that fits. Right taps step you forward, wrong ones back.
  raceHeads() {
    const s = this.standings(); const n = s.length;
    s.forEach((p, i) => { p.head = n > 1 ? Math.round(i / (n - 1) * MAX_HEAD) : 0; if (p.id === this.grudgeWin) p.head += GRUDGE_HEAD; p.pos = p.head; });
  }
  roomQuestion() {
    const people = this.players.filter((p) => !p.house && p.dossier.filter((e) => !e.auto).length >= 2);
    const owner = people.length ? pick(people) : null; if (!owner) return null;
    const mine = shuffle(owner.dossier.filter((e) => !e.auto).map((e) => e.a)).slice(0, 3);
    const theirs = shuffle(this.players.filter((p) => p !== owner).flatMap((p) => p.dossier.map((e) => e.a)));
    const wrong = []; const seen = new Set(mine.map(norm));
    for (const t of theirs) { if (wrong.length >= 6 - mine.length) break; if (!seen.has(norm(t))) { seen.add(norm(t)); wrong.push(t); } }
    if (mine.length + wrong.length < 6) return null;
    return { id: `room-${owner.id}`, q: `Tap every answer ${owner.name} wrote in the Dossier.`, right: mine, wrong, room: owner.id };
  }
  async raceRound(g) {
    this.roundN = 6; this.live = null;
    this.raceHeads();
    const R = this.race = { len: RACE_LEN, n: 0, of: RACE_QS, step: 'intro', winner: null, item: null, opts: [], picks: {}, deltas: {}, right: [] };
    this.setPhase('FINALE', { step: 'intro' }); this.sfx('rg-go');
    await this.say(g, SAY.raceIntro);
    const roomAt = 3 + Math.floor(Math.random() * 2);
    for (let i = 0; i < RACE_QS && !R.winner; i++) {
      let item = i === roomAt ? this.roomQuestion() : null;
      if (item) { this.setPhase('FINALE', { step: 'room' }); await this.say(g, fill(SAY.raceRoom, { name: this.nameOf(item.room) })); }
      if (!item) item = this.draw('race', C.RACE);
      const opts = shuffle([...item.right.map((t) => ({ t, ok: true })), ...item.wrong.map((t) => ({ t, ok: false }))]);
      Object.assign(R, { n: i + 1, item, opts, picks: {}, deltas: {}, right: [], room: item.room || null });
      const ids = this.players.map((p) => p.id);
      const q = this.openQ('race', T.race, ids);
      R.step = 'q'; this.setPhase('FINALE', { step: 'q' }); this.endsAt = q.ends; this.sfx('rg-question');
      this.sayOver(g, item.room ? item.q : line(SAY.raceQ, { q: item.q }), { maxWait: 2000 });
      await this.waitQ(g);
      // score: +1 a right tap, -1 a wrong one. Everyone moves together on the reveal.
      R.right = opts.map((o, k) => (o.ok ? k : -1)).filter((k) => k >= 0);
      for (const p of this.players) {
        const mine = R.picks[p.id] || [];
        const delta = mine.reduce((t, k) => t + (opts[k]?.ok ? 1 : -1), 0);
        const before = p.pos; p.pos = Math.max(0, p.pos + delta); R.deltas[p.id] = p.pos - before;
        p.rights += mine.filter((k) => opts[k]?.ok).length;
      }
      R.step = 'reveal'; this.setPhase('FINALE', { step: 'reveal' }); this.sfx('rg-climb');
      const done = this.players.filter((p) => p.pos >= RACE_LEN);
      const order = [...this.players].sort((x, y) => y.pos - x.pos || y.cash - x.cash);
      if (done.length) R.winner = order[0].id;
      const gap = order.length > 1 ? order[0].pos - order[1].pos : 99;
      if (!R.winner) await this.say(g, gap <= 1 ? line(SAY.raceClose) : line(SAY.raceLead, { name: order[0].name }));
      await this.pause(g, 2.2);
    }
    const order = [...this.players].sort((x, y) => y.pos - x.pos || y.cash - x.cash);
    const won = R.winner || order[0].id; const finished = !!R.winner;
    R.winner = won; this.winner = won; R.step = 'win';
    this.setPhase('FINALE', { step: 'win', who: won }); this.sfx('rg-fanfare');
    await this.say(g, fill(finished ? SAY.raceWin : SAY.raceTime, { name: this.nameOf(won) }));
  }
  raceTap(me, k) {
    const R = this.race; const q = this.q;
    if (this.phase !== 'FINALE' || !R || R.step !== 'q' || !q || !q.open || q.kind !== 'race') return { stale: true };
    if (q.picks[me.id]?.locked) return { error: 'Already locked in' };
    if (!Number.isInteger(k) || k < 0 || k >= R.opts.length) return {};
    if (this.frozen(me)) return { error: 'Frozen! Wait a moment.' };
    const mine = R.picks[me.id] = R.picks[me.id] || [];
    const i = mine.indexOf(k); if (i >= 0) mine.splice(i, 1); else mine.push(k);
    q.picks[me.id] = { v: [...mine], at: Date.now(), locked: false };
    this.sync(); return { ok: true };
  }
  raceLock(me) {
    const q = this.q; if (!q || !q.open || q.kind !== 'race') return {};
    const pk = q.picks[me.id] || (q.picks[me.id] = { v: [], at: Date.now() });
    pk.locked = true; pk.lockAt = Date.now(); this.check(); this.sync(); return { ok: true };
  }

  // ------------------------------------------------------------ the end
  async finish(g) {
    this.q = null; this.cur = null; this.roundN = 7;
    const r = this.ranking();
    this.setPhase('END', { step: 'ranks', ...r }); this.sfx('rg-fanfare');
    const top = r.ranks[0];
    await this.say(g, top?.house ? SAY.houseWins : fill(SAY.winner, { name: top?.name || 'Nobody' }));
    await this.pause(g, 2);
    await this.say(g, SAY.goodnight);
  }
  ranking() {
    const ranks = [...this.players].sort((a, b) => (b.id === this.winner) - (a.id === this.winner) || b.pos - a.pos || b.cash - a.cash).map((p) => ({ ...this.pub(p), cash: p.cash, pos: p.pos }));
    const awards = []; const ps = this.players.filter((p) => !p.house);
    const most = (f) => [...ps].sort((a, b) => f(b) - f(a))[0];
    const liar = most((p) => p.fooled); if (liar?.fooled) awards.push({ title: C.AWARD_TITLES.liar, who: liar.id, text: `Fooled people ${liar.fooled} times` });
    const duel = most((p) => p.duels); if (duel?.duels) awards.push({ title: C.AWARD_TITLES.duelist, who: duel.id, text: `Won ${duel.duels} Showdown${duel.duels > 1 ? 's' : ''}` });
    const hit = most((p) => p.hits); if (hit?.hits) awards.push({ title: C.AWARD_TITLES.hit, who: hit.id, text: `Sabotaged ${hit.hits} time${hit.hits > 1 ? 's' : ''}` });
    const back = most((p) => p.cash - p.minCash); if (back && back.cash - back.minCash > 500) awards.push({ title: C.AWARD_TITLES.comeback, who: back.id, text: `Up $${bucks(back.cash - back.minCash)} from rock bottom` });
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
      case 'dossier': {
        if (this.phase !== 'DOSSIER') return {};
        const e = me.dossier[a.i]; if (!e) return {};
        const t = clip(a.text, 60); if (!t) return { error: 'Write something!' };
        e.a = t; e.auto = false; this.check(); this.sync(); return { ok: true };
      }
      case 'answer': return this.answer(me, a.v, !!a.lock, a.seq);
      case 'lock': return this.answer(me, undefined, true, a.seq);
      case 'lie': return this.writeLie(me, a.text);
      case 'sab': return this.sabotage(me, a.target);
      case 'bet': return this.bet(me, a.on);
      case 'rule': if (this.phase === 'RULE' && this.d.step === 'pick' && this.d.picker === pid && this.d.offer.includes(a.k)) { this.rulePicked = a.k; this.check(); } return {};
      case 'grudge': if (this.phase === 'GRUDGE' && this.d.step === 'pick' && this.d.picker === pid && this.P(a.target) && a.target !== pid) { this.grudgeTarget = a.target; this.check(); } return {};
      case 'race': return this.raceTap(me, a.i);
      case 'raceLock': return this.raceLock(me);
      default: return {};
    }
  }
  frozen(p) { return p.fxs.some((f) => f.k === 'freeze' && f.until > Date.now()); }
  answer(me, v, lock, seq) {
    const q = this.q;
    if (!q || !q.open || !q.eligible.includes(me.id) || !['Q', 'SHOWDOWN'].includes(this.phase)) return { stale: true };
    if (seq !== undefined && seq !== q.seq) return { stale: true };
    if (Date.now() > (q.per[me.id] || q.ends) + GRACE) return { error: "Time's up!" };
    if (this.frozen(me)) return { error: 'Frozen! Wait a moment.' };
    const cur = q.picks[me.id];
    if (cur?.locked) return { error: 'Already locked in' };
    if (v === undefined) { if (!cur) return {}; cur.locked = true; cur.lockAt = Date.now(); this.after(); return { ok: true }; }
    const k = q.kind;
    if (k === 'mc') { if (!(Number.isInteger(v) && v >= 0 && v <= 3)) return {}; }
    if (k === 'duel') { if (!(Number.isInteger(v) && v >= 0 && v < this.cur.answers.length)) return {}; lock = true; }
    if (k === 'vote') { const o = this.cur.groups?.find((x) => x.id === v); if (!o || o.authors.includes(me.id)) return { error: "You can't pick your own lie" }; }
    if (k === 'who') { if (!this.cur.choices.includes(v) || v === me.id) return {}; }
    if (k === 'bomb') { if (typeof v !== 'boolean') return {}; lock = true; }
    // Hot Hands: anything in the first 3 seconds is locked on the spot
    if (['mc', 'who'].includes(k) && this.rule('hothands') && Date.now() - q.start <= 3000 * SPEED) lock = true;
    q.picks[me.id] = { v, at: Date.now(), locked: lock, lockAt: lock ? Date.now() : null };
    this.after(); return { ok: true };
  }
  after() { this.check(); this.sync(); }

  // ------------------------------------------------------------ the one sabotage: tap a face, something random happens to their phone
  sabWhy(me, target) {
    const q = this.q;
    if (me.sab) return 'You already used your sabotage';
    if (!q || !q.open || !SAB_KINDS.includes(q.kind)) return 'Sabotage works while a question is open';
    if (target === me.id) return "You can't sabotage yourself";
    if (!q.eligible.includes(target)) return q.kind === 'bomb' ? 'Only the bomb holder can be hit' : 'They are not answering this one';
    if ((q.hit[target] || 0) >= 2) return 'They have been hit twice already';
    if (q.picks[target]?.locked) return 'Too late, they already locked in';
    if (this.timeLeft(target) < (q.kind === 'bomb' ? Math.min(2500, q.dur * 0.35) : 3000 * SPEED)) return 'Too late for this question';
    return null;
  }
  sabotage(me, target) {
    const T_ = this.P(target); if (!T_) return { error: 'Pick a rival' };
    const err = this.sabWhy(me, target); if (err) return { error: err };
    const q = this.q; const k = pick(Object.keys(C.SABOTAGE)); const S = C.SABOTAGE[k];
    me.sab = true; q.hit[T_.id] = (q.hit[T_.id] || 0) + 1; T_.hits++;
    const secs = q.kind === 'bomb' ? S.secs / 2 : S.secs;
    T_.fxSeq++; T_.fxs.push({ id: `${T_.id}${T_.fxSeq}`, k, until: Date.now() + Math.round(secs * 1000), by: me.id });
    T_.fxs = T_.fxs.filter((f) => f.until > Date.now() - 2000).slice(-6);
    this.splashOut('sab', { s: k, by: me.id, target: T_.id });
    this.sfx(`rg-${k}`);
    this.chat(line(SAY.sabHit, { by: me.name, target: T_.name }));
    this.note(T_, `${me.name} hit you with ${S.name}!`, 'bad');
    this.note(me, `${S.emoji} ${S.name}! ${S.text}`, 'good');
    this.sync(); return { ok: true, k };
  }

  // ------------------------------------------------------------ bots
  botTurn() {
    const bots = this.players.filter((p) => p.bot); if (!bots.length) return;
    const g = this.runId; const q = this.q; const ph = this.phase; const d = this.d;
    if (ph === 'RULE' && d.step === 'pick') { const b = this.P(d.picker); if (b?.bot) this.later(g, ms(2 + Math.random() * 2.5) * BOT_PACE, () => { if (this.phase === 'RULE' && this.d.step === 'pick') { this.rulePicked = pick(d.offer); this.check(); } }); }
    if (ph === 'GRUDGE' && d.step === 'pick') { const b = this.P(d.picker); if (b?.bot) this.later(g, ms(2 + Math.random() * 2) * BOT_PACE, () => { if (this.phase === 'GRUDGE' && this.d.step === 'pick') { const L = this.leader(); this.grudgeTarget = (L !== b ? L : pick(this.players.filter((p) => p !== b))).id; this.check(); } }); }
    if (ph === 'SHOWDOWN' && d.step === 'bet' && this.sd) for (const b of bots) if (b.id !== this.sd.a && b.id !== this.sd.b) this.later(g, ms(1 + Math.random() * 4) * BOT_PACE, () => { if (this.phase === 'SHOWDOWN' && this.d.step === 'bet' && this.sd && Math.random() < 0.85) this.bet(b, Math.random() < 0.55 ? this.sd.a : this.sd.b); });
    if (ph === 'FINALE' && d.step === 'q' && this.race && q && q.kind === 'race') {
      for (const b of bots) {
        const R = this.race; const acc = b.house ? 0.72 : 0.66;
        R.opts.forEach((o, k) => { if (Math.random() < (o.ok ? acc : 0.18)) this.later(g, ms(2 + Math.random() * 8) * BOT_PACE, () => { if (this.race === R && R.step === 'q' && this.q === q && q.open) this.raceTap(b, k); }); });
        this.later(g, ms(10 + Math.random() * 3.5) * BOT_PACE, () => { if (this.q === q && q.open) this.raceLock(b); });
      }
      return;
    }
    if (!['Q', 'SHOWDOWN'].includes(ph) || !q || !q.open || !['open', 'q'].includes(d.step)) return;
    const seq = q.seq;
    const live = () => this.q === q && q.open;
    for (const b of bots) {
      const mine = q.eligible.includes(b.id);
      const room = Math.max(400, this.timeLeft(b.id) - 700);
      const when = (lo, hi) => Math.min(room, ms(lo + Math.random() * (hi - lo)) * BOT_PACE);
      // a bot uses its one sabotage once, usually on the leader
      if (!b.sab && SAB_KINDS.includes(q.kind) && Math.random() < (b.house ? 0.3 : 0.12)) {
        this.later(g, when(1.2, 4), () => {
          if (!live()) return;
          const targets = q.eligible.filter((id) => id !== b.id && !this.sabWhy(b, id));
          if (!targets.length) return;
          const lead = this.leader(); this.sabotage(b, targets.includes(lead.id) ? lead.id : pick(targets));
        });
      }
      if (!mine) continue;
      const answer = () => {
        if (!live() || q.picks[b.id]?.locked) return;
        if (this.frozen(b)) { this.later(g, 900, answer); return; }
        const k = q.kind;
        if (k === 'mc' || k === 'duel') {
          const n = this.cur.answers.length; const dd = k === 'duel' ? (this.cur.sub === 'mc' ? 3 : 1) : this.cur.d;
          const acc = ({ 1: 0.8, 2: 0.6, 3: 0.45 }[dd] || 0.6) + (b.house ? 0.03 : 0);
          const v = Math.random() < acc ? this.cur.correct : pick([...Array(n).keys()].filter((i) => i !== this.cur.correct));
          this.answer(b, v, true, seq);
        } else if (k === 'vote') {
          const opts = this.cur.groups.filter((o) => !o.authors.includes(b.id));
          const truth = opts.find((o) => o.truth);
          this.answer(b, (Math.random() < 0.42 ? truth : pick(opts)).id, true, seq);
        } else if (k === 'who') this.answer(b, pick(this.cur.choices.filter((id) => id !== b.id)), true, seq);
        else if (k === 'write') { const taken = new Set(Object.values(q.lies || {}).map(norm)); const free = (q.spare || []).filter((x) => !taken.has(norm(x))); if (free.length) this.writeLie(b, pick(free)); else { q.picks[b.id] = { v: null, locked: true, lockAt: Date.now() }; this.check(); } }
        else if (k === 'bomb') this.answer(b, Math.random() < (b.house ? 0.75 : 0.72) ? this.cur.st.a : !this.cur.st.a, true, seq);
      };
      const k = q.kind;
      const delay = k === 'bomb' ? when(0.8, Math.min(3.5, q.dur / 1000 * 0.75)) : k === 'duel' ? when(2.5, 8) : k === 'mc' ? when(2.5, 9) : when(3, 11);
      this.later(g, delay, answer);
    }
  }

  // ------------------------------------------------------------ what each screen sees
  qPub() {
    const q = this.q; const c = this.cur; if (!c) return null;
    const out = { kind: c.kind, text: c.text || '', cat: c.cat || null, n: c.n, of: c.of };
    if (c.kind === 'mc') out.answers = c.answers;
    if (c.kind === 'duel') { out.answers = c.answers; out.sub = c.sub; out.quote = c.quote || null; }
    if (c.kind === 'vote') out.opts = c.opts;
    if (c.kind === 'who') { out.answer = c.answer; out.choices = c.choices; }
    if (c.kind === 'bomb') { out.holder = c.holder; out.fuse = c.fuse; out.passes = c.passes; out.boom = c.boom; if (c.boom) { out.answer = c.answer; out.picked = c.picked; } }
    if (q) { out.seq = q.seq; out.open = q.open; out.ends = q.ends; out.start = q.start; out.locked = q.eligible.filter((id) => q.picks[id]?.locked); out.eligible = q.eligible; }
    return out;
  }
  sdPub() {
    const sd = this.sd; if (!sd || !['SHOWDOWN', 'GRUDGE'].includes(this.phase)) return null;
    const res = this.d.step === 'result';
    return { a: sd.a, b: sd.b, pot: sd.pot, grudge: sd.grudge, step: this.d.step, nBets: Object.keys(sd.bets).length, bets: res ? sd.bets : null, winner: res ? sd.winner : null, picks: res ? sd.picks : null, deltas: res ? sd.deltas : null, correct: res ? this.cur?.correct : null };
  }
  racePub() {
    const R = this.race; if (!R || this.phase !== 'FINALE') return null;
    const show = R.step === 'reveal' || R.step === 'win';
    return { len: R.len, n: R.n, of: R.of, step: R.step, text: R.item?.q || '', room: R.room, opts: R.opts.map((o) => o.t), right: show ? R.right : null, picks: show ? R.picks : null, deltas: show ? R.deltas : null, winner: R.step === 'win' ? R.winner : null,
      locked: this.q && this.q.kind === 'race' ? this.q.eligible.filter((id) => this.q.picks[id]?.locked) : [] };
  }
  view(me) {
    const ph = this.phase; const d = this.d; const q = this.q; const now = Date.now();
    const v = {
      game: 'rg', phase: ph, step: d.step || null, kind: d.kind || null, code: this.code, endsAt: this.endsAt, now, vipId: this.vip()?.id, test: this.test,
      round: this.roundN, roundName: ROUND_NAMES[this.roundN] || '',
      players: this.players.map((p) => ({ ...this.pub(p), connected: p.connected, bot: p.bot, cash: p.cash, pos: p.pos, head: p.head, sab: p.sab,
        fx: p.fxs.filter((f) => f.until > now).map((f) => f.k), done: !!(p.dossier.length && p.dossier.every((e) => e.a && !e.auto)) })),
      rule: this.live ? { k: this.live, ...C.RULES[this.live] } : null,
      q: ph === 'Q' || (ph === 'SHOWDOWN' && ['q', 'result'].includes(d.step)) ? this.qPub() : null, rev: ph === 'Q' && d.step !== 'open' ? this.rev : null,
      sd: this.sdPub(), race: this.racePub(), splash: this.splash, fx: this.fx, x: {},
    };
    const x = v.x;
    if (ph === 'ROUND') { x.n = d.n; x.name = d.name; }
    if (ph === 'DEMO') x.key = d.key;
    if (ph === 'SCORES') { x.n = d.n; x.order = this.standings().map((p) => p.id); x.last = this.lastPlace()?.id; x.roast = d.roast || null; }
    if (ph === 'Q') x.at = d.at || null;
    if (ph === 'RULE') { x.step = d.step; x.picker = d.picker; x.offer = (d.offer || []).map((k) => ({ k, ...C.RULES[k] })); if (d.card) x.card = { k: d.card, ...C.RULES[d.card] }; if (d.old) x.old = { k: d.old, ...C.RULES[d.old] }; }
    if (ph === 'GRUDGE') { x.step = d.step; x.picker = d.picker; x.target = d.target || null; }
    if (ph === 'END') { x.ranks = d.ranks; x.awards = d.awards; x.houseWon = d.houseWon; x.step = d.step; }
    if (ph === 'LOBBY') x.min = MIN;
    if (!me) {
      v.cue = this.cue; v.joinUrl = this.joinUrl; v.qr = this.qr; v.voiceOn = voice.enabled();
      return v;
    }
    // ---- this phone only
    const m = { ...this.pub(me), vip: this.vip()?.id === me.id, cash: me.cash, notes: me.notes, sabUsed: me.sab,
      fx: me.fxs.filter((f) => f.until > now).map((f) => ({ id: f.id, k: f.k, until: f.until, by: this.nameOf(f.by) })) };
    v.me = m;
    if (ph === 'DOSSIER') m.dossier = me.dossier.map((e, i) => ({ i, q: e.q, a: e.auto ? null : e.a }));
    if (q && q.open && (ph === 'Q' || ph === 'SHOWDOWN')) {
      if (!me.sab && SAB_KINDS.includes(q.kind)) m.sab = { targets: q.eligible.filter((id) => id !== me.id).map((id) => ({ id, ok: !this.sabWhy(me, id), why: this.sabWhy(me, id) })) };
    }
    if ((ph === 'Q' || ph === 'SHOWDOWN') && q) {
      const mine = q.eligible.includes(me.id);
      m.can = mine && q.open && q.kind !== 'race'; m.ends = q.per[me.id] || q.ends;
      const pk = q.picks[me.id]; m.pick = pk ? { v: pk.v, locked: !!pk.locked } : null;
      if (q.rival[me.id]) { const rp = q.picks[q.rival[me.id]]; m.rival = { id: q.rival[me.id], name: this.nameOf(q.rival[me.id]), v: rp ? rp.v : null }; }
      if (q.kind === 'write') m.lie = q.lies?.[me.id] || null;
      if (q.kind === 'vote') m.ownOpts = (this.cur.groups || []).filter((o) => o.authors.includes(me.id)).map((o) => o.id);
    }
    if (ph === 'SHOWDOWN' && this.sd) { m.role = me.id === this.sd.a || me.id === this.sd.b ? 'duel' : 'bettor'; m.bet = this.sd.bets[me.id] || null; m.canBet = m.role === 'bettor' && d.step === 'bet' && !m.bet && me.cash >= 100; }
    if (ph === 'RULE') m.picker = d.picker === me.id;
    if (ph === 'GRUDGE') m.picker = d.picker === me.id;
    if (ph === 'FINALE' && this.race) { m.race = { picks: this.race.picks[me.id] || [], locked: !!(q && q.kind === 'race' && q.picks[me.id]?.locked), can: this.race.step === 'q' && !!(q && q.open) }; }
    return v;
  }
}

module.exports = { Rigged };
