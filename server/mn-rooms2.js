'use strict';
// Last Night in the Mansion, the painted rooms. Every phone shows something different, so people have to talk.
// Same shape as the 8-bit rooms: make(X, kind) builds one round (kind is 1, 2 or 'quick' for The Collapse),
// tick() runs it, act() takes taps, bot() plays for bots, tv() and phone() say what the screens show.
const PXR = require('./mn-px');
const rint = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const shuffle = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const live = (X) => X.seats.filter((p) => p.bot || p.connected);
const nameOf = (X, id) => X.P(id)?.name || 'Someone';

// ================================================================== HOLD STILL (the doll)
// Sneak while her back is turned. When she turns round, freeze: the phone's motion sensor sees any wobble.
const HOLD = {
  key: 'doll', name: 'Hold Still', style: 'paint', art: 'mn-room-nursery', music: 'mn-memory',
  goal: 'Tap SNEAK while her back is turned. When she turns, freeze. Don\'t move your phone at all.',
  secs: { 1: 60, 2: 70, quick: 28 },
  make(X, kind) {
    const n = Math.max(2, live(X).length);
    const st = { kind, prog: 0, target: kind === 'quick' ? 45 : 100, tap: 100 / (40 * n), phase: 'green', caught: [], seenThis: {}, modes: {}, log: null };
    this.green(X, st); return st;
  },
  green(X, st) {
    st.phase = 'green'; const k = st.kind;
    const dur = k === 1 ? rnd(3200, 5600) : rnd(1900, 4200);
    st.until = X.now() + dur; st.turnAt = X.wall(st.until); st.seenThis = {};
  },
  tick(X, st, now) {
    if (st.done) return;
    if (st.prog >= st.target) { st.done = 'win'; X.sfx('mn-unlock'); return; }
    if (now < st.until) return;
    const k = st.kind;
    if (st.phase === 'green') { st.phase = 'warn'; st.until = now + (k === 1 ? 900 : 650); X.sfx('mn-creak2'); return; }
    if (st.phase === 'warn') {
      if (k !== 1 && Math.random() < 0.3 && !st.faked) { st.faked = true; this.green(X, st); return; } // she twitches, but doesn't turn
      st.faked = false; st.phase = 'red'; st.redAt = now; st.until = now + (k === 2 ? rnd(2800, 4300) : rnd(2300, 3600)); st.redWall = X.wall(now); X.sfx('mn-breath'); return;
    }
    if (st.phase === 'red') this.green(X, st);
  },
  catch(X, st, id, why) {
    if (st.seenThis[id]) return; st.seenThis[id] = true;
    st.prog = Math.max(0, st.prog - 12); st.caught.push(id); st.log = { name: nameOf(X, id), why, at: X.now() };
    X.sfx('mn-giggle'); X.drip(2, null); X.scare('personal', id);
  },
  act(X, p, a, st) {
    const now = X.now();
    if (a.a === 'mode') { st.modes[p.id] = a.motion ? 'motion' : 'hold'; return; }
    if (a.a === 'sneak') {
      if (st.phase === 'red' && now - st.redAt > 350) return this.catch(X, st, p.id, 'tapped');
      if (st.phase === 'red') return;
      if (now - (p.lastSneak || 0) < 70) return; p.lastSneak = now; st.prog = Math.min(st.target, st.prog + st.tap);
    }
    if (a.a === 'moved' && st.phase === 'red' && now - st.redAt > 350) this.catch(X, st, p.id, st.modes[p.id] === 'hold' ? 'let go' : 'moved');
  },
  bot(X, b, st) {
    if (st.phase === 'green' && X.after(b, 'doll', 0.16, 0.3)) this.act(X, b, { a: 'sneak' }, st);
    if (st.phase === 'red' && !st.seenThis[b.id] && X.now() - st.redAt > 600 && Math.random() < 0.006) this.catch(X, st, b.id, 'moved');
  },
  tv(X, st) { return { ui: 'paint', room: 'doll', phase: st.phase, prog: Math.round((st.prog / st.target) * 100), log: st.log && X.now() - st.log.at < 2500 ? st.log : null, turnAt: st.phase === 'green' ? st.turnAt : null }; },
  phone(X, p, st) { return { ui: 'paint', room: 'doll', phase: st.phase, prog: Math.round((st.prog / st.target) * 100), turnAt: st.phase === 'green' ? st.turnAt : null, redAt: st.phase === 'red' ? st.redWall : null, caught: !!st.seenThis[p.id], mode: st.modes[p.id] || null }; },
};

