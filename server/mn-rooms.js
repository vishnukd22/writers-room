'use strict';
// Last Night in the Mansion: the 20 rooms. Every room is a small module the engine runs the same way:
//   setup(X)            pick roles (X.role) and build the room's state (returned)
//   phone(X, p, st)     what this player's phone shows: { role, job, w: [widgets] }
//   tv(X, st)           what the TV shows: { w: [widgets], prog: { v, max, label } }
//   act(X, p, a, st)    a tap from a phone (a.a is the action, a.id / a.dir / a.at the details)
//   tick(X, now, st)    every 200 ms (game clock), optional
//   bot(X, b, now, st)  every 200 ms for each bot, optional
// X carries the helpers: X.drip(amount, why, p), X.win(), X.fail(), X.bubble(p, text), X.sfx(name), X.after(b, tag, lo, hi)...
// Phone widgets: card, list, btns, pad, dpad, grid, meter, beat, note. TV widgets: tiles, grid, big, meter, clock, beat, doll, seq.

const rint = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const shuffle = (arr) => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const deal = (items, people) => { const out = new Map(people.map((p) => [p.id, []])); items.forEach((it, i) => out.get(people[i % people.length].id).push(it)); return out; };
const nameList = (ps) => ps.map((p) => p.name).join(', ');
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const WORD = { up: 'UP', down: 'DOWN', left: 'LEFT', right: 'RIGHT' };

// ------------------------------------------------------------------ shared bits
function bfs(w, h, start, goal, open) {
  const key = (x, y) => y * w + x; const prev = new Map([[key(...start), null]]); const q = [start];
  while (q.length) {
    const [x, y] = q.shift(); if (x === goal[0] && y === goal[1]) break;
    for (const [d, [dx, dy]] of Object.entries(DIRS)) { const nx = x + dx; const ny = y + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h || prev.has(key(nx, ny)) || !open(x, y, nx, ny)) continue; prev.set(key(nx, ny), [x, y, d]); q.push([nx, ny]); }
  }
  const path = []; let k = key(...goal); if (!prev.has(k)) return null;
  while (prev.get(k)) { const [px, py, d] = prev.get(k); path.unshift(d); k = key(px, py); }
  return path;
}
const roleCard = (title, lines) => ({ t: 'card', text: title, sub: lines, style: 'page' });

// ================================================================== TALKING ROOMS
const BOOK_COLORS = [['Red', '#B3261E'], ['Green', '#2E7D32'], ['Blue', '#1F4FA8'], ['Black', '#222'], ['Gold', '#B8860B'], ['Purple', '#6A1B9A']];
const BOOK_SIGNS = [['owl', '🦉'], ['skull', '💀'], ['moon', '🌙'], ['key', '🗝️'], ['candle', '🕯️'], ['snake', '🐍'], ['rose', '🌹'], ['anchor', '⚓'], ['bat', '🦇']];
const BOOK_TITLES = ['Sermons for the Dead', 'A History of Drains', 'Beekeeping', 'My Cousin the Duke', 'Poisons, Volume II', 'The Quiet Sea', 'Ledgers 1899', 'Ghosts and Their Habits', 'Cooking for One', 'The Moth Almanac', 'Gentlemen Never Run', 'Tax'];

const library = {
  key: 'library', name: 'The Library', type: 'talk', secs: 120,
  how: 'Only the Librarian can pull books. Everyone else has a diary page. Read yours out loud.',
  setup(X) {
    const s = X.cast(); const lib = s[0]; X.role(lib, 'lib', 'Librarian');
    const readers = s.slice(1); readers.forEach((p) => X.role(p, 'reader', 'Reader'));
    const combos = shuffle(BOOK_COLORS.flatMap((c) => BOOK_SIGNS.map((g) => [c, g])));
    const books = []; const used = new Set();
    for (const [c, g] of combos) { if (books.length >= 9) break; if (used.has(c[0] + g[0])) continue; used.add(c[0] + g[0]); books.push({ id: `b${books.length}`, color: c, sign: g, title: BOOK_TITLES[books.length], pulled: false, bad: false }); }
    // decoys look like the answers: same colour or same sign
    const targets = shuffle(books).slice(0, X.level >= 3 ? 4 : 3).map((b) => b.id);
    const pages = targets.map((id) => { const b = books.find((x) => x.id === id); return `I hid it in the ${b.color[0].toUpperCase()} book with the ${b.sign[0].toUpperCase()} on the spine.`; });
    const trap = books.find((b) => !targets.includes(b.id));
    if (readers.length > pages.length) pages.push(`The ${trap.color[0].toUpperCase()} book with the ${trap.sign[0].toUpperCase()} is a trap. Do not touch it.`);
    const hands = deal(shuffle(pages), readers.length ? readers : [lib]);
    return { books, targets, hands, lib: lib.id };
  },
  phone(X, p, st) {
    if (X.roleOf(p) === 'lib') return { role: 'Librarian', job: 'Your friends will describe books. Tap a book to pull it. Wrong books cost wax.', w: [{ t: 'btns', cols: 3, act: 'pull', items: st.books.map((b) => ({ id: b.id, label: b.title, emoji: b.sign[1], color: b.color[1], state: b.pulled ? 'done' : b.bad ? 'bad' : '' })) }] };
    return { role: 'Reader', job: 'Read your page out loud to the Librarian.', w: (st.hands.get(p.id) || []).map((t, i) => ({ t: 'card', text: `Day ${40 + i * 3}.`, sub: t, style: 'page' })) };
  },
  tv(X, st) { const got = st.targets.filter((id) => st.books.find((b) => b.id === id).pulled).length; return { w: [{ t: 'tiles', cols: 9, items: st.books.map((b) => ({ emoji: b.sign[1], color: b.color[1], state: b.pulled ? 'done' : b.bad ? 'bad' : 'spine' })) }], prog: { v: got, max: st.targets.length, label: 'Secret books found' } }; },
  act(X, p, a, st) {
    if (a.a !== 'pull' || X.roleOf(p) !== 'lib') return;
    const b = st.books.find((x) => x.id === a.id); if (!b || b.pulled || b.bad) return;
    if (st.targets.includes(b.id)) { b.pulled = true; X.sfx('mn-page'); if (st.targets.every((id) => st.books.find((x) => x.id === id).pulled)) X.win(); } else { b.bad = true; X.drip(3, `${b.title} was not one of them`, p); }
  },
  bot(X, b, now, st) {
    if (X.roleOf(b) === 'reader') { for (const [i, t] of (st.hands.get(b.id) || []).entries()) if (X.once(b, `say${i}`, 1 + i * 4)) X.bubble(b, t); if (X.after(b, 'again', 25, 30)) X.bubble(b, pick(st.hands.get(b.id) || ['...'])); }
    if (X.roleOf(b) === 'lib' && X.after(b, 'pull', 9, 14)) { const t = st.books.find((x) => st.targets.includes(x.id) && !x.pulled); if (t) library.act(X, b, { a: 'pull', id: t.id }, st); }
  },
};

const maze = {
  key: 'maze', name: 'The Hedge Maze', type: 'talk', secs: 130,
  how: 'The Guide has the lantern and the map. Walkers are blind. Guide them out, and mind the thing in the hedges.',
  setup(X) {
    const s = X.cast(); const nGuides = X.n >= 6 ? 2 : 1;
    const guides = s.slice(0, nGuides); const walkers = s.slice(nGuides, nGuides + 4);
    if (!walkers.length) { walkers.push(guides.pop()); }
    guides.forEach((p) => X.role(p, 'guide', 'Guide')); walkers.forEach((p) => X.role(p, 'walker', 'Walker'));
    s.slice(nGuides + 4).forEach((p) => X.role(p, 'guide', 'Guide'));
    const W = X.level >= 3 ? 6 : 5; const H = 5;
    // a perfect maze: walls between cells. open[y][x] = set of directions you can go
    const open = Array.from({ length: H }, () => Array.from({ length: W }, () => new Set()));
    const seen = new Set(['0,0']); const stack = [[0, 0]];
    while (stack.length) {
      const [x, y] = stack[stack.length - 1];
      const n = shuffle(Object.entries(DIRS)).find(([, [dx, dy]]) => { const nx = x + dx; const ny = y + dy; return nx >= 0 && ny >= 0 && nx < W && ny < H && !seen.has(`${nx},${ny}`); });
      if (!n) { stack.pop(); continue; }
      const [d, [dx, dy]] = n; const nx = x + dx; const ny = y + dy; const back = { up: 'down', down: 'up', left: 'right', right: 'left' }[d];
      open[y][x].add(d); open[ny][nx].add(back); seen.add(`${nx},${ny}`); stack.push([nx, ny]);
    }
    const pos = {}; walkers.forEach((p) => { pos[p.id] = [0, 0]; });
    return { W, H, open, pos, exit: [W - 1, H - 1], ghost: [Math.floor(W / 2), Math.floor(H / 2)], ghostAt: 0, out: [], fb: {} };
  },
  grid(st, showGhost, me) {
    const cells = []; const C = st.W * 2 + 1; const R = st.H * 2 + 1;
    for (let gy = 0; gy < R; gy++) for (let gx = 0; gx < C; gx++) {
      let k = 'wall';
      if (gx % 2 && gy % 2) k = 'path';
      else if (gx % 2 && gy > 0 && gy < R - 1 && st.open[gy / 2 - 1][(gx - 1) / 2].has('down')) k = 'path';
      else if (gy % 2 && gx > 0 && gx < C - 1 && st.open[(gy - 1) / 2][gx / 2 - 1].has('right')) k = 'path';
      cells.push({ k });
    }
    const at = (x, y) => cells[(y * 2 + 1) * C + (x * 2 + 1)];
    at(...st.exit).k = 'exit'; at(...st.exit).e = '🚪';
    if (showGhost) { at(...st.ghost).e = '👻'; }
    for (const [id, [x, y]] of Object.entries(st.pos)) if (!st.out.includes(id)) { const c = at(x, y); c.who = [...(c.who || []), id]; if (id === me) c.k = 'me'; }
    return { t: 'grid', cols: C, cells };
  },
  phone(X, p, st) {
    if (X.roleOf(p) === 'guide') return { role: 'Guide', job: 'You have the map. Tell each walker which way to go. The ghost sends them back to the start.', w: [maze.grid(st, true, null), { t: 'list', items: Object.keys(st.pos).map((id) => `${X.P(id).name}: ${st.out.includes(id) ? 'OUT' : 'lost'}`) }] };
    if (st.out.includes(p.id)) return { role: 'Walker', job: "You're out! Now shout directions at the others.", w: [{ t: 'card', text: 'You made it out', style: 'big' }] };
    return { role: 'Walker', job: `You are blind. Listen to ${X.ofRole('guide').map((g) => g.name).join(' and ') || 'the Guide'}.`, w: [{ t: 'note', text: st.fb[p.id] || 'Which way?' }, { t: 'dpad', act: 'move' }] };
  },
  tv(X, st) { const n = Object.keys(st.pos).length; return { w: [{ t: 'big', text: st.out.length ? `${st.out.length} of ${n} out of the maze` : 'Nobody has found the way out yet' }, { t: 'tiles', cols: n, items: Object.keys(st.pos).map((id) => ({ who: id, label: X.P(id).name, state: st.out.includes(id) ? 'done' : '' })) }], prog: { v: st.out.length, max: n, label: 'Out of the maze' } }; },
  move(X, p, d, st) {
    const [x, y] = st.pos[p.id]; if (!st.open[y][x].has(d)) { st.fb[p.id] = 'Bump! A hedge.'; X.buzz(p, 'bump'); return; }
    const [dx, dy] = DIRS[d]; st.pos[p.id] = [x + dx, y + dy]; st.fb[p.id] = `You went ${WORD[d]}.`;
    maze.caught(X, st);
    if (st.pos[p.id] && st.pos[p.id][0] === st.exit[0] && st.pos[p.id][1] === st.exit[1]) { st.out.push(p.id); X.sfx('mn-unlock'); if (st.out.length >= Object.keys(st.pos).length) X.win(); }
  },
  caught(X, st) {
    for (const [id, [x, y]] of Object.entries(st.pos)) {
      if (st.out.includes(id)) continue;
      if (x === st.ghost[0] && y === st.ghost[1] && (x || y)) {
        st.pos[id] = [0, 0]; st.fb[id] = 'Something grabbed you! Back to the start.'; X.drip(2, `The thing in the hedges caught ${X.P(id).name}`, X.P(id)); X.sfx('mn-scream'); X.buzz(X.P(id), 'bad');
        // it slinks off somewhere else for a while
        st.ghost = [rint(1, st.W - 1), rint(1, st.H - 1)]; st.ghostAt = X.now() + 5000;
      } else if (Math.abs(x - st.ghost[0]) + Math.abs(y - st.ghost[1]) === 1) st.fb[id] = 'You hear breathing. Very close.';
    }
  },
  act(X, p, a, st) { if (a.a === 'move' && X.roleOf(p) === 'walker' && st.pos[p.id] && !st.out.includes(p.id) && DIRS[a.dir]) maze.move(X, p, a.dir, st); },
  tick(X, now, st) {
    if (now < st.ghostAt) return; st.ghostAt = now + (X.level >= 4 ? 2200 : 3000);
    const [x, y] = st.ghost; const ds = [...st.open[y][x]]; const d = pick(ds); const [dx, dy] = DIRS[d]; st.ghost = [x + dx, y + dy]; maze.caught(X, st);
  },
  bot(X, b, now, st) {
    if (X.roleOf(b) === 'walker' && st.pos[b.id] && !st.out.includes(b.id) && X.after(b, 'step', 1.4, 2.4)) { const path = bfs(st.W, st.H, st.pos[b.id], st.exit, (x, y, nx, ny) => st.open[y][x].has(Object.entries(DIRS).find(([, v]) => v[0] === nx - x && v[1] === ny - y)[0])); if (path?.length) maze.move(X, b, path[0], st); }
    if (X.roleOf(b) === 'guide' && X.after(b, 'call', 2.2, 3.2)) {
      const lost = Object.keys(st.pos).filter((id) => !st.out.includes(id) && !X.P(id).bot); const id = lost[0]; if (!id) return;
      const path = bfs(st.W, st.H, st.pos[id], st.exit, (x, y, nx, ny) => st.open[y][x].has(Object.entries(DIRS).find(([, v]) => v[0] === nx - x && v[1] === ny - y)[0]));
      if (path?.length) { let n = 1; while (path[n] === path[0]) n++; X.bubble(b, `${X.P(id).name}, go ${WORD[path[0]]}${n > 1 ? ` ${n} times` : ''}.`); }
    }
  },
};

