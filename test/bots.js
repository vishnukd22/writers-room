// Plays a whole game with robot players and a robot TV. Run the server with WR_SPEED=0.05 first.
const { io } = require('socket.io-client');
const URL = process.env.URL || 'http://localhost:3100';
const N = Number(process.env.N || 6);
const DELAY = Number(process.env.BOT_DELAY || 0);
const sleep = (t) => new Promise((r) => setTimeout(r, t));
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const names = ['Arun', 'Bindu', 'Chris', 'Divya', 'Eldho', 'Fathima', 'Gopu', 'Hari', 'Isha', 'Jacob', 'Kavya', 'Liam'];

const phases = []; let errors = 0; let final = null; const seen = {};
(async () => {
  const host = io(URL);
  const code = await new Promise((r) => host.emit('host:create', {}, (x) => r(x.code)));
  host.on('state', (s) => {
    if (phases[phases.length - 1] !== s.phase) phases.push(s.phase);
    if (s.cue && !seen[s.cue.id]) { seen[s.cue.id] = 1; global.__chars = (global.__chars || 0) + (s.cue.text || "").length; global.__cues = (global.__cues || 0) + 1; setTimeout(() => host.emit('host:cueDone', { id: s.cue.id }), 30 + DELAY / 4); }
    if (s.phase === 'FINAL') final = s.x;
  });
  const bots = [];
  for (let i = 0; i < N; i++) {
    const sock = io(URL);
    const r = await new Promise((res) => sock.emit('player:join', { code, name: names[i], act: i % 2 === 0, pron: i === 4 ? 'EL-doe' : '' }, res));
    if (!r.ok) throw new Error(r.error);
    const bot = { sock, name: names[i], token: r.token, done: new Set() };
    bot.act = (type, a = {}) => new Promise((res) => sock.emit('act', { type, ...a }, (out) => { if (out?.error && !/own|used/.test(out.error)) { errors++; console.log('ERR', bot.name, type, out.error); } res(out); }));
    sock.on('state', (s) => { bot.s = s; think(bot).catch((e) => { errors++; console.error(e); }); });
    bots.push(bot);
  }
  if (process.env.TOKENS_OUT) require('fs').writeFileSync(process.env.TOKENS_OUT, JSON.stringify({ code, players: bots.map((b) => ({ name: b.name, token: b.token })) }));
  await sleep(Number(process.env.WAIT_START || 200));
  const st = await bots[0].act('start', { genre: process.env.GENRE });
  if (st?.error) throw new Error(st.error);
  const t0 = Date.now();
  while (!final && Date.now() - t0 < Number(process.env.MAXMS || 300000)) await sleep(200);
  console.log('PHASES:', phases.join(' > '));
  if (final) console.log('FINAL:', final.renewed ? 'renewed' : 'cancelled', final.rating, '\n ', final.rows.map((r) => `${r.rank}. ${r.name} ${r.score}${r.isMole ? ' (MOLE)' : ''} [${r.ledger.map((l) => `${l.why} ${l.pts}`).slice(0, 6).join(', ')}]`).join('\n  '));
  console.log('errors:', errors, final ? 'OK' : 'DID NOT FINISH');
  console.log('narration chars:', global.__chars, 'cues:', global.__cues);
  process.exit(final && errors === 0 ? 0 : 1);
})();

async function think(bot) {
  const s = bot.s; const x = s.x; if (!s.me) return;
  const key = `${s.phase}:${s.step}:${s.endsAt}:${x.line?.id || ''}`;
  const once = (k) => { if (bot.done.has(key + k)) return false; bot.done.add(key + k); return true; };
  if (DELAY) await sleep(DELAY * (0.5 + Math.random()));
  const agendaText = () => { const a = s.me.agenda; if (!a) return ''; const m = a.label.match(/"([^"]+)"/); return m ? m[1] : ''; };
  switch (s.phase) {
    case 'CASTING': if (once('c')) await bot.act('cast', { fields: { name: `Dr. ${x.target.name}`, job: 'cardiologist who faints at blood', secret: 'bought a degree on eBay', weakness: 'cannot whisper', catchphrase: 'Trust me, I watched a video.' }, done: true }); break;
    case 'SECRETS': if (once('a')) await bot.act('ack'); break;
    case 'PITCH': if (once('p')) await bot.act('pitch', { text: `${bot.name} pitch: the inspector arrives and he is someone's ex.` }); break;
    case 'VOTE': if (once('v')) { const c = x.pitches.filter((p) => !p.mine); if (c.length) await bot.act('vote', { id: pick(c).id }); } break;
    case 'WRITING': {
      if (!x.myScene || !once('w')) break;
      const mine = x.myScene.lines.filter((l) => l.writer === s.me.id);
      for (const [i, l] of mine.entries()) await bot.act('line', { id: l.id, text: i === 0 && Math.random() < 0.6 ? `Listen. ${agendaText()}.` : pick(['Hide the chips.', 'The poker chips or the Pringles?', 'BOTH. HE IS ALLERGIC TO FUN.', 'I have never trusted a goat.', '']) });
      if (x.interfere) { const t = x.interfere.scenes.find((z) => !z.mine); if (t) await bot.act('interfere', { scene: t.i, text: x.interfere.notes[0] }); }
      await bot.act('writeDone', { done: true });
      break;
    }
    case 'PUNCHUP': if (x.punch && !x.punch.done && once('pu')) { const l = x.punch.scenes[0].lines[0]; await bot.act('punch', { id: l.id, text: `${l.text} ${agendaText()}` }); } break;
    case 'TABLE_READ': {
      if (!x.line) break;
      if (x.myLine && once('ad')) { await sleep(40); await bot.act('actorDone', { id: x.line.id }); break; }
      if (s.step === 'line' && once('r')) {
        if (Math.random() < 0.6) await bot.act('react', { kind: pick(['laugh', 'laugh', 'gasp', 'boo']) });
        if (x.canObject && Math.random() < 0.12) await bot.act('object');
      }
      break;
    }
    case 'LAST_WORDS': if (once('l')) await bot.act('lastWords', { text: 'I was never really here.' }); break;
    case 'FINALE': if (x.myLine && once('fl')) { await sleep(40); await bot.act('actorDone', { id: x.lineId }); } break;
    case 'MOLE_VOTE': if (once('m')) await bot.act('moleVote', { id: Math.random() < 0.2 ? 'none' : pick(x.options).id }); break;
    default:
  }
}
