// Plays every 8-bit room with bots on a fake clock, many times over, and reports how often bots clear each stage.
// node test/mn-px-rooms.js [runs]
const PXR = require('../server/mn-px');
const RUNS = Number(process.argv[2] || 10); const N = Number(process.env.N || 4);
function fakeX(n) {
  let t = 1e6; const seats = []; for (let i = 0; i < n; i++) seats.push({ id: 'b' + i, name: 'Bot' + i, bot: true, connected: true, color: '#fff', mx: {} });
  const X = { R: {}, seats, n, level: 1, P: (id) => seats.find((p) => p.id === id), now: () => t, wall: (x) => x, drip: (a) => { X.dripped += a; }, gain: () => {}, sfx: () => {}, note: () => {}, buzz: () => {}, dripped: 0,
    after: (b, tag, lo, hi) => { if (b.mx[tag] == null) b.mx[tag] = t + (lo + Math.random() * (hi - lo)) * 1000; if (t >= b.mx[tag]) { delete b.mx[tag]; return true; } return false; },
    adv: (ms) => { t += ms; } };
  return X;
}
function play(def, kind, n) {
  const X = fakeX(kind === 'demo' ? 0 : n); PXR.GHOST.mx = {};
  const st = def.make(X, kind === 'boss' || kind === 'hub' ? { memories: ['ice', 'cellar', 'dodge', 'chat'], keys: 2, stubs: 1, todo: ['ice'], done: [], left: 1, mercy: false, secrets: PXR.makeSecrets() } : kind); st.t0 = X.now();
  const limit = (def.secs?.[kind] || 300) * 1000; let el = 0;
  const bots = kind === 'demo' ? [PXR.GHOST] : X.seats;
  while (!st.done && el < limit) { X.adv(200); el += 200; def.tick?.(X, st, X.now(), 200); for (const b of bots) def.bot?.(X, b, st, X.now()); }
  return { res: st.done || 'time', secs: Math.round(el / 1000), drip: Math.round(X.dripped) };
}
const rooms = { ...PXR.PX_ROOMS, mercy: PXR.MERCY, boss: PXR.BOSS };
for (const [k, def] of Object.entries(rooms)) {
  const kinds = k === 'mercy' ? [1] : k === 'boss' ? ['boss'] : ['demo', 'practice', 1, 2, 3];
  for (const kind of kinds) {
    let w = 0; let secs = 0; let drip = 0; const t = Date.now();
    for (let i = 0; i < RUNS; i++) { const r = play(def, kind, N); if (r.res === 'win') w++; secs += r.secs; drip += r.drip; }
    console.log(`${k.padEnd(7)} ${String(kind).padEnd(9)} won ${w}/${RUNS}  avg ${Math.round(secs / RUNS)}s  drip ${(drip / RUNS).toFixed(1)}%  (${Date.now() - t}ms)`);
  }
}
