/* BID-COIN! The TV is the auction yard: the locker, the price, the reveal. */
(() => {
  const $ = (q) => document.querySelector(q);
  const esc = W.esc;
  const TEST = new URLSearchParams(location.search).has('test');
  const socket = io({ autoConnect: false, transports: ['websocket', 'polling'] });
  window.__gnSocket = socket;
  window.__gnTV = true;
  const stage = $('#stage'); const top = $('#top'); const dock = $('#dock'); const caption = $('#caption'); const splashEl = $('#splash');
  let S = null; let P = null;
  const totals = {};

  // ---------------------------------------------------------------- boot
  $('#bOpen').onclick = async () => {
    AV.init(); await W.ready; $('#gate').classList.add('hide');
    try { document.documentElement.requestFullscreen?.(); } catch (e) { /* fine */ }
    socket.connect();
  };
  const KEY = TEST ? 'bcHostTest' : 'bcHost';
  socket.on('connect', () => {
    const saved = sessionStorage.getItem(KEY);
    const create = () => { const from = sessionStorage.getItem('gnPrev'); sessionStorage.removeItem('gnPrev'); socket.emit('host:create', { game: 'bc', test: TEST, from }, (r) => sessionStorage.setItem(KEY, r.code)); };
    if (saved) socket.emit('host:attach', { code: saved, game: 'bc' }, (r) => { if (r.error) { if (S && S.phase !== 'LOBBY') flash('The game server restarted, so that game ended. Here is a fresh one.', 9000); create(); } }); else create();
  });
  function goMenu() { if (S) sessionStorage.setItem('gnPrev', S.code); sessionStorage.removeItem(KEY); location.href = TEST ? '/tv?test' : '/tv'; }
  socket.on('menu', goMenu);
  socket.on('state', (s) => { W.syncClock(s.now); P = S; S = s; window.__S = s; if (s.auc) setAuc(s.auc, true); render(); effects(); preload(s.preload); });
  // the fast lane: every bid arrives as a tiny message and only the auction numbers are redrawn
  socket.on('bc:b', (a) => { if (!S) return; setAuc(a, false); });
  $('#bMusic').onclick = (e) => { e.target.textContent = AV.toggleMusic() ? 'Music on' : 'Music off'; lastMusic = null; music(); };
  $('#bSfx').onclick = (e) => { e.target.textContent = AV.toggleSfx() ? 'Sounds on' : 'Sounds off'; };
  $('#bVoice').onclick = (e) => { e.target.textContent = AV.toggleVoice() ? 'Auctioneer on' : 'Auctioneer off'; };
  $('#bSkip').onclick = () => socket.emit('host:skip');
  $('#bFull').onclick = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.());
  document.addEventListener('keydown', (e) => { if (e.code === 'Space' && S && S.phase !== 'LOBBY') { e.preventDefault(); socket.emit('host:skip'); } });
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tv]'); if (!b) return;
    const a = b.dataset.tv;
    if (a === 'bot') socket.emit('host:addBot', {}, (r) => { if (r?.error) flash(r.error); });
    if (a === 'fill') { const need = Math.max(0, 3 - S.players.length); for (let i = 0; i < need; i++) socket.emit('host:addBot', {}); }
    if (a === 'nobots') socket.emit('host:removeBots', {});
    if (a === 'start') socket.emit('host:start', {}, (r) => { if (r?.error) flash(r.error); });
    if (a === 'menu') goMenu();
  });
  function flash(t, ms = 2500) { caption.textContent = t; caption.className = 'show'; setTimeout(() => { caption.className = ''; }, ms); }
  // a safety net: if the screen hears nothing for 40 seconds mid-game, reconnect and ask for the latest
  let heard = Date.now();
  socket.on('state', () => { heard = Date.now(); });
  socket.on('bc:b', () => { heard = Date.now(); });
  setInterval(() => {
    if (!S || S.phase === 'LOBBY' || S.phase === 'END') return;
    if (Date.now() - heard > 40000) { heard = Date.now(); if (socket.connected) socket.emit('host:attach', { code: S.code, game: 'bc' }, () => {}); else socket.connect(); }
  }, 5000);
  const warm = new Set();
  function preload(list) { (list || []).forEach((img) => { if (warm.has(img)) return; warm.add(img); const i = new Image(); i.decoding = 'async'; i.referrerPolicy = 'no-referrer'; i.src = photo(img); }); }

  // ---------------------------------------------------------------- helpers
  const aed = (n) => `${n < 0 ? '-' : ''}AED ${Math.abs(Math.round(n)).toLocaleString('en-US')}`;
  const num = (n) => Math.round(n).toLocaleString('en-US');
  const signed = (n) => `${n >= 0 ? '+' : '-'}${aed(Math.abs(n))}`;
  const T = () => { if (!S.endsAt) return ''; if (!totals[S.endsAt]) totals[S.endsAt] = Math.max(1, S.endsAt - W.now()); return `data-ends="${S.endsAt}" data-total="${totals[S.endsAt]}"`; };
  const timer = () => (S.endsAt ? `<div class="timer"><i ${T()} data-kind="bar"></i></div>` : '');
  const host = () => { try { return new URL(S.joinUrl).host; } catch (e) { return location.host; } };
  const P_ = (id) => S.players.find((p) => p.id === id);
  const name = (id) => (id === 'phantom' ? 'Mystery bidder' : esc(P_(id)?.name || 'Someone'));
  const rot = (i) => ((i * 47) % 9) - 4;
  const CATS = { tech: '📻', toys: '🧸', sports: '🏏', jewels: '💍', art: '🖼️', cars: '🚗', music: '🎸', fashion: '👢', antiques: '🏺', home: '☕', weird: '🦩', sealed: '🔒' };
  const RAR = { j: 'Junk', d: 'Decent', r: 'Rare', l: 'Legendary', x: 'Cursed', s: 'Sealed', c: 'Car', z: 'Disaster' };
  const CARD = {
    xray: ['X-Ray Specs', '🩻'], tip: ['Insider Tip', '🕵️'], plant: ['The Plant', '🪴'], freeze: ['Freeze', '🧊'], phantom: ['Phantom Bidder', '👻'],
    steal: ['Steal', '🦝'], tax: ['Tax Man', '🧾'], swap: ['Swap Meet', '🔁'], appraise: ['Appraiser', '🔍'], curse: ['Pass the Curse', '🧿'], lock: ['Lock', '🛡️'],
  };
  const photo = (img) => (img ? (/^(https?:)?\//.test(img) ? img : `/assets/bc/items/${img}.webp`) : null);
  const pic = (it) => (photo(it.img) ? `<img src="${esc(photo(it.img))}" alt="" decoding="async" referrerpolicy="no-referrer" onerror="this.remove()">` : `<div class="noph"><span>${CATS[it.cat] || '📦'}</span></div>`);
  const tagFor = (it) => (it.sealed ? '<b>???</b><i>Sealed</i>' : `<b>${aed(it.value)}</b><i>${it.pct ? `${Math.round(it.pct * 100)}% of cash` : RAR[it.rar] || ''}${it.appraised ? ' x1.5' : ''}</i>`);
  const itemCard = (it, i, cls = '') => `<div class="item r-${it.rar} ${it.back ? 'back' : ''} ${it.legend ? 'one' : ''} ${it.swapped ? 'swapped' : ''} ${cls}" style="--r:${rot(i)}deg;--i:${i}"><div class="ph">${pic(it)}</div><div class="nm">${esc(it.name)}</div><div class="tag">${tagFor(it)}</div>${it.legend ? '<em class="onebadge">One of a kind</em>' : ''}${it.was ? `<em class="wasbadge">Looked like: ${esc(it.was)}</em>` : ''}${it.swapped ? '<em class="stamp sw">Swapped</em>' : ''}</div>`;
  const cardArt = (k) => (W.img(`bc-card-${k}`) ? `<img class="full" src="${W.img(`bc-card-${k}`)}" alt="${esc(CARD[k]?.[0] || '')}">` : `<div class="cemo">${CARD[k]?.[1] || '🃏'}</div>`);

  // ---------------------------------------------------------------- the yard behind everything (your art if it's there)
  let lastArt = '';
  function setYard() {
    const ph = S.phase;
    const want = ph === 'LOBBY' || ph === 'INTRO' || ph === 'TUTORIAL' ? 'bc-yard' : ph === 'AUCTION' || ph === 'BET' ? 'bc-auction' : ph === 'REVEAL' || ph === 'AFTER' ? 'bc-inside' : ph === 'FINALE' || ph === 'END' ? 'bc-finale' : 'bc-yard';
    const img = W.img(want) || W.img('bc-yard');
    const key = `${img}|${ph}`; if (key === lastArt) return; lastArt = key;
    $('#yard').className = `${img ? 'has-art' : ''} p-${ph.toLowerCase()}`;
    $('#art').style.backgroundImage = img ? `url(${img})` : 'none';
  }

  // ---------------------------------------------------------------- frame
  function topBar() {
    const lk = S.locker;
    const logo = W.img('bc-logo') ? `<img class="logo" src="${W.img('bc-logo')}" alt="BID-COIN!">` : '<div class="logo word">BID-COIN!</div>';
    const mid = lk ? `<div class="lnum"><span>Locker ${lk.n} of ${lk.total}</span><b>${esc(lk.origin)}</b>${lk.special === 'mega' ? '<em class="sp mega">The billionaire\'s vault: more stuff, better stuff</em>' : lk.special === 'mystery' ? '<em class="sp mys">Mystery locker: no peeking</em>' : lk.special === 'garage' ? '<em class="sp gar">A garage: there\'s a car at the back</em>' : ''}</div>` : '<div></div>';
    return `${S.phase === 'LOBBY' ? '<div></div>' : logo}${mid}<div class="code"><b>${esc(S.code)}</b><small>${esc(host())}/bc${TEST ? ' · test mode' : ''}</small></div>`;
  }
  function dockHtml() {
    if (S.phase === 'LOBBY') return '';
    const a = S.auc; const lk = S.locker;
    return `<div class="paddles">${S.players.map((p, i) => {
      const lead = a && a.leader === p.id && S.phase === 'AUCTION';
      const owner = lk && lk.owner === p.id && ['BET', 'REVEAL', 'AFTER', 'RESULT'].includes(S.phase);
      const frozen = a && a.frozen && a.frozen[p.id] && S.phase === 'AUCTION';
      const status = S.phase === 'PEEK' ? (p.ready ? '<em class="st ok">Seen it</em>' : '<em class="st">Peeking</em>') : S.phase === 'BET' && lk && lk.owner !== p.id ? (p.bet ? '<em class="st ok">Bet placed</em>' : '') : '';
      return `<div class="paddle ${lead ? 'lead' : ''} ${owner ? 'owner' : ''} ${frozen ? 'frozen' : ''} ${p.connected ? '' : 'off'}" id="pd-${p.id}" style="--c:${p.color}"><div class="num">${i + 1}</div>${W.bust(p, 'md')}<div class="pt"><b>${esc(p.name)}</b><span class="cash">${aed(p.cash)}</span></div><div class="inv">${'<i class="cd"></i>'.repeat(p.cards)}${p.sealed ? `<i class="sl" title="sealed">🔒${p.sealed > 1 ? p.sealed : ''}</i>` : ''}${p.cursed ? `<i class="cu" title="cursed">🧿${p.cursed > 1 ? p.cursed : ''}</i>` : ''}</div>${status}${frozen ? '<em class="ice">Frozen</em>' : ''}</div>`;
    }).join('')}</div>`;
  }

  // ---------------------------------------------------------------- the locker door
  const door = (open, lk, inside = '') => {
    const art = W.img('bc-door');
    const inArt = W.img('bc-inside');
    return `<div class="locker ${open}"><div class="opening"><div class="inside ${inArt ? 'art' : ''}" ${inArt ? `style="background-image:url(${inArt})"` : ''}>${inside}<div class="beam"></div></div><div class="door" ${art ? `style="background-image:url(${art})"` : ''}><div class="plate">${String(lk?.n || 0).padStart(2, '0')}</div><div class="handle"></div></div></div><div class="frame"></div></div>`;
  };
  const shapes = (n) => Array.from({ length: n }, (_, i) => `<i class="box b${i % 5}" style="--i:${i}"></i>`).join('');

  // ---------------------------------------------------------------- the stage
  const R = {
    LOBBY() {
      const n = S.players.length;
      const art = W.img('bc-title');
      const people = S.players.map((p, i) => `<div class="joiner" style="--c:${p.color};--r:${rot(i)}deg">${W.bust(p, 'md')}<b>${esc(p.name)}</b>${p.bot ? '<small>bot</small>' : ''}</div>`).join('');
      const tools = TEST ? `<div class="testbar" id="testbar"><button data-tv="bot">Add a bot</button><button data-tv="fill">Fill to 3</button><button data-tv="nobots">Remove bots</button><button data-tv="start" ${n < 2 ? 'disabled' : ''}>Start</button></div>` : '';
      return `<div class="lobby">
        <div class="lhead">${art ? `<img class="titleart" src="${art}" alt="BID-COIN!">` : '<h1 class="mark">BID-COIN!</h1>'}<p class="strap">Eight storage lockers. ${aed(S.rules.start)} each. Richest at the end wins.</p></div>
        <div class="joincard"><img src="${S.qr || ''}" alt="QR code to join"><div><p>Scan, or go to</p><b class="url">${esc(host())}/bc</b><p>and enter</p><b class="big">${esc(S.code)}</b></div></div>
        <div class="joiners" id="joiners">${people || '<p class="hint">Waiting for bidders...</p>'}</div>
        <p class="hint" id="lhint">${n < 2 ? `${n} of 2 needed. Up to 8 can play.` : `${n} bidders. The first to join starts from their phone, and can add bots there too.`}</p>${tools}</div>`;
    },
    INTRO() { return `<div class="center"><h1 class="mark huge">BID-COIN!</h1><p class="lede">${aed(S.rules.start)} each. ${S.rules.lockers} lockers. Go.</p></div>`; },
    TUTORIAL() {
      const k = S.x.key; let body = '';
      if (k === 'peek') body = `<div class="tut-peek">${door('crack', { n: 1 }, shapes(6))}<div class="phones">${['Rolex?', 'A guitar', 'Old shoes'].map((t, i) => `<div class="mini" style="--r:${rot(i)}deg"><span>Your peek</span><b>${t}</b></div>`).join('')}</div></div><p class="tnote">Everyone sees something different. Only you know what you saw.</p>`;
      if (k === 'bid') body = `<div class="tut-bid"><div class="bigprice">${aed(S.rules.start * 0.3)}</div><div class="incs">${S.rules.inc.map((n) => `<span>+${num(n)}</span>`).join('')}</div><div class="calls"><em>Going once</em><em>Going twice</em><em class="sold">SOLD</em></div></div><p class="tnote">No bids for 5 seconds and the hammer falls.</p>`;
      if (k === 'bet') body = `<div class="tut-bet"><div class="bb v-boom">BOOM<small>they make money</small></div><div class="bb v-bust">BUST<small>they lose money</small></div></div><p class="tnote">Bet ${aed(S.rules.stake)}. Win it, and you get a power card too.</p>`;
      if (k === 'cards') body = `<div class="fan">${['freeze', 'plant', 'steal', 'tax', 'phantom'].map((c, i) => `<div class="pcard" style="--i:${i}">${cardArt(c)}<b>${CARD[c][0]}</b></div>`).join('')}</div><p class="tnote">You start with 2. Win a locker or a bet to get more. Hold up to ${S.rules.hand}.</p>`;
      const prog = Array.from({ length: S.x.slides }, (_, i) => `<i class="${i === S.x.slide ? 'on' : i < S.x.slide ? 'done' : ''}"></i>`).join('');
      return `<div class="center tut"><div class="tprog">${prog}</div><h2 class="say">${esc(S.x.title || '')}</h2>${body}</div>`;
    },
    LOCKER() {
      const lk = S.locker;
      return `<div class="center"><div class="tagline"><span>Locker ${lk.n}</span><b>${esc(lk.origin)}</b></div>${door('shut rolling', lk)}${lk.special ? `<div class="stampbig ${lk.special}">${lk.special === 'mega' ? 'Double value' : lk.special === 'garage' ? 'Garage' : 'Mystery'}</div>` : ''}</div>`;
    },
    PEEK() {
      const lk = S.locker; const seen = S.players.filter((p) => p.ready).length;
      return `<div class="center"><div class="split">${door(lk.special === 'mystery' ? 'shut' : 'crack', lk, shapes(Math.min(9, lk.count)))}<div class="side"><h2 class="say">${lk.special === 'mystery' ? 'No peeking!' : 'Peek on your phone'}</h2><p class="lede">${lk.count} things inside. ${lk.special === 'mystery' ? 'Only X-Ray Specs can see in.' : 'Everyone saw something different.'}</p>${timer()}<p class="count" id="peeked">${seen} of ${S.players.length} have looked</p></div></div></div>`;
    },
    AUCTION() {
      const lk = S.locker;
      return `<div class="center"><div class="split auc">${door('half', lk, shapes(Math.min(9, lk.count)))}<div class="side"><div class="board" id="aucboard">${aucBoard()}</div></div></div></div>`;
    },
    BET() {
      const lk = S.locker; const a = S.auc;
      if (S.step === 'none') return `<div class="center"><div class="stampbig grey">No takers</div><p class="lede">Nobody bid. Let's see what you missed.</p></div>`;
      const who = lk.phantom ? '<div class="phantom">👻</div><b>The mystery bidder</b>' : `${W.bust(P_(lk.owner), 'xl')}<b>${name(lk.owner)}</b>`;
      return `<div class="center"><div class="sold"><div class="soldstamp">SOLD</div><div class="winner" style="--c:${P_(lk.owner)?.color || '#888'}">${who}<span class="price">${aed(lk.price || a?.price || 0)}</span>${lk.stolen ? `<em class="stolen">Stolen from ${name(lk.stolen.from)}</em>` : ''}</div></div>
        <h2 class="say">${lk.phantom ? 'Nobody gets it. But will it boom?' : 'Boom or bust? Bet on your phone'}</h2>${timer()}<p class="count" id="bets">${lk.betCount || 0} bets placed</p></div>`;
    },
    REVEAL() { return revealHtml(); },
    AFTER() { return revealHtml(true); },
    RESULT() {
      const lk = S.locker; const r = lk.result || {};
      const ranked = [...S.players].sort((a, b) => b.cash - a.cash);
      const max = Math.max(1, ...ranked.map((p) => p.cash));
      const head = r.owner ? `<h2 class="say">${name(r.owner)} ${r.profit >= 0 ? 'made' : 'lost'} <span class="${r.profit >= 0 ? 'g' : 'rd'}">${aed(Math.abs(r.profit))}</span></h2>` : `<h2 class="say">${r.phantom ? 'The phantom kept it' : 'Nobody bought it'}</h2>`;
      const fx = (lk.effects || []).filter((e) => e.k === 'tax' && e.cut).map((e) => `<p class="lede">The Tax Man took ${aed(e.cut)} for ${name(e.by)}.</p>`).join('');
      const bars = ranked.map((p, i) => `<div class="bar" style="--c:${p.color};--w:${Math.max(4, (p.cash / max) * 100)}%;--i:${i}">${W.bust(p, 'sm')}<b>${esc(p.name)}</b><span><i></i></span><em>${aed(p.cash)}</em></div>`).join('');
      return `<div class="center result">${head}${fx}<div class="bars">${bars}</div><p class="hint">${lk.n < lk.total ? `Next: locker ${lk.n + 1}` : 'That was the last one'}</p></div>`;
    },
    FINALE() {
      const x = S.x;
      if (x.step === 'box') {
        const p = P_(x.who); const it = x.inner;
        return `<div class="center finale"><div class="owner">${W.bust(p, 'md')}<b>${name(x.who)}'s sealed box</b></div><div class="boxes">${itemCard({ ...x.box, cat: 'sealed', rar: 's', sealed: true }, 0, it ? 'opened' : 'shake')}${it ? itemCard(it, 1, 'pop') : ''}</div>${it ? `<p class="lede">${esc(it.line || '')}</p>` : '<p class="lede">Drumroll...</p>'}</div>`;
      }
      if (x.step === 'curse') return `<div class="center finale"><h2 class="say">The cursed bills</h2><div class="bills">${(x.bills || []).map((b, i) => `<div class="bill" style="--r:${rot(i)}deg">${W.bust(P_(b.id), 'sm')}<b>${name(b.id)}</b>${b.items.map((c) => `<p>${esc(c.name)}<span>${aed(c.value)}</span></p>`).join('')}<p class="tot">Total<span>${aed(b.total)}</span></p></div>`).join('')}</div></div>`;
      return `<div class="center"><h1 class="mark">The sealed boxes</h1><p class="lede">Everything locked up gets opened now.</p></div>`;
    },
    END() {
      const x = S.x; const ranks = x.ranks || [];
      const pod = ranks.slice(0, 3); const order = [pod[1], pod[0], pod[2]].filter(Boolean);
      const podium = order.map((p) => { const place = ranks.indexOf(p) + 1; return `<div class="step s${place}" style="--c:${p.color}">${W.bust(p, place === 1 ? 'xl' : 'lg')}<b>${esc(p.name)}</b><span>${aed(p.cash)}</span><div class="block">${place}</div></div>`; }).join('');
      const rest = ranks.slice(3).map((p, i) => `<li>${i + 4}. ${esc(p.name)} <span>${aed(p.cash)}</span></li>`).join('');
      const awards = (x.awards || []).map((a, i) => `<div class="award" style="--r:${rot(i)}deg"><small>${esc(a.title)}</small><b>${name(a.who)}</b><span>${esc(a.text)}</span></div>`).join('');
      return `<div class="center end"><div class="podium">${podium}</div>${rest ? `<ol class="rest">${rest}</ol>` : ''}<div class="awards">${awards}</div><p class="hint">${esc(P_(S.vipId)?.name || 'The first player')} can play again, or go back to the game menu, from their phone.</p><button class="menubtn" data-tv="menu">Back to the game menu</button></div>`;
    },
  };

  function revealHtml(after) {
    const lk = S.locker; const shown = lk.shown || []; const last = shown[shown.length - 1];
    const v = lk.verdict; const st = S.step;
    const grid = shown.map((it, i) => itemCard(it, i, i === shown.length - 1 && !v && !after ? 'new' : '')).join('');
    const plants = (lk.plants || []).map((p, i) => `<div class="item r-l planted" style="--r:${rot(i + 3)}deg"><div class="ph">${pic(p.item)}</div><div class="nm">${esc(p.item.name)}</div><em class="stamp pl">Planted by ${name(p.by)}</em></div>`).join('');
    const found = shown.reduce((s, it) => s + (it.sealed || it.swapped ? 0 : it.value), 0);
    const meter = lk.owner || lk.phantom ? `<div class="meter" id="meter"><div><small>Paid</small><b>${aed(lk.price)}</b></div><div><small>Found so far</small><b class="${found >= lk.price ? 'g' : ''}">${aed(found)}</b></div>${v ? `<div class="verdict ${v.profit > 0 ? 'v-boom' : 'v-bust'}">${v.profit > 0 ? 'BOOM' : 'BUST'}<span>${signed(v.profit)}</span></div>` : ''}</div>` : `<div class="meter" id="meter"><div><small>Nobody paid</small><b>AED 0</b></div><div><small>Worth</small><b>${aed(found)}</b></div></div>`;
    const spot = last && !v && !after && st !== 'plant' ? `<div class="spot" id="spot"><p class="line">${esc(last.line || '')}</p>${last.credit ? `<small class="credit">Photo: ${esc(last.credit)}</small>` : ''}</div>` : '';
    const backHint = st === 'back' && (!last || !last.back) ? '<div class="backhint">At the back of the locker...</div>' : '';
    const bets = lk.bets ? `<div class="betrow">${Object.entries(lk.bets).map(([id, b]) => `<span class="chip ${b.won ? 'won' : 'lost'}">${name(id)}: ${b.pick === 'boom' ? 'Boom' : 'Bust'} ${b.won ? `+${S.rules.stake}` : `-${S.rules.stake}`}</span>`).join('')}</div>` : '';
    const fx = (lk.effects || []).map((e) => `<span class="chip fx">${CARD[e.k]?.[1] || ''} ${name(e.by)}: ${CARD[e.k]?.[0] || e.k}${e.item ? ` (${esc(e.item)})` : ''}</span>`).join('');
    const afterBar = after ? `<div class="afterbar"><b>Last chance for power cards</b>${timer()}</div>` : '';
    return `<div class="reveal"><div class="toprow">${meter}${afterBar}</div>${backHint}<div class="grid n${Math.min(11, shown.length + (lk.plants || []).length)}" id="grid">${grid}${plants}</div>${spot}${bets}${fx ? `<div class="betrow">${fx}</div>` : ''}</div>`;
  }

  // ---------------------------------------------------------------- the auction board, redrawn on every bid
  let AUC = null; let aucAt = 0; let lastSeq = -1; let lastHist = 0;
  function setAuc(a, fromState) {
    if (!a) return;
    if (AUC && a.seq < AUC.seq && !fromState) return; // an older message, ignore
    const prev = AUC; AUC = a; aucAt = performance.now();
    if (S) S.auc = a;
    if (!prev || a.n > prev.n) { if (prev && S.phase === 'AUCTION') { AV.fx(a.leader === 'phantom' ? 'bc-phantom' : 'bc-bid', { gap: 60 }); if (AV.speakingId() && /Going/.test(caption.textContent)) { AV.stopVoice(); caption.className = ''; } } }
    if (S.phase === 'AUCTION') { const el = $('#aucboard'); if (el) mount(el, aucBoard()); mount(dock, dockHtml()); }
    lastSeq = a.seq;
  }
  function aucBoard() {
    const a = AUC || S.auc; if (!a) return '';
    const lead = a.leader; const lp = P_(lead);
    const call = a.done && lead ? '<div class="call sold">SOLD</div>' : a.calls === 2 ? '<div class="call c2">Going twice</div>' : a.calls === 1 ? '<div class="call c1">Going once</div>' : '';
    const who = lead === 'phantom' ? '<div class="leader ph"><div class="phantom sm">👻</div><b>Mystery bidder</b></div>' : lp ? `<div class="leader" style="--c:${lp.color}">${W.bust(lp, 'lg')}<b>${esc(lp.name)}</b></div>` : '<div class="leader none"><b>No bids yet</b><small>Opening at</small></div>';
    const hist = a.hist.slice().reverse().map((h, i) => `<li class="${i === 0 ? 'top' : ''}"><span>${name(h.who)}</span><b>+${num(h.inc)}</b><em>${num(h.price)}</em></li>`).join('');
    const frozen = Object.keys(a.frozen || {}).map((id) => `<span class="chip ice">🧊 ${name(id)}</span>`).join('');
    return `<div class="price ${a.calls ? 'hot' : ''}" id="price"><small>AED</small>${num(a.price)}</div>${who}${call}<div class="hammer"><i id="hbar" style="--dl:${a.dl}ms;--win:${a.win}ms" class="${a.done ? 'done' : ''}" data-k="${a.seq}"></i></div><ol class="hist">${hist}</ol>${frozen ? `<div class="frozen">${frozen}</div>` : ''}`;
  }
  // the hammer bar drains between bids (local clock, so no lag from the network)
  (function hammer() {
    const el = document.getElementById('hbar');
    if (el && AUC && S && S.phase === 'AUCTION') { const left = Math.max(0, AUC.dl - (performance.now() - aucAt)); el.style.transform = `scaleX(${AUC.done ? 0 : left / Math.max(1, AUC.win)})`; }
    requestAnimationFrame(hammer);
  })();

  // ---------------------------------------------------------------- splash: a power card was played
  let lastSplash = 0;
  function showSplash() {
    const sp = S.splash; if (!sp || sp.id === lastSplash) return;
    const fresh = P !== null; lastSplash = sp.id; if (!fresh) return;
    const by = sp.by ? name(sp.by) : 'Someone'; const t = sp.target ? name(sp.target) : '';
    const text = {
      freeze: `${by} froze ${t}! No bidding for 10 seconds.`, phantom: 'A mystery bid! +AED 3,000 from nowhere.', steal: `${by} stole it from ${t} for ${aed(sp.price || 0)}!`,
      tax: `${by} sends the Tax Man after ${t}. 15% of the profit.`, lock: `BLOCKED! ${by} locks out ${t}'s ${esc(CARD[sp.blocked]?.[0] || 'card')}.`, swap: `${by} swaps ${sp.mine ? esc(sp.mine) : 'some cash'} for the ${esc(sp.item || 'best find')}!`,
      appraise: `${by} gets the ${esc(sp.item || 'best find')} appraised. Worth 50% more!`, curse: `${by} passes the ${esc(sp.item || 'curse')} to ${t}!`,
    }[sp.k] || '';
    splashEl.innerHTML = `<div class="sp k-${sp.k}"><div class="pcard big">${cardArt(sp.k)}<b>${esc(sp.name)}</b></div><p>${text}</p></div>`;
    // during the auction the splash stays small, so nobody loses sight of the price
    const mini = S.phase === 'AUCTION';
    splashEl.className = `show${mini ? ' mini' : ''}`; clearTimeout(showSplash.t); showSplash.t = setTimeout(() => { splashEl.className = mini ? 'mini' : ''; }, mini ? 2000 : 2600);
  }

  // ---------------------------------------------------------------- render
  function skeleton(root) { const c = root.cloneNode(true); c.querySelectorAll('[id]').forEach((n) => { n.innerHTML = ''; }); return c.innerHTML; }
  let lastKey = '';
  function render() {
    if (!S) return;
    document.body.dataset.phase = S.phase;
    setYard(); mount(top, topBar()); mount(dock, dockHtml());
    const html = (R[S.phase] || (() => ''))();
    const key = `${S.phase}|${S.locker?.n || 0}|${S.phase === 'BET' ? S.step : ''}|${S.phase === 'FINALE' ? `${S.x.step}${S.x.box?.name || ''}${S.x.who || ''}` : ''}|${S.phase === 'TUTORIAL' ? S.x.slide : ''}`;
    if (key !== lastKey) {
      lastKey = key; stage.classList.remove('enter'); void stage.offsetWidth; stage.classList.add('enter');
      stage.innerHTML = html; stage.__html = html; stage.__skel = skeleton(stage);
      setTimeout(() => stage.classList.remove('enter'), 1600);
    } else if (stage.__html !== html) {
      // patch the parts with an id in place; if anything else changed, redraw (without the entrance animation)
      const t = document.createElement('div'); t.innerHTML = html;
      const skel = skeleton(t);
      if (skel !== stage.__skel) stage.innerHTML = html;
      else t.querySelectorAll('[id]').forEach((n) => { const el = stage.querySelector(`#${n.id}`); if (el) mount(el, n.innerHTML); });
      stage.__html = html; stage.__skel = skel;
    }
    showSplash(); music();
  }
  let lastMusic = null;
  function music() {
    const ph = S.phase;
    let key = 'bc-lobby'; let mood = 'lobby';
    if (ph === 'PEEK' || ph === 'LOCKER') { key = 'bc-peek'; mood = 'tense'; }
    else if (ph === 'AUCTION' || ph === 'BET') { key = 'bc-auction'; mood = 'pitch'; }
    else if (ph === 'REVEAL' || ph === 'AFTER' || ph === 'RESULT') { key = 'bc-reveal'; mood = 'ratings'; }
    else if (ph === 'FINALE' || ph === 'END') { key = 'bc-finale'; mood = 'finale'; }
    AV.setBed(ph === 'AUCTION' ? 0.42 : 0.5);
    const id = `${key}|${mood}`;
    if (id !== lastMusic) { lastMusic = id; AV.music(key, mood); }
  }

  // ---------------------------------------------------------------- the Auctioneer and sound effects
  let lastCue = null; let lastFx = 0; let capTimer = null; let lastPlayers = 0;
  function effects() {
    const cue = S.cue;
    if (cue && cue.id !== lastCue) {
      lastCue = cue.id; caption.textContent = cue.text; caption.className = 'show';
      clearTimeout(capTimer);
      AV.speak(cue, (id) => { socket.emit('host:cueDone', { id }); capTimer = setTimeout(() => { if (lastCue === id) caption.className = ''; }, 500); });
    } else if (!cue && lastCue && AV.speakingId() === lastCue && S.phase !== 'AUCTION') { AV.stopVoice(); caption.className = ''; lastCue = null; } else if (!cue) { if (!AV.speakingId()) caption.className = ''; }
    const fresh = (S.fx || []).filter((f) => f.id > lastFx);
    if (P === null) lastFx = Math.max(0, ...(S.fx || []).map((f) => f.id)); else fresh.forEach((f) => { lastFx = Math.max(lastFx, f.id); AV.fx(f.name, { gap: 200 }); });
    if (S.phase === 'LOBBY' && S.players.length > lastPlayers && P) AV.fx('join');
    lastPlayers = S.players.length;
  }
})();
