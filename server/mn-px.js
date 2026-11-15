'use strict';
// Last Night in the Mansion, the 8-bit house: the hallway you walk around, the rooms behind its doors,
// and the battle with the House itself. Pictures come from the Ninja Adventure pack (CC0, Pixel-boy).
// Every room has a demo (Mortimer's ghost shows you), a practice and three stages.
// A room's make(X, kind) builds one go of it (kind is 'demo', 'practice', 1, 2 or 3). tick() runs it,
// act() takes taps, bot() plays for the bots, tv() and phone() say what the screens show.
const MNB = require('../public/mn-bullets');
let CELLAR = { practice: [], s1: [], s2: [], s3: [] };
try { CELLAR = require('./mn-cellar.json'); } catch (e) { /* levels file missing: the cellar uses its fallback */ }

const DIRS = { u: [0, -1], d: [0, 1], l: [-1, 0], r: [1, 0] };
const DK = Object.keys(DIRS);
const rint = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const shuffle = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const GHOST = { id: 'ghost', name: 'Mortimer', bot: true, mx: {}, color: '#9FE7FF' };
const SOLID = new Set(['#', 'b', 'k', 'p', 'c', 't', 'l', 'r', 'C', 'D', 'x']);

// ------------------------------------------------------------------ grid helpers
const gridOf = (rows) => rows.map((r) => r.split(''));
const W_ = (g) => g[0].length; const H_ = (g) => g.length;
const inb = (g, x, y) => y >= 0 && y < g.length && x >= 0 && x < g[0].length;
const keyOf = (x, y) => `${x},${y}`;
const actors = (st) => Object.entries(st.pl).filter(([, q]) => !q.out);
function bfs(g, from, passable, goal) {
  const q = [[from.x, from.y]]; const prev = new Map([[keyOf(from.x, from.y), null]]);
  while (q.length) {
    const [x, y] = q.shift(); if (goal(x, y)) { const path = []; let k = keyOf(x, y); while (prev.get(k)) { const [d, pk] = prev.get(k); path.unshift(d); k = pk; } return path; }
    for (const d of DK) { const [dx, dy] = DIRS[d]; const nx = x + dx, ny = y + dy; const k = keyOf(nx, ny); if (prev.has(k) || !inb(g, nx, ny) || !passable(nx, ny)) continue; prev.set(k, [d, keyOf(x, y)]); q.push([nx, ny]); }
  }
  return null;
}
// everyone who is in a walking room
function placeAll(X, st, spots, who) {
  st.pl = {}; const list = who || X.seats;
  list.forEach((p, i) => { const s = spots[i % spots.length]; st.pl[p.id] = { x: s[0], y: s[1], dir: 'd', seq: 0, out: false, at: 0 }; });
}
const tvActors = (X, st) => Object.entries(st.pl).map(([id, q]) => { const p = id === 'ghost' ? GHOST : X.P(id); return { id, x: q.x, y: q.y, dir: q.dir, seq: q.seq, out: q.out, slide: q.slide || 0, name: p?.name || '', c: p?.color || '#fff', look: id === 'ghost' ? 8 : Math.max(0, X.seats.indexOf(p)) % 8 }; });
const who = (st, isDemo, X) => (isDemo ? [GHOST] : X.seats);
const pace = (X, p, ms) => { const t = X.now(); if (t - (p.lastMv || 0) < ms) return false; p.lastMv = t; return true; };

