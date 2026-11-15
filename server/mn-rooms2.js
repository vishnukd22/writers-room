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
  goal: 'Tap SNEAK while her back is turned. When she starts to turn, press and HOLD the pad and freeze. Lift your thumb or move your phone and she sees you.',
  secs: { 1: 75, 2: 95, quick: 30 },
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
    if (st.phase === 'green') { st.phase = 'warn'; st.until = now + (k === 1 ? 750 : 500); X.sfx('mn-creak2'); return; }
    if (st.phase === 'warn') {
      if (Math.random() < (k === 1 ? 0.2 : 0.35) && !st.faked) { st.faked = true; this.green(X, st); return; } // she twitches, but doesn't turn
      st.faked = false; st.phase = 'red'; st.redAt = now; st.until = now + (k === 2 ? rnd(4000, 7000) : k === 1 ? rnd(3000, 5000) : rnd(2500, 4000)); st.redWall = X.wall(now); X.sfx('mn-breath'); return;
    }
    if (st.phase === 'red') this.green(X, st);
  },
  catch(X, st, id, why) {
    if (st.seenThis[id]) return; st.seenThis[id] = true;
    st.prog = Math.max(0, st.prog - 25); st.caught.push(id); st.log = { name: nameOf(X, id), why, at: X.now() }; st.lunge = X.now();
    X.sfx('mn-giggle'); X.drip(4, null); X.scare('personal', id);
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
    if (st.phase === 'red' && !st.seenThis[b.id] && X.now() - st.redAt > 600 && Math.random() < 0.003) this.catch(X, st, b.id, 'moved');
  },
  tv(X, st) { return { ui: 'paint', room: 'doll', lunge: st.lunge && X.now() - st.lunge < 1400, phase: st.phase, prog: Math.round((st.prog / st.target) * 100), log: st.log && X.now() - st.log.at < 2500 ? st.log : null, turnAt: st.phase === 'green' ? st.turnAt : null }; },
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
      who.forEach((id) => { st.found.push(id); X.scare('personal', id); X.drip(4, null); });
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
        else if (now - st.hissAt > 1500) { st.hissAt = now; X.sfx('mn-whisper'); X.drip(2, null); st.wrong = { k: on, at: now }; }
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
// Round two adds thin ice: some ice is cracked, only two players can see where, and anyone who slides over it falls through.
const ICE0 = PXR.PX_ROOMS.ice;
const ICE = { ...ICE0, key: 'ice', style: 'poke', art: 'mn-room-ballroom', goal: 'You slide until something stops you. Stand on every red button at the same time to open the gate. Then everyone out.',
  goal2: 'Thin ice! Only two of you can see the cracks on your phone. Guide the others around them.',
  secs: { 1: 90, 2: 130, quick: 40 },
  make(X, kind) {
    const st = ICE0.make.call(this, X, kind === 1 ? 1 : kind === 2 ? 3 : 'practice'); st.thin = []; st.seers = [];
    if (kind === 2) {
      // cracks only where the answer never needs to go
      const used = new Set(); const g = st.g; const H = g.length, W = g[0].length;
      const walk = (from, goal) => { const path = this.plan(st, null, { x: from[0], y: from[1] }, goal); if (!path) return; let x = from[0], y = from[1]; for (const d of path) { const [dx, dy] = { u: [0, -1], d: [0, 1], l: [-1, 0], r: [1, 0] }[d]; for (;;) { const nx = x + dx, ny = y + dy; if (ny < 0 || ny >= H || nx < 0 || nx >= W) break; const c = g[ny][nx]; if (c === '#' || c === 'g') break; x = nx; y = ny; used.add(`${x},${y}`); if (c !== '~') break; } } };
      for (let y = 0; y < H; y++) for (const [px, py] of st.plates) walk([0, y], (x2, y2) => x2 === px && y2 === py);
      st.open = true; for (const [px, py] of st.plates) walk([px, py], (x2, y2) => g[y2][x2] === 'E'); for (let y = 0; y < H; y++) walk([0, y], (x2, y2) => g[y2][x2] === 'E'); st.open = false;
      const free = []; for (let y = 0; y < H; y++) for (let x = 1; x < W - 1; x++) if (g[y][x] === '~' && !used.has(`${x},${y}`)) free.push([x, y]);
      st.thin = shuffle(free).slice(0, Math.max(3, Math.round(free.length * 0.25)));
      const ids = shuffle(X.seats.filter((p) => !p.bot && p.connected).map((p) => p.id)); const rest = shuffle(X.seats.filter((p) => p.bot || !p.connected).map((p) => p.id));
      st.seers = [...ids, ...rest].slice(0, 2);
    }
    return st;
  },
  move(X, st, id, d) {
    const q = st.pl[id]; if (!q || q.out || !st.thin.length) return ICE0.move.call(this, X, st, id, d);
    const sx = q.x, sy = q.y; ICE0.move.call(this, X, st, id, d); if (q.out || (q.x === sx && q.y === sy)) return;
    // did the slide cross a crack?
    const [dx, dy] = { u: [0, -1], d: [0, 1], l: [-1, 0], r: [1, 0] }[d]; let x = sx, y = sy;
    while (x !== q.x || y !== q.y) { x += dx; y += dy; const k = st.thin.findIndex(([tx, ty]) => tx === x && ty === y); if (k >= 0) { st.thin.splice(k, 1); st.g[y][x] = 'x'; const s0 = st.start[id]; q.x = s0[0]; q.y = s0[1]; q.seq++; q.slide = 0; X.sfx('mn-bottle'); X.drip(2, null); X.scare('personal', id); this.check(X, st); return; } }
  },
  plan(st, id, q, goal) {
    if (!st.thin || !st.thin.length) return ICE0.plan.call(this, st, id, q, goal);
    const thin = new Set(st.thin.map(([x, y]) => `${x},${y}`)); const D = { u: [0, -1], d: [0, 1], l: [-1, 0], r: [1, 0] };
    const prev = new Map([[`${q.x},${q.y}`, null]]); const que = [[q.x, q.y]];
    while (que.length) {
      const [x, y] = que.shift(); if (goal(x, y)) { const path = []; let k = `${x},${y}`; while (prev.get(k)) { const [d, pk] = prev.get(k); path.unshift(d); k = pk; } return path; }
      for (const d of Object.keys(D)) { let cx = x, cy = y; let bad = false; const end = (() => { const st2 = st; let ax = x, ay = y; for (;;) { const nx = ax + D[d][0], ny = ay + D[d][1]; if (ny < 0 || ny >= st2.g.length || nx < 0 || nx >= st2.g[0].length) break; const c = st2.g[ny][nx]; if (c === '#' || c === 'x' || (c === 'g' && !st2.open)) break; if (id !== null && Object.entries(st2.pl).some(([oid, o]) => oid !== id && !o.out && o.x === nx && o.y === ny)) break; ax = nx; ay = ny; if (thin.has(`${ax},${ay}`)) bad = true; if (c !== '~') break; } return [ax, ay]; })(); cx = end[0]; cy = end[1]; if (bad || (cx === x && cy === y)) continue; const k = `${cx},${cy}`; if (prev.has(k)) continue; prev.set(k, [d, `${x},${y}`]); que.push([cx, cy]); }
    }
    return null;
  },
  tv(X, st) { const t = ICE0.tv.call(this, X, st); if (st.thin.length || st.seers.length) t.info = `${t.info} Thin ice! ${st.seers.map((id) => nameOf(X, id)).join(' and ')} can see the cracks.`; return t; },
  phone(X, p, st) { const ph = ICE0.phone.call(this, X, p, st); if (st.seers.includes(p.id) && ph.pad) { const t = ICE0.tv.call(this, X, st); ph.mini = { map: t.map, theme: 'ice', actors: t.actors, plates: t.plates, open: t.open, cracks: st.thin }; ph.text = `You can see the thin ice (the red Xs). Warn everyone! ${ph.text}`; } return ph; },
};