const LABELS = [['red', '#B3261E'], ['green', '#2E7D32'], ['gold', '#B8860B'], ['black', '#222']];
const cellar = {
  key: 'cellar', name: 'The Wine Cellar', type: 'talk', secs: 120,
  how: 'One bottle holds the key. Each of you has one clue. Share them, and the Taster picks the bottle.',
  setup(X) {
    const s = X.cast(); const taster = s[0]; X.role(taster, 'taster', 'Taster');
    const others = s.slice(1); others.forEach((p) => X.role(p, 'clue', 'Sommelier'));
    const years = shuffle(Array.from({ length: 36 }, (_, i) => 1890 + i)).slice(0, 12);
    const bottles = years.map((y, i) => ({ id: `w${i}`, i, row: Math.floor(i / 4), col: i % 4, year: y, label: pick(LABELS), seal: Math.random() < 0.5 ? 'wax' : 'cork', bad: false }));
    const ans = pick(bottles);
    const B = (r, c) => bottles.find((b) => b.row === r && b.col === c);
    const rows = ['top', 'middle', 'bottom'];
    const C = [
      [`The label is not ${LABELS[0][0]}.`, (b) => b.label[0] !== 'red'], [`The label is not ${LABELS[1][0]}.`, (b) => b.label[0] !== 'green'], [`The label is not ${LABELS[2][0]}.`, (b) => b.label[0] !== 'gold'], [`The label is not ${LABELS[3][0]}.`, (b) => b.label[0] !== 'black'],
      [`The label is ${ans.label[0]}.`, (b) => b.label[0] === ans.label[0]],
      [`It's on the ${rows[ans.row]} shelf.`, (b) => b.row === ans.row], ["It's not on the top shelf.", (b) => b.row !== 0], ["It's not on the bottom shelf.", (b) => b.row !== 2],
      ["It's at one end of its shelf.", (b) => b.col === 0 || b.col === 3], ["It's in one of the two middle columns.", (b) => b.col === 1 || b.col === 2],
      ['It was bottled before 1908.', (b) => b.year < 1908], ['It was bottled in 1908 or later.', (b) => b.year >= 1908], ['Its year is an odd number.', (b) => b.year % 2 === 1], ['Its year is an even number.', (b) => b.year % 2 === 0],
      [`It has a ${ans.seal} seal.`, (b) => b.seal === ans.seal],
      ["It's not next to a red label.", (b) => ![B(b.row, b.col - 1), B(b.row, b.col + 1)].some((n) => n && n.label[0] === 'red')],
      ["It's older than the bottle on its left.", (b) => { const l = B(b.row, b.col - 1); return !!l && b.year < l.year; }],
      ["It's younger than the bottle on its right.", (b) => { const r = B(b.row, b.col + 1); return !!r && b.year > r.year; }],
    ].filter(([, f]) => f(ans));
    // add clues until only the answer fits
    let cand = [...bottles]; const clues = [];
    for (const [t, f] of shuffle(C)) { const next = cand.filter(f); if (next.length < cand.length) { clues.push(t); cand = next; } if (cand.length === 1) break; }
    for (const [t] of shuffle(C)) { if (clues.length >= Math.max(others.length, 3)) break; if (!clues.includes(t)) clues.push(t); }
    return { bottles, ans: ans.id, hands: deal(shuffle(clues), others.length ? others : [taster]), unique: cand.length === 1 };
  },
  rack(st, act) { return { t: 'btns', cols: 4, act, items: st.bottles.map((b) => ({ id: b.id, label: String(b.year), emoji: b.seal === 'wax' ? '🔴' : '🍾', color: b.label[1], state: b.bad ? 'bad' : '' })) }; },
  phone(X, p, st) {
    if (X.roleOf(p) === 'taster') return { role: 'Taster', job: 'Listen to the clues, then tap the bottle with the key. 🔴 is a wax seal, 🍾 is a cork.', w: [cellar.rack(st, 'pick'), ...(st.hands.get(p.id) || []).map((t) => ({ t: 'card', text: 'Your clue', sub: t, style: 'page' }))] };
    return { role: 'Sommelier', job: 'Read your clue out loud. The bottles are on the TV.', w: (st.hands.get(p.id) || []).map((t) => ({ t: 'card', text: 'Your clue', sub: t, style: 'page' })) };
  },
  tv(X, st) { return { w: [{ ...cellar.rack(st, null), t: 'tiles' }, { t: 'note', text: 'Shelves: top, middle, bottom. 🔴 wax seal, 🍾 cork.' }], prog: { v: 0, max: 1, label: 'Find the bottle' } }; },
  act(X, p, a, st) {
    if (a.a !== 'pick' || X.roleOf(p) !== 'taster') return;
    const b = st.bottles.find((x) => x.id === a.id); if (!b || b.bad) return;
    if (b.id === st.ans) { X.sfx('mn-bottle'); X.win(); } else { b.bad = true; X.sfx('mn-bottle'); X.drip(4, `The ${b.year} was just wine`, p); }
  },
  bot(X, b, now, st) {
    if (X.roleOf(b) === 'clue') { (st.hands.get(b.id) || []).forEach((t, i) => { if (X.once(b, `c${i}`, 1.5 + i * 4)) X.bubble(b, t); }); if (X.after(b, 'again', 22, 28)) X.bubble(b, pick(st.hands.get(b.id) || ['...'])); }
    if (X.roleOf(b) === 'taster' && X.after(b, 'pick', 16, 24)) cellar.act(X, b, { a: 'pick', id: st.ans }, st);
  },
};

