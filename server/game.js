'use strict';
// WRITERS' ROOM: the game engine. One Game per room. The night runs itself as an async script.
// Cold Read scenes (friends perform lines the room writes live), then a CUT! finale with the AI narrator.
const crypto = require('crypto');
const C = require('./content');
const S = require('./scenes');
const ai = require('./ai');
const voice = require('./voice');

const SPEED = Number(process.env.WR_SPEED || 1);
const ms = (s) => Math.max(30, Math.round(s * 1000 * SPEED));
const uid = () => crypto.randomBytes(6).toString('hex');
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const shuffle = (arr) => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const clip = (s, n) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);
const fill = (t, o) => t.replace(/\{(\w+)\}/g, (_, k) => (o[k] ?? ''));
const timeout = (p, t) => Promise.race([p, new Promise((r) => setTimeout(() => r(null), t))]);
const strip = voice.stripTags;
class Cancelled extends Error {}

const COLORS = ['#E07A3F', '#2F8F86', '#D9A13B', '#C9637A', '#5B7FC4', '#8C6BB1', '#6E9E4F', '#D46A5A', '#3E9FC1', '#B5803A', '#9C5B8F', '#4E8C6A'];
const PTS = { laugh: 25, laughCap: 4, crack: 150, cracked: -75, lineOfScene: 200, bestActor: 300, bestCut: 300 };
const T = { write: 25, act: 22, vote: 12, cutWrite: 15, finale: 240 };

// Character portraits: every public/assets/img/bust-NN file that exists, or 1..16 drawn stand-ins.
function bustPool() {
  let nums = [];
  try { nums = require('fs').readdirSync(require('path').join(__dirname, '..', 'public', 'assets', 'img')).map((f) => /^bust-(\d+)\.(png|jpe?g|webp)$/i.exec(f)).filter(Boolean).map((m) => Number(m[1])); } catch (e) { nums = []; }
  return nums.length >= 4 ? [...new Set(nums)] : [...Array(16).keys()].map((i) => i + 1);
}

class Game {
  constructor(code, hooks) {
    this.code = code; this.hooks = hooks;
    this.players = []; this.phase = 'LOBBY'; this.d = {}; this.endsAt = null; this.cue = null;
    this.runId = 0; this.waiter = null; this.lastActive = Date.now(); this.syncPending = false;
    this.fx = []; this.fxSeq = 0; this.timers = [];
    for (const t of Object.values(S.LINES)) if (!t.includes('{')) this.prefetch(t); // record the fixed lines while people join
  }

  // ------------------------------------------------------------ plumbing
  P(id) { return this.players.find((p) => p.id === id); }
  live() { return this.players.filter((p) => p.connected); }
  vip() { return this.live()[0] || this.players[0]; }
  pub(p) { return p ? { id: p.id, name: p.name, color: p.color, bust: p.bust } : null; }
  sync() {
    if (this.syncPending) return; this.syncPending = true;
    setTimeout(() => {
      this.syncPending = false;
      try { this.hooks.toHost(this.view(null)); for (const p of this.players) if (p.connected) this.hooks.toPlayer(p.id, this.view(p)); } catch (e) { console.error('sync', e); }
    }, 40);
  }
  setPhase(phase, d = {}, seconds = null) { this.phase = phase; this.d = d; this.endsAt = seconds ? Date.now() + ms(seconds) : null; this.lastActive = Date.now(); this.sync(); }
  sfx(name) { this.fxSeq++; this.fx.push({ id: this.fxSeq, name }); if (this.fx.length > 14) this.fx.shift(); this.sync(); }
  guard(g) { if (g !== this.runId) throw new Cancelled(); }
  later(g, t, fn) { const h = setTimeout(() => { if (g === this.runId) fn(); }, t); this.timers.push(h); return h; }
  clearTimers() { this.timers.forEach(clearTimeout); this.timers = []; }

  // A wait ends on timeout, when doneFn() turns true, on skip, or on wake(reason).
  wait(duration, doneFn = null) {
    if (this.waiter) this.waiter.resolve('replaced');
    return new Promise((resolve) => {
      const w = { doneFn, resolve: (r) => { if (this.waiter === w) this.waiter = null; clearTimeout(w.t); resolve(r); } };
      w.t = setTimeout(() => w.resolve('time'), duration);
      this.waiter = w;
      if (doneFn && doneFn()) w.resolve('done');
    });
  }
  check() { const w = this.waiter; if (w && w.doneFn && w.doneFn()) w.resolve('done'); }
  wake(reason) { if (this.waiter) this.waiter.resolve(reason); }
  skip(byId) { if (byId && byId !== this.vip()?.id) return; if (this.phase === 'LOBBY' || (this.phase === 'FINAL' && this.d.step === 'board')) return; this.cue = null; this.wake('skip'); }

