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
  const stats = { synLockers: 0, brSales: 0, allIn: 0 }; const synSeen = new Set(); const brSeen = new Set();
  const phases = []; const seen = {}; let end = null; let last = null; let blasts = 0; const splashes = {};
  host.on('bc:b', () => { blasts++; });
  host.on('state', (s) => {
    last = s;
    const tag = s.phase + (s.step ? `:${s.step}` : '');
    if (phases[phases.length - 1] !== tag) phases.push(tag);
    if (s.splash && !splashes[s.splash.id]) splashes[s.splash.id] = s.splash.k;
    if (s.cue && !seen[s.cue.id]) { seen[s.cue.id] = 1; setTimeout(() => host.emit('host:cueDone', { id: s.cue.id }), Number(process.env.HOST_DELAY || 20)); }
    if (s.locker?.syn && !synSeen.has(s.locker.n)) { synSeen.add(s.locker.n); stats.synLockers++; }
    if (s.phase === 'BACKROOM' && s.step === 'won' && s.x.br && !brSeen.has(s.x.br.owner + s.x.br.price + phases.length)) { brSeen.add(s.x.br.owner + s.x.br.price + phases.length); stats.brSales++; }
    if (s.locker?.bets) for (const b of Object.values(s.locker.bets)) if (b.all) stats.allIn++;
    // Sid's crew and Sid's loan
    if (s.locker?.result?.commission && !seen[`cm${s.locker.n}`]) { seen[`cm${s.locker.n}`] = 1; stats.commission = (stats.commission || 0) + s.locker.result.commission; }
    if (s.locker?.result?.caught && !seen[`ca${s.locker.n}`]) { seen[`ca${s.locker.n}`] = 1; stats.caught = (stats.caught || 0) + 1; }
    if (s.phase === 'FINALE' && s.x.step === 'repo' && s.x.settled && !seen.repo) { seen.repo = 1; stats.repaid = s.x.bills.filter((b) => !b.short).length; stats.repo = s.x.bills.filter((b) => b.short).length; }
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
          if (S.phase === 'AUCTION' && auc && !auc.done && auc.leader !== me.id && auc.price + 1000 < Math.min(25000, me.cash) && Math.random() < 0.35) {
            const t0 = Date.now(); const r = await act({ type: 'bid', inc: 1000, at: auc.price }); lat.push(Date.now() - t0);
            if (r.ok) accepted++; if (r.stale) stale++;
          }
          if (S.phase === 'AUCTION' && Math.random() < 0.02) { const c = me.hand.find((h) => h.usable && h.k === 'freeze'); const t = S.players.find((p) => p.id !== me.id); if (c && t) await act({ type: 'card', k: 'freeze', target: t.id }); }
          if ((S.phase === 'BET' || S.phase === 'BACKROOM') && S.x.canBet && S.x.betOpt && !S.me.bet) { const o = S.x.betOpt; const amts = [...o.amts, ...(o.all ? ['all'] : [])]; stats.bets = (stats.bets || 0) + 1; await act({ type: 'bet', pick: Math.random() < 0.5 ? 'boom' : 'bust', amt: amts[Math.floor(Math.random() * amts.length)] || 1000 }); }
          if (S.phase === 'BACKROOM' && S.step === 'bid' && S.x.brInvited && S.x.brBid == null) { const o = S.x.brOptions || []; stats.brBids = (stats.brBids || 0) + 1; await act({ type: 'brBid', amt: o.length ? o[Math.floor(Math.random() * o.length)] : 'pass' }); }
          if (S.phase === 'PEEK' && S.x.deal) { for (const i of S.x.deal.invites || []) { stats.synYes = (stats.synYes || 0) + 1; await act({ type: 'synAnswer', id: i.id, yes: true }); } const mt = (S.x.deal.mates || []).find((m) => !m.invited); if (mt && Math.random() < 0.5) { stats.synInv = (stats.synInv || 0) + 1; await act({ type: 'synInvite', to: mt.id }); } }
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
  return { ok: true, stats, ranks: end.x.ranks.map((r) => `${r.name}:${r.cash}`).join(' '), total, blasts, splashes: Object.values(splashes), secs: Math.round((Date.now() - t0) / 1000), phases, accepted, stale, p50: lat[Math.floor(lat.length / 2)], p95: lat[Math.floor(lat.length * 0.95)] };
}

(async () => {
  let fails = 0;
  for (let i = 0; i < GAMES; i++) {
    const r = await one();
    if (!r.ok) { fails++; continue; }
    const kinds = {}; r.splashes.forEach((k) => { kinds[k] = (kinds[k] || 0) + 1; });
    console.log(`game ${i + 1}: ${r.secs}s | ${r.ranks} | bid broadcasts ${r.blasts} | powers ${JSON.stringify(kinds)} | phone bids ok ${r.accepted} too-slow ${r.stale} | ack ms p50 ${r.p50} p95 ${r.p95}`);
    console.log('  new features:', JSON.stringify(r.stats));
    if (GAMES === 1) console.log('PHASES:', r.phases.join(' > '));
  }
  console.log('fails', fails);
  process.exit(fails ? 1 : 0);
})();