const FOOD = [['🥩', 'Raw Steak'], ['🐟', 'Fish Head'], ['🪰', 'Jar of Flies'], ['🥚', 'Rotten Egg'], ['🐀', 'Rat'], ['🍖', 'Old Ham'], ['🦴', 'Bone'], ['🐌', 'Snails'], ['🍄', 'Toadstool'], ['🧀', 'Mouldy Cheese'], ['🐛', 'Worms'], ['🦗', 'Crickets'], ['🐸', 'Frog'], ['🧄', 'Garlic']];
const PLANTS = [['Snapjaw', '🌺'], ['Gulper', '🌻'], ['Nibbler', '🌷'], ['Fangleaf', '🥀']];
const greenhouse = {
  key: 'greenhouse', name: 'The Greenhouse', type: 'talk', secs: 110,
  how: "A plant's order shows up on someone's phone. The food is on someone else's. Shout, then feed it.",
  setup(X) {
    X.seats.forEach((p) => X.role(p, 'gardener', 'Gardener'));
    const plants = PLANTS.slice(0, X.n >= 5 ? 4 : 3).map(([name, e], i) => ({ id: `p${i}`, name, e }));
    const foods = shuffle(FOOD).slice(0, Math.min(FOOD.length, X.n * 3)).map(([e, name], i) => ({ id: `f${i}`, e, name }));
    return { plants, foods, hands: deal(foods, X.seats), reqs: [], fed: 0, goal: 6 + X.level * 2, sel: {}, nextAt: 0 };
  },
  holder(st, fid) { for (const [pid, fs] of st.hands) if (fs.some((f) => f.id === fid)) return pid; return null; },
  phone(X, p, st) {
    const mine = st.reqs.filter((r) => r.to === p.id); const sel = st.sel[p.id];
    return { role: 'Gardener', job: 'If a plant order is on your phone, shout it. If you have that food, tap the food, then the plant.', w: [
      ...mine.map((r) => ({ t: 'card', text: `${st.plants.find((x) => x.id === r.plant).name} wants...`, sub: `${st.foods.find((f) => f.id === r.food).e} ${st.foods.find((f) => f.id === r.food).name}`, style: 'alert', ends: X.wall(r.ends), start: X.wall(r.start) })),
      { t: 'btns', cols: 3, act: 'food', items: (st.hands.get(p.id) || []).map((f) => ({ id: f.id, label: f.name, emoji: f.e, state: sel === f.id ? 'sel' : '' })) },
      { t: 'btns', cols: st.plants.length, act: 'plant', items: st.plants.map((pl) => ({ id: pl.id, label: pl.name, emoji: pl.e, state: sel ? '' : 'off' })) }] };
  },
  tv(X, st) { return { w: [{ t: 'tiles', cols: st.plants.length, items: st.plants.map((pl) => { const r = st.reqs.find((x) => x.plant === pl.id); return { emoji: pl.e, label: pl.name, sub: r ? 'HUNGRY' : 'content', state: r ? 'hot' : '', ends: r ? X.wall(r.ends) : null, start: r ? X.wall(r.start) : null }; }) }], prog: { v: st.fed, max: st.goal, label: 'Plants fed' } }; },
  act(X, p, a, st) {
    if (a.a === 'food' && (st.hands.get(p.id) || []).some((f) => f.id === a.id)) { st.sel[p.id] = st.sel[p.id] === a.id ? null : a.id; return; }
    if (a.a === 'plant' && st.sel[p.id]) {
      const fid = st.sel[p.id]; st.sel[p.id] = null;
      const r = st.reqs.find((x) => x.plant === a.id && x.food === fid);
      if (r) { st.reqs = st.reqs.filter((x) => x !== r); st.fed++; X.sfx('mn-chomp'); if (st.fed >= st.goal) X.win(); } else X.drip(2, `${st.plants.find((x) => x.id === a.id).name} spat it out`, p);
    }
  },
  tick(X, now, st) {
    for (const r of [...st.reqs]) if (now > r.ends) { st.reqs = st.reqs.filter((x) => x !== r); X.drip(3, `${st.plants.find((x) => x.id === r.plant).name} bit someone`); X.sfx('mn-chomp'); }
    const cap = Math.min(X.n, X.level >= 3 ? 3 : 2);
    if (st.reqs.length < cap && now >= st.nextAt) {
      const free = st.plants.filter((pl) => !st.reqs.some((r) => r.plant === pl.id)); if (!free.length) return;
      const food = pick(st.foods.filter((f) => !st.reqs.some((r) => r.food === f.id))); const holder = greenhouse.holder(st, food.id);
      const to = pick(X.seats.filter((s) => s.id !== holder && !st.reqs.some((r) => r.to === s.id))) || pick(X.seats);
      const life = (16 - X.level) * 1000; st.reqs.push({ plant: pick(free).id, food: food.id, to: to.id, start: now, ends: now + life }); st.nextAt = now + 2500;
    }
  },
  bot(X, b, now, st) {
    for (const r of st.reqs) if (r.to === b.id && X.once(b, `r${r.start}`, 1)) X.bubble(b, `${st.plants.find((x) => x.id === r.plant).name} wants the ${st.foods.find((f) => f.id === r.food).name}!`);
    const r = st.reqs.find((x) => greenhouse.holder(st, x.food) === b.id);
    if (r && X.after(b, `feed${r.start}`, 2.5, 5)) { st.sel[b.id] = r.food; greenhouse.act(X, b, { a: 'plant', id: r.plant }, st); }
  },
};

const MESSAGES = ['THE DEAD DO NOT SLEEP HERE', 'LOOK BEHIND YOU RIGHT NOW', 'SHE IS STILL IN THE WALLS', 'NEVER TRUST THE BUTLER AGAIN', 'THE CANDLE KNOWS YOUR NAME', 'DO NOT OPEN THE ATTIC DOOR', 'WE ARE WAITING IN THE DARK', 'YOU SHOULD NOT HAVE COME', 'COUNT THE STAIRS GOING DOWN'];
const DECOYS = ['GHOST', 'BLOOD', 'HOUSE', 'COLD', 'NIGHT', 'BONES', 'WAKE', 'STAY', 'RUN', 'MOON', 'GRAVE', 'SCREAM', 'MIRROR', 'SOON', 'ALONE', 'HUNGRY'];
const mirror = {
  key: 'mirror', name: 'The Bathroom Mirror', type: 'talk', secs: 110,
  how: 'The Reader sees a backwards message. Everyone else taps its words, in order.',
  setup(X) {
    const s = X.cast(); const reader = s[0]; X.role(reader, 'reader', 'Reader'); const pickers = s.slice(1).length ? s.slice(1) : [reader];
    pickers.forEach((p) => { if (p !== reader) X.role(p, 'picker', 'Picker'); });
    const msgs = shuffle(MESSAGES).slice(0, X.level >= 4 ? 3 : 2);
    const st = { msgs, mi: 0, got: 0, pickers: pickers.map((p) => p.id) };
    mirror.load(st, pickers); return st;
  },
  load(st, pickers) {
    const words = st.msgs[st.mi].split(' ');
    const items = shuffle([...words.map((w, i) => ({ id: `m${st.mi}w${i}`, w, i })), ...shuffle(DECOYS.filter((d) => !words.includes(d))).slice(0, pickers.length * 2).map((w, i) => ({ id: `m${st.mi}d${i}`, w, i: -1 }))]);
    st.words = words; st.got = 0; st.hands = deal(items, pickers);
  },
  phone(X, p, st) {
    if (X.roleOf(p) === 'reader') return { role: 'Reader', job: 'Read the mirror out loud, one word at a time. It is backwards.', w: [{ t: 'card', text: st.words.join(' '), style: 'mirror' }, { t: 'note', text: `${st.got} of ${st.words.length} words found` }] };
    return { role: 'Picker', job: 'When the Reader says one of your words, tap it. In order!', w: [{ t: 'btns', cols: 2, act: 'word', items: (st.hands.get(p.id) || []).map((it) => ({ id: it.id, label: it.w, state: it.i >= 0 && it.i < st.got ? 'done' : '' })) }] };
  },
  tv(X, st) { return { w: [{ t: 'seq', items: st.words.map((w, i) => (i < st.got ? w : '???')) }, { t: 'note', text: `Message ${st.mi + 1} of ${st.msgs.length}` }], prog: { v: st.mi, max: st.msgs.length, label: 'Messages read' } }; },
  act(X, p, a, st) {
    if (a.a !== 'word') return; const it = (st.hands.get(p.id) || []).find((x) => x.id === a.id); if (!it || (it.i >= 0 && it.i < st.got)) return;
    if (it.i === st.got) { st.got++; X.sfx('mn-page'); if (st.got >= st.words.length) { st.mi++; if (st.mi >= st.msgs.length) X.win(); else { X.sfx('mn-clear'); mirror.load(st, st.pickers.map((id) => X.P(id))); } } } else X.drip(2, `"${it.w}" was not next`, p);
  },
  bot(X, b, now, st) {
    if (X.roleOf(b) === 'reader' && X.after(b, 'read', 2.5, 3.5)) X.bubble(b, `${st.words.slice(st.got, st.got + 2).join(' ')}...`);
    const mine = (st.hands.get(b.id) || []).find((x) => x.i === st.got);
    if (mine && X.after(b, `w${mine.id}`, 2, 4)) mirror.act(X, b, { a: 'word', id: mine.id }, st);
  },
};

const ITEMS = [['🧸', 'Teddy'], ['🔑', 'Key'], ['📿', 'Locket'], ['🕯️', 'Candle stub'], ['📜', 'Letter'], ['👓', 'Spectacles']];
const FURN = ['🛏️', '🪑', '🗄️', '🪞', '🧺'];
const bedroom = {
  key: 'bedroom', name: 'The Bedroom', type: 'talk', secs: 120,
  how: 'The Torch can only see a small circle. Everyone else knows where things are. Talk the Torch to each item.',
  setup(X) {
    const s = X.cast(); const torch = s[0]; X.role(torch, 'torch', 'Torch'); s.slice(1).forEach((p) => X.role(p, 'finder', 'Finder'));
    const W = 6; const H = 6; const cells = Array.from({ length: W * H }, () => ({ f: null, item: null }));
    shuffle([...cells.keys()].filter((i) => i !== 0)).slice(0, 6).forEach((i, k) => { cells[i].f = FURN[k % FURN.length]; });
    const free = shuffle([...cells.keys()].filter((i) => i > 7 && !cells[i].f));
    const want = shuffle(ITEMS).slice(0, X.level >= 3 ? 4 : 3); want.forEach((it, k) => { cells[free[k]].item = { e: it[0], name: it[1], got: false }; });
    const finders = s.slice(1);
    return { W, H, cells, pos: [0, 0], want: want.map((w) => w[1]), hands: deal(want.map((w) => w[1]), finders.length ? finders : [torch]) };
  },
  view(st, full) {
    const cells = st.cells.map((c, i) => { const x = i % st.W; const y = Math.floor(i / st.W); const lit = full || (Math.abs(x - st.pos[0]) <= 1 && Math.abs(y - st.pos[1]) <= 1); const me = x === st.pos[0] && y === st.pos[1];
      return { k: me ? 'me' : lit ? 'lit' : 'dark', e: me ? '🔦' : lit ? (c.item && !c.item.got ? c.item.e : c.f || '') : '' }; });
    return { t: 'grid', cols: st.W, cells };
  },
  phone(X, p, st) {
    if (X.roleOf(p) === 'torch') return { role: 'Torch', job: 'You only see a small circle. Move where they tell you, then tap Grab.', w: [bedroom.view(st, false), { t: 'dpad', act: 'move' }, { t: 'pad', act: 'grab', label: 'Grab' }] };
    const mine = st.hands.get(p.id) || [];
    return { role: 'Finder', job: `Guide the Torch to: ${mine.join(', ')}. The torch is 🔦.`, w: [bedroom.view(st, true), { t: 'list', items: st.cells.filter((c) => c.item).map((c) => `${c.item.e} ${c.item.name}: ${c.item.got ? 'found' : 'not yet'}`) }] };
  },
  tv(X, st) { const got = st.cells.filter((c) => c.item?.got).length; return { w: [bedroom.view(st, false)], prog: { v: got, max: st.want.length, label: 'Things found' } }; },
  act(X, p, a, st) {
    if (X.roleOf(p) !== 'torch') return;
    if (a.a === 'move' && DIRS[a.dir]) { const [dx, dy] = DIRS[a.dir]; const nx = st.pos[0] + dx; const ny = st.pos[1] + dy; if (nx >= 0 && ny >= 0 && nx < st.W && ny < st.H) { st.pos = [nx, ny]; X.sfx('mn-steps'); } }
    if (a.a === 'tap' || a.a === 'grab') {
      const c = st.cells[st.pos[1] * st.W + st.pos[0]];
      if (c.item && !c.item.got) { c.item.got = true; X.sfx('mn-unlock'); if (st.cells.every((x) => !x.item || x.item.got)) X.win(); } else X.drip(2, 'Grabbed something under the bed. It grabbed back.', p);
    }
  },
  bot(X, b, now, st) {
    const target = st.cells.findIndex((c) => c.item && !c.item.got); if (target < 0) return;
    const tx = target % st.W; const ty = Math.floor(target / st.W);
    if (X.roleOf(b) === 'torch' && X.after(b, 'mv', 1, 1.6)) { if (tx === st.pos[0] && ty === st.pos[1]) bedroom.act(X, b, { a: 'grab' }, st); else bedroom.act(X, b, { a: 'move', dir: tx !== st.pos[0] ? (tx > st.pos[0] ? 'right' : 'left') : (ty > st.pos[1] ? 'down' : 'up') }, st); }
    if (X.roleOf(b) === 'finder' && X.after(b, 'say', 3, 4)) { const dx = tx - st.pos[0]; const dy = ty - st.pos[1]; const parts = []; if (dx) parts.push(`${dx > 0 ? 'right' : 'left'} ${Math.abs(dx)}`); if (dy) parts.push(`${dy > 0 ? 'down' : 'up'} ${Math.abs(dy)}`); X.bubble(b, parts.length ? `Torch, go ${parts.join(', then ')}.` : 'GRAB IT!'); }
  },
};

