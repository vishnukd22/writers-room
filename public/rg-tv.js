/* RIGGED! The TV is the studio: the question, the one live rule, the podiums, the Showdowns and the Rigged Race. */
(() => {
  const $ = (q) => document.querySelector(q);
  const esc = W.esc;
  const TEST = new URLSearchParams(location.search).has('test');
  const socket = io({ autoConnect: false, transports: ['websocket', 'polling'] });
  window.__gnSocket = socket;
  window.__gnTV = true;
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
  const SAB = { fog: ['Fog', '🌫️'], shuffle: ['Shuffle', '🔀'], mirror: ['Mirror', '🪞'], tiny: ['Tiny Text', '🐜'], quake: ['Earthquake', '🌋'], freeze: ['Freeze', '🧊'] };
  const sabIcon = (k) => (W.img(`rg-sab-${k}`) ? `<img src="${W.img(`rg-sab-${k}`)}" alt="" style="width:2.3rem;height:2.3rem;object-fit:contain">` : SAB[k]?.[1] || '💥');
  const ruleCard = (r, cls = '') => `<div class="rcard ${cls}">${cardArt(r.k) || `<div class="em">${r.emoji || '🃏'}</div>`}<b>${esc(r.name)}</b><p>${esc(r.text)}</p></div>`;
  const bigCard = (c, over = '') => (c ? `<div class="bigcard">${cardArt(c.k) || `<div class="em">${c.emoji || '🃏'}</div>`}<span class="type">The rule now</span><b>${esc(c.name)}</b><p>${esc(c.text)}</p>${over}</div>` : '');
  const vince = () => `<div class="vince">${W.img('rg-vince') ? `<img src="${W.img('rg-vince')}" alt="Vince Velvet">` : '🎩'}</div>`;

  // ---------------------------------------------------------------- the studio backdrop (your art if it's there)
  let lastArt = '';
  function setStudio() {
    const img = W.img('rg-stage');
    const key = `${img}`; if (key === lastArt) return; lastArt = key;
    $('#studio').className = img ? 'has-art' : '';
    $('#art').style.backgroundImage = img ? `url(${img})` : 'none';
  }

  // ---------------------------------------------------------------- frame
  function topBar() {
    if (S.phase === 'LOBBY') return '<div></div><div></div>' + codeBox();
    const logo = W.img('rg-logo') ? `<div class="logo"><img src="${W.img('rg-logo')}" alt="RIGGED!"></div>` : '<div class="logo">RIGGED!</div>';
    const sub = S.round === 7 ? "Tonight's show" : S.round === 6 ? 'The finale' : S.round === 5 ? 'Before the finale' : S.round ? `Round ${S.round} of 4` : '';
    const mid = S.round ? `<div class="rname"><span>${sub}</span><b>${esc(S.roundName)}</b></div>` : '<div></div>';
    return logo + mid + codeBox();
  }
  const codeBox = () => `<div class="code"><b>${esc(S.code)}</b><small>${esc(host())}/rg${TEST ? ' · test mode' : ''}</small></div>`;
  let lastRule = null; let ruleNew = false;
  function boardHtml() {
    const r = S.rule;
    if (r && r.k !== lastRule) { ruleNew = lastRule !== null || P !== null; lastRule = r.k; } else if (!r) lastRule = null;
    const sabs = S.players.filter((p) => !p.house);
    return `<div class="rb-title">The rule right now</div>${r ? ruleCard(r, ruleNew ? 'new' : '') : '<div class="rb-empty">No rule yet. After each round, last place picks one. Only one rule at a time.</div>'}
      <div class="rb-title" style="margin-top:1vh">Sabotage left</div><div class="sabs">${sabs.map((p) => `<span class="${p.sab ? 'used' : ''}" title="${esc(p.name)}">${face(p, 'xs')}</span>`).join('')}</div>`;
  }
  function dockHtml() {
    if (S.phase === 'LOBBY') return '';
    const q = S.q; const rev = S.rev; const sd = S.sd; const race = S.race;
    const locked = new Set(q?.locked || race?.locked || []);
    const holder = q?.kind === 'bomb' ? q.holder : null;
    const duelists = sd ? [sd.a, sd.b] : [];
    return `<div class="podiums">${S.players.map((p) => {
      const dl = rev?.deltas?.[p.id] || sd?.deltas?.[p.id];
      const inRace = S.phase === 'FINALE';
      return `<div class="pod ${locked.has(p.id) ? 'locked' : ''} ${p.connected || p.bot ? '' : 'off'} ${holder === p.id ? 'hasbomb' : ''} ${duelists.includes(p.id) ? 'duelist' : ''} ${(p.fx || []).map((f) => `fx-${f}`).join(' ')}" style="--c:${p.color}" id="pod-${p.id}"><i class="lamp"></i>${face(p, 'md')}<b>${esc(p.name)}</b><div class="cash">${inRace ? `${p.pos} of ${race?.len || 15}` : $$(p.cash)}</div>${dl ? `<div class="delta ${dl > 0 ? 'up' : 'down'}">${signed(dl)}</div>` : ''}</div>`;
    }).join('')}</div>`;
  }

  // ---------------------------------------------------------------- the stage
  const frame = (inner, live = false, hot = false) => `<div class="marquee ${live ? 'live' : ''} ${hot ? 'hot' : ''}"><div class="inner">${inner}</div></div>`;
  const qMeta = (q, extra = '') => `<div class="meta">${q.cat ? `<span class="chip gold">${esc(q.cat)}</span>` : ''}${q.of ? `<span class="chip">Question ${q.n} of ${q.of}</span>` : ''}${extra}<span class="count" id="cnt">${q.open && q.eligible ? `${q.locked.length} of ${q.eligible.length} locked` : ''}</span></div>`;
  const whoPicked = (ids) => (ids.length ? `<div class="who">${ids.map((id) => face(P_(id), 'xs')).join('')}</div>` : '');
  const R = {
    LOBBY() {
      const art = W.img('rg-title');
      const people = S.players.map((p) => `<div class="joiner">${face(p, 'md')}<b>${esc(p.name)}</b>${p.bot ? '<small>bot</small>' : ''}</div>`).join('');
      const n = S.players.length;
      const test = TEST ? `<div class="testbar"><button data-tv="bot">Add a bot</button><button data-tv="fill">Fill to 4</button><button class="ghost" data-tv="nobots">Remove bots</button><button data-tv="start">Start</button></div>` : '';
      return `<div class="lobby"><div>${art ? `<img class="title-img" src="${art}" alt="RIGGED!">` : '<h1 class="title">RIGGED!</h1>'}<p class="tag">The quiz show where the questions are fair and nothing else is.</p>
        <div class="joiners">${people || '<p class="sub">Nobody here yet. Scan the code to join.</p>'}</div>
        <p class="lnote">${n === 2 ? 'Two players: the House will join as a third contestant.' : n < 2 ? 'You need 2 to 8 players. The first phone can add bots.' : `${n} players. The first phone starts the show.`} About 20 minutes.</p>${test}</div>
        <div class="joinbox"><div class="url">Join at ${esc(host())}/rg</div>${S.qr ? `<img src="${S.qr}" alt="">` : ''}<div class="c">${esc(S.code)}</div></div></div>`;
    },
    INTRO() { return frame(`<div class="center">${vince()}<p class="big-note">Live from the studio that never got cancelled</p></div>`); },
    DOSSIER() {
      const done = S.players.filter((p) => !p.bot);
      return frame(`<div class="folder"><span class="conf">CONFIDENTIAL</span><h2>The Dossier</h2><p class="dq">Three questions on your phone. Sixty seconds. Vince will use every word against you.</p>
        <div class="done-list" id="dl">${done.map((p) => `<div class="p ${p.done ? 'ok' : ''}">${face(p, 'md')}<span>${esc(p.name)}</span></div>`).join('')}</div></div>${timer(S.endsAt)}`, true);
    },
    ROUND() {
      const x = S.x;
      const blurb = { 1: 'Five trivia questions and one from the Dossier. Only the first one is easy.', 2: 'Write a fake answer. Find the real one.', 3: 'Harder trivia, and another Dossier question.', 4: 'True or false, passed phone to phone. Wrong answer: boom.' }[x.n];
      return frame(`<div class="center"><div class="rnum">Round ${x.n}</div><h2 class="rtitle">${esc(x.name)}</h2><p class="sub">${esc(blurb || '')}</p><p class="sub small">A Showdown ends every round: the leader against last place.</p></div>`);
    },
    DEMO() {
      const rows = Object.entries(SAB).map(([s, v]) => `<div class="d"><span>${sabIcon(s)}</span><b>${v[0]}</b></div>`).join('');
      return frame(`<div class="center"><h2 class="rtitle" style="font-size:4rem">One sabotage each</h2><div class="demo-row">${rows}</div><p class="sub">Tap the big button on your phone, then a face. You get one of these at random. Once per game.</p></div>`);
    },
    Q() { const q = S.q; if (!q) return ''; return (QK[q.kind] || (() => ''))(q); },
    RULE() {
      const x = S.x;
      if (x.step === 'pick') return frame(`<div class="center" style="gap:2.4vh"><div class="picker">${face(P_(x.picker), 'md')}<span>${name(x.picker)} is in last place, so they pick the next rule</span></div><div class="offer">${x.offer.map((r) => ruleCard(r)).join('')}</div><p class="sub small">Only one rule at a time. The new one replaces the old one.</p>${timer(S.endsAt)}</div>`, true);
      return frame(`<div class="center">${bigCard(x.card)}<p class="sub">Picked by ${name(x.picker)}${x.old ? `. Goodbye, ${esc(x.old.name)}.` : ''}</p></div>`);
    },
    SCORES() {
      const x = S.x;
      const rows = x.order.map((id, i) => { const p = P_(id); return `<div class="rank ${i === 0 ? 'first' : ''}"><span class="n">${i + 1}</span>${face(p, 'sm')}<span>${esc(p.name)}${id === x.last && S.round < 4 ? ' <span class="chip hot" style="font-size:.8rem">picks the next rule</span>' : ''}</span><span class="v">${$$(p.cash)}</span></div>`; }).join('');
      const roast = x.roast ? `<div class="roast"><div class="folder small"><span class="conf">FROM THE FILE OF ${esc(P_(x.roast.who)?.name || '').toUpperCase()}</span><p class="dq">${esc(x.roast.q)}</p><p class="da">"${esc(x.roast.a)}"</p></div></div>` : '';
      return frame(`<div class="meta"><span class="chip gold">After round ${x.n}</span><span class="chip">Bucks buy a head start in the final race</span></div><div class="scoregrid ${roast ? 'with-roast' : ''}"><div class="ranks">${rows}</div>${roast}</div>`);
    },
    SHOWDOWN() {
      const sd = S.sd; if (!sd) return '';
      const a = P_(sd.a); const b = P_(sd.b); const q = S.q;
      const res = sd.step === 'result';
      const backers = (id) => Object.entries(sd.bets || {}).filter(([, on]) => on === id).map(([pid]) => face(P_(pid), 'xs')).join('');
      const side = (p, k) => `<div class="side ${res ? (sd.winner === p.id ? 'won' : 'lost') : ''}">${face(p, sd.step === 'q' || res ? 'md' : 'lg')}<b>${esc(p.name)}</b><small>${$$(p.cash)}</small>${res && sd.picks ? `<em class="pk">${sd.picks[p.id] === null || sd.picks[p.id] === undefined ? 'No answer' : esc(q?.answers?.[sd.picks[p.id]] || '')}</em>` : ''}${res ? `<div class="backers">${backers(p.id)}</div>` : ''}</div>`;
      const title = sd.grudge ? 'Grudge Match' : 'Showdown';
      const prize = sd.grudge ? 'Winner gets a head start in the race' : `Winner takes ${$$(sd.pot)} from the loser`;
      let mid = '';
      if (sd.step === 'bet') mid = `<p class="big-note">Everyone else: bet ${$$(200)} on a winner</p><p class="count" id="nb">${sd.nBets} bet${sd.nBets === 1 ? '' : 's'} in</p>${timer(S.endsAt)}`;
      if (sd.step === 'ready') mid = '<p class="big-note">Get ready...</p>';
      if ((sd.step === 'q' || res) && q) {
        const ans = q.answers.map((t, i) => `<div class="ans ${res ? (i === sd.correct ? 'win' : 'dim') : ''}"><span class="l">${L[i]}</span><span>${esc(t)}</span></div>`).join('');
        mid = `<div class="meta"><span class="chip gold">${esc(q.cat || '')}</span></div><p class="qtext md">${esc(q.text)}</p>${q.quote ? `<p class="quote">"${esc(q.quote)}"</p>` : ''}${q.open ? timer(q.ends) : ''}<div class="answers ${q.answers.length === 2 ? 'two' : ''}">${ans}</div>`;
      }
      return frame(`<div class="duel"><div class="dtitle"><span>${title}</span><small>${prize}</small></div>${side(a, 'a')}<div class="vs">VS</div>${side(b, 'b')}<div class="dmid">${mid}</div></div>`, sd.step === 'q', sd.step === 'q');
    },
    GRUDGE() {
      const x = S.x;
      if (x.step === 'pick') return frame(`<div class="center"><h2 class="rtitle" style="font-size:4.4rem">Grudge Match</h2><div class="picker">${face(P_(x.picker), 'lg')}<span>${name(x.picker)} is in last place. They pick anyone to duel. The winner gets a head start in the race.</span></div>${timer(S.endsAt)}</div>`, true);
      return frame(`<div class="center"><h2 class="rtitle" style="font-size:4.4rem">Grudge Match</h2><div class="picker big">${face(P_(x.picker), 'lg')}<span class="vs">VS</span>${face(P_(x.target), 'lg')}</div><p class="big-note">${name(x.picker)} picked ${name(x.target)}</p></div>`);
    },
    FINALE() {
      const r = S.race; if (!r) return '';
      const lanes = [...S.players].map((p) => {
        const pct = Math.min(100, (p.pos / r.len) * 100);
        const dl = r.deltas?.[p.id];
        return `<div class="lane ${r.winner === p.id ? 'win' : ''}" style="--c:${p.color}"><span class="ln">${esc(p.name)}</span><div class="track"><i class="finish"></i><div class="runner" style="left:calc(${pct}% - 1.6rem)">${face(p, 'sm')}${dl ? `<em class="${dl > 0 ? 'up' : 'down'}">${dl > 0 ? '+' : ''}${dl}</em>` : ''}</div></div><b class="pos">${p.pos}</b></div>`;
      }).join('');
      if (r.step === 'intro') return frame(`<div class="center"><h2 class="rtitle" style="font-size:4.4rem">The Rigged Race</h2><p class="sub">Tap every answer that fits. Right taps move you forward, wrong taps move you back. First to ${r.len} wins the show.</p><div class="race">${lanes}</div><p class="sub small">Your Bucks bought your head start. Last place got the most.</p></div>`);
      if (r.step === 'win') return frame(`<div class="center"><h2 class="rtitle" style="font-size:4.6rem">${name(r.winner)} wins!</h2><div class="race">${lanes}</div></div>`);
      const show = r.step === 'reveal';
      const opts = r.opts.map((t, i) => {
        const ok = show && r.right.includes(i);
        const by = show ? Object.entries(r.picks || {}).filter(([, ks]) => ks.includes(i)).map(([pid]) => pid) : [];
        return `<div class="ans ${show ? (ok ? 'win' : 'dim') : ''}"><span class="l">${L[i]}</span><span>${esc(t)}</span>${show ? whoPicked(by) : ''}</div>`;
      }).join('');
      return frame(`<div class="meta"><span class="chip gold">${r.room ? 'The Room' : 'Tap every one that fits'}</span><span class="chip">Question ${r.n} of ${r.of}</span><span class="count" id="rcnt">${r.step === 'q' ? `${r.locked.length} of ${S.players.length} locked` : ''}</span></div><p class="qtext md">${esc(r.text)}</p>${r.step === 'q' ? timer(S.endsAt) : ''}<div class="answers six">${opts}</div><div class="race compact">${lanes}</div>`, r.step === 'q');
    },
    END() {
      const x = S.x; if (!x.ranks) return frame('<div class="center"><p class="big-note">And the winner is...</p></div>');
      const ranks = x.ranks.map((r, i) => `<div class="rank ${i === 0 ? 'first' : ''}"><span class="n">${i + 1}</span>${face(r, 'sm')}<span>${esc(r.name)}</span><span class="v">${i === 0 ? 'Winner' : `${r.pos} steps`}</span></div>`).join('');
      const awards = x.awards.map((a) => `<div class="award">${face(P_(a.who), 'sm')}<div><b>${esc(a.title)}</b><small>${name(a.who)}: ${esc(a.text)}</small></div></div>`).join('');
      return frame(`<div class="meta">${x.houseWon ? '<span class="chip hot">The House wins. Nobody wins.</span>' : `<span class="chip gold">${esc(x.ranks[0]?.name || '')} wins RIGGED!</span>`}</div><div class="endgrid"><div class="ranks">${ranks}</div><div class="awards">${awards}</div></div>`);
    },
  };

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
      const shown = new Set(reveal ? rv.shown : []);
      const tiles = q.opts.map((o, i) => {
        const gr = reveal ? rv.groups.find((x) => x.id === o.id) : null;
        const isShown = gr && shown.has(o.id);
        const stamp = isShown ? (gr.truth ? '<span class="stamp truth">TRUTH</span>' : gr.vince ? `<span class="stamp vince">${gr.authors.length && P_(gr.authors[0])?.house ? 'THE HOUSE' : "VINCE'S LIE"}</span>` : `<span class="stamp lie">${gr.authors.map((a) => name(a)).join(' + ')}</span>`) : '';
        const cls = reveal ? (isShown ? (gr.truth ? 'win' : '') : 'dim') : '';
        return `<div class="ans ${cls}"><span class="l">${L[i] || i + 1}</span><span>${esc(o.text)}</span>${stamp}${isShown ? whoPicked(gr.voters) : ''}</div>`;
      }).join('');
      return frame(`${qMeta(q, '<span class="chip hot">Find the truth</span>')}<p class="qtext md">${esc(q.text).replace('___', '<u>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</u>')}</p>${q.open ? timer(q.ends) : ''}<div class="answers opts">${tiles}</div>`, q.open);
    },
    who(q) {
      const rv = S.rev; const reveal = S.step === 'reveal' && rv;
      const guesses = reveal ? Object.entries(rv.picks) : [];
      return frame(`${qMeta(q, '<span class="chip hot">Who wrote this?</span>')}<div class="folder" style="width:100%;transform:rotate(-.6deg)"><span class="conf">${reveal ? 'EXPOSED' : 'CONFIDENTIAL'}</span><h2>From the Dossier</h2><p class="dq">${esc(q.text)}</p><p class="da">${esc(q.answer)}</p>
        ${reveal ? `<div class="by">Written by ${face(P_(rv.author), 'md')} ${name(rv.author)}</div><div class="by" style="font-size:1rem">${guesses.map(([g, v]) => `${face(P_(g), 'xs')} guessed ${name(v)}${v === rv.author ? ' ✔' : ''}`).join(' · ')}</div>` : ''}</div>${q.open ? timer(q.ends) : ''}`, q.open);
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
  };

  // ---------------------------------------------------------------- ticker: sabotage and Robin Hood
  let lastSplash = 0;
  function showSplash() {
    const sp = S.splash; if (!sp || sp.id === lastSplash) return;
    const fresh = P !== null; lastSplash = sp.id; if (!fresh) return;
    const by = sp.by ? name(sp.by) : 'Someone'; const t = sp.target ? name(sp.target) : '';
    let e = '💥'; let text = ''; let cls = 'bad';
    if (sp.k === 'sab') { e = sabIcon(sp.s); text = `${by} hit ${t} with ${SAB[sp.s]?.[0]}!`; }
    if (sp.k === 'robin') { e = '🏹'; cls = 'cash'; text = `Robin Hood: ${by} pays $200 to ${t}`; }
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
    document.body.classList.toggle('wide', ['LOBBY', 'END', 'INTRO', 'SCORES', 'SHOWDOWN', 'GRUDGE', 'FINALE'].includes(S.phase));
    setStudio(); mount(top, topBar()); mount(dock, dockHtml()); mount(board, boardHtml());
    const html = (R[S.phase] || (() => ''))();
    const q = S.q;
    const key = `${S.phase}|${S.step}|${q?.kind || ''}|${q?.seq || ''}|${S.x?.step || ''}|${S.x?.at || ''}|${S.sd?.step || ''}|${S.race?.n || ''}|${S.race?.step || ''}`;
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
    else if (ph === 'RULE' || ph === 'SHOWDOWN' || ph === 'GRUDGE') { key = 'rg-wheel'; mood = 'ratings'; }
    else if (ph === 'FINALE' || ph === 'END') { key = 'rg-finale'; mood = 'finale'; }
    else if (ph === 'ROUND' || ph === 'DEMO' || ph === 'INTRO') { key = 'rg-lobby'; mood = 'show'; }
    AV.setBed(ph === 'Q' || ph === 'FINALE' ? 0.4 : 0.5);
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
