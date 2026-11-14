/* LAND GRAB: the TV. The village is the board; the paper cards are the council's business. */
(() => {
  const $ = (q) => document.querySelector(q);
  const esc = W.esc;
  const TEST = new URLSearchParams(location.search).has('test');
  const socket = io({ autoConnect: false });
  window.__gnSocket = socket;
  window.__gnTV = true;
  const stage = $('#stage'); const top = $('#top'); const board = $('#board'); const reg = $('#reg'); const dock = $('#dock'); const caption = $('#caption');
  let S = null; let P = null;
  const totals = {};

  // ---------------------------------------------------------------- boot
  $('#bOpen').onclick = async () => {
    AV.init(); await W.ready; $('#gate').classList.add('hide');
    try { document.documentElement.requestFullscreen?.(); } catch (e) { /* fine */ }
    socket.connect();
  };
  const KEY = TEST ? 'lgHostTest' : 'lgHost';
  socket.on('connect', () => {
    const saved = sessionStorage.getItem(KEY);
    const create = () => { const from = sessionStorage.getItem('gnPrev'); sessionStorage.removeItem('gnPrev'); socket.emit('host:create', { game: 'lg', test: TEST, from }, (r) => sessionStorage.setItem(KEY, r.code)); };
    if (saved) socket.emit('host:attach', { code: saved, game: 'lg' }, (r) => { if (r.error) create(); }); else create();
  });
  // back to the game night menu; the next game brings everyone along
  function goMenu() { if (S) sessionStorage.setItem('gnPrev', S.code); sessionStorage.removeItem(KEY); location.href = TEST ? '/tv?test' : '/tv'; }
  socket.on('menu', goMenu);
  socket.on('state', (s) => { W.syncClock(s.now); P = S; S = s; window.__S = s; render(); effects(); });
  $('#bMusic').onclick = (e) => { e.target.textContent = AV.toggleMusic() ? 'Music on' : 'Music off'; lastMusic = null; music(); };
  $('#bSfx').onclick = (e) => { e.target.textContent = AV.toggleSfx() ? 'Sounds on' : 'Sounds off'; };
  $('#bVoice').onclick = (e) => { e.target.textContent = AV.toggleVoice() ? 'Narrator on' : 'Narrator off'; };
  $('#bSkip').onclick = () => socket.emit('host:skip');
  $('#bFull').onclick = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.());
  document.addEventListener('keydown', (e) => { if (e.code === 'Space' && S && S.phase !== 'LOBBY') { e.preventDefault(); socket.emit('host:skip'); } });
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tv]'); if (!b) return;
    const a = b.dataset.tv;
    if (a === 'bot') socket.emit('host:addBot', {}, (r) => { if (r?.error) flash(r.error); });
    if (a === 'fill') { const need = Math.max(0, 5 - S.players.length); for (let i = 0; i < need; i++) socket.emit('host:addBot', {}); }
    if (a === 'nobots') socket.emit('host:removeBots', {});
    if (a === 'start') socket.emit('host:start', {}, (r) => { if (r?.error) flash(r.error); });
    if (a === 'menu') goMenu();
  });
  function flash(t) { caption.textContent = t; caption.className = 'show'; setTimeout(() => { caption.className = ''; }, 2500); }

  // ---------------------------------------------------------------- helpers
  const T = () => { if (!S.endsAt) return ''; if (!totals[S.endsAt]) totals[S.endsAt] = Math.max(1, S.endsAt - W.now()); return `data-ends="${S.endsAt}" data-total="${totals[S.endsAt]}"`; };
  const timer = () => (S.endsAt ? `<div class="timer" ${T()}></div>` : '');
  const host = () => { try { return new URL(S.joinUrl).host; } catch (e) { return location.host; } };
  const P_ = (id) => S.players.find((p) => p.id === id);
  const name = (id) => esc(P_(id)?.name || 'Someone');
  const rot = (i) => `${((i * 37) % 7) - 3}deg`;
  const POWER_ICON = { inquiry: '🔍', peek: '👀', urgent: '📣', runout: '🚌' };
  const POWER_TEXT = {
    inquiry: 'The President secretly sees which side one player is on.',
    peek: 'The President secretly sees the next three files.',
    urgent: 'The President picks who is President next round.',
    runout: 'The President sends one player out of town for good.',
  };
  const fileImg = (t) => W.img(t === 'P' ? 'lg-file-protect' : 'lg-file-sell');
  const fileCard = (t, title, cls = '') => `<div class="file ${t === 'P' ? 'protect' : 'sell'} ${cls}">${fileImg(t) ? `<img src="${fileImg(t)}" alt="">` : ''}<div class="ftitle">${esc(title || '')}</div><div class="stamp">${t === 'P' ? 'PROTECT' : 'SELL'}</div></div>`;
  const back = (n, cls = '') => Array.from({ length: n }, (_, i) => `<div class="fileback ${cls}" style="--r:${rot(i + 1)};--i:${i}"><span>FILE</span></div>`).join('');
  const claimText = (v, max) => (v === null ? 'No comment' : v === undefined ? '...' : max === 3 ? `${3 - v} Sell, ${v} Protect` : `${2 - v} Sell, ${v} Protect`);
  const dots = (v, max) => (v === null || v === undefined ? '<i class="nc">?</i>' : Array.from({ length: max }, (_, i) => `<i class="${i < v ? 'g' : 'r'}"></i>`).join(''));

  // ---------------------------------------------------------------- the village (picture if we have it, a drawing if not)
  function drawnVillage(sells) {
    const grey = sells >= 6;
    const sky = grey ? ['#8E8A86', '#B9AFA2'] : ['#F2B35C', '#F6D7A0'];
    const palms = [[160, 470], [260, 500], [700, 430], [820, 455], [1120, 470], [1400, 440], [1500, 480]].filter((_, i) => !(sells >= 4 && (i === 2 || i === 3)));
    const palm = ([x, y]) => `<g transform="translate(${x} ${y})"><path d="M0 0 C 6 -60 -4 -120 6 -180" stroke="#5B4632" stroke-width="10" fill="none"/><g fill="#3F6B35"><path d="M6 -180 q -70 -10 -110 40 q 60 -30 110 -40z"/><path d="M6 -180 q 70 -10 110 40 q -60 -30 -110 -40z"/><path d="M6 -180 q -40 -50 -100 -50 q 60 10 100 50z"/><path d="M6 -180 q 40 -50 100 -50 q -60 10 -100 50z"/></g></g>`;
    const house = (x, y, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})"><rect x="-40" y="-40" width="80" height="45" fill="#EFE2C8" stroke="#2A2420" stroke-width="3"/><path d="M-52 -38 L0 -78 L52 -38z" fill="#B5462F" stroke="#2A2420" stroke-width="3"/><rect x="-10" y="-22" width="20" height="27" fill="#5B4632"/></g>`;
    let build = '';
    if (sells >= 1) build += `<g transform="translate(330 520)"><rect x="-6" y="0" width="12" height="70" fill="#5B4632"/><rect x="-110" y="-70" width="220" height="80" fill="#F3E9D2" stroke="#2A2420" stroke-width="4"/><text x="0" y="-38" font-family="Kalam" font-size="26" text-anchor="middle" fill="#2A2420">COMING SOON</text><text x="0" y="-8" font-family="Kalam" font-size="22" text-anchor="middle" fill="#B5462F">GODFATHER RESORTS</text></g>`;
    if (sells >= 2) build += `<g><rect x="380" y="${sells >= 6 ? 120 : 330}" width="120" height="${sells >= 6 ? 500 : 290}" fill="${sells >= 6 ? '#A9C7D6' : '#9A958E'}" stroke="#2A2420" stroke-width="4"/><path d="M520 620 L520 220 L700 220" stroke="#D9A441" stroke-width="10" fill="none"/></g>`;
    if (sells >= 3) build += '<g><rect x="1180" y="600" width="230" height="60" rx="8" fill="#4FB3D9" stroke="#2A2420" stroke-width="4"/><text x="1295" y="590" font-family="Kalam" font-size="22" text-anchor="middle" fill="#2A2420">PRIVATE POOL</text></g>';
    if (sells >= 4) build += '<g><rect x="720" y="470" width="170" height="110" fill="#BFD8E2" stroke="#2A2420" stroke-width="4"/><text x="805" y="460" font-family="Kalam" font-size="22" text-anchor="middle" fill="#B5462F">GODFATHER LOUNGE</text></g>';
    if (sells >= 5) build += '<g><path d="M0 250 L1600 180" stroke="#2A2420" stroke-width="4"/><rect x="900" y="200" width="60" height="44" fill="#B5462F" stroke="#2A2420" stroke-width="3"/></g>';
    if (sells >= 6) build += '<text x="440" y="110" font-family="Kalam" font-size="34" text-anchor="middle" fill="#B5462F">GRAND OPENING</text>';
    return `<svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="sk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky[0]}"/><stop offset="1" stop-color="${sky[1]}"/></linearGradient></defs>
      <rect width="1600" height="900" fill="url(#sk)"/>${grey ? '' : '<circle cx="1250" cy="200" r="70" fill="#FBE3A8"/>'}
      <path d="M0 470 Q 400 430 800 460 T 1600 450 L1600 900 L0 900z" fill="#6E9E4F"/>
      <path d="M0 640 Q 500 600 900 650 T 1600 640 L1600 720 Q 900 760 0 720z" fill="#5FA3B8" opacity=".85"/>
      ${sells >= 2 ? '<path d="M0 520 L 560 520 L 560 640 L 0 650z" fill="#8B6A4A"/>' : '<g fill="#7FB069" stroke="#5E8C4A" stroke-width="2"><path d="M0 520 L 560 520 L 560 640 L 0 650z"/></g>'}
      ${palms.map(palm).join('')}${sells >= 6 ? '' : house(980, 560) + house(1080, 585, 0.8) + house(600, 600, 0.9)}${build}
      <g transform="translate(800 820)"><path d="M-170 0 L-170 -90 Q 0 -150 170 -90 L170 0" stroke="#5B4632" stroke-width="16" fill="none"/><text x="0" y="-100" font-family="Kalam" font-weight="700" font-size="30" text-anchor="middle" fill="#2A2420">${sells >= 6 ? 'GODFATHER CITY' : 'WELCOME TO GREENWATER'}</text></g></svg>`;
  }
  let lastScene = '';
  function setScenery() {
    const ph = S.phase; const sells = S.board.sell; const w = S.x.winner;
    let img = W.img(`lg-village-${Math.min(6, sells)}`); let drawn = drawnVillage(sells); let cls = 'village';
    if (ph === 'LOBBY') { cls = 'title'; }
    else if (ph === 'INTRO') { img = W.img('lg-godfather') || img; cls = 'dark'; }
    else if (ph === 'TUTORIAL') { img = W.img('lg-council') || img; cls = 'council'; }
    else if (ph === 'SHUTDOWN') { img = W.img('lg-shutdown') || img; cls = 'moment'; }
    else if (ph === 'POWER' && S.x.kind === 'runout' && S.step === 'result') { img = W.img('lg-runout') || img; cls = 'moment'; }
    else if (ph === 'FILES' || ph === 'CLAIMS') { img = W.img('lg-council') || img; cls = 'council'; }
    else if (ph === 'NOMINATE' && S.rumour && Date.now() - S.rumour.at < 60000) { img = W.img('lg-teashop') || img; cls = 'teashop'; }
    else if (ph === 'END' && w) { img = w.team === 'V' ? (W.img('lg-saved') || img) : w.reason === 'puppetElected' ? (W.img('lg-puppet-wins') || W.img('lg-village-6') || img) : (W.img('lg-village-6') || img); if (w.team === 'G' && !W.img('lg-village-6')) drawn = drawnVillage(6); cls = 'moment'; }
    const key = `${img}|${cls}|${img ? '' : sells}`;
    if (key === lastScene) return; lastScene = key;
    $('#scenery').className = `${cls}${img ? ' has-art' : ''}`;
    $('#art').style.backgroundImage = img ? `url(${img})` : 'none';
    if (!img) $('#drawn').innerHTML = drawn;
  }

  // ---------------------------------------------------------------- the frame: top bar, board, register, players
  function topBar() {
    const r = S.reg[S.reg.length - 1];
    const left = S.phase === 'LOBBY' ? '' : `<div class="brand">Land Grab<small>${S.reg.length ? `Round ${r.n}` : 'Greenwater village council'}</small></div>`;
    return `${left}<div></div><div class="code"><b>${esc(S.code)}</b><small>${esc(host())}${TEST ? ' · test mode' : ''}</small></div>`;
  }
  function boardHtml() {
    const b = S.board; if (['LOBBY', 'INTRO', 'TUTORIAL'].includes(S.phase)) return '';
    const prot = Array.from({ length: b.winProtect }, (_, i) => `<i class="slot g ${i < b.protect ? 'on' : ''}">${i < b.protect ? '🌴' : ''}</i>`).join('');
    const sell = Array.from({ length: b.winSell }, (_, i) => { const pw = b.powers[i + 1]; return `<i class="slot r ${i < b.sell ? 'on' : ''}" title="${pw || ''}">${i < b.sell ? '🏗️' : pw ? `<em>${POWER_ICON[pw]}</em>` : ''}</i>`; }).join('');
    const trk = Array.from({ length: 3 }, (_, i) => `<i class="${i < b.tracker ? 'on' : ''}"></i>`).join('');
    return `<div class="card track"><h4>Protect <span>${b.protect} / ${b.winProtect}</span></h4><div class="slots">${prot}</div></div>
      <div class="card track"><h4>Sell <span>${b.sell} / ${b.winSell}</span></h4><div class="slots">${sell}</div><p class="pw">${b.sell >= 3 ? '<b>The Puppet as Secretary wins it for the Godfather.</b>' : 'From 3 Sell files, electing the Puppet as Secretary wins it for the Godfather.'}${b.veto ? '<br><b>Veto is on.</b>' : ''}</p></div>
      <div class="card track small"><h4>Failed votes</h4><div class="trk">${trk}</div><p class="pw">Three in a row and the village shuts down.</p></div>`;
  }
  function regHtml() {
    if (['LOBBY', 'INTRO', 'TUTORIAL', 'ROLES'].includes(S.phase)) return '';
    const rows = S.reg.slice(-7).reverse().map((r) => {
      const res = r.shutdown ? '<span class="tag dark">Shutdown</span>' : r.vetoed ? '<span class="tag dark">Vetoed</span>' : r.passed === false ? '<span class="tag">Voted down</span>' : '';
      const file = r.file ? `<span class="chip ${r.file.type === 'P' ? 'g' : 'r'}">${r.file.type === 'P' ? 'Protect' : 'Sell'}</span>` : '';
      const claims = r.file && !r.shutdown && (r.claims.pres !== undefined || r.claims.sec !== undefined) ? `<div class="claims"><span title="President's claim">${dots(r.claims.pres, 3)}</span><span title="Secretary's claim">${dots(r.claims.sec, 2)}</span>${r.clash ? '<b class="clash">Clash</b>' : ''}</div>` : '';
      const pw = r.power && r.power.target ? `<div class="pwr">${POWER_ICON[r.power.kind]} ${name(r.power.target)}</div>` : '';
      return `<li><div class="rn">${r.n}</div><div class="rwho">${W.bust(P_(r.pres), 'xs')}<span>${name(r.pres)}</span>${r.sec ? `<b>→</b>${W.bust(P_(r.sec), 'xs')}<span>${name(r.sec)}</span>` : ''}</div><div class="res">${res}${file}</div>${claims}${pw}</li>`;
    }).join('');
    return `<div class="card register"><h4>The council register</h4>${rows ? `<ol>${rows}</ol>` : '<p class="pw">Nothing signed yet.</p>'}<p class="key">Dots: what the President (3) and Secretary (2) say they saw. Green is Protect.</p></div>`;
  }
  function dockHtml() {
    if (S.phase === 'LOBBY') return '';
    return `<div class="seats">${S.players.map((p) => {
      const badge = p.pres ? '<em class="b pres">President</em>' : p.sec ? '<em class="b sec">Secretary</em>' : (S.phase === 'NOMINATE' && p.limited && p.alive) ? '<em class="b lim">Can\'t be Secretary</em>' : '';
      return `<div class="seat ${p.alive ? '' : 'out'} ${p.connected ? '' : 'off'}" style="--c:${p.color}">${W.bust(p, 'md')}<b>${esc(p.name)}</b>${badge}${p.alive ? '' : '<em class="b out">Out of town</em>'}</div>`;
    }).join('')}</div>`;
  }

  // ---------------------------------------------------------------- the stage, one screen per moment
  const R = {
    LOBBY() {
      const n = S.players.length;
      const people = S.players.map((p, i) => `<div class="joiner" style="--r:${rot(i)}">${W.bust(p, 'md')}<b>${esc(p.name)}</b>${p.bot ? '<small>bot</small>' : ''}</div>`).join('');
      const tools = TEST ? `<div class="testbar" id="testbar"><button data-tv="bot">Add a bot</button><button data-tv="fill">Fill to 5</button><button data-tv="nobots">Remove bots</button><button data-tv="start" ${n < 5 ? 'disabled' : ''}>Start</button></div>` : '';
      const art = W.img('lg-title');
      return `<div class="lobby ${art ? 'withart' : ''}">${art ? `<img class="titleart" src="${art}" alt="Land Grab: save the village, find the Puppet">` : ''}<div class="ltitle"><h1>Land Grab</h1><p>Save the village. Find the Puppet.</p></div>
        <div class="card join"><img src="${S.qr || ''}" alt="QR code to join"><div><p>Scan, or go to</p><b class="url">${esc(host())}/lg</b><p>and enter</p><b class="big">${esc(S.code)}</b></div></div>
        <div class="joiners" id="joiners">${people || '<p class="pw">Waiting for the village to arrive...</p>'}</div>
        <p class="hint" id="lhint">${n < 5 ? `${n} of 5 needed. Up to 10 can play.` : `${n} villagers. The first to join starts the game from their phone.`}</p>${tools}</div>`;
    },
    TUTORIAL() {
      const x = S.x; const k = x.key; const ps = S.players;
      const role = (img, emoji, name, n, cls) => `<div class="tcard ${cls}">${W.img(img) ? `<img src="${W.img(img)}" alt="">` : `<div class="temo">${emoji}</div>`}<b>${name}</b><span>${n}</span></div>`;
      let body = '';
      if (k === 'teams') body = `<div class="trow">${role('lg-role-villager', '🌴', 'Villagers', `${x.counts[0]} of you`, 'v')}${role('lg-role-man', '💼', "The Godfather's men", `${x.counts[1]} of you`, 'g')}${role('lg-role-puppet', '🎭', 'The Puppet', '1 of you', 'g')}</div><p class="tnote">The Godfather's men know each other${x.n <= 6 ? ', and the Puppet knows them too' : '. The Puppet doesn\'t know who they are'}.</p>`;
      if (k === 'round') body = `<div class="duo"><div class="who">${W.bust(ps[0], 'lg')}<em class="b pres">President</em></div><div class="plus">→</div><div class="who">${W.bust(ps[1] || ps[0], 'lg')}<em class="b sec">Secretary</em></div></div><div class="vcards">${ps.slice(0, 6).map((p, i) => `<div class="vcard ${i % 3 === 2 ? 'no' : 'yes'}" style="--r:${rot(i)};--i:${i}">${W.bust(p, 'sm')}<span>${i % 3 === 2 ? 'NO' : 'YES'}</span></div>`).join('')}</div><p class="tnote">More yes than no, and they're in.</p>`;
      if (k === 'files') {
        const tray = 'SSPSSSPSSPSSSPSPS'.split('').map((t, i) => `<i class="${t === 'P' ? 'g' : 'r'}" style="--i:${i}"></i>`).join('');
        body = `<div class="tray"><div class="trayfiles">${tray}</div><span>The tray: 11 Sell, 6 Protect</span></div><div class="flow"><div class="desk">${back(3)}</div><b>bin one</b><div class="desk">${back(2)}</div><b>sign one</b>${fileCard('S', '', 'tiny')}</div>`;
      }
      if (k === 'claims') body = `<div class="bubbles"><div class="bubble"><div class="who">${W.bust(ps[0], 'md')}<em class="b pres">President</em></div><p>I drew</p><b>1 Sell, 2 Protect</b><div class="dots">${dots(2, 3)}</div></div><div class="bubble"><div class="who">${W.bust(ps[1] || ps[0], 'md')}<em class="b sec">Secretary</em></div><p>I was given</p><b>2 Sell</b><div class="dots">${dots(0, 2)}</div></div></div><div class="verdict bad">Stories don't match</div>`;
      if (k === 'powers') body = `<div class="trow">${['inquiry', 'peek', 'urgent', 'runout'].map((pw) => `<div class="tcard"><div class="temo">${POWER_ICON[pw]}</div><b>${{ inquiry: 'Vigilance inquiry', peek: 'Peek at the tray', urgent: 'Urgent meeting', runout: 'Run out of town' }[pw]}</b></div>`).join('')}</div><div class="tshut"><span class="trk"><i class="on"></i><i class="on"></i><i class="on"></i></span><b>3 failed votes = shutdown</b></div>`;
      if (k === 'win') body = `<div class="wins"><div class="wcol v"><h3>Villagers win</h3><p>🌴 5 Protect files</p><p>or 🚌 run the Puppet out of town</p></div><div class="wcol g"><h3>The Godfather wins</h3><p>🏗️ 6 Sell files</p><p>or 🎭 the Puppet becomes Secretary after 3 Sell files</p></div></div>`;
      const progress = Array.from({ length: x.slides }, (_, i) => `<i class="${i === x.slide ? 'on' : i < x.slide ? 'done' : ''}"></i>`).join('');
      return `<div class="center tut"><div class="tprog">${progress}</div><h2 class="say">${esc(x.title || '')}</h2>${body}</div>`;
    },
    INTRO() { return W.img('lg-godfather') ? '<div class="center"></div>' : '<div class="center"><div class="godfather">THE GODFATHER</div></div>'; },
    ROLES() {
      return `<div class="center"><div class="card paper big"><h2>Check your role</h2><p>Secretly. Phones close to your chest.</p>${timer()}
        <div class="ready" id="ready">${S.players.map((p) => `<span class="${p.ready ? 'on' : ''}">${W.bust(p, 'sm')}</span>`).join('')}</div></div></div>`;
    },
    NOMINATE() {
      const pr = S.x.pres; const rm = S.rumour && Date.now() - S.rumour.at < 60000 ? S.rumour : null;
      return `<div class="center"><div class="duo"><div class="who big">${W.bust(pr, 'lg')}<b>${esc(pr?.name || '')}</b><em class="b pres">President</em></div></div>
        <h2 class="say">${esc(pr?.name || '')} is choosing a Secretary</h2><p class="lede">Argue about it. Out loud. Send rumours from your phone.</p>${timer()}
        <div id="rumour">${rm ? `<div class="chalk"><h4>Today's gossip</h4><p>${esc(rm.text)}</p></div>` : ''}</div></div>`;
    },
    VOTE() {
      const x = S.x;
      const duo = `<div class="duo"><div class="who">${W.bust(x.pres, 'lg')}<b>${esc(x.pres?.name || '')}</b><em class="b pres">President</em></div><div class="plus">+</div><div class="who">${W.bust(x.sec, 'lg')}<b>${esc(x.sec?.name || '')}</b><em class="b sec">Secretary</em></div></div>`;
      if (S.step === 'vote') return `<div class="center">${duo}<h2 class="say">Yes or no? Vote on your phone.</h2>${timer()}<p class="count" id="vcount">${x.voted} of ${x.voters} voted</p></div>`;
      const cards = Object.entries(x.votes || {}).map(([id, v], i) => `<div class="vcard ${v === true ? 'yes' : 'no'}" style="--r:${rot(i)};--i:${i}">${W.bust(P_(id), 'sm')}<b>${name(id)}</b><span>${v === true ? 'YES' : v === false ? 'NO' : 'NO VOTE'}</span></div>`).join('');
      return `<div class="center">${duo}<div class="vcards">${cards}</div><div class="verdict ${x.passed ? 'ok' : 'bad'}">${x.passed ? 'Elected' : 'Rejected'}</div></div>`;
    },
    FILES() {
      const x = S.x; const st = S.step;
      const head = st === 'pres' ? `${esc(x.pres?.name)} is binning one file` : st === 'veto' ? `${esc(x.sec?.name)} asks to throw both files away` : x.denied ? `Veto refused. ${esc(x.sec?.name)} must sign one` : `${esc(x.sec?.name)} is signing one file`;
      const files = st === 'pres' && !x.binned ? back(3) : back(2);
      return `<div class="center"><div class="duo small"><div class="who">${W.bust(x.pres, 'md')}<b>${esc(x.pres?.name || '')}</b><em class="b pres">President</em></div><div class="desk">${files}</div><div class="who">${W.bust(x.sec, 'md')}<b>${esc(x.sec?.name || '')}</b><em class="b sec">Secretary</em></div></div>
        <h2 class="say">${head}</h2>${st === 'veto' ? `<p class="lede">${esc(x.pres?.name)}, agree or refuse on your phone.</p>` : '<p class="lede">No talking while the files are out.</p>'}${timer()}</div>`;
    },
    SIGNED() {
      const x = S.x;
      return `<div class="center signed"><div class="gazette"><div class="mast">The Greenwater Gazette</div><div class="head">${esc(x.headline)}</div><div class="sub">${x.shutdown ? 'Signed during the shutdown. Nobody was watching.' : `Signed by ${esc(S.x.pres?.name || '')} and ${esc(S.x.sec?.name || '')}`}</div></div>${fileCard(x.type, x.title, 'slam')}</div>`;
    },
    CLAIMS() {
      const x = S.x; const c = x.claims;
      const bub = (who, v, max, role) => `<div class="bubble ${v === undefined ? 'wait' : ''}"><div class="who">${W.bust(who, 'md')}<em class="b ${role}">${role === 'pres' ? 'President' : 'Secretary'}</em></div><p>${role === 'pres' ? 'I drew' : 'I was given'}</p><b>${claimText(v, max)}</b><div class="dots">${dots(v, max)}</div></div>`;
      const clash = x.show && c.pres !== null && c.sec !== null && c.pres !== undefined && c.sec !== undefined && (c.sec < Math.max(0, c.pres - 1) || c.sec > Math.min(2, c.pres));
      return `<div class="center"><h2 class="say">What did they see?</h2><div class="bubbles" id="bubbles">${bub(x.pres, c.pres, 3, 'pres')}${bub(x.sec, c.sec, 2, 'sec')}</div>${x.file ? `<p class="lede">The file signed: <b class="${x.file.type === 'P' ? 'gtext' : 'rtext'}">${x.file.type === 'P' ? 'Protect' : 'Sell'}</b></p>` : ''}${clash ? '<div class="verdict bad">Stories don\'t match</div>' : ''}${x.show ? '' : timer()}</div>`;
    },
    POWER() {
      const x = S.x;
      if (S.step === 'result' && x.target) {
        const msg = x.kind === 'runout' ? 'has been run out of town' : x.kind === 'urgent' ? 'will be the next President' : `has been looked into by ${esc(x.pres?.name || '')}`;
        return `<div class="center"><div class="who big">${W.bust(x.target, 'lg')}<b>${esc(x.target.name)}</b></div><h2 class="say">${esc(x.target.name)} ${msg}</h2>${x.kind === 'runout' ? '<div class="verdict bad">Out of town</div>' : ''}</div>`;
      }
      return `<div class="center"><div class="power"><div class="ico">${POWER_ICON[x.kind]}</div><h2>${esc(x.label)}</h2><p>${POWER_TEXT[x.kind]}</p></div><p class="lede">${esc(x.pres?.name || '')} is choosing on their phone.</p>${timer()}</div>`;
    },
    SHUTDOWN() { return '<div class="center"><div class="verdict bad huge">Shutdown</div><p class="lede">Three failed votes. The top file gets signed with nobody watching.</p></div>'; },
    END() {
      const w = S.x.winner || {};
      const title = w.team === 'V' ? 'Greenwater is saved' : 'The Godfather wins';
      const why = { protect: 'Five Protect files signed.', sell: 'Six Sell files signed.', puppetElected: `${esc(w.name)} was the Puppet, and became Secretary.`, puppetGone: `${esc(w.name)} was the Puppet, and got run out of town.`, error: '' }[w.reason] || '';
      if (S.step !== 'reveal') return `<div class="center"><div class="banner ${w.team === 'V' ? 'v' : 'g'}">${title}</div><p class="lede big">${why}</p></div>`;
      const roles = (S.x.roles || []).map((p, i) => `<div class="rcard ${p.role === 'V' ? 'v' : 'g'} ${p.role === 'P' ? 'puppet' : ''}" style="--r:${rot(i)};--i:${i}">${W.bust(p, 'md')}<b>${esc(p.name)}</b><span>${esc(p.roleName)}</span></div>`).join('');
      return `<div class="center"><div class="banner sm ${w.team === 'V' ? 'v' : 'g'}">${title}</div><p class="lede">${why}</p><div class="rcards">${roles}</div><p class="hint">${esc(P_(S.vipId)?.name || 'The first player')} can play again, or go back to the game menu, from their phone.</p><button class="menubtn" data-tv="menu">Back to the game menu</button></div>`;
    },
  };

  // ---------------------------------------------------------------- render
  let lastKey = '';
  function render() {
    if (!S) return;
    document.body.dataset.phase = S.phase;
    setScenery();
    mount(top, topBar()); mount(board, boardHtml()); mount(reg, regHtml()); mount(dock, dockHtml());
    const html = (R[S.phase] || (() => ''))();
    const key = `${S.phase}|${S.step}|${S.reg.length}|${S.phase === 'LOBBY' ? '' : S.x.target?.id || ''}|${S.phase === 'CLAIMS' ? S.x.show : ''}|${S.phase === 'FILES' ? S.x.binned : ''}`;
    if (key !== lastKey) {
      lastKey = key; stage.classList.remove('enter'); void stage.offsetWidth; stage.classList.add('enter');
      stage.innerHTML = html; stage.__html = html;
      setTimeout(() => stage.classList.remove('enter'), 2200);
    } else if (stage.__html !== html) {
      const t = document.createElement('div'); t.innerHTML = html;
      t.querySelectorAll('[id]').forEach((n) => { const el = stage.querySelector(`#${n.id}`); if (el) mount(el, n.innerHTML); });
      stage.__html = html;
    }
    music();
  }
  let lastMusic = null;
  function music() {
    const ph = S.phase; const w = S.x.winner;
    let key = 'lg-lobby'; let mood = 'lobby';
    if (ph === 'INTRO' || ph === 'ROLES') { key = 'lg-roles'; mood = 'dark'; }
    else if (ph === 'TUTORIAL') { key = 'lg-lobby'; mood = 'lobby'; }
    else if (ph === 'NOMINATE' || (ph === 'VOTE' && S.step === 'result')) { key = 'lg-debate'; mood = 'tense'; }
    else if (ph === 'VOTE') { key = 'lg-vote'; mood = 'pitch'; }
    else if (['FILES', 'SIGNED', 'CLAIMS'].includes(ph)) { key = 'lg-files'; mood = 'tense'; }
    else if (ph === 'POWER') { key = 'lg-power'; mood = 'dark'; }
    else if (ph === 'SHUTDOWN') { key = 'lg-shutdown'; mood = 'melodrama'; }
    else if (ph === 'END') { key = w?.team === 'V' ? 'lg-win-village' : 'lg-win-godfather'; mood = w?.team === 'V' ? 'finale' : 'dark'; }
    AV.setBed(ph === 'NOMINATE' || ph === 'TUTORIAL' ? 0.3 : 0.5);
    const id = `${key}|${mood}`;
    if (id !== lastMusic) { lastMusic = id; AV.music(key, mood); }
  }

  // ---------------------------------------------------------------- narration and sound effects
  let lastCue = null; let lastFx = 0; let capTimer = null; let lastPlayers = 0;
  function effects() {
    const cue = S.cue;
    if (cue && cue.id !== lastCue) {
      lastCue = cue.id; caption.textContent = cue.text; caption.className = 'show';
      clearTimeout(capTimer);
      AV.speak(cue, (id) => { socket.emit('host:cueDone', { id }); capTimer = setTimeout(() => { if (lastCue === id) caption.className = ''; }, 600); });
    } else if (!cue && lastCue && AV.speakingId() === lastCue) { AV.stopVoice(); caption.className = ''; lastCue = null; } else if (!cue) { if (!AV.speakingId()) caption.className = ''; }
    const fresh = (S.fx || []).filter((f) => f.id > lastFx);
    if (P === null) lastFx = Math.max(0, ...(S.fx || []).map((f) => f.id)); else fresh.forEach((f) => { lastFx = Math.max(lastFx, f.id); AV.fx(f.name, { gap: 300 }); });
    if (S.phase === 'LOBBY' && S.players.length > lastPlayers && P) AV.fx('join');
    lastPlayers = S.players.length;
  }
})();
