// Plays whole Nothing to Declare games with server-side bots, a robot TV and one robot "human" phone.
// The phone packs (sometimes smuggling), swaps, raises bribes at the desk, and as officer sniffs, opens or waves.
// Run the server with WR_SPEED=0.05 first. URL, N (bots, 1 to 7), GAMES, HUMAN=0 to skip the phone.
const { io } = require('socket.io-client');
const URL = process.env.URL || 'http://localhost:3100';
const N = Number(process.env.N || 3);
const GAMES = Number(process.env.GAMES || 1);
const HUMAN = process.env.HUMAN !== '0';
const sleep = (t) => new Promise((r) => setTimeout(r, t));

async function one() {
  const host = io(URL, { forceNew: true, transports: ['websocket'] });
  const code = await new Promise((r) => host.emit('host:create', { game: 'ntd', test: true }, (x) => r(x.code)));
  const phases = []; const seen = {}; let end = null; const stats = { desk: 0, wave: 0, caught: 0, honest: 0, red: 0, sniff: 0, bark: 0, bribes: 0 };
  const leaks = [];
  host.on('state', (s) => {
    const tag = s.phase + (s.step ? `:${s.step}` : '');
    if (phases[phases.length - 1] !== tag) phases.push(tag);
    if (s.cue && !seen[s.cue.id]) { seen[s.cue.id] = 1; setTimeout(() => host.emit('host:cueDone', { id: s.cue.id }), 20); }
    if (s.phase === 'DESK') {
      const b = s.x.bag; const k = b.id;
      if (b.items && !['reveal', 'stamp'].includes(s.step)) leaks.push(`items visible at ${s.step}`);
      if (!seen[`d${k}`]) { seen[`d${k}`] = 1; stats.desk++; }
      if (b.result && !seen[`r${k}`]) { seen[`r${k}`] = 1; stats[b.result.kind === 'wave' ? 'wave' : b.result.kind]++; if (b.result.paid) stats.bribes++; }
      if (b.sniff && !seen[`s${k}`]) { seen[`s${k}`] = 1; stats.sniff++; if (b.sniff === 'bark') stats.bark++; }
    }
    if (s.phase === 'RED' && !seen[`red${s.round}`]) { seen[`red${s.round}`] = 1; stats.red += s.x.bags.length; }
    if (s.phase === 'END') end = s;
  });
  let errors = 0;
  if (HUMAN) {
    const ph = io(URL, { forceNew: true, transports: ['websocket'] });
    let S = null;
    await new Promise((r) => ph.emit('player:join', { code, name: 'Vishnu', game: 'ntd' }, r));
    ph.on('state', (s) => { S = s; });
    const act = (a) => new Promise((r) => ph.emit('act', a, (x) => { if (x?.error && !/Not now|already/.test(x.error)) { errors++; console.log('  phone error:', a.type, x.error); } r(x); }));
    (async () => {
      let packedRound = -1; let deskDone = '';
      for (;;) {
        await sleep(120);
        if (!S || S.phase === 'END') { if (S?.phase === 'END') return; continue; }
        const m = S.me; if (!m) continue;
        if (S.phase === 'PACK' && !m.officer && !m.packed && packedRound !== S.round) {
          packedRound = S.round;
          if (m.swaps > 0 && Math.random() < 0.5) { await act({ type: 'swap', uid: m.hand[0].uid }); await sleep(150); }
          const hand = S.me.hand; const legal = hand.filter((h) => h.cat !== 'contra'); const contra = hand.filter((h) => h.cat === 'contra');
          const by = {}; legal.forEach((h) => { (by[h.cat] = by[h.cat] || []).push(h); });
          const best = Object.entries(by).sort((a, b) => b[1].length - a[1].length)[0];
          const bags = [];
          if (contra.length && best) bags.push({ items: [contra[0].uid, ...best[1].slice(0, 2).map((h) => h.uid)], lane: 'green', decl: best[0], bribe: Math.min(m.cash > 0 ? m.cash : 0, 400) });
          else if (Math.random() < 0.4 && legal.length) bags.push({ items: legal.slice(0, 5).map((h) => h.uid), lane: 'red' });
          else if (best) bags.push({ items: best[1].slice(0, 3).map((h) => h.uid), lane: 'green', decl: best[0], bribe: 0 });
          else bags.push({ items: [hand[0].uid], lane: 'green', decl: 'sweets' });
          // a bad pack first, to check the server refuses it
          if (contra.length) { const r = await new Promise((rr) => ph.emit('act', { type: 'pack', bags: [{ items: [contra[0].uid], lane: 'red' }], done: true }, rr)); if (!r?.error) { console.log('  BUG: contraband allowed in the red lane'); errors++; } }
          await act({ type: 'pack', bags, done: true });
        }
        if (S.phase === 'DESK' && S.step === 'talk') {
          const key = S.x.bag.id;
          if (m.atDesk && deskDone !== `b${key}` && Math.random() < 0.5) { deskDone = `b${key}`; if (m.cash > m.atDesk.bribe + 300) await act({ type: 'bribe', amt: m.atDesk.bribe + 300 }); }
          if (m.officer && deskDone !== `o${key}`) {
            deskDone = `o${key}`;
            await sleep(400);
            if (m.canSniff && Math.random() < 0.5) { await act({ type: 'decide', what: 'sniff' }); continue; }
            await act({ type: 'decide', what: Math.random() < 0.4 ? 'open' : 'wave' });
          }
        }
        if (S.phase === 'DESK' && S.step === 'sniffed' && m.officer && deskDone !== `x${S.x.bag.id}`) { deskDone = `x${S.x.bag.id}`; await act({ type: 'decide', what: S.x.bag.sniff === 'bark' ? 'open' : 'wave' }); }
      }
    })();
  }
  for (let i = 0; i < N; i++) await new Promise((r) => host.emit('host:addBot', {}, r));
  await sleep(300);
  const t0 = Date.now();
  host.emit('host:start', {}, (r) => { if (r?.error) console.log('start error', r.error); });
  while (!end && Date.now() - t0 < 600000) await sleep(200);
  host.close();
  if (!end) { console.log('DID NOT FINISH. Last phases:', phases.slice(-12).join(' > ')); return false; }
  const t = end.x.totals; const ranked = end.x.ranked.map((id) => { const p = end.players.find((q) => q.id === id); return `${p.name} ${t[id].total} (cash ${t[id].cash}, goods ${t[id].goods}, bonus ${t[id].bonus})`; });
  console.log(`${N + (HUMAN ? 1 : 0)} players, ${end.rounds} rounds, ${end.two ? 'Two Bags' : 'one bag'} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log('  ', JSON.stringify(stats), 'phone errors', errors, 'leaks', leaks.length);
  console.log('   ranking:', ranked.join(' | '));
  console.log('   crowns:', end.x.crowns.map((c) => `${c.cat}:${c.n}`).join(' '), 'smuggler:', end.x.smuggler ? end.x.smuggler.n : 0, 'fun:', end.x.fun.map((f) => f.title).join(', '));
  return !errors && !leaks.length;
}

(async () => { let ok = true; for (let i = 0; i < GAMES; i++) ok = (await one()) && ok; process.exit(ok ? 0 : 1); })();
