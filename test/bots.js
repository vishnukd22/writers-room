// Plays a whole game with robot players and a robot TV. Run the server with WR_SPEED=0.1 first.
const { io } = require('socket.io-client');
const URL = process.env.URL || 'http://localhost:3100';
const N = Number(process.env.N || 6);
const DELAY = Number(process.env.BOT_DELAY || 0);
const sleep = (t) => new Promise((r) => setTimeout(r, t));
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const names = ['Arun', 'Bindu', 'Chris', 'Divya', 'Eldho', 'Fathima', 'Gopu', 'Hari', 'Isha', 'Jacob', 'Kavya', 'Liam'];
const LINES = ['You smell like my ex-husband.', 'I sold the cow for this?', 'Kiss me, you fool. Not you. Him.', 'That was my mother\'s urn!', 'I am the twin. Always have been.', 'Is it hot in here or is it the guilt?'];

const phases = []; let errors = 0; let final = null; const seen = {}; const stats = { lines: 0, cuts: 0, cutLines: 0, cracks: 0 };
(async () => {
  const host = io(URL);
  const code = await new Promise((r) => host.emit('host:create', {}, (x) => r(x.code)));
  host.on('state', (s) => {
    const tag = s.phase + (s.step ? `:${s.step}` : '');
    if (phases[phases.length - 1] !== tag) phases.push(tag);
    if (s.cue && !seen[s.cue.id]) { seen[s.cue.id] = 1; global.__chars = (global.__chars || 0) + (s.cue.text || '').length; global.__cues = (global.__cues || 0) + 1; setTimeout(() => host.emit("host:cueDone", { id: s.cue.id }), Number(process.env.HOST_DELAY || (30 + DELAY / 4))); }
    if (s.x.flash && !seen[`f${s.x.flash.at}`]) { seen[`f${s.x.flash.at}`] = 1; stats.cracks++; }
    if (s.phase === 'FINAL' && s.step === 'board') final = s.x;
  });
  const bots = [];
  for (let i = 0; i < N; i++) {
    const sock = io(URL);
    const r = await new Promise((res) => sock.emit('player:join', { code, name: names[i], pron: i === 4 ? 'EL-doe' : '' }, res));
    if (!r.ok) throw new Error(r.error);
    const bot = { sock, name: names[i], token: r.token, done: new Set() };
    bot.act = (type, a = {}) => new Promise((res) => sock.emit('act', { type, ...a }, (out) => { if (out?.error && !/Too late|Not yet|both your cuts/.test(out.error)) { errors++; console.log('ERR', bot.name, type, out.error); } res(out); }));
    sock.on('state', (s) => { bot.s = s; think(bot).catch((e) => { errors++; console.error(e); }); });
    bots.push(bot);
  }
  if (process.env.TOKENS_OUT) require('fs').writeFileSync(process.env.TOKENS_OUT, JSON.stringify({ code, players: bots.map((b) => ({ name: b.name, token: b.token })) }));
  await sleep(Number(process.env.WAIT_START || 200));
  const st = await bots[0].act('start');
  if (st?.error) throw new Error(st.error);
  const t0 = Date.now();
  while (!final && Date.now() - t0 < Number(process.env.MAXMS || 300000)) await sleep(200);
  console.log('PHASES:', phases.join(' > '));
  if (final) console.log('FINAL:\n ', final.rows.map((r) => `${r.rank}. ${r.name} ${r.score} (writer ${r.writerPts}, actor ${r.actorPts})`).join('\n  '));
  console.log('stats:', JSON.stringify(stats), 'seconds:', Math.round((Date.now() - t0) / 1000));
  console.log('narration chars:', global.__chars, 'cues:', global.__cues);
  console.log('errors:', errors, final ? 'OK' : 'DID NOT FINISH');
  process.exit(final && errors === 0 ? 0 : 1);
})();

async function think(bot) {
  const s = bot.s; const x = s.x; if (!s.me) return;
  const once = (k) => { if (bot.done.has(k)) return false; bot.done.add(k); return true; };
  if (DELAY) await sleep(DELAY * (0.5 + Math.random()));
  const s2 = bot.s; const x2 = s2.x; // state may have moved on while we slept
  switch (s2.phase) {
    case 'SCENE': {
      const sc = `${x2.scene.i}`;
      if (x2.myLine && once(`act${sc}:${x2.myLine.k}`)) { await sleep(60 + DELAY); await bot.act('done'); break; }
      if (x2.write && once(`w${sc}:${x2.write.k}`)) { if (Math.random() < 0.9) { stats.lines++; await bot.act('line', { text: pick(LINES) }); } break; }
      if (x2.dirs && once(`d${sc}:${x2.writing?.k}`)) await bot.act('dir', { i: Math.floor(Math.random() * 3) });
      if (x2.cur && !x2.ownLine && once(`l${sc}:${x2.cur.k}`) && Math.random() < 0.7) { await bot.act('laugh'); if (Math.random() < 0.5) await bot.act('laugh'); }
      if (x2.cracks && x2.cur && once(`c${sc}:${x2.cur.k}`) && Math.random() < 0.25) await bot.act('crack', { id: pick(x2.cracks).id });
      break;
    }
    case 'SCENE_END': if (s2.step === 'vote' && x2.canVote && once(`v${x2.scene.i}`)) await bot.act('vote', { id: pick(x2.scene.actors).id }); break;
    case 'CUT': {
      const f = x2.fin;
      if (f.write && once(`cw${f.lineNo}`)) { stats.cutLines++; await bot.act('cutLine', { text: pick(LINES) }); break; }
      if (s2.step === 'play' && !f.locked && f.cutsLeft > 0 && Math.random() < 0.08 && once(`cut${f.lineNo}`)) { const r = await bot.act('cut'); if (r?.ok) stats.cuts++; }
      if (f.line && f.line.kind === 'cut' && !f.ownLine && once(`fl${f.lineNo}${f.line.text}`)) await bot.act('laugh');
      break;
    }
    default:
  }
}