const study = {
  key: 'study', name: 'The Study', type: 'talk', secs: 120,
  how: 'The ghost questions the player in the hot seat. The answers are in the documents on everyone else\'s phones.',
  setup(X) {
    const s = X.cast(); const hot = s[0]; X.role(hot, 'hot', 'Hot seat'); const rest = s.slice(1); rest.forEach((p) => X.role(p, 'docs', 'Clerk'));
    const F = [
      { q: 'In what year did I sign my will?', a: String(rint(1890, 1915)), alt: () => String(rint(1880, 1920)), doc: (a) => `Signed and sealed this fourteenth day of March, ${a}.` },
      { q: 'What was my dog called?', a: pick(['Biscuit', 'Admiral', 'Pudding', 'Bishop']), alt: () => pick(['Rex', 'Duke', 'Captain', 'Muffin', 'Toby', 'Sergeant']), doc: (a) => `Leave the silver bowl to ${a}, the only one who ever listened.` },
      { q: 'Who inherits the house?', a: pick(['my niece Clara', 'my cook Mrs Pike', 'the gardener', 'my parrot']), alt: () => pick(['my brother', 'the vicar', 'the Crown', 'my wife', 'nobody']), doc: (a) => `The house and all its troubles go to ${a}.` },
      { q: 'Where did I bury the gold?', a: pick(['under the oak', 'in the well', 'behind the organ', 'in the rose bed']), alt: () => pick(['in the attic', 'at the bank', 'under the stairs', 'in the chapel', 'in Paris']), doc: (a) => `Map, torn. An X marked ${a}.` },
      { q: 'How many rooms does this house have?', a: String(rint(40, 60)), alt: () => String(rint(30, 70)), doc: (a) => `Builder's note: ${a} rooms, and one we do not speak of.` },
      { q: 'What did I drink every night?', a: pick(['cold cocoa', 'sherry', 'goat milk', 'gin and tonic']), alt: () => pick(['whisky', 'tea', 'port', 'water', 'brandy']), doc: (a) => `The master takes ${a} at nine. Never late. Never.` },
      { q: 'What was my wife\'s name?', a: pick(['Agatha', 'Winifred', 'Beatrice', 'Ottoline']), alt: () => pick(['Mary', 'Edith', 'Florence', 'Ada', 'Mabel']), doc: (a) => `To my dearest ${a}, who poisoned the soup.` },
      { q: 'What did I fear most?', a: pick(['moths', 'the sea', 'clowns', 'the butler']), alt: () => pick(['spiders', 'fire', 'death', 'my wife', 'ghosts']), doc: (a) => `Diary: I dreamed of ${a} again. I did not sleep.` },
    ];
    const facts = shuffle(F).slice(0, 4 + Math.ceil(X.level / 2)).map((f, i) => { const opts = new Set([f.a]); while (opts.size < 4) opts.add(f.alt()); return { id: `q${i}`, q: f.q, a: f.a, doc: f.doc(f.a), opts: shuffle([...opts]), ok: false }; });
    return { facts, i: 0, hands: deal(facts.map((f) => f.id), rest.length ? rest : [hot]) };
  },
  cur(st) { return st.facts.find((f, k) => !f.ok && k >= st.i % st.facts.length) || st.facts.find((f) => !f.ok); },
  phone(X, p, st) {
    const f = study.cur(st); if (!f) return { role: '', job: '', w: [] };
    if (X.roleOf(p) === 'hot') return { role: 'Hot seat', job: 'The ghost asks you about his will. Your friends have the papers. Pick the right answer.', w: [{ t: 'card', text: f.q, style: 'big' }, { t: 'btns', cols: 1, act: 'ans', items: f.opts.map((o, k) => ({ id: String(k), label: o })) }] };
    return { role: 'Clerk', job: 'Find the answer in your papers and tell the hot seat.', w: (st.hands.get(p.id) || []).map((id) => { const d = st.facts.find((x) => x.id === id); return { t: 'card', text: 'An old document', sub: d.doc, style: d.ok ? 'done' : 'page' }; }) };
  },
  tv(X, st) { const f = study.cur(st); return { w: [{ t: 'big', text: f ? `"${f.q}"` : '' }], prog: { v: st.facts.filter((x) => x.ok).length, max: st.facts.length, label: 'Questions answered' } }; },
  act(X, p, a, st) {
    if (a.a !== 'ans' || X.roleOf(p) !== 'hot') return; const f = study.cur(st); if (!f) return;
    if (f.opts[Number(a.id)] === f.a) { f.ok = true; X.sfx('mn-page'); if (st.facts.every((x) => x.ok)) X.win(); } else { X.drip(3, 'The ghost did not like that answer', p); st.i++; }
    st.i++;
  },
  bot(X, b, now, st) {
    const f = study.cur(st); if (!f) return;
    if (X.roleOf(b) === 'docs' && (st.hands.get(b.id) || []).includes(f.id) && X.once(b, `d${f.id}${st.i}`, 3)) X.bubble(b, st.facts.find((x) => x.id === f.id).doc);
    if (X.roleOf(b) === 'hot' && X.after(b, `a${f.id}${st.i}`, 6, 10)) study.act(X, b, { a: 'ans', id: String(f.opts.indexOf(f.a)) }, st);
  },
};

// tiles: connections N=1 E=2 S=4 W=8
const TILE = { straight: [5, 10], corner: [3, 6, 12, 9] };
const staircase = {
  key: 'staircase', name: 'The Grand Staircase', type: 'talk', secs: 120,
  how: 'Each of you turns some of the stairs. Make one path from the arrow to the landing. The TV shows the house from above.',
  setup(X) {
    X.seats.forEach((p) => X.role(p, 'turner', 'Stair turner'));
    const W = X.level >= 4 ? 5 : 4; const H = 4;
    // a random path left to right that never goes back on itself
    let path; for (let t = 0; t < 200 && !path; t++) {
      const sy = rint(0, H - 1); const p = [[0, sy]]; const seen = new Set([`0,${sy}`]); let ok = true;
      while (p[p.length - 1][0] < W - 1) { const [x, y] = p[p.length - 1]; const opts = [[x + 1, y], [x, y - 1], [x, y + 1]].filter(([a, b]) => b >= 0 && b < H && !seen.has(`${a},${b}`)); if (!opts.length) { ok = false; break; } const n = Math.random() < 0.55 ? opts[0] : pick(opts); seen.add(`${n[0]},${n[1]}`); p.push(n); if (p.length > W * H) { ok = false; break; } }
      if (ok) path = p;
    }
    const bit = (a, b) => (b[0] > a[0] ? 2 : b[0] < a[0] ? 8 : b[1] > a[1] ? 4 : 1); // the side of a that faces b
    const tiles = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) tiles.push({ id: `${'ABCDE'[x]}${y + 1}`, x, y, type: Math.random() < 0.5 ? 'straight' : 'corner', rot: 0, need: null });
    path.forEach((c, i) => {
      const prev = i === 0 ? [c[0] - 1, c[1]] : path[i - 1]; const next = i === path.length - 1 ? [c[0] + 1, c[1]] : path[i + 1];
      const mask = bit(c, prev) | bit(c, next);
      const t = tiles.find((q) => q.x === c[0] && q.y === c[1]); t.type = TILE.straight.includes(mask) ? 'straight' : 'corner'; t.need = mask;
    });
    tiles.forEach((t) => { t.rot = rint(0, TILE[t.type].length - 1); if (t.need && TILE[t.type][t.rot] === t.need) t.rot = (t.rot + 1) % TILE[t.type].length; });
    const st = { W, H, tiles, start: path[0][1], end: path[path.length - 1][1], hands: deal(shuffle(tiles.map((t) => t.id)), X.seats) };
    return st;
  },
  mask(t) { return TILE[t.type][t.rot]; },
  glyph(m) { return { 5: '┃', 10: '━', 3: '┗', 6: '┏', 12: '┓', 9: '┛' }[m] || '·'; },
  solved(st) {
    let x = 0; let y = st.start; let from = 8; const seen = new Set();
    for (;;) {
      const t = st.tiles.find((q) => q.x === x && q.y === y); if (!t || seen.has(t.id)) return false; seen.add(t.id);
      const m = staircase.mask(t); if (!(m & from)) return false;
      const out = m & ~from; if (x === st.W - 1 && out === 2) return y === st.end;
      const [dx, dy] = { 1: [0, -1], 2: [1, 0], 4: [0, 1], 8: [-1, 0] }[out] || [0, 0]; if (!dx && !dy) return false;
      x += dx; y += dy; from = { 1: 4, 2: 8, 4: 1, 8: 2 }[out];
    }
  },
  phone(X, p, st) { return { role: 'Stair turner', job: 'You control these staircases. Look at the TV and turn yours to make the path.', w: [{ t: 'btns', cols: 3, act: 'turn', items: (st.hands.get(p.id) || []).map((id) => { const t = st.tiles.find((q) => q.id === id); return { id, label: `Turn ${id}`, emoji: staircase.glyph(staircase.mask(t)) }; }) }] }; },
  tv(X, st) { return { w: [{ t: 'grid', cols: st.W, stairs: true, start: st.start, end: st.end, cells: st.tiles.map((t) => ({ k: 'stair', e: staircase.glyph(staircase.mask(t)), label: t.id })) }], prog: { v: 0, max: 1, label: 'Path to the landing' } }; },
  act(X, p, a, st) { if (a.a !== 'turn' || !(st.hands.get(p.id) || []).includes(a.id)) return; const t = st.tiles.find((q) => q.id === a.id); t.rot = (t.rot + 1) % TILE[t.type].length; X.sfx('mn-floor'); if (staircase.solved(st)) X.win(); },
  bot(X, b, now, st) { if (!X.after(b, 'turn', 3, 5)) return; const t = st.tiles.find((q) => (st.hands.get(b.id) || []).includes(q.id) && q.need && staircase.mask(q) !== q.need); if (t) staircase.act(X, b, { a: 'turn', id: t.id }, st); },
};