// ================================================================== LIGHTS OUT (8-bit)
// The TV is pitch black. One player holds the lantern: only their phone shows the whole maze and the ghosts.
function maze(W, H) {
  const g = []; for (let y = 0; y < H; y++) g.push(Array(W).fill('#'));
  const st = [[1, 1]]; g[1][1] = '.'; const D = [[2, 0], [-2, 0], [0, 2], [0, -2]];
  while (st.length) { const [x, y] = st[st.length - 1]; const n = shuffle(D).map(([dx, dy]) => [x + dx, y + dy, dx, dy]).filter(([nx, ny]) => nx > 0 && ny > 0 && nx < W - 1 && ny < H - 1 && g[ny][nx] === '#'); if (!n.length) { st.pop(); continue; } const [nx, ny, dx, dy] = n[0]; g[y + dy / 2][x + dx / 2] = '.'; g[ny][nx] = '.'; st.push([nx, ny]); }
  // knock out some walls so there is more than one way round a ghost
  for (let k = 0; k < Math.round(W * H * 0.06); k++) { const x = rint(1, W - 2), y = rint(1, H - 2); if (g[y][x] === '#' && ((g[y][x - 1] === '.' && g[y][x + 1] === '.') || (g[y - 1][x] === '.' && g[y + 1][x] === '.'))) g[y][x] = '.'; }
  for (let y = 0; y < H; y++) g[y][0] = y % 2 ? '.' : '#';
  const ey = H - 2; g[ey][W - 1] = 'E'; g[ey][W - 2] = '.';
  return g;
}
const LIGHTS = {
  key: 'lights', name: 'Lights Out', style: 'poke', art: 'mn-room-maze', music: 'mn-possessed',
  goal: 'The TV goes dark. Only the lantern holder\'s phone shows the maze and the ghosts. They guide everyone else to the stairs by voice.',
  secs: { 1: 100, 2: 120, quick: 55 },
  make(X, kind) {
    const [W, H, ng] = kind === 1 ? [17, 9, 2] : kind === 2 ? [19, 11, 4] : [13, 7, 2];
    const g = maze(W, H); const all = live(X);
    const humans = shuffle(all.filter((p) => !p.bot).map((p) => p.id)); const prev = X.R.lantern;
    const lantern = humans.find((id) => id !== prev) || humans[0] || all[0].id; X.R.lantern = lantern;
    const st = { kind, g, lantern, pl: {}, ghosts: [], caught: 0 };
    const spots = []; for (let y = 1; y < H; y += 2) spots.push([0, y]);
    all.filter((p) => p.id !== lantern).forEach((p, i) => { const s = spots[i % spots.length]; st.pl[p.id] = { x: s[0], y: s[1], dir: 'r', seq: 0, out: false }; });
    st.start = Object.fromEntries(Object.entries(st.pl).map(([id, q]) => [id, [q.x, q.y]]));
    const open = []; for (let y = 0; y < H; y++) for (let x = Math.floor(W / 3); x < W - 1; x++) if (g[y][x] === '.') open.push([x, y]);
    shuffle(open).slice(0, ng).forEach(([x, y]) => st.ghosts.push({ x, y, next: 0 }));
    if (!Object.keys(st.pl).length) st.done = 'win';
    return st;
  },
  free(st, x, y) { return y >= 0 && y < st.g.length && x >= 0 && x < st.g[0].length && st.g[y][x] !== '#'; },
  act(X, p, a, st) {
    if (a.a !== 'mv') return; const q = st.pl[p.id]; if (!q || q.out) return; if (X.now() - (p.lastMv || 0) < 120) return; p.lastMv = X.now();
    const [dx, dy] = { u: [0, -1], d: [0, 1], l: [-1, 0], r: [1, 0] }[a.d] || [0, 0]; q.dir = a.d;
    if (!this.free(st, q.x + dx, q.y + dy)) { X.sfx('px-bump'); return; }
    q.x += dx; q.y += dy; q.seq++; if (st.g[q.y][q.x] === 'E') { q.out = true; X.sfx('px-coin'); }
    this.touch(X, st); if (Object.values(st.pl).every((o) => o.out)) st.done = 'win';
  },
  touch(X, st) {
    for (const [id, q] of Object.entries(st.pl)) {
      if (q.out) continue; const gh = st.ghosts.find((o) => o.x === q.x && o.y === q.y); if (!gh) continue;
      st.caught++; X.drip(3, null); X.sfx('mn-scream'); X.scare('personal', id);
      const far = []; for (let y = 0; y < st.g.length; y++) for (let x = 1; x < st.g[0].length - 1; x++) if (st.g[y][x] === '.' && Math.abs(x - q.x) + Math.abs(y - q.y) > 8) far.push([x, y]);
      if (far.length) { const [fx, fy] = pick(far); gh.x = fx; gh.y = fy; gh.next = X.now() + 2500; }
    }
  },
  tick(X, st, now) {
    if (st.done) return; const every = st.kind === 2 ? 800 : 1050;
    for (const gh of st.ghosts) {
      if (now < gh.next) continue; gh.next = now + every + Math.random() * 300;
      const opts = [[0, -1], [0, 1], [-1, 0], [1, 0]].filter(([dx, dy]) => this.free(st, gh.x + dx, gh.y + dy) && st.g[gh.y + dy][gh.x + dx] !== 'E' && gh.x + dx > 0);
      if (!opts.length) continue;
      // now and then a ghost drifts towards the nearest person
      const near = Object.values(st.pl).filter((q) => !q.out).sort((a, b) => Math.abs(a.x - gh.x) + Math.abs(a.y - gh.y) - Math.abs(b.x - gh.x) - Math.abs(b.y - gh.y))[0];
      let mv = pick(opts); if (near && Math.random() < (st.kind === 2 ? 0.45 : 0.3)) mv = opts.sort((a, b) => Math.abs(gh.x + a[0] - near.x) + Math.abs(gh.y + a[1] - near.y) - Math.abs(gh.x + b[0] - near.x) - Math.abs(gh.y + b[1] - near.y))[0];
      gh.x += mv[0]; gh.y += mv[1];
    }
    this.touch(X, st);
  },
  bot(X, b, st) {
    const q = st.pl[b.id]; if (!q || q.out || !X.after(b, 'lo', 0.3, 0.6)) return;
    const bad = new Set(st.ghosts.flatMap((gh) => [[0, 0], [0, 1], [0, -1], [1, 0], [-1, 0]].map(([dx, dy]) => `${gh.x + dx},${gh.y + dy}`)));
    const prev = new Map([[`${q.x},${q.y}`, null]]); const que = [[q.x, q.y]]; let goal = null;
    while (que.length) { const [x, y] = que.shift(); if (st.g[y][x] === 'E') { goal = [x, y]; break; } for (const [dx, dy, d] of [[0, -1, 'u'], [0, 1, 'd'], [-1, 0, 'l'], [1, 0, 'r']]) { const k = `${x + dx},${y + dy}`; if (prev.has(k) || !this.free(st, x + dx, y + dy) || (bad.has(k) && Math.random() < 0.9)) continue; prev.set(k, [d, `${x},${y}`]); que.push([x + dx, y + dy]); } }
    if (!goal) return; let k = `${goal[0]},${goal[1]}`; let first = null; while (prev.get(k)) { const [d, pk] = prev.get(k); first = d; k = pk; }
    if (first) this.act(X, b, { a: 'mv', d: first }, st);
  },
  view(X, st) { return { map: st.g.map((r) => r.join('')), theme: 'cellar', actors: Object.entries(st.pl).map(([id, q]) => { const p = X.P(id); return { id, x: q.x, y: q.y, dir: q.dir, seq: q.seq, out: q.out, slide: 0, name: p?.name || '', c: p?.color || '#fff', look: Math.max(0, X.seats.indexOf(p)) % 8 }; }), ghosts: st.ghosts.map((gh) => ({ x: gh.x, y: gh.y })) }; },
  tv(X, st) { const v = this.view(X, st); const out = Object.values(st.pl).filter((q) => q.out).length; return { ...v, dark: true, lantern: nameOf(X, st.lantern), info: `${nameOf(X, st.lantern)} holds the lantern. ${out} of ${Object.keys(st.pl).length} out.` }; },
  phone(X, p, st) {
    if (p.id === st.lantern) return { pad: false, lanternMap: this.view(X, st), big: 'You hold the lantern', text: 'Only you can see the maze and the ghosts. Guide everyone to the stairs on the right. Shout!' };
    const q = st.pl[p.id]; if (!q) return { pad: false, text: 'Watch the TV.' };
    if (q.out) return { pad: false, big: 'You made it out!', text: 'Help guide the others.' };
    return { pad: true, text: `It's pitch black. Listen to ${nameOf(X, st.lantern)}, who holds the lantern.` };
  },
};

