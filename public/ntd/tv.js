/* NOTHING TO DECLARE on the TV: the arrivals hall, the customs desk, the reveal, and the awards night. */
(() => {
  const $ = (q) => document.querySelector(q);
  const esc = W.esc;
  const TEST = new URLSearchParams(location.search).has('test');
  const socket = io({ autoConnect: false, transports: ['websocket', 'polling'] });
  window.__gnSocket = socket;
  window.__gnTV = true;
  const stage = $('#stage'); const top = $('#top'); const dock = $('#dock'); const tannoy = $('#tannoy');
  let S = null; let P = null;
  const totals = {};

  // ---------------------------------------------------------------- boot
  $('#bOpen').onclick = async () => {
    AV.init(); await W.ready; $('#gate').classList.add('hide');
    try { if (!TEST) document.documentElement.requestFullscreen?.(); } catch (e) { /* fine */ }
    socket.connect();
  };
  const KEY = TEST ? 'ntdHostTest' : 'ntdHost';
  socket.on('connect', () => {
    const saved = sessionStorage.getItem(KEY);
    const create = () => { const from = sessionStorage.getItem('gnPrev'); sessionStorage.removeItem('gnPrev'); socket.emit('host:create', { game: 'ntd', test: TEST, from }, (r) => sessionStorage.setItem(KEY, r.code)); };
    if (saved) socket.emit('host:attach', { code: saved, game: 'ntd' }, (r) => { if (r.error) create(); }); else create();
  });
  function goMenu() { if (S) sessionStorage.setItem('gnPrev', S.code); sessionStorage.removeItem(KEY); location.href = TEST ? '/tv?test' : '/tv'; }
  socket.on('menu', goMenu);
  socket.on('state', (s) => { W.syncClock(s.now); P = S; S = s; window.__S = s; render(); effects(); preload(s.preload); });
  $('#bMusic').onclick = (e) => { e.target.textContent = AV.toggleMusic() ? 'Music on' : 'Music off'; lastMusic = null; music(); };
  $('#bSfx').onclick = (e) => { e.target.textContent = AV.toggleSfx() ? 'Sounds on' : 'Sounds off'; };
  $('#bVoice').onclick = (e) => { e.target.textContent = AV.toggleVoice() ? 'Brenda on' : 'Brenda off'; };
  $('#bSkip').onclick = () => socket.emit('host:skip');
  $('#bFull').onclick = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.());
  document.addEventListener('keydown', (e) => { if (e.code === 'Space' && S && S.phase !== 'LOBBY') { e.preventDefault(); socket.emit('host:skip'); } });
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tv]'); if (!b) return;
    const a = b.dataset.tv;
    if (a === 'bot') socket.emit('host:addBot', {}, (r) => { if (r?.error) flash(r.error); });
    if (a === 'fill') { const need = Math.max(0, 4 - S.players.length); for (let i = 0; i < need; i++) socket.emit('host:addBot', {}); }
    if (a === 'nobots') socket.emit('host:removeBots', {});
    if (a === 'start') socket.emit('host:start', {}, (r) => { if (r?.error) flash(r.error); });
  });
  let flashT = null;
  function flash(t, ms = 2600) { tannoy.innerHTML = `<div class="bubble plain"><p>${esc(t)}</p></div>`; tannoy.className = 'show'; clearTimeout(flashT); flashT = setTimeout(() => { tannoy.className = ''; }, ms); }
  let heard = Date.now();
  socket.on('state', () => { heard = Date.now(); });
  setInterval(() => {
    if (!S || S.phase === 'LOBBY' || S.phase === 'END') return;
    if (Date.now() - heard > 40000) { heard = Date.now(); if (socket.connected) socket.emit('host:attach', { code: S.code, game: 'ntd' }, () => {}); else socket.connect(); }
  }, 5000);
  const warm = new Set();
  function preload(list) { (list || []).forEach((src) => { if (!src || warm.has(src)) return; warm.add(src); const i = new Image(); i.decoding = 'async'; i.src = src; }); }

  // ---------------------------------------------------------------- helpers
  const aed = (n) => `${n < 0 ? '-' : ''}AED ${Math.abs(Math.round(n)).toLocaleString('en-US')}`;
  const P_ = (id) => S.players.find((p) => p.id === id);
  const name = (id) => esc(P_(id)?.name || 'Someone');
  const rot = (i) => ((i * 47) % 9) - 4;
  const T = () => { if (!S.endsAt) return ''; if (!totals[S.endsAt]) totals[S.endsAt] = Math.max(1, S.endsAt - W.now()); return `data-ends="${S.endsAt}" data-total="${totals[S.endsAt]}"`; };
  const timer = () => (S.endsAt ? `<div class="timer"><i ${T()} data-kind="bar"></i></div>` : '');
  const host = () => { try { return new URL(S.joinUrl).host; } catch (e) { return location.host; } };
  const CAT = (c) => S.cats?.[c] || { name: c, icon: '📦' };
  const img = (n) => W.img(n);
  // each traveller's suitcase is the same red case, turned to their colour
  const hueOf = (hex) => { const h = hex.replace('#', ''); const r = parseInt(h.slice(0, 2), 16) / 255; const g = parseInt(h.slice(2, 4), 16) / 255; const b = parseInt(h.slice(4, 6), 16) / 255; const mx = Math.max(r, g, b); const mn = Math.min(r, g, b); if (mx === mn) return 0; const d = mx - mn; let hh = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; hh *= 60; return hh < 0 ? hh + 360 : hh; };
  const caseStyle = (p) => `--tint:hue-rotate(${Math.round(hueOf(p?.color || '#E8553D') - 8)}deg)`;
  const suitcase = (p, open = false, cls = '') => { const src = img(open ? 'ntd-case-open' : 'ntd-case-shut'); return src ? `<img class="case ${cls}" style="${caseStyle(p)}" src="${src}" alt="">` : `<div class="case drawn ${cls}" style="--c:${p?.color || '#E8553D'}">🧳</div>`; };
  const photo = (it) => (it.img ? `<img src="${esc(it.img)}" alt="" decoding="async" onerror="this.parentNode.classList.add('nophoto');this.remove()">` : '');
  const itemCard = (it, i, mark = '') => `<div class="item c-${it.cat} ${it.img ? '' : 'nophoto'} ${mark}" style="--r:${rot(i)}deg;--i:${i}"><div class="ph">${photo(it)}<span class="ico">${CAT(it.cat).icon}</span></div><div class="nm">${esc(it.name)}</div><div class="val">${aed(it.value)}</div>${mark === 'bad' ? '<em class="mini seized">Seized</em>' : mark === 'ok' ? '<em class="mini ok">As declared</em>' : ''}</div>`;
  const stamp = (k) => { const src = img(`ntd-stamp-${k}`); const word = { cleared: 'CLEARED', seized: 'SEIZED', sorry: 'COMPENSATION' }[k]; return src ? `<img class="stampimg s-${k}" src="${src}" alt="${word}">` : `<div class="stampword s-${k}">${word}</div>`; };
  const brendaSrc = (mood) => img(`ntd-brenda-${{ suspicious: 'suspicious', gotcha: 'gotcha', sigh: 'sigh' }[mood] || 'calm'}`);
  const officerBadge = () => { const o = P_(S.officer); return o ? `<div class="officer" style="--c:${o.color}">${W.bust(o, 'md')}<div><small>Customs officer</small><b>${esc(o.name)}</b></div></div>` : ''; };

  // ---------------------------------------------------------------- the hall behind everything
  let artNow = null;
  function setHall() {
    const want = S.phase === 'DESK' ? 'ntd-desk' : ['AWARDS', 'END'].includes(S.phase) ? 'ntd-awards' : 'ntd-hall';
    if (want === artNow) return; artNow = want;
    const src = img(want); $('#art').style.backgroundImage = src ? `url("${src}")` : '';
    document.body.dataset.hall = want;
  }
  function topBar() {
    if (S.phase === 'LOBBY') return '';
    const logo = img('ntd-logo') ? `<img class="logo" src="${img('t-ntd-logo') || img('ntd-logo')}" alt="Nothing to Declare">` : '<div class="logo word">Nothing to Declare</div>';
    const round = S.round >= 0 && !['AWARDS', 'END', 'INTRO'].includes(S.phase) ? `<div class="round">Round <b>${S.round + 1}</b> of ${S.rounds}${S.two ? '<em>Two bags each</em>' : ''}</div>` : '';
    return `${logo}${round}${S.officer && !['AWARDS', 'END', 'INTRO'].includes(S.phase) ? officerBadge() : '<span></span>'}`;
  }
  function dockHtml() {
    if (['LOBBY', 'INTRO', 'END', 'AWARDS'].includes(S.phase)) return '';
    return S.players.map((p) => {
      const off = p.id === S.officer;
      const st = S.phase === 'PACK' ? (off ? '<em class="st off">On the desk</em>' : p.packed ? '<em class="st ok">Zipped</em>' : '<em class="st wait">Packing</em>') : off ? '<em class="st off">Officer</em>' : '';
      return `<div class="pax ${off ? 'isoff' : ''} ${p.connected ? '' : 'gone'}" style="--c:${p.color}">${W.bust(p, 'md')}<div class="pt"><b>${esc(p.name)}</b><span>${aed(p.cash)}</span><small>🧳 ${p.goods} ${p.goods === 1 ? 'item' : 'items'} through</small></div>${st}</div>`;
    }).join('');
  }

  // ---------------------------------------------------------------- the screens
  const R = {
    LOBBY() {
      const art = img('ntd-logo');
      const people = S.players.map((p, i) => `<div class="joiner" style="--c:${p.color};--r:${rot(i)}deg">${W.bust(p, 'md')}<b>${esc(p.name)}</b>${p.bot ? '<small>bot</small>' : ''}</div>`).join('');
      const n = S.players.length;
      return `<div class="lobby"><div class="poster">${art ? `<img src="${art}" alt="Nothing to Declare">` : '<h1 class="word">Nothing to Declare</h1>'}</div>
        <div class="boarding"><div class="pass"><div class="ph">Boarding pass</div><img class="qr" src="${S.qr || ''}" alt="Scan to join"><div class="code">${esc(S.code)}</div><p>Scan, or go to <b>${esc(host())}</b> and type the code.</p>
        <p class="fine">${n < 2 ? '2 to 8 travellers. The first phone starts the game.' : n <= 3 ? `${n} travellers. With 2 or 3, everyone packs two suitcases.` : `${n} travellers. The first phone starts when everyone is in.`}</p>
        ${S.test ? '<div class="botbar"><button data-tv="bot">Add bot</button><button data-tv="fill">Fill to 4</button><button data-tv="nobots">No bots</button><button data-tv="start">Start</button></div>' : ''}</div>
        <div class="joiners">${people || '<p class="empty">Waiting for the first passenger...</p>'}</div></div></div>`;
    },
    INTRO() {
      if (S.step === 'welcome') return `<div class="center intro"><div class="brendabig"><img src="${brendaSrc('calm') || ''}" alt=""></div><h1 class="say">Welcome to Arrivals</h1><p class="lede">Supervisor Brenda is on the tannoy.</p></div>`;
      const r = S.rules;
      return `<div class="center rules"><h1 class="say">How customs works</h1><div class="cards">
        <div class="rcard" style="--r:-2deg"><div class="n">1</div><h3>Pack</h3><p>Pick items from your hand on your phone. Real things, real prices. Some are legal. Some very much aren't.</p></div>
        <div class="rcard green" style="--r:1.5deg"><div class="n">2</div><h3>Pick a lane</h3><p><b>Nothing to Declare:</b> up to ${r.greenMax} items, and you say what kind. Lie if you like.</p><p><b>Goods to Declare:</b> pay ${Math.round(r.duty * 100)}% duty and you're never searched. No contraband.</p></div>
        <div class="rcard coral" style="--r:-1deg"><div class="n">3</div><h3>The desk</h3><p>The officer waves you through or opens your bag. Caught lying? Pay half its value. Honest bag opened? The officer pays you AED ${r.sorry} an item.</p><p>Bribes are accepted.</p></div>
        </div><p class="lede">Most money plus goods at the end wins. Biscuit the beagle can sniff one bag per round.</p></div>`;
    },
    ROUND() {
      const o = P_(S.officer);
      return `<div class="center round"><h2 class="kicker">${S.x.last ? 'Final round' : `Round ${S.round + 1}`}</h2><div class="badge" style="--c:${o?.color}">${W.bust(o, 'xl')}<em class="ribbon">Customs officer</em></div><h1 class="say">${name(S.officer)} is on the desk</h1><p class="lede">Everyone else: pack your bags.</p></div>`;
    },
    PACK() {
      const trav = S.players.filter((p) => p.id !== S.officer);
      const r = S.rules;
      const cases = trav.map((p, i) => `<div class="packer ${p.packed ? 'done' : ''}" style="--i:${i}">${suitcase(p)}<b>${esc(p.name)}</b><span>${p.packed ? 'Zipped' : 'Packing...'}</span></div>`).join('');
      return `<div class="center pack"><h1 class="say">Pack your bags</h1>${timer()}<div class="packers">${cases}</div>
        <div class="lanes"><div class="lane green"><h3>Nothing to Declare</h3><p>Up to ${r.greenMax} items. Say what kind. The officer may look.</p></div><div class="lane red"><h3>Goods to Declare</h3><p>Pay ${Math.round(r.duty * 100)}% duty. Never searched. No contraband.</p></div></div>
        <p class="lede">${name(S.officer)}, watch their faces.</p></div>`;
    },
    BELT() {
      const bags = S.x.bags || [];
      return `<div class="center belt"><h1 class="say">Onto the belt</h1><div class="conveyor"><div class="rail"></div><div class="xray">X-RAY</div><div class="run">${bags.map((b, i) => `<div class="onbelt" style="--i:${i}">${suitcase(P_(b.pid), false, 'sm')}<b>${name(b.pid)}</b><em class="${b.lane}">${b.lane === 'red' ? 'Goods to declare' : 'Nothing to declare'}</em></div>`).join('')}</div></div></div>`;
    },
    RED() {
      const bags = S.x.bags || [];
      return `<div class="center red"><h1 class="say">The red lane</h1><p class="lede">They declared everything and paid the duty. Straight through.</p><div class="redbags">${bags.map((b) => `<div class="redbag" style="--c:${P_(b.pid)?.color}"><div class="who">${W.bust(P_(b.pid), 'md')}<b>${name(b.pid)}</b><span>Duty paid: ${aed(b.duty)}</span></div><div class="items">${(b.items || []).map((it, i) => itemCard(it, i)).join('')}</div>${stamp('cleared')}</div>`).join('')}</div></div>`;
    },
    DESK() {
      const b = S.x.bag; if (!b) return '';
      const owner = P_(b.pid); const step = S.step;
      const open = ['reveal', 'stamp'].includes(step);
      const verdict = new Map((b.verdict || []).map((v) => [v.uid, v.ok]));
      const form = `<div class="form" id="form"><div class="fh">Customs declaration</div>
        <div class="row"><span>Passenger</span><b>${name(b.pid)}</b></div>
        <div class="row"><span>Lane</span><b>Nothing to declare</b></div>
        <div class="row big"><span>Contents</span><b>${esc(b.declText || '')}</b></div>
        <div class="row"><span>Signed</span><b class="sig">${name(b.pid)}</b></div></div>`;
      const bribe = b.bribe > 0 ? `<div class="envelope" id="env"><small>On the desk</small><b>${aed(b.bribe)}</b></div>` : '';
      let middle = '';
      if (!open) middle = `<div class="onDesk">${suitcase(owner, false, step === 'wave' ? 'thumped' : 'wobble')}${step === 'wave' ? stamp('cleared') : ''}</div>`;
      else middle = `<div class="onDesk opened">${suitcase(owner, true)}<div class="spill">${(b.items || []).map((it, i) => itemCard(it, i, verdict.get(it.uid) ? 'ok' : 'bad')).join('')}</div></div>`;
      let dog = '';
      if (step === 'sniff') dog = `<div class="dog">${img('ntd-dog-sniff') ? `<img src="${img('ntd-dog-sniff')}" alt="Biscuit sniffing">` : '🐶'}<b>Biscuit is sniffing...</b></div>`;
      else if (b.sniff) dog = `<div class="dog ${b.sniff}">${img(b.sniff === 'bark' ? 'ntd-dog-bark' : 'ntd-dog-sniff') ? `<img src="${img(b.sniff === 'bark' ? 'ntd-dog-bark' : 'ntd-dog-sniff')}" alt="Biscuit">` : '🐶'}<b>${b.sniff === 'bark' ? 'WOOF! Biscuit barked.' : 'Biscuit lost interest.'}</b></div>`;
      let banner = '';
      if (step === 'talk') banner = `<div class="banner talk"><b>${name(S.officer)}, wave it through or open it?</b><span>Everyone else: argue.</span>${timer()}</div>`;
      if (step === 'wave') banner = `<div class="banner ok"><b>Waved through</b>${b.result?.paid ? `<span>${aed(b.result.paid)} goes to ${name(S.officer)}</span>` : '<span>No questions asked</span>'}</div>`;
      if (step === 'open') banner = '<div class="banner"><b>Opening the bag...</b></div>';
      if (step === 'stamp' && b.result) banner = b.result.kind === 'honest' ? `<div class="banner sorry"><b>All as declared</b><span>${name(S.officer)} pays ${name(b.pid)} ${aed(b.result.comp)}</span></div>` : `<div class="banner bad"><b>Caught</b><span>${name(b.pid)} pays a fine of ${aed(b.result.fine)}</span></div>`;
      const queue = (S.x.queue || []).map((q) => `<i class="${q.done ? 'done' : q.id === b.id ? 'now' : ''}" style="--c:${P_(q.pid)?.color}"></i>`).join('');
      const big = step === 'stamp' ? `<div class="bigstamp">${stamp(b.result?.kind === 'honest' ? 'sorry' : 'seized')}</div>` : '';
      return `<div class="desk ${open ? 'isopen' : ''}"><div class="left">${form}${bribe}</div><div class="mid">${middle}</div><div class="right">${dog}${big}</div>${banner}<div class="queue">${queue}</div></div>`;
    },
    SCORES() {
      const ranked = [...S.players].sort((a, b) => b.cash - a.cash);
      const max = Math.max(1, ...ranked.map((p) => Math.abs(p.cash)));
      return `<div class="center scores"><h1 class="say">${S.x.last ? 'Before the awards' : 'Cash in hand'}</h1><p class="lede">What got through stays secret until the awards night.</p><div class="bars">${ranked.map((p, i) => `<div class="bar ${p.cash < 0 ? 'neg' : ''}" style="--c:${p.color};--w:${Math.max(3, (Math.abs(p.cash) / max) * 100)}%;--i:${i}">${W.bust(p, 'sm')}<b>${esc(p.name)}</b><span><i></i></span><em>${aed(p.cash)}</em><small>🧳 ${p.goods}</small></div>`).join('')}</div></div>`;
    },
    AWARDS() {
      const x = S.x;
      if (x.step === 'intro') return `<div class="center awards"><h1 class="say gold">Customs Awards Night</h1><p class="lede">First: what really got past us.</p></div>`;
      if (x.step === 'smuggled') {
        const p = P_(x.who); const items = x.smuggled || [];
        return `<div class="center awards smug"><div class="who" style="--c:${p?.color}">${W.bust(p, 'xl')}<h2>${name(x.who)}</h2><p>${items.length ? `smuggled ${items.length} ${items.length === 1 ? 'thing' : 'things'} past customs` : 'smuggled nothing at all'}</p></div><div class="items">${items.length ? items.map((it, i) => itemCard(it, i)).join('') : `<div class="clean">${stamp('cleared')}<p>A model citizen.</p></div>`}</div></div>`;
      }
      if (x.step === 'crowns' || x.step === 'smuggler') {
        const crowns = (x.crowns || []).map((c) => `<div class="crown"><div class="cat">${CAT(c.cat).icon}<b>${esc(CAT(c.cat).name)}</b></div><div class="first">${c.first.map((id) => `<span>${W.bust(P_(id), 'sm')}${name(id)}</span>`).join('')}<em>+AED 3,000</em></div>${c.second.length ? `<div class="second">${c.second.map((id) => `<span>${W.bust(P_(id), 'sm')}${name(id)}</span>`).join('')}<em>+AED 1,500</em></div>` : ''}<small>${c.n} ${c.n === 1 ? 'item' : 'items'}</small></div>`).join('');
        const sm = x.step === 'smuggler' && x.smuggler ? `<div class="smugcrown">${img('ntd-dog-bark') ? `<img src="${img('ntd-dog-bark')}" alt="">` : ''}<div><small>Smuggler of the Year</small><b>${x.smuggler.ids.map((id) => name(id)).join(' and ')}</b><span>${x.smuggler.n} pieces of contraband. +AED 5,000</span></div></div>` : '';
        return `<div class="center awards"><h1 class="say gold">Duty free royalty</h1><p class="lede">Most of each kind of legal goods wins a bonus.</p><div class="crowns">${crowns || '<p class="lede">Nobody brought anything legal. Remarkable.</p>'}</div>${sm}</div>`;
      }
      return '';
    },
    END() {
      const x = S.x; const t = x.totals || {};
      const order = x.ranked.map((id) => P_(id)).filter(Boolean);
      const podium = order.slice(0, 3); const show = [podium[1], podium[0], podium[2]].filter(Boolean);
      const steps = show.map((p) => { const place = x.ranked.indexOf(p.id) + 1; const o = t[p.id]; return `<div class="step s${place}" style="--c:${p.color}">${W.bust(p, place === 1 ? 'xl' : 'lg')}<b>${esc(p.name)}</b><span class="tot">${aed(o.total)}</span><small>${aed(o.cash)} cash + ${aed(o.goods)} goods${o.bonus ? ` + ${aed(o.bonus)} bonus` : ''}</small><div class="block">${place}</div></div>`; }).join('');
      const rest = order.slice(3).map((p, i) => `<li>${i + 4}. ${W.bust(p, 'sm')}<b>${esc(p.name)}</b><span>${aed(t[p.id].total)}</span></li>`).join('');
      const fun = (x.fun || []).map((f) => `<div class="fun"><small>${esc(f.title)}</small><b>${name(f.who)}</b><span>${esc(f.text)}</span></div>`).join('');
      return `<div class="center end"><h1 class="say gold">Richest traveller</h1><div class="podium">${steps}</div>${rest ? `<ol class="rest">${rest}</ol>` : ''}<div class="funs">${fun}</div></div>`;
    },
  };

  // ---------------------------------------------------------------- render
  let lastKey = '';
  function render() {
    if (!S) return;
    document.body.dataset.phase = S.phase; document.body.dataset.step = S.step || '';
    setHall(); mount(top, topBar()); mount(dock, dockHtml());
    const html = (R[S.phase] || (() => ''))();
    const key = `${S.phase}|${S.step}|${S.round}|${S.x?.bag?.id || ''}|${S.x?.who || ''}`;
    if (key !== lastKey) { lastKey = key; stage.classList.remove('enter'); void stage.offsetWidth; stage.classList.add('enter'); stage.innerHTML = html; stage.__html = html; }
    else if (stage.__html !== html) {
      // small changes (a bribe going up, a bag zipped) patch in place without replaying the entrance
      const t = document.createElement('div'); t.innerHTML = html;
      const same = ['#env', '#form'].every((q) => !!t.querySelector(q) === !!stage.querySelector(q));
      if (same && S.phase === 'DESK') { ['#env', '#form'].forEach((q) => { const n = t.querySelector(q); const el = stage.querySelector(q); if (n && el && el.innerHTML !== n.innerHTML) { el.innerHTML = n.innerHTML; el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); } }); const b1 = t.querySelector('.banner'); const b0 = stage.querySelector('.banner'); if (b1 && b0) b0.outerHTML = b1.outerHTML; const d1 = t.querySelector('.right'); const d0 = stage.querySelector('.right'); if (d1 && d0 && d0.innerHTML !== d1.innerHTML) d0.innerHTML = d1.innerHTML; const q1 = t.querySelector('.queue'); const q0 = stage.querySelector('.queue'); if (q1 && q0) q0.innerHTML = q1.innerHTML; }
      else stage.innerHTML = html;
      stage.__html = html;
    }
    music(); talkTick();
  }
  let lastMusic = null;
  function music() {
    const ph = S.phase;
    let key = 'ntd-lobby'; let mood = 'lobby';
    if (ph === 'PACK' || ph === 'BELT' || ph === 'ROUND') { key = 'ntd-pack'; mood = 'casting'; }
    else if (ph === 'DESK' || ph === 'RED') { key = 'ntd-desk'; mood = 'tense'; }
    else if (ph === 'SCORES') { key = 'ntd-scores'; mood = 'ratings'; }
    else if (ph === 'AWARDS' || ph === 'END') { key = 'ntd-awards'; mood = 'finale'; }
    AV.setBed(ph === 'DESK' ? 0.36 : 0.5);
    const id = `${key}|${mood}`;
    if (id !== lastMusic) { lastMusic = id; AV.music(key, mood); }
  }
  // the clock ticks under the arguing at the desk
  let tickT = null;
  function talkTick() {
    const on = S.phase === 'DESK' && S.step === 'talk';
    if (on && !tickT) tickT = setInterval(() => { if (S.phase === 'DESK' && S.step === 'talk') AV.fx('ntd-tick', { gap: 3500, vol: 0.5 }); }, 4000);
    if (!on && tickT) { clearInterval(tickT); tickT = null; }
  }

  // ---------------------------------------------------------------- Brenda on the tannoy, and the sound effects
  let lastCue = null; let lastFx = 0; let capTimer = null; let lastPlayers = 0; let lastEnd = 0;
  function effects() {
    const cue = S.cue;
    if (cue && cue.id !== lastCue) {
      lastCue = cue.id;
      tannoy.innerHTML = `<div class="bubble"><img src="${brendaSrc(cue.mood) || ''}" alt=""><div><small>Supervisor Brenda</small><p>${esc(cue.text)}</p></div></div>`; tannoy.className = 'show';
      clearTimeout(capTimer);
      if (Date.now() - lastEnd > 6000) AV.fx('ntd-chime', { gap: 2500, vol: 0.45 }); // the tannoy chimes when Brenda starts talking after a quiet spell
      AV.speak(cue, (id) => { lastEnd = Date.now(); socket.emit('host:cueDone', { id }); capTimer = setTimeout(() => { if (lastCue === id) tannoy.className = ''; }, 700); });
    } else if (!cue && lastCue && AV.speakingId() === lastCue && S.phase !== 'DESK') { AV.stopVoice(); tannoy.className = ''; lastCue = null; } else if (!cue) { if (!AV.speakingId()) tannoy.className = ''; }
    const fresh = (S.fx || []).filter((f) => f.id > lastFx);
    if (P === null) lastFx = Math.max(0, ...(S.fx || []).map((f) => f.id)); else fresh.forEach((f) => { lastFx = Math.max(lastFx, f.id); AV.fx(f.name, { gap: 200 }); });
    if (S.phase === 'LOBBY' && S.players.length > lastPlayers && P) AV.fx('join');
    lastPlayers = S.players.length;
  }
})();
