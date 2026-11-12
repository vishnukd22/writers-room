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
    const create = () => { const from = sessionStorage.getItem('gnPrev'); sessionStorage.removeItem('gnPrev'); socket.emit('host:create', { game: 'wr', from }, (r) => sessionStorage.setItem('wrHost', r.code)); };
    if (saved) socket.emit('host:attach', { code: saved, game: 'wr' }, (r) => { if (r.error) create(); }); else create();
  });
  // back to the game night menu; the next game brings everyone along
  function goMenu() { if (S) sessionStorage.setItem('gnPrev', S.code); sessionStorage.removeItem('wrHost'); location.href = '/tv'; }
  socket.on('menu', goMenu);
  document.addEventListener('click', (e) => { if (e.target.closest('[data-tv="menu"]')) goMenu(); });
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

  // [look, picture, ambience]: the ambience names the light and weather drawn over the picture.
  const artOf = (g) => (g ? W.img(`genre-${g.art}`) : null);
  const curGenre = () => S.x.pilot?.genre || null;
  const GENRE_PHASES = ['GENRE', 'BRIEF', 'WRITE', 'SHORTLIST', 'VOTE', 'TITLE', 'CAST', 'SCENE', 'EPISODE'];
  function sceneryFor() {
    const ph = S.phase; const g = curGenre(); const ga = artOf(g);
    if (GENRE_PHASES.includes(ph) && ga && !(ph === 'GENRE' && S.step === 'pick')) return ['room', ga, `genre:${g.art}`];
    if (ph === 'SCREENING' || ph === 'UPFRONTS') return ['office', W.img('room-network'), 'room-network'];
    if (ph === 'FINAL') return ['stage', W.img('room-stage'), 'room-stage'];
    return ['room', W.img('room-writers'), 'room-writers'];
  }
  let lastScenery = '';
  function setScenery() {
    const [cls, art, amb] = sceneryFor(); const key = `${cls}|${art}|${amb}`;
    const showart = (S.phase === 'GENRE' && S.step === 'reveal') || S.phase === 'TITLE' || S.phase === 'EPISODE';
    document.body.classList.toggle('showart', showart);
    document.body.classList.toggle('nocap', ['SCENE', 'CAST', 'TITLE'].includes(S.phase) || (S.phase === 'VOTE' && (S.step === 'read' || S.step === 'judge')));
    document.body.classList.toggle('blurart', !showart && ['BRIEF', 'WRITE', 'SHORTLIST', 'VOTE', 'CAST', 'SCENE'].includes(S.phase) && !!curGenre());
    if (key === lastScenery) return; lastScenery = key;
    scenery.className = `${cls}${art ? ' has-art' : ''}`;
    scenery.querySelector('.art').style.backgroundImage = art ? `url(${art})` : '';
    const cam = scenery.querySelector('.cam'); const n = (art || cls).length;
    cam.style.setProperty('--ox', `${[20, 80, 50, 30, 70][n % 5]}%`); cam.style.setProperty('--oy', `${[30, 60, 40, 70][n % 4]}%`);
    cam.style.animation = 'none'; void cam.offsetWidth; cam.style.animation = '';
    AMB.set(art ? amb : null);
  }

  // The production board: where we are in the season, and how this episode is rating.
  function topbar() {
    if (S.phase === 'LOBBY') return '';
    const pl = S.x.pilot; const se = pl?.season;
    const left = pl ? `<div class="showname">${esc(pl.title || (pl.genre ? pl.genre.name : 'A new show'))}<small>${pl.genre ? `${esc(pl.genre.name)} · ` : ''}Showrunner ${esc(pl.showrunner?.name || '')}${se?.strikes ? ' · <b class="warnchip">One warning left</b>' : ''}</small></div>` : '<div class="showname">Writers\' Room<small>One season. Three episodes.</small></div>';
    if (!se) return `${left}<div></div><div class="joinbox"><b>${esc(S.code)}</b><span>${esc(host())}</span></div>`;
    const setupDone = se.ep >= 0;
    const steps = [`<span class="pstep ${setupDone ? 'done' : 'now'}"><b>${setupDone ? '✓' : '●'}</b>Set-up</span>`].concat(se.episodes.map((e, i) => {
      const st = e.rating !== null ? (e.rating >= e.target ? 'done' : 'miss') : i === se.ep ? 'now' : '';
      return `<span class="pstep ${st}"><b>${e.rating !== null ? e.rating : `${e.target}+`}</b>${esc(e.short)}</span>`;
    })).join('<i class="parrow"></i>');
    const m = se.meter; const showMeter = se.ep >= 0 && !['UPFRONTS', 'FINAL'].includes(S.phase) && se.episodes[se.ep]?.rating === null;
    const meter = showMeter ? `<div class="meter" id="meterTop"><span>Rating</span><div class="mbar"><i class="ml" style="--w:${m.laughs * 10}%"></i><i class="mn" style="--w:${m.notes * 10}%"></i><i class="me" style="--w:${(m.exec || 0) * 10}%"></i><em style="--at:${se.target * 10}%"></em></div><b>${m.total}</b><small>needs ${se.target}</small></div>` : '';
    return `${left}<div class="pboard">${steps}</div><div class="topright">${meter}<div class="joinbox"><b>${esc(S.code)}</b><span>${esc(host())}</span></div></div>`;
  }
  function dockbar() {
    if (S.phase === 'LOBBY') return '';
    const done = S.phase === 'WRITE' ? Object.fromEntries((S.x.done || []).map((p) => [p.id, p.done])) : {};
    return [...S.players].sort((a, b) => b.score - a.score).map((p) => `<span class="tag ${p.connected ? '' : 'off'} ${done[p.id] ? 'on' : ''}" style="--c:${p.color}">${W.bust(p, 'xs')}${esc(p.name)}<b>${p.score}</b></span>`).join('');
  }
  const dotsTyping = '<span class="typing"><i></i><i></i><i></i></span>';
  const memoCard = (note, small) => (note ? `<div class="netmemo ${small ? 'small' : ''}"><b>Memo from the Network</b>${esc(note)}<span class="stamp">Note</span></div>` : '');
  const ticker = () => { const t = S.x.pilot?.ticker || []; return t.length ? `<div class="ticker"><b>NEWS</b><div class="crawl"><span>${t.map(esc).join('&nbsp;&nbsp;•&nbsp;&nbsp;')}&nbsp;&nbsp;•&nbsp;&nbsp;${t.map(esc).join('&nbsp;&nbsp;•&nbsp;&nbsp;')}</span></div></div>` : ''; };
  const KIND = { pitch: ['The pitch', 'One sentence. Make the Network want it.'], traits: ['Build the characters', 'Everyone answers a different question.'], problem: ['Act one', 'It all goes wrong when...'], ending: ['Act two', 'In the end...'], cliffhanger: ['The cliffhanger', 'It ends on a cliffhanger when...'] };
  const charCard = (c, cls = '') => `<div class="charcard2 ${cls}">${W.bust({ bust: c.bust, name: c.name, color: '#E2A93B' }, 'xl')}<div><div class="cname">${esc(c.name || '')}</div>${c.traits.map((t, i) => `<div class="trait" style="--d:${0.6 + i * 1.6}s"><span>${esc(t.label)}</span>${esc(t.text)}<small>${esc(t.by?.name || '')}</small></div>`).join('')}</div></div>`;

  // ---------------------------------------------------------------- screens
  const R = {
    LOBBY() {
      const t = W.img('title');
      const seats = S.players.map((p, i) => `<div class="index seat" style="--r:${rot(i)};--c:${p.color}">${p.bust ? W.bust(p, 'sm') : '<span class="bust sm drawn"></span>'}<div class="hand">${esc(p.name)}</div></div>`).join('') + Array.from({ length: Math.max(0, 6 - S.players.length) }, () => '<div class="empty"></div>').join('');
      const n = S.players.length;
      return `<div class="lobby">
        <div>${t ? `<img class="titleimg" src="${t}" alt="Writers' Room">` : '<div class="titlecard">Writers\'<br>Room</div>'}
          <div class="join">${S.qr ? `<img src="${S.qr}" alt="QR code to join">` : ''}<div><div class="count">Scan, or go to</div><div class="url">${esc(host())}</div><div class="count">and enter</div><div class="code">${esc(S.code)}</div></div></div></div>
        <div><div class="roster ${n > 6 ? 'many' : ''}">${seats}</div>
          <p class="startnote">Pick your look on your phone. Two of you: Date Night. Three to twelve: the full writers' room. About 30 minutes. ${n >= 2 ? `${esc(P_(S.vipId)?.name || 'The first player')} starts from their phone.` : ''}</p>
          ${S.aiOn ? '' : '<p class="startnote">The AI writer is offline, so scenes come from the backup scripts.</p>'}</div></div>`;
    },
    INTRO() {
      if (S.step === 'how') return `<div class="center"><div class="howrow">
        <div class="howcard" style="--r:-2deg"><b>✍️</b>Everyone writes</div>
        <div class="howcard" style="--r:1.5deg"><b>🗳️</b>The room votes</div>
        <div class="howcard" style="--r:-1deg"><b>📺</b>Johnny makes it real</div></div>
        <p class="lede">One show, three episodes. The bar rises: <b>5</b>, then <b>6</b>, then <b>7</b> out of 10. Miss twice and you're cancelled.</p></div>`;
      return '<div class="center"><div class="kicker">One season</div><div class="huge">Writers\' Room</div><p class="lede">Hosted by Johnny Primetime. Allegedly.</p></div>';
    },
    GENRE() {
      const pl = S.x.pilot;
      if (S.step === 'reveal') return `<div class="center epcard"><div class="n">Your show · Showrunner ${esc(pl.showrunner?.name || '')}</div><div class="t">${esc(pl.genre?.name || '')}</div></div>`;
      return `<div class="genrepick"><div class="gphead">${W.bust(pl.showrunner, 'md')}<div><div class="kicker">Showrunner</div><div class="big">${esc(pl.showrunner?.name || '')} is picking the genre</div></div>${timer()}</div>
        <div class="tvgenres">${(S.x.genres || []).map((gn) => { const src = W.thumb(`genre-${gn.art}`); return `<div class="tvg">${src ? `<img src="${src}" alt="">` : ''}<span>${esc(gn.name)}</span></div>`; }).join('')}</div></div>`;
    },
    BRIEF() {
      const k = S.x.kind; const [t, sub] = KIND[k] || ['', ''];
      return `<div class="center"><div class="kicker">${esc(t)}</div><div class="big">${esc(sub)}</div>${k === 'pitch' ? '<div class="template">A <u>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</u> who <u>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</u> must <u>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</u> before <u>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</u></div>' : ''}${memoCard(S.x.note)}</div>`;
    },
    WRITE() {
      const x = S.x; const k = x.kind; const [t, sub] = KIND[k] || ['', ''];
      const cards = (x.done || []).filter((p) => p.connected || p.done).map((p, i) => `<div class="wcard ${p.done ? 'done' : ''}" style="--r:${rot(i)}">${W.bust(p, 'md')}<div class="nm">${esc(p.name)}</div><div class="st">${p.done ? '✓ done' : `writing${dotsTyping}`}</div></div>`).join('');
      const n = (x.done || []).filter((p) => p.done).length;
      return `<div class="writing"><div class="whead"><div><div class="kicker">${esc(t)}</div><div class="big">${esc(sub)}</div></div><div class="wright">${memoCard(x.note, true)}<div class="timer" data-ends="${x.writeEnds}"></div></div></div>
        <div class="wgrid" id="wGrid">${cards}</div><div class="wcount" id="wCount">${n} of ${(x.done || []).filter((p) => p.connected).length} done</div>${ticker()}</div>`;
    },
    SHORTLIST() { return `<div class="center"><div class="kicker">The shortlist</div><div class="big">Like your favourites on your phone</div><p class="lede" id="slCount">${S.x.rated} of ${S.x.raters} done. The top three make the final.</p>${tbar()}</div>${ticker()}`; },
    VOTE() {
      const x = S.x; const fin = x.finalists || [];
      const reading = S.step === 'read' || S.step === 'judge';
      const cards = fin.map((f, i) => reading && i > x.idx ? `<div class="fcard back" style="--r:${rot(i + 2)}"><span class="letter">${'ABC'[i]}</span><div class="ftext">&nbsp;</div></div>` : `<div class="fcard ${f.win ? 'win' : ''} ${(S.step === 'read' || S.step === 'judge') && i === x.idx ? 'now' : ''}" style="--r:${rot(i + 2)}"><span class="letter">${'ABC'[i]}</span><div class="ftext">${esc(f.text)}</div>${f.by ? `<div class="fby">${W.bust(f.by, 'sm')}${esc(f.by.name)}${S.mode !== 'date' ? `<b id="vn-${f.id}">${f.n} vote${f.n === 1 ? '' : 's'}</b>` : ''}</div>` : ''}${f.win ? '<span class="stamp ok">Picked!</span>' : ''}</div>`).join('');
      const head = S.step === 'vote' ? `<div class="kicker">Vote on your phone</div>` : S.step === 'result' ? `<div class="kicker">${S.mode === 'date' ? 'The Network exec decides' : 'The room has spoken'}</div>` : `<div class="kicker">${S.mode === 'date' ? 'Two entries' : 'The finalists'}</div>`;
      return `<div class="center">${head}<div class="fcards n${fin.length}">${cards}</div>${S.step === 'vote' ? `${tbar()}<p class="count" id="vCount">${x.voted} of ${x.voters} voted</p>` : ''}${x.why && S.step === 'result' ? `<p class="lede">"${esc(x.why)}"</p>` : ''}</div>`;
    },
    EPISODE() {
      const pl = S.x.pilot; const se = pl.season; const e = se.episodes[se.ep] || {};
      if (S.step === 'previously') {
        const prev = S.x.prev || [];
        return `<div class="center"><div class="kicker">Previously on</div><div class="big">${esc(pl.title || '')}</div><div class="prevrow">${prev.map((b, i) => `<div class="prevcard" style="--r:${rot(i + 1)}"><small>${esc(b.label)}</small>${esc(b.text)}<em>by ${esc(b.by || 'the room')}</em></div>`).join('')}</div></div>`;
      }
      const acts = (se.acts || []).map((k) => KIND[k]?.[0] || k).concat(['Network verdict']);
      return `<div class="center epcard"><div class="n">${esc(pl.title || '')} · Episode ${se.ep + 1} of ${se.episodes.length}</div><div class="t">${esc(e.name || '')}</div>
        <div class="needbar"><span>Rating needed</span><b>${e.target}<small>/ 10</small></b></div><div class="acts">${acts.map((a) => `<span>${esc(a)}</span>`).join('<i>→</i>')}</div></div>`;
    },
    TITLE() { const pl = S.x.pilot; return `<div class="center epcard"><div class="n">${esc(pl.genre?.name || '')} · Pitched by ${esc(pl.pitchBy?.name || 'the room')}</div><div class="t">${esc(pl.title || '')}</div><div class="setting">${esc(pl.pitch || '')}</div></div>`; },
    CAST() { const pl = S.x.pilot; const c = S.step === 'rival' ? pl.rival : pl.hero; return `<div class="center"><div class="kicker">${S.step === 'rival' ? 'And our rival' : 'Meet our hero'}</div>${charCard(c, S.step)}</div>`; },
    SCENE() {
      const x = S.x; const pl = S.x.pilot; const sc = x.scene; const k = x.kind;
      const line = sc && sc.lines.length ? sc.lines[sc.lines.length - 1] : null;
      const who = line?.who; const name = who === 'hero' ? pl.hero.name : who === 'rival' ? pl.rival.name : '';
      const side = (c, w) => `<div class="actor ${who === w ? 'talk' : ''}">${W.bust({ bust: c.bust, name: c.name, color: '#E2A93B' }, 'lg')}<div class="nm">${esc(c.name)}</div></div>`;
      const beat = pl.beats?.[k];
      return `<div class="scene"><div class="beatcap">${esc(KIND[k]?.[1] || '')} <b>${esc(beat?.text || '')}</b><small>by ${esc(beat?.by?.name || 'the room')}</small></div>
        <div class="actors n2">${side(pl.hero, 'hero')}${side(pl.rival, 'rival')}</div>
        ${line ? `<div class="lineboard ${who === 'narrator' ? 'npc' : ''}" data-k="${sc.cur}"><div class="who">${who === 'narrator' ? '' : esc(name)}</div><div class="words">${esc(line.text)}</div></div>` : '<div class="lineboard"><div class="words">Rolling...</div></div>'}
        ${x.note ? `<div class="notestamp ${x.note}">${x.note === 'yes' ? 'Note honoured +1.5' : 'Note ignored'}</div>` : ''}
        <div class="scenefoot" id="scFoot"><div class="writingnow"><span>📺 Now showing: <b>${esc(pl.title || '')}</b></span></div><div class="laughs">😂 <b>${sc?.total || 0}</b><small>laughs</small></div></div></div>`;
    },
    SCREENING() {
      const pl = S.x.pilot;
      if (S.step === 'score') {
        const p = pl.parts || { laughs: 0, notes: 0, exec: 0 };
        const bar = (label, v, max) => `<div class="rbar"><span>${label}</span><div><i style="--w:${(v / max) * 100}%"></i></div><b>${v} / ${max}</b></div>`;
        const se = pl.season; const e = se.episodes[se.ep] || {};
        return `<div class="center"><div class="kicker">${esc(pl.title || '')}: ${esc(e.name || '')}</div><div class="rating ${S.x.hit ? 'good' : 'bad'}">${pl.rating}<small>/ 10</small></div><div class="rbars">${bar('Laughs', p.laughs, 4)}${bar('Network notes', p.notes, 3)}${bar('The exec', p.exec, 3)}</div><p class="lede">${S.x.target} needed${S.x.hit ? '' : se.cancelled ? '. Cancelled.' : se.ep === se.episodes.length - 1 ? '.' : '. One warning left.'}</p>${S.x.hit ? '<span class="stamp ok">Renewed</span>' : se.cancelled ? '<span class="stamp firedstamp">Cancelled</span>' : ''}</div>`;
      }
      if (S.step === 'exec') return `<div class="center"><div class="kicker">The Network's verdict</div><div class="netmemo big"><b>From the desk of the Network</b>"${esc(pl.exec || '')}"</div></div>`;
      return `<div class="center"><div class="kicker">Test screening</div><div class="huge">🍿</div><p class="lede">The Network is watching ${esc(pl.season?.name || 'your episode')}.</p></div>`;
    },
    UPFRONTS() {
      const pl = S.x.pilot; const se = pl?.season; const eps = se?.episodes || [];
      const rows = eps.map((e) => `<div class="uprow ${e.rating === null ? 'dim' : e.rating >= e.target ? 'lit' : 'dead'}"><span>${esc(e.name)}<small>needed ${e.target}</small></span><b>${e.rating === null ? 'Never aired' : e.rating}</b></div>`).join('');
      return `<div class="center"><div class="kicker">${esc(pl?.title || '')}: the season</div><div class="uprows">${rows}</div>${S.x.lit ? '<span class="stamp ok">Season two!</span>' : '<span class="stamp firedstamp">Cancelled</span>'}</div>`;
    },
    FINAL() {
      const x = S.x; const rows = x.rows || [];
      if (x.step === 'winner') return `<div class="lastline">${W.bust(rows[0], 'xl')}<div><div class="name">Tonight's head writer</div><div class="huge">${esc(rows[0]?.name || '')}</div></div></div>`;
      return `<div class="center"><div class="kicker">Final scores${x.lit ? ' · Renewed for season two' : ' · Cancelled'}</div><div class="board2">${rows.map((r, i) => `<div class="srow ${i === 0 ? 'first' : ''}" style="animation-delay:${(rows.length - i) * 0.2}s"><span class="rk">${r.rank}</span>${W.bust(r, 'xs')}<span class="nm">${esc(r.name)}</span><span class="sub">${r.wins} idea${r.wins === 1 ? '' : 's'} on screen · ${r.laughs} laughs</span><span class="pts">${r.score}</span></div>`).join('')}</div><p class="count">${esc(P_(S.vipId)?.name || 'The first player')} can play again, or go back to the game menu, from their phone.</p><button class="menubtn" data-tv="menu">Back to the game menu</button></div>`;
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
    // Same screen as before: update only the live parts, so nothing re-animates on every vote or laugh.
    const x = S.x;
    const key = `${S.phase}|${S.step}|${x.pilot?.season?.ep ?? ''}|${x.kind ?? ''}|${x.idx ?? ''}|${x.scene?.cur ?? ''}|${S.players.length}|${(x.busts || []).filter((b) => b.by).length}|${x.genres ? 1 : 0}`;
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
    if (ph === 'INTRO') { key = 'casting'; mood = 'casting'; }
    else if (ph === 'GENRE' && S.step === 'pick') { key = 'pitch'; mood = 'pitch'; }
    else if (ph === 'WRITE') { key = 'writing'; mood = 'writing'; }
    else if (ph === 'SHORTLIST' || ph === 'VOTE') { key = 'pitch'; mood = 'pitch'; }
    else if (['GENRE', 'BRIEF', 'TITLE', 'CAST', 'SCENE', 'EPISODE'].includes(ph) && g) { key = g.music; mood = g.mood || 'tense'; }
    else if (ph === 'SCREENING') { key = 'ratings'; mood = 'ratings'; }
    else if (ph === 'UPFRONTS' || ph === 'FINAL') { key = 'finale'; mood = 'finale'; }
    AV.setBed(ph === 'SCENE' || ph === 'CAST' ? 0.25 : ph === 'WRITE' ? 0.45 : 0.55);
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
      caption.textContent = cue.text; caption.className = `show ${cue.kind === 'hero' || cue.kind === 'rival' ? 'char' : ''}`;
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