// ================================================================== HIDE AND SEEK
// Everyone hides somewhere secret. Each turn the ghost searches the noisiest spot. Stay quiet, sneak, or throw a pebble.
const SPOTS = [['wardrobe', 'Wardrobe', '🚪'], ['bed', 'Under the bed', '🛏️'], ['curtain', 'Behind the curtain', '🪟'], ['clock', 'Grandfather clock', '🕰️'], ['bath', 'Bathtub', '🛁'], ['chest', 'Old chest', '🧳'], ['chimney', 'Chimney', '🧱'], ['painting', 'Behind the painting', '🖼️']];
const HIDE = {
  key: 'hide', name: 'Hide and Seek', style: 'paint', art: 'mn-room-bedroom', music: 'mn-possessed',
  goal: 'Hide somewhere secret. The ghost searches wherever it hears noise. Throw pebbles to send it somewhere else. Don\'t hit your friends!',
  secs: { 1: 120, 2: 120, quick: 50 },
  make(X, kind) {
    const spots = kind === 2 ? shuffle(SPOTS).slice(0, 7) : kind === 'quick' ? shuffle(SPOTS).slice(0, 5) : SPOTS.slice();
    const st = { kind, spots: spots.map(([k, l, e]) => ({ k, l, e })), where: {}, found: [], turn: 0, turns: kind === 'quick' ? 2 : 4, per: 1, loud: kind === 2, phase: 'hide', choice: {}, heard: [], searched: [], hits: [] };
    st.until = X.now() + (kind === 'quick' ? 9000 : 13000); return st;
  },
  spot(st, k) { return st.spots.find((s) => s.k === k); },
  tick(X, st, now) {
    if (st.done || now < st.until) return;
    if (st.phase === 'hide') { live(X).forEach((p) => { if (!st.where[p.id]) st.where[p.id] = pick(st.spots).k; }); return this.plan(X, st); }
    if (st.phase === 'plan') return this.search(X, st);
    if (st.phase === 'search') {
      if (st.turn >= st.turns || st.found.length >= live(X).length) { const n = live(X).length; const allowed = Math.max(0, Math.floor(n / 2)); st.phase = 'end'; st.until = now + 3500; st.won = st.found.length <= allowed; return; }
      return this.plan(X, st);
    }
    if (st.phase === 'end') st.done = st.won ? 'win' : 'fail';
  },
  plan(X, st) { st.phase = 'plan'; st.choice = {}; st.until = X.now() + (st.kind === 'quick' ? 6000 : 8000); },
  search(X, st) {
    st.turn++; const noise = {}; st.heard = [];
    for (const [id, c] of Object.entries(st.choice)) {
      if (c.do === 'pebble' && c.at) { noise[c.at] = (noise[c.at] || 0) + 2; st.heard.push({ k: c.at, what: 'a pebble clatters' }); }
      if (c.do === 'sneak' && c.at && !st.found.includes(id)) { st.where[id] = c.at; if (st.loud || Math.random() < 0.5) { noise[c.at] = (noise[c.at] || 0) + 1; st.heard.push({ k: c.at, what: 'a floorboard creaks' }); } }
    }
    const order = shuffle(st.spots.map((s) => s.k)).sort((a, b) => (noise[b] || 0) - (noise[a] || 0));
    const fresh = order.filter((k) => !st.searched.slice(-st.per).includes(k) || noise[k]);
    const targets = (fresh.length ? fresh : order).slice(0, st.per);
    st.searched.push(...targets); st.hits = [];
    for (const k of targets) {
      const who = Object.entries(st.where).filter(([id, w]) => w === k && !st.found.includes(id)).map(([id]) => id);
      who.forEach((id) => { st.found.push(id); X.scare('personal', id); X.drip(3, null); });
      st.hits.push({ k, who: who.map((id) => nameOf(X, id)) });
    }
    X.sfx(st.hits.some((h) => h.who.length) ? 'mn-scream' : 'mn-creak');
    st.phase = 'search'; st.until = X.now() + 4200;
  },
  act(X, p, a, st) {
    if (st.phase === 'hide' && a.a === 'hide' && this.spot(st, a.k)) { st.where[p.id] = a.k; X.sfx('mn-floor'); }
    if (st.phase === 'plan' && a.a === 'plan' && ['stay', 'sneak', 'pebble'].includes(a.do)) {
      if (a.do !== 'stay' && !this.spot(st, a.at)) return; if (a.do === 'sneak' && st.found.includes(p.id)) return;
      st.choice[p.id] = { do: a.do, at: a.at || null };
    }
  },
  bot(X, b, st) {
    if (st.phase === 'hide' && !st.where[b.id] && X.after(b, 'hide', 1, 4)) this.act(X, b, { a: 'hide', k: pick(st.spots).k }, st);
    if (st.phase === 'plan' && !st.choice[b.id] && X.after(b, 'hidep', 1, 4)) { const r = Math.random(); const other = pick(st.spots.filter((s) => s.k !== st.where[b.id])).k; this.act(X, b, r < 0.65 ? { a: 'plan', do: 'stay' } : r < 0.85 ? { a: 'plan', do: 'pebble', at: other } : { a: 'plan', do: 'sneak', at: other }, st); }
  },
  tv(X, st) {
    const reveal = st.phase === 'end';
    return { ui: 'paint', room: 'hide', phase: st.phase, until: X.wall(st.until), turn: st.turn, turns: st.turns, per: st.per, spots: st.spots, searched: st.searched.slice(-st.per * 2), hits: st.phase === 'search' || st.phase === 'end' ? st.hits : [], heard: st.phase === 'search' ? st.heard : [],
      found: st.found.map((id) => nameOf(X, id)), ready: Object.keys(st.phase === 'hide' ? st.where : st.choice).length, of: live(X).length,
      reveal: reveal ? Object.entries(st.where).map(([id, k]) => ({ name: nameOf(X, id), k, found: st.found.includes(id) })) : null, won: st.won };
  },
  phone(X, p, st) { return { ui: 'paint', room: 'hide', phase: st.phase, until: X.wall(st.until), spots: st.spots, mine: st.where[p.id] || null, found: st.found.includes(p.id), choice: st.choice[p.id] || null, turn: st.turn, turns: st.turns, hits: st.phase === 'search' ? st.hits : [] }; },
};

