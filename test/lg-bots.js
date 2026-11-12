// Plays whole Land Grab games with server-side bots and a robot TV. Run the server with WR_SPEED=0.05 first.
// URL, N (players, 5 to 10), GAMES (how many games), HOST_DELAY (ms before the TV says a line is done)
const { io } = require('socket.io-client');
const URL = process.env.URL || 'http://localhost:3100';
const N = Number(process.env.N || 7);
const GAMES = Number(process.env.GAMES || 1);
const sleep = (t) => new Promise((r) => setTimeout(r, t));

async function one() {
  const host = io(URL, { forceNew: true });
  const code = await new Promise((r) => host.emit('host:create', { game: 'lg', test: true }, (x) => r(x.code)));
  const phases = []; const seen = {}; let end = null; let last = null; let errors = 0;
  host.on('state', (s) => {
    last = s;
    const tag = s.phase + (s.step ? `:${s.step}` : '');
    if (phases[phases.length - 1] !== tag) phases.push(tag);
    if (s.cue && !seen[s.cue.id]) { seen[s.cue.id] = 1; setTimeout(() => host.emit('host:cueDone', { id: s.cue.id }), Number(process.env.HOST_DELAY || 20)); }
    if (s.phase === 'END' && s.step === 'reveal') end = s;
  });
  for (let i = 0; i < N; i++) await new Promise((r) => host.emit('host:addBot', {}, r));
  const st = await new Promise((r) => host.emit('host:start', {}, r));
  if (st?.error) { console.log('start error', st.error); errors++; }
  const t0 = Date.now();
  while (!end && Date.now() - t0 < Number(process.env.MAXMS || 240000)) await sleep(100);
  host.close();
  if (!end) { console.log('DID NOT FINISH. Last:', last?.phase, last?.step); console.log(phases.slice(-12).join(' > ')); return { ok: false }; }
  const w = end.x.winner; const b = end.board;
  const rounds = end.reg.length; const shutdowns = end.reg.filter((r) => r.shutdown).length; const vetoes = end.reg.filter((r) => r.vetoed).length;
  const powers = end.reg.filter((r) => r.power).map((r) => r.power.kind);
  return { ok: errors === 0, w, b, rounds, shutdowns, vetoes, powers, secs: Math.round((Date.now() - t0) / 1000), phases };
}

(async () => {
  const tally = {}; let fails = 0;
  for (let i = 0; i < GAMES; i++) {
    const r = await one();
    if (!r.ok) { fails++; continue; }
    tally[`${r.w.team}:${r.w.reason}`] = (tally[`${r.w.team}:${r.w.reason}`] || 0) + 1;
    console.log(`game ${i + 1}: ${r.w.team === 'V' ? 'Villagers' : 'Godfather'} (${r.w.reason}) protect ${r.b.protect} sell ${r.b.sell} rounds ${r.rounds} shutdowns ${r.shutdowns} vetoes ${r.vetoes} powers [${r.powers.join(',')}] ${r.secs}s`);
    if (GAMES === 1) console.log('PHASES:', r.phases.join(' > '));
  }
  console.log('tally', JSON.stringify(tally), 'fails', fails);
  process.exit(fails ? 1 : 0);
})();
