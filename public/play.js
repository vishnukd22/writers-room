/* WRITERS' ROOM: the phone */
(() => {
  const $ = (q) => document.querySelector(q);
  const esc = W.esc;
  const socket = io();
  const main = $('#main'); const hud = $('#hud'); const sheetWrap = $('#sheetWrap'); const sheetEl = $('#sheet');
  const params = new URLSearchParams(location.search);
  $('#jcode').value = (params.get('room') || localStorage.getItem('wr:code') || '').toUpperCase();
  $('#jname').value = localStorage.getItem('wr:name') || '';
  $('#jpron').value = localStorage.getItem('wr:pron') || '';
  $('#jact').checked = localStorage.getItem('wr:act') === '1';
  const buzz = (p) => { try { navigator.vibrate?.(p); } catch (e) { /* no vibration */ } };

  let S = null; let P = null; let joined = null; let sheet = null; let lastNote = null; let screenKey = null; let patcher = null;
  const drafts = {};

  // ---------------------------------------------------------------- joining
  let wake = null;
  async function keepAwake() { try { if ('wakeLock' in navigator && !wake && document.visibilityState === 'visible') { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => { wake = null; }); } } catch (e) { wake = null; } }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && joined) { keepAwake(); if (!socket.connected) socket.connect(); } });
  function tryJoin(code, token) {
    const name = $('#jname').value.trim(); const pron = $('#jpron').value.trim(); const act = $('#jact').checked;
    socket.emit('player:join', { code, token, name, pron, act }, (r) => {
      if (r.error) { if (token) { localStorage.removeItem(`wr:token:${code}`); joined = null; } $('#jerr').textContent = r.error; $('#join').hidden = false; $('#app').hidden = true; return; }
      joined = { code: r.code, token: r.token };
      localStorage.setItem(`wr:token:${r.code}`, r.token); localStorage.setItem('wr:code', r.code);
      localStorage.setItem('wr:name', name); localStorage.setItem('wr:pron', pron); localStorage.setItem('wr:act', act ? '1' : '0');
      $('#join').hidden = true; $('#app').hidden = false; keepAwake();
    });
  }
  socket.on('connect', () => {
    if (joined) return tryJoin(joined.code, joined.token);
    const code = $('#jcode').value.trim().toUpperCase(); const tok = code && localStorage.getItem(`wr:token:${code}`);
    if (tok) tryJoin(code, tok);
  });
  $('#jform').onsubmit = (e) => { e.preventDefault(); $('#jerr').textContent = ''; const code = $('#jcode').value.trim().toUpperCase(); tryJoin(code, localStorage.getItem(`wr:token:${code}`)); };
  socket.on('kicked', () => { joined = null; $('#join').hidden = false; $('#app').hidden = true; $('#jerr').textContent = 'You were removed from the room.'; });
  socket.on('state', (s) => { W.syncClock(s.now); P = S; S = s; window.__S = s; render(); notes(); feel(); });
  function send(type, data = {}) { socket.emit('act', { type, ...data }, (r) => { if (r?.error) toast(r.error, 'bad'); }); }

  function toast(text, kind = 'info') { const t = document.createElement('div'); t.className = `toast ${kind}`; t.textContent = text; $('#toasts').appendChild(t); setTimeout(() => t.remove(), 4200); buzz(kind === 'bad' ? [60, 40, 60] : 25); }
  function notes() {
    const ns = S.me?.notes || []; const top = ns.length ? ns[ns.length - 1].id : 0;
    if (lastNote === null) { lastNote = top; return; }
    ns.filter((n) => n.id > lastNote).forEach((n) => toast(n.text, n.kind)); lastNote = Math.max(lastNote, top);
  }
  function feel() { if (P && P.phase !== S.phase) { buzz(20); window.scrollTo(0, 0); } if (S.x.myLine && !(P?.x?.myLine && P.x.line?.id === S.x.line?.id)) buzz([80, 60, 80]); }

  // ---------------------------------------------------------------- helpers
  const T = () => (S.endsAt ? `data-ends="${S.endsAt}"` : '');
  const charOf = (id) => (S.cast || []).find((c) => c.id === id);
  const vipName = () => S.players.find((p) => p.id === S.vipId)?.name || 'the first player';
  const skipBtn = () => (S.me.vip ? '<button class="btn ghost sm" data-a="skip">Skip ahead</button>' : '');
  const tv = (title, sub = '', ico = '📺') => `<div class="tv"><div class="ico">${ico}</div><h2 class="h">${title}</h2>${sub ? `<p class="lead">${sub}</p>` : ''}${skipBtn()}</div>`;
  const d = (id, fallback = '') => (id in drafts ? drafts[id] : fallback);
  const noteMemo = () => (S.ep ? `<div class="memo"><b>NOTE FROM THE NETWORK</b>${esc(S.ep.note)}${S.ep.twist ? `<br><br><b>MID-SEASON TWIST</b>${esc(S.ep.twist)}` : ''}</div>` : '');

  // ---------------------------------------------------------------- screens: each returns [key, html, patch?]
  const R = {
    LOBBY() {
      const me = S.me;
      const list = S.players.map((p) => `<button disabled><span class="dot" style="width:1.8rem;height:1.8rem;border-radius:50%;background:${p.color};display:inline-block"></span>${esc(p.name)}${p.act ? ' · acting' : ''}${p.id === me.id ? ' (you)' : ''}</button>`).join('');
      const genres = ['Surprise me', "Indian TV serial", 'Hospital drama', 'Nordic noir', 'Reality dating show', 'Space opera', 'Royal period drama', 'True crime documentary', 'Zombie survival', '1980s cop show', 'Cooking competition', 'K-drama romance', 'Nature documentary', 'Telenovela', 'Legal thriller', 'Superhero origin story', 'Corporate satire', 'Shakespearean tragedy', 'Western', 'Haunted house horror', 'Heist thriller', 'Cult documentary', 'Sports underdog drama', 'Cold War spy thriller', 'Big fat wedding drama'];
      const ids = ['', 'serial', 'hospital', 'noir', 'dating', 'space', 'royal', 'truecrime', 'zombie', 'cop80s', 'cooking', 'kdrama', 'nature', 'telenovela', 'legal', 'superhero', 'corporate', 'shakespeare', 'western', 'horror', 'heist', 'cult', 'sports', 'spy', 'wedding'];
      const sel = d('genre', '');
      const start = me.vip ? `<div class="card" style="display:grid;gap:.7rem"><label>Genre<select data-draft="genre">${genres.map((g, i) => `<option value="${ids[i]}" ${sel === ids[i] ? 'selected' : ''}>${g}</option>`).join('')}</select></label><button class="btn primary big" data-a="start" ${S.players.length < 4 ? 'disabled' : ''}>Start the show</button><p class="hint" style="margin:0">${S.players.length < 4 ? `Need ${4 - S.players.length} more player${S.players.length === 3 ? '' : 's'}.` : 'Start when everyone is in.'}</p></div>` : `<p class="lead">Waiting for ${esc(vipName())} to start the show.</p>`;
      return [`LOBBY|${S.players.length}|${me.act}|${me.vip}`, `<h2 class="h">You're in, ${esc(me.name)}.</h2>
        <p class="lead">Keep this page open all game. Your phone shows things nobody else sees.</p>
        <label class="switch card"><input type="checkbox" data-a="actToggle" ${me.act ? 'checked' : ''}><span>I'll act out my character's lines<br><small class="muted">Off: the narrator reads them for you</small></span></label>
        <div class="pick">${list}</div>${start}`];
    },
    INTRO() { return [`INTRO|${S.step}`, tv(S.show ? esc(S.show.title) : 'Eyes on the TV', S.show ? esc(S.show.logline) : 'The show is starting.')]; },
    CASTING() {
      const t = S.x.target; const dr = S.x.draft || {};
      if (dr.done) return ['CAST|done', tv('Character delivered.', `${esc(t.name)} will be playing whatever you just wrote.`, '✍️')];
      const f = (id, label, hint, ph, rows = 1) => `<label class="field"><span>${label} <em>${hint}</em></span>${rows > 1 ? `<textarea rows="${rows}" data-draft="c_${id}" maxlength="140" placeholder="${ph}">${esc(d(`c_${id}`, dr[id] || ''))}</textarea>` : `<input data-draft="c_${id}" maxlength="80" placeholder="${ph}" value="${esc(d(`c_${id}`, dr[id] || ''))}">`}</label>`;
      return ['CAST|edit', `<h2 class="h">Write a character for ${esc(t.name)}</h2><p class="lead">${esc(t.name)} will play this character all night. Make it good. Or make it devastating.</p>
        ${f('name', 'Character name', '', 'Dr. Arun Varghese')}${f('job', 'Job', 'who they are', 'a cardiologist who faints at blood')}${f('secret', 'Dark secret', 'what would ruin them', 'bought his degree on eBay', 2)}${f('weakness', 'Weakness', '', 'cannot whisper')}${f('catchphrase', 'Catchphrase', '', 'Trust me, I have watched a video.')}
        <button class="btn primary big" data-a="castDone">Send to casting</button>`];
    },
    CAST_INTRO() {
      if (S.step !== 'card') return ['CI|wait', tv('Casting in progress', 'The narrator is about to introduce your characters.', '🎬')];
      const c = charOf(S.x.card.id); const mine = S.x.card.id === S.me.id;
      return [`CI|${S.x.card.id}`, mine ? `<div class="tv"><div class="ico">⭐</div><h2 class="h">This is you!</h2><p class="lead">You are playing ${esc(S.x.card.name)}. Written by ${esc(S.x.card.writer?.name || 'someone')}.</p></div>` : tv(`Meet ${esc(c?.name || '')}`, `Played by ${esc(c?.player || '')}`, '🎬')];
    },
    SECRETS() {
      const me = S.me; const a = me.agenda;
      return [`SEC|${me.isMole}`, `<h2 class="h">Your secrets</h2><p class="lead">Don't show anyone. Don't react.</p>
        <div class="secret"><div class="k">SECRET AGENDA · +500</div><div class="t">${esc(a.label)}</div></div>
        <p class="lead">Someone has to write it into a scene and it has to be performed. If anyone objects while that line is being read, you're busted.</p>
        ${me.isMole ? '<div class="mole"><b>You are the Mole.</b> A rival network is paying you to sink this show. If the season ends under 5.0 million viewers and you are not caught, you win 800 points. Write flat lines, boo good scenes, and once per episode you can send a fake network note to another team.</div>' : ''}
        <button class="btn primary big" data-a="ack">Got it</button>`];
    },
    EP_INTRO() { return [`EP|${S.step}`, `${tv(`Episode ${S.ep.n}`, 'Watch the TV.', '🎞️')}${S.step === 'note' || S.step === 'twist' ? noteMemo() : ''}`]; },
    PITCH() {
      if (S.x.mine) return ['PITCH|sent', `${tv('Pitch sent.', `"${esc(S.x.mine)}"`, '📌')}${noteMemo()}`];
      return ['PITCH|edit', `<h2 class="h">Pitch episode ${S.ep.n}</h2><p class="lead">One sentence: what happens in this episode? The room votes. The winner gets 300 points.</p>${noteMemo()}
        <textarea rows="4" maxlength="200" data-draft="pitch" placeholder="A health inspector arrives, and it's Nurse Bindu's ex-husband.">${esc(d('pitch'))}</textarea>
        <button class="btn primary big" data-a="pitch">Pitch it</button>`];
    },
    VOTE() {
      const cards = S.x.pitches.map((p, i) => `<button data-a="vote" data-id="${p.id}" class="${S.x.myVote === p.id ? 'on' : ''}" ${p.mine ? 'disabled' : ''}><span class="letter">${String.fromCharCode(65 + i)}</span><span>${esc(p.text)}${p.mine ? ' <small class="muted">(yours)</small>' : ''}</span></button>`).join('');
      return [`VOTE|${S.x.myVote}`, `<h2 class="h">Vote for the best pitch</h2><div class="pick">${cards}</div>${S.x.myVote ? '<p class="lead">Vote saved. You can change it until time is up.</p>' : ''}`];
    },
    PITCH_RESULT() { return ['PR', tv('The plot is set', `"${esc(S.x.plot)}"`, '📌')]; },
    TEAMS() { return R.WRITING(); },
    WRITING() {
      const x = S.x; const sc = x.myScene;
      if (!sc) {
        const sr = x.showrunner?.id === S.me.id;
        return [`W|none|${sr}`, sr ? `<div class="tv"><div class="ico">🎬</div><h2 class="h">You're the Showrunner</h2><p class="lead">No scene for you this episode. When the writing ends, you get to secretly rewrite any one line in any script.</p></div>${moleBox()}` : tv('Sit tight', 'You are not on a writing team this time.')];
      }
      if (S.phase === 'TEAMS' || !sc.slug) return ['W|teams', `<h2 class="h">Your writing team</h2><p class="lead">You're with ${sc.writers.filter((w) => w.id !== S.me.id).map((w) => esc(w.name)).join(' & ')}. The setup is being written now.</p>`];
      const myChar = charOf(x.myChar); const meChar = sc.chars.find((c) => c.id === x.myChar);
      const lines = sc.lines.map((l) => {
        const c = charOf(l.char); const mine = l.writer === S.me.id;
        return `<div class="sl ${mine ? 'mine' : ''}"><div class="nm">${esc(c?.name || '')}<small>${mine ? 'you write this' : `${esc(S.players.find((p) => p.id === l.writer)?.name || '')} writes this`}</small></div>${mine ? `<textarea rows="2" maxlength="220" data-line="${l.id}" placeholder="What does ${esc(c?.name || 'they')} say?">${esc(d(`l_${l.id}`, l.text))}</textarea>` : `<div class="theirs ${l.text ? '' : 'empty'}" data-theirs="${l.id}">${l.text ? esc(l.text) : 'waiting...'}</div>`}</div>`;
      }).join('');
      const html = `<div class="paper"><div class="slug">${esc(sc.slug)}</div><div class="script" style="font-style:italic;margin-top:.4rem">${esc(sc.direction)}</div><div class="must"><b>Must happen:</b> ${esc(sc.mustHappen)}</div></div>
        ${sc.interference ? `<div class="alert">URGENT NOTE FROM THE NETWORK: ${esc(sc.interference)}</div>` : ''}
        ${noteMemo()}
        <div class="card charcard">${W.bust(meChar || myChar, 'lg')}<div class="traits"><div>You write for <b>${esc(myChar?.name || '')}</b>, played by ${esc(myChar?.player || '')}.</div><div class="muted">${esc(meChar?.job || '')}${meChar?.secret ? `. Secret: ${esc(meChar.secret)}` : ''}${meChar?.catchphrase ? `. Says "${esc(meChar.catchphrase)}"` : ''}</div></div></div>
        <div class="script-edit">${lines}</div>
        <button class="btn ${sc.myDone ? '' : 'primary'} big" data-a="writeDone" id="wdone">${sc.myDone ? 'Ready. Tap to keep editing' : 'Our script is ready'}</button>${moleBox()}`;
      return [`W|${sc.i}|${sc.slug}|${!!sc.interference}|${sc.myDone}|${!!x.interfere}`, html, () => {
        sc.lines.forEach((l) => { const el = document.querySelector(`[data-theirs="${l.id}"]`); if (el) { el.textContent = l.text || 'waiting...'; el.classList.toggle('empty', !l.text); } });
      }];
    },
    PUNCHUP() {
      const x = S.x;
      if (!x.punch) return ['PU|wait', tv('The Showrunner is reviewing the scripts', 'Somebody might be changing your best line right now.', '🖍️')];
      if (x.punch.done) return ['PU|done', tv('Punch-up delivered', 'Act natural.', '🤫')];
      const all = x.punch.scenes.map((sc) => `<div class="paper"><div class="slug">${esc(sc.slug)}</div>${sc.lines.map((l) => `<div style="margin-top:.6rem"><div class="slug" style="font-size:.8rem">${esc(charOf(l.char)?.name || '')}</div><textarea rows="2" data-punch="${l.id}" maxlength="220">${esc(d(`p_${l.id}`, l.text))}</textarea></div>`).join('')}</div>`).join('');
      return ['PU|edit', `<h2 class="h">Punch-up</h2><p class="lead">Change any one line, then send it. Only the first line you change counts.</p>${all}<button class="btn primary big" data-a="punch">Send my change</button><button class="btn ghost big" data-a="punchSkip">Leave the scripts alone</button>`];
    },
    TABLE_READ() {
      const x = S.x;
      if (!x.scene || ['intro', 'title', 'direction', 'end'].includes(S.step)) {
        const mine = x.myScript ? `<div class="card"><b>Your lines in this scene</b>${x.myScript.lines.map((l) => `<div class="nowline" style="margin-top:.5rem">${esc(l.text)}</div>`).join('')}</div>` : '';
        return [`TR|${S.step}|${x.sceneIdx}`, `${tv(S.step === 'end' ? 'Scene over' : 'Table read', S.step === 'end' ? `${x.rating?.toFixed(1)} million viewers` : x.scene ? esc(x.scene.slug) : 'Places, everyone.', '🎬')}${mine}`];
      }
      if (S.step === 'objection') return [`TR|obj|${x.line.id}`, tv(x.objection.sustained ? 'Objection sustained!' : 'Objection overruled', x.objection.sustained ? x.objection.busted.map((b) => `${esc(b.owner.name)} was busted.`).join(' ') : 'That line was just bad.', '⚖️')];
      if (x.myLine) {
        const up = (x.upcoming || []).length ? `<p class="lead">Coming up for you: ${x.upcoming.map((t) => `"${esc(t)}"`).join(', ')}</p>` : '';
        return [`TR|me|${x.line.id}`, `<div class="prompter"><div class="nm">${esc(x.line.charName)}</div><div class="words">${esc(x.line.text)}</div>${S.ep.physical ? `<div class="phys">${esc(S.ep.physical)}</div>` : ''}</div><button class="btn primary big" data-a="actorDone" data-id="${x.line.id}">Done, next line</button>${up}`];
      }
      const used = (k) => (x.myReacts || []).includes(k) ? 'used' : '';
      const line = x.line.empty ? '<div class="nowline">(a long, meaningful silence)</div>' : `<div class="nowline"><b>${esc(x.line.charName)}</b>${esc(x.line.text)}</div>`;
      return [`TR|aud|${x.line.id}|${(x.myReacts || []).join(',')}|${x.canObject}`, `<div class="card">${line}</div>
        <div class="react"><button class="laugh ${used('laugh')}" data-a="react" data-k="laugh">😂<span>Laugh</span></button><button class="gasp ${used('gasp')}" data-a="react" data-k="gasp">😱<span>Gasp</span></button><button class="boo ${used('boo')}" data-a="react" data-k="boo">🍅<span>Boo</span></button></div>
        <button class="objbtn" data-a="object" ${x.canObject ? '' : 'disabled'}>OBJECTION!</button>
        <p class="lead" style="font-size:.9rem">${x.canObject ? 'Object if this line sounds like someone\'s planted agenda. Right: +200. Wrong: -150. Once per episode.' : 'Objection used this episode.'}</p>`];
    },
    RATINGS() { return [`RA|${S.step}`, tv(S.step === 'cliffhanger' ? 'To be continued...' : 'The ratings are in', 'Watch the TV.', '📈')]; },
    LAST_WORDS() {
      const c = S.me.char;
      if (S.x.mine) return ['LW|sent', tv('Last words locked in', `"${esc(S.x.mine)}"`, '🕯️')];
      return ['LW|edit', `<h2 class="h">Last words</h2><p class="lead">The final line of the series for your own character, ${esc(c?.name || '')}. Make it count.</p><textarea rows="3" maxlength="200" data-draft="last" placeholder="${esc(c?.catchphrase || '')}">${esc(d('last'))}</textarea><button class="btn primary big" data-a="lastWords">Lock it in</button>`];
    },
    FINALE() {
      if (S.step === 'last' && S.x.myLine) return [`FI|me`, `<div class="prompter"><div class="nm">${esc(S.x.char.name)}</div><div class="words">${esc(S.x.text)}</div><div class="phys">Your final line. Stand up for it.</div></div><button class="btn primary big" data-a="actorDone" data-id="${S.x.lineId}">Done</button>`];
      return [`FI|${S.step}`, tv('The series finale', 'Watch the TV.', '🎭')];
    },
    CRITIC() { return ['CR', tv('The reviews are in', 'Watch the TV.', '📰')]; },
    MOLE_VOTE() {
      const opts = [...S.x.options.map((p) => ({ id: p.id, label: esc(p.name) })), { id: 'none', label: 'There was no Mole' }];
      return [`MV|${S.x.myVote}`, `<h2 class="h">Who was the Mole?</h2><p class="lead">A right guess is +150. If you catch a Mole, they lose their payout.</p>${S.me.isMole ? '<div class="mole"><b>You are the Mole.</b> Vote like an innocent writer would.</div>' : ''}<div class="pick">${opts.map((o) => `<button data-a="moleVote" data-id="${o.id}" class="${S.x.myVote === o.id ? 'on' : ''}">${o.label}</button>`).join('')}</div>`];
    },
    REVEALS() { return [`RV|${S.step}|${S.x.who?.id || ''}`, S.x.who?.id === S.me.id ? tv('Your agenda', S.x.status === 'done' ? 'You pulled it off. +500.' : S.x.status === 'busted' ? 'Busted.' : 'It never happened.', '📜') : tv('The envelopes', 'Watch the TV.', '✉️')]; },
    FINAL() {
      const m = S.x.mine;
      return ['FINAL', `<div class="card" style="text-align:center"><div class="muted">You finished</div><div class="rank">#${m.rank}</div><div class="muted">of ${S.x.rows.length} · ${m.score} points</div></div>
        <div class="card ledger">${summarize(m.ledger)}</div>
        ${S.me.vip ? '<button class="btn primary big" data-a="again">Make another show</button>' : `<p class="lead" style="text-align:center">${esc(vipName())} can start another show.</p>`}`];
    },
  };
  function summarize(ledger) {
    const g = {}; ledger.forEach((l) => { g[l.why] = (g[l.why] || 0) + l.pts; });
    return Object.entries(g).map(([k, v]) => `<div><span>${esc(k)}</span><b>${v > 0 ? '+' : ''}${v}</b></div>`).join('') || '<div>No points. Bold.</div>';
  }
  function moleBox() {
    const it = S.x.interfere; if (!it) return '';
    const targets = it.scenes.filter((s) => !s.mine);
    return `<div class="mole"><b>Mole: send a fake network note</b><p style="margin:.4rem 0">Pick a team and a note. They'll think it came from the network.</p>
      <select data-draft="m_team">${targets.map((s) => `<option value="${s.i}">${esc(s.writers.join(' & '))}</option>`).join('')}</select>
      <div class="pick" style="margin-top:.6rem">${it.notes.map((n, i) => `<button data-a="interfere" data-i="${i}">${esc(n)}</button>`).join('')}</div></div>`;
  }

  // ---------------------------------------------------------------- render
  function render() {
    if (!S.me) return;
    const show = S.show ? `<b>${esc(S.show.title)}</b>${S.ep ? `Episode ${S.ep.n}` : esc(S.genre?.name || '')}` : "<b>Writers' Room</b>";
    mount(hud, `<div class="me"><span class="dot" style="--c:${S.me.color}">${esc(W.initials(S.me.name))}</span>${esc(S.me.name)}</div><div class="show">${show}</div>${S.endsAt ? `<div class="t" ${T()}></div>` : ''}`);
    $('#tChar').disabled = !S.me.char; $('#tSecret').disabled = !S.me.agenda;
    const fn = R[S.phase]; if (!fn) return;
    const [key, html, patch] = fn();
    if (key === screenKey && patch) { patch(); return; }
    if (key === screenKey && document.activeElement && /TEXTAREA|INPUT|SELECT/.test(document.activeElement.tagName) && main.contains(document.activeElement)) { if (patch) patch(); return; }
    screenKey = key; patcher = patch;
    mount(main, html);
    if (sheet) openSheet(sheet);
  }

  // ---------------------------------------------------------------- sheets
  function openSheet(kind) {
    sheet = kind;
    let html = '';
    if (kind === 'char') {
      const c = S.me.char;
      html = `<div class="hd"><h3>Your character</h3><button class="btn sm" data-a="close">Close</button></div>${c ? `<div class="charcard">${W.bust(c, 'lg')}<div><b style="font-size:1.3rem">${esc(c.name)}</b><div class="muted">${esc(c.job)}</div></div></div><div class="traits"><div><b>Secret:</b> ${esc(c.secret)}</div><div><b>Weakness:</b> ${esc(c.weakness)}</div><div><b>Catchphrase:</b> "${esc(c.catchphrase)}"</div></div><p class="lead">Written for you by someone in this room. Your friends write your lines; ${S.me.act ? 'you perform them out loud' : 'the narrator performs them'}.</p>` : '<p class="lead">You get a character after casting.</p>'}`;
    }
    if (kind === 'secret') {
      const a = S.me.agenda;
      html = `<div class="hd"><h3>Your secret</h3><button class="btn sm" data-a="close">Close</button></div>${a ? `<div class="secret"><div class="k">SECRET AGENDA · ${a.status === 'done' ? 'DONE' : a.status === 'busted' ? 'BUSTED' : 'ACTIVE'}</div><div class="t">${esc(a.label)}</div>${a.kind === 'count' ? `<div class="muted" style="margin-top:.4rem">This episode so far: ${a.count} of ${a.n}</div>` : ''}</div>` : ''}${S.me.isMole ? '<div class="mole"><b>You are the Mole.</b> Sink the show below 5.0 million viewers without getting caught: +800.</div>' : ''}`;
    }
    sheetWrap.hidden = false; mount(sheetEl, html);
  }
  function closeSheet() { sheet = null; sheetWrap.hidden = true; sheetEl.__html = ''; }
  sheetWrap.querySelector('.scrim').onclick = closeSheet;
  $('#tChar').onclick = () => openSheet('char');
  $('#tSecret').onclick = () => openSheet('secret');

  // ---------------------------------------------------------------- inputs
  const lineTimers = {};
  document.addEventListener('input', (e) => {
    const t = e.target;
    if (t.dataset.draft) { drafts[t.dataset.draft] = t.value; if (t.dataset.draft.startsWith('c_')) saveCast(false); }
    if (t.dataset.line) { const id = t.dataset.line; drafts[`l_${id}`] = t.value; clearTimeout(lineTimers[id]); lineTimers[id] = setTimeout(() => send('line', { id, text: t.value }), 350); }
    if (t.dataset.punch) drafts[`p_${t.dataset.punch}`] = t.value;
  });
  document.addEventListener('change', (e) => { const t = e.target; if (t.dataset.a === 'actToggle') send('profile', { act: t.checked }); if (t.dataset.draft) drafts[t.dataset.draft] = t.value; });
  let castTimer = null;
  function saveCast(done) {
    clearTimeout(castTimer);
    const go = () => send('cast', { done, fields: { name: d('c_name'), job: d('c_job'), secret: d('c_secret'), weakness: d('c_weakness'), catchphrase: d('c_catchphrase') } });
    if (done) go(); else castTimer = setTimeout(go, 500);
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-a]'); if (!b || b.disabled || b.tagName === 'INPUT') return;
    const a = b.dataset.a;
    switch (a) {
      case 'start': send('start', { genre: d('genre', '') || undefined }); break;
      case 'skip': send('skip'); break;
      case 'again': send('again'); break;
      case 'close': closeSheet(); break;
      case 'castDone': if (!d('c_name').trim()) { toast('Give them a name at least.', 'bad'); break; } saveCast(true); break;
      case 'ack': send('ack'); break;
      case 'pitch': if (!d('pitch').trim()) { toast('Write a pitch first.', 'bad'); break; } send('pitch', { text: d('pitch') }); break;
      case 'vote': send('vote', { id: b.dataset.id }); break;
      case 'writeDone': { document.querySelectorAll('[data-line]').forEach((t) => { clearTimeout(lineTimers[t.dataset.line]); send('line', { id: t.dataset.line, text: t.value }); }); send('writeDone', { done: !S.x.myScene?.myDone }); break; }
      case 'interfere': { const sc = Number(d('m_team', document.querySelector('[data-draft="m_team"]')?.value)); send('interfere', { scene: sc, text: b.textContent }); break; }
      case 'punch': {
        const changed = [...document.querySelectorAll('[data-punch]')].find((t) => { const l = S.x.punch.scenes.flatMap((s) => s.lines).find((y) => y.id === t.dataset.punch); return l && t.value !== l.text; });
        if (!changed) { toast('Change a line first, or leave them alone.', 'bad'); break; }
        send('punch', { id: changed.dataset.punch, text: changed.value }); break;
      }
      case 'punchSkip': send('punchSkip'); break;
      case 'actorDone': send('actorDone', { id: b.dataset.id }); buzz(15); break;
      case 'react': send('react', { kind: b.dataset.k }); buzz(15); break;
      case 'object': send('object'); buzz([100, 50, 100]); break;
      case 'lastWords': if (!d('last').trim()) { toast('Write a last line first.', 'bad'); break; } send('lastWords', { text: d('last') }); break;
      case 'moleVote': send('moleVote', { id: b.dataset.id }); break;
      default:
    }
  });
})();