// ================================================================== TIMING ROOMS
const ballroom = {
  key: 'ballroom', name: 'The Ballroom', type: 'timing', secs: 75,
  how: 'Tap on every glowing beat, all together. Every missed step brings the dancers closer.',
  setup(X) { X.seats.forEach((p) => X.role(p, 'dancer', 'Dancer')); const t0 = X.now() + 4000; return { t0, period: X.level >= 4 ? 1000 : 1200, steps: 14 + X.level * 2, k: 0, taps: {}, close: 0, win: X.level >= 3 ? 200 : 240 }; },
  phone(X, p, st) { return { role: 'Dancer', job: 'Tap the big button exactly when the ring glows. Watch the TV too.', w: [{ t: 'beat', t0: X.wall(st.t0), period: st.period, steps: st.steps }, { t: 'pad', act: 'tap', label: 'STEP' }] }; },
  tv(X, st) { return { w: [{ t: 'beat', t0: X.wall(st.t0), period: st.period, steps: st.steps }, { t: 'meter', label: 'The dancers are this close', v: st.close, max: 100, color: '#B3261E' }], prog: { v: Math.min(st.k, st.steps), max: st.steps, label: 'Steps danced' } }; },
  act(X, p, a, st) { if (a.a !== 'tap') return; const at = Number.isFinite(a.at) ? Math.max(X.now() - 600, Math.min(X.now() + 200, X.gameTime(a.at))) : X.now(); (st.taps[p.id] = st.taps[p.id] || []).push(at); },
  tick(X, now, st) {
    while (st.k < st.steps && now > st.t0 + st.k * st.period + st.win) {
      const beat = st.t0 + st.k * st.period; let miss = 0;
      for (const s of X.seats) { const ts = st.taps[s.id] || []; const hit = ts.some((t) => Math.abs(t - beat) <= st.win); if (!hit) miss++; st.taps[s.id] = ts.filter((t) => t > beat + st.win); }
      if (miss) { st.close = Math.min(100, st.close + miss * (X.level >= 3 ? 9 : 7)); X.drip(Math.min(3, miss), miss === 1 ? 'Someone missed a step' : `${miss} people missed a step`); } else X.sfx('mn-steps');
      st.k++;
      if (st.close >= 100) { X.fail(); return; }
      if (st.k >= st.steps) { X.win(); return; }
    }
  },
  bot(X, b, now, st) { const beat = st.t0 + st.k * st.period; if (st.k < st.steps && now >= beat - 120 && now <= beat + 60 && !(st.taps[b.id] || []).some((t) => Math.abs(t - beat) < 300) && Math.random() < 0.93) (st.taps[b.id] = st.taps[b.id] || []).push(beat + rint(-90, 90)); },
};

const attic = {
  key: 'attic', name: 'The Attic', type: 'timing', secs: 120,
  how: 'The Spotter can see which boards creak. Crossers go one at a time. Step only where the Spotter says.',
  setup(X) {
    const s = X.cast(); const nCross = Math.min(3, Math.max(1, X.n - 1)); const crossers = s.slice(0, nCross); const spotters = s.slice(nCross);
    if (!spotters.length) { spotters.push(crossers.pop()); }
    crossers.forEach((p) => X.role(p, 'cross', 'Crosser')); spotters.forEach((p) => X.role(p, 'spot', 'Spotter'));
    const cols = X.level >= 3 ? 4 : 3; const rows = X.level >= 3 ? 7 : 6;
    const creak = Array.from({ length: rows }, () => { const bad = new Set(shuffle([...Array(cols).keys()]).slice(0, rint(1, cols - 1))); return bad; });
    return { cols, rows, creak, known: Array.from({ length: rows }, () => new Set()), order: crossers.map((p) => p.id), ci: 0, row: 0, stir: 0 };
  },
  board(X, st, showCreak) {
    const cells = []; for (let r = st.rows - 1; r >= 0; r--) for (let c = 0; c < st.cols; c++) { const bad = st.creak[r].has(c); cells.push({ k: (showCreak && bad) || st.known[r].has(c) ? 'creak' : r === st.row ? 'next' : r < st.row ? 'done' : 'board', e: (showCreak && bad) || st.known[r].has(c) ? '✖' : '' }); }
    return { t: 'grid', cols: st.cols, cells };
  },
  cur(X, st) { return X.P(st.order[st.ci]); },
  phone(X, p, st) {
    const who = attic.cur(X, st);
    if (X.roleOf(p) === 'spot') return { role: 'Spotter', job: `You can see the creaky boards (✖). Tell ${who?.name || 'the crosser'} which board to step on. Row ${st.row + 1} is next.`, w: [attic.board(X, st, true)] };
    if (who?.id !== p.id) return { role: 'Crosser', job: st.order.indexOf(p.id) < st.ci ? 'You made it across. Help the others.' : `Wait your turn. ${who?.name || ''} is crossing.`, w: [attic.board(X, st, false)] };
    return { role: 'Crosser', job: 'Your turn. Ask the Spotter, then tap a board in the next row.', w: [attic.board(X, st, false), { t: 'btns', cols: st.cols, act: 'step', items: [...Array(st.cols).keys()].map((c) => ({ id: String(c), label: (st.cols === 3 ? ['Left', 'Middle', 'Right'] : ['Left', 'Mid-left', 'Mid-right', 'Right'])[c], state: st.known[st.row].has(c) ? 'bad' : '' })) }] };
  },
  tv(X, st) { const who = attic.cur(X, st); return { w: [attic.board(X, st, false), { t: 'big', text: who ? `${who.name} is crossing. Row ${st.row + 1} of ${st.rows}.` : '' }, { t: 'meter', label: 'Something is waking up', v: st.stir, max: 3, color: '#B3261E' }], prog: { v: st.ci, max: st.order.length, label: 'Across the attic' } }; },
  act(X, p, a, st) {
    if (a.a !== 'step' || attic.cur(X, st)?.id !== p.id) return; const c = Number(a.id); if (!(c >= 0 && c < st.cols)) return;
    if (st.creak[st.row].has(c)) { st.known[st.row].add(c); st.stir++; X.sfx('mn-floor'); X.drip(4, 'CREAK. Something stirred.', p); if (st.stir >= 3) X.fail(); return; }
    X.sfx('mn-steps'); st.row++;
    if (st.row >= st.rows) { st.ci++; st.row = 0; if (st.ci >= st.order.length) X.win(); }
  },
  bot(X, b, now, st) {
    const who = attic.cur(X, st); if (!who) return;
    if (X.roleOf(b) === 'spot' && !who.bot && X.once(b, `s${st.ci}-${st.row}`, 1.5)) { const safe = [...Array(st.cols).keys()].filter((c) => !st.creak[st.row].has(c)); const names = st.cols === 3 ? ['LEFT', 'MIDDLE', 'RIGHT'] : ['LEFT', 'MID-LEFT', 'MID-RIGHT', 'RIGHT']; X.bubble(b, `${who.name}, row ${st.row + 1}: step ${names[pick(safe)]}.`); }
    if (who.id === b.id && X.after(b, `st${st.row}`, 2, 3.5)) { const safe = [...Array(st.cols).keys()].filter((c) => !st.creak[st.row].has(c)); attic.act(X, b, { a: 'step', id: String(Math.random() < 0.88 ? pick(safe) : rint(0, st.cols - 1)) }, st); }
  },
};

const nursery = {
  key: 'nursery', name: 'The Nursery', type: 'timing', secs: 90,
  how: 'Tap STEP to creep to the door, but only while the doll is looking away. Watch the TV, not your phone.',
  setup(X) { X.seats.forEach((p) => X.role(p, 'creeper', 'Creeper')); return { doll: 'away', until: X.now() + 3000, prog: 0, goal: 40 * X.n + 10 * X.level, last: {}, frozen: {} }; },
  phone(X, p, st) { return { role: 'Creeper', job: 'Tap STEP to move. Only while the doll on the TV is facing away. If it catches you moving, it screams.', w: [{ t: 'pad', act: 'tap', label: (st.frozen[p.id] || 0) > X.now() ? 'FROZEN' : 'STEP', big: true }] }; },
  tv(X, st) { return { w: [{ t: 'doll', state: st.doll }], prog: { v: st.prog, max: st.goal, label: 'Distance to the door' } }; },
  act(X, p, a, st) {
    if (a.a !== 'tap') return; const now = X.now(); if ((st.frozen[p.id] || 0) > now || now - (st.last[p.id] || 0) < 280) return; st.last[p.id] = now;
    if (st.doll === 'look' && now > st.lookAt + 200) { st.prog = Math.max(0, st.prog - 8); st.frozen[p.id] = now + 1200; X.sfx('mn-giggle'); X.drip(3, `The doll saw ${p.name} move`, p); X.buzz(p, 'bad'); return; }
    st.prog++; if (st.prog >= st.goal) X.win();
  },
  tick(X, now, st) {
    if (now < st.until) return;
    const fast = X.level >= 3;
    if (st.doll === 'away') { st.doll = 'turn'; st.until = now + (fast ? 500 : 700); X.sfx('mn-creak'); } else if (st.doll === 'turn') { st.doll = 'look'; st.lookAt = now; st.until = now + rint(1500, 2600); } else { st.doll = 'away'; st.until = now + rint(fast ? 1800 : 2500, fast ? 4000 : 5000); }
  },
  bot(X, b, now, st) { if (st.doll === 'away' && Math.random() < 0.45) nursery.act(X, b, { a: 'tap' }, st); else if (st.doll === 'look' && Math.random() < 0.004) nursery.act(X, b, { a: 'tap' }, st); },
};

