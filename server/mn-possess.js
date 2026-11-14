'use strict';
// Possessions: one player, one short challenge, the whole room watching on the TV.
// Same shape as a room: setup, phone (the possessed player only), tv (mirrors it), act, tick. Each calls X.win() or X.fail().
const { rint, pick, shuffle } = require('./mn-rooms');

const SPELLS = ['BEGONE', 'BANISH', 'NOCTURNE', 'GRIMOIRE', 'RELEASE', 'SANCTUM', 'VESPERS', 'EXORCISE', 'SPECTRE', 'HALLOW'];

const door = {
  key: 'door', name: 'Hold the Door', secs: 15, how: 'A ghost is pushing. Tap fast to keep the door shut.',
  setup() { return { push: 20, rate: 1.1 }; },
  w(st) { return [{ t: 'meter', label: 'The ghost is pushing', v: Math.round(st.push), max: 100, color: '#B3261E' }, { t: 'pad', act: 'tap', label: 'PUSH!', big: true, hot: true }]; },
  phone(X, p, st) { return { role: 'Possessed', job: 'Tap as fast as you can to hold the door shut.', w: door.w(st) }; },
  tv(X, st) { return { w: door.w(st) }; },
  act(X, p, a, st) { if (a.a === 'tap') st.push = Math.max(0, st.push - 5); },
  tick(X, now, st, dt) { st.rate += dt * 0.00012; st.push += st.rate * dt / 200; if (st.push >= 100) X.fail(); },
  timeout(X) { X.win(); },
};

const steady = {
  key: 'steady', name: 'Steady Hand', secs: 15, how: 'Trace the glowing path with one finger. Touch the cracks and you lose.',
  setup() { const pts = [[0.1, 0.5]]; for (let i = 1; i <= 6; i++) pts.push([0.1 + i * 0.133, Math.max(0.15, Math.min(0.85, pts[i - 1][1] + (Math.random() - 0.5) * 0.5))]); return { pts, prog: 0, pos: null, width: 0.09 }; },
  w(st) { return [{ t: 'trace', act: 'trace', pts: st.pts, prog: st.prog, pos: st.pos, width: st.width }]; },
  phone(X, p, st) { return { role: 'Possessed', job: 'Put your finger on the start and follow the path to the end without leaving it.', w: steady.w(st) }; },
  tv(X, st) { return { w: steady.w(st) }; },
  act(X, p, a, st) { if (a.a === 'trace') { st.prog = Math.max(st.prog, Math.min(1, Number(a.prog) || 0)); st.pos = [Number(a.x) || 0, Number(a.y) || 0]; if (st.prog >= 0.98) X.win(); } if (a.a === 'off') X.fail(); },
  timeout(X) { X.fail(); },
};

const free = {
  key: 'free', name: 'Break Free', secs: 10, how: 'Hands are grabbing you. Tap as fast as you can to pull loose.',
  setup() { return { taps: 0, goal: 40 }; },
  w(st) { return [{ t: 'meter', label: 'Pulling free', v: st.taps, max: st.goal, color: '#2FB36B' }, { t: 'pad', act: 'tap', label: 'PULL!', big: true, hot: true }]; },
  phone(X, p, st) { return { role: 'Possessed', job: 'Tap, tap, tap!', w: free.w(st) }; },
  tv(X, st) { return { w: free.w(st) }; },
  act(X, p, a, st) { if (a.a === 'tap') { st.taps++; if (st.taps >= st.goal) X.win(); } },
  timeout(X) { X.fail(); },
};

const spell = {
  key: 'spell', name: 'The Incantation', secs: 15, how: 'The spell is written backwards. Type it the right way round.',
  setup() { const w = pick(SPELLS); return { word: w, back: [...w].reverse().join(''), tries: [] }; },
  w(st, input) { return [{ t: 'card', text: st.back, style: 'big' }, ...(input ? [{ t: 'input', act: 'cast', placeholder: 'Type the spell' }] : []), { t: 'list', items: st.tries.map((x) => `✗ ${x}`) }]; },
  phone(X, p, st) { return { role: 'Possessed', job: 'Type the spell the right way round, then tap Cast.', w: spell.w(st, true) }; },
  tv(X, st) { return { w: spell.w(st, false) }; },
  act(X, p, a, st) { if (a.a !== 'cast') return; const t = String(a.text || '').toUpperCase().replace(/[^A-Z]/g, ''); if (!t) return; if (t === st.word) X.win(); else st.tries.push(t.slice(0, 14)); },
  timeout(X) { X.fail(); },
};

