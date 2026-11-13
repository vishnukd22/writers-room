/* RIGGED! The phone: answer, lie, bribe, sabotage. And survive whatever your friends do to your screen. */
(() => {
  const $ = (q) => document.querySelector(q);
  const esc = W.esc;
  const socket = io({ transports: ['websocket', 'polling'] });
  const main = $('#main'); const hud = $('#hud'); const tray = $('#tray'); const picker = $('#picker'); const fxbar = $('#fxbar');
  const params = new URLSearchParams(location.search);
  const TEST = params.has('test');
  const store = TEST ? sessionStorage : localStorage;
  $('#jcode').value = (params.get('room') || store.getItem('rg:code') || '').toUpperCase();
  $('#jname').value = store.getItem('rg:name') || store.getItem('bc:name') || (TEST ? '' : localStorage.getItem('wr:name') || '');
  const buzz = (p) => { try { navigator.vibrate?.(p); } catch (e) { /* no vibration */ } };

  let S = null; let P = null; let joined = null; let lastNote = null;

  // ---------------------------------------------------------------- joining
  let wake = null;
  async function keepAwake() { try { if ('wakeLock' in navigator && !wake && document.visibilityState === 'visible') { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => { wake = null; }); } } catch (e) { wake = null; } }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && joined) { keepAwake(); if (!socket.connected) socket.connect(); } });
  function tryJoin(code, token) {
    const name = $('#jname').value.trim();
    socket.emit('player:join', { code, token, name, game: 'rg' }, (r) => {
      if (r.redirect) { location.href = r.redirect; return; }
      if (r.error) { if (token) { store.removeItem(`rg:token:${code}`); joined = null; } $('#jerr').textContent = r.error; $('#join').hidden = false; $('#app').hidden = true; return; }
      joined = { code: r.code, token: r.token };
      store.setItem(`rg:token:${r.code}`, r.token); store.setItem('rg:code', r.code); store.setItem('rg:name', name);
      if (!TEST) localStorage.setItem('wr:name', name);
      $('#join').hidden = true; $('#app').hidden = false; keepAwake();
    });
  }
  socket.on('connect', () => {
    if (joined) return tryJoin(joined.code, joined.token);
    const code = $('#jcode').value.trim().toUpperCase(); const tok = code && store.getItem(`rg:token:${code}`);
    if (tok) tryJoin(code, tok);
  });
  $('#jform').onsubmit = (e) => { e.preventDefault(); $('#jerr').textContent = ''; const code = $('#jcode').value.trim().toUpperCase(); tryJoin(code, store.getItem(`rg:token:${code}`)); };
  socket.on('moveTo', ({ url }) => { location.href = `${url}${TEST ? '&test' : ''}&auto=1`; });
  if (params.has('auto') && $('#jcode').value && $('#jname').value) setTimeout(() => $('#jform').requestSubmit(), 300);
  socket.on('kicked', () => { joined = null; $('#join').hidden = false; $('#app').hidden = true; $('#jerr').textContent = 'You were removed from the room.'; });
  socket.on('state', (s) => { W.syncClock(s.now); P = S; S = s; window.__S = s; render(); notes(); feel(); });
  function send(type, data = {}, cb) { socket.emit('act', { type, ...data }, (r) => { if (r?.error && !r.stale) toast(r.error, 'bad'); cb?.(r || {}); }); }

  function toast(text, kind = 'info') { const t = document.createElement('div'); t.className = `toast ${kind}`; t.textContent = text; $('#toasts').appendChild(t); setTimeout(() => t.remove(), 3200); if (kind === 'bad') buzz([50, 30, 50]); }
  function notes() {
    const ns = S.me?.notes || []; const topId = ns.length ? ns[ns.length - 1].id : 0;
    if (lastNote === null) { lastNote = topId; return; }
    ns.filter((n) => n.id > lastNote).forEach((n) => toast(n.text, n.kind)); lastNote = Math.max(lastNote, topId);
  }
  function feel() {
    if (!P || !S.me) return;
    const was = `${P.phase}|${P.q?.seq || ''}`; const now = `${S.phase}|${S.q?.seq || ''}`;
    if (was !== now) { closePicker(); numBuf = ''; if (S.q?.kind === 'bomb' && S.q.holder === S.me.id) buzz([120, 60, 120]); else if (S.phase === 'Q' && S.me.can) buzz(40); }
  }

  // ---------------------------------------------------------------- helpers
  const me = () => S.me;
  const P_ = (id) => S.players.find((p) => p.id === id);
  const name = (id) => esc(P_(id)?.name || 'Someone');
  const $$ = (n) => `$${Math.round(n).toLocaleString('en-US')}`;
  const L = 'ABCDEFGHIJ';
  const nf = (v) => Number(v).toLocaleString('en-US', { maximumFractionDigits: 3, useGrouping: !!S.q?.unit });
  const face = (p, size = 'sm') => { if (!p) return ''; if (p.house) return W.img('rg-house') ? `<span class="bust ${size}" style="--c:#D4AF37"><img src="${W.img('rg-house')}" alt=""></span>` : `<span class="bust house ${size}" style="--c:#D4AF37"><b>🎰</b></span>`; return W.bust(p, size); };
  const rule = (k) => S.rules.some((r) => r.k === k);
  const tv = (title, sub = '', ico = '📺') => `<div class="tv"><div class="ico">${ico}</div><h2 class="h">${title}</h2>${sub ? `<p class="lead">${sub}</p>` : ''}</div>`;
  const totals = {};
  const timer = (ends) => { if (!ends) return ''; if (!totals[ends]) totals[ends] = Math.max(1, ends - W.now()); return `<div class="timer"><i data-ends="${ends}" data-total="${totals[ends]}" data-kind="bar"></i></div>`; };
  const SAB = { fog: ['Fog', '🌫️'], shuffle: ['Shuffle', '🔀'], mirror: ['Mirror', '🪞'], tiny: ['Tiny Text', '🐜'], quake: ['Quake', '🌋'], spam: ['Spam', '📨'], freeze: ['Freeze', '🧊'] };
  const SAB_TEXT = { fog: 'Blurs their buttons for 3 seconds', shuffle: 'Buttons jump around for 4 seconds', mirror: 'Text flips backwards for 5 seconds', tiny: 'Everything shrinks for 5 seconds', quake: 'Their screen shakes for 4 seconds', spam: 'A fake fifth answer appears', freeze: 'No tapping for 3 seconds' };
  const BRIBE = { hint: ['Hint', '💡', 'Two wrong answers vanish'], peek: ['Peek', '👀', 'See the most popular pick'], stopwatch: ['Stopwatch', '⏱️', "Halve a rival's next timer"], veto: ['Veto', '✋', 'Cancel the next rule card'], fix: ['Fix the Fact', '🖋️', 'Your lie shows first, in bold'] };
  const sabIcon = (k) => (W.img(`t-rg-sab-${k}`) || W.img(`rg-sab-${k}`) ? `<img src="${W.img(`t-rg-sab-${k}`) || W.img(`rg-sab-${k}`)}" alt="">` : SAB[k][1]);
  const D = { 1: 'Easy', 2: 'Medium', 3: 'Brutal' };

  // ---------------------------------------------------------------- the HUD
  function hudHtml() {
    const m = me(); if (!m) return '';
    const chips = [m.shield ? '🛡️' : '', m.cheer ? '📣' : '', m.vetos ? `✋${m.vetos > 1 ? m.vetos : ''}` : ''].filter(Boolean).join(' ');
    return `<div class="who">${face(m, 'sm')}<b>${esc(m.name)}</b></div><div class="chips">${chips}</div><div class="money">${m.cash === null ? '$???' : $$(m.cash)}</div>`;
  }

  // ---------------------------------------------------------------- screens
  let numBuf = ''; let trayTab = null; let layText = '';
  const R = {
    LOBBY() {
      const m = me(); const n = S.players.length;
      const list = `<div class="faces">${S.players.map((p) => `<div class="fbtn">${face(p)}<span>${esc(p.name)}${p.bot ? ' (bot)' : ''}</span></div>`).join('')}</div>`;
      if (!m.vip) return `${tv("You're in!", 'Watch the TV. The first player starts the show.', '🎩')}${list}`;
      return `<h2 class="h">You're the producer</h2><p class="lead">${n < 2 ? 'You need at least 2 players. Add a bot if you are short.' : n === 2 ? 'Two players: the House joins as a third contestant, and it cheats.' : `${n} players ready.`}</p>
        <button class="btn primary big" data-a="start" ${n < 2 ? 'disabled' : ''}>Start the show</button>
        <div class="lockbar"><button class="btn" data-a="addBot">Add a bot</button>${S.players.some((p) => p.bot) ? '<button class="btn ghost" data-a="removeBots">Remove bots</button>' : ''}</div>
        <label style="display:flex;gap:.6rem;align-items:center;font-weight:700"><input type="checkbox" data-a="passPhone" ${S.settings.passPhone ? 'checked' : ''} style="width:auto"> Allow the "Pass the Phone" rule card</label>${list}`;
    },
    INTRO() { return tv('Lights, camera...', 'Vince Velvet is warming up the crowd. Eyes on the TV.', '🎩'); },
    DOSSIER() {
      const m = me();
      return `<h2 class="h">The Dossier</h2><p class="small">Secret answers about you. They come back later, so be funny.</p>${(m.dossier || []).map((e) => `<div class="dos"><b>${esc(e.q)}</b>${e.a ? `<span class="done">${esc(e.a)}</span>` : `<textarea id="dos-${e.i}" rows="2" maxlength="60" placeholder="Your answer"></textarea><button class="btn primary" data-a="dossier" data-i="${e.i}">Save</button>`}</div>`).join('')}
        <div id="dstat">${(m.dossier || []).every((e) => e.a) ? '<p class="locked-msg">All filed. Look innocent.</p>' : ''}</div>${timer(S.endsAt)}`;
    },
    ROUND() { const x = S.x; return tv(esc(x.lay ? 'Lie About Yourself' : x.name || ''), x.n === 7 ? 'The finale. Eyes on the TV.' : `Round ${x.n}. Eyes on the TV.`, '📺'); },
    DEMO() { return tv({ sab: 'Sabotage is open', remote: 'The Audience Remote', bribe: 'Bribes are open', copy: 'Copying is open' }[S.x.key] || 'New trick', S.x.key === 'remote' ? 'Last place gets free buttons to mess with everyone.' : 'Look at the tray at the bottom of your screen.', { sab: '💣', remote: '📺', bribe: '💰', copy: '📋' }[S.x.key] || '✨'); },
    Q() { const q = S.q; if (!q) return ''; return (QK[q.kind] || (() => ''))(q); },
    WHEEL() {
      const x = S.x; const m = me();
      if (x.step === 'pick' && m.picker) return `<h2 class="h">You pick the new rule</h2><p class="small">You're in last place. Choose wisely, or cruelly.</p><div class="rcards">${x.offer.map((r) => ruleBtn(r)).join('')}</div>${timer(S.endsAt)}`;
      if (x.step === 'veto' && m.canVeto) return `<h2 class="h">Use your Veto?</h2>${ruleBtn(x.cardInfo, false)}<div class="lockbar"><button class="btn hot" data-a="veto" data-use="1">Veto it!</button><button class="btn" data-a="veto">Let it be</button></div>${timer(S.endsAt)}`;
      if (x.step === 'pick') return tv(`${name(x.picker)} is picking a rule`, 'Last place chooses. Pray.', '🎡');
      return tv(x.cardInfo ? esc(x.cardInfo.name) : 'The Rule Wheel', x.cardInfo ? esc(x.cardInfo.text) : '', x.cardInfo?.emoji || '🎡');
    },
    LADDER() { return ladderScreen(); },
    SCORES() { const x = S.x; const m = me(); const pos = x.order.indexOf(m.id) + 1; return S.amnesia ? tv('Standings: classified', 'Amnesia is on. Only Vince knows.', '🌀') : tv(pos === 1 ? "You're in the lead" : `You're in place ${pos} of ${x.order.length}`, x.last === m.id ? 'Last place picks the next rule card. Get ready.' : 'Eyes on the TV.', pos === 1 ? '👑' : x.last === m.id ? '🎡' : '📊'); },
    END() {
      const x = S.x; const m = me(); if (!x.ranks) return tv('Counting the money...', '', '💰');
      const pos = x.ranks.findIndex((r) => r.id === m.id) + 1;
      const mine = x.awards.filter((a) => a.who === m.id);
      return `<h2 class="h">${x.houseWon ? 'The House wins' : pos === 1 ? 'You won!' : `You came ${pos}${['th', 'st', 'nd', 'rd'][pos % 10 > 3 || [11, 12, 13].includes(pos) ? 0 : pos % 10]}`}</h2>${mine.map((a) => `<div class="peek">🏆 ${esc(a.title)}: ${esc(a.text)}</div>`).join('')}
        <div style="display:grid;gap:.4rem">${x.ranks.map((r, i) => `<div class="rk ${r.id === m.id ? 'me' : ''}"><span class="n">${i + 1}</span>${face(r)}<span>${esc(r.name)}</span><span>${$$(r.cash)}</span></div>`).join('')}</div>
        ${m.vip && S.step === 'ranks' ? '<button class="btn primary big" data-a="again">Play again</button><button class="btn ghost" data-a="menu">Back to the game menu</button>' : ''}`;
    },
  };
  const ruleBtn = (r, act = true) => `<button class="rcard" ${act ? `data-a="wheel" data-k="${r.k}"` : 'disabled'}>${W.img(`t-rg-card-${r.k}`) ? `<img src="${W.img(`t-rg-card-${r.k}`)}" alt="">` : `<span class="em">${r.emoji}</span>`}<span><span class="type">${r.type === 'lasting' ? 'Lasting' : 'Instant'}</span><br><b>${esc(r.name)}</b></span><p>${esc(r.text)}</p></button>`;

  // header bits every question shares
  function qHead(q, label) {
    const m = me();
    const pass = q.pass && m.passTo ? `<div class="pass">📱 Pass the Phone! Hand this phone to ${esc(m.passTo)}. Whoever holds it answers for ${esc(m.name)}.</div>` : '';
    return `${pass}<div class="qmeta">${label ? `<span class="chip hot">${label}</span>` : ''}${q.cat ? `<span class="chip gold">${esc(q.cat)}</span>` : ''}${q.dt ? '<span class="chip gold">x2</span>' : ''}<span class="secs" data-ends="${m.ends || q.ends}"></span></div>`;
  }
  const extras = () => { const m = me(); const out = []; if (m.rival) out.push(`<div class="rival">🐈 Copycat: ${esc(m.rival.name)} ${m.rival.v === null ? "hasn't picked yet" : `is on ${typeof m.rival.v === 'number' ? L[m.rival.v] || m.rival.v : S.q.kind === 'who' ? name(m.rival.v) : optLetter(m.rival.v)}`}</div>`); if (m.peek) out.push(`<div class="peek">👀 Most popular so far: ${m.peek.v === null ? 'nobody has picked yet' : S.q.kind === 'who' ? name(m.peek.v) : typeof m.peek.v === 'number' ? L[m.peek.v] : optLetter(m.peek.v)}${m.peek.n ? ` (${m.peek.n})` : ''}</div>`); return out.join(''); };
  const optLetter = (id) => { const i = (S.q.opts || []).findIndex((o) => o.id === id); return i >= 0 ? L[i] || i + 1 : '?'; };
  const lockBar = (pk) => (pk && !pk.locked ? '<button class="btn primary big" data-a="lock">Lock it in</button>' : '');
  const waitMsg = (pk) => (pk?.locked ? `<p class="locked-msg">${pk.copied ? `Copied ${esc(pk.copied)}. ` : ''}Locked in. Eyes on the TV.</p>` : '');
  const QK = {
    mc(q) {
      const m = me();
      if (S.step === 'reveal') { const rv = S.rev; const mine = rv?.picks?.[m.id]; const right = mine === rv?.correct; const dl = rv?.deltas?.[m.id] || 0; return tv(mine === undefined ? 'No answer!' : right ? 'Correct!' : 'Wrong!', `${dl ? `${dl > 0 ? '+' : '-'}${$$(Math.abs(dl))}` : 'No money this time.'} The answer was ${L[rv?.correct]}: ${esc(q.answers[rv?.correct] || '')}.`, right ? '🎉' : '😬'); }
      if (!m.can) return tv('Watch the TV', '', '📺');
      const pk = m.pick; const blind = rule('blind');
      const opts = [...q.answers]; if (m.spam) opts.push(m.spam);
      const btns = opts.map((a, i) => `<button class="ab k${i} ${pk?.v === i ? 'sel' : ''} ${(m.hint || []).includes(i) ? 'gone' : ''} ${blind ? 'blind' : ''} ${pk?.locked ? 'locked' : ''}" data-a="pick" data-v="${i}" ${pk?.locked ? 'disabled' : ''}><span class="l">${L[i]}</span><span>${esc(a)}</span></button>`).join('');
      return `${qHead(q)}<p class="qtxt">${blind ? 'Blind Buttons! Read the answers on the TV.' : esc(q.text)}</p>${timer(m.ends)}<div id="xtra">${extras()}</div><div class="btns">${btns}</div>${lockBar(pk)}${waitMsg(pk)}`;
    },
    write(q) {
      const m = me();
      if (!m.can) return tv('Everyone is lying', 'Watch the TV.', '🤥');
      if (m.lie) return `${qHead(q, 'Lie Detector')}<p class="fact">${esc(q.text).replace('___', '<u>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</u>')}</p><div class="mine">Your lie: <b>${esc(m.lie)}</b></div><p class="locked-msg">Lovely. Now look innocent.</p>`;
      return `${qHead(q, 'Lie Detector')}<p class="fact">${esc(q.text).replace('___', '<u>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</u>')}</p>${timer(m.ends)}<input id="lie" maxlength="40" placeholder="A believable fake answer" autocomplete="off"><button class="btn primary big" data-a="lie">Submit my lie</button><p class="small">Fool someone: +$300 each. If you type the real answer by accident, I'll tell you.</p>`;
    },
    vote(q) {
      const m = me();
      if (S.step === 'reveal') { const dl = S.rev?.deltas?.[m.id]; return tv(S.x?.at && S.rev?.groups?.find((g) => g.id === S.x.at)?.truth ? 'The truth is out' : 'Who fell for what?', dl ? `${dl > 0 ? '+' : '-'}${$$(Math.abs(dl))} so far` : 'Watch the TV.', '🕵️'); }
      if (!m.can) return tv('Watch the TV', '', '📺');
      const pk = m.pick; const blind = rule('blind'); const own = new Set(m.ownOpts || []);
      const btns = q.opts.map((o, i) => `<button class="ab k${i % 4} ${pk?.v === o.id ? 'sel' : ''} ${own.has(o.id) ? 'gone' : ''} ${blind ? 'blind' : ''}" data-a="pick" data-v="${o.id}" ${pk?.locked || own.has(o.id) ? 'disabled' : ''}><span class="l">${L[i] || i + 1}</span><span class="${o.bold ? 'bold' : ''}">${esc(o.text)}${own.has(o.id) ? ' (yours)' : ''}</span></button>`).join('');
      return `${qHead(q, 'Find the truth')}<p class="fact">${esc(q.text).replace('___', '<u>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</u>')}</p>${timer(m.ends)}<div id="xtra">${extras()}</div><div class="btns">${btns}</div>${lockBar(pk)}${waitMsg(pk)}`;
    },
    who(q) {
      const m = me();
      if (S.step === 'reveal') { const rv = S.rev; const right = rv?.picks?.[m.id] === rv?.author; return tv(rv.author === m.id ? 'They know it was you' : right ? 'Got it!' : 'Wrong person!', `It was ${name(rv.author)}.`, rv.author === m.id ? '🙈' : right ? '🎯' : '🤷'); }
      if (!m.can) return `${tv("That's yours!", 'Keep a straight face. You get $100 for everyone who guesses wrong.', '🤫')}`;
      const pk = m.pick;
      return `${qHead(q, 'Who wrote this?')}<div class="dos"><b>${esc(q.text)}</b><span style="font-size:1.25rem;font-weight:700">"${esc(q.answer)}"</span></div>${timer(m.ends)}<div id="xtra">${extras()}</div><div class="faces">${q.choices.filter((id) => id !== m.id).map((id) => `<button class="fbtn ${pk?.v === id ? 'sel' : ''}" data-a="pick" data-v="${id}" ${pk?.locked ? 'disabled' : ''}>${face(P_(id))}<span>${name(id)}</span></button>`).join('')}</div>${lockBar(pk)}${waitMsg(pk)}`;
    },
    laywrite(q) {
      const m = me(); const l = m.lay;
      if (!m.can || !l) return tv('Everyone is writing', 'Watch the TV.', '✍️');
      if (l.fake) return `<h2 class="h">Lie About Yourself</h2><div class="dos"><b>${esc(l.q)}</b><span>Real: "${esc(l.a)}"</span><span>Fake: "${esc(l.fake)}"</span></div><p class="locked-msg">Done. Your rival has to pick the real one.</p>`;
      return `<h2 class="h">Lie About Yourself</h2><div class="dos"><b>${esc(l.q)}</b><span>Your real answer: "${esc(l.a)}"</span></div>${timer(m.ends)}<input id="fake" maxlength="60" placeholder="A fake answer that sounds like you"><button class="btn primary big" data-a="fake">Submit</button><p class="small">+$100 for every rival who picks your fake.</p>`;
    },
    lay(q) {
      const m = me();
      if (S.step === 'reveal') { const rv = S.rev; const right = rv?.picks?.[m.id] === rv?.real; return tv(q.owner === m.id ? 'Exposed!' : right ? 'Got it!' : 'Fooled!', `The real one was ${L[rv.real]}: "${esc(q.pair[rv.real])}"`, right ? '🎯' : '🙃'); }
      if (!m.can) return tv("That's yours!", 'Keep a straight face.', '🤫');
      const pk = m.pick;
      return `${qHead(q, `Which did ${name(q.owner)} really write?`)}<p class="qtxt">${esc(q.text)}</p>${timer(m.ends)}<div id="xtra">${extras()}</div><div class="btns">${q.pair.map((a, i) => `<button class="ab k${i} ${pk?.v === i ? 'sel' : ''}" data-a="pick" data-v="${i}" ${pk?.locked ? 'disabled' : ''}><span class="l">${L[i]}</span><span>"${esc(a)}"</span></button>`).join('')}</div>${lockBar(pk)}${waitMsg(pk)}`;
    },
    bomb(q) {
      const m = me();
      if (S.step === 'boom') return tv(q.boom === m.id ? 'BOOM! That was you.' : `BOOM! ${name(q.boom)} blew up`, q.boom === m.id ? '-$500. Ouch.' : `It was ${q.answer ? 'TRUE' : 'FALSE'}.`, '💥');
      if (S.step === 'start') return tv(q.holder === m.id ? 'You have the bomb!' : `${name(q.holder)} has the bomb`, 'Answer true or false. Right: pass it on, +$200. Wrong: -$500.', '💣');
      if (q.holder !== m.id) return `${tv(`${name(q.holder)} has the bomb`, 'Sabotage them from the tray below. Quick.', '💣')}`;
      if (!m.can) return tv('Passed!', '', '😅');
      return `<div class="bombme"><div class="bm">${W.img('rg-bomb') ? `<img src="${W.img('rg-bomb')}" alt="" style="width:9rem;height:9rem;object-fit:contain">` : '💣'}</div><span class="secs" data-ends="${m.ends}" style="font-size:2.4rem;margin:0 auto"></span></div><p class="qtxt" style="font-size:1.35rem;text-align:center">${esc(q.text)}</p>${timer(m.ends)}<div class="tfrow"><button class="ab t" data-a="pick" data-v="true">TRUE</button><button class="ab f" data-a="pick" data-v="false">FALSE</button></div>`;
    },
    num(q) {
      const m = me();
      if (S.step === 'reveal') { const rv = S.rev; const mine = rv.list.find((r) => r.id === m.id); const dl = rv.deltas?.[m.id] || 0; return tv(rv.closest.includes(m.id) ? 'Closest!' : rv.furthest.includes(m.id) ? 'Most wrong in the room!' : `The answer: ${nf(rv.answer)}`, `${mine ? `You said ${nf(mine.v)}. ` : ''}${dl ? `${dl > 0 ? '+' : '-'}${$$(Math.abs(dl))}` : ''}`, rv.closest.includes(m.id) ? '🎯' : '📏'); }
      if (!m.can) return tv('Watch the TV', '', '📺');
      const pk = m.pick;
      if (pk?.locked) return `${qHead(q, 'Closest Number')}<p class="qtxt">${esc(q.text)}</p><div class="mine">Your guess: <b>${nf(pk.v)}</b></div>${waitMsg(pk)}`;
      return `${qHead(q, 'Closest Number')}<p class="qtxt">${esc(q.text)}</p>${timer(m.ends)}<div id="xtra">${extras()}</div><div class="numshow" id="numshow">${numBuf ? esc(Number(numBuf.replace(/\.$/, '') || 0).toLocaleString('en-US', { maximumFractionDigits: 3, useGrouping: !!S.q?.unit }) + (numBuf.endsWith('.') ? '.' : '')) : '&nbsp;'}</div>
        <div class="pad">${['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'].map((k) => `<button data-a="key" data-k="${k}">${k}</button>`).join('')}</div><button class="btn primary big" data-a="numgo">Lock in my guess</button>`;
    },
    bet(q) {
      const m = me();
      if (!m.can) return tv('Side bets are on', 'Watch the TV.', '🎲');
      const pk = m.pick;
      if (pk?.locked) return tv(pk.v ? `You bet on ${name(pk.v)}` : 'No bet', 'Fingers crossed.', '🎲');
      return `${qHead(q, 'Side bet')}<p class="qtxt">Bet $100: who will be the <u>furthest off</u>? A win pays $400.</p>${timer(m.ends)}<div class="faces">${S.players.map((p) => `<button class="fbtn" data-a="bet" data-v="${p.id}">${face(p)}<span>${p.id === m.id ? 'Me' : esc(p.name)}</span></button>`).join('')}</div><button class="btn ghost" data-a="bet" data-v="">No bet</button>`;
    },
  };

  function ladderScreen() {
    const m = me(); const x = S.x;
    if (x.step !== 'climb') return tv(x.winner ? (x.winner === m.id ? 'You reached the top!' : `${name(x.winner)} reached the top`) : "Time's up!", 'Eyes on the TV.', x.winner === m.id ? '🏆' : '🪜');
    const rungs = `<div class="rungs">${Array.from({ length: x.rungs }, (_, i) => `<i class="${i < m.rung ? 'on' : ''}"></i>`).join('')}</div>`;
    const votes = (m.voteFor || []).slice(0, 1).map((v) => `<div class="vote"><b>Pick ${esc(v.name)}'s next category</b><div class="row">${v.offer.map((o, i) => `<button class="d${o.d}" data-a="catvote" data-for="${v.for}" data-i="${i}">${esc(o.cat)}<small>${D[o.d]}</small></button>`).join('')}</div></div>`).join('');
    let body;
    if (m.wait) body = tv('The room is picking your category', 'Easy, medium or brutal. Guess which.', '🗳️');
    else if (m.lq) {
      const locked = m.lock > W.now();
      body = `<div class="qmeta"><span class="chip gold">${esc(m.lq.cat)}</span><span class="chip ${m.lq.d === 3 ? 'hot' : ''}">${D[m.lq.d]}</span></div><p class="qtxt">${esc(m.lq.text)}</p>${locked ? `<p class="lockover">🔒 Locked <span data-ends="${m.lock}"></span>s</p>` : ''}<div class="btns">${m.lq.answers.map((a, i) => `<button class="ab k${i}" data-a="climb" data-i="${i}" data-seq="${m.lq.seq}" ${locked ? 'disabled' : ''}><span class="l">${L[i]}</span><span>${esc(a)}</span></button>`).join('')}</div>`;
    } else body = tv('Climbing...', '', '🪜');
    const shop = `<div class="shop"><button class="btn" data-a="lift" ${m.lift ? 'disabled' : ''}>🛗 Lift ${$$(m.costs.lift)}<br><small>up one rung</small></button><button class="btn" data-a="grease" ${m.grease ? 'disabled' : ''}>🧈 Grease ${$$(m.costs.grease)}<br><small>knock a rival down</small></button></div>`;
    const remote = m.remote ? `<button class="btn hot big" data-a="lboo" ${m.remote.ready ? '' : 'disabled'}>👎 Boo the leader: freeze them for 5 seconds</button>` : '';
    return `${votes}<div class="qmeta"><span class="chip">Rung ${m.rung} of ${x.rungs}</span><span class="secs" data-ends="${x.ends}"></span></div>${rungs}${body}${shop}${remote}`;
  }

  // ---------------------------------------------------------------- the tray of dirty tricks
  function trayHtml() {
    const m = me(); const t = m?.tray;
    if (!t || S.phase !== 'Q' || !S.q?.open) return '';
    const tabs = [];
    if (t.sab) tabs.push(['sab', '💣 Sabotage']);
    if (t.bribes && t.bribes.length) tabs.push(['bribe', '💰 Bribe']);
    if (t.copy) tabs.push(['copy', '📋 Copy']);
    if (t.remote) tabs.push(['remote', '📺 Remote']);
    if (!tabs.length) return '';
    if (!tabs.some(([k]) => k === trayTab)) trayTab = tabs[0][0];
    let body = '';
    if (trayTab === 'sab') {
      const s = t.sab; const anyTarget = s.targets.some((x) => x.ok);
      body = `<div class="tricks"><button class="trick" data-a="shield" ${s.shield.ok ? '' : 'disabled'}><span class="e">🛡️</span>${s.shield.have ? 'Shielded' : 'Shield'}<small>${$$(s.shield.cost)}</small></button>${s.list.map((x) => `<button class="trick" data-a="sab" data-k="${x.k}" ${s.used || !anyTarget || m.cash < x.cost ? 'disabled' : ''}><span class="e">${sabIcon(x.k)}</span>${SAB[x.k][0]}<small>${$$(x.cost)}</small></button>`).join('')}</div><p class="trayhint">${s.used ? 'One attack per question. Used.' : anyTarget ? 'Pick a trick, then tap a face.' : s.targets[0]?.why || 'Nobody to hit right now.'}</p>`;
    }
    if (trayTab === 'bribe') body = `<div class="tricks">${t.bribes.map((b) => `<button class="trick ${b.used ? 'used' : ''}" data-a="bribe" data-k="${b.k}" data-t="${b.target ? 1 : ''}" ${b.used || m.cash < b.cost ? 'disabled' : ''}><span class="e">${BRIBE[b.k][1]}</span>${BRIBE[b.k][0]}<small>${$$(b.cost)}</small></button>`).join('')}</div><p class="trayhint">Secret. Vince will drop a hint, though.</p>`;
    if (trayTab === 'copy') body = `<div class="tricks"><button class="trick" data-a="copyb" ${t.copy.targets.length && m.cash >= t.copy.blind ? '' : 'disabled'}><span class="e">🙈</span>Blind<small>${$$(t.copy.blind)}</small></button><button class="trick" data-a="copyn" ${t.copy.targets.length && m.cash >= t.copy.name ? '' : 'disabled'}><span class="e">👉</span>Pick who<small>${$$(t.copy.name)}</small></button></div><p class="trayhint">${t.copy.targets.length ? `${t.copy.targets.length} locked in so far. They get $100.` : 'Nobody has locked in yet.'}</p>`;
    if (trayTab === 'remote') { const r = t.remote; body = `<div class="tricks">${r.boo ? `<button class="trick" data-a="rboo" ${r.used ? 'disabled' : ''}><span class="e">👎</span>Boo<small>-5 seconds</small></button>` : ''}<button class="trick" data-a="rcheer" ${r.used ? 'disabled' : ''}><span class="e">📣</span>Cheer<small>x2 next win</small></button><button class="trick" data-a="rspin" ${r.used || !r.spin ? 'disabled' : ''}><span class="e">🎡</span>Spin<small>new rule</small></button><button class="trick" data-a="rheckle" ${r.used ? 'disabled' : ''}><span class="e">🗯️</span>Heckle<small>Vince says it</small></button></div><p class="trayhint">${r.used ? 'Used for this question.' : "You're in last place. One free button per question."}</p>`; }
    return `<div class="tabs">${tabs.map(([k, l]) => `<button class="${k === trayTab ? 'on' : ''} ${k === 'remote' ? 'remote' : ''}" data-tab="${k}">${l}</button>`).join('')}</div>${body}`;
  }

  // ---------------------------------------------------------------- picker: tap a face
  let pickFn = null;
  function openPicker(title, ids, fn, extra = '') {
    pickFn = fn;
    picker.innerHTML = `<div class="pk"><h3>${title}</h3>${extra}<div class="faces">${ids.map((x) => `<button class="fbtn" data-pick="${x.id}" ${x.ok === false ? 'disabled' : ''}>${face(P_(x.id))}<span>${x.id === me().id ? 'Me' : name(x.id)}${x.why && x.ok === false ? `<br><small style="font-weight:600">${esc(x.why)}</small>` : ''}</span></button>`).join('')}</div><button class="btn ghost" data-pick="">Cancel</button></div>`;
    picker.hidden = false;
  }
  function closePicker() { picker.hidden = true; picker.innerHTML = ''; pickFn = null; }
  picker.addEventListener('click', (e) => {
    const h = e.target.closest('[data-heck]'); if (h) { picker.querySelectorAll('[data-heck]').forEach((b) => b.classList.toggle('sel', b === h)); picker.dataset.h = h.dataset.heck; return; }
    const b = e.target.closest('[data-pick]'); if (!b && e.target !== picker) return;
    const id = b ? b.dataset.pick : ''; const fn = pickFn; const hh = picker.dataset.h; closePicker(); delete picker.dataset.h;
    if (id && fn) fn(id, hh);
  });

  // ---------------------------------------------------------------- taps
  document.addEventListener('click', (e) => {
    const tab = e.target.closest('[data-tab]'); if (tab) { trayTab = tab.dataset.tab; mount(tray, trayHtml()); return; }
    const b = e.target.closest('[data-a]'); if (!b || b.disabled) return;
    const a = b.dataset.a; const m = me(); const q = S.q;
    const rivals = () => S.players.filter((p) => p.id !== m.id).map((p) => ({ id: p.id }));
    switch (a) {
      case 'start': send('start'); break;
      case 'addBot': send('addBot'); break;
      case 'removeBots': send('removeBots'); break;
      case 'again': send('again'); break;
      case 'menu': send('menu'); break;
      case 'dossier': { const el = $(`#dos-${b.dataset.i}`); const t = el?.value.trim(); if (!t) { toast('Write something first!', 'bad'); return; } send('dossier', { i: Number(b.dataset.i), text: t }); break; }
      case 'pick': {
        let v = b.dataset.v; if (q.kind === 'mc' || q.kind === 'lay') v = Number(v); if (q.kind === 'bomb') v = v === 'true';
        const lock = q.kind === 'bomb' || q.kind === 'who' || (q.kind !== 'mc' && q.kind !== 'vote') || (m.pick && m.pick.v === v);
        send('answer', { v, lock, seq: q.seq }); buzz(15); break;
      }
      case 'lock': send('lock', { seq: q.seq }); buzz(25); break;
      case 'lie': { const t = $('#lie')?.value.trim(); if (!t) { toast('Write a lie first!', 'bad'); return; } send('lie', { text: t }); break; }
      case 'fake': { const t = $('#fake')?.value.trim(); if (!t) { toast('Write something first!', 'bad'); return; } send('fake', { text: t }); break; }
      case 'key': { const k = b.dataset.k; if (k === '⌫') numBuf = numBuf.slice(0, -1); else if (k === '.') { if (!numBuf.includes('.')) numBuf = (numBuf || '0') + '.'; } else if (numBuf.replace('.', '').length < 12) numBuf = numBuf === '0' ? k : numBuf + k; const el = $('#numshow'); if (el) el.innerHTML = numBuf ? esc(Number(numBuf.replace(/\.$/, '') || 0).toLocaleString('en-US', { maximumFractionDigits: 3, useGrouping: !!S.q?.unit }) + (numBuf.endsWith('.') ? '.' : '')) : '&nbsp;'; buzz(8); break; }
      case 'numgo': if (!numBuf) { toast('Type a number first!', 'bad'); return; } send('answer', { v: Number(numBuf), seq: q.seq }); break;
      case 'bet': send('answer', { v: b.dataset.v || null, seq: q.seq }); break;
      case 'wheel': send('wheel', { k: b.dataset.k }); break;
      case 'veto': send('veto', { use: !!b.dataset.use }); break;
      case 'passPhone': send('setting', { k: 'passPhone', v: b.checked }); break;
      case 'shield': send('shield'); break;
      case 'sab': { const k = b.dataset.k; const t = m.tray.sab.targets; openPicker(`${SAB[k][1]} ${SAB[k][0]}: ${SAB_TEXT[k]}. Who?`, t, (id) => send('sab', { k, target: id }, (r) => { if (r.ok) buzz([20, 20, 60]); })); break; }
      case 'bribe': { const k = b.dataset.k; const done = (r) => { if (r.ok) toast(`${BRIBE[k][0]} bought. ${BRIBE[k][2]}.`, 'good'); }; if (b.dataset.t) openPicker(`${BRIBE[k][1]} ${BRIBE[k][0]}: whose next timer gets halved?`, rivals(), (id) => send('bribe', { k, target: id }, done)); else send('bribe', { k }, done); break; }
      case 'copyb': send('copy', { mode: 'blind' }, (r) => { if (r.ok) toast('Copied someone. Fingers crossed.', 'good'); }); break;
      case 'copyn': openPicker('Who do you want to copy?', m.tray.copy.targets.map((id) => ({ id })), (id) => send('copy', { mode: 'name', target: id }, (r) => { if (r.ok) toast(`Copied ${P_(id)?.name}.`, 'good'); })); break;
      case 'rboo': openPicker('👎 Boo someone: they lose 5 seconds', q.eligible.filter((id) => id !== m.id).map((id) => ({ id })), (id) => send('remote', { k: 'boo', target: id })); break;
      case 'rcheer': openPicker('📣 Cheer someone: their next right answer pays double', S.players.map((p) => ({ id: p.id })), (id) => send('remote', { k: 'cheer', target: id })); break;
      case 'rspin': send('remote', { k: 'spin' }); break;
      case 'rheckle': { const hk = m.tray.remote.heckles; openPicker('🗯️ Pick a heckle, then a rival', rivals(), (id, h) => send('remote', { k: 'heckle', target: id, h: Number(h ?? 0) }), `<div class="heck">${hk.map((t, i) => `<button data-heck="${i}" class="${i === 0 ? 'sel' : ''}">${esc(t)}</button>`).join('')}</div>`); picker.dataset.h = '0'; break; }
      case 'climb': send('ladder', { i: Number(b.dataset.i), seq: Number(b.dataset.seq) }, (r) => { if (r.ok) buzz(15); }); break;
      case 'catvote': send('catvote', { for: b.dataset.for, i: Number(b.dataset.i) }); break;
      case 'lift': send('lift'); break;
      case 'grease': openPicker('🧈 Grease whose rung?', rivals(), (id) => send('grease', { target: id })); break;
      case 'lboo': { const lead = [...S.x.climbers].filter((c) => c.id !== m.id).sort((x, y) => y.rung - x.rung)[0]; openPicker('👎 Boo who? (5-second freeze)', rivals().map((r) => ({ ...r })), (id) => send('boo', { target: id })); if (lead) picker.querySelector(`[data-pick="${lead.id}"]`)?.classList.add('sel'); break; }
      default: break;
    }
  });
  document.addEventListener('keydown', (e) => { if (e.key !== 'Enter') return; if (e.target.id === 'lie') $('[data-a="lie"]')?.click(); if (e.target.id === 'fake') $('[data-a="fake"]')?.click(); });

  // ---------------------------------------------------------------- what your friends did to your screen
  const seenFx = new Set(); let fxTimer = null; let shuffleTimer = null;
  function applyFx() {
    const m = me(); const now = W.now();
    const live = (m?.fx || []).filter((f) => f.until > now && f.k !== 'spam');
    ['fog', 'shuffle', 'mirror', 'tiny', 'quake', 'freeze'].forEach((k) => document.body.classList.toggle(`fx-${k}`, live.some((f) => f.k === k)));
    for (const f of m?.fx || []) if (!seenFx.has(f.id)) { seenFx.add(f.id); if (f.until > now || f.k === 'spam') { buzz([60, 40, 120]); fxbar.innerHTML = `<div class="fxb">${f.bounced ? '🛡️ Bounced! Your own' : `💥 ${esc(f.by)} hit you:`} ${SAB[f.k]?.[1] || ''} ${SAB[f.k]?.[0] || f.k}</div>`; clearTimeout(applyFx.bar); applyFx.bar = setTimeout(() => { fxbar.innerHTML = ''; }, 2600); } }
    clearTimeout(fxTimer);
    if (live.length) fxTimer = setTimeout(applyFx, Math.max(60, Math.min(...live.map((f) => f.until)) - now + 30));
    const shuffling = live.some((f) => f.k === 'shuffle');
    if (shuffling && !shuffleTimer) { const go = () => { document.querySelectorAll('.btns, .pad, .tfrow, .faces').forEach((c) => [...c.children].forEach((n) => { n.style.order = Math.floor(Math.random() * 12); })); }; go(); shuffleTimer = setInterval(go, 1000); }
    if (!shuffling && shuffleTimer) { clearInterval(shuffleTimer); shuffleTimer = null; document.querySelectorAll('.btns > *, .pad > *, .tfrow > *, .faces > *').forEach((n) => { n.style.order = ''; }); }
  }

  // ---------------------------------------------------------------- render
  function skeleton(root) { const c = root.cloneNode(true); c.querySelectorAll('[id]').forEach((n) => { if (!/^(lie|fake|dos-\d)$/.test(n.id)) n.innerHTML = ''; }); c.querySelectorAll('input,textarea').forEach((n) => n.removeAttribute('value')); return c.innerHTML; }
  let lastKey = '';
  function render() {
    if (!S || !S.me) return;
    mount(hud, hudHtml());
    const html = (R[S.phase] || (() => ''))();
    const key = `${S.phase}|${S.step}|${S.q?.kind || ''}|${S.q?.seq || ''}|${S.x?.step || ''}|${S.x?.at || ''}`;
    // keep whatever someone is typing
    const keep = {}; main.querySelectorAll('input[id], textarea[id]').forEach((el) => { keep[el.id] = { v: el.value, f: document.activeElement === el }; });
    if (key !== lastKey) { lastKey = key; main.innerHTML = html; main.__html = html; main.__skel = skeleton(main); main.classList.remove('in'); void main.offsetWidth; main.classList.add('in'); }
    else if (main.__html !== html) {
      const t = document.createElement('div'); t.innerHTML = html; const skel = skeleton(t);
      if (skel !== main.__skel) main.innerHTML = html;
      else t.querySelectorAll('[id]').forEach((n) => { if (/^(lie|fake|dos-\d)$/.test(n.id)) return; const el = main.querySelector(`#${n.id}`); if (el) mount(el, n.innerHTML); });
      main.__html = html; main.__skel = skel;
    }
    Object.entries(keep).forEach(([id, k]) => { const el = main.querySelector(`#${CSS.escape(id)}`); if (el && !el.value) { el.value = k.v; if (k.f) el.focus(); } });
    mount(tray, trayHtml());
    applyFx();
  }
})();
