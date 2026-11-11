'use strict';
// WRITERS' ROOM: the game engine. One Game per room. The show runs itself as an async script.
const crypto = require('crypto');
const C = require('./content');
const ai = require('./ai');
const voice = require('./voice');

const SPEED = Number(process.env.WR_SPEED || 1);
const ms = (s) => Math.max(30, Math.round(s * 1000 * SPEED));
const uid = () => crypto.randomBytes(6).toString('hex');
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const shuffle = (arr) => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const norm = (s) => ` ${String(s || '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim()} `;
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const clip = (s, n) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);
const strip = voice.stripTags;
class Cancelled extends Error {}

const COLORS = ['#E07A3F', '#2F8F86', '#D9A13B', '#C9637A', '#5B7FC4', '#8C6BB1', '#6E9E4F', '#D46A5A', '#3E9FC1', '#B5803A', '#9C5B8F', '#4E8C6A'];
const RATING_TARGET = 5;
const PTS = { pitch: 300, react: 10, boo: -5, bestScene: 200, bestPerf: 200, agenda: 500, objOk: 200, objBad: -150, renewed: 200, mole: 800, moleVote: 150 };

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
    this.fx = []; this.fxSeq = 0;
  }

  // ------------------------------------------------------------ plumbing
  P(id) { return this.players.find((p) => p.id === id); }
  live() { return this.players.filter((p) => p.connected); }
  vip() { return this.live()[0] || this.players[0]; }
  pub(p) { return p ? { id: p.id, name: p.name, color: p.color } : null; }
  sync() {
    if (this.syncPending) return; this.syncPending = true;
    setTimeout(() => {
      this.syncPending = false;
      try { this.hooks.toHost(this.view(null)); for (const p of this.players) if (p.connected) this.hooks.toPlayer(p.id, this.view(p)); } catch (e) { console.error('sync', e); }
    }, 40);
  }
  setPhase(phase, d = {}, seconds = null) { this.phase = phase; this.d = d; this.endsAt = seconds ? Date.now() + ms(seconds) : null; this.lastActive = Date.now(); this.sync(); }
  sfx(name) { this.fxSeq++; this.fx.push({ id: this.fxSeq, name }); if (this.fx.length > 12) this.fx.shift(); this.sync(); }
  guard(g) { if (g !== this.runId) throw new Cancelled(); }

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
  skip(byId) { if (byId && byId !== this.vip()?.id) return; if (this.phase === 'LOBBY' || this.phase === 'FINAL') return; this.cue = null; this.wake('skip'); }

  // ------------------------------------------------------------ narration
  voiceFor(charId) { if (!charId) return voice.NARRATOR(); const i = this.cast.findIndex((c) => c.id === charId); const vs = voice.charVoices(); return vs[(i < 0 ? 0 : i) % vs.length]; }
  spoken(text) { let t = text; for (const p of this.players) if (p.pron) t = t.replace(new RegExp(`\\b${p.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g'), p.pron); return t; }
  prefetch(text, charId) { return voice.get(this.spoken(text), this.voiceFor(charId)); }
  estimate(text) { return Math.min(30000, 900 + strip(text).length * 62); }
  async makeCue(text, opts = {}) {
    let audioId = null;
    if (voice.enabled()) audioId = await Promise.race([this.prefetch(text, opts.charId), new Promise((r) => setTimeout(() => r(null), opts.maxWait || 14000))]);
    return { id: uid(), text: strip(text), speak: strip(this.spoken(text)), audio: audioId ? `/audio/${audioId}` : null, kind: opts.charId ? 'char' : 'narrator', charId: opts.charId || null };
  }
  // Speak and wait for the TV to finish (or a sensible timeout).
  async say(g, text, opts = {}) {
    if (!strip(text)) return 'empty';
    const cue = await this.makeCue(text, opts); this.guard(g);
    this.cue = cue; this.cueDone = null; this.sync();
    const est = this.estimate(text);
    const r = await this.wait(cue.audio ? est * 1.8 + 5000 : est + 1500, () => this.cueDone === cue.id);
    this.guard(g);
    if (this.cue === cue) this.cue = null;
    return r;
  }
  // Start speaking without blocking the phase timer.
  async sayOver(g, text) { if (!strip(text)) return; const cue = await this.makeCue(text, { maxWait: 4000 }); if (g !== this.runId) return; this.cue = cue; this.sync(); }
  cueFinished(id) { this.cueDone = id; if (this.cue && this.cue.id === id) this.cue = null; this.check(); }

  // ------------------------------------------------------------ lobby
  join(name, token, pron, act) {
    this.lastActive = Date.now();
    if (token) { const p = this.players.find((x) => x.token === token); if (p) return { player: p }; }
    name = clip(name, 14);
    if (!name) return { error: 'Enter your name' };
    const same = this.players.find((x) => x.name.toLowerCase() === name.toLowerCase());
    if (same) { if (!same.connected) { same.token = uid(); return { player: same }; } return { error: 'That name is taken' }; }
    if (this.phase !== 'LOBBY') return { error: 'This game has already started. Wait for the next one.' };
    if (this.players.length >= 12) return { error: 'The room is full (12 players)' };
    const used = new Set(this.players.map((x) => x.color));
    const p = { id: uid(), token: uid(), name, pron: clip(pron, 30), act: !!act, color: COLORS.find((c) => !used.has(c)) || pick(COLORS), connected: true, notes: [], noteSeq: 0 };
    this.reset(p); this.players.push(p); this.sync();
    return { player: p };
  }
  reset(p) { Object.assign(p, { score: 0, ledger: [], agenda: null, isMole: false, castDraft: null, pitch: null, vote: null, ack: false, objUsed: 0, moleVote: null, lastWords: null, interfUsed: 0, punchDone: false, roles: 0 }); }
  setConnected(id, on) { const p = this.P(id); if (p) { p.connected = on; this.lastActive = Date.now(); this.check(); this.sync(); } }
  setProfile(id, a) { const p = this.P(id); if (!p) return; if ('act' in a) p.act = !!a.act; if ('pron' in a) p.pron = clip(a.pron, 30); this.sync(); }
  kick(byId, target) { if (this.phase !== 'LOBBY' || this.vip()?.id !== byId) return; this.players = this.players.filter((p) => p.id !== target); this.hooks.kicked?.(target); this.sync(); }
  note(p, text, kind = 'info') { if (!p) return; p.noteSeq++; p.notes.push({ id: p.noteSeq, text, kind }); if (p.notes.length > 5) p.notes.shift(); }
  award(p, pts, why) { if (!p || !pts) return; p.score += pts; p.ledger.push({ pts, why }); }

  start(byId, genreId) {
    if (byId && this.vip()?.id !== byId) return { error: 'Only the first player can start' };
    if (this.phase !== 'LOBBY') return {};
    this.players = this.players.filter((p) => p.connected);
    if (this.players.length < 4) return { error: 'You need at least 4 players' };
    this.players.forEach((p) => this.reset(p));
    this.genre = C.GENRES.find((x) => x.id === genreId) || pick(C.GENRES);
    this.show = { title: pick(C.SHOW_TITLES[this.genre.id] || ['Untitled Pilot']), logline: '' };
    this.cast = []; this.episodes = []; this.recap = ''; this.ratings = []; this.critic = pick(C.CRITICS);
    this.busts = shuffle(bustPool());
    const g = ++this.runId;
    this.run(g).catch((e) => { if (!(e instanceof Cancelled)) console.error('run error', e); });
    return {};
  }

  playAgain(byId) { if (this.phase !== 'FINAL' || this.vip()?.id !== byId) return; this.runId++; this.players = this.players.filter((p) => p.connected); this.players.forEach((p) => this.reset(p)); this.cue = null; this.setPhase('LOBBY', {}); }

  // ------------------------------------------------------------ the show
  async run(g) {
    for (const t of Object.values(C.LINES)) this.prefetch(t); // record the fixed lines once
    await this.intro(g);
    await this.casting(g);
    await this.secrets(g);
    await this.episode(g, 1);
    await this.episode(g, 2);
    await this.finale(g);
  }

  async intro(g) {
    const bibleP = ai.showBible(this.genre, this.show.title);
    this.setPhase('INTRO', { step: 'welcome' });
    await this.say(g, C.LINES.welcome);
    this.setPhase('INTRO', { step: 'spin', genres: shuffle(C.GENRES).slice(0, 11).map((x) => x.name).concat(this.genre.name) });
    this.sfx('drumroll');
    await this.say(g, C.LINES.spin);
    await this.wait(ms(3));
    const bible = await Promise.race([bibleP, new Promise((r) => setTimeout(() => r(null), 8000))]); this.guard(g);
    if (bible) this.show = bible;
    this.setPhase('INTRO', { step: 'reveal' }); this.sfx('sting');
    await this.say(g, `[excited] A ${this.genre.name.toLowerCase()}! [beat] It's called... ${this.show.title}. ${this.show.logline}`);
  }

  async casting(g) {
    const ps = this.players;
    ps.forEach((p, i) => { p.castFor = ps[(i + 1) % ps.length].id; p.castDraft = null; });
    this.setPhase('CASTING', {}, 110);
    this.sayOver(g, C.LINES.castingIntro);
    await this.wait(ms(110), () => this.live().every((p) => p.castDraft && p.castDraft.done)); this.guard(g);
    // build the cast: each player's character was written by the player on their right
    this.cast = ps.map((actor) => {
      const writer = ps.find((w) => w.castFor === actor.id);
      const dr = writer?.castDraft || {};
      return {
        id: actor.id, writer: writer?.id, player: actor.name,
        name: clip(dr.name, 40) || `${pick(['Dr.', 'Detective', 'Aunty', 'Captain', 'Professor', 'Little'])} ${actor.name}`,
        job: clip(dr.job, 80) || pick(['unemployed influencer', 'disgraced magician', 'part-time villain', 'night-shift security guard']),
        secret: clip(dr.secret, 140) || pick(['is secretly broke', 'has a second family in Sharjah', 'cannot read', 'is wanted in three countries']),
        weakness: clip(dr.weakness, 100) || pick(['cannot lie', 'cries at adverts', 'terrified of pigeons', 'falls in love instantly']),
        catchphrase: clip(dr.catchphrase, 80) || pick(['Not today.', 'I have a bad feeling about this.', 'Typical.', 'Says who?']),
        bust: this.busts[ps.indexOf(actor) % this.busts.length], intro: '',
      };
    });
    this.setPhase('CAST_INTRO', { step: 'wait' });
    this.sayOver(g, C.LINES.castingWait);
    const intros = await ai.castIntros(this.show, this.genre, this.cast); this.guard(g);
    this.cast.forEach((c) => { c.intro = intros[c.id]; this.prefetch(c.intro); });
    for (let i = 0; i < this.cast.length; i++) {
      this.setPhase('CAST_INTRO', { step: 'card', idx: i }); this.sfx('whoosh');
      await this.say(g, this.cast[i].intro);
      await this.wait(ms(0.6));
    }
  }

  charOf(pid) { return this.cast.find((c) => c.id === pid); }

  async secrets(g) {
    const ps = this.players; const n = ps.length;
    const r = Math.random();
    const moles = n >= 7 && r < 0.15 ? 2 : r < (n >= 5 ? 0.8 : 0.7) ? 1 : 0;
    shuffle(ps).slice(0, moles).forEach((p) => { p.isMole = true; });
    this.moleCount = moles;
    const pool = shuffle(C.AGENDAS);
    ps.forEach((p, i) => {
      const a = { ...pool[i % pool.length], status: 'active', count: 0, owner: p.id };
      if (a.kind === 'target') { const t = pick(this.cast.filter((c) => c.id !== p.id)); a.target = t.id; }
      a.label = this.agendaLabel(a);
      p.agenda = a; p.ack = false;
    });
    this.setPhase('SECRETS', {}, 25);
    this.sayOver(g, C.LINES.secrets);
    await this.wait(ms(25), () => this.live().every((p) => p.ack)); this.guard(g);
  }
  agendaLabel(a) {
    if (a.kind === 'phrase') return `Get any character to say "${cap(a.text)}" out loud in a table read.`;
    if (a.kind === 'count') return `Get the word "${a.word}" said ${a.n} times in a single episode.`;
    const c = this.charOf(a.target); return `Get ${c.name} (played by ${c.player}) to say "${cap(a.text)}" in a table read.`;
  }

  // ------------------------------------------------------------ episodes
  async episode(g, n) {
    const ep = { n, note: pick(C.NOTES.filter((x) => !this.episodes.some((e) => e.note === x))), physical: Math.random() < 0.5 ? pick(C.PHYSICAL) : null, twist: n === 2 ? pick(C.TWISTS) : null, title: `Episode ${n}`, scenes: [], showrunner: null };
    this.episodes.push(ep); this.ep = ep;
    this.players.forEach((p) => { p.pitch = null; p.vote = null; p.interfUsed = 0; p.punchDone = false; if (p.agenda?.kind === 'count') p.agenda.count = 0; });

    this.setPhase('EP_INTRO', { step: 'title' }); this.sfx('whoosh');
    await this.wait(ms(2.5));
    if (n === 2 && this.recap) { this.setPhase('EP_INTRO', { step: 'previously' }); await this.say(g, `[dramatically] Previously, on ${this.show.title}. ${this.recap}`); }
    this.setPhase('EP_INTRO', { step: 'note' }); this.sfx('stamp');
    await this.say(g, C.LINES.noteIntro); await this.say(g, ep.note);
    if (ep.twist) { this.setPhase('EP_INTRO', { step: 'twist' }); this.sfx('dundun'); await this.say(g, C.LINES.twistIntro); await this.say(g, ep.twist); }

    // pitch
    this.setPhase('PITCH', {}, 75);
    this.sayOver(g, C.LINES.pitchIntro);
    await this.wait(ms(75), () => this.live().every((p) => p.pitch)); this.guard(g);
    const pitches = this.players.filter((p) => p.pitch).map((p) => ({ id: uid(), by: p.id, text: p.pitch }));
    let win;
    if (!pitches.length) win = { by: null, text: pick(['Everyone discovers a secret about everyone else.', 'A stranger arrives with a briefcase nobody is allowed to open.', 'Somebody is getting married, and nobody was invited.']) };
    else if (pitches.length === 1) win = pitches[0];
    else {
      ep.pitches = shuffle(pitches);
      this.setPhase('VOTE', {}, 35);
      this.sayOver(g, C.LINES.voteIntro);
      const canVote = (p) => ep.pitches.some((x) => x.by !== p.id);
      await this.wait(ms(35), () => this.live().filter(canVote).every((p) => p.vote)); this.guard(g);
      const tally = {}; ep.pitches.forEach((x) => { tally[x.id] = 0; });
      this.players.forEach((p) => { if (p.vote && tally[p.vote] !== undefined) tally[p.vote]++; });
      const max = Math.max(...Object.values(tally));
      win = pick(ep.pitches.filter((x) => tally[x.id] === max)); ep.tally = tally;
    }
    ep.plot = win.text; ep.plotBy = win.by;
    if (win.by) this.award(this.P(win.by), PTS.pitch, 'Winning pitch');
    this.setPhase('PITCH_RESULT', {}); this.sfx('applause');
    await this.say(g, `[excited] The winning pitch. [beat] ${win.text}`);

    // teams and scenes
    this.buildTeams(ep);
    const setupP = ai.episodeSetup({ n, show: this.show, genre: this.genre, cast: this.cast, plot: ep.plot, note: ep.note, twist: ep.twist, previously: this.recap, scenes: ep.scenes.map((s) => ({ chars: s.chars.map((id) => this.charOf(id).name) })), fallbackDirection: () => pick(C.FALLBACK_STAGE) });
    this.setPhase('TEAMS', {});
    await this.say(g, C.LINES.writingIntro);
    const setup = await Promise.race([setupP, new Promise((r) => setTimeout(() => r(null), 25000))]); this.guard(g);
    ep.title = setup?.title || ep.title;
    ep.scenes.forEach((s, i) => Object.assign(s, setup?.scenes[i] || { slug: 'INT. A ROOM - NIGHT', mustHappen: `Something must happen about this: ${ep.plot}`, direction: pick(C.FALLBACK_STAGE) }));
    ep.scenes.forEach((s) => this.prefetch(s.direction));

    // writing
    this.setPhase('WRITING', {}, 135);
    this.sfx('typewriter');
    await this.wait(ms(135), () => ep.scenes.every((s) => s.writers.every((w) => !this.P(w)?.connected || s.done[w]))); this.guard(g);
    ep.scenes.forEach((s) => s.lines.forEach((l) => { l.text = clip(l.text, 220); l.empty = !l.text; }));

    if (ep.showrunner) {
      this.setPhase('PUNCHUP', {}, 35);
      await this.wait(ms(35), () => { const p = this.P(ep.showrunner); return !p?.connected || p.punchDone; }); this.guard(g);
    }

    // record the table read in the background while the intro plays
    ep.scenes.forEach((s) => s.lines.forEach((l) => { if (!l.empty && !this.acts(l.char)) this.prefetch(l.text, l.char); }));
    this.setPhase('TABLE_READ', { step: 'intro', scene: 0 }); this.sfx('clapper');
    await this.say(g, n === 1 ? C.LINES.tableReadIntro : '[excited] Places, everyone. Episode two. Roll it.');
    for (let i = 0; i < ep.scenes.length; i++) await this.playScene(g, ep, i);

    // ratings
    const sceneRatings = ep.scenes.map((s) => this.sceneRating(s));
    ep.scenes.forEach((s, i) => { s.rating = sceneRatings[i]; });
    this.ratings.push(...sceneRatings);
    const best = ep.scenes.reduce((a, b) => (b.rating > a.rating ? b : a));
    best.writers.forEach((w) => this.award(this.P(w), PTS.bestScene, 'Best scene'));
    ep.bestScene = ep.scenes.indexOf(best);
    const perf = {};
    ep.scenes.forEach((s) => s.lines.forEach((l) => { if (l.by === 'actor') perf[l.char] = (perf[l.char] || 0) + l.react.laugh.filter((x) => this.eligible(s, l, x)).length + l.react.gasp.filter((x) => this.eligible(s, l, x)).length; }));
    const top = Object.entries(perf).sort((a, b) => b[1] - a[1])[0];
    if (top && top[1] > 0) { ep.bestPerf = top[0]; this.award(this.P(top[0]), PTS.bestPerf, 'Best performance'); }
    const script = ep.scenes.map((s) => `${s.slug}\n${s.direction}\n${s.lines.filter((l) => !l.empty).map((l) => `${this.charOf(l.char).name.toUpperCase()}: ${l.text}`).join('\n')}`).join('\n\n');
    const afterP = ai.afterEpisode({ n, show: this.show, genre: this.genre, cast: this.cast, previously: this.recap, title: ep.title, plot: ep.plot, script });
    if (n === 2) this.finaleP = afterP.then((a) => ai.finalePack({ show: this.show, genre: this.genre, cast: this.cast, recap: a.recap, rating: this.seasonRating(), critic: this.critic }));
    this.setPhase('RATINGS', { step: 'scores' }); this.sfx('drumroll');
    await this.say(g, C.LINES.ratingsIntro);
    await this.wait(ms(5));
    this.setPhase('RATINGS', { step: 'awards' }); this.sfx('applause');
    await this.wait(ms(6));
    if (n === 1) {
      const after = await Promise.race([afterP, new Promise((r) => setTimeout(() => r(null), 20000))]); this.guard(g);
      this.recap = after?.recap || `Previously: ${ep.plot}`;
      this.setPhase('RATINGS', { step: 'cliffhanger' }); this.sfx('dundun');
      await this.say(g, after?.cliffhanger || `[dramatically] And nothing would ever be the same. Next time, on ${this.show.title}.`);
      this.sfx('dundun');
      await this.wait(ms(1.5));
    }
  }

  acts(pid) { const p = this.P(pid); return !!(p && p.act && p.connected); }

  buildTeams(ep) {
    const prev = this.episodes.length > 1 ? this.episodes[this.episodes.length - 2] : null;
    const prevPairs = new Set(); prev?.scenes.forEach((s) => s.writers.forEach((a) => s.writers.forEach((b) => { if (a < b) prevPairs.add(`${a}|${b}`); })));
    const ids = this.players.map((p) => p.id); const n = ids.length;
    let best = null;
    for (let t = 0; t < 30; t++) {
      let pool = shuffle(ids); let showrunner = null;
      const size = n > 8 ? 3 : 2;
      const rem = n % size;
      if (rem === 1) { const cands = pool.filter((id) => !this.episodes.some((e) => e.showrunner === id)); showrunner = pick(cands.length ? cands : pool); pool = pool.filter((x) => x !== showrunner); }
      const teams = [];
      while (pool.length) { const k = pool.length === 2 || pool.length === 4 && size === 3 ? 2 : size; teams.push(pool.splice(0, Math.min(k, pool.length))); }
      const repeats = teams.reduce((acc, tm) => acc + tm.reduce((a2, x) => a2 + tm.filter((y) => x < y && prevPairs.has(`${x}|${y}`)).length, 0), 0);
      if (!best || repeats < best.repeats) best = { teams, showrunner, repeats };
      if (repeats === 0) break;
    }
    ep.showrunner = best.showrunner;
    const roles = {}; ids.forEach((id) => { roles[id] = 0; });
    ep.scenes = best.teams.map((writers) => {
      const others = shuffle(ids.filter((id) => !writers.includes(id))).sort((a, b) => roles[a] - roles[b]);
      const chars = others.slice(0, writers.length); chars.forEach((c) => { roles[c]++; });
      const lines = []; let k = 0;
      for (let round = 0; round < 2; round++) writers.forEach((w, wi) => { lines.push({ id: uid(), idx: k++, char: chars[wi % chars.length], writer: w, text: '', empty: false, react: { laugh: [], gasp: [], boo: [] }, by: null }); });
      return { writers, chars, lines, done: {}, interference: null, slug: '', mustHappen: '', direction: '' };
    });
  }

  eligible(scene, line, pid) { return !scene.writers.includes(pid) && pid !== line.char; }
  eligibleCount(scene, line) { return this.live().filter((p) => this.eligible(scene, line, p.id)).length; }
  sceneRating(s) {
    let R = 0; let possible = 0;
    s.lines.forEach((l) => { if (l.empty) return; possible += l.eligibleN || 0; R += l.react.laugh.filter((x) => this.eligible(s, l, x)).length + l.react.gasp.filter((x) => this.eligible(s, l, x)).length - l.react.boo.filter((x) => this.eligible(s, l, x)).length; });
    if (!possible) return 5;
    return Math.max(0, Math.min(10, Math.round((R / possible) * 12 * 10) / 10));
  }
  seasonRating() { return this.ratings.length ? this.ratings.reduce((a, b) => a + b, 0) / this.ratings.length : 5; }

  async playScene(g, ep, i) {
    const s = ep.scenes[i];
    this.setPhase('TABLE_READ', { step: 'title', scene: i }); this.sfx('clapper');
    await this.wait(ms(3)); this.guard(g);
    this.setPhase('TABLE_READ', { step: 'direction', scene: i });
    await this.say(g, s.direction);
    for (let j = 0; j < s.lines.length; j++) {
      const l = s.lines[j];
      l.eligibleN = this.eligibleCount(s, l);
      this.objection = null;
      this.setPhase('TABLE_READ', { step: 'line', scene: i, line: j });
      let r;
      if (l.empty) { l.by = 'silence'; r = await this.wait(ms(2.2)); } else if (this.acts(l.char)) {
        l.by = 'actor'; this.actorDone = null;
        r = await this.wait(Math.max(ms(5), Math.min(ms(16), this.estimate(l.text) * 1.6 + ms(2))), () => this.actorDone === l.id);
      } else { l.by = 'voice'; r = await this.say(g, l.text, { charId: l.char }); }
      this.guard(g);
      if (r !== 'skip' && !this.objection) { this.d.step = 'after'; this.sync(); r = await this.wait(ms(1.3)); this.guard(g); }
      if (this.objection) await this.resolveObjection(g, s, l);
      else this.finishLine(s, l);
    }
    this.setPhase('TABLE_READ', { step: 'end', scene: i, rating: this.sceneRating(s) }); this.sfx('applause');
    await this.wait(ms(3)); this.guard(g);
  }

  matches(l) {
    const t = norm(l.text); const hits = [];
    for (const p of this.players) {
      const a = p.agenda; if (!a || a.status !== 'active') continue;
      if (a.kind === 'phrase' && t.includes(norm(a.text))) hits.push(a);
      else if (a.kind === 'target' && l.char === a.target && t.includes(norm(a.text))) hits.push(a);
      else if (a.kind === 'count' && t.includes(norm(a.word))) hits.push(a);
    }
    return hits;
  }
  finishLine(s, l) {
    for (const a of this.matches(l)) {
      if (a.kind === 'count') { a.count += (norm(l.text).match(new RegExp(` ${a.word} `, 'g')) || []).length || 1; if (a.count >= a.n) a.status = 'done'; } else a.status = 'done';
      if (a.status === 'done') this.note(this.P(a.owner), 'Your secret agenda just happened. Keep a straight face.', 'good');
    }
  }
  async resolveObjection(g, s, l) {
    const by = this.P(this.objection.by);
    const hits = this.matches(l);
    const sustained = hits.length > 0;
    hits.forEach((a) => { a.status = 'busted'; this.note(this.P(a.owner), 'Your agenda was busted by an objection.', 'bad'); });
    if (sustained) this.award(by, PTS.objOk, 'Objection sustained'); else this.award(by, PTS.objBad, 'Objection overruled');
    this.cue = null;
    this.setPhase('TABLE_READ', { step: 'objection', scene: this.d.scene, line: this.d.line, by: by?.id, sustained, busted: hits.map((a) => ({ owner: a.owner, label: a.label })) });
    this.sfx('gavel'); if (!sustained) setTimeout(() => this.sfx('scratch'), 900);
    await this.say(g, sustained ? C.LINES.sustained : C.LINES.overruled);
    await this.wait(ms(2.5)); this.guard(g);
    this.objection = null;
  }

  // ------------------------------------------------------------ finale
  async finale(g) {
    this.players.forEach((p) => { p.lastWords = null; p.moleVote = null; });
    this.setPhase('LAST_WORDS', {}, 55);
    this.sayOver(g, C.LINES.lastWordsIntro);
    await this.wait(ms(55), () => this.live().every((p) => p.lastWords)); this.guard(g);
    this.cast.forEach((c) => { const p = this.P(c.id); c.lastWords = clip(p?.lastWords, 200) || c.catchphrase; if (!this.acts(c.id)) this.prefetch(c.lastWords, c.id); });
    const pack = await Promise.race([this.finaleP, new Promise((r) => setTimeout(() => r(null), 25000))]); this.guard(g);
    const fin = pack || { open: '[softly] And so, for the last time, everyone was in the same room.', close: '[sighs] The lights went down.', review: 'I watched it so you do not have to.', stars: 2 };
    this.fin = fin;
    this.prefetch(fin.close);
    this.setPhase('FINALE', { step: 'open' }); this.sfx('swell');
    await this.say(g, fin.open);
    for (const c of shuffle(this.cast)) {
      this.setPhase('FINALE', { step: 'last', char: c.id });
      if (this.acts(c.id)) { this.actorDone = null; const lid = `last-${c.id}`; this.d.lineId = lid; this.sync(); await this.wait(Math.max(ms(5), Math.min(ms(14), this.estimate(c.lastWords) * 1.6 + ms(2))), () => this.actorDone === lid); } else await this.say(g, c.lastWords, { charId: c.id });
      this.guard(g); await this.wait(ms(0.8));
    }
    this.setPhase('FINALE', { step: 'close' });
    await this.say(g, fin.close);
    this.sfx('applause');

    this.setPhase('CRITIC', { step: 'intro' });
    await this.say(g, C.LINES.criticIntro);
    this.setPhase('CRITIC', { step: 'review' }); this.sfx('stamp');
    await this.say(g, `${this.critic.name}, ${this.critic.outlet}. [beat] ${fin.stars} ${fin.stars === 1 ? 'star' : 'stars'}. ${fin.review}`);
    await this.wait(ms(1.5));

    const moles = this.players.filter((p) => p.isMole);
    const moleLine = moles.length ? `[dramatically] The Mole was... [beat] ${moles.map((m) => m.name).join(' and ')}!` : '[laughs] There was no Mole. You were all just bad at this.';
    this.prefetch(moleLine);
    this.setPhase('MOLE_VOTE', {}, 40);
    this.sayOver(g, C.LINES.moleIntro);
    await this.wait(ms(40), () => this.live().every((p) => p.moleVote)); this.guard(g);
    await this.reveals(g, moles, moleLine);
  }

  async reveals(g, moles, moleLine) {
    this.setPhase('REVEALS', { step: 'intro' });
    await this.say(g, C.LINES.revealsIntro);
    for (const p of this.players) {
      const a = p.agenda;
      if (a.status === 'done') this.award(p, PTS.agenda, 'Secret agenda');
      this.setPhase('REVEALS', { step: 'agenda', pid: p.id, label: a.label, status: a.status }); this.sfx(a.status === 'done' ? 'applause' : a.status === 'busted' ? 'gavel' : 'trombone');
      await this.wait(ms(3.8)); this.guard(g);
    }
    // mole verdict
    const tally = {}; let voters = 0;
    this.players.forEach((p) => { if (p.moleVote) { voters++; tally[p.moleVote] = (tally[p.moleVote] || 0) + 1; } });
    const playerVotes = Object.entries(tally).filter(([k]) => k !== 'none');
    const max = playerVotes.length ? Math.max(...playerVotes.map(([, v]) => v)) : 0;
    const accused = max >= 2 || (max >= 1 && voters <= 4) ? playerVotes.filter(([, v]) => v === max).map(([k]) => k) : [];
    this.players.forEach((p) => { if (!p.moleVote) return; const right = p.moleVote === 'none' ? moles.length === 0 : moles.some((m) => m.id === p.moleVote); if (right) this.award(p, PTS.moleVote, 'Spotted the Mole'); });
    const rating = this.seasonRating();
    const renewed = rating >= RATING_TARGET;
    const caught = moles.filter((m) => accused.includes(m.id)).map((m) => m.id);
    this.setPhase('REVEALS', { step: 'mole', moles: moles.map((m) => m.id), caught, accused, tally }); this.sfx('drumroll');
    await this.say(g, moleLine);
    if (moles.length) { this.sfx(caught.length ? 'gavel' : 'dundun'); await this.say(g, caught.length === moles.length ? '[delighted] And you caught them.' : caught.length ? '[curious] You caught one of them.' : '[sighs] And nobody caught them.'); }
    await this.wait(ms(2));
    if (renewed) this.players.filter((p) => !p.isMole).forEach((p) => this.award(p, PTS.renewed, 'Show renewed'));
    else moles.filter((m) => !caught.includes(m.id)).forEach((m) => this.award(m, PTS.mole, 'Sank the show'));
    this.setPhase('REVEALS', { step: 'renewal', rating: Math.round(rating * 10) / 10, renewed }); this.sfx(renewed ? 'fanfare' : 'trombone');
    await this.say(g, renewed ? C.LINES.renewed : C.LINES.cancelled);
    await this.wait(ms(2));
    const rows = this.players.map((p) => ({ ...this.pub(p), score: p.score, ledger: p.ledger, isMole: p.isMole, char: this.charOf(p.id)?.name })).sort((a, b) => b.score - a.score);
    rows.forEach((r, i) => { r.rank = i + 1; });
    this.setPhase('FINAL', { rows, renewed, rating: Math.round(rating * 10) / 10 }); this.sfx('fanfare');
    await this.say(g, `[excited] And the head writer of ${this.show.title} is... [beat] ${rows[0].name}! ${C.LINES.goodnight}`);
  }

  // ------------------------------------------------------------ player actions
  act(pid, a) {
    const p = this.P(pid); if (!p || !a) return {};
    this.lastActive = Date.now();
    const ep = this.ep; const ph = this.phase;
    switch (a.type) {
      case 'start': return this.start(pid, a.genre);
      case 'skip': this.skip(pid); return {};
      case 'again': this.playAgain(pid); return {};
      case 'profile': this.setProfile(pid, a); return {};
      case 'kick': this.kick(pid, a.target); return {};
      case 'cast': {
        if (ph !== 'CASTING') return {};
        const f = a.fields || {};
        p.castDraft = { name: clip(f.name, 40), job: clip(f.job, 80), secret: clip(f.secret, 140), weakness: clip(f.weakness, 100), catchphrase: clip(f.catchphrase, 80), done: !!a.done };
        break;
      }
      case 'ack': if (ph === 'SECRETS') p.ack = true; break;
      case 'pitch': if (ph === 'PITCH') { const t = clip(a.text, 200); if (!t) return { error: 'Write a pitch first' }; p.pitch = t; } break;
      case 'vote': {
        if (ph !== 'VOTE') return {};
        const x = ep.pitches.find((y) => y.id === a.id); if (!x) return {}; if (x.by === pid) return { error: 'You cannot vote for your own pitch' };
        p.vote = x.id; break;
      }
      case 'line': {
        if (ph !== 'WRITING') return {};
        const s = ep.scenes.find((y) => y.writers.includes(pid)); if (!s) return {};
        const l = s.lines.find((y) => y.id === a.id && y.writer === pid); if (!l) return {};
        l.text = clip(a.text, 220); break;
      }
      case 'writeDone': { if (ph !== 'WRITING') return {}; const s = ep.scenes.find((y) => y.writers.includes(pid)); if (s) s.done[pid] = !!a.done; break; }
      case 'interfere': {
        if (ph !== 'WRITING' || !p.isMole || p.interfUsed) return {};
        const s = ep.scenes[a.scene]; if (!s || s.writers.includes(pid)) return {};
        s.interference = clip(a.text, 200); p.interfUsed = 1; this.note(p, 'Your fake note was delivered.', 'good'); break;
      }
      case 'punch': {
        if (ph !== 'PUNCHUP' || ep.showrunner !== pid || p.punchDone) return {};
        for (const s of ep.scenes) { const l = s.lines.find((y) => y.id === a.id); if (l) { l.text = clip(a.text, 220); l.empty = !l.text; l.punched = true; } }
        p.punchDone = true; break;
      }
      case 'punchSkip': if (ph === 'PUNCHUP' && ep.showrunner === pid) p.punchDone = true; break;
      case 'actorDone': if (a.id) { this.actorDone = a.id; this.check(); } return {};
      case 'react': {
        if (ph !== 'TABLE_READ' || !['line', 'after'].includes(this.d.step)) return {};
        const s = ep.scenes[this.d.scene]; const l = s?.lines[this.d.line]; if (!l || l.empty) return {};
        if (!['laugh', 'gasp', 'boo'].includes(a.kind) || l.react[a.kind].includes(pid)) return {};
        l.react[a.kind].push(pid);
        if (this.eligible(s, l, pid)) this.award(this.P(l.writer), a.kind === 'boo' ? PTS.boo : PTS.react, a.kind === 'boo' ? 'Booed line' : 'Audience reaction');
        this.sfx(a.kind);
        break;
      }
      case 'object': {
        if (ph !== 'TABLE_READ' || !['line', 'after'].includes(this.d.step) || this.objection) return {};
        const s = ep.scenes[this.d.scene]; const l = s?.lines[this.d.line]; if (!l || l.empty || l.char === pid) return {};
        if (p.objUsed >= ep.n) return { error: 'You have used your objection this episode' };
        p.objUsed = ep.n; this.objection = { by: pid, line: l.id }; this.wake('objection'); break;
      }
      case 'lastWords': if (ph === 'LAST_WORDS') { const t = clip(a.text, 200); if (!t) return { error: 'Write a last line' }; p.lastWords = t; } break;
      case 'moleVote': {
        if (ph !== 'MOLE_VOTE') return {};
        if (a.id !== 'none' && (!this.P(a.id) || a.id === pid)) return {};
        p.moleVote = a.id; break;
      }
      default: return {};
    }
    this.check(); this.sync();
    return {};
  }

  // ------------------------------------------------------------ views
  charPub(c, full = true) {
    if (!c) return null; const p = this.P(c.id);
    return { id: c.id, name: c.name, player: c.player, color: p?.color, bust: c.bust, ...(full ? { job: c.job, secret: c.secret, weakness: c.weakness, catchphrase: c.catchphrase } : {}), acts: this.acts(c.id) };
  }
  linePub(l) { return { id: l.id, char: l.char, text: l.empty ? '' : l.text, empty: !!l.empty, writer: l.writer, laugh: l.react.laugh.length, gasp: l.react.gasp.length, boo: l.react.boo.length, by: l.by }; }
  scenePub(s, i, upto = null) {
    return { i, slug: s.slug, mustHappen: s.mustHappen, direction: strip(s.direction), writers: s.writers.map((w) => this.pub(this.P(w))), chars: s.chars.map((c) => this.charPub(this.charOf(c), false)), lines: (upto === null ? s.lines : s.lines.slice(0, upto + 1)).map((l) => this.linePub(l)), rating: s.rating ?? null };
  }

  view(me) {
    const ph = this.phase; const d = this.d; const ep = this.ep;
    const v = {
      now: Date.now(), code: this.code, phase: ph, endsAt: this.endsAt, step: d.step || null,
      players: this.players.map((p) => ({ ...this.pub(p), connected: p.connected, act: p.act })), vipId: this.vip()?.id || null,
      genre: this.genre && ph !== 'LOBBY' ? { id: this.genre.id, name: this.genre.name, art: this.genre.art, music: this.genre.music, mood: this.genre.mood, fx: this.genre.fx || null } : null,
      show: this.show && ph !== 'LOBBY' && !(ph === 'INTRO' && d.step !== 'reveal') ? { title: this.show.title, logline: strip(this.show.logline) } : null,
      ep: ep && !['LOBBY', 'INTRO', 'CASTING', 'CAST_INTRO', 'SECRETS'].includes(ph) ? { n: ep.n, title: ep.title, note: ep.note, physical: ep.physical, twist: ep.twist, plot: ep.plot || null } : null,
      fx: this.fx, x: {},
    };
    const x = v.x;
    if (!me) { v.cue = this.cue; v.joinUrl = this.joinUrl; v.qr = this.qr; v.aiOn = ai.enabled(); v.voiceOn = voice.enabled(); }
    else {
      v.me = { id: me.id, name: me.name, color: me.color, act: me.act, pron: me.pron, vip: this.vip()?.id === me.id, notes: me.notes, isMole: me.isMole, agenda: me.agenda && ph !== 'LOBBY' ? { label: me.agenda.label, status: me.agenda.status, kind: me.agenda.kind, count: me.agenda.count, n: me.agenda.n } : null };
      const myChar = this.cast?.find((c) => c.id === me.id);
      if (myChar && !['CASTING', 'LOBBY'].includes(ph) && !(ph === 'CAST_INTRO' && d.step === 'wait')) v.me.char = this.charPub(myChar);
    }
    if (ph === 'INTRO' && d.step === 'spin') x.genres = d.genres;
    if (ph === 'CASTING') {
      x.done = this.players.filter((p) => p.castDraft?.done).length;
      if (me) { const t = this.P(me.castFor); x.target = this.pub(t); x.draft = me.castDraft; }
    }
    if (ph === 'CAST_INTRO' && d.step === 'card') { const c = this.cast[d.idx]; x.card = { ...this.charPub(c), intro: strip(c.intro), writer: this.pub(this.P(c.writer)) }; x.idx = d.idx; x.total = this.cast.length; }
    if (ph === 'SECRETS') x.acked = this.players.filter((p) => p.ack).length;
    if (ph === 'PITCH') { x.done = this.players.filter((p) => p.pitch).length; if (me) x.mine = me.pitch; }
    if (ph === 'VOTE') { x.pitches = ep.pitches.map((y) => ({ id: y.id, text: y.text, mine: me ? y.by === me.id : false })); x.done = this.players.filter((p) => p.vote).length; if (me) x.myVote = me.vote; }
    if (ph === 'PITCH_RESULT') { x.plot = ep.plot; x.by = this.pub(this.P(ep.plotBy)); }
    if (['TEAMS', 'WRITING', 'PUNCHUP'].includes(ph)) {
      x.scenes = ep.scenes.map((s, i) => ({ i, writers: s.writers.map((w) => this.pub(this.P(w))), chars: s.chars.map((c) => this.charPub(this.charOf(c), false)), filled: s.lines.filter((l) => l.text).length, total: s.lines.length, done: s.writers.filter((w) => s.done[w]).length, slug: s.slug || null }));
      x.showrunner = this.pub(this.P(ep.showrunner));
      if (me) {
        const si = ep.scenes.findIndex((s) => s.writers.includes(me.id));
        if (si >= 0) {
          const s = ep.scenes[si];
          x.myScene = { ...this.scenePub(s, si), mustHappen: s.mustHappen, interference: s.interference, myDone: !!s.done[me.id] };
          x.myScene.chars = s.chars.map((c) => this.charPub(this.charOf(c)));
          x.myChar = s.chars[s.writers.indexOf(me.id) % s.chars.length];
        }
        if (me.isMole && ph === 'WRITING') { x.interfere = me.interfUsed ? null : { scenes: ep.scenes.map((s, i) => ({ i, mine: s.writers.includes(me.id), writers: s.writers.map((w) => this.P(w)?.name) })), notes: this.moleNotes(me) }; }
        if (ph === 'PUNCHUP' && ep.showrunner === me.id) x.punch = { done: me.punchDone, scenes: ep.scenes.map((s, i) => this.scenePub(s, i)) };
      }
    }
    if (ph === 'TABLE_READ') {
      const s = ep.scenes[d.scene];
      x.sceneIdx = d.scene; x.sceneCount = ep.scenes.length;
      x.scene = s ? this.scenePub(s, d.scene, ['line', 'after', 'objection'].includes(d.step) ? d.line : d.step === 'end' ? null : -1) : null;
      if (s && ['line', 'after', 'objection'].includes(d.step)) {
        const l = s.lines[d.line]; x.line = { ...this.linePub(l), idx: d.line, charName: this.charOf(l.char).name };
        if (me) { x.myLine = l.char === me.id && l.by === 'actor'; x.canObject = me.objUsed < ep.n && l.char !== me.id && !l.empty && d.step !== 'objection'; x.myReacts = ['laugh', 'gasp', 'boo'].filter((k) => l.react[k].includes(me.id)); }
        if (me && x.myLine) { x.upcoming = s.lines.slice(d.line + 1).filter((y) => y.char === me.id).map((y) => y.text); }
      }
      if (me && s && d.step !== 'end') { const mine = s.lines.filter((l) => l.char === me.id && !l.empty); if (mine.length) x.myScript = { lines: mine.map((l) => ({ id: l.id, text: l.text, done: s.lines.indexOf(l) < (d.line ?? -1) })) }; }
      if (d.step === 'objection') { x.objection = { by: this.pub(this.P(d.by)), sustained: d.sustained, busted: d.busted.map((b) => ({ owner: this.pub(this.P(b.owner)), label: b.label })) }; }
      if (d.step === 'end') x.rating = d.rating;
      x.season = Math.round(this.seasonRatingLive() * 10) / 10;
    }
    if (ph === 'RATINGS') {
      x.scenes = ep.scenes.map((s, i) => ({ i, slug: s.slug, rating: s.rating, writers: s.writers.map((w) => this.pub(this.P(w))) }));
      x.best = ep.bestScene; x.bestPerf = ep.bestPerf ? this.charPub(this.charOf(ep.bestPerf), false) : null;
      x.season = Math.round(this.seasonRating() * 10) / 10; x.target = RATING_TARGET;
    }
    if (ph === 'LAST_WORDS') { x.done = this.players.filter((p) => p.lastWords).length; if (me) x.mine = me.lastWords; }
    if (ph === 'FINALE') {
      if (d.step === 'last') { const c = this.charOf(d.char); x.char = this.charPub(c, false); x.text = c.lastWords; if (me) { x.myLine = c.id === me.id && this.acts(me.id); x.lineId = `last-${c.id}`; } }
      x.cast = this.cast.map((c) => this.charPub(c, false));
    }
    if (ph === 'CRITIC' && d.step === 'review') x.critic = { name: this.critic.name, outlet: this.critic.outlet, stars: this.fin?.stars, review: strip(this.fin?.review) };
    if (ph === 'MOLE_VOTE') { x.done = this.players.filter((p) => p.moleVote).length; if (me) { x.myVote = me.moleVote; x.options = this.players.filter((p) => p.id !== me.id).map((p) => this.pub(p)); } }
    if (ph === 'REVEALS') {
      Object.assign(x, { step: d.step });
      if (d.step === 'agenda') { x.who = this.pub(this.P(d.pid)); x.label = d.label; x.status = d.status; x.char = this.charPub(this.charOf(d.pid), false); }
      if (d.step === 'mole') { x.moles = d.moles.map((id) => this.pub(this.P(id))); x.caught = d.caught; x.accused = d.accused.map((id) => this.pub(this.P(id))); x.tally = this.players.map((p) => ({ ...this.pub(p), votes: d.tally[p.id] || 0 })); x.none = d.tally.none || 0; }
      if (d.step === 'renewal') { x.rating = d.rating; x.renewed = d.renewed; x.target = RATING_TARGET; }
    }
    if (ph === 'FINAL') { x.rows = d.rows; x.renewed = d.renewed; x.rating = d.rating; if (me) x.mine = d.rows.find((r) => r.id === me.id); }
    if (this.cast?.length && !['LOBBY', 'CASTING'].includes(ph) && !(ph === 'CAST_INTRO' && d.step === 'wait')) v.cast = this.cast.map((c) => this.charPub(c, false));
    return v;
  }
  moleNotes(me) { if (!me._moleNotes || me._moleNotesEp !== this.ep.n) { me._moleNotes = shuffle(C.NOTES).slice(0, 3); me._moleNotesEp = this.ep.n; } return me._moleNotes; }
  seasonRatingLive() {
    const done = [...this.ratings];
    if (this.ep) this.ep.scenes.forEach((s) => { if (s.rating === undefined && s.lines.some((l) => l.by)) done.push(this.sceneRating(s)); });
    return done.length ? done.reduce((a, b) => a + b, 0) / done.length : 5;
  }
}

module.exports = { Game };