const blink = {
  key: 'blink', name: "Don't Blink", secs: 14, how: 'Tap the very moment the candle flickers. Not before.',
  setup(X) { return { at: X.now() + rint(3000, 9000), state: 'wait' }; },
  w(X, st) { return [{ t: 'candle', flicker: st.state === 'flicker' }, { t: 'pad', act: 'tap', label: 'NOW!', big: true }]; },
  phone(X, p, st) { return { role: 'Possessed', job: 'Watch the flame. Tap the instant it flickers. Too early and it is over.', w: blink.w(X, st) }; },
  tv(X, st) { return { w: blink.w(X, st) }; },
  act(X, p, a, st) { if (a.a !== 'tap') return; if (st.state === 'flicker') X.win(); else X.fail(); },
  tick(X, now, st) { if (st.state === 'wait' && now >= st.at) { st.state = 'flicker'; st.until = now + 900; X.sfx('mn-wind'); } else if (st.state === 'flicker' && now > st.until) X.fail(); },
  timeout(X) { X.fail(); },
};

const key = {
  key: 'key', name: 'Find the Key', secs: 15, how: 'Rub the dust off the screen to find the key, then tap it.',
  setup() { const cols = 6; const rows = 8; return { cols, rows, clean: new Set(), key: rint(0, cols * rows - 1) }; },
  w(st, live) { return [{ t: 'dust', act: live ? 'rub' : null, cols: st.cols, rows: st.rows, clean: [...st.clean], key: st.clean.has(st.key) ? st.key : -1 }]; },
  phone(X, p, st) { return { role: 'Possessed', job: 'Rub the dust away with your finger. When you see the key, tap it.', w: key.w(st, true) }; },
  tv(X, st) { return { w: key.w(st, false) }; },
  act(X, p, a, st) {
    if (a.a === 'rub') for (const i of [].concat(a.ids || []).slice(0, 20)) { const n = Number(i); if (n >= 0 && n < st.cols * st.rows) st.clean.add(n); }
    if (a.a === 'grab' && st.clean.has(st.key)) X.win();
  },
  timeout(X) { X.fail(); },
};

const back = {
  key: 'back', name: "Don't Look Back", secs: 14, how: 'Keep your finger perfectly still on the screen. Something is behind you.',
  setup(X) { return { down: false, since: 0, need: 10000, startBy: X.now() + 4000, held: 0 }; },
  w(X, st) { return [{ t: 'meter', label: 'Stay still', v: Math.round(st.held / 100), max: st.need / 100, color: '#5A8DEE' }, { t: 'pad', act: 'hold', hold: true, label: st.down ? 'DON\'T MOVE' : 'Press and hold', big: true }]; },
  phone(X, p, st) { return { role: 'Possessed', job: 'Press and hold the button. Do not let go. Do not move.', w: back.w(X, st) }; },
  tv(X, st) { return { w: back.w(X, st) }; },
  act(X, p, a, st) { if (a.a === 'down') { st.down = true; st.since = X.now(); } if (a.a === 'up' && st.down) X.fail(); },
  tick(X, now, st, dt) { if (st.down) { st.held += dt; if (st.held >= st.need) X.win(); if (Math.random() < 0.03) X.sfx('mn-whisper'); } else if (now > st.startBy) X.fail(); },
  timeout(X, st) { if (st.down) X.win(); else X.fail(); },
};

const real = {
  key: 'real', name: 'Which One Is Real?', secs: 15, how: 'One of these is a ghost wearing a friend\'s face. Pick the real one.',
  setup(X, p) { const friends = X.seats.filter((s) => s.id !== p.id); return { rounds: shuffle(friends.length ? friends : X.seats).slice(0, 3).map((f) => ({ who: f.id, fake: rint(0, 1), how: pick(['flip', 'hue', 'eyes']) })), i: 0 }; },
  w(st) { const r = st.rounds[st.i]; return r ? [{ t: 'faces', act: 'pick', who: r.who, fake: r.fake, how: r.how }, { t: 'note', text: `Face ${st.i + 1} of ${st.rounds.length}` }] : []; },
  phone(X, p, st) { return { role: 'Possessed', job: 'One is the ghost. It has one tiny thing wrong. Tap the real friend.', w: real.w(st) }; },
  tv(X, st) { return { w: real.w(st) }; },
  act(X, p, a, st) { if (a.a !== 'pick') return; const r = st.rounds[st.i]; if (!r) return; if (Number(a.id) === r.fake) { X.fail(); return; } st.i++; X.sfx('mn-clear'); if (st.i >= st.rounds.length) X.win(); },
  timeout(X) { X.fail(); },
};

const POSSESS = { door, steady, free, spell, blink, key, back, real };
module.exports = { POSSESS };