const BELLS = [['🦉', 'owl'], ['🗝️', 'key'], ['🕯️', 'candle'], ['💀', 'skull'], ['🌙', 'moon'], ['🐍', 'snake'], ['🌹', 'rose'], ['⚓', 'anchor']];
const ORD = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth'];
const chapel = {
  key: 'chapel', name: 'The Chapel', type: 'timing', secs: 110,
  how: 'Each phone is a bell. Read the riddle on the TV and ring the bells in that order. One wrong note and you start again.',
  setup(X) {
    const bells = BELLS.slice(0, Math.max(3, X.n)); const owners = {}; bells.forEach((b, i) => { owners[b[1]] = X.seats[i % X.n].id; });
    X.seats.forEach((p) => X.role(p, 'bell', 'Bell ringer'));
    const lens = X.level >= 3 ? [4, 5, 6] : [3, 4, 5];
    const riddles = lens.map((n) => { const ord = Array.from({ length: n }, (_, i) => bells[i < bells.length ? i : rint(0, bells.length - 1)][1]); const o = shuffle(ord); return { order: o, text: chapel.riddle(o) }; });
    return { bells, owners, riddles, ri: 0, got: 0 };
  },
  riddle(o) {
    const lines = o.map((b, i) => (i === o.length - 1 ? `The ${b} rings last.` : i === 0 ? `The ${b} rings first.` : Math.random() < 0.5 && i > 0 ? `Straight after the ${o[i - 1]}, the ${b}.` : `The ${b} rings ${ORD[i]}.`));
    return lines.join(' ');
  },
  phone(X, p, st) { const mine = st.bells.filter((b) => st.owners[b[1]] === p.id); return { role: 'Bell ringer', job: 'Ring your bell when it is its turn in the riddle. The riddle is on the TV.', w: mine.map((b) => ({ t: 'pad', act: 'ring', id: b[1], label: `${b[0]} The ${b[1]} bell` })) }; },
  tv(X, st) { const r = st.riddles[Math.min(st.ri, st.riddles.length - 1)]; return { w: [{ t: 'big', text: r.text }, { t: 'seq', items: r.order.map((b, i) => (i < st.got ? BELLS.find((x) => x[1] === b)[0] : '🔔')) }], prog: { v: st.ri, max: st.riddles.length, label: 'Riddles solved' } }; },
  act(X, p, a, st) {
    if (a.a !== 'ring' || st.owners[a.id] !== p.id) return; const r = st.riddles[st.ri];
    X.sfx('mn-bell');
    if (r.order[st.got] === a.id) { st.got++; if (st.got >= r.order.length) { st.ri++; st.got = 0; if (st.ri >= st.riddles.length) X.win(); else X.sfx('mn-clear'); } } else { st.got = 0; X.drip(3, `The ${a.id} rang out of turn`, p); }
  },
  bot(X, b, now, st) { const r = st.riddles[st.ri]; const next = r?.order[st.got]; if (next && st.owners[next] === b.id && X.after(b, `r${st.ri}-${st.got}`, 1.3, 2.2)) chapel.act(X, b, { a: 'ring', id: next }, st); },
};

const GEARS = ['Brass gear', 'Iron gear', 'Copper gear', 'Silver gear', 'Bone gear', 'Oak gear', 'Rusty gear', 'Golden gear'];
const clock = {
  key: 'clock', name: 'The Clock Tower', type: 'timing', secs: 120,
  how: 'Each gear moves both hands in its own way. Agree on a plan and set the clock to midnight. Every turn costs a little wax.',
  setup(X) {
    X.seats.forEach((p) => X.role(p, 'gear', 'Gear keeper'));
    const fx = [[0, 1], [1, -2]]; while (fx.length < X.n) { let v; do { v = [rint(-2, 2), rint(-3, 3)]; } while (!v[0] && !v[1]); fx.push(v); }
    const gears = shuffle(fx).slice(0, X.n).map((v, i) => ({ id: `g${i}`, name: GEARS[i], dh: v[0], dm: v[1], owner: X.seats[i].id }));
    let h; let m; do { h = rint(0, 11); m = rint(0, 11); } while (!h && !m);
    return { gears, h, m };
  },
  fxText(g) { const s = (n, w) => (n ? `${w} hand ${n > 0 ? 'forward' : 'back'} ${Math.abs(n)}` : null); return [s(g.dm, 'Minute'), s(g.dh, 'Hour')].filter(Boolean).join(', '); },
  phone(X, p, st) { const g = st.gears.find((x) => x.owner === p.id); if (!g) return { role: '', job: '', w: [] }; return { role: g.name, job: `Turning forward: ${clock.fxText(g)}. Turning back does the opposite. Tell the others, then plan.`, w: [{ t: 'btns', cols: 2, act: 'turn', items: [{ id: 'back', label: 'Turn back', emoji: '↺' }, { id: 'fwd', label: 'Turn forward', emoji: '↻' }] }] }; },
  tv(X, st) { return { w: [{ t: 'clock', h: st.h, m: st.m }], prog: { v: 0, max: 1, label: 'Set it to midnight' } }; },
  turn(st, g, s) { st.h = (((st.h + s * g.dh) % 12) + 12) % 12; st.m = (((st.m + s * g.dm) % 12) + 12) % 12; },
  act(X, p, a, st) { if (a.a !== 'turn') return; const g = st.gears.find((x) => x.owner === p.id); if (!g) return; clock.turn(st, g, a.id === 'back' ? -1 : 1); X.sfx('mn-tick'); X.drip(0.4, null, null); if (!st.h && !st.m) X.win(); },
  plan(st) { const key = (h, m) => h * 12 + m; const prev = new Map([[key(st.h, st.m), null]]); const q = [[st.h, st.m]]; while (q.length) { const [h, m] = q.shift(); if (!h && !m) break; for (const g of st.gears) for (const s of [1, -1]) { const nh = (((h + s * g.dh) % 12) + 12) % 12; const nm = (((m + s * g.dm) % 12) + 12) % 12; if (!prev.has(key(nh, nm))) { prev.set(key(nh, nm), [h, m, g, s]); q.push([nh, nm]); } } } let k = 0; const steps = []; while (prev.get(k)) { const [h, m, g, s] = prev.get(k); steps.unshift([g, s]); k = key(h, m); } return steps; },
  bot(X, b, now, st) { if (!X.after(b, 'g', 2.5, 3.5)) return; const step = clock.plan(st)[0]; if (step && step[0].owner === b.id) clock.act(X, b, { a: 'turn', id: step[1] > 0 ? 'fwd' : 'back' }, st); else if (!X.P(st.gears[0].owner).bot && X.once(b, 'explain', 2)) { const g = st.gears.find((x) => x.owner === b.id); X.bubble(b, `My ${g.name.toLowerCase()} moves the ${clock.fxText(g).toLowerCase()}.`); } },
};

const well = {
  key: 'well', name: 'The Well', type: 'timing', secs: 90,
  how: 'Pull the rope in turn. When your phone says PULL, tap. Miss your turn and the bucket slips.',
  setup(X) { X.seats.forEach((p) => X.role(p, 'puller', 'Puller')); const order = shuffle(X.seats.map((p) => p.id)); return { order, i: 0, h: 0, goal: 18 + X.level * 4, until: X.now() + 4000, win: X.level >= 4 ? 1300 : 1700 }; },
  phone(X, p, st) { const mine = st.order[st.i] === p.id; return { role: 'Puller', job: 'Wait for your turn. When the button glows, PULL.', w: [{ t: 'pad', act: 'tap', label: mine ? 'PULL!' : `Wait... ${X.P(st.order[st.i])?.name || ''}`, hot: mine, big: true }] }; },
  tv(X, st) { return { w: [{ t: 'meter', label: 'The bucket', v: st.h, max: st.goal, color: '#5A8DEE', vertical: true }, { t: 'tiles', cols: st.order.length, items: st.order.map((id, i) => ({ who: id, label: X.P(id)?.name, state: i === st.i ? 'hot' : '' })) }], prog: { v: st.h, max: st.goal, label: 'Bucket raised' } }; },
  next(X, st) { st.i = (st.i + 1) % st.order.length; st.until = X.now() + st.win; },
  act(X, p, a, st) {
    if (a.a !== 'tap') return;
    if (st.order[st.i] === p.id) { st.h++; X.sfx('mn-rope'); well.next(X, st); if (st.h >= st.goal) X.win(); } else { st.h = Math.max(0, st.h - 1); X.drip(1, `${p.name} pulled out of turn`, p); }
  },
  tick(X, now, st) { if (now > st.until) { st.h = Math.max(0, st.h - 2); X.drip(1, `${X.P(st.order[st.i])?.name} missed their pull`); well.next(X, st); } },
  bot(X, b, now, st) { if (st.order[st.i] === b.id && X.after(b, `p${st.h}-${st.i}`, 0.35, 0.9)) well.act(X, b, { a: 'tap' }, st); },
};

// ================================================================== SPEED ROOMS
const KIT = [['🦇', 'Bat Wing'], ['🐸', 'Toad'], ['🌿', 'Nightshade'], ['👁️', 'Newt Eye'], ['🦷', 'Wolf Tooth'], ['🕸️', 'Spider Silk'], ['🧂', 'Grave Salt'], ['🍄', 'Toadstool'], ['🐍', 'Snake Skin'], ['🌶️', 'Dragon Pepper'], ['🪶', 'Crow Feather'], ['🦴', 'Finger Bone']];
const ACTS = [['🔪', 'Chop'], ['🔥', 'Boil'], ['🥄', 'Stir'], ['🫗', 'Pour']];
const kitchen = {
  key: 'kitchen', name: 'The Kitchen', type: 'speed', secs: 110,
  how: 'The recipe is on the TV. Whoever holds the next ingredient or tool taps it. Wrong order and the pot boils over.',
  setup(X) { X.seats.forEach((p) => X.role(p, 'cook', 'Cook')); const st = { pot: 0, pots: X.level >= 3 ? 3 : 2 }; kitchen.load(X, st); return st; },
  load(X, st) {
    const items = [...shuffle(KIT).slice(0, Math.max(6, X.n * 2)), ...ACTS].map(([e, name], i) => ({ id: `k${st.pot}-${i}`, e, name }));
    const ing = items.filter((it) => !ACTS.some((a) => a[1] === it.name)); const tools = items.filter((it) => ACTS.some((a) => a[1] === it.name));
    const n = 5 + Math.min(2, X.level - 1); st.steps = Array.from({ length: n }, (_, i) => (i % 2 === 1 ? pick(tools) : pick(ing)));
    st.k = 0; st.hands = deal(shuffle(items), X.seats); st.stepAt = X.now();
  },
  stepText(it) { return ACTS.some((a) => a[1] === it.name) ? `${it.name}!` : `Add the ${it.name}`; },
  phone(X, p, st) { return { role: 'Cook', job: 'Read the recipe on the TV. When the next step is yours, tap it.', w: [{ t: 'btns', cols: 2, act: 'use', items: (st.hands.get(p.id) || []).map((it) => ({ id: it.id, label: it.name, emoji: it.e })) }] }; },
  tv(X, st) { return { w: [{ t: 'list', big: true, items: st.steps.map((it, i) => `${i < st.k ? '✓' : i === st.k ? '▶' : ' '} ${it.e} ${kitchen.stepText(it)}`), at: st.k }, { t: 'note', text: `Antidote ${st.pot + 1} of ${st.pots}` }], prog: { v: st.pot, max: st.pots, label: 'Antidotes brewed' } }; },
  act(X, p, a, st) {
    if (a.a !== 'use') return; const it = (st.hands.get(p.id) || []).find((x) => x.id === a.id); if (!it) return;
    if (st.steps[st.k].id === it.id) { st.k++; st.stepAt = X.now(); X.sfx('mn-bubble'); if (st.k >= st.steps.length) { st.pot++; if (st.pot >= st.pots) X.win(); else { X.sfx('mn-clear'); kitchen.load(X, st); } } } else X.drip(3, `The pot boiled over: not the ${it.name}`, p);
  },
  tick(X, now, st) { if (now - st.stepAt > 12000) { st.stepAt = now; X.drip(2, 'The pot is going cold'); } },
  bot(X, b, now, st) { const want = st.steps[st.k]; if (want && (st.hands.get(b.id) || []).some((x) => x.id === want.id) && X.after(b, `k${st.pot}-${st.k}`, 2, 4)) kitchen.act(X, b, { a: 'use', id: want.id }, st); },
};