// ================================================================== THE ICE HALL (Pokémon ice puzzle)
// Step onto the ice and you slide until something stops you: a rock, a person, or a patch of floor.
// Stand on every red button at the same time to open the gate, then everyone slides out the exit.
function iceSlide(st, id, x, y, d) {
  const [dx, dy] = DIRS[d]; const g = st.g; let n = 0;
  for (;;) {
    const nx = x + dx, ny = y + dy; if (!inb(g, nx, ny)) break; const c = g[ny][nx];
    if (c === '#' || c === 'x' || (c === 'g' && !st.open)) break;
    if (id !== null && actors(st).some(([oid, q]) => oid !== id && q.x === nx && q.y === ny)) break;
    x = nx; y = ny; n++;
    if (c !== '~') break;
  }
  return { x, y, n };
}
function iceDist(g, starts, open, blocked) {
  const st = { g, open, pl: {} }; const dist = new Map(); const q = [];
  for (const [x, y] of starts) { dist.set(keyOf(x, y), 0); q.push([x, y]); }
  while (q.length) { const [x, y] = q.shift(); const d0 = dist.get(keyOf(x, y)); for (const d of DK) { const r = iceSlide(st, null, x, y, d); if (r.n === 0) continue; const k = keyOf(r.x, r.y); if (blocked && blocked.has(k)) continue; if (!dist.has(k)) { dist.set(k, d0 + 1); q.push([r.x, r.y]); } } }
  return dist;
}
function iceMap(W, H, plates, minD, maxD) {
  let best = null;
  for (let t = 0; t < 1500; t++) {
    const ey = rint(1, H - 2); const g = [];
    for (let y = 0; y < H; y++) { const r = []; for (let x = 0; x < W; x++) { if (x === 0) r.push('.'); else if (x === W - 1) r.push(y === ey ? 'E' : '#'); else if (x === W - 2 && y === ey) r.push('g'); else { const v = Math.random(); r.push(v < 0.13 ? '#' : v < 0.16 ? '.' : '~'); } } g.push(r); }
    const cells = []; for (let y = 0; y < H; y++) for (let x = 2; x < W - 2; x++) if (g[y][x] === '~') cells.push([x, y]);
    const ps = shuffle(cells).filter((c, i, a) => a.slice(0, i).every((o) => Math.abs(o[0] - c[0]) + Math.abs(o[1] - c[1]) > 2)).slice(0, plates);
    if (ps.length < plates) continue;
    ps.forEach(([x, y]) => { g[y][x] = 'o'; });
    const starts = []; for (let y = 0; y < H; y++) starts.push([0, y]);
    const d1 = iceDist(g, starts, false);
    const ds = ps.map(([x, y]) => d1.get(keyOf(x, y)));
    if (ds.some((d) => d == null || d < minD || d > maxD)) continue;
    // with the gate open, every button can reach the gate square, and so can the start
    const gate = keyOf(W - 2, ey); let ok = true; let gd = 0;
    for (const s of [...ps, [0, ey]]) { const d2 = iceDist(g, [s], true); if (!d2.has(gate)) { ok = false; break; } gd = Math.max(gd, d2.get(gate)); }
    if (!ok || gd < 2) continue;
    const score = ds.reduce((a, b) => a + b, 0) + gd;
    if (!best || score > best.score) best = { g, score, plates: ps, ey };
    if (t > 80 && best) break;
  }
  return best;
}
const ICE = {
  key: 'ice', name: 'The Ice Hall', style: 'poke', music: 'px-ice', theme: 'ice',
  how: 'Ice is slippery: you slide until you hit something. Stand on every red button at once to open the gate, then everyone out.',
  secs: { demo: 40, practice: 60, 1: 80, 2: 100, 3: 120 },
  make(X, kind) {
    const n = kind === 'demo' ? 1 : X.n;
    const spec = kind === 'demo' || kind === 'practice' ? [10, 6, 1, 2, 5] : kind === 1 ? [16, 9, 1, 3, 7] : kind === 2 ? [17, 10, Math.min(2, n), 4, 8] : [18, 10, Math.min(3, n), 4, 9];
    const m = iceMap(spec[0], spec[1], spec[2], spec[3], spec[4]);
    const st = { kind, g: m.g, plates: m.plates, ey: m.ey, open: false, pl: {}, held: 0 };
    const spots = []; for (let y = 0; y < spec[1]; y++) spots.push([0, y]);
    placeAll(X, st, shuffle(spots), who(st, kind === 'demo', X));
    st.start = Object.fromEntries(Object.entries(st.pl).map(([id, q]) => [id, [q.x, q.y]]));
    return st;
  },
  move(X, st, id, d) {
    const q = st.pl[id]; if (!q || q.out) return;
    if (X.now() < (q.busy || 0)) return;
    const r = iceSlide(st, id, q.x, q.y, d); q.dir = d; if (r.n === 0) { X.sfx('px-bump'); return; }
    q.x = r.x; q.y = r.y; q.seq++; q.slide = r.n; q.busy = X.now() + Math.min(900, 90 + r.n * 70);
    X.sfx(r.n > 1 ? 'px-slide' : 'px-step');
    if (st.g[q.y][q.x] === 'E') { q.out = true; X.sfx('px-coin'); }
    this.check(X, st);
  },
  check(X, st) {
    const on = st.plates.filter(([x, y]) => actors(st).some(([, q]) => q.x === x && q.y === y)).length; st.held = on;
    if (!st.open && on === st.plates.length) { st.open = true; X.sfx('px-plate'); X.sfx('px-secret'); }
    if (Object.values(st.pl).every((q) => q.out)) st.done = 'win';
  },
  act(X, p, a, st) {
    if (a.a === 'mv' && DIRS[a.d]) this.move(X, st, p.id, a.d);
    if (a.a === 'reset') { const q = st.pl[p.id]; const s = st.start[p.id]; if (q && !q.out && s && !actors(st).some(([id, o]) => id !== p.id && o.x === s[0] && o.y === s[1])) { q.x = s[0]; q.y = s[1]; q.seq++; q.slide = 0; X.sfx('px-spirit'); this.check(X, st); } }
  },
  tick() {},
  bot(X, b, st) {
    const q = st.pl[b.id]; if (!q || q.out || X.now() < (q.busy || 0)) return;
    if (!X.after(b, 'ice', 0.5, 1.3)) return;
    const others = new Set(actors(st).filter(([id]) => id !== b.id).map(([, o]) => keyOf(o.x, o.y)));
    let goal;
    if (st.open) goal = (x, y) => st.g[y][x] === 'E';
    else {
      // go and hold a button nobody is standing on or heading for
      const free = st.plates.filter(([x, y]) => !others.has(keyOf(x, y)));
      const mine = st.plates.find(([x, y]) => q.x === x && q.y === y); if (mine) return;
      const claimed = new Set(Object.values(st.pl).map((o) => o.aim).filter(Boolean));
      const target = free.find(([x, y]) => !claimed.has(keyOf(x, y)) || q.aim === keyOf(x, y));
      if (!target) return; q.aim = keyOf(target[0], target[1]); goal = (x, y) => x === target[0] && y === target[1];
    }
    const path = this.plan(st, b.id, q, goal);
    if (path && path.length) this.move(X, st, b.id, path[0]);
    else if (Math.random() < 0.3) this.move(X, st, b.id, pick(DK));
  },
  plan(st, id, q, goal) {
    const prev = new Map([[keyOf(q.x, q.y), null]]); const que = [[q.x, q.y]];
    while (que.length) {
      const [x, y] = que.shift(); if (goal(x, y)) { const path = []; let k = keyOf(x, y); while (prev.get(k)) { const [d, pk] = prev.get(k); path.unshift(d); k = pk; } return path; }
      for (const d of DK) { const r = iceSlide(st, id, x, y, d); if (!r.n) continue; const k = keyOf(r.x, r.y); if (prev.has(k)) continue; prev.set(k, [d, keyOf(x, y)]); que.push([r.x, r.y]); }
    }
    return null;
  },
  tv(X, st) { return { map: st.g.map((r) => r.join('')), theme: 'ice', open: st.open, plates: st.plates, held: st.held, actors: tvActors(X, st), info: `${st.held} of ${st.plates.length} buttons held${st.open ? '. Gate open: everyone to the stairs!' : ''}` }; },
  phone(X, p, st) {
    const q = st.pl[p.id]; if (!q) return { pad: false, text: 'Watch the TV.' };
    if (q.out) return { pad: false, big: 'You made it out!', text: 'Shout directions at the others.' };
    return { pad: true, btns: [['reset', 'Back to start']], text: st.open ? 'The gate is open. Slide to the stairs!' : `Find a way onto a red button. ${st.held} of ${st.plates.length} held.` };
  },
};

