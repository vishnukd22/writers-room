/* Last Night in the Mansion: the painted rooms (Hold Still, Hide and Seek, the Séance, Mortimer's Mercy),
   choosing a door, and The Collapse. MP.tv() and MP.phone() return HTML; MP.after() moves the live bits. */
window.MP = (() => {
  const esc = W.esc; const img = (k) => W.img(k); const pic = (k, cls = '') => (img(k) ? `<img class="${cls}" src="${img(k)}" alt="">` : '');
  const ARROW = { u: '⬆', d: '⬇', l: '⬅', r: '➡' }; const DNAME = { u: 'UP', d: 'DOWN', l: 'LEFT', r: 'RIGHT' };
  const secsLeft = (w) => (w ? Math.max(0, Math.ceil((w - W.now()) / 1000)) : '');

  // ---------------------------------------------------------------- shared cards
  function roomCard(S, big) {
    const r = S.x.room || {}; const st = S.step; const k = S.x.kind;
    if (st === 'intro') return `<div class="pc intro">${pic(r.art, 'pc-art')}<div class="pc-txt"><span class="pc-k">${r.key === 'mercy' ? 'A small kindness' : `Room ${S.roomN || ''}`}</span><h2>${esc(r.name || '')}</h2><p class="goal">${esc(r.goal || '')}</p></div></div>`;
    if (st === 'ready') return `<div class="pc ready"><span class="pc-k">${esc(r.name || '')}</span><h2>${k === 'quick' ? 'Fast!' : `Round ${k}`}</h2><p class="goal">${esc(r.goal || '')}</p></div>`;
    if (st === 'won') return `<div class="pc won"><h2>Round won</h2><p>The candle grows a little.</p></div>`;
    if (st === 'lost') return `<div class="pc lost"><h2>Round lost</h2><p>The candle drips.</p></div>`;
    if (st === 'result') return r.key === 'mercy' ? `<div class="pc won"><h2>Candle +${S.x.gained || 0}%</h2></div>` : `<div class="pc ${S.x.gotKey ? 'won' : 'lost'}">${S.x.gotKey ? pic('mn-key', 'pc-key') : ''}<h2>${S.x.gotKey ? 'A key piece!' : 'No key piece'}</h2><p>${S.x.wins} of 2 rounds won.</p></div>`;
    return '';
  }

  // ---------------------------------------------------------------- TV
  function tv(S) {
    const ph = S.phase; const st = S.step; const px = S.x.px;
    if (ph === 'DOORS') return tvDoors(S);
    if (ph === 'ACCUSE') return tvAccuse(S);
    if (ph === 'COLLAPSE' && st !== 'play') {
      if (st === 'intro') return '<div class="pc collapse"><h2>The house is coming down!</h2><p class="goal">Every room again, fast. Don\'t stop.</p></div>';
      if (st === 'quake') return `<div class="pc collapse quake"><span class="pc-k">${S.x.collapse.n} of ${S.x.collapse.of}</span><h2>${esc(S.x.room?.name || '')}</h2><p class="goal">${esc(S.x.room?.goal || '')}</p></div>`;
      return '<div class="pc collapse"><h2>The front door...</h2></div>';
    }
    if (st !== 'play' || !px || !px.ui) return roomCard(S, true);
    return (TV[px.room] || (() => ''))(S, px);
  }
  function tvDoors(S) {
    const d = S.x.doors || { opts: [] }; const voted = d.voted || [];
    const cards = d.opts.map((o) => { const n = d.tally ? d.tally[o.key] || 0 : null; const on = d.choice === o.key; return `<div class="door ${on ? 'on' : ''} ${d.choice && !on ? 'off' : ''} ${o.key === 'mercy' ? 'mercy' : ''}">${pic(o.art, 'door-art')}<div class="door-txt"><h3>${esc(o.name)}</h3><p>${esc(o.goal)}</p>${n !== null ? `<b class="votes">${n} vote${n === 1 ? '' : 's'}</b>` : ''}</div></div>`; }).join('');
    const who = S.players.map((p) => `<span class="vchip ${voted.includes(p.id) ? 'on' : ''}">${esc(p.name)}</span>`).join('');
    return `<div class="doors"><h2 class="doors-h">${d.choice ? 'Through here, then.' : 'Choose a door on your phone'}${d.until && !d.choice ? ` <small>${secsLeft(d.until)}</small>` : ''}</h2><div class="door-row n${d.opts.length}">${cards}</div><div class="vchips">${who}</div></div>`;
  }
  function tvAccuse(S) {
    const a = S.x.accuse || {}; const r = a.reveal;
    const faces = S.players.map((p) => { const n = r && r.tally ? r.tally[p.id] || 0 : 0; const it = r && r.id === p.id; return `<div class="acc ${it ? 'it' : ''} ${(a.voted || []).includes(p.id) ? 'voted' : ''}">${W.bust(p, 'lg')}<b>${esc(p.name)}</b>${r ? `<span>${n} vote${n === 1 ? '' : 's'}</span>` : ''}${it ? '<em>POSSESSED</em>' : ''}</div>`; }).join('');
    return `<div class="accuse"><h2 class="doors-h">${r ? (r.caught ? 'Caught! The spirit lets go.' : 'Wrong! The spirit got away.') : 'Someone was possessed. Who?'}${!r && a.until ? ` <small>${secsLeft(a.until)}</small>` : ''}</h2><div class="accs">${faces}</div>${r ? '' : '<p class="pc-k" style="text-align:center">Vote on your phone</p>'}</div>`;
  }
  const TV = {
    doll(S, d) {
      const say = d.phase === 'red' ? 'FREEZE!' : d.phase === 'warn' ? 'She\'s turning...' : 'SNEAK!';
      const face = d.phase === 'red' ? 'mn-doll' : 'mn-doll-back';
      const scale = 0.55 + (d.prog / 100) * 0.75;
      if (d.lunge) return `<div class="doll lunge">${pic('mn-doll', 'doll-lunge')}</div>`;
      return `<div class="doll ${d.phase}"><div class="doll-fig" style="--s:${scale.toFixed(3)}">${pic(face, 'doll-img') || '<div class="doll-fallback">🪆</div>'}</div>
        <div class="doll-say">${say}</div>
        <div class="doll-bar"><i style="width:${d.prog}%"></i><span>Sneak to the doll: ${d.prog}%</span></div>
        ${d.log ? `<div class="doll-log">${esc(d.log.name)} ${esc(d.log.why)}!</div>` : ''}</div>`;
    },
    hide(S, d) {
      const searching = d.phase === 'search' ? new Set((d.hits || []).map((h) => h.k)) : new Set();
      const hitBy = Object.fromEntries((d.hits || []).map((h) => [h.k, h.who]));
      const cards = d.spots.map((s) => { const now = searching.has(s.k); const who = hitBy[s.k] || []; const rev = (d.reveal || []).filter((r) => r.k === s.k);
        return `<div class="spot ${now ? 'now' : ''} ${now && who.length ? 'got' : ''} ${now && !who.length ? 'empty' : ''}"><span class="em">${s.e}</span><b>${esc(s.l)}</b>${now ? `<em>${who.length ? `FOUND: ${who.map(esc).join(', ')}` : 'Empty'}</em>` : ''}${rev.length ? `<em class="rev">${rev.map((r) => `${esc(r.name)}${r.found ? ' (found)' : ''}`).join(', ')}</em>` : ''}</div>`; }).join('');
      const head = d.phase === 'hide' ? `Hide! Pick a secret spot on your phone. <small>${d.ready} of ${d.of} hidden</small>`
        : d.phase === 'plan' ? `Shh... Stay, sneak, or throw a pebble. <small>${secsLeft(d.until)}</small>`
        : d.phase === 'search' ? (d.hits.some((h) => h.who.length) ? 'FOUND YOU!' : 'The ghost searches...')
        : d.won ? 'The ghost gives up. You win this round.' : 'The ghost found too many of you.';
      const heard = (d.heard || []).map((h) => `<span>${esc(h.what)} near the ${esc((d.spots.find((s) => s.k === h.k) || {}).l || '')}</span>`).join('');
      return `<div class="hide ${d.phase}"><h2 class="hide-h">${head}</h2><div class="spots n${d.spots.length}">${cards}</div><div class="hide-foot">${heard ? `<div class="heard">${heard}</div>` : ''}<span>Search ${Math.min(d.turn + (d.phase === 'plan' ? 1 : 0), d.turns)} of ${d.turns}</span>${d.found.length ? `<span class="fnd">Found: ${d.found.map(esc).join(', ')}</span>` : ''}</div></div>`;
    },
    seance(S, d) {
      const slots = d.letters.map((c, i) => `<span class="${i < d.got ? 'got' : i === d.got ? 'next' : ''}">${i < d.got || d.word ? esc(c) : '?'}</span>`).join('');
      const pulls = (d.pulls || []).map((p) => `<span>${esc(p.name)} ${p.d.map((x) => ARROW[x]).join('')}</span>`).join('');
      return `<div class="seance"><div class="sea-top">${d.riddle ? `<p class="riddle">"${esc(d.riddle)}"</p>` : '<p class="riddle">The spirit wants to say:</p>'}<div class="slots">${slots}</div></div>
        <div class="board" id="mpBoard">${boardLetters()}<div class="planch" id="mpPlanch"><i id="mpDwell"></i></div></div>
        <div class="pulls">${pulls || '<span class="none">Nobody is pulling</span>'}</div></div>`;
    },
    fuse(S, d) {
      const mods = d.mods.map((m) => `<span class="fmod ${m.done ? 'done' : ''}">${{ wires: 'Wires', symbols: 'Symbols', lever: 'Lever' }[m.m]}${m.done ? ' ✓' : ''}</span>`).join('');
      const readers = d.readers.map((r) => `<span><b>${esc(r.name)}</b> has the ${r.ms.map((m) => ({ wires: 'Wires', symbols: 'Symbols', lever: 'Lever' }[m])).join(' and ')} page</span>`).join('');
      const bp = (d.botPages || []).map((pg) => `<div class="botpage ${pg.cols ? 'sym' : ''}"><b>${esc(pg.name)} reads out ${esc(pg.title)}:</b>${pg.cols ? `<div class="symcols">${pg.cols.map((c) => `<span>${c.join(' ')}</span>`).join('')}</div>` : ''}${pg.lines.map((l) => `<p>${esc(l)}</p>`).join('')}</div>`).join('');
      return `<div class="fuse ${d.spark ? 'spark' : ''}"><h2 class="hide-h">${esc(d.elec)} is the electrician${d.elecBot ? ' (and is working it out)' : ''}</h2><div class="fmods">${mods}</div><div class="freaders">${readers}</div>${bp ? `<div class="botpages">${bp}</div>` : ''}${d.sparks ? `<p class="fsparks">Sparks: ${d.sparks}</p>` : ''}</div>`;
    },
    kitchen(S, d) {
      const items = d.dish.items.map((it) => `<div class="ing ${it.in ? 'in' : ''}"><span>${it.e}</span><b>${esc(it.l)}</b></div>`).join('');
      return `<div class="kitchen"><h2 class="hide-h">Cook wants: <em>${esc(d.dish.name)}</em>${d.until ? ` <small>${secsLeft(d.until)}</small>` : ''}</h2><div class="ings">${items}</div><div class="pot">${d.splat ? `<div class="splat">${d.splat.e} SPLAT! ${esc(d.splat.by)} ${d.splat.k ? 'ruined it' : ''}</div>` : d.last ? `<div class="plop">${d.last.e}</div>` : ''}<span class="potemoji">🍲</span></div><p class="hide-foot">Dishes served: ${d.served} of ${d.need}</p></div>`;
    },
    mercy(S, d) { return `<div class="pc won mercy"><h2>Hold the flame together</h2>${pic('mn-candle', 'mercy-candle')}<div class="doll-bar"><i style="width:${d.fed}%"></i><span>${d.fed}%</span></div><p>${d.waiting.length ? `Waiting for: ${d.waiting.map(esc).join(', ')}` : 'Everyone is holding. Keep going!'}</p></div>`; },
  };
  // the board letters, placed like the server's BOARD (A to M on top, N to Z below, YES and NO in the corners)
  let lettersHtml = '';
  function boardLetters() {
    if (lettersHtml) return lettersHtml; const out = [];
    [...'ABCDEFGHIJKLM'].forEach((c, i) => { const t = i / 12; out.push([c, 10 + t * 80, 25 - Math.sin(t * Math.PI) * 9]); });
    [...'NOPQRSTUVWXYZ'].forEach((c, i) => { const t = i / 12; out.push([c, 12 + t * 76, 40 - Math.sin(t * Math.PI) * 8]); });
    out.push(['YES', 11, 6], ['NO', 89, 6]);
    lettersHtml = '<i class="bye">GOODBYE</i>' + out.map(([c, x, y]) => `<b class="lt ${c.length > 1 ? 'word' : ''}" data-l="${c}" style="left:${x}%;top:${(y / 60) * 100}%">${c}</b>`).join('');
    return lettersHtml;
  }
  // live bits that move between syncs
  const live = { x: 50, y: 50, tx: 50, ty: 50, raf: 0 };
  function after(S) {
    const px = S.x.px; if (!px || px.room !== 'seance' || S.step !== 'play') return;
    live.tx = px.x; live.ty = px.y; live.dwell = px.dwell; live.on = px.on; live.wrong = px.wrong;
    if (!live.raf) { const loop = () => { live.raf = requestAnimationFrame(loop); const pl = document.getElementById('mpPlanch'); if (!pl) return; live.x += (live.tx - live.x) * 0.25; live.y += (live.ty - live.y) * 0.25; pl.style.left = `${live.x}%`; pl.style.top = `${(live.y / 60) * 100}%`; const dw = document.getElementById('mpDwell'); if (dw) dw.style.setProperty('--p', live.dwell || 0); document.querySelectorAll('#mpBoard .lt').forEach((b) => { b.classList.toggle('on', b.dataset.l === live.on); b.classList.toggle('bad', b.dataset.l === live.wrong); }); }; loop(); }
  }

  // ---------------------------------------------------------------- phone
  function phone(S) {
    const ph = S.phase; const st = S.step; const m = S.me || {}; const px = m.px;
    if (ph === 'DOORS') {
      const d = S.x.doors || { opts: [] };
      if (d.choice) { const o = d.opts.find((x) => x.key === d.choice) || {}; return `<div class="mp"><div class="mp-card"><span class="pc-k">Through this door</span><h2>${esc(o.name || '')}</h2><p>${esc(o.goal || '')}</p></div></div>`; }
      return `<div class="mp"><h2 class="mp-h">Which door? <small>${secsLeft(d.until)}</small></h2>${d.opts.map((o) => `<button class="mp-door ${d.mine === o.key ? 'on' : ''} ${o.key === 'mercy' ? 'mercy' : ''}" data-x='{"type":"vote","k":"${o.key}"}'>${pic(o.art, 'mp-door-art')}<span><b>${esc(o.name)}</b><small>${esc(o.goal)}</small></span></button>`).join('')}<p class="mp-hint">The door with the most votes opens.</p></div>`;
    }
    if (ph === 'ACCUSE') {
      const a = S.x.accuse || {};
      if (a.reveal) { const it = S.players.find((p) => p.id === a.reveal.id); return `<div class="mp"><div class="mp-card ${a.reveal.caught ? 'won' : 'lost'}"><h2>${a.reveal.caught ? 'Caught!' : 'Wrong!'}</h2><p>${esc(it ? it.name : '')} was possessed.</p></div></div>`; }
      const meId = S.me?.id; return `<div class="mp"><h2 class="mp-h">Who was possessed? <small>${secsLeft(a.until)}</small></h2><div class="mp-spots">${S.players.filter((p) => p.id !== meId).map((p) => `<button class="mp-spot ${a.mine === p.id ? 'on' : ''}" data-x='{"type":"accuse","id":"${p.id}"}'>${W.bust(p, 'md')}<b>${esc(p.name)}</b></button>`).join('')}</div>${S.x.poss ? '<p class="mp-hint">It was you. Act natural.</p>' : ''}</div>`;
    }
    if (ph === 'COLLAPSE' && st !== 'play') return `<div class="mp"><div class="mp-card collapse"><h2>${st === 'intro' ? 'The house is coming down!' : st === 'quake' ? esc(S.x.room?.name || '') : 'The front door...'}</h2><p>${st === 'quake' ? esc(S.x.room?.goal || '') : 'Look at the TV.'}</p></div></div>`;
    if (st !== 'play' || !px || !px.ui) {
      const r = S.x.room || {};
      const motion = r.key === 'doll' && motionState() !== 'on' && motionState() !== 'hold' ? `<button class="mp-big" data-motion="1">Turn on the motion sensor</button><p class="mp-hint">The doll uses it to see if you move.</p>` : '';
      if (st === 'intro') return `<div class="mp"><div class="mp-card">${pic(r.art, 'mp-art')}<h2>${esc(r.name || '')}</h2><p class="goal">${esc(r.goal || '')}</p></div>${motion}</div>`;
      if (st === 'ready' && S.x.poss) return `<div class="mp"><div class="mp-card poss"><span class="pc-k">Secret. Don't show anyone.</span><h2>You are possessed</h2><p class="goal">${esc(S.x.poss.power)}</p><p>Ruin this round without getting caught. Everyone votes afterwards.</p></div>${motion}</div>`;
      if (st === 'ready') return `<div class="mp"><div class="mp-card"><h2>${S.x.kind === 'quick' ? 'Fast!' : `Round ${S.x.kind}`}</h2><p class="goal">${esc(r.goal || '')}</p></div>${motion}</div>`;
      if (st === 'won') return '<div class="mp"><div class="mp-card won"><h2>Round won!</h2></div></div>';
      if (st === 'lost') return '<div class="mp"><div class="mp-card lost"><h2>Round lost</h2><p>The candle drips.</p></div></div>';
      if (st === 'result') return `<div class="mp"><div class="mp-card ${S.x.gotKey ? 'won' : 'lost'}"><h2>${r.key === 'mercy' ? `Candle +${S.x.gained || 0}%` : S.x.gotKey ? 'A key piece!' : 'No key piece'}</h2></div></div>`;
      return '';
    }
    const possBar = S.x.poss ? `<div class="possbar"><b>You are possessed.</b> ${esc(S.x.poss.power)}${{ doll: '<button data-tap=\'{"type":"px","a":"giggle"}\'>GIGGLE</button>', seance: '<button data-tap=\'{"type":"px","a":"jolt"}\'>JOLT</button>', fuse: '<button data-tap=\'{"type":"px","a":"short"}\'>SHORT CIRCUIT</button>' }[S.x.poss.key] || ''}</div>` : '';
    return possBar + (PH[px.room] || (() => ''))(S, px);
  }
  const PH = {
    doll(S, d) {
      const mode = motionState();
      if (d.caught) return `<div class="mp doll red"><div class="mp-scream">SHE SAW YOU</div><p class="mp-hint">Wait for her to turn away again.</p></div>`;
      const pad = (t) => `<div class="mp-pad ${holding.has('freeze') ? 'down' : ''}" data-hold="freeze">${t}</div>`;
      if (d.phase === 'red') return `<div class="mp doll red"><div class="mp-freeze">FREEZE</div>${pad('Keep your thumb here. Don\'t let go!')}${mode === 'on' ? '<div class="wobble"><i id="mpWob"></i></div><p class="mp-hint">And don\'t move your phone. Not even a little.</p>' : ''}</div>`;
      if (d.phase === 'warn') return `<div class="mp doll warn"><div class="mp-freeze warn">She's turning!</div>${pad('Press and HOLD here NOW')}</div>`;
      return `<div class="mp doll"><div class="doll-bar mp-bar"><i style="width:${d.prog}%"></i><span>${d.prog}%</span></div><button class="mp-sneak" data-tap='{"type":"px","a":"sneak"}'>SNEAK</button><p class="mp-hint">Tap fast while her back is turned. When she starts turning, press and hold the pad that appears.</p>${mode !== 'on' && mode !== 'hold' ? '<button class="mp-small" data-motion="1">Turn on the motion sensor</button>' : ''}</div>`;
    },
    hide(S, d) {
      const where = d.spots.find((s) => s.k === d.mine);
      const grid = (act, label) => `<div class="mp-spots">${d.spots.map((s) => `<button class="mp-spot ${(act === 'hide' && d.mine === s.k) || (d.choice && d.choice.at === s.k) ? 'on' : ''} ${act !== 'hide' && s.k === d.mine && !d.found ? 'mine' : ''}" data-x='${JSON.stringify(act === 'hide' ? { type: 'px', a: 'hide', k: s.k } : { type: 'px', a: 'plan', do: act, at: s.k })}'><span>${s.e}</span><b>${esc(s.l)}</b>${s.k === d.mine && act !== 'hide' && !d.found ? '<small>you</small>' : ''}</button>`).join('')}</div>${label ? `<p class="mp-hint">${label}</p>` : ''}`;
      if (d.phase === 'hide') return `<div class="mp"><h2 class="mp-h">Hide! <small>${secsLeft(d.until)}</small></h2>${grid('hide', 'Keep it secret. Or don\'t.')}</div>`;
      const seen = d.everyone ? `<p class="mp-hint poss-see">You can see: ${d.everyone.map((e) => `${esc(e.name)} in the ${esc((d.spots.find((s) => s.k === e.k) || {}).l || '?')}${e.found ? ' (found)' : ''}`).join(', ')}</p>` : '';
      if (d.phase === 'plan') {
        if (hideTurn !== d.turn) { hideTurn = d.turn; phoneHideMode = null; }
        const c = d.choice || { do: 'stay' }; const mode = d.found ? 'pebble' : phoneHideMode || 'stay';
        const tabs = d.found ? '' : `<div class="mp-tabs">${[['stay', 'Stay quiet'], ['sneak', 'Sneak'], ['pebble', 'Throw pebble']].map(([k, l]) => `<button class="${mode === k ? 'on' : ''}" data-hidemode="${k}">${l}</button>`).join('')}</div>`;
        const body = mode === 'stay' ? `<button class="mp-big ${c.do === 'stay' && d.choice ? 'on' : ''}" data-x='{"type":"px","a":"plan","do":"stay"}'>Stay quiet${c.do === 'stay' && d.choice ? ' ✓' : ''}</button>` : grid(mode, mode === 'sneak' ? 'Move to a new spot. You might creak.' : 'The ghost will check where the pebble lands. Don\'t hit a friend!');
        return `${seen}<div class="mp"><h2 class="mp-h">${d.found ? 'You were found. Throw pebbles to help!' : `You're in: ${esc(where ? where.l : '?')}`} <small>${secsLeft(d.until)}</small></h2>${tabs}${body}</div>`;
      }
      if (d.phase === 'search') { const me = (d.hits || []).some((h) => h.k === d.mine); return `<div class="mp"><div class="mp-card ${d.found ? 'lost' : ''}"><h2>${d.found ? (me ? 'FOUND YOU' : 'You were found') : 'Shh...'}</h2><p>${esc(where ? `You're in: ${where.l}` : '')}</p></div></div>`; }
      return '<div class="mp"><div class="mp-card"><h2>Look at the TV</h2></div></div>';
    },
    seance(S, d) {
      const slots = d.letters.map((c, i) => `<span class="${i < d.got ? 'got' : ''}">${i < d.got || d.word ? esc(c) : '?'}</span>`).join('');
      const btns = d.dirs.map((x) => `<button class="mp-pull" data-hold="pull:${x}"><span>${ARROW[x]}</span>PULL ${DNAME[x]}</button>`).join('');
      return `<div class="mp sea">${d.riddle ? `<p class="mp-riddle">"${esc(d.riddle)}"</p>` : ''}<div class="slots mp-slots">${slots}</div><div class="mp-pulls n${d.dirs.length}">${btns}</div><p class="mp-hint">Hold to pull. Only you can pull this way. Shout to the others!</p></div>`;
    },
    fuse(S, d) {
      const mods = `<div class="fmods">${d.mods.map((m) => `<span class="fmod ${m.done ? 'done' : ''}">${{ wires: 'Wires', symbols: 'Symbols', lever: 'Lever' }[m.m]}${m.done ? ' ✓' : ''}</span>`).join('')}</div>`;
      if (d.box) {
        if (d.dark) return `<div class="mp"><div class="mp-card lost"><h2>The power cut out!</h2><p>Wait a moment...</p></div></div>`;
        const b = d.box; const done = (m) => d.mods.find((x) => x.m === m)?.done;
        const wires = `<div class="fbox"><h3>Wires ${done('wires') ? '✓' : ''}</h3>${b.wires.map((c, i) => `<button class="wire w-${c} ${b.cut.includes(i) ? 'cut' : ''}" data-x='{"type":"px","a":"cut","i":${i}}' ${done('wires') ? 'disabled' : ''}><span>${i + 1}</span><i></i><small>${c}</small></button>`).join('')}</div>`;
        const syms = d.mods.some((x) => x.m === 'symbols') ? `<div class="fbox"><h3>Symbols ${done('symbols') ? '✓' : ''}</h3><div class="syms">${b.four.map((s) => `<button class="${b.pressed.includes(s) ? 'on' : ''}" data-x='{"type":"px","a":"sym","s":"${s}"}' ${done('symbols') ? 'disabled' : ''}>${s}</button>`).join('')}</div></div>` : '';
        const lever = b.lever ? `<div class="fbox"><h3>Lever ${done('lever') ? '✓' : ''}</h3><div class="lever"><span class="light l-${b.lever.c}"></span><b>${b.lever.n}</b><button data-x='{"type":"px","a":"lever","d":"up"}' ${done('lever') ? 'disabled' : ''}>UP</button><button data-x='{"type":"px","a":"lever","d":"down"}' ${done('lever') ? 'disabled' : ''}>DOWN</button></div><small class="mp-hint">The light is ${b.lever.c}.</small></div>` : '';
        const own = (d.pages || []).map((pg) => `<div class="fpage"><h3>${esc(pg.title)}</h3>${pg.cols ? `<div class="symcols">${pg.cols.map((c, i) => `<span><b>${i + 1}</b>${c.join(' ')}</span>`).join('')}</div>` : ''}${pg.lines.map((l) => `<p>${esc(l)}</p>`).join('')}</div>`).join('');
        return `<div class="mp mpfuse ${d.spark ? 'spark' : ''}"><h2 class="mp-h">You're the electrician</h2><p class="mp-hint">${own ? 'Nobody else can help this time. Use the manual below.' : 'Describe what you see. Don\'t touch anything until the others tell you.'}</p>${wires}${syms}${lever}${own}</div>`;
      }
      const pages = (d.pages || []).map((pg) => `<div class="fpage"><h3>${esc(pg.title)}</h3>${pg.cols ? `<div class="symcols">${pg.cols.map((c, i) => `<span><b>${i + 1}</b>${c.join(' ')}</span>`).join('')}</div>` : ''}${pg.lines.map((l) => `<p>${esc(l)}</p>`).join('')}</div>`).join('');
      return `<div class="mp"><h2 class="mp-h">${esc(d.elec)} sees the fuse box</h2>${mods}${pages || '<div class="mp-card"><p>No page for you this time. Help the others!</p></div>'}</div>`;
    },
    kitchen(S, d) {
      return `<div class="mp"><div class="mp-dish"><span>Cook wants: <b>${esc(d.dish)}</b></span><div>${d.items.map((it) => `<i class="${it.in ? 'in' : ''}">${it.e}</i>`).join('')}</div></div><div class="mp-pantry">${d.mine.map((f) => `<button class="food ${f.k === 'poison' ? 'poison' : ''}" data-tap='{"type":"px","a":"throw","k":"${f.k}"}'><span>${f.e}</span><b>${esc(f.l)}</b></button>`).join('')}</div><p class="mp-hint">Tap to throw it in the pot. Shout for what you don't have! Served ${d.served} of ${d.need}.</p></div>`;
    },
    mercy(S, d) { return `<div class="mp"><button class="mp-flame ${d.on ? 'on' : ''}" data-hold="flame">${pic('mn-candle', 'mp-flame-img')}<span>${d.on ? 'Holding...' : 'Press and hold'}</span></button><div class="doll-bar mp-bar"><i style="width:${d.fed}%"></i><span>${d.fed}%</span></div></div>`; },
  };
  let phoneHideMode = null; let hideTurn = -1;

  // ---------------------------------------------------------------- phone input: taps, holds, the motion sensor
  let send = null; let S0 = null; const holding = new Set();
  function setHold(key, on) {
    if (on) holding.add(key); else holding.delete(key);
    if (key.startsWith('pull:')) send('px', { a: 'pull', d: [...holding].filter((k) => k.startsWith('pull:')).map((k) => k.slice(5)) });
    if (key === 'flame') send('px', { a: 'hold', on });
    document.querySelectorAll(`[data-hold="${key}"]`).forEach((b) => b.classList.toggle('down', on));
  }
  function bind(sendFn) {
    send = sendFn;
    document.addEventListener('click', (e) => {
      const x = e.target.closest('[data-x]'); if (x) { try { const o = JSON.parse(x.dataset.x); const { type, ...rest } = o; send(type, rest); navigator.vibrate?.(10); } catch (er) { /* ignore */ } return; }
      const hm = e.target.closest('[data-hidemode]'); if (hm) { phoneHideMode = hm.dataset.hidemode; if (phoneHideMode === 'stay') send('px', { a: 'plan', do: 'stay' }); window.__mnRender?.(); return; }
      const mo = e.target.closest('[data-motion]'); if (mo) { askMotion(); }
    });
    document.addEventListener('pointerdown', (e) => {
      const t = e.target.closest('[data-tap]'); if (t) { e.preventDefault(); try { const o = JSON.parse(t.dataset.tap); const { type, ...rest } = o; send(type, rest); } catch (er) { /* ignore */ } t.classList.add('down'); setTimeout(() => t.classList.remove('down'), 90); navigator.vibrate?.(6); return; }
      const h = e.target.closest('[data-hold]'); if (h) { e.preventDefault(); setHold(h.dataset.hold, true); holdStart = { x: e.clientX, y: e.clientY }; navigator.vibrate?.(8); }
    });
    const up = () => { [...holding].forEach((k) => setHold(k, false)); };
    document.addEventListener('pointerup', up); document.addEventListener('pointercancel', up);
    document.addEventListener('pointermove', (e) => { if (holding.has('freeze') && holdStart && Math.hypot(e.clientX - holdStart.x, e.clientY - holdStart.y) > 24) setHold('freeze', false); });
    setInterval(watchDoll, 60);
  }
  let holdStart = null;
  // the motion sensor: on, refused (we use press-and-hold instead), or not asked yet
  let motion = localStorage.getItem('mnMotion') || null; let lastAcc = null; let jerk = 0; let gotEvent = false;
  function motionState() { return motion; }
  let baseG = null; let tilt = 0;
  function onMotion(e) { const a = e.accelerationIncludingGravity; if (!a || a.x == null) return; gotEvent = true; if (lastAcc) { const d = Math.hypot(a.x - lastAcc.x, a.y - lastAcc.y, a.z - lastAcc.z); jerk = jerk * 0.6 + d * 0.4; } lastAcc = { x: a.x, y: a.y, z: a.z }; if (baseG) { const m1 = Math.hypot(a.x, a.y, a.z), m2 = Math.hypot(baseG.x, baseG.y, baseG.z); if (m1 && m2) tilt = (Math.acos(Math.max(-1, Math.min(1, (a.x * baseG.x + a.y * baseG.y + a.z * baseG.z) / (m1 * m2)))) * 180) / Math.PI; } }
  function startListening() { window.addEventListener('devicemotion', onMotion); setTimeout(() => { if (!gotEvent) { motion = 'hold'; tellMode(); } }, 1800); }
  function tellMode() { try { localStorage.setItem('mnMotion', motion); } catch (e) { /* fine */ } send?.('px', { a: 'mode', motion: motion === 'on' }); window.__mnRender?.(); }
  async function askMotion() {
    try {
      if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') { const r = await DeviceMotionEvent.requestPermission(); motion = r === 'granted' ? 'on' : 'hold'; }
      else motion = typeof DeviceMotionEvent !== 'undefined' ? 'on' : 'hold';
    } catch (e) { motion = 'hold'; }
    if (motion === 'on') startListening(); tellMode();
  }
  if (motion === 'on') setTimeout(() => { if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission !== 'function') startListening(); else motion = null; }, 0);
  // during FREEZE: report a wobble (or letting go of the pad), once, after a short grace
  let reportedRed = null; let modeSentFor = null;
  function watchDoll() {
    const d = S0?.me?.px; if (!d || d.room !== 'doll' || S0.step !== 'play') return;
    if (motion && modeSentFor !== S0.x.kind) { modeSentFor = S0.x.kind; send('px', { a: 'mode', motion: motion === 'on' }); }
    const wob = document.getElementById('mpWob'); if (wob) wob.style.width = `${Math.min(100, Math.max(jerk / 0.7, tilt / 5) * 100)}%`;
    if (d.phase !== 'red') { baseG = null; tilt = 0; }
    if (d.phase !== 'red' || !d.redAt || d.caught) return;
    if (reportedRed === d.redAt) return; if (W.now() - d.redAt < 400) return;
    if (!baseG && lastAcc) { baseG = { ...lastAcc }; tilt = 0; }
    // thumb off the pad, or (with the sensor on) a wobble or a tilt of more than 5 degrees
    const bad = !holding.has('freeze') || (motion === 'on' && (jerk > 0.7 || tilt > 5));
    if (bad) { reportedRed = d.redAt; send('px', { a: 'moved' }); navigator.vibrate?.([200, 60, 300]); }
  }
  function setState(S) { S0 = S; }

  // ---------------------------------------------------------------- scares on the phone
  let lastScare = 0;
  function scarePhone(S) {
    const s = S.scare; if (!s || s.id === lastScare) return; const first = lastScare === 0 && s.until && false; lastScare = s.id; if (first) return;
    const el = document.getElementById('mpScare') || (() => { const d = document.createElement('div'); d.id = 'mpScare'; document.body.appendChild(d); return d; })();
    const delay = s.kind === 'lights' ? 2500 : s.kind === 'fake' ? 2700 : 0;
    const face = s.face && img(s.img) ? `<img src="${img(s.img)}" alt="">` : '';
    if (s.kind === 'lights' || s.kind === 'fake') { el.className = 'black'; el.innerHTML = s.kind === 'fake' ? '<p class="fake">Connection lost. Reconnecting...</p>' : ''; }
    setTimeout(() => { el.className = 'face'; el.innerHTML = face || '<p class="boo">!</p>'; navigator.vibrate?.([300, 80, 500]); setTimeout(() => { el.className = ''; el.innerHTML = ''; }, 800); }, delay);
  }

  return { tv, after, phone, bind, setState, scarePhone, motionState };
})();
