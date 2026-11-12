'use strict';
// WRITERS' ROOM: the game engine. One Game per room. The night runs itself as an async script.
// One season: the room builds one show (genre, pitch, characters), then writes three episodes with a rising bar,
// performed by the AI and rated by the Network. Miss the bar twice and the show is cancelled.
const crypto = require('crypto');
const C = require('./content');
const W = require('./pilots');
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
const cap1 = (t) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);
const endDot = (t) => (/[.!?…]$/.test(t) ? t : `${t}.`);
class Cancelled extends Error {}

const COLORS = ['#E07A3F', '#2F8F86', '#D9A13B', '#C9637A', '#5B7FC4', '#8C6BB1', '#6E9E4F', '#D46A5A', '#3E9FC1', '#B5803A', '#9C5B8F', '#4E8C6A'];
const PTS = { pitchWin: 500, beatWin: 300, vote: 100, like: 50, laugh: 25, laughCap: 4 };
const T = { pick: 45, write: 120, shortlist: 25, vote: 25 };
const GREENLIGHT = 7; // only used as a fallback; each episode has its own bar in W.EPISODES

// Character portraits: every public/assets/img/bust-NN file that exists, or 1..16 drawn stand-ins.
function bustPool() {
  let nums = [];
  try { nums = require('fs').readdirSync(require('path').join(__dirname, '..', 'public', 'assets', 'img')).map((f) => /^bust-(\d+)\.(png|jpe?g|webp)$/i.exec(f)).filter(Boolean).map((m) => Number(m[1])); } catch (e) { nums = []; }
  return nums.length >= 4 ? [...new Set(nums)].sort((a, b) => a - b) : [...Array(16).keys()].map((i) => i + 1);
}

