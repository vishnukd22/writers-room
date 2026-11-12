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
      if (r.redirect) { if (name) localStorage.setItem('wr:name', name); location.href = r.redirect; return; }
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
    if (S.phase === 'WRITE' && P?.phase !== 'WRITE') buzz([60, 40, 60]);
    if (S.phase === 'VOTE' && S.step === 'vote' && P?.step !== 'vote') buzz([40, 30, 40]);
    if (S.phase === 'GENRE' && S.me?.showrunner && P?.phase !== 'GENRE') buzz([120, 60, 120]);
  }

  // ---------------------------------------------------------------- helpers
  const vipName = () => S.players.find((p) => p.id === S.vipId)?.name || 'the first player';
  const skipBtn = () => (S.me.vip ? '<button class="btn ghost sm skip" data-a="skip">Skip ahead</button>' : '');
  const tv = (title, sub = '', ico = '📺') => `<div class="tv"><div class="ico">${ico}</div><h2 class="h">${title}</h2>${sub ? `<p class="lead">${sub}</p>` : ''}${skipBtn()}</div>`;
  const d = (id, fallback = '') => (id in drafts ? drafts[id] : fallback);
  const dots = (n, cap) => `<span class="dots">${Array.from({ length: cap }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</span>`;
  const memo = (note) => (note ? `<div class="memo"><b>NOTE FROM THE NETWORK</b>${esc(note)}</div>` : '');
  const pid = () => (S.x.pilot ? `${S.x.pilot.i}.${S.x.pilot.season?.ep ?? 's'}` : 'x');
  const laughBtn = (x, label) => `<button class="laughbtn ${x.own ? 'off' : ''}" data-a="laugh" ${x.own ? 'disabled' : ''}>😂<span>${x.own ? label || 'Your scene!' : 'LAUGH'}</span>${dots(x.myLaughs || 0, x.laughCap || 4)}</button>`;

  // ---------------------------------------------------------------- screens: each returns [key, html]
  const R = {
    LOBBY() {
      const me = S.me; const n = S.players.length;
      const grid = (S.x.busts || []).map((b) => { const owner = S.players.find((p) => p.id === b.by); const mine = b.by === me.id; const src = W.bustSrc(b.n, true);
        return `<button class="pickbust ${mine ? 'on' : ''}" data-a="bust" data-n="${b.n}" ${owner && !mine ? 'disabled' : ''}>${src ? `<img src="${src}" alt="">` : `<span class="nob">${b.n}</span>`}${owner && !mine ? `<small>${esc(owner.name)}</small>` : ''}</button>`; }).join('');
      const list = S.players.map((p) => `<span class="pill" style="--c:${p.color}">${esc(p.name)}${p.id === me.id ? ' (you)' : ''}</span>`).join('');
      const start = me.vip ? `<button class="btn primary big" data-a="start" ${n < 2 ? 'disabled' : ''}>${n === 2 ? 'Start Date Night' : 'Start the show'}</button><p class="hint">${n < 2 ? 'Waiting for at least one more writer.' : n === 2 ? 'Two of you: the Network exec judges every round.' : 'Start when everyone is in.'}</p>` : `<p class="lead">Waiting for ${esc(vipName())} to start.</p>`;
      const busts = (S.x.busts || []).map((b) => `${b.n}:${b.by || ''}`).join(',');
      return [`LOBBY|${n}|${me.vip}|${busts}`, `<h2 class="h">${me.bust ? `You're in, ${esc(me.name)}.` : `Pick your look, ${esc(me.name)}`}</h2>
        <div class="bustgrid">${grid}</div>
        <div class="pills">${list}</div>${start}`];
    },
    INTRO() { return [`INTRO|${S.step}`, `${tv('Eyes on the TV', "Johnny Primetime is warming up. Somebody has to.", '🎙️')}<div class="how"><div><b>✍️</b>Write</div><div><b>🗳️</b>Vote</div><div><b>📺</b>Watch it come alive</div></div>`]; },
    GENRE() {
      const pl = S.x.pilot;
      if (S.step === 'reveal') return [`GE|rev|${pid()}`, tv(esc(pl.genre?.name || ''), `Showrunner: ${esc(pl.showrunner?.name || '')}`, '🎬')];
      if (!S.me.showrunner) return [`GE|wait|${pid()}`, tv(`${esc(pl.showrunner?.name || 'The showrunner')} is picking the genre`, 'Shout your opinions at them.', '📣')];
      return [`GE|pick|${pid()}`, `<h2 class="h">You're the showrunner. Pick a genre.</h2><div class="genregrid">${(S.x.genres || []).map((gn) => { const src = W.thumb(`genre-${gn.art}`); return `<button class="gtile" data-a="genre" data-id="${gn.id}">${src ? `<img src="${src}" alt="">` : ''}<span>${esc(gn.name)}</span></button>`; }).join('')}</div>`];
    },
    BRIEF() {
      const k = S.x.kind; const pl = S.x.pilot;
      const t = { pitch: ['The pitch', 'One sentence. Make the Network want it.', '💡'], traits: ['Build the characters', 'Everyone gets a different question.', '🧑‍🎤'], problem: ['Act one', 'It all goes wrong when...', '💥'], ending: ['The finale', 'How does it end?', '🎬'] }[k] || ['Get ready', '', '📺'];
      return [`BR|${pid()}|${k}`, `${tv(t[0], t[1], t[2])}${memo(S.x.note)}${pl?.title ? `<p class="hint center">${esc(pl.title)}</p>` : ''}`];
    },
    WRITE() {
      const x = S.x; const k = x.kind; const id = `${pid()}_${k}`;
      const timer = `<div class="t big" data-ends="${x.writeEnds}"></div>`;
      if (x.submitted) {
        const left = (x.done || []).filter((p) => !p.done && p.connected).map((p) => esc(p.name));
        return [`WR|sent|${id}|${left.length}`, `<div class="tv"><div class="ico">✅</div><h2 class="h">Sent!</h2><p class="lead">${left.length ? `Still writing: ${left.join(', ')}` : 'Everyone is done.'}</p></div>${left.length ? '<button class="btn red big" data-a="hurry">📣 Hurry them up</button><p class="hint center">Johnny will heckle someone who is still writing.</p>' : ''}`];
      }
      if (k === 'pitch') {
        const f = (x.fields || []).map((fl) => `<label class="pfield"><span>${esc(fl.label)}</span><input data-draft="${id}_${fl.k}" maxlength="70" placeholder="${esc(fl.hint)}" value="${esc(d(`${id}_${fl.k}`))}"></label>`).join('');
        return [`WR|pitch|${id}`, `<div class="wtop"><h2 class="h">Pitch a show</h2>${timer}</div><p class="lead">${esc(x.pilot?.genre?.name || '')}. Fill in the blanks.</p><div class="pitchform">${f}</div><button class="btn primary big" data-a="send" data-kind="pitch" data-id="${id}">Pitch it</button>`];
      }
      if (k === 'traits') {
        const q = (x.questions || []).map((qq, i) => `<label class="pfield"><span>${esc(qq)}</span><input data-draft="${id}_${i}" maxlength="60" value="${esc(d(`${id}_${i}`))}"></label>`).join('');
        return [`WR|traits|${id}`, `<div class="wtop"><h2 class="h">Build the characters</h2>${timer}</div><p class="lead">${esc(x.context?.pitch || '')}</p><div class="pitchform">${q}</div><button class="btn primary big" data-a="send" data-kind="traits" data-id="${id}" data-n="${(x.questions || []).length}">Send</button>`];
      }
      const c = x.context || {};
      const ctx = `<div class="prevline"><b>${esc(c.hero || 'Hero')} vs ${esc(c.rival || 'Rival')}</b>${esc(c.pitch || '')}${k === 'ending' && c.problem ? `<br><br><b>It all went wrong when</b>${esc(c.problem)}` : ''}</div>`;
      return [`WR|beat|${id}`, `<div class="wtop"><h2 class="h">${esc(x.beat?.label || '')}</h2>${timer}</div>${ctx}${memo(x.note)}
        <label class="pfield"><span>${esc(x.beat?.lead || '')}</span><textarea rows="3" maxlength="160" data-draft="${id}" placeholder="${esc(x.beat?.hint || '')}">${esc(d(id))}</textarea></label>
        <button class="btn primary big" data-a="send" data-kind="beat" data-id="${id}">Send it</button>`];
    },
    SHORTLIST() {
      const cards = S.x.cards || []; const left = cards.filter((c) => c.liked === null);
      if (!left.length) return [`SL|done|${pid()}|${S.x.kind}`, tv('Thanks!', `${S.x.rated} of ${S.x.raters} writers done.`, '👍')];
      const c = left[0];
      return [`SL|${pid()}|${S.x.kind}|${c.id}`, `<h2 class="h">Like it?</h2><p class="lead">The top three go to the final vote.</p><div class="slcard">${esc(c.text)}</div><div class="row2"><button class="btn big" data-a="like" data-id="${c.id}" data-like="0">Skip</button><button class="btn primary big" data-a="like" data-id="${c.id}" data-like="1">❤️ Like</button></div><p class="hint center">${cards.length - left.length + 1} of ${cards.length}</p>`];
    },
    VOTE() {
      const x = S.x;
      if (S.step === 'vote') {
        if (x.myVote) return [`VO|done|${pid()}|${x.kind}`, tv('Vote locked in', `${x.voted} of ${x.voters} voted.`, '🗳️')];
        return [`VO|vote|${pid()}|${x.kind}`, `<h2 class="h">Vote for the best one</h2><div class="pick">${x.finalists.map((f, i) => `<button data-a="vote" data-id="${f.id}" ${f.mine ? 'disabled' : ''}><span class="letter">${'ABC'[i]}</span><span>${esc(f.text)}${f.mine ? '<br><small>Yours. Nice try.</small>' : ''}</span></button>`).join('')}</div>`];
      }
      if (S.step === 'result') { const w = x.finalists.find((f) => f.win); const mine = w?.by?.id === S.me.id; return [`VO|res|${pid()}|${x.kind}|${mine}`, tv(mine ? 'Yours won! 🏆' : `${esc(w?.by?.name || 'Someone')} wins this one`, esc(w?.text || ''), mine ? '🏆' : '🎬')]; }
      return [`VO|${S.step}|${pid()}|${x.kind}`, tv('Listen to the finalists', 'Voting opens in a moment.', '👂')];
    },
    TITLE() { const pl = S.x.pilot; return [`TI|${pid()}`, tv(esc(pl.title || ''), esc(pl.pitch || ''), '🎞️')]; },
    CAST() { const pl = S.x.pilot; const c = S.step === 'rival' ? pl.rival : pl.hero; return [`CA|${pid()}|${S.step}|${S.x.myLaughs}`, `<p class="lead center">Meet ${S.step === 'rival' ? 'the rival' : 'our hero'}, ${esc(c.name || '')}</p>${laughBtn(S.x)}`]; },
    SCENE() { const x = S.x; return [`SC|${pid()}|${x.kind}|${x.myLaughs}|${x.own}`, `<p class="lead center">${x.own ? 'Your idea is on screen. Watch them laugh.' : 'Laugh when it\'s funny. It moves the ratings.'}</p>${laughBtn(x, 'Your scene!')}`]; },
    EPISODE() { const se = S.x.pilot?.season; const e = se?.episodes[se.ep] || {}; return [`EP|${pid()}|${S.step}`, tv(esc(e.name || 'Next episode'), S.step === 'previously' ? 'Previously on...' : `Rating needed: ${e.target} out of 10.`, '🎬')]; },
    SCREENING() { const pl = S.x.pilot; return [`SR|${pid()}|${S.step}`, S.step === 'score' ? tv(`${pl.rating} / 10`, `${S.x.target} needed. ${S.x.hit ? 'Renewed!' : pl.season?.cancelled ? 'Cancelled.' : 'Missed it.'}`, S.x.hit ? '📈' : '📉') : tv('The Network is watching', 'Fingers crossed.', '🍿')]; },
    UPFRONTS() { return [`UP|${S.step}`, tv(S.x.lit ? 'Season two!' : 'Cancelled', S.x.lit ? 'You keep your jobs. For now.' : 'Pack your desk.', S.x.lit ? '🎉' : '📦')]; },
    FINAL() {
      const x = S.x;
      if (x.step !== 'board') return [`FI|${x.step}`, tv('And the head writer is...', 'Eyes on the TV.', '🏆')];
      const m = x.mine;
      return [`FI|board|${S.me.vip}`, `<div class="card rankcard"><div class="muted">You finished</div><div class="rank">#${m.rank}</div><div class="muted">of ${x.rows.length} · ${m.score} points</div><div class="ledger"><div><span>Ideas on screen</span><b>${m.wins}</b></div><div><span>Laughs you got</span><b>${m.laughs}</b></div></div></div>
        ${S.me.vip ? '<button class="btn primary big" data-a="again">Play again</button>' : `<p class="lead center">${esc(vipName())} can start another game.</p>`}`];
    },
  };

  // ---------------------------------------------------------------- render
  function render() {
    if (!S.me) return;
    const pl = S.x.pilot;
    const se = pl?.season; const title = pl ? `<b>${esc(pl.title || pl.genre?.name || 'A new show')}</b>${se && se.ep >= 0 ? esc(se.episodes[se.ep]?.name || '') : 'Season set-up'}` : "<b>Writers' Room</b>";
    mount(hud, `<div class="me"><span class="dot" style="--c:${S.me.color}">${esc(W.initials(S.me.name))}</span>${esc(S.me.name)}<small>${S.me.score || 0}</small></div><div class="show">${title}</div>`);
    const fn = R[S.phase]; if (!fn) return;
    const [key, html] = fn();
    if (key === screenKey) return;
    screenKey = key;
    mount(main, html);
    const ta = main.querySelector('textarea, .pitchform input'); if (ta && !('ontouchstart' in window)) { ta.focus({ preventScroll: true }); ta.setSelectionRange(ta.value.length, ta.value.length); }
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
      case 'bust': send('bust', { n: Number(b.dataset.n) }); buzz(10); break;
      case 'genre': send('genre', { id: b.dataset.id }); buzz(20); b.classList.add('on'); break;
      case 'hurry': send('hurry'); buzz([40, 30, 40]); break;
      case 'like': send('like', { id: b.dataset.id, like: b.dataset.like === '1' }); buzz(10); break;
      case 'vote': send('vote', { id: b.dataset.id }); buzz(15); break;
      case 'laugh': send('laugh', {}, (r) => { if (r?.capped) toast('Max laughs for this one.', 'info'); }); buzz(12); b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); break;
      case 'send': {
        const id = b.dataset.id; const kind = b.dataset.kind; const val = (k) => (main.querySelector(`[data-draft="${k}"]`)?.value ?? d(k)).trim();
        let data;
        if (kind === 'pitch') data = { fields: Object.fromEntries(['a', 'who', 'must', 'before'].map((k) => [k, val(`${id}_${k}`)])) };
        else if (kind === 'traits') data = { answers: Array.from({ length: Number(b.dataset.n) }, (_, i) => val(`${id}_${i}`)) };
        else data = { text: val(id) };
        b.disabled = true; send('write', data, (r) => { if (!r?.ok) b.disabled = false; else buzz(20); });
        break;
      }
      default:
    }
  });
})();