// ================================================================== THE BOULDER CELLAR (Pokémon strength puzzle)
// Push the boulders onto the red buttons. Heavy stone blocks need two of you, one behind the other.
const CELLAR_FALLBACK = { rows: ['S.....#####', 'S..B..#...#', 'S.....o...g', 'S.........#', '#####.....#'], sol: null };
function cellarLevel(kind) {
  const tier = kind === 'demo' || kind === 'practice' ? 'practice' : `s${kind}`;
  const list = CELLAR[tier] && CELLAR[tier].length ? CELLAR[tier] : [CELLAR_FALLBACK];
  return pick(list);
}
const CELLAR_ROOM = {
  key: 'cellar', name: 'The Wine Cellar', style: 'poke', music: 'px-cellar', theme: 'cellar',
  how: 'Push every crate onto a red button to open the gate. Grey iron crates are heavy: two of you push, one behind the other.',
  secs: { demo: 45, practice: 60, 1: 110, 2: 140, 3: 160 },
  make(X, kind) {
    const L = cellarLevel(kind); const g = gridOf(L.rows); const w = W_(g);
    const crates = []; const plates = []; const spots = [];
    g.forEach((r, y) => r.forEach((c, x) => { if (c === 'B' || c === 'H') { crates.push({ x, y, heavy: c === 'H', home: [x, y] }); r[x] = '.'; } if (c === 'o') plates.push([x, y]); if (c === 'S') { spots.push([x, y]); r[x] = '.'; } }));
    let gate = null; g.forEach((r, y) => r.forEach((c, x) => { if (c === 'g') gate = [x, y]; }));
    // the exit sits just outside the gate
    const st = { kind, g, w, crates, plates, gate, open: false, held: 0, pl: {}, sol: L.sol ? L.sol.slice() : null, solAt: 0, resets: 0 };
    placeAll(X, st, spots, who(st, kind === 'demo', X));
    return st;
  },
  crateAt(st, x, y) { return st.crates.find((c) => c.x === x && c.y === y); },
  solid(st, x, y) { if (!inb(st.g, x, y)) return true; const c = st.g[y][x]; return SOLID.has(c) || (c === 'g' && !st.open); },
  move(X, st, id, d) {
    const q = st.pl[id]; if (!q || q.out) return false; const [dx, dy] = DIRS[d]; q.dir = d; q.push = { d, at: X.now() };
    const nx = q.x + dx, ny = q.y + dy;
    if (st.gate && st.open && nx === st.gate[0] + 1 && ny === st.gate[1]) { q.out = true; q.x = nx; q.y = ny; q.seq++; X.sfx('px-coin'); this.check(X, st); return true; }
    if (this.solid(st, nx, ny)) { X.sfx('px-bump'); return false; }
    const c = this.crateAt(st, nx, ny);
    if (c) {
      const tx = nx + dx, ty = ny + dy;
      if (this.solid(st, tx, ty) || this.crateAt(st, tx, ty) || (st.gate && tx === st.gate[0] && ty === st.gate[1])) { X.sfx('px-bump'); return false; }
      if (c.heavy) {
        // somebody has to be right behind you, pushing the same way
        const bx = q.x - dx, by = q.y - dy;
        const helper = actors(st).find(([oid, o]) => oid !== id && o.x === bx && o.y === by);
        const helperIsBot = helper && (helper[0] === 'ghost' || X.P(helper[0])?.bot);
        if (!helper || (!helperIsBot && !(helper[1].push && helper[1].push.d === d && X.now() - helper[1].push.at < 900))) { q.strain = X.now(); X.sfx('px-bump'); return false; }
        const h = helper[1]; h.x += dx; h.y += dy; h.seq++; h.dir = d;
      }
      c.x = tx; c.y = ty; X.sfx('px-push');
    }
    q.x = nx; q.y = ny; q.seq++; X.sfx('px-step');
    this.check(X, st); return true;
  },
  check(X, st) {
    const on = st.plates.filter(([x, y]) => this.crateAt(st, x, y)).length; st.held = on;
    if (!st.open && on === st.plates.length) { st.open = true; X.sfx('px-plate'); X.sfx('px-secret'); }
    if (Object.values(st.pl).every((q) => q.out)) st.done = 'win';
  },
  reset(X, st) {
    if (X.now() - (st.lastReset || -1e9) < 3000) return; st.lastReset = X.now(); st.resets++;
    st.crates.forEach((c) => { c.x = c.home[0]; c.y = c.home[1]; }); st.open = false; st.solAt = 0; st.held = 0;
    actors(st).forEach(([, q]) => { if (this.crateAt(st, q.x, q.y)) { q.x = 0; q.y = Math.max(0, Math.min(H_(st.g) - 1, q.y)); } });
    if (st.kind !== 'demo' && st.kind !== 'practice') X.drip(2, 'crates reset');
    X.sfx('px-spirit');
  },
  act(X, p, a, st) {
    if (a.a === 'mv' && DIRS[a.d] && pace(X, p, 120)) this.move(X, st, p.id, a.d);
    if (a.a === 'reset') this.reset(X, st);
  },
  tick() {},
  // bots follow the worked-out answer, but only while the boulders are where the answer expects
  bot(X, b, st) {
    const q = st.pl[b.id]; if (!q || q.out) return;
    if (!X.after(b, 'cel', 0.18, 0.35)) return;
    const humans = X.seats.some((p) => !p.bot && p.connected) && st.kind !== 'demo';
    if (st.open) { const gx = st.gate[0], gy = st.gate[1]; const path = bfs(st.g, q, (x, y) => !this.solid(st, x, y) && !this.crateAt(st, x, y), (x, y) => x === gx && y === gy); if (path && path.length) this.move(X, st, b.id, path[0]); else if (q.x === gx && q.y === gy) this.move(X, st, b.id, 'r'); return; }
    if (!st.sol || st.solAt >= st.sol.length) return;
    // with people playing, bots wait a while before helping
    if (humans && X.now() - st.t0 < 50000) return;
    const leader = actors(st).filter(([id]) => id === 'ghost' || X.P(id)?.bot).map(([id]) => id)[0];
    const [stand, dir] = st.sol[st.solAt]; const sx = stand % st.w, sy = Math.floor(stand / st.w); const [dx, dy] = DIRS[dir];
    const crate = this.crateAt(st, sx + dx, sy + dy); if (!crate) return; // someone moved things: no more help
    if (b.id !== leader) {
      // the helper: stand behind the leader when a heavy block is next
      if (!crate.heavy) return; const L = st.pl[leader]; if (!L || L.x !== sx || L.y !== sy) return;
      const hx = sx - dx, hy = sy - dy; if (q.x === hx && q.y === hy) return;
      const path = bfs(st.g, q, (x, y) => !this.solid(st, x, y) && !this.crateAt(st, x, y), (x, y) => x === hx && y === hy); if (path && path.length) this.move(X, st, b.id, path[0]); return;
    }
    if (q.x === sx && q.y === sy) {
      if (crate.heavy && !actors(st).some(([id, o]) => id !== b.id && o.x === sx - dx && o.y === sy - dy)) return;
      if (this.move(X, st, b.id, dir)) st.solAt++; return;
    }
    const path = bfs(st.g, q, (x, y) => !this.solid(st, x, y) && !this.crateAt(st, x, y), (x, y) => x === sx && y === sy);
    if (path && path.length) this.move(X, st, b.id, path[0]);
  },
  tv(X, st) { return { map: st.g.map((r) => r.join('')), theme: 'cellar', open: st.open, plates: st.plates, crates: st.crates.map((c) => ({ x: c.x, y: c.y, h: c.heavy })), gate: st.gate, held: st.held, actors: tvActors(X, st), info: `${st.held || 0} of ${st.plates.length} buttons covered${st.open ? '. Gate open: everyone out!' : ''}` }; },
  phone(X, p, st) {
    const q = st.pl[p.id]; if (!q) return { pad: false, text: 'Watch the TV.' };
    if (q.out) return { pad: false, big: 'You made it out!', text: 'Help the others from here.' };
    const strain = q.strain && X.now() - q.strain < 1500;
    return { pad: true, btns: [['reset', 'Reset the crates']], text: strain ? 'Too heavy! Someone stand right behind you and push the same way.' : st.open ? 'The gate is open. Walk out!' : `Push crates onto the red buttons. ${st.held || 0} of ${st.plates.length} done. Stuck? Reset them.` };
  },
};

