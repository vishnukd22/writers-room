/* WRITERS' ROOM: the phone. One big thing to do at a time. */
(() => {
  const $ = (q) => document.querySelector(q);
  const esc = W.esc;
  const socket = io();
  const main = $('#main'); const hud = $('#hud');
  const params = new URLSearchParams(location.search);
  $('#jcode').value = (params.get('room') || localStorage.getItem('wr:code') || '').toUpperCase();
  $('#jname').value = localStorage.getItem('wr:name') || '';
  $('#jpron').value = localStorage.getItem('wr:pron') || '';
  const buzz = (p) => { try { navigator.vibrate?.(p); } catch (e) { /* no vibration */ } };

  let S = null; let P = null; let joined = null; let lastNote = null; let screenKey = null;
  const drafts = {};

  // ---------------------------------------------------------------- joining
  let wake = null;
  async function keepAwake() { try { if ('wakeLock' in navigator && !wake && document.visibilityState === 'visible') { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => { wake = null; }); } } catch (e) { wake = null; } }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && joined) { keepAwake(); if (!socket.connected) socket.connect(); } });
  function tryJoin(code, token) {
    const name = $('#jname').value.trim(); const pron = $('#jpron').value.trim();
    socket.emit('player:join', { code, token, name, pron }, (r) => {
      if (r.error) { if (token) { localStorage.removeItem(`wr:token:${code}`); joined = null; } $('#jerr').textContent = r.error; $('#join').hidden = false; $('#app').hidden = true; return; }
      joined = { code: r.code, token: r.token };
      localStorage.setItem(`wr:token:${r.code}`, r.token); localStorage.setItem('wr:code', r.code);
      localStorage.setItem('wr:name', name); localStorage.setItem('wr:pron', pron);
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
  function send(type, data = {}, cb) { socket.emit('act', { type, ...data }, (r) => { if (r?.error) toast(r.error, 'bad'); cb?.(r); }); }

  function toast(text, kind = 'info') { const t = document.createElement('div'); t.className = `toast ${kind}`; t.textContent = text; $('#toasts').appendChild(t); setTimeout(() => t.remove(), 3500); buzz(kind === 'bad' ? [60, 40, 60] : 25); }
  function notes() {
    const ns = S.me?.notes || []; const top = ns.length ? ns[ns.length - 1].id : 0;
    if (lastNote === null) { lastNote = top; return; }
    ns.filter((n) => n.id > lastNote).forEach((n) => toast(n.text, n.kind)); lastNote = Math.max(lastNote, top);
  }
  function feel() {
    if (P && (P.phase !== S.phase || P.step !== S.step)) window.scrollTo(0, 0);
    if (S.x.myLine && P?.x?.myLine?.k !== S.x.myLine.k) buzz([90, 50, 90]);
    if (S.x.write && P?.x?.write?.k !== S.x.write.k) buzz([60, 40, 60, 40, 60]);
    if (S.x.fin?.write && !P?.x?.fin?.write) buzz([120, 60, 120]);
  }

  // ---------------------------------------------------------------- helpers
  const vipName = () => S.players.find((p) => p.id === S.vipId)?.name || 'the first player';
  const skipBtn = () => (S.me.vip ? '<button class="btn ghost sm skip" data-a="skip">Skip ahead</button>' : '');
  const tv = (title, sub = '', ico = '📺') => `<div class="tv"><div class="ico">${ico}</div><h2 class="h">${title}</h2>${sub ? `<p class="lead">${sub}</p>` : ''}${skipBtn()}</div>`;
  const d = (id, fallback = '') => (id in drafts ? drafts[id] : fallback);
  const dots = (n, cap) => `<span class="dots">${Array.from({ length: cap }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</span>`;
  const writeBox = (id, title, sub, prev, ideas, ends, action, extra = '') => `<div class="writer">
      <div class="wtop"><h2 class="h">${title}</h2><div class="t big" data-ends="${ends}"></div></div>
      ${sub ? `<p class="lead">${sub}</p>` : ''}
      ${prev ? `<div class="prevline"><b>${esc(prev.name)} just said</b>${esc(prev.text)}</div>` : ''}
      <textarea rows="3" maxlength="140" data-draft="${id}" placeholder="Type their line...">${esc(d(id))}</textarea>
      <div class="chips">${(ideas || []).map((t) => `<button data-a="idea" data-t="${esc(t)}" data-for="${id}">${esc(t)}</button>`).join('')}</div>
      ${extra}<button class="btn primary big" data-a="${action}" data-for="${id}">Send it</button></div>`;

  // ---------------------------------------------------------------- screens: each returns [key, html]
  const R = {
    LOBBY() {
      const me = S.me;
      const list = S.players.map((p) => `<span class="pill" style="--c:${p.color}">${esc(p.name)}${p.id === me.id ? ' (you)' : ''}</span>`).join('');
      const n = S.players.length; const ok = n === 2 || n >= 4;
      const hint = n === 1 ? 'One more for Date Night, or three more for the party game.' : n === 2 ? 'Two of you: this is Date Night.' : n === 3 ? 'Add one more for the party game.' : 'Start when everyone is in.';
      const start = me.vip ? `<button class="btn primary big" data-a="start" ${ok ? '' : 'disabled'}>${n === 2 ? 'Start Date Night' : 'Start the show'}</button><p class="hint">${hint}</p>` : `<p class="lead">Waiting for ${esc(vipName())} to start.</p>`;
      return [`LOBBY|${S.players.length}|${me.vip}`, `<h2 class="h">You're in, ${esc(me.name)}.</h2>
        <div class="how"><div><b>✍️</b>Write lines</div><div><b>🎭</b>Act them out</div><div><b>😂</b>Laughs = points</div></div>
        <div class="pills">${list}</div>${start}`];
    },
    INTRO() {
      const how = S.mode === 'date' ? '<div class="how"><div><b>✍️</b>Write their lines</div><div><b>🎭</b>Say yours</div><div><b>😂</b>Make them crack</div></div>' : '<div class="how"><div><b>✍️</b>Write lines</div><div><b>🎭</b>Act them out</div><div><b>😂</b>Laughs = points</div></div>';
      return [`INTRO|${S.step}`, `${tv('Eyes on the TV', 'The show is starting.', '🎬')}${how}`];
    },
    SCENE_INTRO() {
      const sc = S.x.scene;
      if (S.mode === 'date') return [`SI|${sc.i}|d|${S.step}`, `<div class="tv"><div class="ico">🎭</div><h2 class="h">You're in this one</h2><div class="rolecard">You are<b>${esc(S.me.role)}</b></div><p class="lead">Say your line out loud. Then write your partner's reply, and pick how they have to say it. Make them crack.</p></div>`];
      if (S.me.actor) return [`SI|${sc.i}|a|${S.step}`, `<div class="tv"><div class="ico">🎭</div><h2 class="h">You're acting!</h2><div class="rolecard">You are<b>${esc(S.me.role)}</b></div><p class="lead">Stand up. Your lines appear here. Say them out loud straight away. Don't laugh.</p></div>`];
      return [`SI|${sc.i}|w|${S.step}`, tv("You're writing", `Starring ${sc.actors.map((a) => esc(a.name)).join(' and ')}. When it's your turn, you write their next line. Fast.`, '✍️')];
    },
    SCENE() {
      const x = S.x; const sc = x.scene;
      if (x.mode === 'date') {
        if (x.dispute) return [`SD|dispute|${x.dispute.until}`, `<div class="tv"><div class="ico">😤</div><h2 class="h">${esc(x.partner?.name || 'They')} says you cracked</h2></div><button class="cutbtn dispute" data-a="dispute">DID NOT!<span>the coin decides</span></button>`];
        if (x.myLine) return [`SD|act|${sc.i}|${x.myLine.k}`, `<div class="prompter"><div class="dir">${esc(x.myLine.dir || '')}</div><div class="words">${esc(x.myLine.text)}</div></div>
          <button class="btn primary big done" data-a="done">Said it ▶</button><p class="hint center">Say it to ${esc(x.partner?.name || 'them')}, with the direction, then tap.</p>`];
        if (x.write) {
          const id = `w${sc.i}_${x.write.k}`; const di = d(`dir_${id}`, '0');
          const dirs = `<div class="dirs"><span>How must they say it?</span>${x.write.dirs.map((t, i) => `<button data-a="pickdir" data-for="${id}" data-i="${i}" class="${String(i) === String(di) ? 'on' : ''}">${esc(t)}</button>`).join('')}</div>`;
          return [`SD|write|${sc.i}|${x.write.k}`, writeBox(id, `Write ${esc(x.write.speaker.name)}'s reply`, `They're playing ${esc(x.write.speaker.role)}. Make it hard to say with a straight face.`, x.write.prev, x.write.ideas, x.write.endsAt, 'sendLine', dirs)];
        }
        if (x.watch) return [`SD|watch|${sc.i}|${x.watch.k}|${x.watch.canCrack}`, `<p class="lead center">Watch ${esc(x.partner?.name || 'them')} say your line.</p><button class="laughbtn crackbtn" data-a="crack" ${x.watch.canCrack ? '' : 'disabled'}>😂<span>${x.watch.canCrack ? 'THEY CRACKED!' : 'Crack called!'}</span></button><p class="hint center">Only if they really laughed. They can dispute it.</p>`];
        if (x.npc) return [`SD|npc|${sc.i}|${x.npc}`, tv('Someone just barged in', `It's ${esc(x.npc)}.`, '🚪')];
        if (x.partnerWriting) return [`SD|pw|${sc.i}`, tv(`${esc(x.partner?.name || 'They')} is writing your next line`, 'Be very afraid.', '😬')];
        return [`SD|listen|${sc.i}|${x.cur?.k}`, tv('Listen', '', '👂')];
      }
      if (S.me.actor) {
        if (x.myLine) return [`SC|act|${sc.i}|${x.myLine.k}`, `<div class="prompter"><div class="dir">${esc(x.myLine.dir || '')}</div><div class="words">${esc(x.myLine.text)}</div></div>
          <button class="btn primary big done" data-a="done">Said it ▶</button><p class="hint center">Say it out loud, with the direction, then tap.</p>`];
        return [`SC|wait|${sc.i}|${x.cur?.k}|${x.nextReady}`, `<div class="tv"><div class="ico">👂</div><h2 class="h">Listen</h2><p class="lead">${x.cur ? `${esc(sc.actors.find((a) => a.id === x.cur.speaker)?.name || '')} is speaking.` : ''} ${x.linesLeft ? (x.nextReady ? 'Your next line is loaded.' : 'Your next line is being written.') : 'That was your last line in this scene.'}</p><div class="rolecard">You are<b>${esc(S.me.role)}</b></div></div>`];
      }
      if (x.write) return [`SC|write|${sc.i}|${x.write.k}`, writeBox(`w${sc.i}_${x.write.k}`, `Write ${esc(x.write.speaker.name)}'s next line`, `They're playing ${esc(x.write.speaker.role)}.`, x.write.prev, x.write.ideas, x.write.endsAt, 'sendLine')];
      const laugh = `<button class="laughbtn ${x.ownLine ? 'off' : ''}" data-a="laugh" ${x.ownLine ? 'disabled' : ''}>😂<span>${x.ownLine ? 'Your line!' : 'LAUGH'}</span>${dots(x.myLaughs || 0, x.laughCap || 4)}</button>`;
      const cracks = `<div class="cracks"><span>Who cracked?</span>${(x.cracks || []).map((a) => `<button data-a="crack" data-id="${a.id}" class="${a.mine ? 'on' : ''} ${a.done ? 'done' : ''}" ${a.done ? 'disabled' : ''}>${esc(a.name)}${a.done ? ' 💥' : ''}</button>`).join('')}</div>`;
      const dirs = x.dirs ? `<div class="dirs"><span>Pick ${esc(x.dirs.forName)}'s next direction</span>${x.dirs.options.map((t, i) => `<button data-a="dir" data-i="${i}" class="${x.dirs.mine === i ? 'on' : ''}">${esc(t)}</button>`).join('')}</div>` : '';
      const soon = x.myTurnIn === 1 ? '<div class="soon">✍️ You write next. Get ready!</div>' : '';
      return [`SC|aud|${sc.i}|${x.cur?.k}|${x.myLaughs}|${x.ownLine}|${x.dirs?.mine}|${x.writing?.k}|${(x.cracks || []).map((a) => `${a.mine}${a.done}`).join()}|${x.myTurnIn}`, `${soon}${laugh}${cracks}${dirs}`];
    },
    SCENE_END() {
      const x = S.x; const sc = x.scene;
      if (S.mode === 'date') {
        if (S.step === 'review' && x.review) { const mine = x.review.best?.by?.id === S.me.id; return [`SE|rev|${mine}`, tv(`${'★'.repeat(x.review.stars)}${'☆'.repeat(5 - x.review.stars)}`, mine ? `The critic loved your line. +200` : 'Eyes on the TV.', mine ? '🏅' : '📰')]; }
        if (S.step === 'critic') return ['SE|critic', tv('The critic is writing', 'Nervous?', '📰')];
        return [`SE|${S.step}`, tv('Scene!', 'Eyes on the TV.', '👏')];
      }
      if (S.step === 'vote') {
        if (!x.canVote) return [`SE|vote|a`, tv('The room is judging you', 'Best actor gets 300 points. Smile.', '🫣')];
        return [`SE|vote|${x.myVote}`, `<h2 class="h">Best actor?</h2><div class="actorvote">${sc.actors.map((a) => `<button data-a="vote" data-id="${a.id}" class="${x.myVote === a.id ? 'on' : ''}">${W.bust(a, 'lg')}<b>${esc(a.name)}</b></button>`).join('')}</div>`];
      }
      if (S.step === 'result') { const won = (x.winners || []).some((w) => w.id === S.me.id); return [`SE|res|${won}`, tv(won ? 'Best actor! +300' : x.winners?.length ? `${esc(x.winners.map((w) => w.name).join(' and '))} wins` : 'Nobody voted. Brutal.', `You have ${S.me.score} points.`, won ? '🏆' : '🎬')]; }
      if (S.step === 'line' && x.line?.by?.id === S.me.id) return ['SE|line|me', tv('Line of the scene! +200', `"${esc(x.line.text)}"`, '🏅')];
      return [`SE|${S.step}`, tv('Scene!', 'Eyes on the TV.', '👏')];
    },
    CUT_INTRO() { return ['CI', `${tv('Finale: CUT!', 'The narrator reads a scene starring all of you. Hit CUT, and you write the next line. You get two cuts.', '✂️')}`]; },
    CUT() {
      const f = S.x.fin;
      if (S.step === 'write') {
        if (f.write) return ['CUT|write', writeBox('cut', `Write ${esc(f.write.target.name)}'s next line`, 'The narrator will perform it, and the story has to follow.', f.write.prev, f.write.ideas, S.endsAt, 'sendCut')];
        return [`CUT|w|${f.cutter?.id}`, tv(`${esc(f.cutter?.name || 'Someone')} has the pen`, 'Heckle them.', '✂️')];
      }
      if (S.step === 'rewrite') return ['CUT|rw', tv('Rewriting the script...', 'The story is bending around that line.', '📝')];
      if (S.step === 'end') return ['CUT|end', tv("That's a wrap!", 'Eyes on the TV.', '🎬')];
      const canCut = !f.locked && f.cutsLeft > 0;
      const laugh = `<button class="laughbtn small ${f.ownLine ? 'off' : ''}" data-a="laugh" ${f.ownLine ? 'disabled' : ''}>😂<span>${f.ownLine ? 'Your line!' : 'LAUGH'}</span>${dots(f.myLaughs || 0, f.laughCap || 4)}</button>`;
      return [`CUT|play|${canCut}|${f.cutsLeft}|${f.myLaughs}|${f.lineNo}|${f.ownLine}`, `<button class="cutbtn" data-a="cut" ${canCut ? '' : 'disabled'}>CUT!<span>${f.cutsLeft ? `${f.cutsLeft} left` : 'none left'}</span></button>
        <p class="hint center">${f.cutsLeft ? (f.locked ? 'Wait for the next line...' : 'First to hit it writes the next line.') : 'Laugh at the good ones.'}</p>${laugh}`];
    },
    FINAL() {
      const x = S.x;
      if (x.step !== 'board' && x.step !== 'winner') return [`FI|${x.step}`, tv('The awards', 'Eyes on the TV.', '🏆')];
      const m = x.mine;
      return [`FI|board|${S.me.vip}`, `<div class="card rankcard"><div class="muted">You finished</div><div class="rank">#${m.rank}</div><div class="muted">of ${x.rows.length} · ${m.score} points</div><div class="ledger"><div><span>Writing</span><b>${m.writerPts}</b></div><div><span>Acting</span><b>${m.actorPts}</b></div></div></div>
        ${S.me.vip ? '<button class="btn primary big" data-a="again">Play again</button>' : `<p class="lead center">${esc(vipName())} can start another game.</p>`}`];
    },
  };

  // ---------------------------------------------------------------- render
  function render() {
    if (!S.me) return;
    const title = S.x.scene ? `<b>${esc(S.x.scene.title)}</b>Scene ${S.x.scene.i + 1} of ${S.x.scene.count}` : S.x.fin ? `<b>${esc(S.x.fin.title)}</b>The finale` : "<b>Writers' Room</b>";
    mount(hud, `<div class="me"><span class="dot" style="--c:${S.me.color}">${esc(W.initials(S.me.name))}</span>${esc(S.me.name)}<small>${S.me.score || 0}</small></div><div class="show">${title}</div>`);
    const fn = R[S.phase]; if (!fn) return;
    const [key, html] = fn();
    if (key === screenKey) return;
    screenKey = key;
    mount(main, html);
    const ta = main.querySelector('textarea'); if (ta) { ta.focus({ preventScroll: true }); ta.setSelectionRange(ta.value.length, ta.value.length); }
  }

  // ---------------------------------------------------------------- inputs
  document.addEventListener('input', (e) => { const t = e.target; if (t.dataset.draft) drafts[t.dataset.draft] = t.value; });
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-a]'); if (!b || b.disabled) return;
    const a = b.dataset.a;
    switch (a) {
      case 'start': send('start'); break;
      case 'skip': send('skip'); break;
      case 'again': send('again'); break;
      case 'idea': { const id = b.dataset.for; const ta = main.querySelector(`[data-draft="${id}"]`); const cur = d(id); drafts[id] = cur ? `${cur} ` : ''; if (ta) { ta.value = drafts[id]; ta.placeholder = `${b.dataset.t}...`; ta.focus(); } break; }
      case 'sendLine': case 'sendCut': {
        const id = b.dataset.for; const text = (main.querySelector(`[data-draft="${id}"]`)?.value || d(id)).trim();
        if (!text) { toast('Write something first!', 'bad'); break; }
        b.disabled = true; send(a === 'sendLine' ? 'line' : 'cutLine', { text, dir: Number(d(`dir_${id}`, '0')) }, (r) => { if (r?.ok) { delete drafts[id]; buzz(20); } else b.disabled = false; });
        break;
      }
      case 'done': send('done'); buzz(15); b.disabled = true; break;
      case 'laugh': send('laugh', {}, (r) => { if (r?.capped) toast('Max laughs for this line.', 'info'); }); buzz(12); b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); break;
      case 'crack': send('crack', { id: b.dataset.id }); buzz([40, 30, 40]); break;
      case 'dispute': send('dispute'); buzz([80, 40, 80]); b.disabled = true; break;
      case 'pickdir': { const id = b.dataset.for; drafts[`dir_${id}`] = b.dataset.i; b.parentElement.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); buzz(10); break; }
      case 'dir': send('dir', { i: Number(b.dataset.i) }); buzz(10); break;
      case 'vote': send('vote', { id: b.dataset.id }); buzz(15); break;
      case 'cut': send('cut', {}, (r) => { if (r?.ok) buzz([150, 50, 150]); }); break;
      default:
    }
  });
})();