const CTRL = ['Bone Lever', 'Grimwald Valve', 'Widow Switch', 'Coffin Crank', 'Raven Dial', 'Banshee Button', 'Moth Fuse', 'Tomb Toggle', 'Wraith Wheel', 'Gallows Lever', 'Crypt Breaker', 'Hex Knob', 'Leech Pump', 'Hearse Handle', 'Ghoul Gauge', 'Vicar Valve'];
const fusebox = {
  key: 'fusebox', name: 'The Fuse Box', type: 'speed', secs: 100,
  how: 'Orders appear on the wrong phones. Shout yours out. If the switch is yours, flip it fast.',
  setup(X) {
    X.seats.forEach((p) => X.role(p, 'tech', 'Electrician'));
    const names = shuffle(CTRL).slice(0, X.n * 3);
    const ctrls = names.map((name, i) => ({ id: `c${i}`, name, type: i % 3 === 0 ? 'dial' : i % 3 === 1 ? 'toggle' : 'button', v: 0, owner: X.seats[i % X.n].id }));
    ctrls.forEach((c) => { c.v = c.type === 'dial' ? 1 : 0; });
    return { ctrls, orders: [], done: 0, goal: 9 + X.level * 2, nextAt: X.now() + 1500 };
  },
  orderText(o, c) { return c.type === 'dial' ? `Set the ${c.name} to ${o.v}` : c.type === 'toggle' ? `Flip the ${c.name} ${o.v ? 'ON' : 'OFF'}` : `Press the ${c.name}`; },
  phone(X, p, st) {
    const mine = st.orders.filter((o) => o.to === p.id);
    const items = st.ctrls.filter((c) => c.owner === p.id).flatMap((c) => (c.type === 'dial' ? [1, 2, 3].map((v) => ({ id: `${c.id}:${v}`, label: `${c.name} ${v}`, state: c.v === v ? 'sel' : '' })) : c.type === 'toggle' ? [{ id: `${c.id}:${c.v ? 0 : 1}`, label: `${c.name}: ${c.v ? 'ON' : 'OFF'}`, state: c.v ? 'sel' : '' }] : [{ id: `${c.id}:1`, label: c.name, emoji: '🔘' }]));
    return { role: 'Electrician', job: 'Shout the order on your screen. If someone shouts one of your switches, do it.', w: [...mine.map((o) => ({ t: 'card', text: fusebox.orderText(o, st.ctrls.find((c) => c.id === o.c)), style: 'alert', ends: X.wall(o.ends), start: X.wall(o.start) })), { t: 'btns', cols: 3, act: 'set', items }] };
  },
  tv(X, st) { return { w: [{ t: 'meter', label: 'Lights', v: Math.max(0, 100 - st.orders.filter((o) => X.now() - o.start > 5000).length * 25), max: 100, color: '#F2C230' }], prog: { v: st.done, max: st.goal, label: 'Orders done' } }; },
  act(X, p, a, st) {
    if (a.a !== 'set') return; const [cid, vs] = String(a.id).split(':'); const c = st.ctrls.find((x) => x.id === cid && x.owner === p.id); if (!c) return; const v = Number(vs);
    if (c.type !== 'button') c.v = v; X.sfx(c.type === 'button' ? 'mn-switch' : 'mn-switch');
    const o = st.orders.find((x) => x.c === c.id && (c.type === 'button' || x.v === v));
    if (o) { st.orders = st.orders.filter((x) => x !== o); st.done++; if (st.done >= st.goal) X.win(); } else if (!st.orders.some((x) => x.c === c.id)) X.drip(1, `Nobody asked for the ${c.name}`, p);
  },
  tick(X, now, st) {
    for (const o of [...st.orders]) if (now > o.ends) { st.orders = st.orders.filter((x) => x !== o); X.drip(2, 'The lights flickered'); X.sfx('mn-spark'); }
    if (now >= st.nextAt && st.orders.length < Math.min(X.n, 4)) {
      const c = pick(st.ctrls.filter((x) => !st.orders.some((o) => o.c === x.id))); if (!c) return;
      const v = c.type === 'dial' ? pick([1, 2, 3].filter((x) => x !== c.v)) : c.type === 'toggle' ? (c.v ? 0 : 1) : 1;
      const to = pick(X.seats.filter((s) => s.id !== c.owner && !st.orders.some((o) => o.to === s.id))) || pick(X.seats.filter((s) => !st.orders.some((o) => o.to === s.id))) || pick(X.seats);
      st.orders.push({ c: c.id, v, to: to.id, start: now, ends: now + (11 - X.level * 0.6) * 1000 }); st.nextAt = now + 1800;
    }
  },
  bot(X, b, now, st) {
    for (const o of st.orders) if (o.to === b.id && X.once(b, `o${o.start}`, 0.8)) X.bubble(b, `${fusebox.orderText(o, st.ctrls.find((c) => c.id === o.c))}!`);
    const o = st.orders.find((x) => st.ctrls.find((c) => c.id === x.c).owner === b.id);
    if (o && X.after(b, `do${o.start}`, 2, 4)) fusebox.act(X, b, { a: 'set', id: `${o.c}:${o.v}` }, st);
  },
};

const DISH = [['🍗', 'Roast Goose'], ['🍮', 'Blood Pudding'], ['🍷', 'Claret'], ['🥧', 'Eel Pie'], ['🍲', 'Gruel'], ['🧁', 'Fairy Cake'], ['🫖', 'Tea'], ['🍝', 'Worm Pasta'], ['🧀', 'Stilton'], ['🍾', 'Champagne'], ['🦞', 'Lobster'], ['🍰', 'Black Forest']];
const GUESTS = ['Lady Grimsby', 'The Colonel', 'Baron Vorst', 'Miss Pale', 'The Bishop', 'Old Mrs Hatch'];
const dining = {
  key: 'dining', name: 'The Dining Room', type: 'speed', secs: 100,
  how: 'The ghostly guests want food. Their orders are on the TV. If you hold the dish, tap it, then the guest.',
  setup(X) {
    X.seats.forEach((p) => X.role(p, 'waiter', 'Waiter'));
    const dishes = shuffle(DISH).slice(0, Math.min(DISH.length, X.n * 3)).map(([e, name], i) => ({ id: `d${i}`, e, name }));
    const guests = GUESTS.slice(0, 4).map((name, i) => ({ id: `g${i}`, name, want: null, start: 0, ends: 0, next: X.now() + 800 + i * 1500 }));
    return { dishes, hands: deal(dishes, X.seats), guests, served: 0, goal: 8 + X.level * 2, sel: {} };
  },
  phone(X, p, st) { const sel = st.sel[p.id]; return { role: 'Waiter', job: 'Look at the orders on the TV. Tap your dish, then the guest who wants it.', w: [{ t: 'btns', cols: 3, act: 'dish', items: (st.hands.get(p.id) || []).map((d) => ({ id: d.id, label: d.name, emoji: d.e, state: sel === d.id ? 'sel' : '' })) }, { t: 'btns', cols: 2, act: 'guest', items: st.guests.map((g) => ({ id: g.id, label: g.name, state: sel ? '' : 'off' })) }] }; },
  tv(X, st) { return { w: [{ t: 'tiles', cols: st.guests.length, items: st.guests.map((g) => { const d = st.dishes.find((x) => x.id === g.want); return { label: g.name, emoji: d ? d.e : '🍽️', sub: d ? d.name : 'waiting...', state: d ? 'hot' : '', ends: d ? X.wall(g.ends) : null, start: d ? X.wall(g.start) : null }; }) }], prog: { v: st.served, max: st.goal, label: 'Guests served' } }; },
  act(X, p, a, st) {
    if (a.a === 'dish' && (st.hands.get(p.id) || []).some((d) => d.id === a.id)) { st.sel[p.id] = st.sel[p.id] === a.id ? null : a.id; return; }
    if (a.a === 'guest' && st.sel[p.id]) { const g = st.guests.find((x) => x.id === a.id); const did = st.sel[p.id]; st.sel[p.id] = null; if (!g) return; if (g.want === did) { g.want = null; g.next = X.now() + 1500; st.served++; X.sfx('mn-bottle'); if (st.served >= st.goal) X.win(); } else X.drip(1, `${g.name} did not order that`, p); }
  },
  tick(X, now, st) {
    for (const g of st.guests) {
      if (g.want && now > g.ends) { g.want = null; g.next = now + 1200; X.drip(3, `${g.name} lost their temper`); X.sfx('mn-moan'); }
      if (!g.want && now >= g.next) { const free = st.dishes.filter((d) => !st.guests.some((x) => x.want === d.id)); if (free.length) { g.want = pick(free).id; g.start = now; g.ends = now + (16 - X.level) * 1000; } }
    }
  },
  bot(X, b, now, st) { const g = st.guests.find((x) => x.want && (st.hands.get(b.id) || []).some((d) => d.id === x.want)); if (g && X.after(b, `s${g.id}${g.start}`, 2, 4)) { st.sel[b.id] = g.want; dining.act(X, b, { a: 'guest', id: g.id }, st); } },
};

