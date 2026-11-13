// Plays whole RIGGED! games with server-side bots, a robot TV and robot "human" phones that use every trick.
// Run the server with WR_SPEED=0.1 first. URL, N (bots), HUMANS (scripted phones, default 1), GAMES.
const { io } = require('socket.io-client');
const URL = process.env.URL || 'http://localhost:3100';
const N = Number(process.env.N ?? 3);
const HUMANS = Number(process.env.HUMANS ?? 1);
const GAMES = Number(process.env.GAMES || 1);
const sleep = (t) => new Promise((r) => setTimeout(r, t));
const pick = (a) => a[Math.floor(Math.random() * a.length)];

function phone(code, name, stop, stats) {
  const ph = io(URL, { forceNew: true, transports: ['websocket'] });
  let S = null; let busy = false;
  const act = (a) => new Promise((r) => ph.emit('act', a, (x) => { stats.acts++; if (x?.error) { stats.errors[x.error] = (stats.errors[x.error] || 0) + 1; } else if (x?.ok) stats.ok[a.type] = (stats.ok[a.type] || 0) + 1; r(x || {}); }));
  const joined = new Promise((r) => ph.emit('player:join', { code, name, game: 'rg' }, r));
  ph.on('state', (s) => { S = s; });
  (async () => {
    await joined;
    while (!stop.done) {
      await sleep(90);
      if (!S || busy) continue;
      busy = true;
      try {
        const m = S.me; const q = S.q;
        if (S.phase === 'DOSSIER' && m.dossier) for (const e of m.dossier) if (!e.a) await act({ type: 'dossier', i: e.i, text: `${name} secret ${e.i}` });
        if (S.phase === 'Q' && q && m.can && !m.pick?.locked) {
          const t = m.tray || {};
          if (t.sab && !t.sab.used && Math.random() < 0.3) { const ok = t.sab.targets.filter((x) => x.ok); if (ok.length) await act({ type: 'sab', k: pick(t.sab.list).k, target: pick(ok).id }); }
          if (t.sab && t.sab.shield.ok && Math.random() < 0.05) await act({ type: 'shield' });
          if (t.bribes && Math.random() < 0.15) { const b = pick(t.bribes.filter((x) => !x.used)); if (b) await act({ type: 'bribe', k: b.k, target: b.target ? pick(S.players.filter((p) => p.id !== m.id)).id : undefined }); }
          if (t.remote && !t.remote.used && Math.random() < 0.4) { const k = pick(['boo', 'cheer', 'heckle', 'spin']); const tg = pick(S.players.filter((p) => p.id !== m.id && (k !== 'boo' || q.eligible.includes(p.id)))); if (tg) await act({ type: 'remote', k, target: tg.id, h: 2 }); }
          if (t.copy && t.copy.targets.length && Math.random() < 0.1) { await act({ type: 'copy', mode: Math.random() < 0.5 ? 'blind' : 'name', target: pick(t.copy.targets) }); continue; }
          if (Math.random() < 0.35) continue; // think a bit
          const k = q.kind;
          if (k === 'mc') { const opts = [0, 1, 2, 3].filter((i) => !(m.hint || []).includes(i)); await act({ type: 'answer', v: pick(opts), lock: Math.random() < 0.7, seq: q.seq }); if (Math.random() < 0.5) await act({ type: 'lock', seq: q.seq }); }
          if (k === 'write') { const r = await act({ type: 'lie', text: pick(['purple', 'a goose', 'socks', 'Belgium', 'my uncle']) + Math.floor(Math.random() * 9) }); if (r.truth) stats.truth++; }
          if (k === 'vote') { const o = q.opts.filter((x) => !(m.ownOpts || []).includes(x.id)); await act({ type: 'answer', v: pick(o).id, lock: true, seq: q.seq }); }
          if (k === 'who') await act({ type: 'answer', v: pick(q.choices.filter((id) => id !== m.id)), lock: true, seq: q.seq });
          if (k === 'lay') await act({ type: 'answer', v: Math.random() < 0.5 ? 0 : 1, lock: true, seq: q.seq });
          if (k === 'laywrite') await act({ type: 'fake', text: 'I once fought a swan' });
          if (k === 'num') await act({ type: 'answer', v: Math.floor(Math.random() * 3000), seq: q.seq });
          if (k === 'bet') await act({ type: 'answer', v: Math.random() < 0.7 ? pick(S.players).id : null, seq: q.seq });
          if (k === 'bomb') await act({ type: 'answer', v: Math.random() < 0.6, seq: q.seq });
        }
        if (S.phase === 'WHEEL' && S.step === 'pick' && m.picker && S.x.offer?.length) await act({ type: 'wheel', k: pick(S.x.offer).k });
        if (S.phase === 'WHEEL' && S.step === 'veto' && m.canVeto) await act({ type: 'veto', use: Math.random() < 0.5 });
        if (S.phase === 'LADDER') {
          if (m.lq && !(m.lock > Date.now())) await act({ type: 'ladder', i: Math.floor(Math.random() * 4), seq: m.lq.seq });
          for (const vf of m.voteFor || []) await act({ type: 'catvote', for: vf.for, i: 2 });
          if (!m.lift && Math.random() < 0.02) await act({ type: 'lift' });
          if (!m.grease && Math.random() < 0.02) await act({ type: 'grease', target: pick(S.players.filter((p) => p.id !== m.id)).id });
          if (m.remote?.ready && Math.random() < 0.05) await act({ type: 'boo', target: pick(S.players.filter((p) => p.id !== m.id)).id });
        }
      } catch (e) { stats.crash = (stats.crash || 0) + 1; console.error(e); } finally { busy = false; }
    }
    ph.close();
  })();
  return { joined, get S() { return S; } };
}

