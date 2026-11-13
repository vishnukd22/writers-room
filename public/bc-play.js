/* BID-COIN! The phone: your peek, your paddle, your power cards. */
(() => {
  const $ = (q) => document.querySelector(q);
  const esc = W.esc;
  const socket = io({ transports: ['websocket', 'polling'] });
  const main = $('#main'); const hud = $('#hud'); const drawer = $('#drawer'); const picker = $('#picker');
  const params = new URLSearchParams(location.search);
  const TEST = params.has('test');
  const store = TEST ? sessionStorage : localStorage;
  $('#jcode').value = (params.get('room') || store.getItem('bc:code') || '').toUpperCase();
  $('#jname').value = store.getItem('bc:name') || store.getItem('lg:name') || (TEST ? '' : localStorage.getItem('wr:name') || '');
  const buzz = (p) => { try { navigator.vibrate?.(p); } catch (e) { /* no vibration */ } };

  let S = null; let P = null; let joined = null; let lastNote = null; let screenKey = null; let AUC = null; let aucAt = 0;

  // ---------------------------------------------------------------- joining
  let wake = null;
  async function keepAwake() { try { if ('wakeLock' in navigator && !wake && document.visibilityState === 'visible') { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => { wake = null; }); } } catch (e) { wake = null; } }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && joined) { keepAwake(); if (!socket.connected) socket.connect(); } });
  function tryJoin(code, token) {
    const name = $('#jname').value.trim();
    socket.emit('player:join', { code, token, name, game: 'bc' }, (r) => {
      if (r.redirect) { location.href = r.redirect; return; }
      if (r.error) { if (token) { store.removeItem(`bc:token:${code}`); joined = null; } $('#jerr').textContent = r.error; $('#join').hidden = false; $('#app').hidden = true; return; }
      joined = { code: r.code, token: r.token };
      store.setItem(`bc:token:${r.code}`, r.token); store.setItem('bc:code', r.code); store.setItem('bc:name', name);
      if (!TEST) localStorage.setItem('wr:name', name);
      $('#join').hidden = true; $('#app').hidden = false; keepAwake();
    });
  }
  socket.on('connect', () => {
    if (joined) return tryJoin(joined.code, joined.token);
    const code = $('#jcode').value.trim().toUpperCase(); const tok = code && store.getItem(`bc:token:${code}`);
    if (tok) tryJoin(code, tok);
  });
  $('#jform').onsubmit = (e) => { e.preventDefault(); $('#jerr').textContent = ''; const code = $('#jcode').value.trim().toUpperCase(); tryJoin(code, store.getItem(`bc:token:${code}`)); };
  socket.on('moveTo', ({ url }) => { location.href = `${url}${TEST ? '&test' : ''}&auto=1`; });
  if (params.has('auto') && $('#jcode').value && $('#jname').value) setTimeout(() => $('#jform').requestSubmit(), 300);
  socket.on('kicked', () => { joined = null; $('#join').hidden = false; $('#app').hidden = true; $('#jerr').textContent = 'You were removed from the room.'; });
  socket.on('state', (s) => { W.syncClock(s.now); P = S; S = s; window.__S = s; if (s.auc) takeAuc(s.auc, true); render(); notes(); feel(); });
  socket.on('bc:b', (a) => { if (S) takeAuc(a, false); });
  function send(type, data = {}, cb) { socket.emit('act', { type, ...data }, (r) => { if (r?.error && !r.stale) toast(r.error, 'bad'); cb?.(r || {}); }); }

  function toast(text, kind = 'info') { const t = document.createElement('div'); t.className = `toast ${kind}`; t.textContent = text; $('#toasts').appendChild(t); setTimeout(() => t.remove(), 3000); if (kind === 'bad') buzz([50, 30, 50]); }
  function notes() {
    const ns = S.me?.notes || []; const topId = ns.length ? ns[ns.length - 1].id : 0;
    if (lastNote === null) { lastNote = topId; return; }
    ns.filter((n) => n.id > lastNote).forEach((n) => toast(n.text, n.kind)); lastNote = Math.max(lastNote, topId);
  }
  function feel() {
    if (!P || !S.me) return;
    if (P.phase !== S.phase) { window.scrollTo(0, 0); closePicker(); }
    if (['PEEK', 'AUCTION', 'BET'].includes(S.phase) && P.phase !== S.phase) buzz(S.phase === 'AUCTION' ? [80, 40, 80] : 40);
  }

  // ---------------------------------------------------------------- helpers
  const me = () => S.me;
  const P_ = (id) => S.players.find((p) => p.id === id);
  const aed = (n) => `${n < 0 ? '-' : ''}AED ${Math.abs(Math.round(n)).toLocaleString('en-US')}`;
  const num = (n) => Math.round(n).toLocaleString('en-US');
  const name = (id) => (id === 'phantom' ? 'Mystery bidder' : esc(P_(id)?.name || 'Someone'));
  const CATS = { tech: '📻', toys: '🧸', sports: '🏏', jewels: '💍', art: '🖼️', cars: '🚗', music: '🎸', fashion: '👢', antiques: '🏺', home: '☕', weird: '🦩', sealed: '🔒' };
  const CARD = {
    xray: ['X-Ray Specs', '🩻', 'See three more things in this locker.'], tip: ['Insider Tip', '🕵️', 'Find out roughly what this locker is worth.'],
    plant: ['The Plant', '🪴', "Everyone else's peek shows a fake treasure. Exposed at the reveal."], freeze: ['Freeze', '🧊', 'Lock one rival out of bidding for 10 seconds.'],
    phantom: ['Phantom Bidder', '👻', 'A mystery +300 bid. If nobody beats it, nobody gets the locker.'], steal: ['Steal', '🦝', 'After SOLD, take the locker for the price plus 20%.'],
    tax: ['Tax Man', '🧾', "Take 25% of this locker's profit."], swap: ['Swap Meet', '🔁', "Swap your cheapest find for this locker's best one."],
    appraise: ['Appraiser', '🔍', 'Your locker only: double the value of its best find.'], curse: ['Pass the Curse', '🧿', 'Give your worst cursed thing to a rival.'],
  };
  const WHEN = { xray: 'Use while peeking', tip: 'Use while peeking', plant: 'Use while peeking', freeze: 'Use during the auction', phantom: 'Use during the auction', steal: 'Use right after SOLD', tax: 'Use after the reveal', swap: 'Use after the reveal', appraise: 'Use after the reveal', curse: 'Use after the reveal' };
  const TARGET = { freeze: 1, curse: 1 };
  const photo = (img) => (img ? `/assets/bc/items/${img}.webp` : null);
  const pic = (it) => (photo(it.img) ? `<img src="${photo(it.img)}" alt="">` : `<span class="noph">${CATS[it.cat] || '📦'}</span>`);
  const tv = (title, sub = '', ico = '📺') => `<div class="tv"><div class="ico">${ico}</div><h2 class="h">${title}</h2>${sub ? `<p class="lead">${sub}</p>` : ''}</div>`;
  const cardPic = (k) => (W.img(`t-bc-card-${k}`) ? `<img class="art" src="${W.img(`t-bc-card-${k}`)}" alt="">` : `<span class="e">${CARD[k][1]}</span>`);
  const cardBtn = (c, extra = '') => `<button class="pcard ${c.usable ? 'live' : ''}" data-a="card" data-k="${c.k}" ${c.usable ? '' : 'disabled'}>${cardPic(c.k)}<b>${CARD[c.k][0]}</b><small>${c.usable ? 'Tap to use' : WHEN[c.k]}</small>${extra}</button>`;
  const usable = (keys) => (me().hand || []).filter((c) => keys.includes(c.k) && c.usable);
  const cardsRow = (keys) => { const cs = usable(keys); return cs.length ? `<div class="cardsrow">${cs.map((c) => cardBtn(c)).join('')}</div>` : ''; };
  const peekCard = (it) => `<div class="peek ${it.xray ? 'xr' : ''}"><div class="ph">${pic(it)}</div><div><b>${esc(it.name)}</b><p>${esc(it.line || '')}</p>${it.sealed ? '<em class="sealed">Sealed: opened at the very end</em>' : ''}${it.xray ? '<em class="xr">X-Ray</em>' : ''}</div></div>`;

  // ---------------------------------------------------------------- the paddle (the fast part)
  function takeAuc(a, fromState) {
    if (AUC && a.seq < AUC.seq && !fromState) return;
    const prev = AUC; AUC = a; aucAt = performance.now();
    if (prev && S.phase === 'AUCTION' && prev.leader === S.me?.id && a.leader !== S.me?.id && a.n > prev.n) { buzz([30, 30, 30]); toast(`${name(a.leader)} outbid you!`, 'bad'); }
    if (S.phase === 'AUCTION') { const el = $('#paddle'); if (el) mount(el, paddle()); }
  }
  function paddle() {
    const a = AUC; const m = me(); if (!a) return '';
    const mine = a.leader === m.id;
    const frozenMs = (a.frozen && a.frozen[m.id]) ? Math.max(0, a.frozen[m.id] - (performance.now() - aucAt)) : 0;
    const status = a.done ? (mine ? '<div class="status win">SOLD to you!</div>' : '<div class="status">SOLD</div>')
      : mine ? '<div class="status win">You are winning!</div>'
      : a.leader === 'phantom' ? '<div class="status">A mystery bidder leads</div>'
      : a.leader ? `<div class="status" style="--c:${P_(a.leader)?.color}">${name(a.leader)} leads</div>` : '<div class="status">No bids yet</div>';
    const call = a.done ? '' : a.calls === 2 ? '<em class="call c2">Going twice!</em>' : a.calls === 1 ? '<em class="call c1">Going once</em>' : '';
    const btns = [50, 100, 500].map((inc) => {
      const to = a.price + inc; const off = a.done || mine || frozenMs > 0 || to > m.cash;
      return `<button class="bid b${inc}" data-bid="${inc}" ${off ? 'disabled' : ''}><b>+${inc}</b><span>${to > m.cash ? 'Too much' : `to ${num(to)}`}</span></button>`;
    }).join('');
    return `<div class="pricebox ${a.calls ? 'hot' : ''}"><small>AED</small><b>${num(a.price)}</b>${call}</div>${status}<div class="hammer"><i id="hbar"></i></div>
      <div class="bids ${frozenMs ? 'iced' : ''}">${btns}${frozenMs ? `<div class="ice">🧊 Frozen<span data-ice="${Date.now() + frozenMs}">${Math.ceil(frozenMs / 1000)}</span></div>` : ''}</div>`;
  }
  (function loop() {
    const el = document.getElementById('hbar');
    if (el && AUC) { const left = Math.max(0, AUC.dl - (performance.now() - aucAt)); el.style.transform = `scaleX(${AUC.done ? 0 : left / Math.max(1, AUC.win)})`; }
    document.querySelectorAll('[data-ice]').forEach((n) => { const s = Math.ceil((Number(n.dataset.ice) - Date.now()) / 1000); if (s <= 0) { const p = $('#paddle'); if (p) mount(p, paddle()); } else n.textContent = s; });
    requestAnimationFrame(loop);
  })();
  // bids go out on touch-down, not on release: every millisecond counts
  main.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('[data-bid]'); if (!b || b.disabled || !AUC) return;
    e.preventDefault();
    const inc = Number(b.dataset.bid); const at = AUC.price;
    b.classList.add('sent'); buzz(15);
    socket.emit('act', { type: 'bid', inc, at }, (r) => {
      b.classList.remove('sent');
      if (r?.auc) takeAuc(r.auc, false);
      if (r?.stale) { toast(`${r.error}. Price is now ${aed(r.auc?.price || 0)}`, 'bad'); }
      else if (r?.error) toast(r.error, 'bad');
    });
  });

  // ---------------------------------------------------------------- screens
  const R = {
    LOBBY() {
      const m = me(); const n = S.players.length;
      const bots = S.players.filter((p) => p.bot).length;
      const botbar = `<div class="botbar"><button class="btn sm" data-a="addBot" ${n >= 8 ? 'disabled' : ''}>Add a bot</button>${bots ? `<button class="btn ghost sm" data-a="removeBots">Remove bots (${bots})</button>` : ''}</div>`;
      const start = m.vip ? `<div id="startbox"><button class="btn primary big" data-a="start" ${n < 2 ? 'disabled' : ''}>Start BID-COIN!</button><p class="hint center">${n < 2 ? 'One more bidder needed. Add a friend or a bot.' : `${n} bidders${bots ? `, ${bots} of them bots` : ''}. Start when everyone is in.`}</p>${botbar}</div>` : `<p class="hint center" id="startbox">${name(S.vipId)} starts the game.</p>`;
      return ['lobby', `<div class="hello" style="--c:${m.color}">${W.bust(m, 'lg')}<h2>You're in, ${esc(m.name)}</h2><p>You start with ${aed(S.rules.start)} and two power cards.</p></div>
        <div class="howto"><p><b>Peek</b> at the locker on your phone. Everyone sees something different.</p><p><b>Bid</b> with the big buttons. Five seconds of silence and it's sold.</p><p><b>Bet</b> on whether the winner makes money.</p><p>Richest at the end wins.</p></div>${start}`];
    },
    INTRO() { return ['intro', tv('Eyes on the TV', 'The auctioneer is talking.')]; },
    TUTORIAL() { return [`tut${S.x.slide}`, `${tv(esc(S.x.title || 'How it works'), 'Watch the TV.', '📺')}${me().vip ? '<button class="btn ghost" data-a="skipTutorial">Skip the rules</button>' : ''}`]; },
    LOCKER() { const lk = S.locker; return [`lk${lk.n}`, tv(`Locker ${lk.n}`, esc(lk.origin), '🚪')]; },
    PEEK() {
      const lk = S.locker; const m = me();
      const peeks = (m.peek || []).map(peekCard).join('');
      const tip = m.tip ? `<div class="tip">🕵️ Insider tip: worth between <b>${aed(m.tip.lo)}</b> and <b>${aed(m.tip.hi)}</b></div>` : '';
      const body = peeks || `<div class="dark">${lk.special === 'mystery' ? 'Mystery locker. No peeking!' : 'Nothing to see.'}</div>`;
      return [`peek${lk.n}`, `<h2 class="h">Your peek</h2><p class="lead">Keep a straight face. ${lk.count} things inside.</p><div id="peeks">${body}${tip}</div><div id="pcards">${cardsRow(['xray', 'tip', 'plant'])}</div>
        <div id="readybox"><button class="btn primary big" data-a="ready" ${m.ready ? 'disabled' : ''}>${m.ready ? 'Waiting for the others' : 'Seen it'}</button></div>`];
    },
    AUCTION() {
      const m = me(); const lk = S.locker;
      const recap = (m.peek || []).length ? `<div class="recap">${m.peek.map((it) => `<span>${pic(it)}<i>${esc(it.name)}</i></span>`).join('')}</div>` : '';
      return [`auc${lk.n}`, `<div id="paddle" class="paddlebox">${paddle()}</div><div id="acards">${cardsRow(['freeze', 'phantom'])}</div>${recap}${m.tip ? `<p class="hint center">Tip: ${aed(m.tip.lo)} to ${aed(m.tip.hi)}</p>` : ''}`];
    },
    BET() {
      const lk = S.locker; const m = me(); const x = S.x;
      if (S.step === 'none') return ['nobid', tv('No takers', 'Nobody bid. Watch what you missed.', '🤷')];
      const mine = lk.owner === m.id;
      const head = mine ? `<div class="bought"><h2 class="h">You bought it!</h2><p class="lead">${aed(lk.price)}. Fingers crossed.</p></div><p class="hint center">Everyone else is betting on whether you make money.</p>${(m.peek || []).length ? `<div class="recap">${m.peek.map((it) => `<span>${pic(it)}<i>${esc(it.name)}</i></span>`).join('')}</div>` : ''}` : `<h2 class="h">${lk.phantom ? 'The mystery bidder won it' : `${name(lk.owner)} bought it`}</h2><p class="lead">For ${aed(lk.price)}. Will they make money?</p>`;
      const bet = mine ? '' : m.bet ? `<div class="placed">${m.bet === 'none' ? 'No bet this time.' : `You bet <b>${m.bet === 'boom' ? 'BOOM' : 'BUST'}</b>.`}</div>` : x.canBet ? `<div class="bb"><button class="btn bt-boom" data-a="bet" data-pick="boom">BOOM<small>they profit</small></button><button class="btn bt-bust" data-a="bet" data-pick="bust">BUST<small>they lose</small></button></div><p class="hint center">Bet ${aed(S.rules.stake)}. Win it and you get a power card.</p><button class="btn ghost sm" data-a="bet" data-pick="none">No bet</button>` : `<p class="hint center">You need ${aed(S.rules.stake)} to bet.</p>`;
      const steal = usable(['steal']).length ? `<div class="cardsrow">${cardBtn(usable(['steal'])[0], `<em>Costs ${aed(x.stealPrice)}</em>`)}</div>` : '';
      return [`bet${lk.n}|${lk.owner}`, `${head}<div id="betbox">${bet}</div><div id="stealbox">${steal}</div>`];
    },
    REVEAL() { return revealPhone(); },
    AFTER() {
      const lk = S.locker; const m = me();
      const cs = usable(['tax', 'swap', 'appraise', 'curse']);
      if (m.passed || !cs.length) return [`after${lk.n}|done`, tv('Power cards', 'Waiting for the others.', '🃏')];
      return [`after${lk.n}`, `<h2 class="h">Last chance</h2><p class="lead">${lk.owner ? `${name(lk.owner)}'s locker` : 'This locker'}${lk.projected ? `: profit so far ${aed(lk.projected.profit)}` : ''}</p><div class="cardsrow">${cs.map((c) => cardBtn(c)).join('')}</div><button class="btn ghost big" data-a="pass">Keep my cards</button>`];
    },
    RESULT() {
      const lk = S.locker; const m = me(); const r = lk.result || {};
      const rank = [...S.players].sort((a, b) => b.cash - a.cash).findIndex((p) => p.id === m.id) + 1;
      const mine = r.owner === m.id ? `<p class="lead big ${r.profit >= 0 ? 'g' : 'rd'}">${r.profit >= 0 ? 'You made' : 'You lost'} ${aed(Math.abs(r.profit))}</p>` : '';
      return [`res${lk.n}`, `<div class="tv"><div class="ico">💰</div><h2 class="h">${aed(m.cash)}</h2>${mine}<p class="lead">You're ${ordinal(rank)} of ${S.players.length}.</p></div>`];
    },
    FINALE() { return [`fin${S.x.step}${S.x.box?.name || ''}`, tv('The sealed boxes', 'Watch the TV.', '🔒')]; },
    END() {
      const m = me(); const ranks = S.x.ranks || []; const i = ranks.findIndex((p) => p.id === m.id);
      const vip = m.vip ? '<button class="btn primary big" data-a="again">Play again</button><button class="btn big" data-a="menu">Back to the game menu</button>' : `<p class="hint center">${name(S.vipId)} can start another game.</p>`;
      return ['end', `<div class="tv"><div class="ico">${i === 0 ? '🏆' : '🧾'}</div><h2 class="h">${i === 0 ? 'You win!' : `You came ${ordinal(i + 1)}`}</h2><p class="lead">${aed(ranks[i]?.cash ?? m.cash)}</p></div>${vip}`];
    },
  };
  function revealPhone() {
    const lk = S.locker; const m = me(); const shown = lk.shown || [];
    const list = shown.map((it) => `<li class="r-${it.rar}"><span class="t">${pic(it)}</span><b>${esc(it.name)}</b><em>${it.sealed ? '???' : aed(it.value)}</em></li>`).reverse().join('');
    const mine = lk.owner === m.id;
    return [`rev${lk.n}`, `<h2 class="h">${mine ? 'Your locker!' : lk.owner ? `${name(lk.owner)}'s locker` : 'The locker'}</h2><p class="lead">Watch the TV. Here's what came out.</p><ul class="found" id="found">${list}</ul>`];
  }
  const ordinal = (n) => `${n}${['th', 'st', 'nd', 'rd'][(n % 100 >= 11 && n % 100 <= 13) ? 0 : n % 10] || 'th'}`;

  function hudHtml() {
    const m = me();
    return `<div class="who" style="--c:${m.color}">${W.bust(m, 'sm')}<b>${esc(m.name)}</b></div><div class="money">${aed(m.cash)}</div><button class="hcards" data-a="drawer">${m.hand.length ? m.hand.map((c) => `<i>${CARD[c.k][1]}</i>`).join('') : 'No cards'}${m.cursed.length ? `<i class="cu">🧿${m.cursed.length}</i>` : ''}${m.sealed.length ? `<i>🔒${m.sealed.length}</i>` : ''}</button>`;
  }
  function drawerHtml() {
    const m = me();
    const cards = m.hand.length ? m.hand.map((c) => `<div class="dcard">${cardPic(c.k)}<div><b>${CARD[c.k][0]}</b><p>${CARD[c.k][2]}</p><small>${WHEN[c.k]}</small></div></div>`).join('') : '<p class="hint">No power cards. Win a locker or a bet to get one.</p>';
    const curse = m.cursed.length ? `<h3>Cursed things</h3><p class="hint">These cost you money at the end, unless you pass them on.</p>${m.cursed.map((c) => `<p class="row">🧿 ${esc(c.name)}<b>${aed(c.value)}</b></p>`).join('')}` : '';
    const sealed = m.sealed.length ? `<h3>Sealed boxes</h3><p class="hint">Opened at the very end.</p>${m.sealed.map((s) => `<p class="row">🔒 ${esc(s.name)}</p>`).join('')}` : '';
    return `<div class="sheet"><button class="btn ghost sm close" data-a="closeDrawer">Close</button><h3>Your power cards (${m.hand.length} of ${S.rules.hand})</h3>${cards}${curse}${sealed}</div>`;
  }

  // ---------------------------------------------------------------- render
  function skeleton(root) { const c = root.cloneNode(true); c.querySelectorAll('[id]').forEach((n) => { n.innerHTML = ''; }); return c.innerHTML; }
  function render() {
    if (!S || !S.me) return;
    document.body.dataset.phase = S.phase;
    mount(hud, hudHtml());
    if (!drawer.hidden) mount(drawer, drawerHtml());
    const [key, html] = (R[S.phase] || (() => ['x', '']))();
    if (key !== screenKey) { screenKey = key; main.innerHTML = html; main.__html = html; main.__skel = skeleton(main); main.classList.remove('in'); void main.offsetWidth; main.classList.add('in'); }
    else if (main.__html !== html) {
      // patch the parts with an id in place; if anything else changed, redraw the lot
      const t = document.createElement('div'); t.innerHTML = html;
      const skel = skeleton(t);
      if (skel !== main.__skel) { main.innerHTML = html; }
      else t.querySelectorAll('[id]').forEach((n) => { const el = main.querySelector(`#${n.id}`); if (el) mount(el, n.innerHTML); });
      main.__html = html; main.__skel = skel;
    }
  }

  // ---------------------------------------------------------------- taps
  function openPicker(k) {
    const rivals = S.players.filter((p) => p.id !== me().id);
    picker.innerHTML = `<div class="sheet"><h3>${CARD[k][1]} ${CARD[k][0]}: pick a rival</h3><div class="people">${rivals.map((p) => `<button class="person" data-a="target" data-k="${k}" data-id="${p.id}" style="--c:${p.color}">${W.bust(p, 'md')}<b>${esc(p.name)}</b><small>${aed(p.cash)}</small></button>`).join('')}</div><button class="btn ghost big" data-a="closePicker">Cancel</button></div>`;
    picker.hidden = false;
  }
  function closePicker() { picker.hidden = true; picker.innerHTML = ''; }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-a]'); if (!b || b.disabled) return;
    const a = b.dataset.a;
    if (a === 'start') send('start');
    if (a === 'again') send('again');
    if (a === 'menu') send('menu');
    if (a === 'skipTutorial') send('skipTutorial');
    if (a === 'addBot') send('addBot');
    if (a === 'removeBots') send('removeBots');
    if (a === 'ready') { b.disabled = true; send('ready'); }
    if (a === 'bet') { document.querySelectorAll('[data-a=bet]').forEach((x) => { x.disabled = true; }); buzz(20); send('bet', { pick: b.dataset.pick }); }
    if (a === 'pass') send('pass');
    if (a === 'card') { const k = b.dataset.k; if (TARGET[k]) openPicker(k); else { b.disabled = true; buzz(25); send('card', { k }, (r) => { if (r.ok) toast(`${CARD[k][0]} played`, 'good'); }); } }
    if (a === 'target') { const k = b.dataset.k; closePicker(); buzz(25); send('card', { k, target: b.dataset.id }, (r) => { if (r.ok) toast(`${CARD[k][0]} played`, 'good'); }); }
    if (a === 'closePicker') closePicker();
    if (a === 'drawer') { drawer.hidden = false; mount(drawer, drawerHtml()); }
    if (a === 'closeDrawer') drawer.hidden = true;
  });
  drawer.addEventListener('click', (e) => { if (e.target === drawer) drawer.hidden = true; });
  picker.addEventListener('click', (e) => { if (e.target === picker) closePicker(); });
})();