// ================================================================== THE SÉANCE
// A spirit board on the TV. Each phone can only pull the pointer one way. Spell the word together.
const BOARD = (() => {
  const L = {}; const top = 'ABCDEFGHIJKLM'; const bot = 'NOPQRSTUVWXYZ';
  [...top].forEach((c, i) => { const t = i / 12; L[c] = { x: 10 + t * 80, y: 25 - Math.sin(t * Math.PI) * 9 }; });
  [...bot].forEach((c, i) => { const t = i / 12; L[c] = { x: 12 + t * 76, y: 40 - Math.sin(t * Math.PI) * 8 }; });
  L.YES = { x: 11, y: 6 }; L.NO = { x: 89, y: 6 };
  return L;
})();
const WORDS1 = ['KEY', 'BOO', 'LILY', 'DOOR', 'ADA', 'WAX'];
const RIDDLES = [
  ['I have keys, but I open no locks.', 'PIANO'], ['The more you take, the more you leave behind.', 'STEPS'], ['What gets wetter the more it dries?', 'TOWEL'],
  ['I follow you all day, but I vanish in the dark.', 'SHADOW'], ['What has a face and two hands, but no arms?', 'CLOCK'], ['What has a neck, but no head?', 'BOTTLE'],
];
const SEANCE = {
  key: 'seance', name: 'The Séance', style: 'paint', art: 'mn-room-seance', music: 'mn-talk',
  goal: 'Each of you can only pull the pointer ONE way. Work together to rest it on each letter of the word.',
  secs: { 1: 75, 2: 100, quick: 35 },
  make(X, kind) {
    const st = { kind, x: 50, y: 50, vx: 0, vy: 0, held: {}, dirs: {}, got: 0, dwell: 0, on: null, left: true, hissAt: 0 };
    if (kind === 2) { const [q, w] = pick(RIDDLES); st.riddle = q; st.word = w; } else st.word = kind === 'quick' ? pick(['BOO', 'NO', 'YES']) : pick(WORDS1);
    st.letters = st.word === 'YES' || st.word === 'NO' ? [st.word] : [...st.word];
    // hand out the four directions: everyone gets at least one
    const ids = shuffle(live(X).map((p) => p.id)); const D = shuffle(['u', 'd', 'l', 'r']);
    if (ids.length <= 4) D.forEach((d, i) => { const id = ids[i % ids.length]; (st.dirs[id] = st.dirs[id] || []).push(d); });
    else ids.forEach((id, i) => { st.dirs[id] = [D[i % 4]]; });
    return st;
  },
  target(st) { return BOARD[st.letters[st.got]]; },
  hintLevel(X, st) { if (st.kind !== 2) return 2; const t = X.now() - st.t0; return t > 45000 ? 2 : t > 22000 ? 1 : 0; },
  tick(X, st, now, dt) {
    if (st.done) return;
    // physics in small steps: pulls push, the board drags
    let fx = 0, fy = 0;
    for (const [id, ds] of Object.entries(st.held)) for (const d of ds) { if (d === 'u') fy -= 1; if (d === 'd') fy += 1; if (d === 'l') fx -= 1; if (d === 'r') fx += 1; }
    const steps = Math.max(1, Math.round(dt / 50));
    for (let i = 0; i < steps; i++) {
      st.vx = (st.vx + fx * 1.0) * 0.75; st.vy = (st.vy + fy * 1.0) * 0.75;
      const m = Math.hypot(st.vx, st.vy); if (m > 3.2) { st.vx *= 3.2 / m; st.vy *= 3.2 / m; }
      st.x = Math.max(4, Math.min(96, st.x + st.vx * 0.3)); st.y = Math.max(3, Math.min(57, st.y + st.vy * 0.3));
    }
    // which letter is the pointer resting on
    let on = null; for (const [k, p] of Object.entries(BOARD)) { const r = k.length > 1 ? 5 : 3.3; if (Math.hypot(p.x - st.x, p.y - st.y) < r) { on = k; break; } }
    if (on !== st.on) { st.on = on; st.dwell = 0; if (!on) st.left = true; }
    else if (on && st.left) {
      st.dwell += dt;
      if (st.dwell >= 900) {
        st.left = false; st.dwell = 0;
        if (on === st.letters[st.got]) { st.got++; X.sfx('mn-chime'); if (st.got >= st.letters.length) { st.done = 'win'; X.sfx('mn-unlock'); } }
        else if (now - st.hissAt > 1500) { st.hissAt = now; X.sfx('mn-whisper'); X.drip(1, null); st.wrong = { k: on, at: now }; }
      }
    }
  },
  act(X, p, a, st) {
    if (a.a === 'pull') { const mine = st.dirs[p.id] || []; st.held[p.id] = (Array.isArray(a.d) ? a.d : []).filter((d) => mine.includes(d)); }
  },
  bot(X, b, st) {
    const mine = st.dirs[b.id] || []; const t = this.target(st); if (!t) return;
    if (!X.after(b, 'sea', 0.15, 0.35)) return;
    const dx = t.x - st.x, dy = t.y - st.y; const pv = 3; // aim a little ahead to stop overshooting
    const want = []; if (dx - st.vx * pv > 1.5) want.push('r'); if (dx - st.vx * pv < -1.5) want.push('l'); if (dy - st.vy * pv > 1.5) want.push('d'); if (dy - st.vy * pv < -1.5) want.push('u');
    st.held[b.id] = mine.filter((d) => want.includes(d));
  },
  tv(X, st) {
    const h = this.hintLevel(X, st);
    return { ui: 'paint', room: 'seance', x: Math.round(st.x * 10) / 10, y: Math.round(st.y * 10) / 10, on: st.on, dwell: st.left && st.on ? Math.min(1, st.dwell / 900) : 0, word: h === 2 ? st.word : h === 1 ? st.word[0] + ' _'.repeat(st.word.length - 1) : null, len: st.word.length, letters: st.letters, got: st.got, riddle: st.riddle || null,
      pulls: Object.entries(st.held).filter(([, d]) => d.length).map(([id, d]) => ({ name: nameOf(X, id), d })), wrong: st.wrong && X.now() - st.wrong.at < 1500 ? st.wrong.k : null };
  },
  phone(X, p, st) { const h = this.hintLevel(X, st); return { ui: 'paint', room: 'seance', dirs: st.dirs[p.id] || [], word: h === 2 ? st.word : null, len: st.word.length, got: st.got, letters: st.letters, riddle: st.riddle || null }; },
};

