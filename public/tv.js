/* WRITERS' ROOM: the TV */
(() => {
  const $ = (q) => document.querySelector(q);
  const esc = W.esc;
  const socket = io({ autoConnect: false });
  const stage = $('#stage'); const top = $('#top'); const dock = $('#dock'); const scenery = $('#scenery'); const caption = $('#caption');
  let S = null; let P = null;
  const totals = {};

  // ---------------------------------------------------------------- boot
  $('#bOpen').onclick = async () => {
    AV.init(); await W.ready; $('#gate').classList.add('hide');
    try { document.documentElement.requestFullscreen?.(); } catch (e) { /* fine */ }
    socket.connect();
  };
  socket.on('connect', () => {
    const saved = sessionStorage.getItem('wrHost');
    const create = () => socket.emit('host:create', {}, (r) => sessionStorage.setItem('wrHost', r.code));
    if (saved) socket.emit('host:attach', { code: saved }, (r) => { if (r.error) create(); }); else create();
  });
  socket.on('state', (s) => { W.syncClock(s.now); P = S; S = s; window.__S = s; render(); effects(); });
  $('#bMusic').onclick = (e) => { e.target.textContent = AV.toggleMusic() ? 'Music on' : 'Music off'; lastMusic = null; music(); };
  $('#bSfx').onclick = (e) => { e.target.textContent = AV.toggleSfx() ? 'Sounds on' : 'Sounds off'; };
  $('#bVoice').onclick = (e) => { e.target.textContent = AV.toggleVoice() ? 'Narrator on' : 'Narrator off'; };
  $('#bSkip').onclick = () => socket.emit('host:skip');
  $('#bFull').onclick = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.());
  document.addEventListener('keydown', (e) => { if (e.code === 'Space' && S && S.phase !== 'LOBBY') { e.preventDefault(); socket.emit('host:skip'); } });
  document.addEventListener('click', (e) => { const b = e.target.closest('[data-start]'); if (b) socket.emit('host:start', {}, (r) => { if (r?.error) alert(r.error); }); });

  // ---------------------------------------------------------------- helpers
  const T = () => { if (!S.endsAt) return ''; if (!totals[S.endsAt]) totals[S.endsAt] = Math.max(1, S.endsAt - W.now()); return `data-ends="${S.endsAt}" data-total="${totals[S.endsAt]}"`; };
  const totalFor = (e) => { if (!totals[e]) totals[e] = Math.max(1, e - W.now()); return totals[e]; };
  const timer = () => (S.endsAt ? `<div class="timer" ${T()}></div>` : '');
  const tbar = () => (S.endsAt ? `<div class="tbar"><i data-kind="bar" ${T()}></i></div>` : '');
  const host = () => { try { return new URL(S.joinUrl).host; } catch (e) { return location.host; } };
  const P_ = (id) => S.players.find((p) => p.id === id);
  const charOf = (id) => (S.cast || []).find((c) => c.id === id);
  const rot = (i) => `${((i * 37) % 7) - 3}deg`;
  const live = () => S.players.filter((p) => p.connected).length;
  const genreArt = () => (S.genre ? W.img(`genre-${S.genre.art}`) : null);

  // [look, picture, ambience]: the ambience names the light and weather drawn over the picture.
  const artOf = (g) => (g ? W.img(`genre-${g.art}`) : null);
  const curGenre = () => S.x.scene?.genre || S.x.fin?.genre || null;
  function sceneryFor() {
    const ph = S.phase; const g = curGenre(); const ga = artOf(g); const gfx = g ? `genre:${g.art}` : 'room-writers';
    if (ph === 'SCENE_INTRO' || ph === 'SCENE' || ph === 'CUT_INTRO' || ph === 'CUT') return ga ? ['room', ga, gfx] : ['stage', W.img('room-stage'), 'room-stage'];
    if (ph === 'SCENE_END' || ph === 'FINAL') return ['stage', W.img('room-stage'), 'room-stage'];
    return ['room', W.img('room-writers'), 'room-writers'];
  }
  let lastScenery = '';
  function setScenery() {
    const [cls, art, amb] = sceneryFor(); const key = `${cls}|${art}|${amb}`;
    document.body.classList.toggle('showart', (S.phase === 'SCENE_INTRO' && S.step === 'genre') || S.phase === 'CUT_INTRO');
    document.body.classList.toggle('blurart', S.phase === 'SCENE' || (S.phase === 'SCENE_INTRO' && S.step === 'cast') || (S.phase === 'CUT' && S.step !== 'play'));
    if (key === lastScenery) return; lastScenery = key;
    scenery.className = `${cls}${art ? ' has-art' : ''}`;
    scenery.querySelector('.art').style.backgroundImage = art ? `url(${art})` : '';
    const cam = scenery.querySelector('.cam'); const n = (art || cls).length;
    cam.style.setProperty('--ox', `${[20, 80, 50, 30, 70][n % 5]}%`); cam.style.setProperty('--oy', `${[30, 60, 40, 70][n % 4]}%`);
    cam.style.animation = 'none'; void cam.offsetWidth; cam.style.animation = '';
    AMB.set(art || (amb && amb.startsWith('genre:')) ? amb : null);
  }

  function topbar() {
    if (S.phase === 'LOBBY') return '';
    const sc = S.x.scene; const f = S.x.fin;
    const left = sc ? `<div class="showname">${esc(sc.title)}<small>${esc(sc.genre.name)}</small></div>` : f ? `<div class="showname">${esc(f.title)}<small>The finale · ${esc(f.genre.name)}</small></div>` : `<div class="showname">Writers' Room<small>&nbsp;</small></div>`;
    const total = (S.x.scene?.count || 0) + 1; const at = sc ? sc.i : f || S.phase === 'FINAL' ? total - 1 : -1;
    const prog = Array.from({ length: total }, (_, i) => `<i class="${i < at ? 'done' : i === at ? 'now' : ''}"></i>`).join('') ;
    return `${left}<div class="progress">${total > 1 ? prog : ''}</div><div class="joinbox"><b>${esc(S.code)}</b><span>${esc(host())}</span></div>`;
  }
  function dockbar() {
    if (S.phase === 'LOBBY') return '';
    const on = S.phase === 'SCENE' && S.x.cur ? [S.x.cur.speaker] : S.phase === 'CUT' && S.x.fin?.line ? [S.x.fin.line.speaker.id] : [];
    return [...S.players].sort((a, b) => b.score - a.score).map((p) => `<span class="tag ${p.connected ? '' : 'off'} ${on.includes(p.id) ? 'on' : ''}" style="--c:${p.color}"><span class="dot">${esc(W.initials(p.name))}</span>${esc(p.name)}<b>${p.score}</b></span>`).join('');
  }
  const dotsTyping = '<span class="typing"><i></i><i></i><i></i></span>';

  // ---------------------------------------------------------------- screens
  const R = {
    LOBBY() {
      const t = W.img('title');
      const seats = S.players.map((p, i) => `<div class="index" style="--r:${rot(i)};--c:${p.color}"><div class="hand">${esc(p.name)}</div><small>ready</small></div>`).join('') + Array.from({ length: Math.max(0, 6 - S.players.length) }, () => '<div class="empty"></div>').join('');
      return `<div class="lobby">
        <div>${t ? `<img class="titleimg" src="${t}" alt="Writers' Room">` : '<div class="titlecard">Writers\'<br>Room</div>'}
          <div class="join">${S.qr ? `<img src="${S.qr}" alt="QR code to join">` : ''}<div><div class="count">Scan, or go to</div><div class="url">${esc(host())}</div><div class="count">and enter</div><div class="code">${esc(S.code)}</div></div></div></div>
        <div><div class="roster ${S.players.length > 6 ? 'many' : ''}">${seats}</div>
          <p class="startnote">Everyone writes. Everyone acts. 4 to 12 players, about 20 minutes. ${S.players.length >= 4 ? `${esc(P_(S.vipId)?.name || 'The first player')} starts the game from their phone.` : `Waiting for ${4 - S.players.length} more.`}</p>
          ${S.aiOn ? '' : '<p class="startnote">The AI writer is offline, so scenes come from the backup scripts.</p>'}</div></div>`;
    },
    INTRO() {
      if (S.step === 'how') return `<div class="center"><div class="howrow">
        <div class="howcard" style="--r:-2deg"><b>✍️</b>The room writes the next line, live</div>
        <div class="howcard" style="--r:1.5deg"><b>🎭</b>Two of you perform it. Cold.</div>
        <div class="howcard" style="--r:-1deg"><b>😂</b>Laughs and cracks score points</div></div>
        <p class="lede">Finale: <b>CUT!</b> Grab the pen from the narrator.</p></div>`;
      return '<div class="center"><div class="huge">You write it.<br>They perform it.</div></div>';
    },
    SCENE_INTRO() {
      const sc = S.x.scene;
      if (S.step === 'cast') return `<div class="center"><div class="kicker">Starring</div><div class="castrow">${sc.actors.map((a, i) => `<div class="castbig" style="--r:${i % 2 ? 2 : -2}deg">${W.bust(a, 'xl')}<div class="nm">${esc(a.name)}</div><div class="role">${esc(a.role)}</div></div>`).join('')}</div><span class="stamp standup">Stand up!</span></div>`;
      return `<div class="center epcard"><div class="n">Scene ${sc.i + 1} of ${sc.count} · ${esc(sc.genre.name)}</div><div class="t">${esc(sc.title)}</div><div class="setting">${esc(sc.setting)}</div></div>`;
    },
    SCENE() {
      const x = S.x; const sc = x.scene; const cur = x.cur;
      const flash = x.flash ? x.flash.id : null;
      const actors = sc.actors.map((a) => `<div class="actor ${cur && cur.speaker === a.id ? 'talk' : ''} ${flash === a.id ? 'cracked' : ''}">${W.bust(a, 'lg')}<div class="nm">${esc(a.name)}</div><div class="role">${esc(a.role)}</div>${flash === a.id ? '<span class="stamp crackstamp">Cracked!</span>' : ''}</div>`).join('');
      const speaker = cur ? sc.actors.find((a) => a.id === cur.speaker) : null;
      const line = cur ? `<div class="lineboard" data-k="${cur.k}">${cur.dir ? `<span class="dirstamp">${esc(cur.dir)}</span>` : ''}<div class="who">${esc(speaker?.name || '')}</div><div class="words">${esc(cur.text)}</div><div class="by">${cur.by ? `written by ${esc(cur.by.name)}` : cur.k === 0 ? 'the opening line' : ''}${cur.auto && cur.by ? ' (too slow, so we helped)' : ''}</div></div>` : '';
      const w = x.writing ? `<div class="writingnow">${W.bust(x.writing.writer, 'sm')}<span><b>${esc(x.writing.writer.name)}</b> is writing ${esc(x.writing.speaker.name)}'s next line</span>${dotsTyping}<div class="tbar mini"><i data-kind="bar" data-ends="${x.writing.endsAt}" data-total="${totalFor(x.writing.endsAt)}"></i></div></div>` : '<div class="writingnow"><span>Last line of the scene</span></div>';
      return `<div class="scene"><div class="actors n${sc.actors.length}" id="scActors">${actors}</div>${line}<div class="scenefoot" id="scFoot">${w}<div class="laughs">😂 <b>${x.laughs}</b><small>line ${x.lineNo} of ${x.lineCount}</small></div></div></div>`;
    },
    SCENE_END() {
      const x = S.x; const sc = x.scene;
      if (S.step === 'line') return `<div class="center"><div class="kicker">Line of the scene</div><div class="index big" style="--r:-1.5deg"><div class="pin"></div><div class="hand">"${esc(x.line.text)}"</div></div><div class="lede">Written by <b>${esc(x.line.by?.name || '')}</b>, said by ${esc(x.line.speakerName || '')}. ${x.line.total} laughs. +200</div></div>`;
      if (S.step === 'vote' || S.step === 'result') {
        const max = Math.max(1, ...Object.values(x.counts || {}));
        const win = (x.winners || []).map((w) => w.id);
        const cards = sc.actors.map((a) => `<div class="votecard ${win.includes(a.id) ? 'won' : ''}">${W.bust(a, 'xl')}<div class="nm">${esc(a.name)}</div><div class="vbar" id="vb-${a.id}"><i style="width:${((x.counts?.[a.id] || 0) / max) * 100}%"></i></div><div class="vn" id="vn-${a.id}">${x.counts?.[a.id] || 0}</div>${win.includes(a.id) ? '<span class="stamp ok">Best actor</span>' : ''}</div>`).join('');
        const top = S.step === 'result' ? `<div class="mini-board">${(x.top || []).map((r, i) => `<span>${i + 1}. ${esc(r.name)} <b>${r.score}</b></span>`).join('')}</div>` : '';
        return `<div class="center"><div class="kicker">${S.step === 'vote' ? 'Vote on your phone' : 'The room has spoken'}</div><div class="big">Best actor?</div><div class="castrow">${cards}</div>${S.step === 'vote' ? tbar() : top}</div>`;
      }
      return '<div class="center"><div class="slate wrapslate"><div class="clap"></div><div class="rows"><div class="full">SCENE!<b>That\'s a wrap on scene ' + (sc.i + 1) + '</b></div></div></div></div>';
    },
    CUT_INTRO() {
      const f = S.x.fin;
      return `<div class="center epcard"><div class="n">The finale · ${esc(f.genre.name)}</div><div class="t">CUT!</div><div class="setting">Everyone is in this one. Hit CUT on your phone and you write the next line.</div></div>`;
    },
    CUT() {
      const f = S.x.fin; const l = f.line;
      if (S.step === 'write') return `<div class="center cutnow"><div class="cutclap">CUT!</div><div class="big">${esc(f.cutter?.name || '')} has the pen</div><p class="lede">Writing ${esc(f.target?.name || '')}'s next line. Heckle freely.</p><div class="timer" ${T()}></div></div>`;
      if (S.step === 'rewrite') return `<div class="center"><div class="huge rewriting">Rewriting${dotsTyping}</div><p class="lede">The story has to follow that line now.</p></div>`;
      if (S.step === 'end') return '<div class="center"><div class="huge">That\'s a wrap!</div></div>';
      if (!l) return '<div class="center"><div class="big">Rolling...</div></div>';
      return `<div class="finline ${l.kind}"><div class="sp">${W.bust(l.speaker, 'xl')}<div class="nm">${esc(l.speaker.name)}</div></div><div class="lineboard" data-k="${f.lineNo}">${l.kind === 'cut' ? `<span class="dirstamp">✂️ Written by ${esc(l.by?.name || '')}</span>` : ''}<div class="words">${esc(l.text)}</div></div></div>
        <div id="cutStatus"><div class="cutstatus ${f.locked ? 'locked' : 'open'}">${f.locked ? 'CUT is locked for a moment' : 'CUT is open. Grab it!'}</div></div>`;
    },
    FINAL() {
      const x = S.x;
      if (x.step === 'laugh') return `<div class="center"><div class="kicker">The biggest laugh of the night</div><div class="index big" style="--r:1.5deg"><div class="pin"></div><div class="hand">"${esc(x.line.text)}"</div></div><div class="lede">Written by <b>${esc(x.line.by?.name || '')}</b>. ${x.line.total} laughs.</div></div>`;
      if (x.step === 'actor') return `<div class="lastline">${W.bust(x.who, 'xl')}<div><div class="name">Best actor of the night</div><div class="big">${esc(x.who.name)}</div><div class="lede" style="text-align:left">${x.who.actorPts} acting points</div></div></div>`;
      const rows = x.rows || [];
      if (x.step === 'winner') return `<div class="lastline">${W.bust(rows[0], 'xl')}<div><div class="name">Tonight's head writer</div><div class="huge">${esc(rows[0]?.name || '')}</div></div></div>`;
      return `<div class="center"><div class="kicker">Final scores</div><div class="board2">${rows.map((r, i) => `<div class="srow ${i === 0 ? 'first' : ''}" style="animation-delay:${(rows.length - i) * 0.2}s"><span class="rk">${r.rank}</span><span class="nm">${esc(r.name)}</span><span class="sub">writing ${r.writerPts} · acting ${r.actorPts}</span><span class="pts">${r.score}</span></div>`).join('')}</div><p class="count">${esc(P_(S.vipId)?.name || 'The first player')} can start another game from their phone.</p></div>`;
    },
  };

  // ---------------------------------------------------------------- render
  let stageKey = ''; let enterTimer = null;
  const tpl = document.createElement('template');
  function patch(html) {
    const live = stage.querySelectorAll('[id]'); if (!live.length) return mount(stage, html) || true;
    tpl.innerHTML = html;
    for (const el of live) { const fresh = tpl.content.getElementById(el.id); if (fresh) mount(el, fresh.innerHTML); }
    return true;
  }
  function render() {
    setScenery();
    mount(top, topbar());
    mount(dock, dockbar());
    // Same screen as before: update only the live parts, so nothing re-animates on every laugh or vote.
    const key = `${S.phase}|${S.step}|${S.x.cur?.k ?? ''}|${S.x.scene?.i ?? ''}|${S.x.fin?.lineNo ?? ''}|${S.x.fin?.line?.text ?? ''}|${S.players.length}`;
    const fn = R[S.phase];
    const html = fn ? fn() : `<div class="center"><div class="big">${esc(S.phase)}</div></div>`;
    if (key === stageKey && patch(html)) { music(); return; }
    stageKey = key;
    stage.classList.remove('enter'); void stage.offsetWidth; stage.classList.add('enter');
    clearTimeout(enterTimer); enterTimer = setTimeout(() => stage.classList.remove('enter'), 2200);
    mount(stage, html);
    stage.querySelectorAll('[id]').forEach((el) => { el.__html = el.innerHTML; });
    music();
  }

  // ---------------------------------------------------------------- music per phase
  let lastMusic = null;
  function music() {
    const ph = S.phase; const g = curGenre();
    let key = 'lobby'; let mood = 'lobby';
    if (['SCENE_INTRO', 'SCENE', 'CUT_INTRO', 'CUT'].includes(ph) && g) { key = g.music; mood = g.mood || 'tense'; }
    else if (ph === 'SCENE_END') { key = 'ratings'; mood = 'ratings'; }
    else if (ph === 'FINAL') { key = 'finale'; mood = 'finale'; }
    else if (ph === 'INTRO') { key = 'casting'; mood = 'casting'; }
    AV.setBed(ph === 'SCENE' ? 0.2 : 0.55);
    const id = `${key}|${mood}`;
    if (id !== lastMusic) { lastMusic = id; AV.music(key, mood); }
  }

  // ---------------------------------------------------------------- narration, sound effects, live moments
  let lastCue = null; let lastFx = 0; let capTimer = null; let lastPlayers = 0;
  function effects() {
    // narrator
    const cue = S.cue;
    if (cue && cue.id !== lastCue) {
      lastCue = cue.id;
      caption.textContent = cue.text; caption.className = `show ${cue.kind === 'char' ? 'char' : ''}`;
      clearTimeout(capTimer);
      AV.speak(cue, (id) => { socket.emit('host:cueDone', { id }); capTimer = setTimeout(() => { if (lastCue === id) caption.className = ''; }, 600); });
    } else if (!cue && lastCue && AV.speakingId() === lastCue) { AV.stopVoice(); caption.className = ''; lastCue = null; } else if (!cue) { if (!AV.speakingId()) caption.className = ''; }
    // sound effects
    const fresh = (S.fx || []).filter((f) => f.id > lastFx);
    if (P === null) lastFx = Math.max(0, ...(S.fx || []).map((f) => f.id)); else fresh.forEach((f) => { lastFx = Math.max(lastFx, f.id); onFx(f.name); });
    // joins
    if (S.phase === 'LOBBY' && S.players.length > lastPlayers && P) AV.fx('join');
    lastPlayers = S.players.length;
  }
  function onFx(name) {
    if (name === 'laugh') { AV.fx('laugh', { gap: 700 }); burst('😂', 1); AMB.react('laugh'); return; }
    if (name === 'trombone') {
      AV.fx('trombone', { gap: 600 }); burst('💥', 3); AMB.react('gasp');
      const g = curGenre(); const pg = stage.querySelector('.lineboard');
      if (g?.fx === 'triplezoom' && pg) { pg.classList.add('zoom'); AV.fx('sting', { gap: 1500 }); AV.fx('thunder', { gap: 1500 }); setTimeout(() => pg.classList.remove('zoom'), 1300); }
      return;
    }
    if (name === 'scratch') { AV.fx('scratch'); burst('✂️', 2); return; }
    AV.fx(name, { gap: 300 });
  }
  function burst(emoji, n) {
    const box = $('#burst');
    for (let i = 0; i < n && box.childElementCount < 12; i++) {
      const s = document.createElement('span'); s.textContent = emoji;
      s.style.left = `${Math.random() < 0.5 ? 1 + Math.random() * 13 : 86 + Math.random() * 12}%`; s.style.setProperty('--dx', `${(Math.random() - 0.5) * 20}vw`); s.style.setProperty('--rot', `${(Math.random() - 0.5) * 60}deg`);
      box.appendChild(s); setTimeout(() => s.remove(), 2500);
    }
  }

  // ---------------------------------------------------------------- rain on the window
  const cv = document.getElementById('rain'); const cx = cv.getContext('2d'); let drops = [];
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  function size() { cv.width = cv.clientWidth; cv.height = cv.clientHeight; drops = Array.from({ length: 90 }, () => ({ x: Math.random() * cv.width, y: Math.random() * cv.height, l: 6 + Math.random() * 12, v: 3 + Math.random() * 5 })); }
  addEventListener('resize', size); size();
  (function rain() {
    cx.clearRect(0, 0, cv.width, cv.height); cx.strokeStyle = 'rgba(220,230,240,.35)'; cx.lineWidth = 1; cx.beginPath();
    for (const d of drops) { cx.moveTo(d.x, d.y); cx.lineTo(d.x - d.l * 0.15, d.y + d.l); if (!still) { d.y += d.v; d.x -= d.v * 0.15; if (d.y > cv.height) { d.y = -d.l; d.x = Math.random() * (cv.width + 40); } } }
    cx.stroke(); requestAnimationFrame(rain);
  })();
})();
