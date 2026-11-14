/* Last Night in the Mansion: the phone. Your job in each room, the buttons only you can press, and the possessions. */
(() => {
  const $ = (q) => document.querySelector(q);
  const esc = W.esc;
  const socket = io({ transports: ['websocket', 'polling'] });
  window.__gnSocket = socket;
  const main = $('#main'); const hud = $('#hud');
  const params = new URLSearchParams(location.search);
  const TEST = params.has('test');
  const store = TEST ? sessionStorage : localStorage;
  $('#jcode').value = (params.get('room') || store.getItem('mn:code') || '').toUpperCase();
  $('#jname').value = store.getItem('mn:name') || store.getItem('rg:name') || (TEST ? '' : localStorage.getItem('wr:name') || '');
  const buzz = (p) => { try { navigator.vibrate?.(p); } catch (e) { /* no vibration */ } };

  let S = null; let P = null; let joined = null; let lastNote = null;

  // ---------------------------------------------------------------- joining
  let wake = null;
  async function keepAwake() { try { if ('wakeLock' in navigator && !wake && document.visibilityState === 'visible') { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => { wake = null; }); } } catch (e) { wake = null; } }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && joined) { keepAwake(); if (!socket.connected) socket.connect(); } else release(); });
  function tryJoin(code, token) {
    const name = $('#jname').value.trim();
    socket.emit('player:join', { code, token, name, game: 'mn' }, (r) => {
      if (r.redirect) { location.href = r.redirect; return; }
      if (r.error) { if (token) { store.removeItem(`mn:token:${code}`); joined = null; } $('#jerr').textContent = r.error; $('#join').hidden = false; $('#app').hidden = true; return; }
      joined = { code: r.code, token: r.token };
      store.setItem(`mn:token:${r.code}`, r.token); store.setItem('mn:code', r.code); store.setItem('mn:name', name);
      if (!TEST) localStorage.setItem('wr:name', name);
      $('#join').hidden = true; $('#app').hidden = false; keepAwake();
    });
  }
  socket.on('connect', () => {
    if (joined) return tryJoin(joined.code, joined.token);
    const code = $('#jcode').value.trim().toUpperCase(); const tok = code && store.getItem(`mn:token:${code}`);
    if (tok) tryJoin(code, tok);
  });
  $('#jform').onsubmit = (e) => { e.preventDefault(); $('#jerr').textContent = ''; const code = $('#jcode').value.trim().toUpperCase(); tryJoin(code, store.getItem(`mn:token:${code}`)); };
  socket.on('moveTo', ({ url }) => { location.href = `${url}${TEST ? '&test' : ''}&auto=1`; });
  if (params.has('auto') && $('#jcode').value && $('#jname').value) setTimeout(() => $('#jform').requestSubmit(), 300);
  socket.on('kicked', () => { joined = null; $('#join').hidden = false; $('#app').hidden = true; $('#jerr').textContent = 'You were removed from the room.'; });
  socket.on('state', (s) => { W.syncClock(s.now); P = S; S = s; window.__S = s; render(); notes(); feel(); });
  function send(type, data = {}, cb) { socket.emit('act', { type, ...data }, (r) => { if (r?.error && !r.stale) toast(r.error, 'bad'); cb?.(r || {}); }); }
  const room = (a) => send('r', a);

  function toast(text, kind = 'info') { const t = document.createElement('div'); t.className = `toast ${kind}`; t.textContent = text; $('#toasts').appendChild(t); setTimeout(() => t.remove(), 3200); if (kind === 'bad') buzz([50, 30, 50]); }
  function notes() {
    const ns = S.me?.notes || []; const topId = ns.length ? ns[ns.length - 1].id : 0;
    if (lastNote === null) { lastNote = topId; return; }
    ns.filter((n) => n.id > lastNote).forEach((n) => toast(n.text, n.kind)); lastNote = Math.max(lastNote, topId);
  }
  // vibrations and flashes: new job, bumped into a hedge, possessed, a jump scare, FREEZE
  let lastBuzz = null; let lastFlash = null;
  function feel() {
    if (!S.me) return;
    const b = S.me.buzz; if (b && lastBuzz !== null && b.id !== lastBuzz) buzz({ bump: 30, bad: [80, 40, 80], possess: [300, 100, 300, 100, 600] }[b.kind] || 40); lastBuzz = b ? b.id : 0;
    const f = S.flash; if (f && lastFlash !== null && f.id !== lastFlash) flashScreen(f.kind); lastFlash = f ? f.id : 0;
    if (!P) return;
    if (P.phase !== S.phase || P.step !== S.step) {
      release();
      if (S.step === 'jobs' || (S.phase === 'POSSESS' && S.step === 'chosen' && S.x.who === S.me.id)) buzz(S.phase === 'POSSESS' ? [400, 120, 400] : 60);
    }
  }
  function flashScreen(kind) {
    const el = $('#flash'); el.className = ''; void el.offsetWidth;
    if (kind === 'scare') { el.className = 'scare'; buzz([250, 60, 400]); }
    if (kind === 'freeze') { el.className = 'freeze'; el.textContent = 'FREEZE!'; buzz([120, 60, 120]); }
    setTimeout(() => { el.className = ''; el.textContent = ''; }, kind === 'scare' ? 900 : 1500);
  }

  // ---------------------------------------------------------------- helpers
  const me = () => S.me;
  const P_ = (id) => S.players.find((p) => p.id === id);
  const name = (id) => esc(P_(id)?.name || 'Someone');
  const tv = (title, sub = '', ico = '📺') => `<div class="tv"><div class="ico">${ico}</div><h2>${title}</h2>${sub ? `<p>${sub}</p>` : ''}</div>`;
  const skipBtn = () => (me()?.vip ? '<button class="ghostbtn" data-a="skip">Skip Mortimer</button>' : '');

  function hudHtml() {
    const m = me(); if (!m) return '';
    if (S.phase === 'LOBBY') return `<div class="who">${W.bust(m, 'sm')}<b>${esc(m.name)}</b></div><div class="room">${esc(S.code)}</div>`;
    const c = Math.max(0, Math.round(S.candle));
    const keys = [...Array(5).keys()].map((i) => `<i class="${i < S.keys ? 'on' : ''}"></i>`).join('');
    return `<div class="who">${W.bust(m, 'sm')}<b>${esc(m.name)}</b></div><div class="cand ${c < 20 ? 'low' : ''}"><span class="fl"></span><div class="cb"><i style="width:${c}%"></i></div><b>${c}%</b></div><div class="ks" title="${S.keys} of 5 key pieces">${keys}</div>`;
  }

  // ---------------------------------------------------------------- screens
  const R = {
    LOBBY() {
      const m = me(); const n = S.players.length;
      const list = `<div class="faces">${S.players.map((p) => `<div class="f">${W.bust(p, 'md')}<span>${esc(p.name)}${p.bot ? ' (guest)' : ''}</span></div>`).join('')}</div>`;
      if (!m.vip) return `${tv("You're inside.", 'Watch the TV. The first player starts the night.', '🕯️')}${list}`;
      const why = n < 2 ? 'You need at least 2. Add a guest if you are short.' : n === 2 ? 'Just two of you? Two more guests will join to fill the jobs.' : `${n} guests ready.`;
      return `<h2 class="h">You hold the candle</h2><p class="lead">${why} About 20 minutes. Everyone wins together or loses together.</p>
        <button class="mainbtn" data-a="start" ${n < 2 ? 'disabled' : ''}>Begin the night</button>
        <div class="row"><button class="ghostbtn" data-a="addBot">Add a guest</button>${S.players.some((p) => p.bot) ? '<button class="ghostbtn" data-a="removeBots">Remove guests</button>' : ''}</div>${list}`;
    },
    INTRO() { return `${tv('Hollowmere House', 'The door has locked behind you. Mortimer is speaking. Look at the TV.', '🚪')}${skipBtn()}`; },
    HALL() { return `${tv('Down the hallway...', `Room ${(S.x.next || 0) + 1} of ${S.rooms} is next. Stay together.`, '🕯️')}${skipBtn()}`; },
    ROOM() {
      const x = S.x; const r = x.room || {}; const m = me();
      if (S.step === 'intro') return `<div class="rcard"><span class="k">Room ${S.roomN} of ${S.rooms}</span><h2>${esc(r.name)}</h2><p>${esc(r.how)}</p></div>${skipBtn()}`;
      if (S.step === 'jobs') return jobCard(m.role, m.job);
      if (S.step === 'win') return `<div class="result win"><h2>Cleared</h2><p>+1 key piece. Mortimer looks faintly disappointed.</p></div>`;
      if (S.step === 'fail') return `<div class="result fail"><h2>The room won</h2><p>-15% of the candle. Onwards, before it gets worse.</p></div>`;
      return playHtml(m);
    },
    POSSESS() {
      const x = S.x; const m = me(); const mine = x.who === m.id; const poss = x.poss || {};
      if (S.step === 'dark') return '<div class="dark"></div>';
      if (!mine) {
        if (S.step === 'win') return tv(`${name(x.who)} broke free!`, '+10% candle.', '✨');
        if (S.step === 'fail') return tv(`The house kept ${name(x.who)} a little while`, '-15% candle.', '💀');
        return tv(`${name(x.who)} is possessed`, `${esc(poss.name)}. Watch the TV. You can shout, but you cannot help.`, '👁️');
      }
      if (S.step === 'chosen') return `<div class="itsyou"><h2>It's you.</h2><p>The house has chosen you.</p></div>`;
      if (S.step === 'ready') return `<div class="itsyou ready"><span class="k">${esc(poss.name)}</span><h2>Get ready</h2><p>${esc(m.job || poss.how)}</p></div>`;
      if (S.step === 'win') return `<div class="result win"><h2>You broke free</h2><p>+10% candle. The house sulks.</p></div>`;
      if (S.step === 'fail') return `<div class="result fail"><h2>The house kept you</h2><p>Only for a moment. Probably.</p></div>`;
      return `<div class="poss">${timerBar()}${MNW.render(m.w, { S, live: true })}</div>`;
    },
    DOOR() {
      const m = me();
      if (S.step === 'intro') return `${tv('The Front Door', `You have ${S.keys} of 5 key pieces. Everyone has a job at the door. Look at the TV.`, '🚪')}${skipBtn()}`;
      if (S.step === 'jobs') return jobCard(m.role, m.job);
      return playHtml(m);
    },
    END() {
      const e = S.x.end || {}; const m = me();
      const btns = m.vip ? '<button class="mainbtn" data-a="again">Another night</button><button class="ghostbtn" data-a="menu">Back to the games</button>' : '<p class="lead">The first player picks what happens next.</p>';
      return `<div class="result ${e.escaped ? 'win' : 'fail'}"><h2>${e.escaped ? 'You got out.' : 'The house kept you.'}</h2><p>${e.escaped ? `Dawn, with ${e.candle}% of the candle left.` : 'Your rooms are ready.'} ${e.rooms} of ${e.of} rooms cleared.</p></div>${S.step === 'stats' ? btns : ''}`;
    },
  };
  function jobCard(role, job) { return `<div class="job"><span class="k">Your job</span><h2>${esc(role || 'Helper')}</h2><p>${esc(job || '')}</p></div>`; }
  function timerBar() { const x = S.x; if (!x.ends) return ''; return `<div class="ptimer"><i data-ends="${x.ends}" data-total="${Math.max(1, x.ends - (x.start || W.now()))}" data-kind="bar"></i></div>`; }
  function playHtml(m) {
    return `<div class="playing"><div class="rolebar"><b>${esc(m.role || '')}</b><span>${esc(m.job || '')}</span></div>${timerBar()}${MNW.render(m.w, { S, live: true })}</div>`;
  }

  // ---------------------------------------------------------------- render
  function render() {
    if (!S || !S.me) return;
    document.body.dataset.phase = S.phase; document.body.dataset.step = S.step || '';
    document.body.classList.toggle('low', !['LOBBY', 'END'].includes(S.phase) && S.candle < 20);
    document.body.classList.toggle('mine', S.phase === 'POSSESS' && S.x.who === S.me.id);
    mount(hud, hudHtml());
    // don't redraw under a finger that is rubbing dust or tracing a path: it would drop the touch
    const html = (R[S.phase] || (() => ''))();
    if (dragging && main.__html && main.querySelector('.w-trace, .w-dust')) { pendingHtml = html; return; }
    mount(main, html);
  }
  let pendingHtml = null;

  // ---------------------------------------------------------------- touching things
  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-a]');
    if (a) { const t = a.dataset.a; if (['start', 'again', 'menu', 'skip', 'addBot', 'removeBots'].includes(t)) send(t); return; }
    const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
    const id = b.dataset.id; room({ a: b.dataset.act, id, dir: b.dataset.dir || id, i: Number(id) });
    b.classList.add('tapped'); buzz(12);
  });
  document.addEventListener('submit', (e) => {
    const f = e.target.closest('[data-form]'); if (!f) return; e.preventDefault();
    const inp = f.querySelector('input'); const text = inp.value.trim(); if (!text) return;
    room({ a: f.dataset.form, text }); inp.value = ''; inp.focus();
  });
  // big pads: a tap sends at once (with the time, for the dance). Hold pads send down and up.
  let holding = false;
  document.addEventListener('pointerdown', (e) => {
    const pad = e.target.closest('[data-pad]');
    if (pad && !pad.disabled) {
      e.preventDefault(); pad.classList.add('down'); buzz(10);
      if (pad.dataset.hold) { holding = true; room({ a: 'down' }); } else room({ a: pad.dataset.pad, id: pad.dataset.id, at: W.now() });
      return;
    }
    startDrag(e);
  }, { passive: false });
  function release() { if (holding) { holding = false; room({ a: 'up' }); } document.querySelectorAll('.w-pad.down').forEach((p) => p.classList.remove('down')); }
  document.addEventListener('pointerup', () => { release(); endDrag(); });
  document.addEventListener('pointercancel', () => { release(); endDrag(); });
  window.addEventListener('blur', release);
  document.addEventListener('contextmenu', (e) => { if (e.target.closest('[data-pad], .w-trace, .w-dust')) e.preventDefault(); });

  // ---- Steady Hand: follow the path with one finger
  let dragging = null; let trace = { prog: 0, sent: 0, started: false };
  function polyline(el) {
    const pts = JSON.parse(el.dataset.pts || '[]'); const r = el.getBoundingClientRect();
    return { r, P: pts.map(([x, y]) => [r.left + x * r.width, r.top + y * r.height]), tol: Number(el.dataset.width) * r.height * 1.15 };
  }
  function nearest(P, x, y) {
    let best = { d: Infinity, at: 0 }; let run = 0; const lens = []; for (let i = 1; i < P.length; i++) lens.push(Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
    const total = lens.reduce((a, b) => a + b, 0);
    for (let i = 1; i < P.length; i++) {
      const [ax, ay] = P[i - 1]; const [bx, by] = P[i]; const L = lens[i - 1] || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / (L * L)));
      const d = Math.hypot(x - (ax + t * (bx - ax)), y - (ay + t * (by - ay)));
      if (d < best.d) best = { d, at: (run + t * L) / total };
      run += L;
    }
    return best;
  }
  function onTrace(e, el) {
    const { r, P, tol } = polyline(el); const n = nearest(P, e.clientX, e.clientY);
    if (!trace.started) { if (n.at > trace.prog + 0.06 || n.d > tol * 1.4) return; trace.started = true; }
    if (n.d > tol) { el.classList.add('off'); room({ a: 'off' }); dragging = null; trace.started = false; buzz([80, 40, 80]); return; }
    if (n.at > trace.prog && n.at < trace.prog + 0.12) trace.prog = n.at;
    const now = Date.now(); if (now - trace.sent > 70) { trace.sent = now; room({ a: 'trace', prog: trace.prog, x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }); }
  }
  // ---- Find the Key: rub the dust away
  let rubbed = new Set(); let rubT = null;
  function onDust(e) {
    const cell = document.elementFromPoint(e.clientX, e.clientY)?.closest('.w-dust i'); if (!cell) return;
    if (cell.querySelector('.key')) { room({ a: 'grab' }); buzz(40); return; }
    if (!cell.classList.contains('clean')) { cell.classList.add('clean'); rubbed.add(Number(cell.dataset.i)); }
    if (!rubT) rubT = setTimeout(() => { rubT = null; if (rubbed.size) { room({ a: 'rub', ids: [...rubbed] }); rubbed = new Set(); } }, 110);
  }
  function startDrag(e) {
    const t = e.target.closest('.w-trace'); const d = e.target.closest('.w-dust');
    if (t) { e.preventDefault(); dragging = 'trace'; onTrace(e, t); }
    if (d) { e.preventDefault(); dragging = 'dust'; onDust(e); }
  }
  document.addEventListener('pointermove', (e) => {
    if (!dragging) return; e.preventDefault();
    if (dragging === 'trace') { const el = document.querySelector('.w-trace'); if (el) onTrace(e, el); }
    if (dragging === 'dust') onDust(e);
  }, { passive: false });
  function endDrag() { if (!dragging) return; dragging = null; if (dragging === null && trace) trace.started = false; if (pendingHtml != null) { mount(main, pendingHtml); pendingHtml = null; } }
  // a new possession starts a new path
  let lastPossKey = null;
  setInterval(() => { const k = S && S.phase === 'POSSESS' ? `${S.x.who}|${S.x.poss?.key}|${S.x.start}` : null; if (k !== lastPossKey) { lastPossKey = k; trace = { prog: 0, sent: 0, started: false }; } }, 300);
})();