async function one() {
  const host = io(URL, { forceNew: true, transports: ['websocket'] });
  const code = await new Promise((r) => host.emit('host:create', { game: 'rg', test: true }, (x) => r(x.code)));
  const phases = []; const seen = {}; let end = null; let last = null; const splashes = {}; const kinds = {}; const cards = [];
  host.on('state', (s) => {
    last = s;
    const tag = s.phase + (s.kind ? `/${s.kind}` : '') + (s.step ? `:${s.step}` : '');
    if (phases[phases.length - 1] !== tag) phases.push(tag);
    if (s.q) kinds[s.q.kind] = (kinds[s.q.kind] || 0) + 1;
    if (s.phase === 'WHEEL' && s.step === 'card' && cards[cards.length - 1] !== s.x.card) cards.push(s.x.card);
    if (s.splash && !splashes[s.splash.id]) splashes[s.splash.id] = s.splash.k + (s.splash.s ? `:${s.splash.s}` : s.splash.b ? `:${s.splash.b}` : '');
    if (s.cue && !seen[s.cue.id]) { seen[s.cue.id] = 1; setTimeout(() => host.emit('host:cueDone', { id: s.cue.id }), process.env.HOST_DELAY === 'auto' ? 600 + s.cue.text.length * 60 : Number(process.env.HOST_DELAY || 20)); }
    if (s.phase === 'END' && s.step === 'ranks') end = s;
  });
  const stop = { done: false }; const stats = { acts: 0, errors: {}, ok: {}, truth: 0 };
  const phones = [];
  for (let i = 0; i < HUMANS; i++) { const p = phone(code, ['Vishnu', 'Maya', 'Omar'][i] || `P${i}`, stop, stats); phones.push(p); await p.joined; }
  for (let i = 0; i < N; i++) await new Promise((r) => host.emit('host:addBot', {}, r));
  const st = await new Promise((r) => host.emit('host:start', {}, r));
  if (st?.error) { console.log('start error', st.error); stop.done = true; host.close(); return { ok: false }; }
  const t0 = Date.now();
  while (!end && Date.now() - t0 < Number(process.env.MAXMS || 400000)) await sleep(100);
  stop.done = true; host.close();
  if (!end) { console.log('DID NOT FINISH. Last:', last?.phase, last?.kind, last?.step); console.log(phases.slice(-20).join(' > ')); return { ok: false }; }
  const sp = {}; Object.values(splashes).forEach((k) => { sp[k] = (sp[k] || 0) + 1; });
  return { ok: true, secs: Math.round((Date.now() - t0) / 1000), ranks: end.x.ranks.map((r) => `${r.name}:${r.cash}`).join(' '), awards: end.x.awards.map((a) => a.title).join(', '), houseWon: end.x.houseWon, sp, cards, stats, phases };
}

(async () => {
  let fails = 0;
  for (let i = 0; i < GAMES; i++) {
    const r = await one();
    if (!r.ok) { fails++; continue; }
    console.log(`game ${i + 1}: ${r.secs}s | ${r.ranks}${r.houseWon ? ' (HOUSE WON)' : ''}`);
    console.log(`  awards: ${r.awards} | cards: ${r.cards.join(', ')}`);
    console.log(`  splashes: ${JSON.stringify(r.sp)}`);
    console.log(`  phone acts ${r.stats.acts}, ok ${JSON.stringify(r.stats.ok)}, truth-typed ${r.stats.truth}, crashes ${r.stats.crash || 0}`);
    console.log(`  errors: ${JSON.stringify(r.stats.errors)}`);
    if (GAMES === 1) console.log('PHASES:', r.phases.join(' > '));
  }
  console.log('fails', fails);
  process.exit(fails ? 1 : 0);
})();