class Game {
  constructor(code, hooks) {
    this.code = code; this.hooks = hooks;
    this.players = []; this.phase = 'LOBBY'; this.d = {}; this.endsAt = null; this.cue = null;
    this.runId = 0; this.waiter = null; this.lastActive = Date.now(); this.syncPending = false;
    this.fx = []; this.fxSeq = 0; this.timers = []; this.busts = bustPool();
    for (const t of Object.values(W.HOST)) if (typeof t === 'string' && !t.includes('{')) this.prefetch(t); // record fixed lines while people join
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
  // who: null = Johnny (host), 'exec' = the Network, 'hero' / 'rival' = this pilot's characters
  voiceFor(who) {
    if (!who) return voice.NARRATOR();
    if (who === 'exec') return voice.EXEC();
    const vs = voice.charVoices(); const pl = this.pl; const off = pl ? pl.voiceOff : 0;
    return vs[(off + (who === 'rival' ? 1 : 0)) % vs.length];
  }
  spoken(text) { let t = text; for (const p of this.players) if (p.pron) t = t.replace(new RegExp(`\\b${p.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g'), p.pron); return t; }
  prefetch(text, who, urgent) { return voice.get(this.spoken(text), this.voiceFor(who), urgent, who === 'hero' || who === 'rival'); }
  estimate(text) { return Math.min(30000, 900 + strip(text).length * 62); }
  async makeCue(text, opts = {}) {
    let audioId = null;
    if (voice.enabled()) audioId = await timeout(this.prefetch(text, opts.who, opts.urgent), opts.maxWait || 6000);
    return { id: uid(), text: strip(text), speak: strip(this.spoken(text)), audio: audioId ? `/audio/${audioId}` : null, kind: opts.who || 'host', who: opts.who || null };
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
    const p = { id: uid(), token: uid(), name, pron: clip(pron, 30), color: COLORS.find((c) => !used.has(c)) || pick(COLORS), connected: true, notes: [], noteSeq: 0, bust: null };
    this.reset(p); this.players.push(p); this.sync();
    if (p.pron) this.prefetch(p.name);
    return { player: p };
  }
  reset(p) { Object.assign(p, { score: 0, wins: 0, laughsGot: 0, srCount: 0 }); }
  setConnected(id, on) { const p = this.P(id); if (p) { p.connected = on; this.lastActive = Date.now(); this.check(); this.sync(); } }
  setProfile(id, a) { const p = this.P(id); if (!p) return; if ('pron' in a) p.pron = clip(a.pron, 30); this.sync(); }
  setBust(id, n) {
    const p = this.P(id); n = Number(n);
    if (!p || !this.busts.includes(n) || this.players.some((x) => x !== p && x.bust === n)) return { error: 'Someone already picked that one' };
    p.bust = n; this.sync(); return { ok: true };
  }
  kick(byId, target) { if (this.phase !== 'LOBBY' || this.vip()?.id !== byId) return; this.players = this.players.filter((p) => p.id !== target); this.hooks.kicked?.(target); this.sync(); }
  note(p, text, kind = 'info') { if (!p) return; p.noteSeq++; p.notes.push({ id: p.noteSeq, text, kind }); if (p.notes.length > 4) p.notes.shift(); }
  award(p, pts) { if (p && pts) p.score += pts; }

  start(byId) {
    if (byId && this.vip()?.id !== byId) return { error: 'Only the first player can start' };
    if (this.phase !== 'LOBBY') return {};
    this.players = this.players.filter((p) => p.connected);
    if (this.players.length < 2) return { error: 'You need at least 2 players' };
    this.mode = this.players.length === 2 ? 'date' : 'party';
    this.players.forEach((p) => this.reset(p));
    const free = shuffle(this.busts.filter((b) => !this.players.some((p) => p.bust === b)));
    this.players.forEach((p) => { if (!p.bust) p.bust = free.shift() || pick(this.busts); });
    this.pilots = []; this.pl = null;
    const g = ++this.runId;
    this.run(g).catch((e) => { if (!(e instanceof Cancelled)) { console.error('run error', e); this.setPhase('FINAL', { step: 'board', rows: this.board() }); } });
    return {};
  }
  playAgain(byId) { if (this.phase !== 'FINAL' || this.vip()?.id !== byId) return; this.runId++; this.clearTimers(); this.players = this.players.filter((p) => p.connected); this.players.forEach((p) => this.reset(p)); this.cue = null; this.pl = null; this.pilots = []; this.setPhase('LOBBY', {}); }

  // ------------------------------------------------------------ the night
  async run(g) {
    for (const p of this.players) p.hurryLine = fill(pick(W.HOST.hurry), { w: p.name });
    this.setPhase('INTRO', { step: 'welcome' }); this.sfx('whoosh');
    await this.say(g, W.HOST.welcome);
    this.setPhase('INTRO', { step: 'how' });
    await this.say(g, W.HOST.how);
    if (voice.enabled()) this.players.forEach((p) => this.prefetch(p.hurryLine));
    await this.season(g);
    await this.seasonEnd(g);
  }

  nextShowrunner() {
    const sr = shuffle(this.players).sort((a, b) => (a.srCount - b.srCount) || (b.connected - a.connected))[0];
    sr.srCount++; return sr;
  }
  // the story so far, for the AI writer
  story() {
    const pl = this.pl; const out = [];
    for (const e of pl.episodes || []) for (const k of e.acts) if (e.beats[k]) out.push(`${e.short}: ${e.beats[k].text}`);
    return out.slice(-4).join(' Then: ') || null;
  }

  // One show, one season: set it up together, then three episodes with a rising bar.
  async season(g) {
    const sr = this.nextShowrunner();
    const free = shuffle(this.busts.filter((b) => !this.players.some((p) => p.bust === b)));
    const pl = this.pl = {
      i: 0, showrunner: sr.id, genre: null, title: null, pitch: null, pitchBy: null,
      hero: { name: null, traits: [], bust: free[0] || pick(this.busts) }, rival: { name: null, traits: [], bust: free[1] || pick(this.busts) },
      notes: [], beats: {}, scenes: {}, noteOk: [], laughs: 0, exec: null, rating: null, parts: null,
      voiceOff: Math.floor(Math.random() * 3), ticker: [], episodes: [], ep: -1, strikes: 0, cancelled: false,
    };
    this.pilots = [pl];

    // 1. the showrunner picks a genre from every genre we have
    this.setPhase('GENRE', { step: 'pick' }, T.pick);
    this.sayOver(g, fill(W.HOST.showrunner, { name: sr.name }));
    await this.wait(ms(T.pick), () => !!pl.genre); this.guard(g);
    if (!pl.genre) pl.genre = pick(C.GENRES);
    pl.ticker = shuffle(W.TICKER).slice(0, 6);
    this.setPhase('GENRE', { step: 'reveal' }); this.sfx('whoosh');
    await this.say(g, fill(W.HOST.genrePicked, { genre: pl.genre.name }));

    // 2. the pitch
    this.setPhase('BRIEF', { kind: 'pitch' });
    await this.say(g, W.HOST.pitchIntro);
    const pitches = await this.writeRound(g, 'pitch');
    const pw = await this.selectRound(g, 'pitch', pitches, 'A ___ who ___ must ___ before ___');
    pl.pitch = pw.text; pl.pitchBy = pw.pid;
    const titleP = timeout(ai.pilotTitle(pl.genre, pl.pitch), 8000);
    pl.title = (await titleP) || pick(C.SHOW_TITLES[pl.genre.id] || ['Untitled Pilot']); this.guard(g);
    pl.ticker = pl.ticker.map((t) => fill(t, { title: pl.title, genre: pl.genre.name }));
    this.setPhase('TITLE', {}); this.sfx('drumroll');
    await this.say(g, `[dramatic] ${pl.title}. [beat] ${pl.pitch}`, { urgent: true });

    // 3. the characters: everyone answers a different question
    this.setPhase('BRIEF', { kind: 'traits' });
    await this.say(g, W.HOST.traitsIntro);
    await this.traitRound(g);
    this.setPhase('CAST', { step: 'hero' }); this.sfx('whoosh');
    await this.say(g, `${W.HOST.meetHero} ${this.cardText(pl.hero)}`, { urgent: true });
    this.setPhase('CAST', { step: 'rival' }); this.sfx('dundun');
    await this.say(g, `${W.HOST.meetRival} ${this.cardText(pl.rival)}`, { urgent: true });

    // 4. the episodes
    const notes = shuffle(W.NOTES);
    for (let e = 0; e < W.EPISODES.length; e++) {
      const ep = W.EPISODES[e]; const prev = pl.episodes[e - 1];
      if (e > 0) pl.showrunner = this.nextShowrunner().id;
      Object.assign(pl, { ep: e, notes: notes.slice(e * 2, e * 2 + 2), beats: {}, scenes: {}, noteOk: [], exec: null, rating: null, parts: null, verdictP: null, sceneP: null });
      if (e > 0) pl.laughs = 0;
      this.setPhase('EPISODE', { step: 'card' }); this.sfx('drumroll');
      await this.say(g, fill(W.HOST.episode[e], { name: this.P(pl.showrunner)?.name || '' }));
      if (prev) {
        this.setPhase('EPISODE', { step: 'previously' }); this.sfx('whoosh');
        await this.say(g, fill(W.HOST.previously, { title: pl.title, a: endDot(prev.beats.problem?.text || ''), b: endDot(prev.beats[prev.acts[1]]?.text || '') }), { urgent: true });
      }
      for (const [k, kind] of ep.acts.entries()) {
        this.setPhase('BRIEF', { kind, note: pl.notes[k] }); this.sfx('bell');
        await this.say(g, kind === 'problem' ? W.HOST.problemIntro : kind === 'cliffhanger' ? W.HOST.cliffIntro : W.HOST.endingIntro);
        await this.say(g, `[dry] The note says: ${pl.notes[k]}`, { who: 'exec' });
        const entries = await this.writeRound(g, kind);
        const story = this.story();
        const sceneArgs = (beat) => ({ genre: pl.genre, pitch: pl.pitch, hero: this.charForAI(pl.hero), rival: this.charForAI(pl.rival), prev: kind === 'problem' ? story : [story, `This week: ${pl.beats.problem?.text}`].filter(Boolean).join(' '), beat, note: pl.notes[k], kind, episode: ep.name });
        const win = await this.selectRound(g, kind, entries, W.BEATS[kind].hint, sceneArgs);
        pl.beats[kind] = win;
        if (k === ep.acts.length - 1) pl.verdictP = timeout(ai.pilotVerdict({ genre: pl.genre, title: `${pl.title}: ${ep.name}`, pitch: pl.pitch, hero: pl.hero.name, rival: pl.rival.name, problem: pl.beats.problem?.text || '', ending: win.text }), 15000);
        await this.performScene(g, kind, win);
      }
      await this.screening(g);
      pl.episodes.push({ n: e, name: ep.name, short: ep.short, target: ep.target, acts: ep.acts, rating: pl.rating, parts: pl.parts, beats: { ...pl.beats } });
      if (pl.cancelled) break;
    }
  }

  charForAI(c) { return { name: c.name, traits: c.traits.map((t) => `${W.TRAIT_LABEL[t.k] || t.k}: ${t.text}`) }; }
  cardText(c) { return [`${c.name}.`, ...c.traits.map((t) => `${W.TRAIT_LABEL[t.k] || t.k}... ${endDot(t.text)}`)].join(' [beat] '); }

  // Everyone writes at once. Ends early when everyone is done.
  async writeRound(g, kind) {
    const wr = this.wr = { kind, entries: {}, endsAt: Date.now() + ms(T.write), lastHurry: 0 };
    this.setPhase('WRITE', { kind, note: kind === 'problem' ? this.pl.notes[0] : W.BEATS[kind] ? this.pl.notes[1] : null }, T.write);
    const done = () => this.live().every((p) => wr.entries[p.id] !== undefined);
    await this.wait(ms(T.write - 60), done); this.guard(g);
    if (!done()) { this.sayOver(g, W.HOST.writeHalf); await this.wait(ms(30), done); this.guard(g); }
    if (!done()) {
      const late = this.live().filter((p) => wr.entries[p.id] === undefined).map((p) => p.name);
      this.sayOver(g, fill(W.HOST.writeLast, { names: late.length > 2 ? `${late.slice(0, -1).join(', ')} and ${late.slice(-1)}` : late.join(' and ') }));
      await this.wait(Math.max(50, wr.endsAt - Date.now()), done); this.guard(g);
    }
    wr.closed = true; this.sfx('bell');
    return { ...wr.entries };
  }

  // The character round: questions handed out so everyone has at least one.
  async traitRound(g) {
    const pl = this.pl; const ps = shuffle(this.live());
    const total = Math.min(12, Math.max(6, ps.length));
    const qs = [...W.TRAITS_FIRST, ...W.TRAITS].slice(0, total);
    const ask = Object.fromEntries(ps.map((p) => [p.id, []]));
    qs.forEach((q, i) => ask[ps[i % ps.length].id].push(q));
    this.traitAsk = ask;
    const entries = await this.writeRound(g, 'traits');
    for (const [pid, qList] of Object.entries(ask)) {
      const answers = entries[pid] || {};
      qList.forEach((q, j) => {
        const text = clip(answers[j], 60); if (!text) return;
        const c = pl[q.who];
        if (q.k === 'name') c.name = cap1(text); else c.traits.push({ k: q.k, text, by: pid });
      });
    }
    pl.hero.name = pl.hero.name || pick(['Dev', 'Tara', 'Max', 'Priya', 'Leo', 'Nina']);
    pl.rival.name = pl.rival.name || pick(['Rocky', 'Vera', 'Duke', 'Kitty', 'Raj', 'Odile']);
    for (const c of [pl.hero, pl.rival]) {
      const order = ['collects', 'fear', 'catchphrase', 'secret', 'habit'];
      c.traits.sort((a, b) => order.indexOf(a.k) - order.indexOf(b.k));
      c.traits = c.traits.slice(0, 4);
    }
    if (voice.enabled()) { this.prefetch(`${W.HOST.meetHero} ${this.cardText(pl.hero)}`, null, true); this.prefetch(`${W.HOST.meetRival} ${this.cardText(pl.rival)}`, null, true); }
  }

  // Pick a winner: shortlist (big rooms), the finalists read aloud, everyone votes.
  // For two players, the Network exec judges. sceneArgs lets us start writing the scene early.
  async selectRound(g, kind, entries, fallbackText, sceneArgs = null) {
    let ids = shuffle(Object.keys(entries).filter((id) => clip(entries[id], 200)));
    const textOf = (id) => clip(entries[id], 200);
    if (!ids.length) return { pid: null, text: fallbackText };
    if (ids.length === 1) { const w = { pid: ids[0], text: textOf(ids[0]) }; this.awardWin(kind, w.pid); return w; }

    if (this.mode === 'date') {
      const fin = ids.slice(0, 2).map((id) => ({ id, text: textOf(id) }));
      const pre = this.preScenes(fin, sceneArgs);
      this.setPhase('VOTE', { step: 'judge', kind, finalists: fin, winner: null });
      fin.forEach((f) => this.prefetch(f.text, null, true));
      const judged = timeout(ai.pickBetween(kind === 'pitch' ? 'pitch a TV show' : W.BEATS[kind].lead, fin[0].text, fin[1].text), 9000);
      await this.say(g, W.HOST.dateJudge);
      for (let i = 0; i < fin.length; i++) { this.d.idx = i; this.sync(); await this.say(g, fin[i].text, { urgent: true }); }
      const j = (await judged) || { pick: Math.floor(Math.random() * 2), why: pick(W.EXEC_FALLBACK) }; this.guard(g);
      const w = fin[j.pick];
      this.useScene(pre, w.id);
      this.setPhase('VOTE', { step: 'result', kind, finalists: fin, winner: w.id, counts: {}, why: j.why }); this.sfx('applause');
      this.awardWin(kind, w.id);
      await this.say(g, `[dry] ${j.why}`, { who: 'exec', urgent: true });
      return { pid: w.id, text: w.text };
    }

    // big rooms: everyone likes two random entries, the top three go to the final
    if (ids.length > 4) {
      const likes = Object.fromEntries(ids.map((id) => [id, 0]));
      const cards = {}; const seen = {};
      for (const p of this.live()) {
        const others = shuffle(ids.filter((id) => id !== p.id)).sort((a, b) => (seen[a] || 0) - (seen[b] || 0)).slice(0, 2);
        others.forEach((id) => { seen[id] = (seen[id] || 0) + 1; });
        cards[p.id] = others.map((id) => ({ id, text: textOf(id), liked: null }));
      }
      this.sl = { cards, likes };
      this.setPhase('SHORTLIST', { kind }, T.shortlist);
      this.sayOver(g, W.HOST.shortlist);
      await this.wait(ms(T.shortlist), () => this.live().every((p) => (cards[p.id] || []).every((c) => c.liked !== null))); this.guard(g);
      for (const [id, n] of Object.entries(likes)) this.award(this.P(id), n * PTS.like);
      ids = ids.sort((a, b) => likes[b] - likes[a]).slice(0, 3);
      ids = shuffle(ids);
      this.sl = null;
    }

    const fin = ids.map((id) => ({ id, text: textOf(id) }));
    const pre = this.preScenes(fin, sceneArgs);
    fin.forEach((f) => this.prefetch(f.text, null, true));
    this.setPhase('VOTE', { step: 'read', kind, finalists: fin, idx: -1 });
    await this.say(g, W.HOST.finalists);
    for (let i = 0; i < fin.length; i++) { this.d.idx = i; this.sync(); await this.say(g, fin[i].text, { urgent: true }); }
    const votes = {};
    this.setPhase('VOTE', { step: 'vote', kind, finalists: fin, votes }, T.vote);
    this.sayOver(g, W.HOST.voteNow);
    const voters = () => this.live().filter((p) => fin.some((f) => f.id !== p.id));
    await this.wait(ms(T.vote), () => voters().every((p) => votes[p.id])); this.guard(g);
    const counts = Object.fromEntries(fin.map((f) => [f.id, 0])); Object.values(votes).forEach((id) => { if (id in counts) counts[id]++; });
    const top = Math.max(...Object.values(counts));
    let tied = fin.filter((f) => counts[f.id] === top).map((f) => f.id);
    let tieBreak = false;
    if (tied.length > 1) { const srv = votes[this.pl.showrunner]; tieBreak = true; tied = [tied.includes(srv) ? srv : pick(tied)]; }
    const wid = tied[0]; const w = fin.find((f) => f.id === wid);
    this.useScene(pre, wid);
    for (const f of fin) this.award(this.P(f.id), counts[f.id] * PTS.vote);
    this.awardWin(kind, wid);
    this.setPhase('VOTE', { step: 'result', kind, finalists: fin, winner: wid, counts }); this.sfx('applause');
    if (tieBreak) await this.say(g, fill(W.HOST.tie, { name: this.P(this.pl.showrunner)?.name || 'Showrunner' }));
    await this.say(g, fill(kind === 'pitch' ? W.HOST.pitchWinner : W.HOST.beatWinner, { name: this.P(wid)?.name || 'someone' }));
    return { pid: wid, text: w.text };
  }
  // Write a scene for every finalist while people vote, so the winner's scene is ready at once.
  preScenes(fin, sceneArgs) {
    if (!sceneArgs || !ai.enabled()) return null;
    return Object.fromEntries(fin.map((f) => [f.id, timeout(ai.pilotScene(sceneArgs(f.text)), 25000)]));
  }
  // The winner's scene: start voicing its lines straight away.
  useScene(pre, wid) {
    if (!pre || !pre[wid]) return;
    this.pl.sceneP = pre[wid];
    pre[wid].then((sc) => { if (sc && voice.enabled()) sc.lines.forEach((l) => this.prefetch(l.text, l.who === 'narrator' ? null : l.who, true)); });
  }
  awardWin(kind, pid) { const p = this.P(pid); if (!p) return; this.award(p, kind === 'pitch' ? PTS.pitchWin : PTS.beatWin); p.wins++; }

  // The AI dramatises the room's choice; everyone can laugh along.
  async performScene(g, kind, win) {
    const pl = this.pl; const k = kind === 'problem' ? 0 : 1;
    const args = { genre: pl.genre, pitch: pl.pitch, hero: this.charForAI(pl.hero), rival: this.charForAI(pl.rival), prev: kind === 'problem' ? this.story() : pl.beats.problem?.text, beat: win.text, note: pl.notes[k], kind };
    let sc = await timeout(pl.sceneP || (ai.enabled() ? ai.pilotScene(args) : Promise.resolve(null)), 9000); this.guard(g); pl.sceneP = null;
    if (!sc) sc = { lines: W.SCENE_FALLBACK[kind].map(([who, t]) => ({ who, text: fill(t, { hero: pl.hero.name, rival: pl.rival.name, beat: endDot(win.text) }) })), noteHonoured: null };
    pl.noteOk[k] = sc.noteHonoured;
    // voice every line before the camera rolls, so they play back to back
    const ready = voice.enabled() ? timeout(Promise.all(sc.lines.map((l) => this.prefetch(l.text, l.who === 'narrator' ? null : l.who, true))), 8000) : Promise.resolve();
    const scene = pl.scenes[kind] = { lines: sc.lines, cur: -1, by: win.pid, laughs: {}, total: 0 };
    this.setPhase('SCENE', { kind }); this.sfx('clapper');
    await this.say(g, W.HOST.rollScene);
    await ready; this.guard(g);
    for (let i = 0; i < sc.lines.length; i++) {
      scene.cur = i; this.sync();
      const l = sc.lines[i];
      await this.say(g, l.text, { who: l.who === 'narrator' ? null : l.who, maxWait: 2500 });
    }
    await this.wait(ms(1)); this.guard(g);
    scene.cur = sc.lines.length;
    if (sc.noteHonoured === true) { this.d.note = 'yes'; this.sfx('bell'); this.sync(); await this.say(g, W.HOST.noteYes); }
    else if (sc.noteHonoured === false) { this.d.note = 'no'; this.sfx('trombone'); this.sync(); await this.say(g, W.HOST.noteNo); }
  }

  async screening(g) {
    const pl = this.pl; const n = Math.max(1, this.live().length);
    this.setPhase('SCREENING', { step: 'watch' }); this.sfx('drumroll');
    await this.say(g, W.HOST.screening);
    const v = (await timeout(pl.verdictP || Promise.resolve(null), 6000)) || { score: 1 + Math.random() * 1.5, line: pick(W.EXEC_FALLBACK) }; this.guard(g);
    pl.exec = v;
    this.setPhase('SCREENING', { step: 'exec' });
    await this.say(g, `[dry] ${v.line}`, { who: 'exec', urgent: true });
    const laughPart = Math.min(4, (pl.laughs / (n * 3)) * 4);
    const notePart = pl.noteOk.reduce((a, ok) => a + (ok === true ? 1.5 : ok === null || ok === undefined ? 0.9 : 0), 0);
    const rating = Math.round(Math.min(10, laughPart + notePart + v.score) * 10) / 10;
    pl.parts = { laughs: Math.round(laughPart * 10) / 10, notes: Math.round(notePart * 10) / 10, exec: Math.round(v.score * 10) / 10 };
    pl.rating = rating;
    const ep = W.EPISODES[pl.ep] || { target: GREENLIGHT }; const hit = rating >= ep.target; const last = pl.ep === W.EPISODES.length - 1;
    if (!hit) { pl.strikes++; if (pl.strikes >= 2 && !last) pl.cancelled = true; }
    this.setPhase('SCREENING', { step: 'score', hit, target: ep.target }); this.sfx(hit ? 'applause' : 'trombone');
    const o = { title: pl.title, score: String(rating).replace('.', ' point '), target: ep.target };
    await this.say(g, fill(hit ? W.HOST.hit : pl.cancelled ? W.HOST.cancel : last ? '[sighs] {score}. The bar was {target}.' : W.HOST.warn, o));
    await this.wait(ms(2)); this.guard(g);
  }

  board() { return [...this.players].sort((a, b) => b.score - a.score).map((p, i) => ({ ...this.pub(p), rank: i + 1, score: p.score, wins: p.wins, laughs: p.laughsGot })); }
  async seasonEnd(g) {
    const pl = this.pl; this.cue = null;
    const last = pl.episodes[pl.episodes.length - 1];
    const lit = !pl.cancelled && !!last && last.n === W.EPISODES.length - 1 && last.rating >= last.target;
    this.setPhase('UPFRONTS', { step: 'verdict', lit, cancelled: pl.cancelled }); this.sfx(lit ? 'applause' : 'trombone');
    if (!pl.cancelled) await this.say(g, fill(lit ? W.HOST.seasonWin : W.HOST.seasonLose, { title: pl.title }));
    await this.wait(ms(2.5)); this.guard(g);
    const rows = this.board();
    this.setPhase('FINAL', { step: 'winner', rows, lit }); this.sfx('drumroll');
    await this.wait(ms(1.6)); this.guard(g); this.sfx('applause');
    await this.say(g, fill(W.HOST.headWriter, { name: rows[0].name }));
    this.setPhase('FINAL', { step: 'board', rows, lit });
    await this.say(g, W.HOST.goodnight);
  }

  // ------------------------------------------------------------ player actions
  act(pid, a) {
    const p = this.P(pid); if (!p || !a) return {};
    this.lastActive = Date.now();
    const pl = this.pl;
    switch (a.type) {
      case 'start': return this.start(pid);
      case 'again': this.playAgain(pid); return {};
      case 'menu': if (this.phase === 'FINAL' && this.vip()?.id === pid) this.hooks.menu?.(); return {};
      case 'skip': this.skip(pid); return {};
      case 'kick': this.kick(pid, a.id); return {};
      case 'profile': this.setProfile(pid, a); return {};
      case 'bust': if (this.phase !== 'LOBBY') return {}; return this.setBust(pid, a.n);
      case 'genre': {
        if (this.phase !== 'GENRE' || this.d.step !== 'pick' || !pl || pl.showrunner !== pid || pl.genre) return {};
        const gnr = C.GENRES.find((x) => x.id === a.id); if (!gnr) return {};
        pl.genre = gnr; this.check(); this.sync(); return { ok: true };
      }
      case 'write': {
        const wr = this.wr; if (this.phase !== 'WRITE' || !wr || wr.closed) return { error: 'Too late' };
        if (wr.kind === 'pitch') {
          const f = a.fields || {}; const parts = W.PITCH.map((x) => clip(f[x.k], 70));
          if (!parts[0] || !parts[2]) return { error: 'Fill in at least the first and third blanks' };
          wr.entries[pid] = endDot(cap1(`a ${parts[0]}${parts[1] ? ` who ${parts[1]}` : ''} must ${parts[2]}${parts[3] ? ` before ${parts[3]}` : ''}`));
        } else if (wr.kind === 'traits') {
          const ans = Array.isArray(a.answers) ? a.answers.map((t) => clip(t, 60)) : [];
          if (!ans.some(Boolean)) return { error: 'Answer at least one question' };
          wr.entries[pid] = ans;
        } else {
          const t = clip(a.text, 160); if (!t) return { error: 'Write something first' };
          wr.entries[pid] = t;
        }
        this.sfx('typewriter'); this.check(); this.sync(); return { ok: true };
      }
      case 'hurry': {
        const wr = this.wr; if (this.phase !== 'WRITE' || !wr || wr.closed || wr.entries[pid] === undefined) return {};
        if (Date.now() - wr.lastHurry < 12000) return { error: 'Johnny is catching his breath. Try again in a moment.' };
        const late = this.live().filter((x) => wr.entries[x.id] === undefined); if (!late.length) return {};
        wr.lastHurry = Date.now(); const target = pick(late);
        this.sayOver(this.runId, target.hurryLine || fill(pick(W.HOST.hurry), { w: target.name })); this.sfx('bell');
        return { ok: true };
      }
      case 'like': {
        if (this.phase !== 'SHORTLIST' || !this.sl) return {};
        const card = (this.sl.cards[pid] || []).find((c) => c.id === a.id); if (!card || card.liked !== null) return {};
        card.liked = !!a.like; if (card.liked) this.sl.likes[card.id]++;
        this.check(); this.sync(); return {};
      }
      case 'vote': {
        if (this.phase !== 'VOTE' || this.d.step !== 'vote' || a.id === pid || !this.d.finalists.some((f) => f.id === a.id)) return {};
        this.d.votes[pid] = a.id; this.check(); this.sync(); return {};
      }
      case 'laugh': {
        if (!pl) return {};
        if (this.phase === 'SCENE') {
          const sc = pl.scenes[this.d.kind]; if (!sc || sc.by === pid) return { own: true };
          const n = sc.laughs[pid] || 0; if (n >= PTS.laughCap) return { capped: true };
          sc.laughs[pid] = n + 1; sc.total++; pl.laughs++;
          const w = this.P(sc.by); this.award(w, PTS.laugh); if (w) w.laughsGot++;
          this.sfx('laugh'); this.sync(); return {};
        }
        if (this.phase === 'CAST') {
          const key = `cast_${this.d.step}`; pl.castLaughs = pl.castLaughs || {}; const m = pl.castLaughs[key] = pl.castLaughs[key] || {};
          const n = m[pid] || 0; if (n >= PTS.laughCap) return { capped: true };
          m[pid] = n + 1; pl.laughs++; this.sfx('laugh'); this.sync(); return {};
        }
        return {};
      }
      default: return {};
    }
  }

  // ------------------------------------------------------------ what each screen sees
  pilotPub(pl) {
    if (!pl) return null;
    const card = (c) => ({ name: c.name, bust: c.bust, traits: c.traits.map((t) => ({ label: W.TRAIT_LABEL[t.k] || t.k, text: t.text, by: this.pub(this.P(t.by)) })) });
    return {
      i: pl.i, count: 1, title: pl.title, season: this.seasonPub(pl), pitch: pl.pitch, pitchBy: this.pub(this.P(pl.pitchBy)), showrunner: this.pub(this.P(pl.showrunner)),
      genre: pl.genre ? { id: pl.genre.id, name: pl.genre.name, art: pl.genre.art, music: pl.genre.music, mood: pl.genre.mood, fx: pl.genre.fx || null } : null,
      hero: card(pl.hero), rival: card(pl.rival), notes: pl.notes, rating: pl.rating, parts: pl.parts, exec: pl.exec?.line || null, ticker: pl.ticker, laughs: pl.laughs,
      beats: Object.fromEntries(Object.entries(pl.beats).map(([k, b]) => [k, { text: b.text, by: this.pub(this.P(b.pid)) }])),
    };
  }
  seasonPub(pl) {
    const n = Math.max(1, this.live().length);
    const ep = W.EPISODES[pl.ep] || null;
    const meter = { laughs: Math.round(Math.min(4, (pl.laughs / (n * 3)) * 4) * 10) / 10, notes: pl.noteOk.reduce((a, ok) => a + (ok === true ? 1.5 : 0), 0), exec: pl.exec ? Math.round(pl.exec.score * 10) / 10 : null };
    meter.total = Math.round(Math.min(10, meter.laughs + meter.notes + (meter.exec || 0)) * 10) / 10;
    return {
      ep: pl.ep, strikes: pl.strikes, cancelled: pl.cancelled, meter, target: ep?.target ?? null, name: ep?.name ?? null, acts: ep?.acts ?? [],
      episodes: W.EPISODES.map((e, i) => ({ name: e.name, short: e.short, target: e.target, rating: pl.episodes[i]?.rating ?? null })),
    };
  }
  view(me) {
    const ph = this.phase; const d = this.d; const pl = this.pl;
    const v = {
      phase: ph, step: d.step || null, code: this.code, endsAt: this.endsAt, now: Date.now(), vipId: this.vip()?.id, mode: this.mode || null,
      players: this.players.map((p) => ({ ...this.pub(p), connected: p.connected, score: p.score })), fx: this.fx, x: {},
    };
    const x = v.x;
    x.pilot = this.pilotPub(pl);
    x.pilots = (this.pilots || []).map((q) => ({ i: q.i, title: q.title, rating: q.rating, genre: q.genre?.name }));
    if (!me) { v.cue = this.cue; v.joinUrl = this.joinUrl; v.qr = this.qr; v.aiOn = ai.enabled(); v.voiceOn = voice.enabled(); }
    else v.me = { ...this.pub(me), pron: me.pron, vip: this.vip()?.id === me.id, notes: me.notes, score: me.score, showrunner: !!(pl && pl.showrunner === me.id) };
    if (ph === 'LOBBY') x.busts = this.busts.map((n) => ({ n, by: this.players.find((p) => p.bust === n)?.id || null }));
    if (ph === 'GENRE') { x.genres = C.GENRES.map((gn) => ({ id: gn.id, name: gn.name, art: gn.art, used: (this.pilots || []).some((q) => q !== pl && q.genre?.id === gn.id) })); }
    if (ph === 'BRIEF') { x.kind = d.kind; x.note = d.note || null; }
    if (ph === 'WRITE' && this.wr) {
      const wr = this.wr;
      x.kind = wr.kind; x.note = d.note || null; x.writeEnds = wr.endsAt;
      x.done = this.players.map((p) => ({ ...this.pub(p), done: wr.entries[p.id] !== undefined, connected: p.connected }));
      if (me) {
        x.submitted = wr.entries[me.id] !== undefined;
        if (wr.kind === 'pitch') x.fields = W.PITCH;
        if (wr.kind === 'traits') x.questions = (this.traitAsk?.[me.id] || []).map((q) => q.q);
        if (W.BEATS[wr.kind]) x.beat = W.BEATS[wr.kind];
        x.context = pl ? { pitch: pl.pitch, hero: pl.hero.name, rival: pl.rival.name, problem: pl.beats.problem?.text || null } : null;
      }
    }
    if (ph === 'SHORTLIST' && this.sl && me) x.cards = (this.sl.cards[me.id] || []).map((c) => ({ id: c.id, text: c.text, liked: c.liked }));
    if (ph === 'SHORTLIST') { x.kind = d.kind; x.rated = this.live().filter((p) => (this.sl?.cards[p.id] || []).every((c) => c.liked !== null)).length; x.raters = this.live().length; }
    if (ph === 'VOTE') {
      const reveal = d.step === 'result';
      x.kind = d.kind; x.idx = d.idx ?? -1; x.why = d.why || null;
      x.finalists = (d.finalists || []).map((f) => ({ id: f.id, text: f.text, by: reveal ? this.pub(this.P(f.id)) : null, n: reveal ? (d.counts?.[f.id] || 0) : null, win: reveal ? f.id === d.winner : false, mine: me ? f.id === me.id : false }));
      if (d.step === 'vote') { x.voted = Object.keys(d.votes || {}).length; x.voters = this.live().filter((p) => (d.finalists || []).some((f) => f.id !== p.id)).length; if (me) x.myVote = d.votes?.[me.id] || null; }
    }
    if (ph === 'SCENE' && pl) {
      const sc = pl.scenes[d.kind];
      x.kind = d.kind;
      if (sc) {
        x.scene = { cur: sc.cur, lines: sc.lines.slice(0, Math.max(0, sc.cur + 1)).map((l) => ({ who: l.who, text: l.text })), total: sc.total, by: this.pub(this.P(sc.by)), count: sc.lines.length };
        if (me) { x.myLaughs = sc.laughs[me.id] || 0; x.own = sc.by === me.id; x.laughCap = PTS.laughCap; }
      }
    }
    if (ph === 'CAST' && me && pl) { const m = pl.castLaughs?.[`cast_${d.step}`] || {}; x.myLaughs = m[me.id] || 0; x.laughCap = PTS.laughCap; }
    if (ph === 'UPFRONTS') { x.lit = d.lit; x.cancelled = d.cancelled; }
    if (ph === 'SCREENING') { x.hit = d.hit; x.target = d.target; }
    if (ph === 'SCENE') x.note = d.note || null;
    if (ph === 'EPISODE' && pl) { const pe = pl.episodes[pl.episodes.length - 1]; x.prev = pe ? pe.acts.filter((k) => pe.beats[k]).map((k) => ({ label: W.BEATS[k].label, text: pe.beats[k].text, by: this.P(pe.beats[k].pid)?.name || null })) : []; }
    if (ph === 'FINAL') { x.step = d.step; x.lit = d.lit; if (d.rows) { x.rows = d.rows; if (me) x.mine = d.rows.find((r) => r.id === me.id); } }
    return v;
  }
}

module.exports = { Game };
