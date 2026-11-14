// Checks pause, resume and quit in every game: timers stop, actions wait, resume counts down, and a group vote quits to the menu.
// Run the server first (WR_SPEED=0.3 is fine). URL defaults to http://localhost:3100.
const { io } = require('socket.io-client');
const URL = process.env.URL || 'http://localhost:3100';
const sleep = (t) => new Promise((r) => setTimeout(r, t));
const emit = (s, ev, d = {}) => new Promise((r) => s.emit(ev, d, (x) => r(x || {})));
let fails = 0;
const ok = (cond, msg) => { console.log(`${cond ? '  ok ' : '  FAIL'} ${msg}`); if (!cond) fails++; };

async function run(game) {
  console.log(`\n== ${game}`);
  const host = io(URL, { forceNew: true, transports: ['websocket'] });
  let H = null; let menu = false;
  host.on('state', (s) => { H = s; if (s.cue) setTimeout(() => host.emit('host:cueDone', { id: s.cue.id }), 30); });
  host.on('menu', () => { menu = true; });
  const { code } = await emit(host, 'host:create', { game, test: true });
  const phones = []; const S = [];
  for (let i = 0; i < 3; i++) {
    const p = io(URL, { forceNew: true, transports: ['websocket'] }); phones.push(p);
    p.on('state', (s) => { S[i] = s; });
    await emit(p, 'player:join', { code, name: `P${i}`, game });
  }
  for (let b = 0; b < (game === 'lg' ? 3 : 1); b++) await emit(host, 'host:addBot');
  await sleep(300);
  const st = await emit(host, 'host:start');
  ok(!st.error, `game starts ${st.error || ''}`);
  await sleep(4000);
  ok(H?.ctl?.canPause, `can pause in phase ${H?.phase}`);
  const before = { phase: H.phase, step: H.step, endsAt: H.endsAt };
  ok((await emit(phones[1], 'act', { type: 'pause' })).ok, 'a phone pauses');
  await sleep(300);
  ok(H.ctl.paused && H.ctl.by === 'P1', 'TV shows who paused');
  ok(S[0].ctl.paused, 'other phones see the pause');
  const blocked = await emit(phones[0], 'act', { type: 'answer', v: 0 });
  ok(blocked.error === 'The game is paused', 'other actions wait while paused');
  await sleep(6000);
  ok(H.phase === before.phase && H.step === before.step, `nothing moved for 6s (${before.phase}/${before.step} -> ${H.phase}/${H.step})`);
  ok((await emit(phones[2], 'act', { type: 'resume' })).ok, 'another phone resumes');
  await sleep(300);
  ok(H.ctl.paused && H.ctl.resumeAt > Date.now(), 'resume counts down first');
  await sleep(3300);
  ok(!H.ctl.paused, 'game running again');
  if (before.endsAt) ok(!H.endsAt || H.endsAt !== before.endsAt, 'deadline moved by the pause');
  await sleep(3000);
  // quit: one vote isn't enough, a majority is
  ok((await emit(phones[0], 'act', { type: 'quit' })).ok, 'a phone asks to quit');
  await sleep(300);
  ok(H.ctl.quit && H.ctl.quit.yes === 1 && H.ctl.quit.need === 2, `quit vote open (${JSON.stringify(H.ctl.quit)})`);
  ok(!menu, 'one tap does not quit');
  await emit(phones[1], 'act', { type: 'quitVote', yes: false });
  await sleep(200);
  ok(!menu && H.ctl.quit, 'still voting after one no');
  await emit(phones[2], 'act', { type: 'quitVote', yes: true });
  await sleep(500);
  ok(menu, 'majority quits to the menu');
  ok(S[0].ctl.left, 'phones told to look at the TV');
  [host, ...phones].forEach((s) => s.close());
}

(async () => {
  for (const g of (process.env.GAMES || 'bc,lg,rg').split(',')) {
    try { await run(g); } catch (e) { fails++; console.error(e); }
  }
  console.log(fails ? `\n${fails} FAILED` : '\nall passed');
  process.exit(fails ? 1 : 0);
})();
