/* NOTHING TO DECLARE on the phone: your hand, your suitcase, your lies. And the officer's three buttons. */
(() => {
  const $ = (q) => document.querySelector(q); const esc = W.esc;
  const socket = io({ transports: ['websocket', 'polling'] }); window.__gnSocket = socket;
  const main = $('#main'); const top = $('#top');
  const params = new URLSearchParams(location.search); const TEST = params.has('test');
  const store = TEST ? sessionStorage : localStorage;
  $('#jcode').value = (params.get('room') || store.getItem('ntd:code') || '').toUpperCase();
  $('#jname').value = store.getItem('ntd:name') || (TEST ? '' : localStorage.getItem('wr:name') || '');
  const buzz = (p) => { try { navigator.vibrate?.(p); } catch (e) { /* no vibration */ } };
  let S = null; let P = null; let joined = null; let screenKey = null;

  // ---------------------------------------------------------------- joining
  let wake = null;
  async function keepAwake() { try { if ('wakeLock' in navigator && !wake && document.visibilityState === 'visible') { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => { wake = null; }); } } catch (e) { wake = null; } }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && joined) { keepAwake(); if (!socket.connected) socket.connect(); } });
  function tryJoin(code, token) {
    const name = $('#jname').value.trim();
    socket.emit('player:join', { code, token, name, game: 'ntd' }, (r) => {
      if (r.redirect) { location.href = r.redirect; return; }
      if (r.error) { if (token) { store.removeItem(`ntd:token:${code}`); joined = null; } $('#jerr').textContent = r.error; $('#join').hidden = false; $('#app').hidden = true; return; }
      joined = { code: r.code, token: r.token }; store.setItem(`ntd:token:${r.code}`, r.token); store.setItem('ntd:code', r.code); store.setItem('ntd:name', name);
      if (!TEST) localStorage.setItem('wr:name', name);
      $('#join').hidden = true; $('#app').hidden = false; keepAwake();
    });
  }
  socket.on('connect', () => { if (joined) return tryJoin(joined.code, joined.token); const code = $('#jcode').value.trim().toUpperCase(); const tok = code && store.getItem(`ntd:token:${code}`); if (tok) tryJoin(code, tok); });
  $('#jform').onsubmit = (e) => { e.preventDefault(); $('#jerr').textContent = ''; const code = $('#jcode').value.trim().toUpperCase(); tryJoin(code, store.getItem(`ntd:token:${code}`)); };
  socket.on('moveTo', ({ url }) => { location.href = `${url}${TEST ? '&test' : ''}&auto=1`; });
  if (params.has('auto') && $('#jcode').value && $('#jname').value) setTimeout(() => $('#jform').requestSubmit(), 300);
  socket.on('kicked', () => { joined = null; $('#join').hidden = false; $('#app').hidden = true; $('#jerr').textContent = 'You were removed from the room.'; });
  socket.on('state', (s) => {
    W.syncClock(s.now); P = S; S = s; window.__S = s;
    if (P && (P.phase !== s.phase || P.round !== s.round)) { window.scrollTo(0, 0); main.scrollTop = 0; if (['PACK', 'DESK'].includes(s.phase) && (s.phase === 'PACK' || s.me?.officer || s.me?.atDesk)) buzz([60, 40, 60]); }
    if (s.phase === 'PACK' && (!P || P.phase !== 'PACK' || P.round !== s.round)) { draft = null; step = 'pick'; }
    render();
  });
  const send = (type, data = {}, cb) => socket.emit('act', { type, ...data }, (r) => { if (r?.error) toast(r.error); cb?.(r || {}); });
  function toast(t) { const d = document.createElement('div'); d.className = 'toast'; d.textContent = t; $('#toasts').appendChild(d); setTimeout(() => d.remove(), 2800); }

  // ---------------------------------------------------------------- helpers
  const me = () => S.me;
  const aed = (n) => `${n < 0 ? '-' : ''}AED ${Math.abs(Math.round(n)).toLocaleString('en-US')}`;
  const P_ = (id) => S.players.find((p) => p.id === id);
  const name = (id) => esc(P_(id)?.name || 'Someone');
  const CAT = (c) => S.cats?.[c] || { name: c, icon: '📦' };
  const LEGAL = ['perfume', 'sweets', 'tech', 'fashion'];
  const tv = (title, sub = '', ico = '📺') => `<div class="tv"><div class="ico">${ico}</div><h2>${title}</h2>${sub ? `<p>${sub}</p>` : ''}</div>`;
  const photo = (it) => (it.img ? `<img src="${esc(it.img)}" alt="" loading="lazy" onerror="this.parentNode.classList.add('nophoto');this.remove()">` : '');
  const card = (it, extra = '', badge = '') => `<div class="card c-${it.cat} ${it.img ? '' : 'nophoto'} ${extra}" data-uid="${it.uid}"><div class="ph">${photo(it)}<span class="ico">${CAT(it.cat).icon}</span>${badge}</div><b>${esc(it.name)}</b><span class="v">${aed(it.value)}</span><span class="k">${CAT(it.cat).icon} ${esc(CAT(it.cat).name)}</span></div>`;
  const mini = (it, mark = '') => `<div class="mini ${mark}"><span class="mi">${CAT(it.cat).icon}</span><b>${esc(it.name)}</b><span>${aed(it.value)}</span></div>`;

  // ---------------------------------------------------------------- packing: kept on the phone until you zip it
  let draft = null; let cur = 0; let step = 'pick';
  const maxFor = (lane) => (lane === 'red' ? S.rules.redMax : S.rules.greenMax);
  function ensureDraft() {
    const n = S.two ? 2 : 1;
    if (!draft) { draft = Array.from({ length: n }, () => ({ items: [], lane: 'green', decl: null, bribe: 0 })); cur = 0; }
    const have = new Set(me().hand.map((h) => h.uid));
    draft.forEach((b) => { b.items = b.items.filter((u) => have.has(u)); });
  }
  const itemOf = (u) => me().hand.find((h) => h.uid === u);
  const bagOf = (u) => draft.findIndex((b) => b.items.includes(u));
  function suggestDecl(b) { if (b.decl || b.lane !== 'green') return; const first = b.items.map(itemOf).find((it) => it && it.cat !== 'contra'); if (first) b.decl = first.cat; }
  function problems(b) {
    if (!b.items.length) return '';
    const items = b.items.map(itemOf).filter(Boolean);
    if (b.lane === 'red' && items.some((it) => it.cat === 'contra')) return 'Contraband can\'t go in the red lane. Take it out, or switch to the green lane.';
    if (b.items.length > maxFor(b.lane)) return `Too many. The ${b.lane === 'red' ? 'red' : 'green'} lane takes ${maxFor(b.lane)} at most.`;
    if (b.lane === 'green' && !b.decl) return 'Pick what you\'re declaring.';
    return '';
  }
  let pushT = null;
  function pushDraft(done = false) {
    clearTimeout(pushT);
    const go = () => send('pack', { bags: draft.map((b) => ({ items: b.items, lane: b.lane, decl: b.decl, bribe: b.bribe })), done }, (r) => { if (done && !r.error) buzz([40, 30, 90]); });
    if (done) go(); else pushT = setTimeout(go, 350);
  }
  function bagForm(b, i) {
    const items = b.items.map(itemOf).filter(Boolean);
    const lane = `<div class="lanes"><button class="lane green ${b.lane === 'green' ? 'on' : ''}" data-a="lane" data-i="${i}" data-l="green"><b>Nothing to Declare</b><small>Up to ${S.rules.greenMax}. Say what's inside.</small></button><button class="lane red ${b.lane === 'red' ? 'on' : ''}" data-a="lane" data-i="${i}" data-l="red"><b>Goods to Declare</b><small>Pay ${Math.round(S.rules.duty * 100)}% duty. Never searched.</small></button></div>`;
    const v = items.reduce((s2, it) => s2 + it.value, 0);
    const decl = b.lane === 'green' ? `<div class="decl"><p class="lbl">I'm declaring ${items.length} ${items.length === 1 ? 'item' : 'items'} of:</p><div class="chips">${LEGAL.map((c) => `<button class="chip ${b.decl === c ? 'on' : ''}" data-a="decl" data-i="${i}" data-c="${c}">${CAT(c).icon} ${esc(CAT(c).name)}</button>`).join('')}</div></div>` : `<div class="decl red"><p class="lbl">Duty to pay: <b>${aed(Math.ceil((v * S.rules.duty) / 10) * 10)}</b></p></div>`;
    const bribe = b.lane === 'green' ? `<div class="bribe"><p class="lbl">Bribe on the desk <small>(optional, paid only if you're waved through)</small></p><div class="brow"><button class="btn sm" data-a="bribe" data-i="${i}" data-d="-500">-500</button><b>${aed(b.bribe)}</b><button class="btn sm" data-a="bribe" data-i="${i}" data-d="500">+500</button><button class="btn sm" data-a="bribe" data-i="${i}" data-d="0">Clear</button></div></div>` : '';
    return `<div class="bag"><h3>${S.two ? `Bag ${i + 1}` : 'Your suitcase'}</h3><div class="minis">${items.map((it) => mini(it, b.lane === 'green' && b.decl && it.cat !== b.decl ? 'lie' : '')).join('')}</div>${lane}${decl}${bribe}${problems(b) ? `<p class="warnline">${esc(problems(b))}</p>` : ''}</div>`;
  }
  function packScreen() {
    const m = me(); ensureDraft();
    if (!draft[0].items.length) step = 'pick';
    const total = draft.reduce((s2, x) => s2 + (x.lane === 'green' ? x.bribe : 0), 0);
    if (step === 'pick') {
      const tabs = S.two ? `<div class="tabs">${draft.map((x, i) => `<button class="tab ${i === cur ? 'on' : ''}" data-a="tab" data-i="${i}">Bag ${i + 1}<small>${x.items.length ? `${x.items.length} packed` : 'empty'}</small></button>`).join('')}</div>` : '';
      const hand = m.hand.map((it) => { const at = bagOf(it.uid); const badge = at >= 0 ? `<em class="in b${at}">${S.two ? `Bag ${at + 1}` : 'Packed'}</em>` : ''; return card(it, at === cur ? 'sel' : at >= 0 ? 'other' : '', badge + (m.swaps > 0 && at < 0 ? `<button class="swap" data-a="swap" data-uid="${it.uid}" aria-label="Swap ${esc(it.name)} for a new item">↻</button>` : '')); }).join('');
      const n = draft[0].items.length + (draft[1]?.items.length || 0);
      return `<div class="pack"><div class="hhead"><h2 class="h">Pack your bag${S.two ? 's' : ''}</h2><span class="sw">${m.swaps ? `↻ swap ${m.swaps} more` : 'No swaps left'}</span></div><p class="sub">Tap items to put them in${S.two ? ' the bag you picked' : ' your suitcase'}. ↻ swaps an item for a new one.</p>${tabs}<div class="hand">${hand}</div>
        <div class="gn-dock"><button class="btn primary big" data-a="next" ${n ? '' : 'disabled'}>${n ? `Next: pick a lane (${n} packed)` : 'Pack at least one item'}</button></div></div>`;
    }
    const prob = draft.map(problems).find(Boolean);
    const canZip = draft[0].items.length && !prob && total <= Math.max(0, m.cash);
    const hint = prob ? 'Fix the bag above first.' : total > Math.max(0, m.cash) ? "You can't afford that bribe." : '';
    return `<div class="pack"><div class="hhead"><h2 class="h">Lanes and lies</h2><button class="btn sm ghost" data-a="back">Back to items</button></div>${draft.map((b, i) => (b.items.length ? bagForm(b, i) : S.two ? `<div class="bag empty"><h3>Bag ${i + 1}</h3><p>Empty. That's allowed.</p></div>` : '')).join('')}
      <div class="gn-dock">${hint ? `<p class="hint warn">${esc(hint)}</p>` : ''}<button class="btn primary big" data-a="zip" ${canZip ? '' : 'disabled'}>Zip it up</button></div></div>`;
  }

  // ---------------------------------------------------------------- the screens
  const R = {
    LOBBY() {
      const m = me(); const n = S.players.length; const bots = S.players.filter((p) => p.bot).length;
      const botbar = `<div class="row2"><button class="btn sm" data-a="addBot" ${n >= 8 ? 'disabled' : ''}>Add a bot</button>${bots ? `<button class="btn sm ghost" data-a="removeBots">Remove bots (${bots})</button>` : ''}</div>`;
      const start = m.vip ? `<button class="btn primary big" data-a="start" ${n < 2 ? 'disabled' : ''}>Open the gates</button><p class="hint">${n < 2 ? 'One more traveller needed. Add a friend or a bot.' : `${n} travellers. Start when everyone is in.`}</p>${botbar}` : `<p class="hint">${name(S.vipId)} starts the game.</p>`;
      return [`lobby|${n}|${m.vip}|${W.pickKey(S)}`, `<div class="hello" style="--c:${m.color}">${W.bust(m, 'lg')}<h2>Welcome aboard, ${esc(m.name)}</h2><p>Pack a suitcase. Lie to customs. Get rich.</p></div>${W.picker(S, m.id)}${start}`];
    },
    INTRO() { return ['intro', tv('Listen to Brenda', 'The rules are on the TV.', '📢')]; },
    ROUND() {
      if (me().officer) return [`round${S.round}o`, `<div class="role off"><div class="ico">🛂</div><h2>You're the customs officer</h2><p>This round you don't pack. Watch everyone's faces.</p><p>At the desk, wave each bag through or open it. Open an honest bag and you pay them AED ${S.rules.sorry} an item. Catch a liar and they pay you.</p><p>Biscuit can sniff one bag this round. He barks at contraband.</p></div>`];
      return [`round${S.round}`, tv(`${name(S.officer)} is on the desk`, 'Get ready to pack.', '🧳')];
    },
    PACK() {
      const m = me();
      if (m.officer) return [`pack-off${S.round}`, `<div class="role off"><div class="ico">🛂</div><h2>They're packing</h2><p>You're the officer this round. Who looks nervous?</p><p class="small">Your hand waits for next round.</p></div>`];
      if (m.packed) { const bags = m.bags || []; return [`packed${S.round}|${bags.length}`, `<div class="zipped"><div class="ico">🧳</div><h2>Zipped</h2>${bags.map((b, i) => `<div class="sum ${b.lane}"><b>${S.two ? `Bag ${i + 1}: ` : ''}${b.lane === 'red' ? 'Goods to Declare' : `Declaring ${esc(b.declText)}`}</b>${b.bribe ? `<span>Bribe on the desk: ${aed(b.bribe)}</span>` : ''}<div class="minis">${(b.items || []).map((it) => mini(it, b.lane === 'green' && it.cat !== b.decl ? 'lie' : '')).join('')}</div></div>`).join('')}<p class="hint">Keep a straight face. Watch the TV.</p></div>`]; }
      const html = packScreen();
      return [`pack${S.round}|${m.hand.map((h) => h.uid).join(',')}|${m.swaps}|${m.cash}|${JSON.stringify(draft)}|${cur}|${step}`, html];
    },
    BELT() { return ['belt', tv('On the belt', 'Through the X-ray...', '🛄')]; },
    RED() { return ['red', tv('The red lane', 'Duty paid. Straight through.', '🟥')]; },
    DESK() {
      const m = me(); const b = S.x.bag; if (!b) return ['desk', ''];
      const step = S.step; const open = ['reveal', 'stamp'].includes(step);
      const head = `<div class="dhead"><small>At the desk</small><h2>${name(b.pid)}</h2><p class="form">Declaring <b>${esc(b.declText)}</b></p>${b.bribe ? `<p class="env">Bribe on the desk: <b>${aed(b.bribe)}</b></p>` : ''}${b.sniff ? `<p class="dog ${b.sniff}">${b.sniff === 'bark' ? '🐶 Biscuit barked!' : '🐶 Biscuit lost interest.'}</p>` : ''}</div>`;
      const result = () => {
        if (step === 'wave') return `<div class="res ok"><h3>Waved through</h3>${b.result?.paid ? `<p>${aed(b.result.paid)} went to ${name(S.officer)}.</p>` : ''}</div>`;
        if (step === 'open') return '<div class="res"><h3>Opening the bag...</h3></div>';
        if (open && b.result) return b.result.kind === 'honest' ? `<div class="res sorry"><h3>All as declared</h3><p>${name(S.officer)} pays ${name(b.pid)} ${aed(b.result.comp)}.</p></div>` : `<div class="res bad"><h3>Caught!</h3><p>${name(b.pid)} pays a fine of ${aed(b.result.fine)}.</p></div>`;
        if (step === 'sniff') return '<div class="res"><h3>Biscuit is sniffing...</h3></div>';
        return '';
      };
      if (m.officer) {
        const can = ['talk', 'sniffed'].includes(step);
        const buttons = can ? `<div class="decide"><button class="btn wave" data-a="decide" data-w="wave"><b>Wave through</b><small>${b.bribe ? `and take ${aed(b.bribe)}` : 'no questions asked'}</small></button><button class="btn open" data-a="decide" data-w="open"><b>Open the bag</b><small>Liar? They pay you. Honest? You pay them ${aed(S.rules.sorry * b.n)}.</small></button>${m.canSniff ? '<button class="btn dogb" data-a="decide" data-w="sniff"><b>🐶 Send Biscuit</b><small>Once per round. He barks at contraband.</small></button>' : S.x.sniffed ? '<p class="hint">Biscuit has done his sniff this round.</p>' : ''}</div>` : result();
        return [`desk-o|${b.id}|${step}|${b.bribe}|${m.canSniff}`, `<div class="desk">${head}${buttons}</div>`];
      }
      if (m.atDesk && m.atDesk.id === b.id) {
        const mine = m.atDesk;
        const raise = ['intro', 'talk', 'sniff', 'sniffed'].includes(step) ? `<div class="raise"><p class="lbl">Raise the bribe (you have ${aed(m.cash)})</p><div class="brow">${[100, 500, 1000].map((d) => `<button class="btn sm" data-a="raise" data-d="${d}" ${m.cash < b.bribe + d ? 'disabled' : ''}>+${d.toLocaleString('en-US')}</button>`).join('')}</div><p class="small">Only paid if you're waved through.</p></div>` : '';
        return [`desk-me|${b.id}|${step}|${b.bribe}|${m.cash}`, `<div class="desk">${head}<div class="mine"><p class="lbl">What's really inside (only you can see this)</p><div class="minis">${(mine.items || []).map((it) => mini(it, it.cat !== b.decl ? 'lie' : '')).join('')}</div></div>${raise}${result() || '<p class="hint">Look innocent. Talk them out of it.</p>'}</div>`];
      }
      return [`desk|${b.id}|${step}|${b.bribe}`, `<div class="desk">${head}${result() || `<div class="res"><h3>Shout!</h3><p>Tell ${name(S.officer)} what you think is in there.</p></div>`}</div>`];
    },
    SCORES() {
      const ranked = [...S.players].sort((a, b) => b.cash - a.cash); const i = ranked.findIndex((p) => p.id === me().id);
      return [`scores${S.round}`, `<div class="tv"><div class="ico">💵</div><h2>${aed(me().cash)}</h2><p>You're ${['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth'][i]} on cash. Your goods stay secret until the awards.</p></div>`];
    },
    AWARDS() { return [`awards${S.x.step}${S.x.who || ''}`, tv('Customs Awards Night', S.x.who === me().id ? "Everyone's looking at your suitcase." : 'Watch the TV.', '🏆')]; },
    END() {
      const m = me(); const t = S.x.totals?.[m.id]; const place = S.x.ranked.indexOf(m.id) + 1;
      const haul = (S.x.hauls?.[m.id] || []).map((it) => mini(it)).join('');
      const vip = m.vip ? '<div class="row2"><button class="btn primary" data-a="again">Play again</button><button class="btn" data-a="menu">Pick another game</button></div>' : `<p class="hint">${name(S.vipId)} picks what's next.</p>`;
      return [`end|${m.vip}`, `<div class="end"><div class="ico">${place === 1 ? '🏆' : '🧳'}</div><h2>${place === 1 ? 'You win!' : `You came ${['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth'][place]}`}</h2>${t ? `<div class="tot"><p><span>Cash</span><b>${aed(t.cash)}</b></p><p><span>Goods</span><b>${aed(t.goods)}</b></p><p><span>Bonuses</span><b>${aed(t.bonus)}</b></p><p class="all"><span>Total</span><b>${aed(t.total)}</b></p></div>` : ''}${haul ? `<p class="lbl">Your best goods</p><div class="minis">${haul}</div>` : ''}${vip}</div>`];
    },
  };

  // ---------------------------------------------------------------- top bar and drawing
  function topHtml() {
    const m = me();
    const tag = m.officer && !['LOBBY', 'END', 'AWARDS'].includes(S.phase) ? '<span class="tag off">🛂 Officer</span>' : '';
    const cash = S.phase !== 'LOBBY' ? `<span class="cash">${aed(m.cash)}</span>` : '';
    return `<div class="who" style="--c:${m.color}">${W.bust(m, 'sm')}<b>${esc(m.name)}</b></div>${tag}${cash}`;
  }
  function render() {
    if (!S || !S.me) return;
    document.body.dataset.phase = S.phase;
    mount(top, topHtml());
    const [key, html] = (R[S.phase] || (() => ['x', '']))();
    if (key !== screenKey) {
      // while packing, redraws keep your place on the screen
      const keep = key.startsWith(`pack${S.round}|`) && screenKey && screenKey.startsWith(`pack${S.round}|`); const y = main.scrollTop; const hy = main.querySelector('.hand')?.scrollTop || 0;
      screenKey = key; main.innerHTML = html;
      if (keep) { main.scrollTop = y; const h = main.querySelector('.hand'); if (h) h.scrollTop = hy; } else { main.classList.remove('in'); void main.offsetWidth; main.classList.add('in'); }
    }
  }
  main.addEventListener('click', (e) => {
    const b = e.target.closest('[data-a]');
    const c = !b && e.target.closest('.card[data-uid]');
    if (c && S.phase === 'PACK' && draft && step === 'pick' && !me().packed && !me().officer) {
      const u = c.dataset.uid; const at = bagOf(u); const bag = draft[cur];
      if (at === cur) bag.items = bag.items.filter((x) => x !== u);
      else {
        if (bag.items.length >= S.rules.redMax) { toast(`A suitcase holds ${S.rules.redMax} items at most.`); return; }
        if (at >= 0) draft[at].items = draft[at].items.filter((x) => x !== u);
        bag.items.push(u); suggestDecl(bag);
      }
      buzz(10); render(); pushDraft(); return;
    }
    if (!b) return; const a = b.dataset.a;
    if (a === 'start') send('start'); if (a === 'again') send('again'); if (a === 'menu') send('menu');
    if (a === 'addBot') send('addBot'); if (a === 'removeBots') send('removeBots');
    if (a === 'bust') { send('bust', { n: Number(b.dataset.n) }); buzz(10); }
    if (a === 'tab') { cur = Number(b.dataset.i); render(); }
    if (a === 'next') { draft.forEach(suggestDecl); step = 'declare'; main.scrollTop = 0; render(); }
    if (a === 'back') { step = 'pick'; main.scrollTop = 0; render(); }
    if (a === 'swap') { e.stopPropagation(); buzz(15); send('swap', { uid: b.dataset.uid }); }
    const bi = Number(b.dataset.i || 0);
    if (a === 'lane') { draft[bi].lane = b.dataset.l; if (b.dataset.l === 'red') { draft[bi].bribe = 0; } else suggestDecl(draft[bi]); render(); pushDraft(); }
    if (a === 'decl') { draft[bi].decl = b.dataset.c; render(); pushDraft(); }
    if (a === 'bribe') { const d = Number(b.dataset.d); const bag = draft[bi]; bag.bribe = d === 0 ? 0 : Math.max(0, Math.min(Math.max(0, me().cash), bag.bribe + d)); render(); pushDraft(); }
    if (a === 'zip') pushDraft(true);
    if (a === 'raise') { buzz(20); send('bribe', { amt: (S.x.bag?.bribe || 0) + Number(b.dataset.d) }); }
    if (a === 'decide') { buzz([30, 20, 30]); send('decide', { what: b.dataset.w }); }
  });
})();
