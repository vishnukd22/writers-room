/* Last Night in the Mansion: the TV is the house. The candle, the room you are in, Mortimer, and the scares. */
(() => {
  const $ = (q) => document.querySelector(q);
  const esc = W.esc;
  const TEST = new URLSearchParams(location.search).has('test');
  const socket = io({ autoConnect: false, transports: ['websocket', 'polling'] });
  window.__gnSocket = socket;
  window.__gnTV = true;
  const stage = $('#stage'); const top = $('#top'); const side = $('#side'); const guests = $('#guests'); const candleEl = $('#candle'); const caption = $('#caption');
  let S = null; let P = null;

  // ---------------------------------------------------------------- boot
  $('#bOpen').onclick = async () => {
    AV.init(); await W.ready; $('#gate').classList.add('hide');
    try { document.documentElement.requestFullscreen?.(); } catch (e) { /* fine */ }
    socket.connect();
  };
  const KEY = TEST ? 'mnHostTest' : 'mnHost';
  socket.on('connect', () => {
    const saved = sessionStorage.getItem(KEY);
    const create = () => { const from = sessionStorage.getItem('gnPrev'); sessionStorage.removeItem('gnPrev'); socket.emit('host:create', { game: 'mn', test: TEST, from }, (r) => sessionStorage.setItem(KEY, r.code)); };
    if (saved) socket.emit('host:attach', { code: saved, game: 'mn' }, (r) => { if (r.error) { if (S && S.phase !== 'LOBBY') flash('The game server restarted, so that night ended. Here is a fresh one.', 9000); create(); } }); else create();
  });
  function goMenu() { if (S) sessionStorage.setItem('gnPrev', S.code); sessionStorage.removeItem(KEY); location.href = TEST ? '/tv?test' : '/tv'; }
  socket.on('menu', goMenu);
  socket.on('state', (s) => { W.syncClock(s.now); P = S; S = s; window.__S = s; render(); effects(); });
  $('#bMusic').onclick = (e) => { e.target.textContent = AV.toggleMusic() ? 'Music on' : 'Music off'; lastMusic = null; music(); };
  $('#bSfx').onclick = (e) => { e.target.textContent = AV.toggleSfx() ? 'Sounds on' : 'Sounds off'; };
  $('#bVoice').onclick = (e) => { e.target.textContent = AV.toggleVoice() ? 'Mortimer on' : 'Mortimer off'; };
  $('#bSkip').onclick = () => socket.emit('host:skip');
  $('#bFull').onclick = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.());
  document.addEventListener('keydown', (e) => { if (e.code === 'Space' && S && S.phase !== 'LOBBY') { e.preventDefault(); socket.emit('host:skip'); } });
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tv]'); if (!b) return;
    const a = b.dataset.tv;
    if (a === 'bot') socket.emit('host:addBot', {}, (r) => { if (r?.error) flash(r.error); });
    if (a === 'fill') { const need = Math.max(0, 4 - S.players.length); for (let i = 0; i < need; i++) socket.emit('host:addBot', {}); }
    if (a === 'nobots') socket.emit('host:removeBots', {});
    if (a === 'start') socket.emit('host:start', {}, (r) => { if (r?.error) flash(r.error); });
  });
  let capT = null;
  function flash(t, ms = 2800) { caption.innerHTML = `<p>${esc(t)}</p>`; caption.className = 'show'; clearTimeout(capT); capT = setTimeout(() => { caption.className = ''; }, ms); }
  let heard = Date.now();
  socket.on('state', () => { heard = Date.now(); });
  setInterval(() => {
    if (!S || S.phase === 'LOBBY' || S.phase === 'END') return;
    if (Date.now() - heard > 40000) { heard = Date.now(); if (socket.connected) socket.emit('host:attach', { code: S.code, game: 'mn' }, () => {}); else socket.connect(); }
  }, 5000);

  // ---------------------------------------------------------------- helpers
  const P_ = (id) => S.players.find((p) => p.id === id);
  const name = (id) => esc(P_(id)?.name || 'Someone');
  const host = () => { try { return new URL(S.joinUrl).host; } catch (e) { return location.host; } };
  const img = (k) => W.img(k);
  const pic = (k, cls = '', alt = '') => (img(k) ? `<img class="${cls}" src="${img(k)}" alt="${esc(alt)}">` : '');
  const totals = {};
  const timer = (ends, start) => { if (!ends) return ''; const total = start ? Math.max(1, ends - start) : (totals[ends] = totals[ends] || Math.max(1, ends - W.now())); return `<div class="timer"><i data-ends="${ends}" data-total="${total}" data-kind="bar"></i></div><span class="secs" data-ends="${ends}"></span>`; };
  const mort = (cls = '') => `<div class="mort ${cls}">${pic('mn-mortimer-full') || pic('mn-mortimer') || '<span class="ghostly">🕯️</span>'}</div>`;
  const TYPE = { talk: 'Talk it through', timing: 'Timing', speed: 'Be quick', memory: 'Eyes and memory' };
  const pct = () => Math.max(0, Math.round(S.candle));

  // ---------------------------------------------------------------- the candle: the one thing you watch all night
  function candleHtml() {
    if (S.phase === 'LOBBY') return '';
    const c = Math.max(0, Math.min(100, S.candle)); const low = c < 20;
    const keys = [...Array(5).keys()].map((i) => `<i class="${i < S.keys ? 'on' : ''}">${i < S.keys ? (img('mn-key') ? `<img src="${img('mn-key')}" alt="">` : '🗝️') : ''}</i>`).join('');
    return `<div class="cwrap ${low ? 'low' : ''} ${c <= 0 ? 'out' : ''}" style="--h:${c}">
      <div class="flame"><div class="glow"></div><div class="fl"></div></div><div class="wick"></div>
      <div class="wax"><span class="drip d1"></span><span class="drip d2"></span></div><div class="dish"></div></div>
      <div class="cnum"><b>${pct()}%</b><span>of your candle</span></div>
      <div class="keys" title="Key pieces for the front door">${keys}</div><div class="klab">${S.keys} of 5 key pieces</div>`;
  }

  // ---------------------------------------------------------------- top bar
  function topHtml() {
    const ph = S.phase; const x = S.x;
    if (ph === 'LOBBY' || ph === 'END') return '';
    if (ph === 'ROOM' || ph === 'DOOR') {
      const n = ph === 'DOOR' ? 'The last door' : `Room ${S.roomN} of ${S.rooms}`;
      const t = S.step === 'play' && x.ends ? timer(x.ends, x.start) : '';
      return `<div class="plac"><span class="n">${n}</span><h1>${esc(x.room?.name || '')}</h1></div><div class="tbox">${t}</div>`;
    }
    if (ph === 'POSSESS') return `<div class="plac poss"><span class="n">A possession</span><h1>${esc(x.poss?.name || '')}</h1></div><div class="tbox">${S.step === 'play' && x.ends ? timer(x.ends, x.start) : ''}</div>`;
    return `<div class="plac"><span class="n">Hollowmere House</span><h1>${ph === 'HALL' ? 'The hallway' : 'The front hall'}</h1></div>`;
  }

  // ---------------------------------------------------------------- the guests along the bottom, with what the bots "say"
  function guestsHtml() {
    if (S.phase === 'LOBBY') return '';
    const roles = S.x.roles || {}; const showRoles = ['ROOM', 'DOOR'].includes(S.phase) && ['jobs', 'play'].includes(S.step);
    const now = W.now(); const said = {}; (S.x.bubbles || []).filter((b) => now - b.at < 11000).forEach((b) => { said[b.pid] = b; });
    return S.players.map((p) => {
      const b = said[p.id]; const poss = S.phase === 'POSSESS' && S.x.who === p.id;
      return `<div class="g ${poss ? 'poss' : ''} ${b ? 'talking' : ''} ${p.connected ? '' : 'gone'}">${W.bust(p, 'md')}<b>${esc(p.name)}</b>${showRoles && roles[p.id] ? `<small>${esc(roles[p.id])}</small>` : p.bot ? '<small>guest</small>' : ''}</div>`;
    }).join('');
  }
  function sideHtml() {
    const ev = (S.x.events || []).filter((e) => W.now() - e.at < 7000);
    const prog = S.x.tv?.prog;
    const pg = prog && S.step === 'play' ? `<div class="prog"><span>${esc(prog.label)}</span><b>${prog.v} of ${prog.max}</b><div class="pbar"><i style="width:${Math.min(100, (100 * prog.v) / Math.max(1, prog.max))}%"></i></div></div>` : '';
    const now = W.now(); const said = (S.x.bubbles || []).filter((b) => now - b.at < 12000).slice(-3).reverse();
    const says = said.map((b) => { const p = P_(b.pid); return `<div class="say">${p ? W.bust(p, 'sm') : ''}<p><b>${esc(p?.name || '')}</b>${esc(b.text)}</p></div>`; }).join('');
    return `${pg}<div class="evs">${ev.map((e) => `<div class="ev">${esc(e.text)}</div>`).join('')}</div><div class="says">${says}</div>`;
  }

  // ---------------------------------------------------------------- the screens
  const R = {
    LOBBY() {
      const n = S.players.length;
      const title = pic('mn-title', 'ttl', 'Last Night in the Mansion') || '<h1 class="ttl-t">Last Night<br><span>in the</span> Mansion</h1>';
      const faces = S.players.map((p) => `<div class="lg">${W.bust(p, 'lg')}<b>${esc(p.name)}</b>${p.bot ? '<small>guest</small>' : ''}</div>`).join('');
      const tbtn = TEST ? `<div class="tbtns"><button data-tv="bot">Add a bot</button><button data-tv="fill">Fill to 4</button><button data-tv="nobots">No bots</button><button data-tv="start">Start</button></div>` : '';
      return `<div class="lobby">
        <div class="lt">${title}<p class="tag">Escape Hollowmere House before your one candle burns out. Five rooms, one butler, no refunds.</p>
          <ul class="facts"><li>2 to 8 players</li><li>About 20 minutes</li><li>Everyone wins or nobody does</li></ul></div>
        <div class="join"><img class="qr" src="${S.qr}" alt="QR code to join"><p>Scan, or go to</p><b class="url">${esc(host())}/mn</b><p>Room code</p><b class="code">${esc(S.code)}</b></div>
        <div class="lfaces">${faces || '<p class="wait">The house is waiting for guests...</p>'}</div>
        <p class="hint">${n < 2 ? 'At least 2 guests, please.' : n === 2 ? 'Two of you? Two more guests will join you. The first phone starts the night.' : 'The first phone starts the night.'}</p>${tbtn}</div>`;
    },
    INTRO() {
      if (S.step === 'door') return `<div class="doorslam">${pic('mn-door', 'big') || '<span class="em">🚪</span>'}</div>`;
      return `<div class="hall">${mort('big')}<div class="hx"><h2>Good evening.</h2><p>I am Mortimer. I have been the butler here for a hundred and twelve years. Most of them dead.</p><div class="rules"><span>🕯️ One candle for all of you</span><span>🚪 Five rooms, then the front door</span><span>🗝️ Every room you clear gives you a key piece</span><span>📱 Do what your phone says</span></div></div></div>`;
    },
    HALL() {
      const doors = (S.night || []).map((r, i) => { const cur = i === S.x.next; const st = r.res || (cur ? 'next' : 'shut'); return `<div class="nd st-${st}"><span class="e">${r.res === 'win' ? '🗝️' : r.res === 'fail' ? '✖' : cur ? '🕯️' : '🚪'}</span><b>${r.res || cur ? esc(r.name) : '?'}</b><small>${r.res === 'win' ? 'Cleared' : r.res === 'fail' ? 'Lost' : cur ? 'Next' : ''}</small></div>`; }).join('');
      return `<div class="night">${doors}<div class="nd st-shut last"><span class="e">🏚️</span><b>Front door</b></div></div>`;
    },
    ROOM() {
      const x = S.x; const r = x.room || {}; const art = pic(`mn-room-${r.key}`, 'roomart', r.name);
      if (S.step === 'intro') return `<div class="rintro">${art || `<div class="noart">${{ talk: '📜', timing: '⏳', speed: '⚡', memory: '👁️' }[r.type] || '🚪'}</div>`}<div class="rx"><span class="kind">${esc(TYPE[r.type] || '')}</span><h2>${esc(r.name)}</h2><p>${esc(r.how)}</p></div></div>`;
      if (S.step === 'jobs') return jobsHtml(r);
      const w = MNW.render(x.tv?.w, { S, live: false });
      const over = S.step === 'win' ? `<div class="stamp win"><b>Cleared</b><span>+1 key piece${x.left > 0.45 ? '. Quickly, too.' : ''}</span></div>` : S.step === 'fail' ? '<div class="stamp fail"><b>The room won</b><span>-15% of your candle</span></div>' : '';
      return `<div class="play t-${r.key}">${w}${over}</div>`;
    },
    POSSESS() {
      const x = S.x; const p = P_(x.who); const poss = x.poss || {};
      if (S.step === 'dark') return '<div class="black"></div>';
      if (['chosen', 'ready'].includes(S.step)) return `<div class="chosen">${p ? W.bust(p, 'xl') : ''}<div class="cx"><span class="kind">The house has chosen</span><h2>${esc(p?.name || '')}</h2><p class="pn">${esc(poss.name)}</p><p>${esc(poss.how)}</p>${S.step === 'ready' ? '<p class="watch">Everyone else: watch. Shout if it helps.</p>' : ''}</div></div>`;
      const w = MNW.render(x.tv?.w, { S, live: false });
      const over = S.step === 'win' ? `<div class="stamp win"><b>${esc(p?.name || '')} broke free</b><span>+10% candle</span></div>` : S.step === 'fail' ? `<div class="stamp fail"><b>The house kept ${esc(p?.name || '')} a while</b><span>-15% of your candle</span></div>` : '';
      return `<div class="possplay"><div class="who">${p ? W.bust(p, 'lg') : ''}<b>${esc(p?.name || '')} is possessed</b></div><div class="pw">${w}</div>${over}</div>`;
    },
    DOOR() {
      const x = S.x;
      if (S.step === 'intro') return `<div class="rintro">${pic('mn-door', 'roomart') || '<div class="noart">🚪</div>'}<div class="rx"><span class="kind">The way out</span><h2>The Front Door</h2><p>${S.keys} of 5 key pieces. ${esc(x.room?.how || '')}</p></div></div>`;
      if (S.step === 'jobs') return jobsHtml(x.room || {});
      return `<div class="play t-door">${MNW.render(x.tv?.w, { S, live: false })}</div>`;
    },
    END() {
      const e = S.x.end || {}; const esc_ = e.escaped;
      const art = pic(esc_ ? 'mn-dawn' : 'mn-lost', 'endart');
      if (S.step !== 'stats') return `<div class="endbig ${esc_ ? 'win' : 'lose'}">${art}<h2>${esc_ ? 'You got out.' : 'The house kept you.'}</h2><p>${esc_ ? 'Dawn. Birds. Somewhere, a butler sighs.' : 'Your rooms are ready.'}</p></div>`;
      const scr = e.screamer ? P_(e.screamer) : null; const cl = e.clumsy ? P_(e.clumsy.id) : null;
      return `<div class="stats ${esc_ ? 'win' : 'lose'}">${art}<div class="sx"><h2>${esc_ ? 'You escaped' : 'Lost in the house'}</h2>
        <div class="sg"><div><b>${e.candle}%</b><span>candle left</span></div><div><b>${e.rooms} of ${e.of}</b><span>rooms cleared</span></div><div><b>${e.keys} of 5</b><span>key pieces</span></div><div><b>${e.best != null ? `${e.best}%` : 'None yet'}</b><span>best escape tonight</span></div></div>
        <div class="awards">${scr ? `<div class="aw">${W.bust(scr, 'md')}<p><b>Screamed loudest</b>${esc(scr.name)}, the house's favourite</p></div>` : ''}${cl ? `<div class="aw">${W.bust(cl, 'md')}<p><b>Spilled the most wax</b>${esc(cl.name)}, ${e.clumsy.slips}% all by themselves</p></div>` : ''}</div>
        <p class="again">The first phone can play again or go back to the games.</p></div></div>`;
    },
  };
  function jobsHtml(r) {
    const roles = S.x.roles || {};
    const by = {}; S.players.forEach((p) => { const k = roles[p.id] || 'Helper'; (by[k] = by[k] || []).push(p); });
    return `<div class="jobs"><h2>${esc(r.name || '')}</h2><p class="how">${esc(r.how || '')}</p><div class="jg">${Object.entries(by).map(([k, ps]) => `<div class="jb"><span>${esc(k)}</span><div>${ps.map((p) => `${W.bust(p, 'md')}<b>${esc(p.name)}</b>`).join('')}</div></div>`).join('')}</div><p class="look">Look at your phone.</p></div>`;
  }

  // ---------------------------------------------------------------- backdrop art for each room
  let lastArt = '';
  function backdrop() {
    const ph = S.phase; let k = 'mn-house';
    if (ph === 'ROOM' && S.x.room) k = `mn-room-${S.x.room.key}`;
    if (ph === 'DOOR') k = 'mn-door'; if (ph === 'END') k = S.x.end?.escaped ? 'mn-dawn' : 'mn-lost';
    const src = img(k) || img('mn-house');
    if (src === lastArt) return; lastArt = src;
    $('#art').style.backgroundImage = src ? `url(${src})` : 'none';
    $('#backdrop').className = src ? 'has-art' : '';
  }

  // ---------------------------------------------------------------- render
  let lastKey = '';
  function render() {
    if (!S) return;
    document.body.dataset.phase = S.phase; document.body.dataset.step = S.step || '';
    document.body.classList.toggle('low', !['LOBBY', 'END'].includes(S.phase) && S.candle < 20);
    backdrop();
    mount(candleEl, candleHtml()); mount(top, topHtml()); mount(guests, guestsHtml()); mount(side, sideHtml());
    const html = (R[S.phase] || (() => ''))();
    const key = `${S.phase}|${S.step}|${S.x.room?.key || S.x.poss?.key || ''}|${S.roomN}`;
    if (key !== lastKey) { lastKey = key; stage.classList.remove('enter'); void stage.offsetWidth; stage.classList.add('enter'); }
    mount(stage, html);
    music();
  }
  let lastMusic = null;
  function music() {
    const ph = S.phase; const t = S.x.room?.type; const k = S.x.room?.key;
    let key = 'mn-lobby'; let mood = 'dark';
    if (ph === 'INTRO' || ph === 'HALL') key = 'mn-intro';
    if (ph === 'ROOM') { if (k === 'ballroom') { key = 'mn-waltz'; mood = 'gentle'; } else if (t === 'speed' || t === 'timing') { key = 'mn-speed'; mood = 'tense'; } else if (t === 'memory') key = 'mn-memory'; else key = 'mn-talk'; }
    if (ph === 'POSSESS') { key = 'mn-possessed'; mood = 'tense'; }
    if (ph === 'DOOR') { key = 'mn-finale'; mood = 'tense'; }
    if (ph === 'END') { key = S.x.end?.escaped ? 'mn-dawn' : 'mn-lost'; mood = S.x.end?.escaped ? 'gentle' : 'dark'; }
    AV.setBed(k === 'music' && ph === 'ROOM' ? 0.12 : ph === 'ROOM' || ph === 'DOOR' ? 0.35 : 0.5);
    const id = `${key}|${mood}`;
    if (id !== lastMusic) { lastMusic = id; AV.music(key, mood); }
  }

  // ---------------------------------------------------------------- Mortimer, sounds, the scares
  let lastCue = null; let lastFx = 0; let lastPlayers = 0; let lastScare = 0; let lastFlash = 0; let capTimer = null;
  function effects() {
    const cue = S.cue;
    if (cue && cue.id !== lastCue) {
      lastCue = cue.id; caption.innerHTML = `${pic('mn-mortimer', 'cm')}<p>${esc(cue.text)}</p>`; caption.className = 'show';
      clearTimeout(capTimer);
      AV.speak(cue, (id) => { socket.emit('host:cueDone', { id }); capTimer = setTimeout(() => { if (lastCue === id) caption.className = ''; }, 500); });
    } else if (!cue) { if (!AV.speakingId()) caption.className = ''; }
    const fresh = (S.fx || []).filter((f) => f.id > lastFx);
    if (P === null) lastFx = Math.max(0, ...(S.fx || []).map((f) => f.id)); else fresh.forEach((f) => { lastFx = Math.max(lastFx, f.id); AV.fx(f.name, { gap: f.name.startsWith('mn-note') ? 0 : 150 }); });
    if (S.phase === 'LOBBY' && S.players.length > lastPlayers && P) AV.fx('join');
    lastPlayers = S.players.length;
    // a jump scare: black, then a face for well under a second, then black again
    if (S.scare && S.scare.id !== lastScare) {
      lastScare = S.scare.id; const el = $('#scare');
      const face = img(S.scare.img) || img('mn-scare-1');
      el.innerHTML = face ? `<img src="${face}" alt="">` : '<div class="drawn"><i></i><i></i><b></b></div>';
      el.className = 'black'; setTimeout(() => { el.className = 'face'; }, 260); setTimeout(() => { el.className = 'black'; }, 980); setTimeout(() => { el.className = ''; }, 1250);
    }
    if (S.flash && S.flash.id !== lastFlash) { const first = lastFlash === 0 && P === null; lastFlash = S.flash.id; if (!first && S.flash.kind === 'freeze') { AV.fx('mn-chime'); } }
  }
})();