// ================================================================== MORTIMER'S MERCY (when the candle is low)
const MERCY2 = {
  key: 'mercy', name: "Mortimer's Mercy", style: 'paint', art: 'mn-candle', music: 'mn-memory',
  goal: 'Everyone press and hold the flame on your phone, all at the same time. Together, you feed the candle.',
  secs: { 1: 30 },
  make() { return { kind: 1, held: {}, fed: 0 }; },
  tick(X, st, now, dt) {
    if (st.done) return; const all = live(X).filter((p) => !p.bot).every((p) => st.held[p.id]) && live(X).length > 0;
    if (all) { const before = Math.floor(st.fed / 1000); st.fed += dt; if (Math.floor(st.fed / 1000) > before) { X.gain(1.5); X.sfx('mn-candle-light'); } }
    if (st.fed >= 10000) st.done = 'win';
  },
  act(X, p, a, st) { if (a.a === 'hold') st.held[p.id] = !!a.on; },
  bot() {},
  tv(X, st) { const humans = live(X).filter((p) => !p.bot); return { ui: 'paint', room: 'mercy', fed: Math.round(st.fed / 100), holding: humans.filter((p) => st.held[p.id]).map((p) => p.name), waiting: humans.filter((p) => !st.held[p.id]).map((p) => p.name) }; },
  phone(X, p, st) { return { ui: 'paint', room: 'mercy', on: !!st.held[p.id], fed: Math.round(st.fed / 100) }; },
};

// ================================================================== THE ICE HALL (8-bit, kept from before)
const ICE0 = PXR.PX_ROOMS.ice;
const ICE = { ...ICE0, key: 'ice', style: 'poke', art: 'mn-room-ballroom', goal: 'You slide until something stops you. Stand on every red button at the same time to open the gate. Then everyone out.',
  secs: { 1: 90, 2: 120, quick: 40 }, make(X, kind) { return ICE0.make.call(this, X, kind === 1 ? 1 : kind === 2 ? 3 : 'practice'); } };

const ROOMS2 = { ice: ICE, doll: HOLD, hide: HIDE, seance: SEANCE };
module.exports = { ROOMS2, MERCY2, BOARD, SPOTS };
