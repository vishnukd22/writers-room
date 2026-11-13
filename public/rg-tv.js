/* RIGGED! The TV is the studio: the question, the rule board, the podiums, every dirty trick. */
(() => {
  const $ = (q) => document.querySelector(q);
  const esc = W.esc;
  const TEST = new URLSearchParams(location.search).has('test');
  const socket = io({ autoConnect: false, transports: ['websocket', 'polling'] });
  const stage = $('#stage'); const top = $('#top'); const dock = $('#dock'); const board = $('#board'); const caption = $('#caption'); const ticker = $('#ticker');
  let S = null; let P = null;
  const totals = {};

  // ---------------------------------------------------------------- boot
  $('#bOpen').onclick = async () => {
    AV.init(); await W.ready; $('#gate').classList.add('hide');
    try { document.documentElement.requestFullscreen?.(); } catch (e) { /* fine */ }
    socket.connect();
  };
  const KEY = TEST ? 'rgHostTest' : 'rgHost';
  socket.on('connect', () => {
    const saved = sessionStorage.getItem(KEY);
    const create = () => { const from = sessionStorage.getItem('gnPrev'); sessionStorage.removeItem('gnPrev'); socket.emit('host:create', { game: 'rg', test: TEST, from }, (r) => sessionStorage.setItem(KEY, r.code)); };
    if (saved) socket.emit('host:attach', { code: saved, game: 'rg' }, (r) => { if (r.error) { if (S && S.phase !== 'LOBBY') flash('The game server restarted, so that game ended. Here is a fresh one.', 9000); create(); } }); else create();
  });
  function goMenu() { if (S) sessionStorage.setItem('gnPrev', S.code); sessionStorage.removeItem(KEY); location.href = TEST ? '/tv?test' : '/tv'; }
  socket.on('menu', goMenu);
  socket.on('state', (s) => { W.syncClock(s.now); P = S; S = s; window.__S = s; render(); effects(); });
  $('#bMusic').onclick = (e) => { e.target.textContent = AV.toggleMusic() ? 'Music on' : 'Music off'; lastMusic = null; music(); };
  $('#bSfx').onclick = (e) => { e.target.textContent = AV.toggleSfx() ? 'Sounds on' : 'Sounds off'; };
  $('#bVoice').onclick = (e) => { e.target.textContent = AV.toggleVoice() ? 'Vince on' : 'Vince off'; };
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
  function flash(t, ms = 2500) { caption.textContent = t; caption.className = 'show'; setTimeout(() => { caption.className = ''; }, ms); }
  // if the screen hears nothing for 40 seconds mid-game, reconnect and ask for the latest
  let heard = Date.now();
  socket.on('state', () => { heard = Date.now(); });
  setInterval(() => {
    if (!S || S.phase === 'LOBBY' || S.phase === 'END') return;
    if (Date.now() - heard > 40000) { heard = Date.now(); if (socket.connected) socket.emit('host:attach', { code: S.code, game: 'rg' }, () => {}); else socket.connect(); }
  }, 5000);

  // ---------------------------------------------------------------- helpers
  const $$ = (n) => `$${Math.round(n).toLocaleString('en-US')}`;
  const signed = (n) => `${n >= 0 ? '+' : '-'}${$$(Math.abs(n))}`;
  const P_ = (id) => S.players.find((p) => p.id === id);
  const name = (id) => esc(P_(id)?.name || 'Someone');
  const host = () => { try { return new URL(S.joinUrl).host; } catch (e) { return location.host; } };
  const L = 'ABCDEFGHIJ';
  const face = (p, size = 'md') => { if (!p) return ''; if (p.house) return W.img('rg-house') ? `<span class="bust ${size}" style="--c:#D4AF37"><img src="${W.img('rg-house')}" alt=""></span>` : `<span class="bust house ${size}" style="--c:#D4AF37"><b>🎰</b></span>`; return W.bust(p, size); };
  const T = (ends) => { if (!ends) return ''; if (!totals[ends]) totals[ends] = Math.max(1, ends - W.now()); return `data-ends="${ends}" data-total="${totals[ends]}"`; };
  const timer = (ends) => (ends ? `<div class="timer"><i ${T(ends)} data-kind="bar"></i></div>` : '');
  const cardArt = (k, cls = 'face') => (W.img(`rg-card-${k}`) ? `<img class="${cls}" src="${W.img(`rg-card-${k}`)}" alt="">` : '');
  const RULE_EMO = { opposite: '🙃', copycat: '🐈', robin: '🏹', speedtax: '🐌', double: '🎲', sale: '🏷️', snitches: '🐀', taxman: '🧾', hothands: '🔥', bounty: '🤠', amnesia: '🌀', blind: '🙈', lastlaugh: '🤡', chairs: '🪑', switch: '🔀', passphone: '📱', alliance: '🤝', jackpot: '💰', house: '🎰' };
  const SAB = { fog: ['Fog', '🌫️'], shuffle: ['Shuffle', '🔀'], mirror: ['Mirror', '🪞'], tiny: ['Tiny Text', '🐜'], quake: ['Earthquake', '🌋'], spam: ['Spam', '📨'], freeze: ['Freeze', '🧊'] };
  const BRIBE = { hint: ['Hint', '💡'], peek: ['Peek', '👀'], stopwatch: ['Stopwatch', '⏱️'], veto: ['Veto', '✋'], fix: ['Fix the Fact', '🖋️'] };
  const sabIcon = (k) => (W.img(`rg-sab-${k}`) ? `<img src="${W.img(`rg-sab-${k}`)}" alt="" style="width:2.3rem;height:2.3rem;object-fit:contain">` : SAB[k]?.[1] || '💥');
  const ruleCard = (r, cls = '') => `<div class="rcard ${cls}">${cardArt(r.k) || `<div class="em">${r.emoji || RULE_EMO[r.k] || '🃏'}</div>`}<b>${esc(r.name)}</b><p>${esc(r.text)}</p></div>`;
  const D = { 1: 'Easy', 2: 'Medium', 3: 'Brutal' };

  // ---------------------------------------------------------------- the studio backdrop (your art if it's there)
  let lastArt = '';
  function setStudio() {
    const ph = S.phase;
    const want = ph === 'LADDER' ? 'rg-ladder' : ph === 'WHEEL' ? 'rg-stage' : 'rg-stage';
    const img = W.img(want) || W.img('rg-stage');
    const key = `${img}`; if (key === lastArt) return; lastArt = key;
    $('#studio').className = img ? 'has-art' : '';
    $('#art').style.backgroundImage = img ? `url(${img})` : 'none';
  }

  // ---------------------------------------------------------------- frame
  function topBar() {
    if (S.phase === 'LOBBY') return '<div></div><div></div>' + codeBox();
    const logo = W.img('rg-logo') ? `<div class="logo"><img src="${W.img('rg-logo')}" alt="RIGGED!"></div>` : '<div class="logo">RIGGED!</div>';
    const mid = S.round ? `<div class="rname"><span>${S.round === 8 ? 'Tonight\'s show' : S.round === 7 ? 'The finale' : `Round ${S.round} of 6`}</span><b>${esc(S.roundName)}</b></div>` : '<div></div>';
    return logo + mid + codeBox();
  }
  const codeBox = () => `<div class="code"><b>${esc(S.code)}</b><small>${esc(host())}/rg${TEST ? ' · test mode' : ''}</small></div>`;
  function boardHtml() {
    const live = S.rules.map((r) => ruleCard(r, newRules.has(r.k) ? 'new' : '')).join('');
    const pend = [];
    if (S.pending.jackpot) pend.push('<div class="pend">💰 Jackpot: $1,000 to the fastest right answer</div>');
    if (S.pending.pot) pend.push(`<div class="pend">🎰 The House pot: ${$$(S.pending.pot)} to the next right answer</div>`);
    if (S.pending.passphone) pend.push('<div class="pend">📱 Pass the Phone on the next question</div>');
    if (S.alliance) pend.push('<div class="pend">🤝 Alliance: partners share their winnings this round</div>');
    return `<div class="rb-title">The rules tonight</div>${live || '<div class="rb-empty">No funny business yet. Last place picks a rule card after every round.</div>'}${pend.join('')}`;
  }
  let newRules = new Set(); let prevRules = null;
  function dockHtml() {
    if (S.phase === 'LOBBY') return '';
    const q = S.q; const rev = S.rev;
    const locked = new Set(q?.locked || []);
    const holder = q?.kind === 'bomb' ? q.holder : null;
    const remote = q?.open ? q.remote : S.phase === 'LADDER' ? S.x.remote : null;
    return `<div class="podiums">${S.players.map((p) => {
      const dl = rev?.deltas?.[p.id];
      const tags = [p.shield ? '🛡️' : '', S.alliance?.[p.id] ? '🤝' : ''].filter(Boolean).map((t) => `<i>${t}</i>`).join('');
      const cash = p.cash === null ? '???' : $$(p.cash);
      return `<div class="pod ${locked.has(p.id) ? 'locked' : ''} ${p.connected || p.bot ? '' : 'off'} ${holder === p.id ? 'hasbomb' : ''} ${(p.fx || []).map((f) => `fx-${f}`).join(' ')}" style="--c:${p.color}" id="pod-${p.id}">${tags ? `<div class="tags">${tags}</div>` : ''}<i class="lamp"></i>${face(p, 'md')}<b>${esc(p.name)}</b><div class="cash">${cash}</div>${dl && S.amnesia === false ? `<div class="delta ${dl > 0 ? 'up' : 'down'}">${signed(dl)}</div>` : ''}${remote === p.id ? '<span class="remote-tag" title="Holds the Audience Remote">📺</span>' : ''}</div>`;
    }).join('')}</div>`;
  }

  // ---------------------------------------------------------------- the stage
  const frame = (inner, live = false, hot = false) => `<div class="marquee ${live ? 'live' : ''} ${hot ? 'hot' : ''}"><div class="inner">${inner}</div></div>`;
  const qMeta = (q, extra = '') => `<div class="meta">${q.cat ? `<span class="chip gold">${esc(q.cat)}</span>` : ''}${q.of ? `<span class="chip">Question ${q.n} of ${q.of}</span>` : ''}${q.dt ? '<span class="chip dt">Double Trouble: everything x2</span>' : ''}${q.pass ? '<span class="chip hot">📱 Phones passed left!</span>' : ''}${extra}<span class="count" id="cnt">${q.open && q.eligible ? `${q.locked.length} of ${q.eligible.length} locked` : ''}</span></div>`;
  const whoPicked = (ids) => (ids.length ? `<div class="who">${ids.map((id) => face(P_(id), 'xs')).join('')}</div>` : '');
  const R = {
    LOBBY() {
      const art = W.img('rg-title');
      const people = S.players.map((p) => `<div class="joiner">${face(p, 'md')}<b>${esc(p.name)}</b>${p.bot ? '<small>bot</small>' : ''}</div>`).join('');
      const n = S.players.length;
      const test = TEST ? `<div class="testbar"><button data-tv="bot">Add a bot</button><button data-tv="fill">Fill to 4</button><button class="ghost" data-tv="nobots">Remove bots</button><button data-tv="start">Start</button></div>` : '';
      return `<div class="lobby"><div>${art ? `<img class="title-img" src="${art}" alt="RIGGED!">` : '<h1 class="title">RIGGED!</h1>'}<p class="tag">The quiz show where the questions are fair and nothing else is.</p>
        <div class="joiners">${people || '<p class="sub">Nobody here yet. Scan the code to join.</p>'}</div>
        <p class="lnote">${n === 2 ? 'Two players: the House will join as a third contestant.' : n < 2 ? 'You need 2 to 8 players. The first phone can add bots.' : `${n} players. The first phone starts the show.`}${S.settings.passPhone ? '' : ' Pass the Phone is switched off.'}</p>${test}</div>
        <div class="joinbox"><div class="url">Join at ${esc(host())}/rg</div>${S.qr ? `<img src="${S.qr}" alt="">` : ''}<div class="c">${esc(S.code)}</div></div></div>`;
    },
    INTRO() { return frame(`<div class="center">${vince()}<p class="big-note">Live from the studio that never got cancelled</p></div>`); },
    DOSSIER() {
      const done = S.players.filter((p) => !p.bot);
      return frame(`<div class="folder"><span class="conf">CONFIDENTIAL</span><h2>The Dossier</h2><p class="dq">Answer the questions on your phone. Honestly, if you can manage it.</p>
        <div class="done-list" id="dl">${done.map((p) => `<div class="p ${p.done ? 'ok' : ''}">${face(p, 'md')}<span>${esc(p.name)}</span></div>`).join('')}</div></div>${timer(S.endsAt)}`, true);
    },
    ROUND() {
      const x = S.x;
      const blurb = { 1: 'Four trivia questions. The first one is clean.', 2: 'Write a fake answer. Find the real one.', 3: x.lay ? 'Write a fake Dossier answer. Spot the real one.' : 'Guess who wrote each Dossier answer.', 4: 'True or false, passed phone to phone. Wrong answer: boom.', 5: 'Closest guess wins. Bet on who will be furthest off.', 6: 'Everything x2. Sabotage half price.', 7: 'Race up seven rungs. The room picks your questions.' }[x.n];
      return frame(`<div class="center"><div class="rnum">${x.n === 7 ? 'The finale' : `Round ${x.n}`}</div><h2 class="rtitle">${esc(x.lay ? 'Lie About Yourself' : x.name)}</h2><p class="sub">${esc(blurb || '')}</p></div>`);
    },
    DEMO() {
      const k = S.x.key;
      const rows = {
        sab: Object.entries(SAB).map(([s, v]) => `<div class="d"><span>${sabIcon(s)}</span><b>${v[0]}</b></div>`).join('') + '<div class="d"><span>🛡️</span><b>Shield</b><small>bounces it back</small></div>',
        remote: '<div class="d"><span>👎</span><b>Boo</b><small>-5 seconds</small></div><div class="d"><span>📣</span><b>Cheer</b><small>x2 next right answer</small></div><div class="d"><span>🎡</span><b>Spin</b><small>new rule now</small></div><div class="d"><span>🗯️</span><b>Heckle</b><small>Vince reads it</small></div>',
        bribe: Object.entries(BRIBE).map(([b, v]) => `<div class="d"><span>${v[1]}</span><b>${v[0]}</b></div>`).join(''),
        copy: '<div class="d"><span>🙈</span><b>Blind copy</b><small>$250, random</small></div><div class="d"><span>👉</span><b>Name copy</b><small>$400, you choose</small></div><div class="d"><span>💸</span><b>Royalty</b><small>+$100 to them</small></div>',
      }[k];
      const title = { sab: 'Sabotage is open', remote: 'The Audience Remote', bribe: 'Bribes are open', copy: 'Copying is open' }[k];
      return frame(`<div class="center"><h2 class="rtitle" style="font-size:4rem">${title}</h2><div class="demo-row">${rows}</div><p class="sub">${k === 'remote' ? 'Whoever is in last place holds it. Free, once per question.' : 'Look at the tray at the bottom of your phone.'}</p></div>`);
    },
    Q() {
      const q = S.q; if (!q) return '';
      return (QK[q.kind] || (() => ''))(q);
    },
    WHEEL() {
      const x = S.x; const pk = P_(x.picker);
      const wheel = `<div class="wheel ${x.step === 'pick' ? 'spin' : ''}">${W.img('rg-wheel') ? `<img src="${W.img('rg-wheel')}" alt="">` : ''}</div>`;
      if (x.step === 'pick') return frame(`<div class="wheelzone">${wheel}<div style="display:grid;gap:2vh"><div class="picker">${face(pk, 'md')}<span>${name(x.picker)} is in last place, so ${x.spun ? 'they spun the wheel and ' : ''}they pick the new rule</span></div><div class="offer">${x.offer.map((r) => ruleCard(r)).join('')}</div>${timer(S.endsAt)}</div></div>`, true);
      if (x.step === 'veto') return frame(`<div class="wheelzone">${wheel}<div style="display:grid;gap:2vh;justify-items:center">${bigCard(x.cardInfo)}<p class="big-note">Somebody bought a Veto... will they use it?</p>${timer(S.endsAt)}</div></div>`, true, true);
      if (x.step === 'vetoed') return frame(`<div class="center">${bigCard(x.cardInfo, `<div class="vstamp">VETOED</div>`)}<p class="big-note">${name(x.by)} paid to kill it</p></div>`);
      if (x.step === 'off') return frame(`<div class="center">${bigCard(x.cardInfo, '<div class="vstamp" style="color:var(--mute)">OFF</div>')}<p class="sub">Only three rules fit on the board. The oldest one goes.</p></div>`);
      if (x.step === 'did') {
        let extra = '';
        if (x.card === 'switch') extra = `<div class="picker">${face(P_(x.a), 'md')} <span>⇄</span> ${face(P_(x.b), 'md')}</div>`;
        if (x.card === 'alliance' && x.pairs) extra = `<div class="demo-row">${x.pairs.map(([a, b]) => `<div class="d">${face(P_(a), 'sm')}${face(P_(b), 'sm')}<b>${name(a)} + ${name(b)}</b></div>`).join('')}</div>`;
        if (x.card === 'house') extra = `<p class="big-note">Pot: ${$$(x.pot || 0)}</p>`;
        return frame(`<div class="center">${bigCard(x.cardInfo)}${extra}</div>`);
      }
      return frame(`<div class="center">${bigCard(x.cardInfo)}<p class="sub">${pk ? `Picked by ${name(x.picker)}` : ''}</p></div>`);
    },
    LADDER() {
      const x = S.x; const n = x.climbers.length;
      const cols = x.climbers.map((c) => {
        const p = P_(c.id); const pct = (c.rung / x.rungs) * 84 + 4;
        const v = x.votes.find((y) => y.for === c.id);
        return `<div class="lcol ${x.winner === c.id ? 'win' : ''}"><div class="top">🏆</div>${v ? `<div class="voting">The room is picking...</div>` : ''}<div class="climber" style="bottom:${pct}%">${face(p, 'md')}${c.lock ? '<span class="lockz">🔒 locked</span>' : ''}${c.cat && !v ? `<small>${esc(c.cat)}</small>` : ''}</div><div class="name">${esc(p.name)} ${c.rung}/${x.rungs}</div></div>`;
      }).join('');
      const head = x.step === 'top' ? `<span class="chip gold">${name(x.winner)} reached the top!</span>` : x.step === 'time' ? '<span class="chip hot">Time is up</span>' : '<span class="chip gold">$250 a rung · $2,000 for the top</span><span class="chip">Lift $800 · Grease $600</span>';
      return frame(`<div class="meta">${head}<span class="count" id="lt">${x.step === 'climb' ? `<span data-ends="${x.ends}"></span>s left` : ''}</span></div>${x.step === 'climb' ? timer(x.ends) : ''}<div class="ladder" style="grid-template-columns:repeat(${n},1fr);padding:4vh 2vw 6vh">${cols}</div>`, x.step === 'climb');
    },
    SCORES() {
      const x = S.x; const hide = S.amnesia;
      const rows = (hide ? [...x.order].sort(() => Math.random() - 0.5) : x.order).map((id, i) => { const p = P_(id); return `<div class="rank ${!hide && i === 0 ? 'first' : ''}"><span class="n">${hide ? '?' : i + 1}</span>${face(p, 'sm')}<span>${esc(p.name)}${!hide && id === x.last ? ' <span class="chip hot" style="font-size:.8rem">picks the next rule</span>' : ''}</span><span class="v">${hide ? '$???' : $$(p.cash)}</span></div>`; }).join('');
      return frame(`<div class="meta"><span class="chip gold">After round ${x.n}</span>${hide ? '<span class="chip hot">Amnesia: only Vince knows</span>' : ''}</div><div class="ranks" style="max-width:60vw;margin:auto;width:100%">${rows}</div>`);
    },
    END() {
      const x = S.x; if (!x.ranks) return frame('<div class="center"><p class="big-note">Counting the money...</p></div>');
      const ranks = x.ranks.map((r, i) => `<div class="rank ${i === 0 ? 'first' : ''}"><span class="n">${i + 1}</span>${face(r, 'sm')}<span>${esc(r.name)}</span><span class="v">${$$(r.cash)}</span></div>`).join('');
      const awards = x.awards.map((a) => `<div class="award">${face(P_(a.who), 'sm')}<div><b>${esc(a.title)}</b><small>${name(a.who)}: ${esc(a.text)}</small></div></div>`).join('');
      return frame(`<div class="meta">${x.houseWon ? '<span class="chip hot">The House wins. Nobody wins.</span>' : `<span class="chip gold">${esc(x.ranks[0]?.name || '')} wins RIGGED!</span>`}</div><div class="endgrid"><div class="ranks">${ranks}</div><div class="awards">${awards}</div></div>`);
    },
  };
  const vince = () => `<div class="vince">${W.img('rg-vince') ? `<img src="${W.img('rg-vince')}" alt="Vince Velvet">` : '🎩'}</div>`;
  const bigCard = (c, over = '') => (c ? `<div class="bigcard">${cardArt(c.k) || `<div class="em">${c.emoji || RULE_EMO[c.k]}</div>`}<span class="type">${c.type === 'lasting' ? 'Lasting rule' : 'Happens now'}</span><b>${esc(c.name)}</b><p>${esc(c.text)}</p>${over}</div>` : '');

  // each question format
  const QK = {
    mc(q) {
      const rv = S.rev; const reveal = S.step === 'reveal' && rv;
      const by = {}; if (reveal) Object.entries(rv.picks || {}).forEach(([id, v]) => { (by[v] = by[v] || []).push(id); });
      const tiles = q.answers.map((a, i) => `<div class="ans ${reveal ? (i === rv.correct ? 'win' : 'dim') : ''}"><span class="l">${L[i]}</span><span>${esc(a)}</span>${reveal ? whoPicked(by[i] || []) : ''}</div>`).join('');
      return frame(`${qMeta(q)}<p class="qtext ${q.text.length > 90 ? 'md' : ''}">${esc(q.text)}</p>${q.open ? timer(q.ends) : ''}<div class="answers">${tiles}</div>`, q.open);
    },
    write(q) {
      return frame(`${qMeta(q, '<span class="chip hot">Lie Detector</span>')}<p class="qtext">${esc(q.text).replace('___', '<u>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</u>')}</p>${timer(q.ends)}<p class="big-note" style="margin-top:auto">Write a believable fake answer on your phone</p>`, true);
    },
    vote(q) {
      const rv = S.rev; const reveal = S.step === 'reveal' && rv;
      const shown = new Set(reveal ? rv.shown : []); const at = S.x?.at || null;
      const tiles = q.opts.map((o, i) => {
        const gr = reveal ? rv.groups.find((x) => x.id === o.id) : null;
        const isShown = gr && shown.has(o.id);
        const stamp = isShown ? (gr.truth ? '<span class="stamp truth">TRUTH</span>' : gr.vince ? `<span class="stamp vince">${gr.authors.length && P_(gr.authors[0])?.house ? 'THE HOUSE' : "VINCE'S LIE"}</span>` : `<span class="stamp lie">${gr.authors.map((a) => name(a)).join(' + ')}</span>`) : '';
        const cls = reveal ? (isShown ? (gr.truth ? 'win' : '') : 'dim') : '';
        return `<div class="ans ${o.bold ? 'bold' : ''} ${cls}"><span class="l">${L[i] || i + 1}</span><span>${esc(o.text)}</span>${stamp}${isShown ? whoPicked(gr.voters) : ''}</div>`;
      }).join('');
      return frame(`${qMeta(q, '<span class="chip hot">Find the truth</span>')}<p class="qtext md">${esc(q.text).replace('___', '<u>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</u>')}</p>${q.open ? timer(q.ends) : ''}<div class="answers opts">${tiles}</div>`, q.open);
    },
    who(q) {
      const rv = S.rev; const reveal = S.step === 'reveal' && rv;
      const guesses = reveal ? Object.entries(rv.picks) : [];
      return frame(`${qMeta(q, '<span class="chip hot">Who wrote this?</span>')}<div class="folder" style="width:100%;transform:rotate(-.6deg)"><span class="conf">${reveal ? 'EXPOSED' : 'CONFIDENTIAL'}</span><h2>From the Dossier</h2><p class="dq">${esc(q.text)}</p><p class="da">${esc(q.answer)}</p>
        ${reveal ? `<div class="by">Written by ${face(P_(rv.author), 'md')} ${name(rv.author)}</div><div class="by" style="font-size:1rem">${guesses.map(([g, v]) => `${face(P_(g), 'xs')} guessed ${name(v)}${v === rv.author ? ' ✔' : ''}`).join(' · ')}</div>` : ''}</div>${q.open ? timer(q.ends) : ''}`, q.open);
    },
    laywrite(q) {
      return frame(`<div class="center"><h2 class="rtitle" style="font-size:4.2rem">Lie About Yourself</h2><p class="sub">Everyone has one of their own Dossier answers on their phone. Write a fake one to sit beside it.</p><div class="done-list">${S.players.filter((p) => !p.bot).map((p) => `<div class="p ${q.locked.includes(p.id) ? 'ok' : ''}">${face(p, 'md')}<span>${esc(p.name)}</span></div>`).join('')}</div>${timer(q.ends)}</div>`, true);
    },
    lay(q) {
      const rv = S.rev; const reveal = S.step === 'reveal' && rv;
      const by = { 0: [], 1: [] }; if (reveal) Object.entries(rv.picks).forEach(([id, v]) => by[v].push(id));
      const cards = q.pair.map((a, i) => `<div class="card ${reveal && i !== rv.real ? 'dim' : ''}"><span class="l">${L[i]}</span>"${esc(a)}"${reveal && i === rv.real ? '<span class="stamp">REAL</span>' : ''}${reveal ? whoPicked(by[i]).replace('class="who"', 'class="who"') : ''}</div>`).join('');
      return frame(`${qMeta(q, `<span class="chip hot">Which did ${name(q.owner)} really write?</span>`)}<p class="qtext md">${face(P_(q.owner), 'sm')} ${esc(q.text)}</p>${q.open ? timer(q.ends) : ''}<div class="pair">${cards}</div>`, q.open);
    },
    bomb(q) {
      const h = P_(q.holder); const step = S.step;
      const bombArt = W.img('rg-bomb') ? `<img src="${W.img('rg-bomb')}" alt="">` : ''; const bc = bombArt ? 'bomb art' : 'bomb';
      if (step === 'start') return frame(`<div class="bombzone"><div class="${bc}">${bombArt}<span class="spark"></span><span class="secs">${q.n}</span></div><div><p class="big-note">Bomb ${q.n} of ${q.of}</p><div class="holder">${face(h, 'lg')}<b>${esc(h.name)} has it</b></div><p class="sub">Answer right to pass it on. Wrong, or too slow, and it blows: -$500. Every pass makes the fuse shorter.</p></div></div>`);
      if (step === 'boom') {
        const dl = S.rev?.deltas?.[q.boom];
        return frame(`<div class="bombzone"><div class="bomb boom"><span class="secs" style="color:#fff">BOOM</span></div><div><div class="holder">${face(h, 'lg')}<b>${esc(h.name)} blew up</b></div><p class="qtext md">${esc(q.text)}</p><p class="big-note">It was ${q.answer ? 'TRUE' : 'FALSE'}${q.picked === null || q.picked === undefined ? ', and they ran out of time' : ''}.${dl ? ` ${signed(dl)}` : ''}</p></div></div>`, false, true);
      }
      const ring = S.players.map((p) => `<span class="s ${p.id === q.holder ? 'on' : ''}">${face(p, 'xs')}${esc(p.name)}</span>`).join('');
      return frame(`<div class="meta"><span class="chip hot">Bomb ${q.n} of ${q.of}</span><span class="chip">Passes: ${q.passes}</span><span class="chip">Fuse: ${q.fuse}s</span></div><div class="bombzone"><div class="${bc}">${bombArt}<span class="spark"></span><span class="secs" data-ends="${q.ends}"></span></div><div><div class="holder">${face(h, 'md')}<b>${esc(h.name)}</b></div><p class="qtext">${esc(q.text)}</p><div class="tf"><span>TRUE</span><span>FALSE</span></div></div></div>${timer(q.ends)}<div class="seat-ring">${ring}</div>`, true, true);
    },
    num(q) {
      const rv = S.rev; const reveal = S.step === 'reveal' && rv;
      if (!reveal) return frame(`${qMeta(q, '<span class="chip hot">Closest Number</span>')}<p class="qtext">${esc(q.text)}</p>${timer(q.ends)}<p class="big-note" style="margin-top:auto">Type a number on your phone</p>`, true);
      const fmt = (v) => (q.unit && Math.abs(v) >= 1000 ? Math.round(v).toLocaleString('en-US') : String(v));
      const rows = rv.list.map((r) => {
        const best = rv.closest.includes(r.id); const worst = rv.furthest.includes(r.id) && rv.list.length > 1;
        const bettors = Object.entries(rv.bets || {}).filter(([, on]) => on === r.id).map(([b]) => face(P_(b), 'xs')).join('');
        return `<div class="numrow ${best ? 'best' : ''} ${worst ? 'worst' : ''}">${face(P_(r.id), 'sm')}<span>${name(r.id)} ${best ? '<em style="background:var(--velvet-2)">Closest</em>' : ''} ${worst ? '<em>Most wrong</em>' : ''}</span><span style="display:flex;gap:.2rem">${bettors}</span><span class="v">${fmt(r.v)}</span></div>`;
      }).join('');
      return frame(`<p class="qtext md">${esc(q.text)}</p><div class="bigans">${fmt(rv.answer)}<small>${esc(q.unit || '')}</small></div><div class="numlist">${rows || '<p class="sub">Nobody guessed. Incredible.</p>'}</div>`);
    },
    bet(q) {
      return frame(`${qMeta(q, '<span class="chip hot">Side bet</span>')}<p class="qtext md">${esc(q.text)}</p><p class="big-note">Bet $100 on who will be the furthest off. Winning bets pay $400.</p>${timer(q.ends)}<div class="seat-ring">${S.players.map((p) => `<span class="s">${face(p, 'xs')}${esc(p.name)}</span>`).join('')}</div>`, true);
    },
  };

  // ---------------------------------------------------------------- ticker: every attack, bribe and copy
  let lastSplash = 0;
  function showSplash() {
    const sp = S.splash; if (!sp || sp.id === lastSplash) return;
    const fresh = P !== null; lastSplash = sp.id; if (!fresh) return;
    const by = sp.by ? name(sp.by) : 'Someone'; const t = sp.target ? name(sp.target) : '';
    let e = '💥'; let text = ''; let cls = 'bad';
    if (sp.k === 'sab') { e = sabIcon(sp.s); text = sp.bounced ? `${t}'s own ${SAB[sp.s]?.[0]} bounced back off ${by}'s shield!` : `${by} hit ${t} with ${SAB[sp.s]?.[0]}!`; }
    if (sp.k === 'bribe') { e = BRIBE[sp.b]?.[1] || '💰'; cls = 'cash'; text = sp.by ? `${by} bribed Vince: ${BRIBE[sp.b]?.[0]}` : 'Someone just slipped Vince an envelope...'; }
    if (sp.k === 'copy') { e = '📋'; cls = 'good'; text = `${by} paid to copy ${t}`; }
    if (sp.k === 'boo') { e = '👎'; text = `${by} booed ${t}!`; }
    if (sp.k === 'cheer') { e = '📣'; cls = 'good'; text = sp.by === sp.target ? `${by} is cheering for themselves` : `${by} is cheering for ${t}`; }
    if (sp.k === 'spin') { e = '🎡'; cls = 'cash'; text = `${by} spun the Rule Wheel!`; }
    if (sp.k === 'heckle') { e = '🗯️'; text = `${by} to ${t}: "${esc(sp.text)}"`; }
    if (sp.k === 'robin') { e = '🏹'; cls = 'cash'; text = `Robin Hood: ${by} pays $200 to ${t}`; }
    if (sp.k === 'lift') { e = '🛗'; cls = 'cash'; text = `${by} bought a Lift!`; }
    if (sp.k === 'grease') { e = '🧈'; text = `${by} greased ${t}'s rung!`; }
    const el = document.createElement('div'); el.className = `tk ${cls}`; el.innerHTML = `<span class="e">${e}</span><span>${text}</span>`;
    ticker.prepend(el); while (ticker.children.length > 4) ticker.lastChild.remove();
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 450); }, 3600);
  }

  // ---------------------------------------------------------------- render
  function skeleton(root) { const c = root.cloneNode(true); c.querySelectorAll('[id]').forEach((n) => { n.innerHTML = ''; }); return c.innerHTML; }
  let lastKey = '';
  function render() {
    if (!S) return;
    document.body.dataset.phase = S.phase;
    document.body.classList.toggle('wide', ['LOBBY', 'END', 'LADDER', 'INTRO', 'SCORES'].includes(S.phase) || (S.phase === 'ROUND' && S.round === 7));
    const now = S.rules.map((r) => r.k);
    if (prevRules) newRules = new Set(now.filter((k) => !prevRules.includes(k))); prevRules = now;
    setStudio(); mount(top, topBar()); mount(dock, dockHtml()); mount(board, boardHtml());
    const html = (R[S.phase] || (() => ''))();
    const q = S.q;
    const key = `${S.phase}|${S.step}|${q?.kind || ''}|${q?.seq || ''}|${S.x?.step || ''}|${S.x?.at || ''}|${S.x?.card || ''}`;
    if (key !== lastKey) {
      lastKey = key; stage.classList.remove('enter'); void stage.offsetWidth; stage.classList.add('enter');
      stage.innerHTML = html; stage.__html = html; stage.__skel = skeleton(stage);
      setTimeout(() => stage.classList.remove('enter'), 900);
    } else if (stage.__html !== html) {
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
    const ph = S.phase; const k = S.q?.kind;
    let key = 'rg-lobby'; let mood = 'lobby';
    if (ph === 'Q' && k === 'bomb') { key = 'rg-bomb'; mood = 'tense'; }
    else if (ph === 'Q' || ph === 'DOSSIER') { key = 'rg-question'; mood = 'pitch'; }
    else if (ph === 'WHEEL') { key = 'rg-wheel'; mood = 'ratings'; }
    else if (ph === 'LADDER' || ph === 'END') { key = 'rg-finale'; mood = 'finale'; }
    else if (ph === 'ROUND' || ph === 'DEMO' || ph === 'INTRO') { key = 'rg-lobby'; mood = 'show'; }
    AV.setBed(ph === 'Q' ? 0.4 : 0.5);
    const id = `${key}|${mood}`;
    if (id !== lastMusic) { lastMusic = id; AV.music(key, mood); }
  }

  // ---------------------------------------------------------------- Vince and the sound effects
  let lastCue = null; let lastFx = 0; let capTimer = null; let lastPlayers = 0;
  function effects() {
    const cue = S.cue;
    if (cue && cue.id !== lastCue) {
      lastCue = cue.id; caption.textContent = cue.text; caption.className = 'show';
      clearTimeout(capTimer);
      AV.speak(cue, (id) => { socket.emit('host:cueDone', { id }); capTimer = setTimeout(() => { if (lastCue === id) caption.className = ''; }, 500); });
    } else if (!cue) { if (!AV.speakingId()) caption.className = ''; }
    const fresh = (S.fx || []).filter((f) => f.id > lastFx);
    if (P === null) lastFx = Math.max(0, ...(S.fx || []).map((f) => f.id)); else fresh.forEach((f) => { lastFx = Math.max(lastFx, f.id); AV.fx(f.name, { gap: 150 }); });
    if (S.phase === 'LOBBY' && S.players.length > lastPlayers && P) AV.fx('join');
    lastPlayers = S.players.length;
  }
})();