// ================================================================== MEMORY AND OBSERVATION ROOMS
const NOTES = [['#E5484D', 'Red'], ['#F2C230', 'Yellow'], ['#2FB36B', 'Green'], ['#3E8EDE', 'Blue'], ['#A970FF', 'Purple'], ['#FF8A3D', 'Orange'], ['#F06FB0', 'Pink'], ['#26C6C6', 'Teal']];
const music = {
  key: 'music', name: 'The Music Room', type: 'memory', secs: 120,
  how: 'Watch the piano play a tune. Each of you has some of its keys. Play it back, in order, together.',
  setup(X) {
    X.seats.forEach((p) => X.role(p, 'player', 'Pianist'));
    const nk = Math.min(8, Math.max(4, X.n * 2)); const keys = NOTES.slice(0, nk).map(([c, name], i) => ({ id: `n${i}`, c, name, i, owner: X.seats[i % X.n].id }));
    const lens = X.level >= 3 ? [4, 5, 6, 7] : [3, 4, 5, 6];
    const st = { keys, rounds: lens.map((n) => Array.from({ length: n }, () => pick(keys).id)), ri: 0, got: 0, mode: 'show', showAt: X.now() + 2000, lit: null };
    return st;
  },
  phone(X, p, st) { return { role: 'Pianist', job: st.mode === 'show' ? 'Watch the TV. Remember when your colours play.' : 'Play your keys when it is their turn.', w: [{ t: 'btns', cols: 2, act: 'key', items: st.keys.filter((k) => k.owner === p.id).map((k) => ({ id: k.id, label: k.name, color: k.c, state: st.mode === 'show' ? 'off' : '' })) }] }; },
  tv(X, st) { const r = st.rounds[st.ri] || []; return { w: [{ t: 'tiles', cols: st.keys.length, items: st.keys.map((k) => ({ color: k.c, label: k.name, state: st.lit === k.id ? 'lit' : 'key' })) }, { t: 'big', text: st.mode === 'show' ? 'Listen...' : `Your turn. ${st.got} of ${r.length}` }], prog: { v: st.ri, max: st.rounds.length, label: 'Tunes played back' } }; },
  act(X, p, a, st) {
    if (a.a !== 'key' || st.mode !== 'play') return; const k = st.keys.find((x) => x.id === a.id && x.owner === p.id); if (!k) return;
    st.lit = k.id; st.litUntil = X.now() + 300; X.sfx(`mn-note${k.i}`);
    const r = st.rounds[st.ri];
    if (r[st.got] === k.id) { st.got++; if (st.got >= r.length) { st.ri++; st.got = 0; if (st.ri >= st.rounds.length) X.win(); else { st.mode = 'show'; st.showAt = X.now() + 1500; } } } else { X.drip(3, 'A wrong note. The piano slammed its lid.', p); st.got = 0; st.mode = 'show'; st.showAt = X.now() + 1500; }
  },
  tick(X, now, st) {
    if (st.mode === 'play') { if (st.lit && now > st.litUntil) st.lit = null; return; }
    const r = st.rounds[st.ri]; if (!r) return; const step = 750; const k = Math.floor((now - st.showAt) / step);
    if (k < 0) { st.lit = null; return; }
    if (k >= r.length) { st.mode = 'play'; st.lit = null; return; }
    const id = r[k]; const within = (now - st.showAt) % step < step * 0.7; const was = st.lit; st.lit = within ? id : null;
    if (st.lit && st.lit !== was) X.sfx(`mn-note${st.keys.find((x) => x.id === id).i}`);
  },
  bot(X, b, now, st) { if (st.mode !== 'play') return; const r = st.rounds[st.ri]; const want = r?.[st.got]; const k = st.keys.find((x) => x.id === want); if (k?.owner === b.id && X.after(b, `n${st.ri}-${st.got}`, 0.8, 1.4)) music.act(X, b, { a: 'key', id: Math.random() < 0.95 ? want : pick(st.keys.filter((x) => x.owner === b.id)).id }, st); },
};

const ART = ['💀', '🌙', '🦉', '🕯️', '🗝️', '🌹', '🐍', '🦇', '🕸️', '⚰️', '🔮', '🪦', '🐈‍⬛', '🌲', '👁️', '🍷'];
const gallery = {
  key: 'gallery', name: 'The Portrait Gallery', type: 'memory', secs: 120,
  how: 'Everyone has the same painting, except one of you. Describe yours out loud, then accuse the odd one out.',
  setup(X) { X.seats.forEach((p) => X.role(p, 'viewer', 'Viewer')); const st = { round: 0, rounds: X.level >= 3 ? 3 : 2, acc: {} }; gallery.load(X, st); return st; },
  load(X, st) {
    const base = shuffle(ART).slice(0, 9); const odd = pick(X.seats).id; const cell = rint(0, 8); const swap = pick(ART.filter((e) => !base.includes(e)));
    st.base = base; st.odd = odd; st.cell = cell; st.swap = swap; st.acc = {}; st.started = X.now();
  },
  painting(st, pid) { const cells = st.base.map((e, i) => ({ k: 'frame', e: pid === st.odd && i === st.cell ? st.swap : e })); return { t: 'grid', cols: 3, cells }; },
  phone(X, p, st) { return { role: 'Viewer', job: 'Describe your painting, row by row. Then accuse whoever has a different one.', w: [gallery.painting(st, p.id), { t: 'btns', cols: 2, act: 'accuse', items: X.seats.filter((s) => s.id !== p.id).map((s) => ({ id: s.id, label: `Accuse ${s.name}`, state: st.acc[p.id] === s.id ? 'sel' : '' })) }] }; },
  tv(X, st) { const votes = {}; Object.values(st.acc).forEach((id) => { votes[id] = (votes[id] || 0) + 1; }); return { w: [{ t: 'tiles', cols: X.n, items: X.seats.map((s) => ({ who: s.id, label: s.name, sub: votes[s.id] ? `${votes[s.id]} accuse` : '', state: votes[s.id] ? 'hot' : '' })) }, { t: 'big', text: `Painting ${st.round + 1} of ${st.rounds}. Need ${Math.ceil(X.n / 2)} to agree.` }], prog: { v: st.round, max: st.rounds, label: 'Changed paintings found' } }; },
  act(X, p, a, st) {
    if (a.a !== 'accuse' || !X.P(a.id) || a.id === p.id) return; st.acc[p.id] = a.id; X.sfx('mn-page');
    const need = Math.ceil(X.n / 2); const votes = Object.values(st.acc).filter((id) => id === a.id).length;
    if (votes >= need) { if (a.id === st.odd) { st.round++; if (st.round >= st.rounds) X.win(); else { X.sfx('mn-clear'); gallery.load(X, st); } } else { X.drip(5, `${X.P(a.id).name}'s painting was fine`, null); X.sfx('mn-moan'); gallery.load(X, st); } }
  },
  bot(X, b, now, st) {
    if (X.after(b, `desc${st.round}`, 4, 7)) { const rows = ['top', 'middle', 'bottom']; const r = rint(0, 2); const mine = gallery.painting(st, b.id).cells; X.bubble(b, `Mine, ${rows[r]} row: ${mine.slice(r * 3, r * 3 + 3).map((c) => c.e).join(' ')}`); }
    if (!st.acc[b.id] && X.now() - st.started > 12000 && X.after(b, `acc${st.round}`, 4, 10)) { const target = Math.random() < 0.7 && st.odd !== b.id ? st.odd : pick(X.seats.filter((s) => s.id !== b.id)).id; gallery.act(X, b, { a: 'accuse', id: target }, st); }
  },
};

const PICS = [['🦇', 'Bat'], ['🕷️', 'Spider'], ['🧛', 'Vampire'], ['🧟', 'Zombie'], ['🐺', 'Werewolf'], ['👻', 'Ghost'], ['🎃', 'Pumpkin'], ['⚰️', 'Coffin'], ['🔪', 'Knife'], ['🧙', 'Witch'], ['🕯️', 'Candle'], ['🪦', 'Grave'], ['🐈‍⬛', 'Black Cat'], ['💀', 'Skull'], ['🦉', 'Owl'], ['🧹', 'Broom'], ['🔔', 'Bell'], ['🌕', 'Full Moon']];
const seance = {
  key: 'seance', name: 'The Seance Room', type: 'memory', secs: 120,
  how: 'No talking. The Medium mimes the picture. Everyone else taps the right one. If someone talks, report them.',
  setup(X) { X.seats.forEach((p) => X.role(p, 'sitter', 'Sitter')); const st = { k: 0, goal: X.level >= 3 ? 5 : 4, mi: 0, reports: {}, wrong: {} }; st.order = X.cast().map((p) => p.id); seance.load(X, st); return st; },
  load(X, st) { st.pic = pick(PICS); st.opts = shuffle([st.pic, ...shuffle(PICS.filter((p) => p !== st.pic)).slice(0, 5)]); st.medium = st.order[st.mi % st.order.length]; st.wrong = {}; st.at = X.now(); X.role(X.P(st.medium), 'medium', 'Medium'); X.seats.filter((s) => s.id !== st.medium).forEach((s) => X.role(s, 'sitter', 'Sitter')); },
  phone(X, p, st) {
    const report = { t: 'btns', cols: 3, act: 'report', small: true, items: X.seats.filter((s) => s.id !== p.id).map((s) => ({ id: s.id, label: `${s.name} SPOKE` })) };
    if (p.id === st.medium) return { role: 'Medium', job: 'Mime this. No words, no sounds. Point, act, wiggle.', w: [{ t: 'card', text: st.pic[0], sub: st.pic[1], style: 'huge' }, report] };
    return { role: 'Sitter', job: `Watch ${X.P(st.medium)?.name}. Tap the picture they are miming. Not a word!`, w: [{ t: 'btns', cols: 3, act: 'guess', items: st.opts.map((o) => ({ id: o[1], label: o[1], emoji: o[0], state: (st.wrong[p.id] || []).includes(o[1]) ? 'bad' : '' })) }, report] };
  },
  tv(X, st) { const m = X.P(st.medium); const hint = m?.bot ? Math.min(1, (X.now() - st.at) / 12000) : 0; return { w: [{ t: 'big', text: `${m?.name || ''} is the Medium. Silence.` }, ...(m?.bot ? [{ t: 'card', text: st.pic[0], style: 'huge', blur: Math.round((1 - hint) * 24) }] : [])], prog: { v: st.k, max: st.goal, label: 'Spirits understood' } }; },
  act(X, p, a, st) {
    if (a.a === 'guess' && p.id !== st.medium) {
      if ((st.wrong[p.id] || []).includes(a.id)) return;
      if (a.id === st.pic[1]) { st.k++; st.mi++; X.sfx('mn-clear'); if (st.k >= st.goal) X.win(); else seance.load(X, st); } else { (st.wrong[p.id] = st.wrong[p.id] || []).push(a.id); X.drip(2, `Not the ${a.id}`, p); }
    }
    if (a.a === 'report' && X.P(a.id) && a.id !== p.id) {
      const r = st.reports[a.id] = st.reports[a.id] || new Set(); r.add(p.id);
      if (r.size >= 2) { st.reports[a.id] = new Set(); X.drip(5, `${X.P(a.id).name} spoke. The candle flared.`, X.P(a.id)); X.sfx('mn-whisper'); }
    }
  },
  bot(X, b, now, st) { if (b.id !== st.medium && X.after(b, `g${st.k}`, 6, 12)) { const good = Math.random() < 0.55; seance.act(X, b, { a: 'guess', id: good ? st.pic[1] : pick(st.opts.filter((o) => o !== st.pic && !(st.wrong[b.id] || []).includes(o[1])))[1] }, st); } },
};

const ROOMS = { library, maze, cellar, greenhouse, mirror, bedroom, study, staircase, ballroom, attic, nursery, chapel, clock, well, kitchen, fusebox, dining, music, gallery, seance };
module.exports = { ROOMS, rint, pick, shuffle, deal };