// ================================================================== THE FUSE BOX (talk it through)
// Only the electrician's phone shows the fuse box. Everyone else holds a different page of the manual.
const COLORS = ['red', 'blue', 'yellow', 'white', 'black'];
const GLYPHS = ['☾', '★', '☥', '⚘', '♆', '☀', '♣', '♠', '☂', '✿', '⚓', '♞', '☯', '✠', '♫', '⌛', '☘', '♛', '✪', '⚔', '☎', '✂', '♨', '⚖'];
const WIRE_RULES = {
  4: ['If there is no red wire, cut the 3rd wire.', 'Otherwise, if the 1st wire is yellow, cut the 1st wire.', 'Otherwise, if there are two or more blue wires, cut the 2nd wire.', 'Otherwise, cut the last wire.'],
  5: ['If the last wire is white, cut the 2nd wire.', 'Otherwise, if there are exactly two red wires, cut the 4th wire.', 'Otherwise, if there is no black wire, cut the last wire.', 'Otherwise, cut the 1st wire.'],
  6: ['If there are three or more yellow wires, cut the 5th wire.', 'Otherwise, if the 1st and last wires are the same colour, cut the 3rd wire.', 'Otherwise, if there is no white wire, cut the 2nd wire.', 'Otherwise, cut the 6th wire.'],
};
function wireAnswer(w) {
  const n = w.length; const c = (col) => w.filter((x) => x === col).length;
  if (n === 4) return !c('red') ? 2 : w[0] === 'yellow' ? 0 : c('blue') >= 2 ? 1 : 3;
  if (n === 5) return w[4] === 'white' ? 1 : c('red') === 2 ? 3 : !c('black') ? 4 : 0;
  return c('yellow') >= 3 ? 4 : w[0] === w[5] ? 2 : !c('white') ? 1 : 5;
}
const LEVER_RULES = ['Red light: pull DOWN if the number is even, UP if it is odd.', 'Green light: pull UP, unless the number is bigger than 6. Then pull DOWN.', 'Blue light: pull DOWN if the box has a yellow wire. Otherwise pull UP.', 'Yellow light: pull UP if the number is 1, 4 or 9. Otherwise pull DOWN.'];
function leverAnswer(l, wires) { const n = l.n; if (l.c === 'red') return n % 2 ? 'up' : 'down'; if (l.c === 'green') return n > 6 ? 'down' : 'up'; if (l.c === 'blue') return wires.includes('yellow') ? 'down' : 'up'; return [1, 4, 9].includes(n) ? 'up' : 'down'; }
function makeSymbols() {
  for (;;) {
    const cols = Array.from({ length: 5 }, () => shuffle(GLYPHS).slice(0, 6)); const t = rint(0, 4); const four = shuffle(cols[t]).slice(0, 4);
    if (cols.filter((c) => four.every((s) => c.includes(s))).length !== 1) continue;
    return { cols, four: shuffle(four), order: cols[t].filter((s) => four.includes(s)) };
  }
}
const FUSE = {
  key: 'fuse', name: 'The Fuse Box', style: 'paint', art: 'mn-room-fusebox', music: 'mn-talk',
  goal: 'Only the electrician sees the fuse box. Everyone else holds one page of the manual. Describe, look it up, shout the answer.',
  secs: { 1: 100, 2: 120, quick: 45 },
  make(X, kind) {
    const all = live(X); const humans = shuffle(all.filter((p) => !p.bot).map((p) => p.id)); const prev = X.R.elec;
    const elec = humans.find((id) => id !== prev) || humans[0] || all[0].id; X.R.elec = elec;
    const nW = kind === 1 ? 4 : kind === 2 ? rint(5, 6) : 4; const wires = Array.from({ length: nW }, () => pick(COLORS));
    const mods = ['wires', 'symbols']; if (kind === 2) mods.push('lever'); if (kind === 'quick') mods.splice(1, 1);
    const st = { kind, elec, mods, solved: {}, wires, cut: [], sym: makeSymbols(), pressed: [], lever: { c: pick(['red', 'green', 'blue', 'yellow']), n: rint(1, 9) }, sparks: 0, sparkAt: 0 };
    // hand out the manual pages to everyone but the electrician
    // pages go to the other people (never guests). With nobody else, the electrician has to read them alone.
    const readers = shuffle(all.filter((p) => p.id !== elec && !p.bot).map((p) => p.id)); st.pages = {};
    mods.forEach((m, i) => { const id = readers.length ? readers[i % readers.length] : elec; (st.pages[id] = st.pages[id] || []).push(m); });
    return st;
  },
  spark(X, st) { st.sparks++; st.sparkAt = X.now(); X.sfx('mn-spark'); X.drip(3, null); },
  done(X, st, m) { st.solved[m] = true; X.sfx('mn-switch'); if (st.mods.every((k) => st.solved[k])) { st.done = 'win'; X.sfx('mn-unlock'); } },
  act(X, p, a, st) {
    if (a.a === 'short' && st.poss === p.id && (st.shorts || 0) < 2) { st.shorts = (st.shorts || 0) + 1; st.darkUntil = X.now() + 4000; this.spark(X, st); return; }
    if (p.id !== st.elec || st.done) return; if (X.now() < (st.darkUntil || 0)) return; if (X.now() - st.sparkAt < 1500) return; // still smoking
    if (a.a === 'cut' && st.mods.includes('wires') && !st.solved.wires) { const i = Number(a.i); if (st.cut.includes(i)) return; st.cut.push(i); if (i === wireAnswer(st.wires)) this.done(X, st, 'wires'); else this.spark(X, st); }
    if (a.a === 'sym' && st.mods.includes('symbols') && !st.solved.symbols) { const s2 = st.sym.four.includes(a.s) ? a.s : null; if (!s2 || st.pressed.includes(s2)) return; if (s2 === st.sym.order[st.pressed.length]) { st.pressed.push(s2); X.sfx('mn-tick'); if (st.pressed.length === 4) this.done(X, st, 'symbols'); } else { st.pressed = []; this.spark(X, st); } }
    if (a.a === 'lever' && st.mods.includes('lever') && !st.solved.lever && ['up', 'down'].includes(a.d)) { if (a.d === leverAnswer(st.lever, st.wires)) this.done(X, st, 'lever'); else this.spark(X, st); }
  },
  tick() {},
  bot(X, b, st) {
    if (b.id !== st.elec || st.done || !X.after(b, 'fuse', 3, 7)) return;
    const right = Math.random() < 0.85; const m = st.mods.find((k) => !st.solved[k]); if (!m) return;
    if (m === 'wires') { const ans = wireAnswer(st.wires); const i = right ? ans : pick([...st.wires.keys()].filter((k) => k !== ans && !st.cut.includes(k))); if (i != null) this.act(X, b, { a: 'cut', i }, st); }
    if (m === 'symbols') this.act(X, b, { a: 'sym', s: right ? st.sym.order[st.pressed.length] : pick(st.sym.four) }, st);
    if (m === 'lever') { const ans = leverAnswer(st.lever, st.wires); this.act(X, b, { a: 'lever', d: right ? ans : ans === 'up' ? 'down' : 'up' }, st); }
  },
  page(st, m) {
    if (m === 'wires') return { m, title: 'Page: Wires', lines: [`Count the wires first.`, ...Object.entries(WIRE_RULES).flatMap(([n, r]) => [`${n} wires:`, ...r.map((t) => `  ${t}`)])] };
    if (m === 'symbols') return { m, title: 'Page: Symbols', cols: st.sym.cols, lines: ['Find the one column that has all four symbols from the box.', 'Press the four symbols in the order they appear in that column, top to bottom.'] };
    return { m, title: 'Page: The lever', lines: ['Look at the colour of the light and the number next to it.', ...LEVER_RULES] };
  },
  tv(X, st) {
    return { ui: 'paint', room: 'fuse', elec: nameOf(X, st.elec), mods: st.mods.map((m) => ({ m, done: !!st.solved[m] })), spark: X.now() - st.sparkAt < 900, sparks: st.sparks, readers: Object.entries(st.pages).map(([id, ms]) => ({ name: nameOf(X, id), ms })), elecBot: !!X.P(st.elec)?.bot };
  },
  phone(X, p, st) {
    const base = { ui: 'paint', room: 'fuse', elec: nameOf(X, st.elec), mods: st.mods.map((m) => ({ m, done: !!st.solved[m] })), spark: X.now() - st.sparkAt < 900 };
    if (p.id === st.elec) return { ...base, box: { wires: st.wires, cut: st.cut, four: st.sym.four, pressed: st.pressed, lever: st.mods.includes('lever') ? st.lever : null }, pages: (st.pages[p.id] || []).map((m) => this.page(st, m)), dark: X.now() < (st.darkUntil || 0) };
    return { ...base, pages: (st.pages[p.id] || []).map((m) => this.page(st, m)) };
  },
};