// ================================================================== GHOST BATTLES (Undertale style)
// Shared bits: hearts in a box, bullets from a seed, the phones play their own heart and report hits.
function battleFresh(X, st, list) {
  st.hearts = {}; list.forEach((p, i) => { st.hearts[p.id] = { x: 50 + (i - (list.length - 1) / 2) * 7, y: 46, moving: false, hits: 0, inv: 0 }; });
}
function startWave(X, st, set, L, secs) {
  st.wave = { seed: rint(1, 1e9), set, L, secs, t0: X.now() + 600 }; st.bullets = MNB.wave(st.wave.seed, set, L, secs);
  Object.values(st.hearts).forEach((h, i) => { h.x = 50 + (i - (Object.keys(st.hearts).length - 1) / 2) * 7; h.y = 46; h.inv = 0; });
}
function waveTime(X, st) { return st.wave ? (X.now() - st.wave.t0) / 1000 : -1; }
function waveOver(X, st) { return st.wave && waveTime(X, st) >= st.wave.secs; }
function heartHit(X, st, id, practice) {
  const h = st.hearts[id]; if (!h || X.now() < h.inv) return; h.inv = X.now() + 1100; h.hits++; st.teamHits = (st.teamHits || 0) + 1;
  X.sfx('px-hurt'); const p = X.P(id);
  if (!practice) X.drip(p && p.bot ? 0.5 : 0.9, null);
}
function botHearts(X, st, practice, dtMs) {
  const t = waveTime(X, st); if (t < 0 || !st.bullets) return;
  for (const [id, h] of Object.entries(st.hearts)) {
    const p = id === 'ghost' ? GHOST : X.P(id); if (!p || !(p.bot || !p.connected)) continue;
    for (let s = 0; s < 4; s++) { const tt = t - (dtMs / 1000) * (1 - s / 4); const m = MNB.botMove(st.bullets, tt, h, dtMs / 4000, id === 'ghost' ? 0.99 : 0.93); h.x = m.x; h.y = m.y; h.moving = m.moving; if (tt > 0 && MNB.hit(st.bullets, tt, h.x, h.y, h.moving)) heartHit(X, st, id, practice); }
  }
}
const heartsPub = (X, st) => Object.entries(st.hearts || {}).map(([id, h]) => { const p = id === 'ghost' ? GHOST : X.P(id); return { id, x: Math.round(h.x * 10) / 10, y: Math.round(h.y * 10) / 10, c: p?.color || '#f33', name: p?.name || '', hits: h.hits, inv: h.inv > X.now() }; });
const wavePub = (X, st) => (st.wave ? { seed: st.wave.seed, set: st.wave.set, L: st.wave.L, secs: st.wave.secs, t0: X.wall(st.wave.t0) } : null);
function battleAct(X, st, p, a, practice) {
  const h = st.hearts && st.hearts[p.id]; if (!h) return;
  if (a.a === 'pos') { h.x = MNB.clampX(Number(a.x) || 0); h.y = MNB.clampY(Number(a.y) || 0); h.moving = !!a.m; }
  if (a.a === 'hit' && st.wave && waveTime(X, st) > 0 && !waveOver(X, st)) heartHit(X, st, p.id, practice);
}

// ------------------------------------------------------------------ THE STORM ROOM (pure dodging)
const DODGE = {
  key: 'dodge', name: 'The Storm Room', style: 'tale', music: 'px-dodge', foe: 'Flam2', foeName: 'The Storm Ghosts',
  how: 'Drag on your phone to move your heart. Dodge everything white. Blue bars: stand still. Orange bars: keep moving.',
  secs: { demo: 30, practice: 30, 1: 40, 2: 44, 3: 50 },
  plan: { demo: [['rain', 'bones'], 0, 14], practice: [['rain', 'sides', 'bones'], 0, 16], 1: [['rain', 'sides', 'zig', 'bones'], 1, 20], 2: [['walls', 'ring', 'bones', 'zig'], 2, 24], 3: [['walls', 'ring', 'spiral', 'bones', 'sides'], 3, 28] },
  make(X, kind) {
    const st = { kind, practice: kind === 'demo' || kind === 'practice', teamHits: 0 }; battleFresh(X, st, who(st, kind === 'demo', X));
    const [set, L, secs] = this.plan[kind]; st.limit = kind === 'demo' ? 99 : kind === 'practice' ? 99 : Math.max(4, Math.round(X.n * (kind === 3 ? 2.2 : 2) + 2));
    startWave(X, st, set, L + (X.n >= 6 && kind === 3 ? 1 : 0), secs); return st;
  },
  act(X, p, a, st) { battleAct(X, st, p, a, st.practice); },
  tick(X, st, now, dt) {
    botHearts(X, st, st.practice, dt);
    if (st.done) return;
    if (st.teamHits > st.limit) { st.done = 'fail'; return; }
    if (waveOver(X, st)) st.done = 'win';
  },
  bot() {},
  tv(X, st) { return { battle: true, foe: this.foe, foeName: this.foeName, wave: wavePub(X, st), hearts: heartsPub(X, st), hits: st.teamHits, limit: st.limit < 99 ? st.limit : null, text: st.practice ? '* Practice. Nothing here can hurt the candle.' : `* The storm howls. Survive it together. Team hits ${st.teamHits} of ${st.limit}.` }; },
  phone(X, p, st) { return { battle: true, wave: wavePub(X, st), me: st.hearts[p.id] ? p.id : null, hearts: heartsPub(X, st), text: 'Drag anywhere below to move your heart.' }; },
};

