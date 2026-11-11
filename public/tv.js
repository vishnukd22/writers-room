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
  const timer = () => (S.endsAt ? `<div class="timer" ${T()}></div>` : '');
  const tbar = () => (S.endsAt ? `<div class="tbar"><i data-kind="bar" ${T()}></i></div>` : '');
  const host = () => { try { return new URL(S.joinUrl).host; } catch (e) { return location.host; } };
  const P_ = (id) => S.players.find((p) => p.id === id);
  const charOf = (id) => (S.cast || []).find((c) => c.id === id);
  const rot = (i) => `${((i * 37) % 7) - 3}deg`;
  const live = () => S.players.filter((p) => p.connected).length;
  const genreArt = () => (S.genre ? W.img(`genre-${S.genre.art}`) : null);

  // [look, picture, ambience]: the ambience names the light and weather drawn over the picture.
  function sceneryFor(s) {
    const ph = s.phase; const st = s.step; const gfx = s.genre ? `genre:${s.genre.art}` : 'room-writers';
    if (ph === 'TABLE_READ' || ph === 'FINALE' || ph === 'REVEALS' || ph === 'FINAL') return ['stage', W.img('room-stage'), 'room-stage'];
    if (ph === 'RATINGS' && st === 'cliffhanger') return ['dark', genreArt(), gfx];
    if (ph === 'RATINGS' || ph === 'CRITIC') return ['office', W.img('room-network'), 'room-network'];
    if ((ph === 'INTRO' && st === 'reveal') || (ph === 'EP_INTRO' && st === 'title')) return ['room', genreArt() || W.img('room-writers'), genreArt() ? gfx : 'room-writers'];
    return ['room', W.img('room-writers'), 'room-writers'];
  }
  let lastScenery = '';
  function setScenery() {
    const [cls, art, amb] = sceneryFor(S); const key = `${cls}|${art}|${amb}`;
    if (key === lastScenery) return; lastScenery = key;
    scenery.className = `${cls}${art ? ' has-art' : ''}`;
    document.body.classList.toggle('showart', (S.phase === 'EP_INTRO' && S.step === 'title' && !!genreArt()) || (S.phase === 'RATINGS' && S.step === 'cliffhanger' && !!genreArt()));
    document.body.classList.toggle('blurart', S.phase === 'INTRO' && S.step === 'reveal' && !!genreArt());
    scenery.querySelector('.art').style.backgroundImage = art ? `url(${art})` : '';
    // A new camera move for every new picture.
    const cam = scenery.querySelector('.cam'); const n = (art || cls).length;
    cam.style.setProperty('--ox', `${[20, 80, 50, 30, 70][n % 5]}%`); cam.style.setProperty('--oy', `${[30, 60, 40, 70][n % 4]}%`);
    cam.style.animation = 'none'; void cam.offsetWidth; cam.style.animation = '';
    AMB.set(art || amb.startsWith('genre:') ? amb : null);
  }

  function topbar() {
    if (S.phase === 'LOBBY') return '';
    const steps = ['CASTING', 'E1', 'E2', 'FINALE'];
    const cur = ['INTRO', 'CASTING', 'CAST_INTRO', 'SECRETS'].includes(S.phase) ? 0 : S.ep ? S.ep.n : 3;
    const at = ['LAST_WORDS', 'FINALE', 'CRITIC', 'MOLE_VOTE', 'REVEALS', 'FINAL'].includes(S.phase) ? 3 : cur;
    const prog = steps.map((k, i) => `<i class="${i < at ? 'done' : i === at ? 'now' : ''}"></i><span>${['Pilot', 'Episode 1', 'Episode 2', 'Finale'][i]}</span>`).join('');
    return `<div class="showname">${S.show ? esc(S.show.title) : "Writers' Room"}<small>${S.genre && S.show ? esc(S.genre.name) : ''}${S.ep ? ` · ${esc(S.ep.title)}` : ''}</small></div><div class="progress">${prog}</div><div class="joinbox"><b>${esc(S.code)}</b><span>${esc(host())}</span></div>`;
  }
  function dockbar() {
    if (S.phase === 'LOBBY') return '';
    let on = [];
    if (S.phase === 'TABLE_READ' && S.x.line) on = [S.x.line.char];
    return S.players.map((p) => `<span class="tag ${p.connected ? '' : 'off'} ${on.includes(p.id) ? 'on' : ''}" style="--c:${p.color}"><span class="dot">${esc(W.initials(p.name))}</span>${esc(p.name)}</span>`).join('');
  }

  // ---------------------------------------------------------------- screens
  const R = {
    LOBBY() {
      const t = W.img('title');
      const seats = S.players.map((p, i) => `<div class="index" style="--r:${rot(i)};--c:${p.color}"><div class="hand">${esc(p.name)}</div><small>${p.act ? 'Will act out their lines' : 'The narrator reads their lines'}</small></div>`).join('') + Array.from({ length: Math.max(0, 6 - S.players.length) }, () => '<div class="empty"></div>').join('');
      return `<div class="lobby">
        <div>${t ? `<img class="titleimg" src="${t}" alt="Writers' Room">` : '<div class="titlecard">Writers\'<br>Room<span class="hand">Save the show.</span></div>'}
          <div class="join">${S.qr ? `<img src="${S.qr}" alt="QR code to join">` : ''}<div><div class="count">Scan, or go to</div><div class="url">${esc(host())}</div><div class="count">and enter</div><div class="code">${esc(S.code)}</div></div></div></div>
        <div><div class="roster ${S.players.length > 6 ? 'many' : ''}">${seats}</div>
          <p class="startnote">4 to 12 players. About 30 minutes. ${S.players.length >= 4 ? `${esc(P_(S.vipId)?.name || 'The first player')} starts the game from their phone.` : `Waiting for ${4 - S.players.length} more.`}</p>
          ${S.aiOn ? '' : '<p class="startnote">The AI writer is offline, so the show uses its backup scripts.</p>'}</div></div>`;
    },
    INTRO() {
      if (S.step === 'spin') return `<div class="center"><div class="kicker">Tonight the network wants</div><div class="reel"><div>${S.x.genres.map((g) => `<div>${esc(g)}</div>`).join('')}</div></div></div>`;
      if (S.step === 'reveal') {
        const a = genreArt();
        return `<div class="genrecard">${a ? `<div class="art" style="background-image:url(${a})"></div>` : `<div class="art drawn">${esc(S.genre.name)}</div>`}<div><div class="kicker">${esc(S.genre.name)}</div><div class="big">${esc(S.show?.title || '')}</div><p class="lede" style="margin:1.2rem 0 0;text-align:left">${esc(S.show?.logline || '')}</p></div></div>`;
      }
      return `<div class="center"><div class="huge">Two episodes<br>to save the show.</div><p class="lede">If the ratings don't climb, everyone in this room is cancelled.</p></div>`;
    },
    CASTING() {
      const cards = S.players.map((p, i) => `<div class="index" style="--r:${rot(i)}"><div class="pin"></div><div class="hand">A character for ${esc(S.players[(i + 1) % S.players.length].name)}</div></div>`).join('');
      return `<div class="center"><div class="kicker">Casting</div><div class="big">Write the character your neighbour will play</div><p class="lede">Name and job, a dark secret, a weakness and a catchphrase. Be cruel. Be specific.</p><div class="board">${cards}</div><div class="count">${S.x.done} of ${S.players.length} done</div>${tbar()}</div>`;
    },
    CAST_INTRO() {
      if (S.step !== 'card') return `<div class="center"><div class="big">The casting director is reading your notes</div><p class="lede hand" style="font-size:2rem;color:var(--mustard)">She looks worried.</p></div>`;
      const c = S.x.card;
      return `<div class="castcard">${W.bust(c, 'xl')}<div><div class="who">Played by ${esc(c.player)} · written by ${esc(c.writer?.name || 'someone')} · ${S.x.idx + 1} of ${S.x.total}</div><h2>${esc(c.name)}</h2><div class="job">${esc(c.job)}</div><div class="intro">${esc(c.intro)}</div><div class="catch">"${esc(c.catchphrase)}"</div></div></div>`;
    },
    SECRETS() { return `<div class="center"><div class="envelope"></div><div class="big">Check your phone. Tell no one.</div><p class="lede">Everyone has a secret agenda to sneak into the show. Someone might be working for a rival network.</p><div class="count">${S.x.acked} of ${S.players.length} have read their secret</div></div>`; },
    EP_INTRO() {
      const e = S.ep;
      if (S.step === 'title') return `<div class="center epcard"><div class="n">${esc(S.show.title)}</div><div class="t">Episode ${e.n}</div></div>`;
      if (S.step === 'previously') return `<div class="center epcard"><div class="n">Previously on</div><div class="t" style="font-size:4.5rem">${esc(S.show.title)}</div></div>`;
      if (S.step === 'twist') return `<div class="center"><div class="memo paper"><div class="head"><b class="twist">MID-SEASON TWIST</b><span>Episode ${e.n}</span></div><div class="body">${esc(e.twist)}</div><span class="stamp">Mandatory</span></div></div>`;
      return `<div class="center"><div class="memo paper"><div class="head"><b>NOTE FROM THE NETWORK</b><span>Re: Episode ${e.n}</span></div><div class="body">${esc(e.note)}</div>${e.physical ? `<div class="phys">${esc(e.physical)}</div>` : ''}<span class="stamp">Not optional</span></div></div>`;
    },
    PITCH() {
      const cards = Array.from({ length: S.x.done }, (_, i) => `<i style="--r:${rot(i)}"></i>`).join('');
      return `<div class="center"><div class="kicker">Episode ${S.ep.n}${S.ep.twist ? ' · with the twist' : ''}</div><div class="big">What happens this episode?</div><p class="lede">One sentence, on your phone. The room votes on the best one.</p><div class="facedown">${cards}</div><div class="count">${S.x.done} of ${S.players.length} pitched</div>${tbar()}</div>`;
    },
    VOTE() {
      const cards = S.x.pitches.map((p, i) => `<div class="index" style="--r:${rot(i)}"><span class="letter">${String.fromCharCode(65 + i)}</span><div class="hand">${esc(p.text)}</div></div>`).join('');
      return `<div class="center"><div class="kicker">Vote on your phone. Not for your own.</div><div class="pitchgrid">${cards}</div><div class="count">${S.x.done} voted</div>${tbar()}</div>`;
    },
    PITCH_RESULT() { return `<div class="center winner"><div class="kicker">This episode's plot${S.x.by ? `, pitched by ${esc(S.x.by.name)}` : ''}</div><div class="index"><div class="pin"></div><div class="hand">${esc(S.x.plot)}</div></div></div>`; },
    TEAMS() { return R.WRITING(); },
    WRITING() {
      const teams = S.x.scenes.map((sc) => {
        const pct = Math.round((sc.filled / sc.total) * 100);
        return `<div class="team"><div class="slug">${esc(sc.slug || `Scene ${sc.i + 1}`)}</div><div class="w">${sc.writers.map((w) => esc(w.name)).join(' & ')}</div><div class="for">writing for ${sc.chars.map((c) => `${W.bust(c, 'sm')} ${esc(c.name)}`).join(' and ')}</div><div class="meter"><i style="width:${S.phase === 'TEAMS' ? 0 : pct}%"></i></div><div class="ready">${sc.done === sc.writers.length && S.phase === 'WRITING' ? 'Script ready' : ''}</div></div>`;
      }).join('');
      const sr = S.x.showrunner ? `<p class="lede">${esc(S.x.showrunner.name)} is this episode's Showrunner, and will review every script.</p>` : '';
      return `<div class="center"><div class="kicker">${S.phase === 'TEAMS' ? 'Writing teams' : 'The writers\' room'}</div><div class="big" style="font-size:3.6rem">${esc(S.ep.plot || '')}</div><div class="teams">${teams}</div>${sr}${S.phase === 'WRITING' ? tbar() : ''}</div>`;
    },
    PUNCHUP() { return `<div class="center"><div class="big">The Showrunner is reviewing the scripts</div><p class="lede">${esc(S.x.showrunner?.name || 'The Showrunner')} may quietly change one line. Any line. Nobody will know which.</p>${tbar()}</div>`; },
    TABLE_READ() {
      const x = S.x; const sc = x.scene;
      if (!sc || S.step === 'intro') return `<div class="center"><div class="kicker">${esc(S.show.title)} · Episode ${S.ep.n}</div><div class="big">Table read</div><p class="lede">Audience: laugh, gasp and boo from your phones. If a line sounds planted, object.</p></div>`;
      const side = `<div class="side"><div class="dial"><div class="arc"></div><div class="needle" style="transform:translateX(-50%) rotate(${(x.season / 10) * 180 - 90}deg)"></div><div class="hub"></div></div><div class="val">${x.season.toFixed(1)}m<small>viewers this season. Renewal at 5.0m</small></div><div class="cast">${sc.chars.map((c) => `<div class="${S.step === 'line' && x.line?.char === c.id ? 'talk' : ''}">${W.bust(c, 'md')}<span>${esc(c.name)}<small>${esc(c.player)}${c.acts ? ' · acting' : ''}</small></span></div>`).join('')}</div></div>`;
      if (S.step === 'title') return `<div class="center"><div class="slate"><div class="clap"></div><div class="rows"><div class="full">SCENE<b>${sc.i + 1} of ${x.sceneCount} · ${esc(sc.slug)}</b></div><div>WRITTEN BY<b>${sc.writers.map((w) => esc(w.name)).join(' & ')}</b></div><div>STARRING<b>${sc.chars.map((c) => esc(c.name)).join(', ')}</b></div></div></div></div>`;
      if (S.step === 'objection') {
        const o = x.objection;
        return `<div class="center objection"><span class="stamp ${o.sustained ? 'ok' : ''}">${o.sustained ? 'Sustained' : 'Overruled'}</span><div class="big" style="font-size:3.4rem">${esc(o.by?.name || '')} objected</div>${o.sustained ? o.busted.map((b) => `<p class="lede">That was <b>${esc(b.owner.name)}</b>'s secret agenda: ${esc(b.label)}</p>`).join('') : '<p class="lede">That line was just badly written.</p>'}</div>`;
      }
      if (S.step === 'end') return `<div class="center"><div class="kicker">${esc(sc.slug)}</div><div class="huge">${x.rating.toFixed(1)}m</div><p class="lede">viewers for this scene, written by ${sc.writers.map((w) => esc(w.name)).join(' & ')}</p></div>`;
      const cur = S.step === 'direction' ? -1 : x.line.idx;
      const lines = sc.lines.slice(Math.max(0, cur - 2), cur + 1).map((l) => {
        const c = charOf(l.char); const now = l.id === x.line?.id;
        return `<div class="say ${now ? 'now' : ''} ${l.empty ? 'silent' : ''}"><span class="who">${esc(c?.name || '')}</span>${now && c ? `<span class="by">${esc(c.player)}</span>` : ''}<span class="words">${l.empty ? '(a long, meaningful silence)' : esc(l.text)}</span></div>`;
      }).join('');
      const conf = S.genre?.fx === 'confessional' && S.step === 'line' ? '<span class="confessional">Confessional cam</span>' : '';
      return `<div class="read"><div class="page paper" id="page">${conf}<div class="slugline">${esc(sc.slug)}</div><div class="action">${esc(sc.direction)}</div>${lines}</div>${side}</div>`;
    },
    RATINGS() {
      const x = S.x;
      if (S.step === 'cliffhanger') return `<div class="center"><div class="tbc">To be continued...</div></div>`;
      if (S.step === 'awards') {
        const best = x.scenes[x.best];
        return `<div class="center"><div class="kicker">Episode ${S.ep.n} awards</div><div class="awards"><div class="award"><div class="k">Best scene</div><div class="v">${esc(best?.writers.map((w) => w.name).join(' & ') || '')}</div><div class="count">${esc(best?.slug || '')}</div></div>${x.bestPerf ? `<div class="award"><div class="k">Best performance</div><div class="v">${esc(x.bestPerf.player)}</div><div class="count">as ${esc(x.bestPerf.name)}</div></div>` : ''}</div><div class="target">Season so far: ${x.season.toFixed(1)}m viewers. The network renews at ${x.target.toFixed(1)}m.</div></div>`;
      }
      const max = Math.max(10, ...x.scenes.map((s) => s.rating));
      return `<div class="center"><div class="kicker">Overnight ratings · Episode ${S.ep.n}</div><div class="ratings">${x.scenes.map((s, i) => `<div class="rrow ${i === x.best ? 'best' : ''}"><div><div class="slug">${esc(s.slug)}</div>${s.writers.map((w) => esc(w.name)).join(' & ')}</div><div class="bar"><i style="width:${(s.rating / max) * 100}%;animation-delay:${i * 0.3}s"></i></div><div class="num">${s.rating.toFixed(1)}m</div></div>`).join('')}</div><div class="target">Renewal needs ${x.target.toFixed(1)}m across the season. Right now: ${x.season.toFixed(1)}m.</div></div>`;
    },
    LAST_WORDS() { return `<div class="center"><div class="kicker">The finale</div><div class="big">Last words</div><p class="lede">For the first time tonight, write for your own character. Their final line of the series.</p><div class="count">${S.x.done} of ${S.players.length} written</div>${tbar()}</div>`; },
    FINALE() {
      if (S.step === 'last') return `<div class="lastline">${W.bust(S.x.char, 'xl')}<div><div class="name">${esc(S.x.char.name)}</div><div class="words">${esc(S.x.text)}</div><div class="count">${esc(S.x.char.player)}</div></div></div>`;
      return `<div class="center"><div class="kicker">${esc(S.show.title)}</div><div class="huge">The series finale</div><div class="cast" style="display:flex;gap:1rem;justify-content:center">${(S.x.cast || []).map((c) => W.bust(c, 'lg')).join('')}</div></div>`;
    },
    CRITIC() {
      if (S.step !== 'review') return `<div class="center"><div class="big">The reviews are in</div></div>`;
      const c = S.x.critic;
      return `<div class="center"><div class="review paper"><div class="masthead"><span>${esc(c.outlet)}</span><span>TV review</span></div><div class="stars">${'★'.repeat(c.stars)}${'☆'.repeat(5 - c.stars)}</div><div class="text">${esc(c.review)}</div><div class="by">${esc(c.name)}</div></div></div>`;
    },
    MOLE_VOTE() { return `<div class="center"><div class="huge">Who was the Mole?</div><p class="lede">Somebody may have been working for a rival network all night, trying to sink the show. Maybe two people. Maybe nobody.</p><div class="count">${S.x.done} of ${S.players.length} voted</div>${tbar()}</div>`; },
    REVEALS() {
      const x = S.x;
      if (x.step === 'agenda') { const word = { done: 'Done', busted: 'Busted', active: 'Failed' }[x.status]; return `<div class="reveal">${W.bust(x.char, 'xl')}<div><div class="kicker">${esc(x.who.name)}'s secret agenda</div><div class="label">${esc(x.label)}</div><span class="stamp st-${x.status}">${word}</span></div></div>`; }
      if (x.step === 'mole') return `<div class="center"><div class="kicker">The Mole</div><div class="big">${x.moles.length ? x.moles.map((m) => esc(m.name)).join(' and ') : 'There was no Mole'}</div><div class="votes">${x.tally.filter((t) => t.votes).map((t) => `<div>${esc(t.name)}: ${t.votes}</div>`).join('')}${x.none ? `<div>No Mole: ${x.none}</div>` : ''}</div>${x.moles.length ? `<p class="lede">${x.caught.length === x.moles.length ? 'Caught.' : x.caught.length ? 'One of them was caught.' : 'Nobody caught them.'}</p>` : ''}</div>`;
      if (x.step === 'renewal') return `<div class="center verdict"><div class="kicker">Season rating: ${x.rating.toFixed(1)}m viewers (needed ${x.target.toFixed(1)}m)</div><span class="stamp" style="color:${x.renewed ? 'var(--green)' : 'var(--red)'}">${x.renewed ? 'Renewed' : 'Cancelled'}</span></div>`;
      return `<div class="center"><div class="huge">Opening the envelopes</div></div>`;
    },
    FINAL() {
      const rows = S.x.rows;
      return `<div class="center"><div class="kicker">Head writer of ${esc(S.show.title)}</div><div class="big">${esc(rows[0].name)}</div><div class="board2">${rows.map((r, i) => `<div class="srow ${i === 0 ? 'first' : ''}" style="animation-delay:${(rows.length - i) * 0.25}s"><span class="rk">${r.rank}</span><span class="nm">${esc(r.name)}${r.isMole ? ' (the Mole)' : ''}<small>${esc(r.char || '')}</small></span><span class="sub">${esc(summary(r.ledger))}</span><span class="pts">${r.score}</span></div>`).join('')}</div><p class="count">${esc(P_(S.vipId)?.name || 'The first player')} can start a new show from their phone.</p></div>`;
    },
  };
  function summary(ledger) {
    const g = {}; ledger.forEach((l) => { g[l.why] = (g[l.why] || 0) + l.pts; });
    return Object.entries(g).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 3).map(([k, v]) => `${k} ${v > 0 ? '+' : ''}${v}`).join(' · ');
  }

  // ---------------------------------------------------------------- render
  function render() {
    setScenery();
    mount(top, topbar());
    mount(dock, dockbar());
    const key = `${S.phase}|${S.step}|${S.x.line?.id || ''}`;
    const prevKey = P ? `${P.phase}|${P.step}|${P.x?.line?.id || ''}` : '';
    if (key !== prevKey) { stage.classList.remove('enter'); void stage.offsetWidth; stage.classList.add('enter'); }
    const fn = R[S.phase];
    mount(stage, fn ? fn() : `<div class="center"><div class="big">${esc(S.phase)}</div></div>`);
    music();
  }

  // ---------------------------------------------------------------- music per phase
  let lastMusic = null;
  function music() {
    const g = S.genre; const ph = S.phase;
    let key; let mood;
    const genreTrack = () => { key = g?.music; mood = g?.mood || 'tense'; };
    switch (ph) {
      case 'LOBBY': key = 'lobby'; mood = 'lobby'; break;
      case 'INTRO': if (S.step === 'reveal') genreTrack(); else { key = 'lobby'; mood = 'lobby'; } break;
      case 'CASTING': case 'CAST_INTRO': case 'SECRETS': key = 'casting'; mood = 'casting'; break;
      case 'EP_INTRO': genreTrack(); break;
      case 'PITCH': case 'VOTE': case 'PITCH_RESULT': case 'MOLE_VOTE': key = 'pitch'; mood = 'pitch'; break;
      case 'TEAMS': case 'WRITING': case 'PUNCHUP': case 'LAST_WORDS': key = 'writing'; mood = 'writing'; break;
      case 'TABLE_READ': case 'FINALE': genreTrack(); break;
      case 'RATINGS': if (S.step === 'cliffhanger') genreTrack(); else { key = 'ratings'; mood = 'ratings'; } break;
      case 'CRITIC': key = 'ratings'; mood = 'ratings'; break;
      case 'REVEALS': case 'FINAL': key = 'finale'; mood = 'finale'; break;
      default: key = 'lobby'; mood = 'lobby';
    }
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
    if (S.phase === 'TABLE_READ' && S.step === 'objection' && P?.step !== 'objection') burst('⚖️', 1);
  }
  function onFx(name) {
    if (name === 'laugh') { AV.fx('laugh', { gap: 900 }); burst('😂', 2); AMB.react('laugh'); return; }
    if (name === 'gasp') {
      AV.fx('gasp', { gap: 900 }); burst('😱', 2); AMB.react('gasp');
      if (S.genre?.fx === 'triplezoom') { const pg = document.getElementById('page'); if (pg && !pg.classList.contains('zoom')) { pg.classList.add('zoom'); AV.fx('sting', { gap: 1500 }); AV.fx('thunder', { gap: 1500 }); setTimeout(() => pg.classList.remove('zoom'), 1300); } }
      return;
    }
    if (name === 'boo') { AV.fx('boo', { gap: 900 }); burst('🍅', 2); AMB.react('boo'); return; }
    AV.fx(name, { gap: 300 });
  }
  function burst(emoji, n) {
    const box = $('#burst');
    for (let i = 0; i < n && box.childElementCount < 12; i++) {
      const s = document.createElement('span'); s.textContent = emoji;
      s.style.left = `${10 + Math.random() * 80}%`; s.style.setProperty('--dx', `${(Math.random() - 0.5) * 20}vw`); s.style.setProperty('--rot', `${(Math.random() - 0.5) * 60}deg`);
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