// ================================================================== THE KITCHEN
// The ghost cook calls a dish. Everyone holds different ingredients: throw the right ones into the pot. Wrong ones spoil it.
const FOOD = [['rat', 'Rat', '🐀'], ['eye', 'Eyeball', '👁️'], ['bone', 'Bone', '🦴'], ['mush', 'Toadstool', '🍄'], ['worm', 'Worm', '🪱'], ['spider', 'Spider', '🕷️'], ['frog', 'Frog', '🐸'], ['garlic', 'Garlic', '🧄'], ['tooth', 'Tooth', '🦷'], ['slime', 'Slime', '🟢'], ['bat', 'Bat wing', '🦇'], ['moth', 'Moth', '🦋']];
const DISHES = ['Graveyard Stew', 'Swamp Soup', 'Crypt Casserole', 'Midnight Broth', 'Cobweb Pie', 'Ghoul Goulash', 'Witch\'s Gumbo', 'Bog Pudding'];
const KITCHEN_NEED = { 1: 5, 2: 6, quick: 2 };
const KITCHEN = {
  key: 'kitchen', name: 'The Kitchen', style: 'paint', art: 'mn-room-kitchen', music: 'mn-speed',
  goal: 'The ghost cook calls a dish. Everyone holds different ingredients. Throw the right ones in the pot. One wrong one and it\'s ruined.',
  secs: { 1: 90, 2: 100, quick: 40 },
  make(X, kind) {
    const all = live(X); const foods = shuffle(FOOD).slice(0, Math.min(FOOD.length, Math.max(6, all.length * 2 + 2)));
    const st = { kind, foods, pantry: {}, pot: [], served: 0, need: KITCHEN_NEED[kind], size: kind === 2 ? 4 : 3, splats: 0 };
    this.deal(X, st); this.order(X, st); return st;
  },
  deal(X, st) { const all = shuffle(live(X).map((p) => p.id)); st.pantry = {}; st.foods.forEach((f, i) => { const id = all[i % all.length]; (st.pantry[id] = st.pantry[id] || []).push(f[0]); }); },
  order(X, st) { st.dish = { name: pick(DISHES), items: shuffle(st.foods).slice(0, st.size).map((f) => f[0]) }; st.pot = []; st.until = st.kind === 2 ? X.now() + 26000 : null; if (st.kind === 2 && st.served > 0) this.deal(X, st); },
  food(k) { return FOOD.find((f) => f[0] === k) || ['poison', 'Poison', '💀']; },
  act(X, p, a, st) {
    if (a.a !== 'throw' || st.done) return; if (X.now() - (p.lastThrow || 0) < 250) return; p.lastThrow = X.now();
    const mine = st.pantry[p.id] || []; const k = a.k === 'poison' && st.poss === p.id ? 'poison' : mine.includes(a.k) ? a.k : null; if (!k) return;
    st.last = { k, by: p.name, at: X.now() };
    if (X.now() < (st.cleanUntil || 0)) return; // the pot is being scrubbed after a splat
    if (!st.dish.items.includes(k) || st.pot.includes(k)) { st.splats++; st.splat = { k, by: p.name, at: X.now() }; st.pot = []; st.cleanUntil = X.now() + 1500; X.sfx('mn-bubble'); X.drip(2, null); return; }
    st.pot.push(k); X.sfx('mn-chomp');
    if (st.dish.items.every((it) => st.pot.includes(it))) { st.served++; X.sfx('mn-bell'); if (st.served >= st.need) { st.done = 'win'; return; } this.order(X, st); }
  },
  tick(X, st, now) { if (!st.done && st.until && now > st.until) { X.drip(2, null); X.sfx('mn-fail'); st.splat = { k: null, by: 'Too slow', at: now }; this.order(X, st); } },
  bot(X, b, st) {
    if (!X.after(b, 'kit', 1.2, 3.2)) return; const mine = st.pantry[b.id] || [];
    const want = mine.filter((k) => st.dish.items.includes(k) && !st.pot.includes(k));
    if (want.length) this.act(X, b, { a: 'throw', k: Math.random() < 0.05 ? pick(mine) : want[0] }, st);
  },
  tv(X, st) {
    return { ui: 'paint', room: 'kitchen', dish: { name: st.dish.name, items: st.dish.items.map((k) => { const f = this.food(k); return { k, l: f[1], e: f[2], in: st.pot.includes(k) }; }) }, served: st.served, need: st.need, until: st.until ? X.wall(st.until) : null,
      splat: st.splat && X.now() - st.splat.at < 1600 ? { ...st.splat, e: st.splat.k ? this.food(st.splat.k)[2] : '⌛' } : null, last: st.last && X.now() - st.last.at < 1200 ? { ...st.last, e: this.food(st.last.k)[2] } : null };
  },
  phone(X, p, st) {
    const mine = (st.pantry[p.id] || []).map((k) => { const f = this.food(k); return { k, l: f[1], e: f[2] }; });
    if (st.poss === p.id) mine.push({ k: 'poison', l: 'Poison (secret)', e: '💀' });
    return { ui: 'paint', room: 'kitchen', mine, dish: st.dish.name, items: st.dish.items.map((k) => { const f = this.food(k); return { l: f[1], e: f[2], in: st.pot.includes(k) }; }), served: st.served, need: st.need };
  },
};

