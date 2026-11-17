/* SHOTGUN on the phone: your part of the car. Big buttons, held down; the map for the navigator; pit-stop jobs; the tray. */
(() => {
  const $ = (q) => document.querySelector(q); const esc = W.esc;
  const socket = io({ transports: ['websocket', 'polling'] }); window.__gnSocket = socket;
  const main = $('#main'); const top = $('#top');
  const params = new URLSearchParams(location.search); const TEST = params.has('test');
  const store = TEST ? sessionStorage : localStorage;
  $('#jcode').value = (params.get('room') || store.getItem('sg:code') || '').toUpperCase();
  $('#jname').value = store.getItem('sg:name') || (TEST ? '' : localStorage.getItem('wr:name') || '');
  const buzz = (p) => { try { navigator.vibrate?.(p); } catch (e) { /* no vibration */ } };
  let S = null; let P = null; let joined = null; let screenKey = null; let pos = null; let tilt = 0;

  // ---------------------------------------------------------------- joining
  let wake = null;
  async function keepAwake() { try { if ('wakeLock' in navigator && !wake && document.visibilityState === 'visible') { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => { wake = null; }); } } catch (e) { wake = null; } }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && joined) { keepAwake(); if (!socket.connected) socket.connect(); } else releaseAll(); });
  function tryJoin(code, token) {
    const name = $('#jname').value.trim();
    socket.emit('player:join', { code, token, name, game: 'sg' }, (r) => {
      if (r.redirect) { location.href = r.redirect; return; }
      if (r.error) { if (token) { store.removeItem(`sg:token:${code}`); joined = null; } $('#jerr').textContent = r.error; $('#join').hidden = false; $('#app').hidden = true; return; }
      joined = { code: r.code, token: r.token }; store.setItem(`sg:token:${r.code}`, r.token); store.setItem('sg:code', r.code); store.setItem('sg:name', name);
      if (!TEST) localStorage.setItem('wr:name', name);
      $('#join').hidden = true; $('#app').hidden = false; keepAwake();
    });
  }
  socket.on('connect', () => { if (joined) return tryJoin(joined.code, joined.token); const code = $('#jcode').value.trim().toUpperCase(); const tok = code && store.getItem(`sg:token:${code}`); if (tok) tryJoin(code, tok); });
  $('#jform').onsubmit = (e) => { e.preventDefault(); $('#jerr').textContent = ''; const code = $('#jcode').value.trim().toUpperCase(); tryJoin(code, store.getItem(`sg:token:${code}`)); };
  socket.on('moveTo', ({ url }) => { location.href = `${url}${TEST ? '&test' : ''}&auto=1`; });
  if (params.has('auto') && $('#jcode').value && $('#jname').value) setTimeout(() => $('#jform').requestSubmit(), 300);
  socket.on('kicked', () => { joined = null; $('#join').hidden = false; $('#app').hidden = true; $('#jerr').textContent = 'You were removed from the room.'; });
  socket.on('state', (s) => { W.syncClock(s.now); P = S; S = s; window.__S = s; if (P && P.phase !== s.phase) { releaseAll(); window.scrollTo(0, 0); if (['DRIVE', 'PIT', 'ENTRANCE', 'MAP'].includes(s.phase)) buzz([60, 40, 60]); } render(); });
  socket.on('sg:pos', (p) => { pos = p; if (p.r != null) tilt = p.r; drawMap(); liftMeter(); });
  const send = (type, data = {}, cb) => socket.emit('act', { type, ...data }, (r) => { if (r?.error) toast(r.error); cb?.(r || {}); });
  const control = (k, v) => socket.emit('act', { type: 'in', k, v });
  function toast(t) { const d = document.createElement('div'); d.className = 'toast'; d.textContent = t; $('#toasts').appendChild(d); setTimeout(() => d.remove(), 2600); }

  // ---------------------------------------------------------------- held buttons: press sends 1, letting go sends 0
  const held = new Map();
  main.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('[data-k]'); if (!b) return; e.preventDefault();
    try { b.setPointerCapture(e.pointerId); } catch (err) { /* fine */ }
    const k = b.dataset.k; const v = Number(b.dataset.v || 1); held.set(e.pointerId, { b, k }); b.classList.add('down'); control(k, v); buzz(18);
  });
  const up = (e) => { const h = held.get(e.pointerId); if (!h) return; held.delete(e.pointerId); h.b.classList.remove('down'); if (![...held.values()].some((x) => x.k === h.k)) control(h.k, 0); };
  main.addEventListener('pointerup', up); main.addEventListener('pointercancel', up); main.addEventListener('lostpointercapture', up);
  function releaseAll() { for (const [, h] of held) { h.b.classList.remove('down'); control(h.k, 0); } held.clear(); }
  main.addEventListener('contextmenu', (e) => e.preventDefault());

  // ---------------------------------------------------------------- the screens
  const me = () => S.me;
  const tv = (title, sub = '', ico = '📺') => `<div class="tv"><div class="ico">${ico}</div><h2>${title}</h2>${sub ? `<p>${sub}</p>` : ''}</div>`;
  const HELP = {
    left: 'Hold to steer left.', right: 'Hold to steer right.', gas: 'Hold to go. Let go to coast.', brake: 'Hold to slow down and stop.',
    gear: 'Tap to switch between Drive and Reverse.', nitro: 'Three boosts per stage. Use them on straights.', horn: 'Honk and slow cars ahead pull over.',
    lights: 'Headlights. They drain the battery, so switch them off when you can.', nav: 'You see the map. Nobody else does. Shout directions!',
  };
  const NAME = { left: 'Left', right: 'Right', gas: 'Gas', brake: 'Brake', gear: 'Gearbox', nitro: 'Nitro', horn: 'Horn', lights: 'Lights', nav: 'Map' };
  const R = {
    LOBBY() {
      const m = me(); const n = S.players.length; const bots = S.players.filter((p) => p.bot).length;
      const botbar = `<div class="row2"><button class="btn sm" data-a="addBot" ${n >= 8 ? 'disabled' : ''}>Add a bot</button>${bots ? `<button class="btn sm ghost" data-a="removeBots">Remove bots (${bots})</button>` : ''}</div>`;
      const start = m.vip ? `<button class="btn primary big" data-a="start" ${n < 2 ? 'disabled' : ''}>Start the engine</button><p class="hint">${n < 2 ? 'One more passenger needed. Add a friend or a bot.' : `${n} in the car. Start when everyone is in.`}</p>${botbar}` : `<p class="hint">${esc(S.players.find((p) => p.id === S.vipId)?.name || 'The first player')} starts the game.</p>`;
      return [`lobby|${n}|${m.vip}|${W.pickKey(S)}`, `<div class="hello" style="--c:${m.color}">${W.bust(m, 'lg')}<h2>You're in, ${esc(m.name)}</h2><p>Everyone controls one part of the car. Your phone is your part.</p></div>${W.picker(S, m.id)}${start}`];
    },
    INTRO() { return ['intro', tv('Dolly is calling', 'Listen to the TV.', '📞')]; },
    MAP() {
      const x = S.x; const mine = me().vote;
      if (x.win != null) return [`map-res${x.win}`, tv(`${esc(x.opts[x.win].title)}`, 'That way it is.', '🗺️')];
      return [`map|${mine}`, `<h2 class="h">Which way?</h2><div class="votes">${x.opts.map((o, i) => `<button class="vote ${mine === i ? 'on' : ''}" data-a="vote" data-i="${i}"><img src="/assets/img/t-sg-stage-${o.key}.webp" alt=""><span>${o.route}</span><b>${esc(o.title)}</b></button>`).join('')}</div>`];
    },
    JOBS() {
      const m = me(); const k = S.stage?.key;
      if (k === 'entrance') return ['jobs-ent', `<div class="myjob"><small>The Grand Entrance</small><h1>${m.side === 'R' ? 'Right side' : 'Left side'}</h1><p>You hold the ${m.side === 'R' ? 'right' : 'left'} side of the tray. When your side dips, hold LIFT. On the steps, everyone lifts together.</p></div>`];
      const atoms = (m.atoms || []).filter((a) => a !== 'lights' || k === 'night');
      return [`jobs|${S.stage?.tok}`, `<div class="myjob"><small>${esc(S.stage?.title || '')}</small><h1>${esc(m.role || 'Passenger')}</h1>${atoms.map((a) => `<p><b>${NAME[a]}:</b> ${HELP[a]}</p>`).join('')}${k === 'jump' ? '<p><b>Everyone:</b> in the air, lean to keep the car level.</p>' : ''}<p class="hint">Starts when the TV says GO.</p></div>`];
    },
    DRIVE() { return driveScreen(); },
    PIT() { return pitScreen(); },
    RESULT() { const x = S.x; return [`res|${S.stage?.tok}`, tv(x.gone ? 'SPLAT' : `Cake: ${Math.round(x.cake)}%`, x.late ? 'Too late. The icing melted.' : x.lost ? `Lost ${x.lost}% on that stage.` : 'Not a scratch!', '🎂')]; },
    ENTRANCE() { return entranceScreen(); },
    END() {
      const m = me(); const x = S.x;
      const vip = m.vip ? '<button class="btn primary big" data-a="again">Play again</button><button class="btn big" data-a="menu">Back to the game menu</button>' : '<p class="hint">The first player can start another game.</p>';
      return ['end', `${tv(x.ending === 'perfect' ? 'The cake has arrived!' : x.ending === 'damaged' ? 'It is technically a cake' : 'The wedding is ruined', `The cake made it at ${x.cake}%.`, x.ending === 'ruined' ? '💔' : '🎂')}${vip}`];
    },
  };

  // the driving controls: laid out for whatever this phone's job is
  function driveScreen() {
    const m = me(); const k = S.stage?.key; const atoms = (m.atoms || []).filter((a) => a !== 'lights' || k === 'night');
    const has = (a) => atoms.includes(a);
    const bits = [];
    if (k === 'jump') bits.push('<div class="lean"><button class="pad lean-l" data-k="lean" data-v="-1">◀ Lean</button><button class="pad lean-r" data-k="lean" data-v="1">Lean ▶</button></div>');
    if (has('nav')) bits.push(`<div class="mapbox ${atoms.length === 1 ? 'full' : ''}"><canvas id="map"></canvas><div id="turn" class="turn"></div></div>`);
    if (has('left') || has('right')) bits.push(`<div class="steer">${has('left') ? '<button class="pad left" data-k="left">◀<small>LEFT</small></button>' : ''}${has('right') ? '<button class="pad right" data-k="right">▶<small>RIGHT</small></button>' : ''}</div>`);
    if (has('gas') || has('brake')) bits.push(`<div class="pedals">${has('brake') ? '<button class="pad brake" data-k="brake">BRAKE</button>' : ''}${has('gas') ? '<button class="pad gas" data-k="gas">GAS</button>' : ''}</div>`);
    const small = ['gear', 'nitro', 'horn', 'lights'].filter(has);
    if (small.length) bits.push(`<div class="smalls n${small.length}">${small.map((a) => `<button class="pad ${a}" data-k="${a}">${a === 'gear' ? 'D / R' : a === 'nitro' ? 'NITRO' : a === 'horn' ? 'HONK' : 'LIGHTS'}<small>${NAME[a]}</small></button>`).join('')}</div>`);
    return [`drive|${S.stage?.tok}|${atoms.join(',')}`, `<div class="drive n${bits.length}">${bits.join('')}</div>`];
  }
  function entranceScreen() {
    const m = me();
    return [`ent|${m.side}`, `<div class="ent"><div class="sidelbl">${m.side === 'R' ? 'RIGHT' : 'LEFT'} SIDE</div><div class="tmeter"><i id="tilt"></i><span>${m.side === 'R' ? '' : '◀ your side'}</span><span>${m.side === 'R' ? 'your side ▶' : ''}</span></div><p id="dip" class="dip"></p><button class="pad lift" data-k="lift">LIFT<small>hold</small></button></div>`];
  }
  function liftMeter() {
    if (S?.phase !== 'ENTRANCE') return; const i = $('#tilt'); if (!i) return;
    i.style.left = `${Math.max(3, Math.min(97, 50 + tilt * 90))}%`;
    const mine = me().side === 'R' ? tilt > 0.08 : tilt < -0.08; const d = $('#dip'); if (d) { d.textContent = mine ? 'YOUR SIDE IS DIPPING! LIFT!' : ''; d.classList.toggle('on', mine); }
    if (mine && !liftMeter.b) { liftMeter.b = true; buzz(80); } if (!mine) liftMeter.b = false;
  }

  // ---------------------------------------------------------------- the navigator's map: heading up, the road ahead, and what's on it
  function drawMap() {
    const c = $('#map'); if (!c || !S?.x?.track || !pos) return;
    const dpr = Math.min(2, devicePixelRatio || 1); const w = c.clientWidth; const h = c.clientHeight; if (!w || !h) return;
    if (c.width !== Math.round(w * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
    const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
    g.fillStyle = S.stage?.key === 'night' ? '#0D1530' : S.stage?.key === 'dunes' ? '#E9C27E' : '#7FBF4D'; g.fillRect(0, 0, w, h);
    const sc = h / 110; const cx = w / 2; const cy = h * 0.7;
    const tf = (x, z) => { const dx = x - pos.x; const dz = z - pos.z; const c0 = Math.cos(-pos.h); const s0 = Math.sin(-pos.h); const rx = dx * c0 + dz * s0; const rz = -dx * s0 + dz * c0; return [cx - rx * sc, cy - rz * sc]; };
    const pts = S.x.track.pts;
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (const [col, wd] of [['#1B1530', 11], ['#55526A', 8], ['#FFD23F', 1.4]]) { g.strokeStyle = col; g.lineWidth = wd * sc * (wd > 2 ? 0.95 : 1) + (wd > 2 ? 2 : 0); g.beginPath(); pts.forEach(([x, z], i) => { const [a, b] = tf(x, z); if (i) g.lineTo(a, b); else g.moveTo(a, b); }); g.stroke(); }
    const icon = { block: ['⛔', 22], cones: ['🚧', 22], slot: ['🅿️', 24], pit: ['⛽', 24], ramp: ['⤴️', 22], finish: ['💒', 26] };
    for (const mk of S.x.track.marks || []) { const [a, b] = tf(mk.x, mk.z); const ic = icon[mk.k]; if (!ic) continue; g.font = `${ic[1]}px system-ui`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(ic[0], a, b); }
    for (const [x, z] of pos.cops || []) { const [a, b] = tf(x, z); g.fillStyle = Math.floor(Date.now() / 150) % 2 ? '#FF2340' : '#2F6BFF'; g.beginPath(); g.arc(a, b, 7, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#E2453E'; g.strokeStyle = '#1B1530'; g.lineWidth = 3; g.beginPath(); g.moveTo(cx, cy - 13); g.lineTo(cx + 9, cy + 9); g.lineTo(cx - 9, cy + 9); g.closePath(); g.fill(); g.stroke();
    // what's coming: the bend 30 to 70 metres ahead
    const ahead = pts.map(([x, z]) => tf(x, z)).filter(([a, b]) => cy - b > 30 * sc && cy - b < 75 * sc && Math.abs(a - cx) < w);
    let txt = 'Straight on'; let arrow = '⬆';
    if (ahead.length) { const [a, b] = ahead[Math.floor(ahead.length / 2)]; const ang = Math.atan2(a - cx, cy - b) * 180 / Math.PI; if (ang < -28) { txt = 'Sharp left ahead'; arrow = '⬅'; } else if (ang < -10) { txt = 'Bear left'; arrow = '↖'; } else if (ang > 28) { txt = 'Sharp right ahead'; arrow = '➡'; } else if (ang > 10) { txt = 'Bear right'; arrow = '↗'; } }
    const t = $('#turn'); if (t && t.dataset.t !== txt) { t.dataset.t = txt; t.innerHTML = `<b>${arrow}</b>${txt}`; }
  }

  // ---------------------------------------------------------------- the pit stop: ten seconds, one job each
  let pit = null;
  function pitScreen() {
    const m = me(); const x = S.x;
    if (x.step === 'done') return ['pit-done', tv(`+${x.fix}% cake`, 'The pit crew did it. Back to the TV.', '🔧')];
    if (m.taskDone) return ['pit-wait', tv('Done!', 'Waiting for the others.', '✅')];
    const t = m.task;
    const html = {
      tyre: `<h2 class="h">Tighten the bolts</h2><p class="hint">Tap all five, fast.</p><div class="wheel">${[0, 1, 2, 3, 4].map((i) => `<button class="bolt" data-pit="bolt" style="--a:${i * 72}deg"></button>`).join('')}</div>`,
      fuel: '<h2 class="h">Fill the tank</h2><p class="hint">Hold the pump. Let go in the green.</p><div class="gaugev"><span id="fuel"></span><i></i></div><button class="pad gas" id="pump">HOLD TO PUMP</button>',
      wipe: '<h2 class="h">Clean the windscreen</h2><p class="hint">Swipe back and forth. Quick!</p><div class="glass" id="glass"><div id="mud"></div></div>',
      jack: '<h2 class="h">Pump the jack</h2><p class="hint">Tap as fast as you can.</p><div class="jackbar"><span id="jack"></span></div><button class="pad brake" data-pit="jack">PUMP!</button>',
      rose: '<h2 class="h">Fix a sugar rose</h2><p class="hint">Tap when the ring hits the rose.</p><div class="rosebox"><i id="ring"></i><b>🌹</b></div><button class="pad horn" data-pit="rose">PLACE IT</button>',
    }[t] || tv('Help out!', 'Watch the TV.', '🔧');
    return [`pit|${t}`, `<div class="pitjob">${html}</div>`];
  }
  function startPit() {
    if (pit || S.phase !== 'PIT' || me().taskDone || S.x.step === 'done') return;
    pit = { t0: performance.now(), n: 0, lvl: 0, pumping: false, dir: 0, swipes: 0, lastX: null, done: false, task: me().task };
    const loop = () => {
      if (!pit || pit.done || S.phase !== 'PIT') { pit = null; return; }
      const el = (performance.now() - pit.t0) / 1000;
      if (pit.task === 'fuel') { if (pit.pumping) pit.lvl = Math.min(1.1, pit.lvl + 0.016); const f = $('#fuel'); if (f) f.style.height = `${Math.min(100, pit.lvl * 100)}%`; }
      if (pit.task === 'rose') { const r = $('#ring'); if (r) { const ph = (el * 0.9) % 1; pit.ph = ph; r.style.transform = `translate(-50%,-50%) scale(${2.4 - ph * 2.2})`; } }
      if (el > 9.5) finishPit(pit.task === 'fuel' ? fuelScore() : pit.task === 'wipe' ? pit.swipes / 10 : pit.task === 'jack' ? pit.n / 18 : pit.task === 'tyre' ? pit.n / 5 : 0.3);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
  const fuelScore = () => Math.max(0, 1 - Math.abs(pit.lvl - 0.82) * 3.5);
  function finishPit(score) { if (!pit || pit.done) return; pit.done = true; buzz([40, 30, 80]); send('pitDone', { score: Math.max(0, Math.min(1, score)) }); }
  main.addEventListener('click', (e) => {
    const b = e.target.closest('[data-pit]'); if (!b || !pit) return;
    const a = b.dataset.pit; buzz(15);
    if (a === 'bolt' && !b.classList.contains('ok')) { b.classList.add('ok'); pit.n++; if (pit.n >= 5) finishPit(1); }
    if (a === 'jack') { pit.n++; const j = $('#jack'); if (j) j.style.width = `${Math.min(100, (pit.n / 18) * 100)}%`; if (pit.n >= 18) finishPit(1); }
    if (a === 'rose') { const d = Math.abs((pit.ph ?? 0) - 0.95); finishPit(Math.max(0.2, 1 - Math.min(d, 1 - d) * 4)); }
  });
  main.addEventListener('pointerdown', (e) => { if (e.target.id === 'pump' && pit) { pit.pumping = true; buzz(10); } });
  main.addEventListener('pointerup', (e) => { if (pit?.task === 'fuel' && pit.pumping) { pit.pumping = false; if (pit.lvl > 0.1) finishPit(fuelScore()); } void e; });
  main.addEventListener('pointermove', (e) => {
    if (!pit || pit.task !== 'wipe' || !e.target.closest('#glass')) return;
    if (pit.lastX != null) { const dx = e.clientX - pit.lastX; const dir = Math.sign(dx); if (dir && dir !== pit.dir && Math.abs(dx) > 2) { pit.dir = dir; pit.swipes++; const mud = $('#mud'); if (mud) mud.style.opacity = String(Math.max(0, 1 - pit.swipes / 10)); if (pit.swipes >= 10) finishPit(1); } }
    pit.lastX = e.clientX;
  });

  // ---------------------------------------------------------------- top bar and drawing
  function topHtml() {
    const m = me(); const ph = S.phase;
    const cake = ['DRIVE', 'PIT', 'RESULT', 'ENTRANCE', 'JOBS', 'MAP'].includes(ph) ? `<span class="cake">🎂 ${Math.round(S.cake)}%</span>` : '';
    const role = ['DRIVE', 'JOBS'].includes(ph) && m.role ? `<span class="role">${esc(m.role)}</span>` : ph === 'ENTRANCE' ? `<span class="role">${m.side === 'R' ? 'Right' : 'Left'} side</span>` : '';
    return `<div class="who" style="--c:${m.color}">${W.bust(m, 'sm')}<b>${esc(m.name)}</b></div>${role}${cake}`;
  }
  function render() {
    if (!S || !S.me) return;
    document.body.dataset.phase = S.phase; document.body.dataset.stage = S.stage?.key || '';
    mount(top, topHtml());
    const [key, html] = (R[S.phase] || (() => ['x', '']))();
    if (key !== screenKey) { screenKey = key; releaseAll(); main.innerHTML = html; main.classList.remove('in'); void main.offsetWidth; main.classList.add('in'); }
    if (S.phase === 'PIT') startPit();
    drawMap();
  }
  addEventListener('resize', drawMap);
  main.addEventListener('click', (e) => {
    const b = e.target.closest('[data-a]'); if (!b) return; const a = b.dataset.a;
    if (a === 'start') send('start'); if (a === 'again') send('again'); if (a === 'menu') send('menu');
    if (a === 'addBot') send('addBot'); if (a === 'removeBots') send('removeBots');
    if (a === 'bust') { send('bust', { n: Number(b.dataset.n) }); buzz(10); }
    if (a === 'vote') { buzz(25); send('vote', { i: Number(b.dataset.i) }); }
  });
})();