// ------------------------------------------------------------------ THE PARLOUR GHOSTS (talk them down, Undertale ACT)
const GHOSTS = [
  { name: 'Lady Lantern', foe: 'LanternRed', hello: 'Lady Lantern blocks the doorway, glowing proudly.', steps: [
    ['Admire her glow', 'Lady Lantern is terribly proud of her glow. Admire it first.'],
    ['Ask about the ball', 'Once she is flattered, she wants to talk about the ball she never went to.'],
    ['Ask her to dance', 'After the ball comes up, she is desperate to dance. Ask her.'],
    ['Promise to visit', 'She will only rest once somebody promises to come back and visit her.']] },
  { name: 'Sir Rattles', foe: 'SkullBlue', hello: 'Sir Rattles clatters in, grinning. He always grins.', steps: [
    ['Laugh at his joke', 'Sir Rattles tells a terrible joke. Laugh at it, or else.'],
    ['Tell a joke back', 'After you laugh, he wants a joke back. Any joke. He is not fussy.'],
    ['Compliment his teeth', 'Then he wants his teeth complimented. He has all of them. Mostly.'],
    ['Shake his hand', 'Finish by shaking his hand. Gently. It comes off.']] },
  { name: 'The Flicker', foe: 'Flam2', hello: 'A tiny ghost flame trembles in the corner.', steps: [
    ['Speak softly', 'The Flicker is very shy. Speak softly first, or it hides.'],
    ['Block the draught', 'Next, block the draught from the window. It is scared of going out.'],
    ['Hum a lullaby', 'Once it is warm, hum it a lullaby.'],
    ['Say goodnight', 'Last of all, say goodnight. It has not heard that in a hundred years.']] },
  { name: 'Old Greenwick', foe: 'LanternGreen', hello: 'Old Greenwick the gardener scowls at your shoes.', steps: [
    ['Wipe your feet', 'Greenwick hates mud. Wipe your feet before anything else.'],
    ['Ask about his roses', 'Then ask about his roses. He grew them for Lady Ada.'],
    ['Pull a weed', 'After the roses, pull a weed to show you care.'],
    ['Thank him', 'Finally, thank him for his work. Nobody ever did.']] },
  { name: 'Bartholomew', foe: 'BlueBat', hello: 'Bartholomew the bat is hanging from the chandelier, upside down.', steps: [
    ['Hang upside down', 'Bartholomew only talks to people who hang upside down. Try it.'],
    ['Dim the lights', 'Then dim the lights. He has very sensitive eyes.'],
    ['Squeak politely', 'Once it is dark, squeak politely. That is bat for hello.'],
    ['Open the window', 'He wants to fly home. Open the window for him last.']] },
  { name: "Cook's Ghost", foe: 'Flam', hello: "Cook's ghost is stirring an empty pot. Furiously.", steps: [
    ['Taste the soup', 'Cook wants her soup tasted first. There is no soup. Taste it anyway.'],
    ['Ask for the recipe', 'After tasting, ask for her recipe. She will be thrilled.'],
    ['Wash the dishes', 'Then wash the dishes. She cannot stand a messy kitchen.'],
    ['Hang up her apron', 'At last, hang up her apron. Her shift has been very long.']] },
];
function menuVote(X, st, opts) {
  // the most chosen action wins; a tie goes to whichever was picked first
  const tally = {}; Object.values(st.votes).forEach((v) => { tally[v.k] = (tally[v.k] || 0) + 1; });
  let bestK = null; let bestN = 0; for (const v of Object.values(st.votes).sort((a, b) => a.at - b.at)) if ((tally[v.k] || 0) > bestN) { bestN = tally[v.k]; bestK = v.k; }
  return bestK;
}
const CHAT = {
  key: 'chat', name: 'The Parlour Ghosts', style: 'tale', music: 'px-chat',
  how: 'Each of you has a secret clue about what the ghost wants. Talk, then pick the right ACT together. When it is happy, choose MERCY.',
  secs: { demo: 50, practice: 70, 1: 90, 2: 110, 3: 140 },
  make(X, kind) {
    const st = { kind, practice: kind === 'demo' || kind === 'practice', turn: 0, phase: 'menu', votes: {}, log: [], teamHits: 0 };
    const used = X.R.used || (X.R.used = []); const pool = GHOSTS.filter((gh) => !used.includes(gh.name)); const gh = pick(pool.length ? pool : GHOSTS); used.push(gh.name);
    const steps = kind === 'demo' || kind === 'practice' ? 2 : kind === 1 ? 2 : kind === 2 ? 3 : 4;
    st.gh = gh; st.steps = gh.steps.slice(0, steps); st.done_ = 0;
    const others = shuffle(GHOSTS.filter((o) => o !== gh).flatMap((o) => o.steps.map((s) => s[0]))).slice(0, Math.max(2, 6 - steps));
    st.opts = shuffle([...st.steps.map((s) => s[0]), ...others]);
    const list = who(st, kind === 'demo', X); battleFresh(X, st, list);
    // hand the clues out: every step to somebody, people get more than one when there are few of you
    st.clues = {}; const cast = shuffle(list.map((p) => p.id)); st.steps.forEach((s, i) => { const id = cast[i % cast.length]; (st.clues[id] = st.clues[id] || []).push(i); });
    st.maxTurns = st.steps.length + 4; st.text = `* ${gh.hello}`;
    this.menu(X, st); return st;
  },
  menu(X, st) { st.phase = 'menu'; st.votes = {}; st.until = X.now() + (st.kind === 'demo' ? 9000 : 15000); st.wave = null; st.bullets = null; },
  spareable(st) { return st.done_ >= st.steps.length; },
  resolve(X, st) {
    st.turn++; const k = menuVote(X, st) || 'nothing'; const gh = st.gh; let mood = 'bad';
    if (k === 'MERCY') { if (this.spareable(st)) { st.text = `* You spared ${gh.name}. It fades away, smiling.`; X.sfx('px-levelup'); st.phase = 'spared'; st.until = X.now() + 3500; return; } st.text = `* ${gh.name} is not ready to be spared yet.`; }
    else if (k === 'FIGHT') st.text = `* You swing at ${gh.name}. Your hand goes straight through. It is offended.`;
    else if (k === 'nothing') st.text = '* Nobody did anything. The ghost is bored.';
    else if (this.spareable(st)) st.text = `* ${gh.name} is already happy. Choose MERCY!`;
    else if (k === st.steps[st.done_][0]) { st.done_++; mood = 'good'; st.text = `* You ${k.toLowerCase()}. ${gh.name} seems pleased.${this.spareable(st) ? ` ${gh.name} could be spared now.` : ''}`; X.sfx('px-ok'); }
    else st.text = `* You ${k.toLowerCase()}. ${gh.name} does not like that one bit.`;
    if (mood === 'bad') X.sfx('px-no');
    st.chosen = k; st.phase = 'attack';
    const L = mood === 'good' ? 0 : st.kind === 3 ? 2 : 1;
    startWave(X, st, mood === 'good' ? ['rain', 'sides'] : ['walls', 'zig', 'ring', 'bones'], st.practice ? 0 : L, mood === 'good' ? 5 : 7);
  },
  act(X, p, a, st) {
    if (a.a === 'pick' && st.phase === 'menu' && typeof a.k === 'string') { const ok = ['FIGHT', 'MERCY', ...st.opts].includes(a.k); if (ok) { st.votes[p.id] = { k: a.k, at: X.now() }; X.sfx('px-select'); } }
    else battleAct(X, st, p, a, st.practice);
  },
  tick(X, st, now, dt) {
    if (st.phase === 'attack') { botHearts(X, st, st.practice, dt); if (waveOver(X, st)) { if (st.turn >= st.maxTurns && !this.spareable(st)) { st.done = 'fail'; st.text = `* ${st.gh.name} got bored and drifted off with the key.`; return; } this.menu(X, st); } return; }
    if (st.phase === 'spared') { if (now > st.until) st.done = 'win'; return; }
    if (st.phase === 'menu') {
      const voters = Object.keys(st.hearts); const all = voters.every((id) => st.votes[id] || (id !== 'ghost' && !X.P(id)?.connected));
      if (all || now > st.until) this.resolve(X, st);
    }
  },
  bot(X, b, st) {
    if (st.phase !== 'menu' || st.votes[b.id]) return; if (!X.after(b, 'chat', 1.5, 5)) return;
    // bots know their own clue, and follow whoever voted first otherwise
    const want = this.spareable(st) ? 'MERCY' : st.steps[st.done_][0];
    const mine = (st.clues[b.id] || []).includes(st.done_);
    const first = Object.values(st.votes).sort((a, c) => a.at - c.at)[0];
    const k = mine || this.spareable(st) ? want : first ? first.k : Math.random() < 0.5 ? want : pick(st.opts);
    st.votes[b.id] = { k, at: X.now() };
  },
  tv(X, st) {
    const tally = {}; Object.values(st.votes).forEach((v) => { tally[v.k] = (tally[v.k] || 0) + 1; });
    const said = Object.entries(st.clues).filter(([id]) => id === 'ghost' || X.P(id)?.bot).flatMap(([id, list]) => list.filter((i) => i >= st.done_).map((i) => ({ name: id === 'ghost' ? 'Mortimer' : X.P(id).name, text: st.steps[i][1] })));
    return { battle: true, said, foe: st.gh.foe, foeName: st.gh.name, yellow: this.spareable(st), phase: st.phase, until: X.wall(st.until), text: st.text, progress: [st.done_, st.steps.length], turn: st.turn, maxTurns: st.maxTurns, voted: Object.keys(st.votes), tally: st.phase === 'menu' ? null : tally, chosen: st.chosen, wave: st.phase === 'attack' ? wavePub(X, st) : null, hearts: heartsPub(X, st) };
  },
  phone(X, p, st) {
    const clues = (st.clues[p.id] || []).map((i) => ({ n: i + 1, text: st.steps[i][1] }));
    return { battle: true, menu: st.phase === 'menu', phase: st.phase, opts: st.opts, mine: st.votes[p.id]?.k || null, yellow: this.spareable(st), clues, until: X.wall(st.until), progress: [st.done_, st.steps.length], wave: st.phase === 'attack' ? wavePub(X, st) : null, me: st.hearts[p.id] ? p.id : null, hearts: heartsPub(X, st), text: st.text };
  },
};