// ================================================================== THE POSSESSED (a twist in some rooms, round two)
// One player's phone secretly says they are possessed, with a way to ruin things. Afterwards everyone votes.
const POSSESS = {
  doll: { power: 'Tap GIGGLE to make the doll spin round early. Two uses.', act(X, p, a, st) { if (a.a === 'giggle' && (st.giggles || 0) < 2 && st.phase === 'green') { st.giggles = (st.giggles || 0) + 1; st.until = Math.min(st.until, X.now() + 250); X.sfx('mn-giggle'); } } },
  hide: { power: 'You can see where everyone hid. Your pebbles are extra loud.' },
  seance: { power: 'Tap JOLT to shove the pointer somewhere random. Two uses.', act(X, p, a, st) { if (a.a === 'jolt' && (st.jolts || 0) < 2) { st.jolts = (st.jolts || 0) + 1; const ang = Math.random() * Math.PI * 2; st.vx += Math.cos(ang) * 3; st.vy += Math.sin(ang) * 3; X.sfx('mn-whisper'); } } },
  kitchen: { power: 'You have a secret Poison. Throw it in the pot to ruin the dish.' },
  fuse: { power: 'Tap SHORT CIRCUIT to black out the electrician\'s screen for 4 seconds. Two uses.' },
};
// hide: the possessed player's pebbles count three times
const hideSearch = HIDE.search;
HIDE.search = function (X, st) { if (st.poss && st.choice[st.poss]?.do === 'pebble') { const at = st.choice[st.poss].at; st.choice.__p1 = { do: 'pebble', at }; } const r = hideSearch.call(this, X, st); delete st.choice.__p1; return r; };
const hidePhone = HIDE.phone;
HIDE.phone = function (X, p, st) { const ph = hidePhone.call(this, X, p, st); if (st.poss === p.id) ph.everyone = Object.entries(st.where).filter(([id]) => id !== p.id).map(([id, k]) => ({ name: nameOf(X, id), k, found: st.found.includes(id) })); return ph; };
[HOLD, SEANCE].forEach((def) => { const a0 = def.act; def.act = function (X, p, a, st) { if (st.poss === p.id && POSSESS[def.key].act && ['giggle', 'jolt'].includes(a.a)) return POSSESS[def.key].act(X, p, a, st); return a0.call(this, X, p, a, st); }; });

const ROOMS2 = { ice: ICE, doll: HOLD, hide: HIDE, seance: SEANCE, lights: LIGHTS, fuse: FUSE, kitchen: KITCHEN };
module.exports = { ROOMS2, MERCY2, BOARD, SPOTS, POSSESS, wireAnswer, leverAnswer };
