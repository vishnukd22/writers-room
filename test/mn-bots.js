// Plays whole nights of Last Night in the Mansion over real sockets: a robot TV, robot "human" phones that
// tap whatever their phone shows, and server bots. Run the server with WR_SPEED=0.25 first.
// URL, N (server bots), HUMANS (robot phones, default 1), GAMES.
const { io } = require('socket.io-client');
const URL = process.env.URL || 'http://localhost:3100';
const N = Number(process.env.N ?? 3);
const HUMANS = Number(process.env.HUMANS ?? 1);
const GAMES = Number(process.env.GAMES || 1);
const sleep = (t) => new Promise((r) => setTimeout(r, t));
const pick = (a) => a[Math.floor(Math.random() * a.length)];

function phone(code, name, stop, stats) {
  const ph = io(URL, { forceNew: true, transports: ['websocket'] });
  let S = null; let busy = false; let held = false;
  const act = (a) => new Promise((r) => ph.emit('act', a, (x) => { stats.acts++; if (x?.error) stats.errors[x.error] = (stats.errors[x.error] || 0) + 1; r(x || {}); }));
  const joined = new Promise((r) => ph.emit('player:join', { code, name, game: 'mn' }, r));
  ph.on('state', (s) => { S = s; if (s.me?.w) stats.widgets.add(s.me.w.map((w) => w.t).join(',')); });
  (async () => {
    await joined;
    while (!stop.done) {
      await sleep(140);
      if (!S || busy || !S.me) continue;
      busy = true;
      try {
        const ws = S.me.w || []; if (!ws.length || S.step !== 'play') { if (held) { held = false; await act({ type: 'r', a: 'up' }); } continue; }
        const opts = [];
        for (const w of ws) {
          if (w.t === 'btns' && w.act) w.items.filter((it) => !['off', 'done', 'bad'].includes(it.state)).forEach((it) => opts.push({ a: w.act, id: it.id }));
          if (w.t === 'pad') { if (w.hold) opts.push(held ? { a: 'up' } : { a: 'down' }); else opts.push({ a: w.act, id: w.id, at: Date.now() }); }
          if (w.t === 'dpad') ['up', 'down', 'left', 'right'].forEach((d) => opts.push({ a: w.act, dir: d }));
          if (w.t === 'dials') [0, 1, 2].forEach((i) => opts.push({ a: w.act, i, dir: 'up' }));
          if (w.t === 'input') { const card = ws.find((x) => x.t === 'card'); opts.push({ a: w.act, text: card ? [...card.text].reverse().join('') : 'BEGONE' }); }
          if (w.t === 'faces') opts.push({ a: w.act, id: String(1 - w.fake) });
          if (w.t === 'dust') { opts.push({ a: 'rub', ids: [Math.floor(Math.random() * 48), Math.floor(Math.random() * 48)] }); if (w.key >= 0) opts.push({ a: 'grab' }); }
          if (w.t === 'trace') opts.push({ a: 'trace', prog: Math.min(1, (w.prog || 0) + 0.08), x: 0.5, y: 0.5 });
        }
        if (opts.length && Math.random() < 0.7) { const o = pick(opts); if (o.a === 'down') held = true; if (o.a === 'up') held = false; await act({ type: 'r', ...o }); }
      } catch (e) { stats.crash = (stats.crash || 0) + 1; console.error(e); } finally { busy = false; }
    }
    ph.close();
  })();
  return { joined };
}

async function one() {
  const host = io(URL, { forceNew: true, transports: ['websocket'] });
  const code = await new Promise((r) => host.emit('host:create', { game: 'mn', test: true }, (x) => r(x.code)));
  const phases = []; let last = null; const rooms = []; let scares = 0; let lastScare = null; let maxCandle = 100; let minCandle = 100;
  host.on('state', (s) => {
    last = s;
    const tag = `${s.phase}${s.step ? `:${s.step}` : ''}${s.x?.room ? `/${s.x.room.key}` : ''}${s.x?.poss ? `/${s.x.poss.key}` : ''}`;
    if (phases[phases.length - 1] !== tag) phases.push(tag);
    if (s.x?.room && !rooms.includes(s.x.room.key)) rooms.push(s.x.room.key);
    if (s.scare && s.scare.id !== lastScare) { lastScare = s.scare.id; scares++; }
    if (s.cue) host.emit('host:cueDone', { id: s.cue.id });
    if (s.phase !== 'LOBBY') { minCandle = Math.min(minCandle, s.candle); maxCandle = Math.max(maxCandle, s.candle); }
    JSON.stringify(s);
  });
  const stop = { done: false }; const stats = { acts: 0, errors: {}, widgets: new Set() };
  const phones = []; for (let i = 0; i < HUMANS; i++) phones.push(phone(code, `Robo${i + 1}`, stop, stats));
  await Promise.all(phones.map((p) => p.joined));
  for (let i = 0; i < N; i++) await new Promise((r) => host.emit('host:addBot', {}, r));
  await sleep(300);
  const t0 = Date.now();
  const r = await new Promise((res) => host.emit('host:start', {}, res));
  if (r?.error) { console.log('start error', r.error); process.exit(1); }
  while (!(last && last.phase === 'END' && last.step === 'stats') && Date.now() - t0 < 900000) await sleep(500);
  stop.done = true;
  const e = last.x?.end;
  console.log(`players ${last.players.length} (${HUMANS} robot phones), ${Math.round((Date.now() - t0) / 1000)}s: ${e?.escaped ? 'ESCAPED' : 'LOST'} candle ${e?.candle}%, rooms ${e?.rooms}/${e?.of}, keys ${e?.keys}, scares ${scares}, lowest candle ${Math.round(minCandle)}%`);
  console.log('rooms:', rooms.join(', '));
  console.log('flow:', phases.filter((p) => !p.includes(':jobs') && !p.includes(':intro')).join(' > '));
  console.log('acts', stats.acts, 'errors', JSON.stringify(stats.errors), stats.crash ? `CRASH ${stats.crash}` : '');
  host.close();
  return { ok: last.phase === 'END' && !stats.crash };
}

(async () => {
  let bad = 0;
  for (let i = 0; i < GAMES; i++) { const r = await one(); if (!r.ok) bad++; }
  console.log(bad ? `${bad} BAD GAMES` : 'all games finished');
  process.exit(bad ? 1 : 0);
})();
