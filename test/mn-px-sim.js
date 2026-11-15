// Plays whole nights of the 8-bit Mansion in-process with bots only (no sockets). WR_SPEED=0.3 node test/mn-px-sim.js
const { Mansion } = require('../server/mansion');
const N = Number(process.env.N || 4); const NIGHTS = Number(process.env.NIGHTS || 1);
async function night(i) {
  return new Promise((resolve) => {
    const phases = []; let g; const t0 = Date.now(); let minC = 100; let errs = 0;
    const hooks = {
      toHost: (v) => { const tag = `${v.phase}:${v.step || ''}${v.x.room ? '/' + v.x.room.key : ''}${v.x.kind != null ? '#' + v.x.kind : ''}`; if (phases[phases.length - 1] !== tag) phases.push(tag); if (v.cue) setTimeout(() => g.cueFinished(v.cue.id), 30); if (v.phase !== 'LOBBY') minC = Math.min(minC, v.candle); JSON.stringify(v); if (v.phase === 'END' && v.step === 'stats') { resolve({ phases, secs: Math.round((Date.now() - t0) / 1000), end: v.x.end, minC, errs }); } },
      toPlayer: () => {}, kicked: () => {}, menu: () => {},
    };
    const orig = console.error; console.error = (...a) => { errs++; orig(...a); };
    g = new Mansion('TEST' + i, hooks, { test: true });
    for (let k = 0; k < N; k++) g.addBot(true);
    g.start();
  });
}
(async () => { for (let i = 0; i < NIGHTS; i++) { const r = await night(i); console.log(JSON.stringify({ secs: r.secs, end: r.end, minC: r.minC, errs: r.errs })); console.log(r.phases.join(' > ')); } process.exit(0); })();