  // ------------------------------------------------------------ voices
  voiceFor(pid) { if (!pid) return voice.NARRATOR(); const i = this.players.findIndex((p) => p.id === pid); const vs = voice.charVoices(); return vs[(i < 0 ? 0 : i) % vs.length]; }
  spoken(text) { let t = text; for (const p of this.players) if (p.pron) t = t.replace(new RegExp(`\\b${p.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g'), p.pron); return t; }
  prefetch(text, pid, urgent) { return voice.get(this.spoken(text), this.voiceFor(pid), urgent); }
  estimate(text) { return Math.min(30000, 900 + strip(text).length * 62); }
  async makeCue(text, opts = {}) {
    let audioId = null;
    if (voice.enabled()) audioId = await timeout(this.prefetch(text, opts.pid, opts.urgent), opts.maxWait || 6000);
    return { id: uid(), text: strip(text), speak: strip(this.spoken(text)), audio: audioId ? `/audio/${audioId}` : null, kind: opts.pid ? 'char' : 'narrator', charId: opts.pid || null };
  }
  // Speak and wait for the TV to finish (or a sensible timeout). stopFn ends it early (a CUT!).
  async say(g, text, opts = {}) {
    if (!strip(text)) return 'empty';
    const cue = await this.makeCue(text, opts); this.guard(g);
    if (opts.stopFn && opts.stopFn()) return 'stopped';
    this.cue = cue; this.cueDone = null; this.sync();
    const est = this.estimate(text);
    const r = await this.wait(cue.audio ? est * 1.8 + 5000 : est + 1200, () => this.cueDone === cue.id || (opts.stopFn ? opts.stopFn() : false));
    this.guard(g);
    if (this.cue === cue) { this.cue = null; this.sync(); }
    return opts.stopFn && opts.stopFn() ? 'stopped' : r;
  }
  // Start speaking without blocking.
  async sayOver(g, text, opts = {}) { if (!strip(text)) return; const cue = await this.makeCue(text, { maxWait: 2500, ...opts }); if (g !== this.runId) return; this.cue = cue; this.sync(); }
  cueFinished(id) { this.cueDone = id; if (this.cue && this.cue.id === id) this.cue = null; this.check(); }

  // ------------------------------------------------------------ lobby
  join(name, token, pron) {
    this.lastActive = Date.now();
    if (token) { const p = this.players.find((x) => x.token === token); if (p) return { player: p }; }
    name = clip(name, 14);
    if (!name) return { error: 'Enter your name' };
    const same = this.players.find((x) => x.name.toLowerCase() === name.toLowerCase());
    if (same) { if (!same.connected) { same.token = uid(); return { player: same }; } return { error: 'That name is taken' }; }
    if (this.phase !== 'LOBBY') return { error: 'This game has already started. Wait for the next one.' };
    if (this.players.length >= 12) return { error: 'The room is full (12 players)' };
    const used = new Set(this.players.map((x) => x.color));
    const p = { id: uid(), token: uid(), name, pron: clip(pron, 30), color: COLORS.find((c) => !used.has(c)) || pick(COLORS), connected: true, notes: [], noteSeq: 0, bust: (this.players.length % 16) + 1 };
    this.reset(p); this.players.push(p); this.sync();
    if (p.pron) this.prefetch(p.name);
    return { player: p };
  }
  reset(p) { Object.assign(p, { score: 0, writerPts: 0, actorPts: 0, acted: 0, lastActed: -9, cuts: 0 }); }
  setConnected(id, on) { const p = this.P(id); if (p) { p.connected = on; this.lastActive = Date.now(); this.check(); this.sync(); } }
  setProfile(id, a) { const p = this.P(id); if (!p) return; if ('pron' in a) p.pron = clip(a.pron, 30); this.sync(); }
  kick(byId, target) { if (this.phase !== 'LOBBY' || this.vip()?.id !== byId) return; this.players = this.players.filter((p) => p.id !== target); this.hooks.kicked?.(target); this.sync(); }
  note(p, text, kind = 'info') { if (!p) return; p.noteSeq++; p.notes.push({ id: p.noteSeq, text, kind }); if (p.notes.length > 4) p.notes.shift(); }
  award(p, pts, kind) { if (!p || !pts) return; p.score += pts; if (kind === 'actor') p.actorPts += pts; else p.writerPts += pts; }

  start(byId) {
    if (byId && this.vip()?.id !== byId) return { error: 'Only the first player can start' };
    if (this.phase !== 'LOBBY') return {};
    this.players = this.players.filter((p) => p.connected);
    const n = this.players.length;
    if (n < 2) return { error: 'You need at least 2 players' };
    if (n === 3) return { error: 'Play with 2 (Date Night) or with 4 or more. Find one more person!' };
    this.mode = n === 2 ? 'date' : 'party';
    this.players.forEach((p) => this.reset(p));
    const busts = shuffle(bustPool()); this.players.forEach((p, i) => { p.bust = busts[i % busts.length]; });
    this.plan();
    const g = ++this.runId;
    this.run(g).catch((e) => { if (!(e instanceof Cancelled)) { console.error('run error', e); this.setPhase('FINAL', { step: 'board', rows: this.board() }); } });
    return {};
  }
  playAgain(byId) { if (this.phase !== 'FINAL' || this.vip()?.id !== byId) return; this.runId++; this.clearTimers(); this.players = this.players.filter((p) => p.connected); this.players.forEach((p) => this.reset(p)); this.cue = null; this.sc = null; this.fin = null; this.setPhase('LOBBY', {}); }

  // Who acts in which scene, in which genre. Everyone acts about twice.
  plan() {
    const n = this.players.length; const k = n >= 7 ? 3 : 2;
    const count = this.mode === 'date' ? 3 : Math.min(7, Math.ceil((2 * n) / k));
    const genres = shuffle(C.GENRES);
    const acted = Object.fromEntries(this.players.map((p) => [p.id, 0])); const last = {};
    this.scenes = [];
    for (let i = 0; i < count; i++) {
      const order = shuffle(this.players).sort((a, b) => (acted[a.id] - acted[b.id]) || ((last[a.id] === i - 1) - (last[b.id] === i - 1)));
      const actors = order.slice(0, k).map((p) => p.id);
      actors.forEach((id) => { acted[id]++; last[id] = i; });
      const genre = genres[i % genres.length]; const su = S.SETUPS[genre.id] || S.SETUPS.serial;
      const roles = shuffle(su.roles);
      if (this.mode === 'date' && i % 2 === 1) actors.reverse();
      this.scenes.push({ i, genre, actors, title: pick(C.SHOW_TITLES[genre.id] || ['Untitled Pilot']), setting: su.setting, roles: actors.map((_, j) => roles[j % roles.length]), npcRole: roles[actors.length % roles.length], opener: pick(su.openers) });
    }
    this.finaleGenre = genres[count % genres.length];
    this.finOrder = shuffle(this.players).map((p) => p.id);
  }

  // ------------------------------------------------------------ the night
  async run(g) {
    const names = this.players.map((p) => p.name);
    const setupsP = timeout(ai.sceneSetups(this.scenes.map((s) => ({ genre: s.genre, actors: s.actors.map((id) => this.P(id).name) }))), 16000);
    this.finaleP = timeout(ai.finaleScript(this.finaleGenre, names), 40000);

    const date = this.mode === 'date';
    this.setPhase('INTRO', { step: 'welcome' }); this.sfx('whoosh');
    await this.say(g, date ? S.LINES.dateWelcome : S.LINES.welcome);
    this.setPhase('INTRO', { step: 'how' });
    await this.say(g, date ? S.LINES.dateHow : S.LINES.how);

    const setups = (await setupsP) || [];
    this.guard(g);
    this.scenes.forEach((s, i) => { const x = setups[i]; if (x) Object.assign(s, { title: x.title || s.title, setting: x.setting || s.setting, roles: x.roles, opener: x.opener }); });
    this.prepareVoices();

    for (const sc of this.scenes) await (date ? this.dateScene(g, sc) : this.scene(g, sc));
    await this.finale(g);
    await this.awards(g);
  }

  introText(sc) { return fill(S.LINES.sceneIntro, { title: sc.title, genre: sc.genre.name, setting: sc.setting }); }
  starringText(sc) { return fill(this.mode === 'date' ? S.LINES.dateStarring : S.LINES.starring, { cast: sc.actors.map((id, j) => `${this.P(id).name} as ${sc.roles[j]}`).join(', and ') }); }
  // Record everything we already know we'll say, in the order we'll need it.
  prepareVoices() {
    if (!voice.enabled()) return;
    const [first, ...rest] = this.scenes;
    this.prefetch(this.introText(first), null, true); this.prefetch(this.starringText(first), null, true);
    for (const p of this.players) ['lineOfScene', 'bestActor', 'cracked'].forEach((k) => this.prefetch(fill(S.LINES[k], { name: p.name })));
    for (const sc of rest) { this.prefetch(this.introText(sc)); this.prefetch(this.starringText(sc)); }
    for (const p of this.players) { p.quips = shuffle(S.QUIPS).slice(0, 2).map((q) => fill(q, { w: p.name })); p.quips.forEach((q) => this.prefetch(q)); ['cutCalled', 'froze', 'headWriter'].forEach((k) => this.prefetch(fill(S.LINES[k], { name: p.name }))); }
    this.finaleP.then((r) => { if (r) this.finScript = r; const lines = this.finaleLines(); lines.forEach((l) => this.prefetch(l.text, l.speaker)); });
  }

  // ------------------------------------------------------------ a Cold Read scene
  async scene(g, sc) {
    this.sc = sc; this.cue = null;
    sc.actors.forEach((id) => { const p = this.P(id); p.acted++; });
    this.setPhase('SCENE_INTRO', { step: 'genre' }); this.sfx('whoosh');
    await this.say(g, this.introText(sc));
    this.setPhase('SCENE_INTRO', { step: 'cast' }); this.sfx('drumroll');
    await this.say(g, this.starringText(sc));

    const writers = shuffle(this.players.filter((p) => !sc.actors.includes(p.id))).map((p) => p.id);
    const L = sc.actors.length === 2 ? 6 : 7;
    sc.lines = Array.from({ length: L }, (_, k) => ({ k, speaker: sc.actors[k % sc.actors.length], writer: k === 0 ? null : writers[(k - 1) % writers.length], text: k === 0 ? sc.opener : null, dir: k === 0 ? pick(S.DIRECTIONS) : null, auto: k === 0, laughs: {}, total: 0, crackVotes: {}, cracked: [], startedAt: null, doneAt: null }));
    sc.cur = -1; sc.writing = null; sc.flash = null;
    this.setPhase('SCENE', {}); this.sfx('clapper');
    this.startWriting(g, sc, 1);

    for (let k = 0; k < L; k++) {
      const line = sc.lines[k];
      if (!line.text) {
        await this.wait(ms(7), () => !!line.text); this.guard(g);
        if (!line.text) { const w = this.P(line.writer); if (w?.quips?.length) this.sayOver(g, w.quips.shift()); await this.wait(ms(T.write + 8), () => !!line.text); this.guard(g); }
        if (!line.text) this.submitLine(g, sc, k, null);
      }
      if (this.cue && this.cue.kind === 'narrator') this.cue = null;
      sc.cur = k; line.startedAt = Date.now(); this.sync(); this.later(g, 1600, () => this.sync());
      const actor = this.P(line.speaker);
      await this.wait(actor?.connected ? ms(T.act) : ms(4), () => !!line.doneAt); this.guard(g);
      line.doneAt = line.doneAt || Date.now();
    }
    clearTimeout(this.writeTimer); sc.writing = null; sc.cur = L;
    await this.sceneEnd(g, sc);
  }

  startWriting(g, sc, k) {
    if (k >= sc.lines.length) return;
    const line = sc.lines[k]; const w = this.P(line.writer);
    sc.writing = { k, writer: line.writer, endsAt: Date.now() + ms(T.write), dirs: shuffle(S.DIRECTIONS).slice(0, 3), votes: {}, ideas: shuffle(S.IDEAS).slice(0, 3) };
    clearTimeout(this.writeTimer);
    this.writeTimer = this.later(g, w?.connected ? ms(T.write) + 400 : ms(1.5), () => { if (sc.writing?.k === k) this.submitLine(g, sc, k, null); });
    this.sync();
  }
  submitLine(g, sc, k, text) {
    const line = sc.lines[k]; if (!line || line.text) return;
    const wr = sc.writing && sc.writing.k === k ? sc.writing : null;
    line.text = clip(text, 140) || pick(S.FALLBACK_LINES); line.auto = !clip(text, 140);
    const tally = [0, 0, 0]; if (wr) Object.values(wr.votes).forEach((i) => { tally[i]++; });
    const top = Math.max(...tally);
    line.dir = wr ? (top > 0 ? wr.dirs[tally.indexOf(top)] : pick(wr.dirs)) : pick(S.DIRECTIONS);
    if (line.auto) { line.dirBy = null; this.note(this.P(line.writer), 'Too slow! The writers\' room wrote that one for you.', 'bad'); }
    sc.writing = null; clearTimeout(this.writeTimer);
    this.startWriting(g, sc, k + 1);
    this.check(); this.sync();
  }
  // The line a laugh or a crack is aimed at: the one being performed, or the one just finished.
  targetLine(sc) {
    if (!sc || sc.cur < 0) return null;
    const cur = sc.lines[sc.cur];
    if (cur && cur.startedAt && Date.now() - cur.startedAt < 1500 && sc.cur > 0) return sc.lines[sc.cur - 1];
    return cur || sc.lines[sc.lines.length - 1];
  }
  audience(sc) { return this.live().filter((p) => !sc.actors.includes(p.id)); }

  async sceneEnd(g, sc) {
    this.cue = null;
    this.setPhase('SCENE_END', { step: 'wrap' }); this.sfx('applause');
    await this.say(g, S.LINES.wrap);
    const best = sc.lines.filter((l) => l.writer && !l.auto).sort((a, b) => b.total - a.total)[0];
    if (best && best.total > 0) {
      const w = this.P(best.writer); this.award(w, PTS.lineOfScene, 'writer');
      this.setPhase('SCENE_END', { step: 'line', k: best.k }); this.sfx('bell');
      await this.say(g, fill(S.LINES.lineOfScene, { name: w.name }));
      await this.wait(ms(1.5)); this.guard(g);
    }
    const voters = () => this.audience(sc);
    this.setPhase('SCENE_END', { step: 'vote', votes: {} }, T.vote);
    this.sayOver(g, S.LINES.actorVote);
    await this.wait(ms(T.vote), () => voters().length > 0 && voters().every((p) => this.d.votes[p.id])); this.guard(g);
    const counts = Object.fromEntries(sc.actors.map((id) => [id, 0])); Object.values(this.d.votes).forEach((id) => { if (id in counts) counts[id]++; });
    const top = Math.max(...Object.values(counts));
    const winners = top > 0 ? sc.actors.filter((id) => counts[id] === top) : [];
    winners.forEach((id) => this.award(this.P(id), Math.round(PTS.bestActor / winners.length), 'actor'));
    this.setPhase('SCENE_END', { step: 'result', votes: this.d.votes, winners, counts });
    this.sfx(winners.length ? 'applause' : 'trombone');
    if (winners.length === 1) await this.say(g, fill(S.LINES.bestActor, { name: this.P(winners[0]).name }));
    else await this.wait(ms(2.5));
    await this.wait(ms(2)); this.guard(g);
  }

  // ------------------------------------------------------------ the CUT! finale
  finaleLines() {
    const byName = (nm) => this.players.find((p) => p.name === nm)?.id;
    if (this.finScript?.lines?.length) return this.finScript.lines.map((l) => ({ speaker: byName(l.speaker), text: l.text })).filter((l) => l.speaker);
    const order = this.finOrder || this.players.map((p) => p.id);
    return S.FINALE_FALLBACK.map(([i, t]) => ({ speaker: order[i % order.length], text: t }));
  }
  async finale(g) {
    const r = await timeout(this.finaleP, 3000); this.guard(g); if (r && !this.finScript) this.finScript = r;
    const genre = this.finaleGenre; const names = this.players.map((p) => p.name);
    const f = this.fin = { genre, title: this.finScript?.title || pick(C.SHOW_TITLES[genre.id] || ['The Finale']), lines: this.finaleLines().map((l) => ({ ...l, kind: 'script', by: null, laughs: {}, total: 0 })), cur: -1, lockAt: 0, cutter: null, cutText: null, target: null, performed: 0 };
    this.sc = null;
    this.setPhase('CUT_INTRO', {}); this.sfx('whoosh');
    await this.say(g, S.LINES.cutIntro);
    const started = Date.now(); let sinceCut = 0; let nudged = false;
    this.setPhase('CUT', { step: 'play' });
    f.cur = 0;
    while (f.cur < f.lines.length && f.performed < 24) {
      const line = f.lines[f.cur]; this.sync();
      const res = await this.say(g, line.text, { pid: line.speaker, stopFn: () => !!f.cutter, urgent: line.kind !== 'script' });
      if (f.cutter) { await this.handleCut(g, names); sinceCut = 0; continue; }
      f.performed++; sinceCut++;
      if (res !== 'skip') { await this.wait(ms(0.35), () => !!f.cutter); this.guard(g); }
      if (f.cutter) { await this.handleCut(g, names); sinceCut = 0; continue; }
      f.cur++;
      if (sinceCut >= 4 && !nudged && f.cur < f.lines.length - 2) { nudged = true; await this.say(g, S.LINES.noCuts, { stopFn: () => !!f.cutter }); if (f.cutter) { f.cur--; await this.handleCut(g, names); sinceCut = 0; continue; } }
      if (Date.now() - started > ms(T.finale) && f.cur < f.lines.length - 1) f.lines = f.lines.slice(0, f.cur + 1);
    }
    f.cur = f.lines.length - 1; f.done = true;
    this.setPhase('CUT', { step: 'end' }); this.sfx('applause');
    await this.say(g, S.LINES.thatsAWrap);
  }
  async handleCut(g, names) {
    const f = this.fin; const cutter = this.P(f.cutter);
    this.cue = null;
    const at = Math.min(f.cur, f.lines.length); // the cut line replaces what would have been said at this point
    const next = f.lines[at + 1] || f.lines[at];
    f.target = next ? next.speaker : pick(this.players).id; f.cutText = null;
    this.setPhase('CUT', { step: 'write' }, T.cutWrite); this.sfx('scratch');
    this.sayOver(g, fill(S.LINES.cutCalled, { name: cutter.name }));
    await this.wait(ms(T.cutWrite), () => !!f.cutText); this.guard(g);
    if (!f.cutText) {
      f.cutter = null; f.lockAt = at + 1; this.setPhase('CUT', { step: 'play' });
      await this.say(g, fill(S.LINES.froze, { name: cutter.name }));
      f.cur = at + 1; return;
    }
    const inserted = { speaker: f.target, text: f.cutText, kind: 'cut', by: cutter.id, laughs: {}, total: 0 };
    const sofar = f.lines.slice(Math.max(0, at - 7), at + 1).map((l) => ({ speaker: this.P(l.speaker)?.name, text: l.text }));
    const remaining = f.lines.length - (at + 1);
    const lastOne = f.performed >= 14 || remaining <= 3;
    const contP = timeout(ai.continueFinale(f.genre, names, sofar, { speaker: this.P(f.target).name, text: f.cutText }, lastOne ? 3 : 5, lastOne), 12000);
    f.lines.splice(at + 1, 0, inserted);
    f.cur = at + 1; f.cutter = null; f.lockAt = at + 2;
    this.setPhase('CUT', { step: 'play' }); this.sfx('clapper');
    await this.say(g, inserted.text, { pid: inserted.speaker, urgent: true, maxWait: 5000 });
    f.performed++;
    await this.wait(ms(1)); this.guard(g);
    this.setPhase('CUT', { step: 'rewrite' }); this.sfx('typewriter');
    const cont = await timeout(contP, ms(6)); this.guard(g);
    if (cont) {
      const byName = (nm) => this.players.find((p) => p.name === nm)?.id;
      const fresh = cont.map((l) => ({ speaker: byName(l.speaker), text: l.text, kind: 'ai', by: null, laughs: {}, total: 0 })).filter((l) => l.speaker);
      fresh.forEach((l, i) => this.prefetch(l.text, l.speaker, i === 0));
      f.lines = f.lines.slice(0, f.cur + 1).concat(fresh);
    }
    f.cur++;
    this.setPhase('CUT', { step: 'play' });
  }

  maxCuts() { return this.mode === 'date' ? 3 : 2; }

  // ------------------------------------------------------------ Date Night: a scene for two
  // You say your line, then write your partner's reply and pick how they must say it.
  // The narrator barges in twice as a third character. A critic reviews every scene.
  async dateScene(g, sc) {
    this.sc = sc; this.cue = null; sc.date = true;
    this.setPhase('SCENE_INTRO', { step: 'genre' }); this.sfx('whoosh');
    await this.say(g, this.introText(sc));
    this.setPhase('SCENE_INTRO', { step: 'cast' }); this.sfx('drumroll');
    await this.say(g, this.starringText(sc));
    const [A, B] = sc.actors; const HUMAN = 8; const NPC_AT = [3, 6];
    const mk = (o) => ({ k: 0, speaker: null, writer: null, text: null, dir: null, auto: false, kind: 'human', laughs: {}, total: 0, crackVotes: {}, cracked: [], startedAt: null, doneAt: null, ...o });
    sc.lines = [mk({ speaker: A, text: sc.opener, dir: pick(S.DIRECTIONS), auto: true })];
    sc.cur = -1; sc.writing = null; sc.flash = null; sc.dispute = null; sc.npcP = null;
    this.setPhase('SCENE', {}); this.sfx('clapper');
    let humans = 0;
    while (true) {
      const k = sc.lines.length - 1; const line = sc.lines[k]; line.k = k;
      sc.cur = k; line.startedAt = Date.now(); this.sync(); this.later(g, 1600, () => this.sync());
      if (line.kind === 'npc') { await this.say(g, `${line.text}`, { urgent: true, maxWait: 4000 }); line.doneAt = Date.now(); }
      else {
        humans++;
        const actor = this.P(line.speaker);
        await this.wait(actor?.connected ? ms(T.act) : ms(4), () => !!line.doneAt); this.guard(g);
        line.doneAt = line.doneAt || Date.now();
        await this.wait(ms(1.2)); this.guard(g); // a beat for the partner to call a crack
        if (NPC_AT.includes(humans) && humans < HUMAN) {
          const role = sc.npcRole; const text = (await timeout(sc.npcP || Promise.resolve(null), 4000)) || pick(S.NPC_FALLBACK); this.guard(g);
          sc.lines.push(mk({ kind: 'npc', text, role })); sc.npcP = null; continue;
        }
      }
      if (humans >= HUMAN) break;
      // the one who just spoke writes the partner's reply
      const lastHuman = [...sc.lines].reverse().find((l) => l.kind === 'human');
      const writer = lastHuman.speaker; const speaker = writer === A ? B : A;
      const next = mk({ speaker, writer }); sc.lines.push(next); next.k = sc.lines.length - 1;
      sc.writing = { k: next.k, writer, endsAt: Date.now() + ms(T.write), dirs: shuffle(S.DIRECTIONS).slice(0, 3), votes: {}, ideas: shuffle(S.IDEAS).slice(0, 3) };
      this.sync();
      await this.wait(ms(9), () => !!next.text); this.guard(g);
      if (!next.text) { const w = this.P(writer); if (w?.quips?.length) this.sayOver(g, w.quips.shift()); await this.wait(Math.max(50, sc.writing.endsAt - Date.now()), () => !!next.text); this.guard(g); }
      if (!next.text) { next.text = pick(S.FALLBACK_LINES); next.auto = true; next.dir = pick(sc.writing.dirs); this.note(this.P(writer), 'Too slow! We wrote that one for you.', 'bad'); }
      sc.writing = null;
      if (NPC_AT.includes(humans + 1) && humans + 1 < HUMAN && ai.enabled()) sc.npcP = ai.interject(sc.genre, sc.npcRole, this.dateSofar(sc));
      if (humans + 1 >= HUMAN && ai.enabled()) sc.criticP = ai.critique(sc.genre, sc.critic || (sc.critic = pick(C.CRITICS)), this.dateSofar(sc));
    }
    sc.cur = sc.lines.length; sc.writing = null;
    await this.dateEnd(g, sc);
  }
  dateSofar(sc) { return sc.lines.filter((l) => l.text).map((l) => ({ speaker: l.kind === 'npc' ? l.role : this.P(l.speaker)?.name, text: l.text })); }
  async dateEnd(g, sc) {
    this.cue = null;
    this.setPhase('SCENE_END', { step: 'wrap' }); this.sfx('applause');
    await this.say(g, S.LINES.wrap);
    sc.critic = sc.critic || pick(C.CRITICS);
    this.setPhase('SCENE_END', { step: 'critic' }); this.sfx('typewriter');
    const crit = (await timeout(sc.criticP || Promise.resolve(null), ms(8))) || null; this.guard(g);
    const humanLines = sc.lines.filter((l) => l.kind === 'human' && l.writer && !l.auto);
    const names = sc.actors.map((id) => this.P(id).name);
    const stars = crit?.stars || 2 + Math.floor(Math.random() * 4);
    const review = crit?.review || fill(pick(S.REVIEW_FALLBACK), { a: names[0], b: names[1] });
    let best = crit && crit.best !== null ? sc.lines.filter((l) => l.text)[crit.best] : null;
    if (!best || best.kind !== 'human' || !best.writer || best.auto) best = humanLines.sort((a, b) => b.cracked.length - a.cracked.length)[0] || null;
    sc.review = { critic: sc.critic, stars, review, best: best ? best.k : null };
    if (best) { best.best = true; this.award(this.P(best.writer), PTS.lineOfScene, 'writer'); }
    this.setPhase('SCENE_END', { step: 'review' }); this.sfx('bell');
    await this.say(g, fill(S.LINES.critic, { name: sc.critic.name, outlet: sc.critic.outlet, stars, review }), { urgent: true, maxWait: 5000 });
    if (best) await this.say(g, fill(S.LINES.lineOfScene, { name: this.P(best.writer).name }));
    await this.wait(ms(2)); this.guard(g);
  }
  dateCrack(pid) {
    const sc = this.sc; const line = this.targetLine(sc);
    if (!line || line.kind !== 'human' || line.writer !== pid || line.cracked.length || line.claimed) return {};
    line.claimed = true; line.cracked.push(line.speaker);
    const actor = this.P(line.speaker); this.award(this.P(pid), PTS.crack, 'writer'); this.award(actor, PTS.cracked, 'actor');
    sc.flash = { kind: 'crack', id: line.speaker, at: Date.now() };
    sc.dispute = { k: line.k, actor: line.speaker, writer: pid, until: Date.now() + 6000, done: false };
    this.sfx('trombone'); this.sayOver(this.runId, fill(S.LINES.cracked, { name: actor.name }), { maxWait: 1500 });
    this.sync(); return { ok: true };
  }
  async dateDispute(pid) {
    const sc = this.sc; const dsp = sc?.dispute;
    if (!dsp || dsp.done || dsp.actor !== pid || Date.now() > dsp.until) return {};
    dsp.done = true; const g = this.runId; const line = sc.lines[dsp.k];
    sc.flash = { kind: 'coin', id: dsp.actor, at: Date.now() }; this.sfx('drumroll'); this.sync();
    const cracked = Math.random() < 0.5;
    this.sayOver(g, S.LINES.coin);
    setTimeout(() => {
      if (g !== this.runId) return;
      if (!cracked) { this.award(this.P(dsp.writer), -PTS.crack, 'writer'); this.award(this.P(dsp.actor), -PTS.cracked, 'actor'); line.cracked = []; }
      sc.flash = { kind: cracked ? 'crack' : 'clean', id: dsp.actor, at: Date.now() };
      this.sfx(cracked ? 'trombone' : 'applause');
      this.sayOver(g, cracked ? S.LINES.coinCracked : S.LINES.coinClean, { maxWait: 1500 });
    }, ms(3.2));
    return { ok: true };
  }

  // ------------------------------------------------------------ awards
  allLines() {
    const out = [];
    for (const sc of this.scenes || []) for (const l of sc.lines || []) if (l.writer && !l.auto) out.push({ text: l.text, by: l.writer, total: sc.date ? (l.best ? 2 : 0) + l.cracked.length : l.total });
    for (const l of this.fin?.lines || []) if (l.kind === 'cut') out.push({ text: l.text, by: l.by, total: l.total });
    return out;
  }
  board() { return [...this.players].sort((a, b) => b.score - a.score).map((p, i) => ({ ...this.pub(p), rank: i + 1, score: p.score, writerPts: p.writerPts, actorPts: p.actorPts })); }
  async awards(g) {
    this.cue = null;
    const cuts = (this.fin?.lines || []).filter((l) => l.kind === 'cut' && l.total > 0).sort((a, b) => b.total - a.total);
    if (cuts[0]) this.award(this.P(cuts[0].by), PTS.bestCut, 'writer');
    const best = this.allLines().sort((a, b) => b.total - a.total)[0];
    if (best && best.total > 0) {
      const lineCue = this.prefetch(`[dramatically] "${best.text}"`, null, true);
      this.setPhase('FINAL', { step: 'laugh', line: best }); this.sfx('drumroll');
      await this.say(g, fill(this.mode === 'date' ? S.LINES.lineOfNight : S.LINES.biggestLaugh, { name: this.P(best.by).name }));
      await timeout(lineCue, 3000);
      await this.say(g, `[dramatically] "${best.text}"`);
      this.sfx('laugh'); await this.wait(ms(1.5)); this.guard(g);
    }
    const actor = [...this.players].sort((a, b) => b.actorPts - a.actorPts)[0];
    if (actor && actor.actorPts > 0 && this.mode !== 'date') {
      this.setPhase('FINAL', { step: 'actor', who: actor.id }); this.sfx('applause');
      await this.say(g, fill(S.LINES.bestActor, { name: actor.name }));
      await this.wait(ms(1.5)); this.guard(g);
    }
    const rows = this.board();
    this.setPhase('FINAL', { step: 'winner', rows }); this.sfx('drumroll');
    await this.wait(ms(1.8)); this.guard(g);
    this.sfx('applause');
    await this.say(g, fill(S.LINES.headWriter, { name: rows[0].name }));
    this.setPhase('FINAL', { step: 'board', rows });
    await this.say(g, S.LINES.goodnight);
  }

  // ------------------------------------------------------------ player actions
  act(pid, a) {
    const p = this.P(pid); if (!p || !a) return {};
    this.lastActive = Date.now();
    const sc = this.sc; const f = this.fin;
    switch (a.type) {
      case 'start': return this.start(pid);
      case 'again': this.playAgain(pid); return {};
      case 'skip': this.skip(pid); return {};
      case 'kick': this.kick(pid, a.id); return {};
      case 'profile': this.setProfile(pid, a); return {};
      case 'line': {
        if (this.phase !== 'SCENE' || !sc?.writing || sc.writing.writer !== pid) return { error: 'Too late' };
        const t = clip(a.text, 140); if (!t) return { error: 'Write something first' };
        if (sc.date) { const l = sc.lines[sc.writing.k]; const di = Number(a.dir); l.dir = sc.writing.dirs[di >= 0 && di < 3 ? di : Math.floor(Math.random() * 3)]; l.text = t; this.check(); this.sfx('typewriter'); this.sync(); return { ok: true }; }
        this.submitLine(this.runId, sc, sc.writing.k, t); this.sfx('typewriter'); return { ok: true };
      }
      case 'dir': {
        if (this.phase !== 'SCENE' || !sc?.writing || sc.writing.writer === pid || sc.actors.includes(pid)) return {};
        const i = Number(a.i); if (i >= 0 && i < 3) { sc.writing.votes[pid] = i; this.sync(); } return {};
      }
      case 'done': {
        if (this.phase !== 'SCENE' || !sc || sc.cur < 0) return {};
        const line = sc.lines[sc.cur]; if (line && line.speaker === pid && !line.doneAt) { line.doneAt = Date.now(); this.check(); } return {};
      }
      case 'laugh': {
        if (this.phase === 'SCENE') {
          if (sc.actors.includes(pid)) return {};
          const line = this.targetLine(sc); if (!line || line.writer === pid) return {};
          const n = line.laughs[pid] || 0; if (n >= PTS.laughCap) return { capped: true };
          line.laughs[pid] = n + 1; line.total++; if (line.writer) this.award(this.P(line.writer), PTS.laugh, 'writer');
          this.sfx('laugh'); return {};
        }
        if (this.phase === 'CUT' && f && f.lines[f.cur]) {
          const line = f.lines[f.cur]; if (line.by === pid) return {};
          const n = line.laughs[pid] || 0; if (n >= PTS.laughCap) return { capped: true };
          line.laughs[pid] = n + 1; line.total++; if (line.kind === 'cut') this.award(this.P(line.by), PTS.laugh, 'writer');
          this.sfx('laugh'); return {};
        }
        return {};
      }
      case 'dispute': { if (this.phase === 'SCENE' && sc?.date) return this.dateDispute(pid); return {}; }
      case 'crack': {
        if (this.phase === 'SCENE' && sc?.date) return this.dateCrack(pid);
        if (this.phase !== 'SCENE' || !sc || sc.actors.includes(pid) || !sc.actors.includes(a.id)) return {};
        const line = this.targetLine(sc); if (!line || line.cracked.includes(a.id)) return {};
        (line.crackVotes[a.id] = line.crackVotes[a.id] || {})[pid] = true;
        const need = Math.max(1, Math.ceil(this.audience(sc).length / 2));
        if (Object.keys(line.crackVotes[a.id]).length >= need) {
          line.cracked.push(a.id);
          const actor = this.P(a.id); this.award(actor, PTS.cracked, 'actor');
          if (line.writer) this.award(this.P(line.writer), PTS.crack, 'writer');
          sc.flash = { kind: 'crack', id: a.id, at: Date.now() };
          this.sfx('trombone'); this.sayOver(this.runId, fill(S.LINES.cracked, { name: actor.name }), { maxWait: 1500 });
        }
        this.sync(); return {};
      }
      case 'vote': {
        if (this.phase !== 'SCENE_END' || this.d.step !== 'vote' || sc.actors.includes(pid) || !sc.actors.includes(a.id)) return {};
        this.d.votes[pid] = a.id; this.check(); this.sync(); return {};
      }
      case 'cut': {
        if (this.phase !== 'CUT' || this.d.step !== 'play' || !f || f.cutter || f.done) return {};
        if (f.cur < f.lockAt) return { error: 'Not yet! Let a line play first.' };
        if (p.cuts >= this.maxCuts()) return { error: 'You have used all your cuts.' };
        p.cuts++; f.cutter = pid; this.check(); this.sync(); return { ok: true };
      }
      case 'cutLine': {
        if (this.phase !== 'CUT' || this.d.step !== 'write' || f?.cutter !== pid) return { error: 'Too late' };
        const t = clip(a.text, 140); if (!t) return { error: 'Write something first' };
        f.cutText = t; this.check(); this.sync(); return { ok: true };
      }
      default: return {};
    }
  }

  // ------------------------------------------------------------ what each screen sees
  scenePub(sc) {
    return { i: sc.i, count: this.scenes.length, title: sc.title, setting: sc.setting, genre: { id: sc.genre.id, name: sc.genre.name, art: sc.genre.art, music: sc.genre.music, mood: sc.genre.mood, fx: sc.genre.fx || null }, actors: sc.actors.map((id, j) => ({ ...this.pub(this.P(id)), role: sc.roles[j] })) };
  }
  linePub(sc, l) { return l ? { k: l.k, speaker: l.speaker, text: l.text, dir: l.dir, total: l.total, by: this.pub(this.P(l.writer)), auto: l.auto, cracked: l.cracked, kind: l.kind || 'human', role: l.role || null } : null; }
  view(me) {
    const ph = this.phase; const d = this.d; const sc = this.sc; const f = this.fin;
    const v = {
      phase: ph, step: d.step || null, code: this.code, endsAt: this.endsAt, now: Date.now(), vipId: this.vip()?.id,
      players: this.players.map((p) => ({ ...this.pub(p), connected: p.connected, score: p.score })), fx: this.fx, x: {},
    };
    const x = v.x;
    v.mode = this.mode || null;
    if (!me) { v.cue = this.cue; v.joinUrl = this.joinUrl; v.qr = this.qr; v.aiOn = ai.enabled(); v.voiceOn = voice.enabled(); }
    else {
      v.me = { ...this.pub(me), pron: me.pron, vip: this.vip()?.id === me.id, notes: me.notes, score: me.score };
      v.mode = this.mode || null;
      if (sc && ['SCENE_INTRO', 'SCENE', 'SCENE_END'].includes(ph)) { const j = sc.actors.indexOf(me.id); v.me.actor = j >= 0; v.me.role = j >= 0 ? sc.roles[j] : null; }
    }
    if (['SCENE_INTRO', 'SCENE', 'SCENE_END'].includes(ph) && sc) {
      x.scene = this.scenePub(sc);
      if (ph === 'SCENE') {
        x.lineNo = Math.max(0, sc.cur) + 1; x.lineCount = sc.lines.length;
        x.cur = this.linePub(sc, sc.lines[sc.cur]);
        x.prev = sc.cur > 0 ? this.linePub(sc, sc.lines[sc.cur - 1]) : null;
        x.writing = sc.writing ? { k: sc.writing.k, writer: this.pub(this.P(sc.writing.writer)), endsAt: sc.writing.endsAt, speaker: this.pub(this.P(sc.lines[sc.writing.k].speaker)) } : null;
        x.flash = sc.flash && Date.now() - sc.flash.at < 3500 ? { ...sc.flash, who: this.pub(this.P(sc.flash.id)) } : null;
        x.laughs = sc.lines.reduce((a, l) => a + l.total, 0);
        if (sc.date) {
          x.mode = 'date'; x.crackCount = sc.lines.reduce((a, l) => a + l.cracked.length, 0);
          if (me) {
            const cur = sc.lines[sc.cur]; const partner = this.P(sc.actors.find((id) => id !== me.id));
            x.partner = this.pub(partner);
            x.myLine = cur && cur.kind === 'human' && cur.speaker === me.id && !cur.doneAt ? { k: cur.k, text: cur.text, dir: cur.dir } : null;
            if (sc.writing && sc.writing.writer === me.id) {
              const before = [...sc.lines].slice(0, sc.writing.k).reverse().find((l) => l.text);
              x.write = { k: sc.writing.k, endsAt: sc.writing.endsAt, speaker: { ...this.pub(partner), role: sc.roles[sc.actors.indexOf(partner.id)] }, prev: before ? { name: before.kind === 'npc' ? before.role : this.P(before.speaker)?.name, text: before.text } : null, ideas: sc.writing.ideas, dirs: sc.writing.dirs };
            }
            const t = this.targetLine(sc);
            x.watch = t && t.kind === 'human' && t.writer === me.id && t.speaker !== me.id && t.text ? { k: t.k, canCrack: !t.claimed } : null;
            x.dispute = sc.dispute && !sc.dispute.done && sc.dispute.actor === me.id && Date.now() < sc.dispute.until ? { until: sc.dispute.until } : null;
            x.partnerWriting = !!(sc.writing && sc.writing.writer !== me.id);
            x.npc = cur && cur.kind === 'npc' ? cur.role : null;
          }
        } else if (me) {
          const isActor = sc.actors.includes(me.id);
          if (isActor) {
            const cur = sc.lines[sc.cur];
            x.myLine = cur && cur.speaker === me.id && !cur.doneAt ? { k: cur.k, text: cur.text, dir: cur.dir } : null;
            const nextMine = sc.lines.slice(sc.cur + 1).find((l) => l.speaker === me.id);
            x.nextReady = !!(nextMine && nextMine.text); x.linesLeft = sc.lines.slice(Math.max(0, sc.cur)).filter((l) => l.speaker === me.id && !l.doneAt).length;
          } else if (sc.writing && sc.writing.writer === me.id) {
            const k = sc.writing.k; const before = sc.lines[k - 1];
            x.write = { k, endsAt: sc.writing.endsAt, speaker: { ...this.pub(this.P(sc.lines[k].speaker)), role: sc.roles[sc.actors.indexOf(sc.lines[k].speaker)] }, prev: before ? { name: this.P(before.speaker)?.name, text: before.text } : null, ideas: sc.writing.ideas };
          } else {
            if (sc.writing) x.dirs = { options: sc.writing.dirs, mine: sc.writing.votes[me.id] ?? null, forName: this.P(sc.lines[sc.writing.k].speaker)?.name };
            const t = this.targetLine(sc); x.myLaughs = t ? (t.laughs[me.id] || 0) : 0; x.laughCap = PTS.laughCap; x.ownLine = t ? t.writer === me.id : false;
            x.cracks = sc.actors.map((id) => ({ ...this.pub(this.P(id)), mine: !!(t && t.crackVotes[id]?.[me.id]), done: !!(t && t.cracked.includes(id)) }));
            const upcoming = sc.lines.slice(sc.cur + 1).find((l) => l.writer === me.id && !l.text);
            x.myTurnIn = upcoming && sc.writing ? upcoming.k - sc.writing.k : null;
          }
        }
      }
      if (ph === 'SCENE_END' && sc.date && sc.review && d.step === 'review') {
        const r = sc.review; const b = r.best !== null ? sc.lines[r.best] : null;
        x.review = { name: r.critic.name, outlet: r.critic.outlet, stars: r.stars, text: strip(r.review), best: b ? { ...this.linePub(sc, b), speakerName: this.P(b.speaker)?.name } : null };
      }
      if (ph === 'SCENE_END') {
        if (d.step === 'line') { const l = sc.lines[d.k]; x.line = this.linePub(sc, l); x.line.speakerName = this.P(l.speaker)?.name; }
        if (d.step === 'vote' || d.step === 'result') {
          const counts = Object.fromEntries(sc.actors.map((id) => [id, 0])); Object.values(d.votes || {}).forEach((id) => { if (id in counts) counts[id]++; });
          x.counts = counts; x.voted = Object.keys(d.votes || {}).length; x.voters = this.audience(sc).length;
          if (me) { x.myVote = d.votes?.[me.id] || null; x.canVote = !sc.actors.includes(me.id); }
        }
        if (d.step === 'result') x.winners = d.winners.map((id) => this.pub(this.P(id)));
        x.top = this.board().slice(0, 3);
      }
    }
    if ((ph === 'CUT_INTRO' || ph === 'CUT') && f) {
      x.fin = { title: f.title, genre: { id: f.genre.id, name: f.genre.name, art: f.genre.art, music: f.genre.music, mood: f.genre.mood }, step: d.step };
      const l = f.lines[f.cur];
      if (ph === 'CUT' && l) x.fin.line = { speaker: this.pub(this.P(l.speaker)), text: l.text, kind: l.kind, by: this.pub(this.P(l.by)), total: l.total };
      x.fin.cutter = this.pub(this.P(f.cutter));
      if (d.step === 'write') { x.fin.cutter = this.pub(this.P(f.cutter)); x.fin.target = this.pub(this.P(f.target)); }
      x.fin.locked = f.cur < f.lockAt || !!f.cutter || d.step !== 'play' || !!f.done;
      x.fin.lineNo = f.cur + 1; x.fin.lineCount = f.lines.length;
      if (me) {
        x.fin.cutsLeft = Math.max(0, this.maxCuts() - me.cuts);
        x.fin.myLaughs = l ? (l.laughs[me.id] || 0) : 0; x.fin.laughCap = PTS.laughCap; x.fin.ownLine = l ? l.by === me.id : false;
        if (d.step === 'write' && f.cutter === me.id) {
          const prev = f.lines[f.cur];
          x.fin.write = { target: this.pub(this.P(f.target)), prev: prev ? { name: this.P(prev.speaker)?.name, text: prev.text } : null, ideas: shuffle(S.IDEAS).slice(0, 3) };
        }
      }
    }
    if (ph === 'FINAL') {
      x.step = d.step;
      if (d.line) x.line = { text: d.line.text, by: this.pub(this.P(d.line.by)), total: d.line.total };
      if (d.who) { const p = this.P(d.who); x.who = { ...this.pub(p), actorPts: p.actorPts }; }
      if (d.rows) { x.rows = d.rows; if (me) x.mine = d.rows.find((r) => r.id === me.id); }
    }
    return v;
  }
}

module.exports = { Game };
