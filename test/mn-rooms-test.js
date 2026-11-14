'use strict';
// Plays every Mansion room, the Front Door and every possession with bots on a fake clock.
// Checks: no crashes, every phone and TV view renders, and bots can clear each room.
// Run: node test/mn-rooms-test.js [rounds]
process.env.BC_COMMONS_API = 'http://127.0.0.1:9';
const { Mansion } = require('../server/mansion');
const { ROOMS } = require('../server/mn-rooms');
const { POSSESS } = require('../server/mn-possess');

const rounds = Number(process.argv[2] || 6);
let now = 1e12; let bad = 0;
const hooks = { toHost() {}, toPlayer() {} };

function game(n) {
  const g = new Mansion('TEST', hooks, { test: true });
  g.sync = () => {}; g.clock = () => now; g.sfx = () => {};
  for (let i = 0; i < n; i++) g.addBot();
  return g;
}
function views(g) { const v = g.view(null); JSON.stringify(v); for (const p of g.players) JSON.stringify(g.view(p)); return v; }

function playRoom(def, n, level, extra, isPoss) {
  const g = game(n); g.phase = isPoss ? 'POSSESS' : def.key === 'door' ? 'DOOR' : 'ROOM'; g.d = { step: 'play', key: def.key, who: null };
  const R = { key: def.key, level, roles: {}, bubbles: [], events: [], evSeq: 0, done: null, burn: true, ends: Infinity };
  const X = g.makeX(R); const who = g.players[0];
  if (isPoss) { R.who = who.id; g.d.who = who.id; }
  R.st = def.setup(X, isPoss ? who : extra); g.active = { X, R, def };
  const secs = def.secs; R.start = now; R.ends = now + secs * 1000; g.lastTick = now;
  const start = g.candle; let t = 0;
  while (!R.done && t < secs * 1000 + 400) {
    now += 200; t += 200;
    if (isPoss && (['door', 'free'].includes(def.key) || Math.random() < 0.5)) possBot(def, X, who, R.st);
    g.tick();
    if (t % 1000 === 0) views(g);
  }
  views(g);
  return { done: R.done, secs: t / 1000, wax: Math.round((start - g.candle) * 10) / 10, bubbles: R.bubbles.length };
}
// a "perfect" possessed player, to prove each challenge can be won
function possBot(def, X, p, st) {
  const A = (a) => def.act(X, p, a, st);
  switch (def.key) {
    case 'door': A({ a: 'tap' }); break;
    case 'steady': A({ a: 'trace', prog: Math.min(1, (st.prog || 0) + 0.04), x: 0.5, y: 0.5 }); break;
    case 'free': A({ a: 'tap' }); break;
    case 'spell': A({ a: 'cast', text: st.word }); break;
    case 'blink': if (st.state === 'flicker') A({ a: 'tap' }); break;
    case 'key': if (st.clean.has(st.key)) A({ a: 'grab' }); else A({ a: 'rub', ids: [st.clean.size, st.clean.size + 1] }); break;
    case 'back': if (!st.down) A({ a: 'down' }); break;
    case 'real': A({ a: 'pick', id: String(1 - st.rounds[st.i].fake) }); break;
    default:
  }
}

const out = [];
for (const [key, def] of Object.entries(ROOMS)) {
  const res = { win: 0, fail: 0, secs: [], wax: [] };
  for (let r = 0; r < rounds; r++) {
    const n = [4, 3, 5, 8, 6, 2][r % 6]; const level = 1 + (r % 5);
    try { const x = playRoom(def, n, level); res[x.done === 'win' ? 'win' : 'fail']++; res.secs.push(x.secs); res.wax.push(x.wax); } catch (e) { bad++; console.error(`CRASH ${key} n=${n}`, e); }
  }
  const avg = (a) => Math.round(a.reduce((s, v) => s + v, 0) / Math.max(1, a.length));
  out.push(`${key.padEnd(11)} ${def.type.padEnd(7)} won ${res.win}/${rounds}  avg ${avg(res.secs)}s of ${def.secs}  wax lost ${avg(res.wax)}%`);
  if (res.win === 0) { bad++; out.push(`  ^ bots never cleared ${key}`); }
}
// the front door, with 0 to 5 key pieces
const g0 = game(4); const DOOR = g0.constructor && require('../server/mansion');
for (const keys of [5, 3, 0]) {
  try {
    const Door = require('../server/mansion').__door;
    if (!Door) break;
    const x = playRoom(Door, 4, 5, keys); out.push(`door keys=${keys} ${x.done} in ${x.secs}s, wax ${x.wax}%`);
  } catch (e) { bad++; console.error('CRASH door', e); }
}
for (const [key, def] of Object.entries(POSSESS)) {
  let win = 0;
  for (let r = 0; r < rounds; r++) { try { const x = playRoom(def, 4, 1, null, true); if (x.done === 'win') win++; } catch (e) { bad++; console.error(`CRASH possess ${key}`, e); } }
  out.push(`possess ${key.padEnd(7)} perfect player won ${win}/${rounds}`);
  if (!win) bad++;
}
console.log(out.join('\n'));
console.log(bad ? `\n${bad} PROBLEMS` : '\nall rooms OK');
process.exit(bad ? 1 : 0);
