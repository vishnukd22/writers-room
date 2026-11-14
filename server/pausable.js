'use strict';
// Pause, resume and quit for any game engine, without touching its game logic.
// While paused: the engine's current wait stops counting, its timers hold their fire, and players can't act.
// On resume: every deadline the game knows about moves forward by however long it was paused.
const RESUME_COUNTDOWN = 3000;
const QUIT_WINDOW = 20000;

function install(game, opts = {}) {
  const shiftMore = opts.shift || (() => {});
  game.pauseInfo = null; game.quitInfo = null; game.resumeAt = null;
  let deferred = []; let keepAlive = null; let resumeTimer = null; let quitTimer = null;

  // the engine's single waiter, with a deadline that can be frozen and moved
  game.wait = function wait(duration, doneFn = null) {
    if (this.waiter) this.waiter.resolve('replaced');
    return new Promise((resolve) => {
      const w = { doneFn, due: Date.now() + Math.max(30, duration), t: null,
        resolve: (r) => { if (this.waiter === w) this.waiter = null; clearTimeout(w.t); resolve(r); } };
      w.arm = () => { clearTimeout(w.t); w.t = setTimeout(() => w.resolve('time'), Math.max(30, w.due - Date.now())); };
      this.waiter = w;
      if (!game.pauseInfo) w.arm();
      if (doneFn && doneFn()) w.resolve('done');
    });
  };

  // nothing finishes early while paused (a line ending, everyone answering); resume re-checks
  const origCheck = game.check.bind(game); const origWake = game.wake.bind(game);
  game.check = () => { if (!game.pauseInfo) origCheck(); };
  game.wake = (reason) => { if (!game.pauseInfo || reason === 'watchdog') origWake(reason); };

  // timers that come due while paused wait until the game resumes
  const origLater = game.later.bind(game);
  game.later = function later(g, t, fn) {
    const run = () => { if (game.pauseInfo) { deferred.push(run); return; } fn(); };
    return origLater(g, t, run);
  };

  const humans = () => game.players.filter((p) => !p.bot && p.connected);
  const nameOf = (id) => game.players.find((p) => p.id === id)?.name || 'Someone';
  const canPause = () => !game.quitted && !['LOBBY', 'END'].includes(game.phase);

  game.gnPause = (pid) => {
    if (!canPause() || game.pauseInfo) return {};
    game.pauseInfo = { by: pid, at: Date.now() }; game.resumeAt = null;
    clearTimeout(resumeTimer);
    if (game.waiter) clearTimeout(game.waiter.t);
    clearInterval(keepAlive);
    keepAlive = setInterval(() => { game.lastProgress = Date.now(); game.lastActive = Date.now(); }, 4000);
    game.sync(); return { ok: true };
  };
  const reallyResume = () => {
    if (!game.pauseInfo) return;
    const dt = Date.now() - game.pauseInfo.at;
    if (game.endsAt) game.endsAt += dt;
    try { shiftMore(dt); } catch (e) { console.error('pause shift', e); }
    game.pauseInfo = null; game.resumeAt = null;
    clearInterval(keepAlive); keepAlive = null;
    game.lastProgress = Date.now();
    const w = game.waiter; if (w) { w.due += dt; w.arm(); if (w.doneFn && w.doneFn()) w.resolve('done'); }
    const due = deferred; deferred = [];
    due.forEach((run, i) => setTimeout(run, 150 + i * 120));
    game.sync();
  };
  game.gnResume = (pid) => {
    if (!game.pauseInfo || game.quitInfo || game.resumeAt) return {};
    game.resumeAt = Date.now() + RESUME_COUNTDOWN; game.resumeBy = pid;
    resumeTimer = setTimeout(reallyResume, RESUME_COUNTDOWN);
    game.sync(); return { ok: true };
  };

  // quitting needs most of the room to agree, so one stray tap can't end the night
  const settleQuit = () => {
    const q = game.quitInfo; if (!q) return;
    const n = Math.max(1, humans().length); const need = Math.floor(n / 2) + 1;
    if (q.yes.size >= need) {
      clearTimeout(quitTimer); game.quitInfo = null; game.pauseInfo = null; game.resumeAt = null; clearInterval(keepAlive);
      game.runId++; try { game.clearTimers?.(); } catch (e) { /* fine */ }
      game.quitted = true; game.sync(); game.hooks.menu?.();
      return;
    }
    if (q.no.size > n - need) { clearTimeout(quitTimer); game.quitInfo = null; game.sync(); }
  };
  game.gnQuitAsk = (pid) => {
    if (game.quitted) return {};
    if (game.quitInfo) return game.gnQuitVote(pid, true);
    if (canPause() && !game.pauseInfo) game.gnPause(pid);
    game.quitInfo = { by: pid, yes: new Set([pid]), no: new Set(), until: Date.now() + QUIT_WINDOW };
    clearTimeout(quitTimer);
    quitTimer = setTimeout(() => { game.quitInfo = null; game.sync(); }, QUIT_WINDOW);
    settleQuit(); game.sync(); return { ok: true };
  };
  game.gnQuitVote = (pid, yes) => {
    const q = game.quitInfo; if (!q) return {};
    q.yes.delete(pid); q.no.delete(pid); (yes ? q.yes : q.no).add(pid);
    settleQuit(); game.sync(); return { ok: true };
  };

  // every screen learns about it through the normal state
  const origView = game.view.bind(game);
  game.view = (me) => {
    const v = origView(me);
    const q = game.quitInfo; const n = Math.max(1, humans().length);
    v.ctl = {
      left: !!game.quitted,
      canPause: canPause(), paused: !!game.pauseInfo, by: game.pauseInfo ? nameOf(game.pauseInfo.by) : null,
      resumeAt: game.resumeAt, resumeBy: game.resumeAt ? nameOf(game.resumeBy) : null,
      quit: q ? { by: nameOf(q.by), yes: q.yes.size, no: q.no.size, need: Math.floor(n / 2) + 1, until: q.until, mine: me ? (q.yes.has(me.id) ? 'yes' : q.no.has(me.id) ? 'no' : null) : null } : null,
    };
    return v;
  };

  // the act() front door: the controls always work, everything else waits while paused
  const origAct = game.act.bind(game);
  game.act = (pid, a) => {
    switch (a?.type) {
      case 'pause': return game.gnPause(pid);
      case 'resume': return game.gnResume(pid);
      case 'quit': return game.gnQuitAsk(pid);
      case 'quitVote': return game.gnQuitVote(pid, !!a.yes);
      default: break;
    }
    if (game.pauseInfo || game.quitted) return { error: 'The game is paused' };
    return origAct(pid, a);
  };
  const origSkip = game.skip?.bind(game);
  if (origSkip) game.skip = (by) => (game.pauseInfo ? undefined : origSkip(by));
  return game;
}

module.exports = { install };
