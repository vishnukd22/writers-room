/* RIGGED! The phone: answer, lie, bet, race. One sabotage for the whole game. Survive whatever your friends do to your screen. */
(() => {
  const $ = (q) => document.querySelector(q);
  const esc = W.esc;
  const socket = io({ transports: ['websocket', 'polling'] });
  window.__gnSocket = socket;
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
    const was = `${P.phase}|${P.q?.seq || ''}|${P.race?.n || ''}`; const now = `${S.phase}|${S.q?.seq || ''}|${S.race?.n || ''}`;
    if (was !== now) { closePicker(); if (S.q?.kind === 'bomb' && S.q.holder === S.me.id) buzz([120, 60, 120]); else if (S.me.can || S.me.race?.can) buzz(40); }
  }

  // ---------------------------------------------------------------- helpers
  const me = () => S.me;
  const P_ = (id) => S.players.find((p) => p.id === id);
  const name = (id) => esc(P_(id)?.name || 'Someone');
  const $$ = (n) => `$${Math.round(n).toLocaleString('en-US')}`;
  const L = 'ABCDEFGHIJ';
  const face = (p, size = 'sm') => { if (!p) return ''; if (p.house) return W.img('rg-house') ? `<span class="bust ${size}" style="--c:#D4AF37"><img src="${W.img('rg-house')}" alt=""></span>` : `<span class="bust house ${size}" style="--c:#D4AF37"><b>🎰</b></span>`; return W.bust(p, size); };
  const rule = (k) => S.rule?.k === k;
  const tv = (title, sub = '', ico = '📺') => `<div class="tv"><div class="ico">${ico}</div><h2 class="h">${title}</h2>${sub ? `<p class="lead">${sub}</p>` : ''}</div>`;
  const totals = {};
  const timer = (ends) => { if (!ends) return ''; if (!totals[ends]) totals[ends] = Math.max(1, ends - W.now()); return `<div class="timer"><i data-ends="${ends}" data-total="${totals[ends]}" data-kind="bar"></i></div>`; };
  const SAB = { fog: ['Fog', '🌫️'], shuffle: ['Shuffle', '🔀'], mirror: ['Mirror', '🪞'], tiny: ['Tiny Text', '🐜'], quake: ['Quake', '🌋'], freeze: ['Freeze', '🧊'] };
  const signed = (dl) => (dl ? `${dl > 0 ? '+' : '-'}${$$(Math.abs(dl))}` : '');
  const ord = (n) => `${n}${['th', 'st', 'nd', 'rd'][n % 10 > 3 || [11, 12, 13].includes(n % 100) ? 0 : n % 10]}`;

  // ---------------------------------------------------------------- the HUD
  function hudHtml() {
    const m = me(); if (!m) return '';
    const r = S.rule ? `<span class="rulechip" title="${esc(S.rule.text)}">${S.rule.emoji} ${esc(S.rule.name)}</span>` : '';
    const right = S.phase === 'FINALE' ? `${P_(m.id)?.pos ?? 0} of ${S.race?.len || 15}` : $$(m.cash);
    return `<div class="who">${face(m, 'sm')}<b>${esc(m.name)}</b></div><div class="chips">${r}</div><div class="money">${right}</div>`;
  }

  // ---------------------------------------------------------------- screens
  const R = {
    LOBBY() {
      const m = me(); const n = S.players.length;
      const list = `<div class="faces">${S.players.map((p) => `<div class="fbtn">${face(p)}<span>${esc(p.name)}${p.bot ? ' (bot)' : ''}</span></div>`).join('')}</div>`;
      if (!m.vip) return `${tv("You're in!", 'Watch the TV. The first player starts the show.', '🎩')}${list}`;
      return `<h2 class="h">You're the producer</h2><p class="lead">${n < 2 ? 'You need at least 2 players. Add a bot if you are short.' : n === 2 ? 'Two players: the House joins as a third contestant, and it cheats.' : `${n} players ready.`} About 20 minutes.</p>
        <button class="btn primary big" data-a="start" ${n < 2 ? 'disabled' : ''}>Start the show</button>
        <div class="lockbar"><button class="btn" data-a="addBot">Add a bot</button>${S.players.some((p) => p.bot) ? '<button class="btn ghost" data-a="removeBots">Remove bots</button>' : ''}</div>${list}`;
    },
    INTRO() { return tv('Lights, camera...', 'Vince Velvet is warming up the crowd. Eyes on the TV.', '🎩'); },
    DOSSIER() {
      const m = me();
      return `<h2 class="h">The Dossier</h2><p class="small">Three secret answers about you. Vince will read them out later, so be funny.</p>${(m.dossier || []).map((e) => `<div class="dos"><b>${esc(e.q)}</b>${e.a ? `<span class="done">${esc(e.a)}</span>` : `<textarea id="dos-${e.i}" rows="2" maxlength="60" placeholder="Your answer"></textarea><button class="btn primary" data-a="dossier" data-i="${e.i}">Save</button>`}</div>`).join('')}
        <div id="dstat">${(m.dossier || []).every((e) => e.a) ? '<p class="locked-msg">All filed. Look innocent.</p>' : ''}</div>${timer(S.endsAt)}`;
    },
    ROUND() { const x = S.x; return tv(esc(x.name || ''), `Round ${x.n}. Eyes on the TV.`, '📺'); },
    DEMO() { return tv('One sabotage each', 'When a question is on, the red button at the bottom hits a rival with something random. Once per game.', '💣'); },
    Q() { const q = S.q; if (!q) return ''; return (QK[q.kind] || (() => ''))(q); },
    RULE() {
      const x = S.x; const m = me();
      if (x.step === 'pick' && m.picker) return `<h2 class="h">You pick the next rule</h2><p class="small">You're in last place. Only one rule at a time, so this replaces the old one.</p><div class="rcards">${x.offer.map((r) => ruleBtn(r)).join('')}</div>${timer(S.endsAt)}`;
      if (x.step === 'pick') return tv(`${name(x.picker)} is picking a rule`, 'Last place chooses. Pray.', '🃏');
      return tv(x.card ? esc(x.card.name) : 'New rule', x.card ? esc(x.card.text) : '', x.card?.emoji || '🃏');
    },
    SCORES() {
      const x = S.x; const m = me(); const pos = x.order.indexOf(m.id) + 1;
      if (x.roast && x.roast.who === m.id) return tv('Vince is reading your file', `"${esc(x.roast.a)}"`, '📂');
      return tv(pos === 1 ? "You're in the lead" : `You're ${ord(pos)} of ${x.order.length}`, x.last === m.id && S.round < 4 ? 'Last place picks the next rule. Get ready.' : 'More Bucks means a bigger head start in the final race.', pos === 1 ? '👑' : x.last === m.id ? '🃏' : '📊');
    },
    SHOWDOWN() {
      const sd = S.sd; const m = me(); if (!sd) return '';
      const a = P_(sd.a); const b = P_(sd.b);
      const title = sd.grudge ? 'Grudge Match' : 'Showdown';
      if (sd.step === 'result') {
        const w = sd.winner;
        if (m.role === 'duel') return tv(!w ? 'Nobody won' : w === m.id ? 'You won!' : 'You lost', !w ? 'Neither of you got it.' : sd.grudge ? (w === m.id ? 'Head start in the race!' : '') : signed(sd.deltas?.[m.id]), w === m.id ? '🏆' : '😵');
        const bet = sd.bets?.[m.id];
        return tv(w ? `${name(w)} wins` : 'Nobody won', bet ? (w ? (bet === w ? `Your bet came in! ${signed(sd.deltas?.[m.id])}` : `Your bet lost. ${signed(sd.deltas?.[m.id])}`) : 'Bets are off.') : 'Eyes on the TV.', '⚔️');
      }
      if (m.role === 'duel') {
        const q = S.q;
        if (sd.step === 'q' && q && m.can && !m.pick?.locked) {
          const two = q.answers.length === 2;
          return `<div class="qmeta"><span class="chip hot">${title}</span><span class="chip gold">${esc(q.cat || '')}</span><span class="secs" data-ends="${m.ends}"></span></div><p class="qtxt">${esc(q.text)}</p>${q.quote ? `<p class="quote">"${esc(q.quote)}"</p>` : ''}${timer(m.ends)}<p class="small">Fastest right answer wins. One tap, no changing.</p><div class="btns ${two ? 'two' : ''}">${q.answers.map((t, i) => `<button class="ab k${i}" data-a="duel" data-v="${i}"><span class="l">${L[i]}</span><span>${esc(t)}</span></button>`).join('')}</div>`;
        }
        if (sd.step === 'q') return tv('Locked in', 'Now we wait.', '⏱️');
        return tv(`${title}!`, `${esc(a.name)} against ${esc(b.name)}. It's you. Get ready, the question is coming.`, '⚔️');
      }
      if (sd.step === 'bet') {
        if (m.bet) return tv(`You bet on ${name(m.bet)}`, 'Fingers crossed.', '🎲');
        if (!m.canBet) return tv(title, 'Watch the TV.', '⚔️');
        return `<h2 class="h">${title}: who wins?</h2><p class="small">Bet $200. Right: +$200. Wrong: -$200.</p><div class="faces two">${[a, b].map((p) => `<button class="fbtn big" data-a="bet" data-v="${p.id}">${face(p, 'md')}<span>${esc(p.name)}</span></button>`).join('')}</div>${timer(S.endsAt)}`;
      }
      return tv(`${esc(a.name)} vs ${esc(b.name)}`, m.bet ? `You bet on ${name(m.bet)}.` : 'Watch the TV.', '⚔️');
    },
    GRUDGE() {
      const x = S.x; const m = me();
      if (x.step === 'pick' && m.picker) return `<h2 class="h">Grudge Match</h2><p class="small">You're in last place. Pick anyone to duel. Win, and you get a head start in the final race.</p><div class="faces">${S.players.filter((p) => p.id !== m.id).map((p) => `<button class="fbtn" data-a="grudge" data-v="${p.id}">${face(p)}<span>${esc(p.name)}</span></button>`).join('')}</div>${timer(S.endsAt)}`;
      if (x.step === 'pick') return tv('Grudge Match', `${name(x.picker)} is choosing an enemy.`, '😤');
      return tv(x.target === m.id ? "You've been picked!" : 'Grudge Match', `${name(x.picker)} vs ${name(x.target)}`, '😤');
    },
    FINALE() {
      const r = S.race; const m = me(); if (!r) return '';
      const mePos = P_(m.id)?.pos ?? 0;
      const track = `<div class="mytrack"><i style="width:${Math.min(100, mePos / r.len * 100)}%"></i><span>${mePos} of ${r.len}</span></div>`;
      if (r.step === 'intro') return tv('The Rigged Race', `Tap every answer that fits. Right taps: forward. Wrong taps: back. You start on ${mePos}.`, '🏁') + track;
      if (r.step === 'win') return tv(r.winner === m.id ? 'You won RIGGED!' : `${name(r.winner)} wins!`, '', r.winner === m.id ? '🏆' : '🏁');
      if (r.step === 'reveal') { const dl = r.deltas?.[m.id] || 0; return tv(dl > 0 ? `+${dl} steps!` : dl < 0 ? `${dl} steps` : 'No steps', 'Eyes on the TV.', dl > 0 ? '🏃' : '🐢') + track; }
      if (r.step !== 'q') return tv('The Rigged Race', 'Eyes on the TV.', '🏁') + track;
      const mine = new Set(m.race?.picks || []); const locked = m.race?.locked;
      if (locked) return tv('Locked in', `${mine.size} picked. Watch the TV.`, '🔒') + track;
      const blind = false;
      return `<div class="qmeta"><span class="chip gold">${r.room ? 'The Room' : 'Tap every one that fits'}</span><span class="chip">${r.n} of ${r.of}</span><span class="secs" data-ends="${S.endsAt}"></span></div><p class="qtxt">${esc(r.text)}</p>${timer(S.endsAt)}<div class="btns six">${r.opts.map((t, i) => `<button class="ab k${i % 4} tog ${mine.has(i) ? 'sel' : ''} ${blind ? 'blind' : ''}" data-a="race" data-v="${i}"><span class="l">${mine.has(i) ? '✓' : L[i]}</span><span>${esc(t)}</span></button>`).join('')}</div><button class="btn primary big" data-a="raceLock">Lock in (${mine.size} picked)</button>${track}`;
    },
    END() {
      const x = S.x; const m = me(); if (!x.ranks) return tv('And the winner is...', '', '🏆');
      const pos = x.ranks.findIndex((r) => r.id === m.id) + 1;
      const mine = x.awards.filter((a) => a.who === m.id);
      return `<h2 class="h">${x.houseWon ? 'The House wins' : pos === 1 ? 'You won!' : `You came ${ord(pos)}`}</h2>${mine.map((a) => `<div class="peek">🏆 ${esc(a.title)}: ${esc(a.text)}</div>`).join('')}
        <div style="display:grid;gap:.4rem">${x.ranks.map((r, i) => `<div class="rk ${r.id === m.id ? 'me' : ''}"><span class="n">${i + 1}</span>${face(r)}<span>${esc(r.name)}</span><span>${i === 0 ? 'Winner' : `${r.pos} steps`}</span></div>`).join('')}</div>
        ${m.vip && S.step === 'ranks' ? '<button class="btn primary big" data-a="again">Play again</button><button class="btn ghost" data-a="menu">Back to the game menu</button>' : ''}`;
    },
  };
  const ruleBtn = (r) => `<button class="rcard" data-a="rule" data-k="${r.k}">${W.img(`t-rg-card-${r.k}`) ? `<img src="${W.img(`t-rg-card-${r.k}`)}" alt="">` : `<span class="em">${r.emoji}</span>`}<span><b>${esc(r.name)}</b></span><p>${esc(r.text)}</p></button>`;

  function qHead(q, label) {
    const m = me();
    return `<div class="qmeta">${label ? `<span class="chip hot">${label}</span>` : ''}${q.cat ? `<span class="chip gold">${esc(q.cat)}</span>` : ''}<span class="secs" data-ends="${m.ends || q.ends}"></span></div>`;
  }
  const extras = () => { const m = me(); if (!m.rival) return ''; return `<div class="rival">🐈 Copycat: ${esc(m.rival.name)} ${m.rival.v === null ? "hasn't picked yet" : `is on ${typeof m.rival.v === 'number' ? L[m.rival.v] || m.rival.v : S.q.kind === 'who' ? name(m.rival.v) : '?'}`}</div>`; };
  const lockBar = (pk) => (pk && !pk.locked ? '<button class="btn primary big" data-a="lock">Lock it in</button>' : '');
  const waitMsg = (pk) => (pk?.locked ? '<p class="locked-msg">Locked in. Eyes on the TV.</p>' : '');
  const QK = {
    mc(q) {
      const m = me();
      if (S.step === 'reveal') { const rv = S.rev; const mine = rv?.picks?.[m.id]; const right = mine === rv?.correct; const dl = rv?.deltas?.[m.id] || 0; return tv(mine === undefined ? 'No answer!' : right ? 'Correct!' : 'Wrong!', `${dl ? signed(dl) : 'No money this time.'} The answer was ${L[rv?.correct]}: ${esc(q.answers[rv?.correct] || '')}.`, right ? '🎉' : '😬'); }
      if (!m.can) return tv('Watch the TV', '', '📺');
      const pk = m.pick; const blind = rule('blind');
      const btns = q.answers.map((a, i) => `<button class="ab k${i} ${pk?.v === i ? 'sel' : ''} ${blind ? 'blind' : ''} ${pk?.locked ? 'locked' : ''}" data-a="pick" data-v="${i}" ${pk?.locked ? 'disabled' : ''}><span class="l">${L[i]}</span><span>${esc(a)}</span></button>`).join('');
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
      if (S.step === 'reveal') { const dl = S.rev?.deltas?.[m.id]; return tv(S.x?.at && S.rev?.groups?.find((g) => g.id === S.x.at)?.truth ? 'The truth is out' : 'Who fell for what?', dl ? `${signed(dl)} so far` : 'Watch the TV.', '🕵️'); }
      if (!m.can) return tv('Watch the TV', '', '📺');
      const pk = m.pick; const blind = rule('blind'); const own = new Set(m.ownOpts || []);
      const btns = q.opts.map((o, i) => `<button class="ab k${i % 4} ${pk?.v === o.id ? 'sel' : ''} ${own.has(o.id) ? 'gone' : ''} ${blind ? 'blind' : ''}" data-a="pick" data-v="${o.id}" ${pk?.locked || own.has(o.id) ? 'disabled' : ''}><span class="l">${L[i] || i + 1}</span><span>${esc(o.text)}${own.has(o.id) ? ' (yours)' : ''}</span></button>`).join('');
      return `${qHead(q, 'Find the truth')}<p class="fact">${esc(q.text).replace('___', '<u>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</u>')}</p>${timer(m.ends)}<div class="btns">${btns}</div>${lockBar(pk)}${waitMsg(pk)}`;
    },
    who(q) {
      const m = me();
      if (S.step === 'reveal') { const rv = S.rev; const right = rv?.picks?.[m.id] === rv?.author; return tv(rv.author === m.id ? 'They know it was you' : right ? 'Got it!' : 'Wrong person!', `It was ${name(rv.author)}.`, rv.author === m.id ? '🙈' : right ? '🎯' : '🤷'); }
      if (!m.can) return `${tv("That's yours!", 'Keep a straight face. You get $100 for everyone who guesses wrong.', '🤫')}`;
      const pk = m.pick;
      return `${qHead(q, 'Who wrote this?')}<div class="dos"><b>${esc(q.text)}</b><span style="font-size:1.25rem;font-weight:700">"${esc(q.answer)}"</span></div>${timer(m.ends)}<div id="xtra">${extras()}</div><div class="faces">${q.choices.filter((id) => id !== m.id).map((id) => `<button class="fbtn ${pk?.v === id ? 'sel' : ''}" data-a="pick" data-v="${id}" ${pk?.locked ? 'disabled' : ''}>${face(P_(id))}<span>${name(id)}</span></button>`).join('')}</div>${lockBar(pk)}${waitMsg(pk)}`;
    },
    bomb(q) {
      const m = me();
      if (S.step === 'boom') return tv(q.boom === m.id ? 'BOOM! That was you.' : `BOOM! ${name(q.boom)} blew up`, q.boom === m.id ? '-$500. Ouch.' : `It was ${q.answer ? 'TRUE' : 'FALSE'}.`, '💥');
      if (S.step === 'start') return tv(q.holder === m.id ? 'You have the bomb!' : `${name(q.holder)} has the bomb`, 'Answer true or false. Right: pass it on, +$200. Wrong: -$500.', '💣');
      if (q.holder !== m.id) return tv(`${name(q.holder)} has the bomb`, m.sab ? 'Your sabotage button is ready below.' : 'Watch the TV.', '💣');
      if (!m.can) return tv('Passed!', '', '😅');
      return `<div class="bombme"><div class="bm">${W.img('rg-bomb') ? `<img src="${W.img('rg-bomb')}" alt="" style="width:9rem;height:9rem;object-fit:contain">` : '💣'}</div><span class="secs" data-ends="${m.ends}" style="font-size:2.4rem;margin:0 auto"></span></div><p class="qtxt" style="font-size:1.35rem;text-align:center">${esc(q.text)}</p>${timer(m.ends)}<div class="tfrow"><button class="ab t" data-a="pick" data-v="true">TRUE</button><button class="ab f" data-a="pick" data-v="false">FALSE</button></div>`;
    },
  };

  // ---------------------------------------------------------------- the one sabotage button
  function trayHtml() {
    const m = me(); const s = m?.sab;
    if (!s || !['Q', 'SHOWDOWN'].includes(S.phase)) return '';
    const any = s.targets.some((x) => x.ok);
    return `<button class="sabbtn" data-a="sab" ${any ? '' : 'disabled'}>💣 Sabotage<small>${any ? 'Once per game. Tap, then pick a face.' : esc(s.targets[0]?.why || 'Nobody to hit right now')}</small></button>`;
  }

  // ---------------------------------------------------------------- picker: tap a face
  let pickFn = null;
  function openPicker(title, ids, fn) {
    pickFn = fn;
    picker.innerHTML = `<div class="pk"><h3>${title}</h3><div class="faces">${ids.map((x) => `<button class="fbtn" data-pick="${x.id}" ${x.ok === false ? 'disabled' : ''}>${face(P_(x.id))}<span>${name(x.id)}${x.why && x.ok === false ? `<br><small style="font-weight:600">${esc(x.why)}</small>` : ''}</span></button>`).join('')}</div><button class="btn ghost" data-pick="">Cancel</button></div>`;
    picker.hidden = false;
  }
  function closePicker() { picker.hidden = true; picker.innerHTML = ''; pickFn = null; }
  picker.addEventListener('click', (e) => {
    const b = e.target.closest('[data-pick]'); if (!b && e.target !== picker) return;
    const id = b ? b.dataset.pick : ''; const fn = pickFn; closePicker();
    if (id && fn) fn(id);
  });

  // ---------------------------------------------------------------- taps
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-a]'); if (!b || b.disabled) return;
    const a = b.dataset.a; const m = me(); const q = S.q;
    switch (a) {
      case 'start': send('start'); break;
      case 'addBot': send('addBot'); break;
      case 'removeBots': send('removeBots'); break;
      case 'again': send('again'); break;
      case 'menu': send('menu'); break;
      case 'dossier': { const el = $(`#dos-${b.dataset.i}`); const t = el?.value.trim(); if (!t) { toast('Write something first!', 'bad'); return; } send('dossier', { i: Number(b.dataset.i), text: t }); break; }
      case 'pick': {
        let v = b.dataset.v; if (q.kind === 'mc') v = Number(v); if (q.kind === 'bomb') v = v === 'true';
        const lock = q.kind === 'bomb' || q.kind === 'who' || (m.pick && m.pick.v === v);
        send('answer', { v, lock, seq: q.seq }); buzz(15); break;
      }
      case 'duel': document.querySelectorAll('[data-a=duel]').forEach((x) => { x.disabled = true; }); b.classList.add('sel'); send('answer', { v: Number(b.dataset.v), lock: true, seq: q.seq }); buzz(25); break;
      case 'lock': send('lock', { seq: q.seq }); buzz(25); break;
      case 'lie': { const t = $('#lie')?.value.trim(); if (!t) { toast('Write a lie first!', 'bad'); return; } send('lie', { text: t }); break; }
      case 'bet': document.querySelectorAll('[data-a=bet]').forEach((x) => { x.disabled = true; }); send('bet', { on: b.dataset.v }); buzz(15); break;
      case 'rule': send('rule', { k: b.dataset.k }); break;
      case 'grudge': send('grudge', { target: b.dataset.v }); break;
      case 'race': b.classList.toggle('sel'); send('race', { i: Number(b.dataset.v) }); buzz(10); break;
      case 'raceLock': send('raceLock'); buzz(25); break;
      case 'sab': openPicker('💣 Who gets it? Something random hits their phone.', m.sab.targets, (id) => send('sab', { target: id }, (r) => { if (r.ok) buzz([20, 20, 60]); })); break;
      default: break;
    }
  });
  document.addEventListener('keydown', (e) => { if (e.key !== 'Enter') return; if (e.target.id === 'lie') $('[data-a="lie"]')?.click(); });

  // ---------------------------------------------------------------- what your friends did to your screen
  const seenFx = new Set(); let fxTimer = null; let shuffleTimer = null;
  function applyFx() {
    const m = me(); const now = W.now();
    const live = (m?.fx || []).filter((f) => f.until > now);
    ['fog', 'shuffle', 'mirror', 'tiny', 'quake', 'freeze'].forEach((k) => document.body.classList.toggle(`fx-${k}`, live.some((f) => f.k === k)));
    for (const f of m?.fx || []) if (!seenFx.has(f.id)) { seenFx.add(f.id); if (f.until > now) { buzz([60, 40, 120]); fxbar.innerHTML = `<div class="fxb">💥 ${esc(f.by)} hit you: ${SAB[f.k]?.[1] || ''} ${SAB[f.k]?.[0] || f.k}</div>`; clearTimeout(applyFx.bar); applyFx.bar = setTimeout(() => { fxbar.innerHTML = ''; }, 2600); } }
    clearTimeout(fxTimer);
    if (live.length) fxTimer = setTimeout(applyFx, Math.max(60, Math.min(...live.map((f) => f.until)) - now + 30));
    const shuffling = live.some((f) => f.k === 'shuffle');
    if (shuffling && !shuffleTimer) { const go = () => { document.querySelectorAll('.btns, .tfrow, .faces').forEach((c) => [...c.children].forEach((n) => { n.style.order = Math.floor(Math.random() * 12); })); }; go(); shuffleTimer = setInterval(go, 1000); }
    if (!shuffling && shuffleTimer) { clearInterval(shuffleTimer); shuffleTimer = null; document.querySelectorAll('.btns > *, .tfrow > *, .faces > *').forEach((n) => { n.style.order = ''; }); }
  }

  // ---------------------------------------------------------------- render
  function skeleton(root) { const c = root.cloneNode(true); c.querySelectorAll('[id]').forEach((n) => { if (!/^(lie|dos-\d)$/.test(n.id)) n.innerHTML = ''; }); c.querySelectorAll('input,textarea').forEach((n) => n.removeAttribute('value')); return c.innerHTML; }
  let lastKey = '';
  function render() {
    if (!S || !S.me) return;
    mount(hud, hudHtml());
    const html = (R[S.phase] || (() => ''))();
    const key = `${S.phase}|${S.step}|${S.q?.kind || ''}|${S.q?.seq || ''}|${S.x?.step || ''}|${S.x?.at || ''}|${S.sd?.step || ''}|${S.race?.n || ''}|${S.race?.step || ''}`;
    const keep = {}; main.querySelectorAll('input[id], textarea[id]').forEach((el) => { keep[el.id] = { v: el.value, f: document.activeElement === el }; });
    if (key !== lastKey) { lastKey = key; main.innerHTML = html; main.__html = html; main.__skel = skeleton(main); main.classList.remove('in'); void main.offsetWidth; main.classList.add('in'); }
    else if (main.__html !== html) {
      const t = document.createElement('div'); t.innerHTML = html; const skel = skeleton(t);
      if (skel !== main.__skel) main.innerHTML = html;
      else t.querySelectorAll('[id]').forEach((n) => { if (/^(lie|dos-\d)$/.test(n.id)) return; const el = main.querySelector(`#${n.id}`); if (el) mount(el, n.innerHTML); });
      main.__html = html; main.__skel = skel;
    }
    Object.entries(keep).forEach(([id, k]) => { const el = main.querySelector(`#${CSS.escape(id)}`); if (el && !el.value) { el.value = k.v; if (k.f) el.focus(); } });
    mount(tray, trayHtml());
    tray.hidden = !tray.innerHTML;
    applyFx();
  }
})();
