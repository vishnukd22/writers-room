// Plays whole BID-COIN! games with server-side bots, a robot TV and one robot "human" phone that bids too.
// Run the server with WR_SPEED=0.1 first. URL, N (bots, 2 to 7), GAMES, HUMAN=0 to skip the phone.
const { io } = require('socket.io-client');
const URL = process.env.URL || 'http://localhost:3100';
const N = Number(process.env.N || 5);
const GAMES = Number(process.env.GAMES || 1);
const HUMAN = process.env.HUMAN !== '0';
const sleep = (t) => new Promise((r) => setTimeout(r, t));

async function one() {
  const host = io(URL, { forceNew: true, transports: ['websocket'] });
  const code = await new Promise((r) => host.emit('host:create', { game: 'bc', test: true }, (x) => r(x.code)));
  const phases = []; const seen = {}; let end = null; let last = null; let blasts = 0; const splashes = {};
  host.on('bc:b', () => { blasts++; });
  host.on('state', (s) => {
    last = s;
    const tag = s.phase + (s.step ? `:${s.step}` : '');
    if (phases[phases.length - 1] !== tag) phases.push(tag);
    if (s.splash && !splashes[s.splash.id]) splashes[s.splash.id] = s.splash.k;
    if (s.cue && !seen[s.cue.id]) { seen[s.cue.id] = 1; setTimeout(() => host.emit('host:cueDone', { id: s.cue.id }), Number(process.env.HOST_DELAY || 20)); }
    if (s.phase === 'END' && s.x.ranks) end = s;
  });
  // one phone, played by a script: bids when it can, bets, plays cards, passes
  const lat = []; let stale = 0; let accepted = 0;
  if (HUMAN) {
    const ph = io(URL, { forceNew: true, transports: ['websocket'] });
    let S = null; let auc = null; let busy = false;
    await new Promise((r) => ph.emit('player:join', { code, name: 'Vishnu', game: 'bc' }, r));
    ph.on('bc:b', (a) => { auc = a; });
    ph.on('state', (s) => { S = s; if (s.auc) auc = s.auc; });
    const act = (a) => new Promise((r) => ph.emit('act', a, r));
    (async () => {
      while (!end) {
        await sleep(120);
        if (!S || busy) continue;
        busy = true;
        try {
          const me = S.me;
          if (S.phase === 'PEEK' && !me.ready) { const c = me.hand.find((h) => h.usable); if (c) await act({ type: 'card', k: c.k }); await act({ type: 'ready' }); }
          if (S.phase === 'AUCTION' && auc && !auc.done && auc.leader !== me.id && auc.price + 100 < Math.min(2500, me.cash) && Math.random() < 0.35) {
            const t0 = Date.now(); const r = await act({ type: 'bid', inc: 100, at: auc.price }); lat.push(Date.now() - t0);
            if (r.ok) accepted++; if (r.stale) stale++;
          }
          if (S.phase === 'AUCTION' && Math.random() < 0.02) { const c = me.hand.find((h) => h.usable && h.k === 'freeze'); const t = S.players.find((p) => p.id !== me.id); if (c && t) await act({ type: 'card', k: 'freeze', target: t.id }); }
          if (S.phase === 'BET' && S.x.canBet) await act({ type: 'bet', pick: Math.random() < 0.5 ? 'boom' : 'bust' });
          if (S.phase === 'AFTER' && !me.passed) { const c = me.hand.find((h) => h.usable); if (c) await act({ type: 'card', k: c.k, target: S.players.find((p) => p.id !== me.id)?.id }); await act({ type: 'pass' }); }
          if (S.phase === 'TUTORIAL' && me.vip && Math.random() < 0.5) await act({ type: 'skipTutorial' });
        } finally { busy = false; }
      }
      ph.close();
    })();
  }
  for (let i = 0; i < N; i++) await new Promise((r) => host.emit('host:addBot', {}, r));
  const st = await new Promise((r) => host.emit('host:start', {}, r));
  if (st?.error) { console.log('start error', st.error); return { ok: false }; }
  const t0 = Date.now();
  while (!end && Date.now() - t0 < Number(process.env.MAXMS || 300000)) await sleep(100);
  host.close();
  if (!end) { console.log('DID NOT FINISH. Last:', last?.phase, last?.step); console.log(phases.slice(-15).join(' > ')); return { ok: false }; }
  const total = end.players.reduce((s, p) => s + p.cash, 0);
  lat.sort((a, b) => a - b);
  return { ok: true, ranks: end.x.ranks.map((r) => `${r.name}:${r.cash}`).join(' '), total, blasts, splashes: Object.values(splashes), secs: Math.round((Date.now() - t0) / 1000), phases, accepted, stale, p50: lat[Math.floor(lat.length / 2)], p95: lat[Math.floor(lat.length * 0.95)] };
}

(async () => {
  let fails = 0;
  for (let i = 0; i < GAMES; i++) {
    const r = await one();
    if (!r.ok) { fails++; continue; }
    const kinds = {}; r.splashes.forEach((k) => { kinds[k] = (kinds[k] || 0) + 1; });
    console.log(`game ${i + 1}: ${r.secs}s | ${r.ranks} | bid broadcasts ${r.blasts} | powers ${JSON.stringify(kinds)} | phone bids ok ${r.accepted} too-slow ${r.stale} | ack ms p50 ${r.p50} p95 ${r.p95}`);
    if (GAMES === 1) console.log('PHASES:', r.phases.join(' > '));
  }
  console.log('fails', fails);
  process.exit(fails ? 1 : 0);
})();