// ================================================================== MORTIMER'S MERCY (a gentle room when the candle is low)
const MERCY = {
  key: 'mercy', name: "Mortimer's Mercy", style: 'poke', music: 'px-mercy', theme: 'mercy',
  how: 'Walk into the dark candle stands to light them. Every one gives your candle back a little.',
  secs: { 1: 35 },
  make(X) {
    const rows = ['.............', '.k.........k.', '.............', '..l.......l..', '.............', '.k.........k.', '.............'];
    const g = gridOf(rows); const spots = [[6, 3], [5, 3], [7, 3], [6, 2], [6, 4], [5, 2], [7, 4], [5, 4]];
    const stands = shuffle([[0, 0], [12, 0], [0, 6], [12, 6], [3, 1], [9, 5], [6, 0], [6, 6], [2, 5], [10, 1]]).slice(0, 8).map(([x, y]) => ({ x, y, lit: false }));
    stands.forEach((s) => { g[s.y][s.x] = 'O'; });
    const st = { kind: 1, g, stands, pl: {}, gained: 0, ghosts: [{ x: 3, y: 3 }, { x: 9, y: 3 }] }; placeAll(X, st, spots); return st;
  },
  act(X, p, a, st) {
    if (a.a !== 'mv' || !DIRS[a.d] || !pace(X, p, 110)) return; const q = st.pl[p.id]; const [dx, dy] = DIRS[a.d]; q.dir = a.d;
    const nx = q.x + dx, ny = q.y + dy; if (!inb(st.g, nx, ny)) return;
    const s = st.stands.find((o) => o.x === nx && o.y === ny); if (s) { if (!s.lit) { s.lit = true; X.gain(3); st.gained += 3; X.sfx('px-heal'); if (st.stands.every((o) => o.lit)) st.done = 'win'; } return; }
    if (SOLID.has(st.g[ny][nx])) return; q.x = nx; q.y = ny; q.seq++;
  },
  tick(X, st) { if (Math.random() < 0.08) st.ghosts.forEach((gh) => { const d = pick(DK); const [dx, dy] = DIRS[d]; if (inb(st.g, gh.x + dx, gh.y + dy) && st.g[gh.y + dy][gh.x + dx] === '.') { gh.x += dx; gh.y += dy; } }); },
  bot(X, b, st) {
    const q = st.pl[b.id]; if (!X.after(b, 'mercy', 0.25, 0.5)) return;
    const s = st.stands.filter((o) => !o.lit).sort((a, c) => Math.abs(a.x - q.x) + Math.abs(a.y - q.y) - Math.abs(c.x - q.x) - Math.abs(c.y - q.y))[0]; if (!s) return;
    const path = bfs(st.g, q, (x, y) => (x === s.x && y === s.y) || st.g[y][x] === '.', (x, y) => x === s.x && y === s.y);
    if (path && path.length) this.act(X, b, { a: 'mv', d: path[0] }, st);
  },
  tv(X, st) { return { map: st.g.map((r) => r.join('')), theme: 'mercy', stands: st.stands, ghosts: st.ghosts, actors: tvActors(X, st), info: `${st.stands.filter((s) => s.lit).length} of ${st.stands.length} candles lit. Candle +${st.gained}%` }; },
  phone(X, p, st) { return { pad: true, text: 'Walk into the dark candle stands to light them.' }; },
};

