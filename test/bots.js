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
    bot.act = (type, a = {}) => new Promise((res) => sock.emit('act', { type, ...a }, (out) => { if (out?.error && !/Too late|Not yet|cuts|catching his breath|already picked/.test(out.error)) { errors++; console.log('ERR', bot.name, type, out.error); } res(out); }));
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
  if (final) console.log('FINAL:\n ', final.rows.map((r) => `${r.rank}. ${r.name} ${r.score} (wins ${r.wins}, laughs ${r.laughs})`).join('\n  '));
  console.log('stats:', JSON.stringify(stats), 'seconds:', Math.round((Date.now() - t0) / 1000));
  console.log('narration chars:', global.__chars, 'cues:', global.__cues);
  console.log('errors:', errors, final ? 'OK' : 'DID NOT FINISH');
  process.exit(final && errors === 0 ? 0 : 1);
})();

async function think(bot) {
  const s = bot.s; if (!s.me) return;
  const once = (k) => { if (bot.done.has(k)) return false; bot.done.add(k); return true; };
  if (DELAY) await sleep(DELAY * (0.5 + Math.random()));
  const s2 = bot.s; const x = s2.x; const pi = x.pilot ? x.pilot.i : 'L';
  switch (s2.phase) {
    case 'LOBBY': if (x.busts && once('bust')) { const free = x.busts.filter((b) => !b.by); if (free.length) await bot.act('bust', { n: pick(free).n }); } break;
    case 'GENRE': if (s2.step === 'pick' && s2.me.showrunner && x.genres && once(`g${pi}`)) await bot.act('genre', { id: pick(x.genres).id }); break;
    case 'WRITE': {
      if (!x.submitted && once(`w${pi}${x.kind}`)) {
        if (Math.random() < 0.08) break; // this one never submits
        if (x.kind === 'pitch') await bot.act('write', { fields: { a: pick(['sad accountant', 'retired pirate', 'nervous dentist']), who: pick(['hates water', 'only speaks in rhyme']), must: pick(['win a cooking show', 'save the village']), before: pick(['his mum finds out', 'Diwali']) } });
        else if (x.kind === 'traits') await bot.act('write', { answers: (x.questions || []).map(() => pick(['Soup', 'Dentures', 'Yes chef no chef', 'Pigeons', 'He is three raccoons', 'Biryani'])) });
        else await bot.act('write', { text: pick(LINES) });
        stats.lines++;
      } else if (x.submitted && Math.random() < 0.15 && once(`h${pi}${x.kind}${Math.floor(Date.now() / 3000)}`)) await bot.act('hurry');
      break;
    }
    case 'SHORTLIST': for (const c of x.cards || []) if (c.liked === null && once(`l${pi}${c.id}${x.kind}`)) await bot.act('like', { id: c.id, like: Math.random() < 0.6 }); break;
    case 'VOTE': if (s2.step === 'vote' && once(`v${pi}${x.kind}`)) { const opts = x.finalists.filter((f) => !f.mine); if (opts.length) await bot.act('vote', { id: pick(opts).id }); } break;
    case 'SCENE': case 'CAST': if (!x.own && Math.random() < 0.6 && once(`laugh${pi}${s2.phase}${s2.step}${x.scene?.cur}`)) { await bot.act('laugh'); stats.cracks++; } break;
    default:
  }
}
