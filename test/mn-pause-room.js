// pause during a Mansion room: the room clock and the candle must freeze
const { io } = require('socket.io-client'); const URL = 'http://localhost:3100';
const sleep = (t) => new Promise((r) => setTimeout(r, t)); const emit = (s, ev, d = {}) => new Promise((r) => s.emit(ev, d, (x) => r(x || {})));
(async () => {
  const host = io(URL, { transports: ['websocket'] }); let H = null; host.on('state', (s) => { H = s; if (s.cue) host.emit('host:cueDone', { id: s.cue.id }); });
  const { code } = await emit(host, 'host:create', { game: 'mn', test: true });
  const p = io(URL, { transports: ['websocket'] }); await emit(p, 'player:join', { code, name: 'P', game: 'mn' });
  for (let i = 0; i < 3; i++) await emit(host, 'host:addBot'); await emit(host, 'host:start');
  while (!(H && H.phase === 'ROOM' && H.step === 'play')) await sleep(200);
  await sleep(1500);
  await emit(p, 'act', { type: 'pause' }); await sleep(300);
  const a = { left: H.x.ends - H.now, candle: H.candle, room: H.x.room.key };
  await sleep(5000);
  const b = { left: H.x.ends - H.now, candle: H.candle };
  console.log(`room ${a.room}: time left ${Math.round(a.left / 1000)}s -> ${Math.round(b.left / 1000)}s while paused, candle ${a.candle} -> ${b.candle}`);
  const bad = await emit(p, 'act', { type: 'r', a: 'tap' }); console.log('room taps while paused:', bad.error || 'allowed (BAD)');
  await emit(p, 'act', { type: 'resume' }); await sleep(4500);
  console.log(`after resume: ${H.phase}/${H.step}, time left ${Math.round((H.x.ends - H.now) / 1000)}s`);
  process.exit(0);
})();