// ================================================================== THE HALLWAY (walk to a door)
// Doors along the top. Stand in front of one with most of your group to go in.
const HUB_ROWS = [
  '........................',
  '........................',
  '..b..............b......',
  '......::::::::::::......',
  '..l...::::::::::::...l..',
  '......::::::::::::......',
  'k.....::::::::::::.....k',
  '......::::::::::::......',
  '..t...::::::::::::...p..',
  '......::::::::::::......',
  'C.....................D.',
  '........................',
];
const HUB_DOORS = [
  { key: 'mercy', x: 1, label: 'Mercy' },
  { key: 'ice', x: 4, label: 'Ice Hall' },
  { key: 'cellar', x: 8, label: 'Cellar' },
  { key: 'front', x: 12, label: 'Front Door' },
  { key: 'dodge', x: 16, label: 'Storm Room' },
  { key: 'chat', x: 20, label: 'Parlour' },
];
const SECRET_SPOTS = [[1, 4], [22, 2], [0, 11], [23, 11], [3, 9], [20, 9], [7, 1], [17, 1], [11, 11], [14, 11]];
const HUB = {
  key: 'hub', name: 'The Hallway', style: 'poke', music: 'px-hub', theme: 'hub',
  make(X, ctx) {
    const g = gridOf(HUB_ROWS); const spots = []; for (let i = 0; i < 8; i++) spots.push([9 + (i % 4) * 2, 10 + Math.floor(i / 4)]);
    const st = { kind: 'hub', g, pl: {}, ctx, zone: null, countFrom: 0, chosen: null, found: [], msg: null, ghosts: [{ x: 3, y: 6 }, { x: 19, y: 4 }] };
    st.secrets = ctx.secrets; placeAll(X, st, spots); return st;
  },
  doorOpen(st, d) { const c = st.ctx; if (d.key === 'front') return c.left === 0; if (d.key === 'mercy') return c.mercy; return c.todo.includes(d.key); },
  zoneOf(st, q) { for (const d of HUB_DOORS) if (q.y <= 1 && Math.abs(q.x - d.x) <= 1 && this.doorOpen(st, d)) return d.key; return null; },
  act(X, p, a, st) {
    if (a.a !== 'mv' || !DIRS[a.d] || !pace(X, p, 105)) return; const q = st.pl[p.id]; if (!q) return; const [dx, dy] = DIRS[a.d]; q.dir = a.d;
    const nx = q.x + dx, ny = q.y + dy; if (!inb(st.g, nx, ny) || SOLID.has(st.g[ny][nx])) { if (ny < 0) X.sfx('px-bump'); return; }
    q.x = nx; q.y = ny; q.seq++;
    const s = st.secrets.find((o) => !o.found && o.x === nx && o.y === ny);
    if (s) { s.found = true; st.msg = { text: s.text, at: X.now(), by: p.name }; X.sfx('px-secret'); if (s.kind === 'wax') X.gain(5); if (s.kind === 'stub') st.ctx.stubs++; }
  },
  tick(X, st, now) {
    if (st.chosen) return;
    if (Math.random() < 0.05) st.ghosts.forEach((gh) => { const d = pick(DK); const [dx, dy] = DIRS[d]; if (inb(st.g, gh.x + dx, gh.y + dy) && gh.y + dy > 1) { gh.x += dx; gh.y += dy; } });
    // which door has most people in front of it
    const counts = {}; const people = X.seats.filter((p) => p.connected || p.bot);
    for (const p of people) { const q = st.pl[p.id]; if (!q) continue; const z = this.zoneOf(st, q); if (z) counts[z] = (counts[z] || 0) + 1; }
    const humans = people.filter((p) => !p.bot); const need = Math.max(1, Math.ceil((humans.length || people.length) / 2));
    const humCount = (z) => (humans.length ? humans.filter((p) => this.zoneOf(st, st.pl[p.id] || {}) === z).length : counts[z] || 0);
    const z = Object.keys(counts).sort((a, b) => humCount(b) - humCount(a))[0];
    if (z && humCount(z) >= need) { if (st.zone !== z) { st.zone = z; st.countFrom = now; X.sfx('px-select'); } if (now - st.countFrom > 2500) { st.chosen = z; X.sfx('px-ok'); } }
    else st.zone = null;
  },
  // bots drift towards whatever door the humans are at, or a random open one
  bot(X, b, st) {
    const q = st.pl[b.id]; if (!q || st.chosen) return; if (!X.after(b, 'hub', 0.2, 0.45)) return;
    if (!q.aim || Math.random() < 0.01) { const humansAt = X.seats.filter((p) => !p.bot && st.pl[p.id]).map((p) => this.zoneOf(st, st.pl[p.id])).filter(Boolean); const open = HUB_DOORS.filter((d) => this.doorOpen(st, d) && (d.key !== 'mercy' || st.ctx.mercy)); const dk = humansAt[0] || (X.seats.some((p) => !p.bot && p.connected) ? null : (st.ctx.mercy ? 'mercy' : null) || (open.find((d) => d.key === 'front') ? 'front' : pick(open.filter((d) => d.key !== 'mercy'))?.key)); q.aim = dk; }
    const d = HUB_DOORS.find((o) => o.key === q.aim); if (!d) return; const tx = d.x + (b.id.charCodeAt(0) % 3) - 1; const ty = 1;
    const path = bfs(st.g, q, (x, y) => !SOLID.has(st.g[y][x]), (x, y) => x === tx && y === ty); if (path && path.length) this.act(X, b, { a: 'mv', d: path[0] }, st);
  },
  tv(X, st) {
    const c = st.ctx;
    return { map: st.g.map((r) => r.join('')), theme: 'hub', hub: true, doors: HUB_DOORS.map((d) => ({ ...d, open: this.doorOpen(st, d), done: c.done.includes(d.key), hide: d.key === 'mercy' && !c.mercy && !c.mercyUsed })), zone: st.zone, countFrom: st.zone ? X.wall(st.countFrom) : null, actors: tvActors(X, st), ghosts: st.ghosts, secrets: st.secrets.filter((s) => !s.found).map((s) => [s.x, s.y]), msg: st.msg && X.now() - st.msg.at < 6000 ? st.msg : null, info: c.left ? `${c.left} room${c.left > 1 ? 's' : ''} to go. Stand at a door with most of your group.` : 'The Front Door is open. Gather there.' };
  },
  phone(X, p, st) { const c = st.ctx; return { pad: true, hub: true, text: c.left ? 'Walk to a door. When most of you stand at the same door, you go in.' : 'All rooms done. Walk to the Front Door together.', rooms: HUB_DOORS.filter((d) => !['front', 'mercy'].includes(d.key)).map((d) => ({ label: d.label, done: c.done.includes(d.key) })) }; },
};
function makeSecrets() {
  const kinds = shuffle([
    { kind: 'wax', text: 'found a lump of spare candle wax. Candle +5%' },
    { kind: 'stub', text: 'found a candle stub. Keep it for the end.' },
    { kind: 'note', text: 'found a note: "The House is not evil. Only lonely." -L' },
  ]);
  return shuffle(SECRET_SPOTS).slice(0, 3).map(([x, y], i) => ({ x, y, found: false, ...kinds[i] }));
}

// ================================================================== THE HOUSE (the last battle)
// Each turn the House remembers something. Show it the matching memory (an ACT) to loosen its grip.
// When its grip is gone, everyone picks MERCY and the door opens.
const MEMORIES = {
  ice: { act: "Show Lily's skates", hint: 'The House hears skates scraping on ice, and a little girl laughing.' },
  cellar: { act: 'Raise the old lantern', hint: 'The House stares down the dark hill, where a lantern went out of sight.' },
  dodge: { act: 'Say the storm is over', hint: 'Thunder rattles every window. The House is holding the storm in.' },
  chat: { act: "Read Lily's letter", hint: 'The House waits by the post box. Something was never delivered.' },
};
const BOSS = {
  key: 'boss', name: 'The House', style: 'tale', music: 'px-boss', foe: 'boss',
  how: 'Each turn the House remembers something. Pick ACT and show it that memory. When its name turns yellow, choose MERCY.',
  secs: { 1: 900 },
  make(X, ctx) {
    const mem = ctx.memories; const st = { kind: 'boss', ctx, turn: 0, phase: 'menu', votes: {}, grip: Math.max(40, 100 - ctx.keys * 10), anger: 0, teamHits: 0, used: [] };
    st.per = Math.ceil(st.grip / Math.max(1, mem.length)); battleFresh(X, st, X.seats);
    st.text = '* The House rises out of the floorboards. Every door slams at once.'; this.next(X, st); return st;
  },
  next(X, st) {
    const left = st.ctx.memories.filter((k) => !st.used.includes(k)); st.want = left.length ? pick(left) : null;
    st.hint = st.grip <= 0 ? 'The House has gone quiet. It is ready to let you go.' : st.want ? MEMORIES[st.want].hint : 'The House trembles, holding on.';
    st.phase = 'menu'; st.votes = {}; st.until = X.now() + 16000; st.wave = null;
  },
  opts(st) { return [...st.ctx.memories.map((k) => MEMORIES[k].act), 'Call for Mortimer']; },
  resolve(X, st) {
    st.turn++; const k = menuVote(X, st) || 'nothing'; let good = false;
    if (k === 'MERCY') { if (st.grip <= 0) { st.phase = 'spared'; st.until = X.now() + 4000; st.text = '* You spared the House. Somewhere, a door unlocks.'; X.sfx('px-levelup'); return; } st.text = '* The House is not ready to let go.'; }
    else if (k === 'FIGHT') { st.grip = Math.max(0, st.grip - 6); st.anger++; st.text = '* You hit the House with a candlestick. It barely notices, and it is furious.'; }
    else if (k === 'ITEM') { if (st.ctx.stubs > 0) { st.ctx.stubs--; X.gain(10); st.text = '* You light a candle stub. Candle +10%.'; X.sfx('px-heal'); good = true; } else st.text = '* You have no candle stubs left.'; }
    else if (k === 'Call for Mortimer') st.text = "* Mortimer coughs politely. 'I am only the butler, I am afraid.'";
    else if (k === 'nothing') st.text = '* Nobody moves. The House leans closer.';
    else { const mk = st.ctx.memories.find((m) => MEMORIES[m].act === k); if (mk && mk === st.want && st.grip > 0) { st.used.push(mk); st.grip = Math.max(0, st.grip - st.per); good = true; st.text = `* You ${k.charAt(0).toLowerCase()}${k.slice(1)}. The House remembers. Its grip loosens.${st.grip <= 0 ? ' THE HOUSE could be spared now.' : ''}`; X.sfx('px-ok'); } else st.text = '* Wrong memory. The House howls.'; }
    if (!good) X.sfx('px-no');
    st.phase = 'attack'; const L = Math.min(4, 1 + Math.floor(st.turn / 2) + st.anger + (good ? 0 : 1));
    startWave(X, st, ['walls', 'ring', 'spiral', 'bones', 'zig', 'rain'], L, good ? 9 : 12);
  },
  act(X, p, a, st) {
    if (a.a === 'pick' && st.phase === 'menu' && typeof a.k === 'string' && ['FIGHT', 'ITEM', 'MERCY', ...this.opts(st)].includes(a.k)) { st.votes[p.id] = { k: a.k, at: X.now() }; X.sfx('px-select'); }
    else battleAct(X, st, p, a, false);
  },
  tick(X, st, now, dt) {
    if (st.phase === 'attack') { botHearts(X, st, false, dt); if (waveOver(X, st)) this.next(X, st); return; }
    if (st.phase === 'spared') { if (now > st.until) st.done = 'win'; return; }
    if (st.phase === 'menu') { const all = Object.keys(st.hearts).every((id) => st.votes[id] || !X.P(id)?.connected); if (all || now > st.until) this.resolve(X, st); }
  },
  bot(X, b, st) {
    if (st.phase !== 'menu' || st.votes[b.id]) return; if (!X.after(b, 'boss', 2, 6)) return;
    const k = st.grip <= 0 ? 'MERCY' : st.want ? MEMORIES[st.want].act : 'ITEM';
    const first = Object.values(st.votes).sort((a, c) => a.at - c.at)[0];
    st.votes[b.id] = { k: Math.random() < 0.75 ? k : first ? first.k : k, at: X.now() };
  },
  tv(X, st) { const tally = {}; Object.values(st.votes).forEach((v) => { tally[v.k] = (tally[v.k] || 0) + 1; }); return { battle: true, foe: 'boss', foeName: 'THE HOUSE', boss: true, yellow: st.grip <= 0, grip: st.grip, phase: st.phase, until: X.wall(st.until), text: st.phase === 'menu' ? `* ${st.hint}` : st.text, voted: Object.keys(st.votes), tally: st.phase === 'menu' ? null : tally, wave: st.phase === 'attack' ? wavePub(X, st) : null, hearts: heartsPub(X, st), stubs: st.ctx.stubs }; },
  phone(X, p, st) { return { battle: true, boss: true, menu: st.phase === 'menu', phase: st.phase, opts: this.opts(st), mine: st.votes[p.id]?.k || null, yellow: st.grip <= 0, hint: st.hint, stubs: st.ctx.stubs, until: X.wall(st.until), wave: st.phase === 'attack' ? wavePub(X, st) : null, me: st.hearts[p.id] ? p.id : null, hearts: heartsPub(X, st), text: st.phase === 'menu' ? st.hint : st.text }; },
};

const PX_ROOMS = { ice: ICE, cellar: CELLAR_ROOM, dodge: DODGE, chat: CHAT };
module.exports = { PX_ROOMS, HUB, MERCY, BOSS, MEMORIES, HUB_DOORS, makeSecrets, GHOST, iceMap, iceDist, shuffle, pick, rint };
