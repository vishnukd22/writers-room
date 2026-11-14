/* Last Night in the Mansion: draws the little building blocks every room is made of.
   The server describes each screen as a list of widgets; the TV draws them to watch, the phone draws them to touch. */
window.MNW = (() => {
  const esc = (s) => W.esc(s);
  let S = null; let live = false;
  const P = (id) => S?.players.find((p) => p.id === id);
  const totals = {};
  const bar = (ends, start, cls = '') => { if (!ends) return ''; const total = start ? Math.max(1, ends - start) : (totals[ends] = totals[ends] || Math.max(1, ends - W.now())); return `<div class="wbar ${cls}"><i data-ends="${ends}" data-total="${total}" data-kind="bar"></i></div>`; };
  const dot = (id) => { const p = P(id); return p ? `<b class="dot" style="--c:${p.color}" title="${esc(p.name)}">${esc(W.initials(p.name))}</b>` : ''; };
  const face = (id, size = 'xs') => { const p = P(id); return p ? W.bust(p, size) : ''; };
  const act = (a, id) => (live && a ? ` data-act="${esc(a)}"${id != null ? ` data-id="${esc(id)}"` : ''}` : '');
  // straight and corner stairs, drawn from which sides they open to
  const STAIR = { '┃': 5, '━': 10, '┗': 3, '┏': 6, '┓': 12, '┛': 9 };
  const stairSvg = (g) => {
    const m = STAIR[g] || 0; const arm = { 1: 'M50 50V0', 2: 'M50 50H100', 4: 'M50 50V100', 8: 'M50 50H0' };
    return `<svg viewBox="0 0 100 100" aria-hidden="true"><rect x="4" y="4" width="92" height="92" rx="10" class="sbg"/>${[1, 2, 4, 8].filter((b) => m & b).map((b) => `<path d="${arm[b]}" class="sp"/>`).join('')}<circle cx="50" cy="50" r="9" class="sj"/></svg>`;
  };

  const R = {
    head: (w) => `<h3 class="w-head">${esc(w.text)}</h3>`,
    note: (w) => `<p class="w-note">${esc(w.text)}</p>`,
    big: (w) => `<p class="w-big">${esc(w.text)}</p>`,
    card: (w) => `<div class="w-card s-${w.style || 'plain'}"${w.blur != null ? ` style="--blur:${w.blur}px"` : ''}><div class="t">${esc(w.text)}</div>${w.sub ? `<div class="s">${esc(w.sub)}</div>` : ''}${bar(w.ends, w.start)}</div>`,
    list: (w) => `<ul class="w-list ${w.big ? 'big' : ''}">${(w.items || []).map((t, i) => `<li class="${w.at === i ? 'at' : w.at > i ? 'past' : ''}">${esc(t)}</li>`).join('')}</ul>`,
    seq: (w) => `<div class="w-seq">${(w.items || []).map((t) => `<span class="${t === '???' || t === '🔔' ? 'empty' : ''}">${esc(t)}</span>`).join('')}</div>`,
    tiles: (w) => `<div class="w-tiles" style="--cols:${w.cols || 4}">${(w.items || []).map((it) => `<div class="tile st-${it.state || 'none'}" style="${it.color ? `--c:${it.color}` : ''}">${it.who ? face(it.who, 'sm') : ''}${it.emoji ? `<span class="e">${esc(it.emoji)}</span>` : ''}${it.label ? `<b>${esc(it.label)}</b>` : ''}${it.sub ? `<small>${esc(it.sub)}</small>` : ''}${bar(it.ends, it.start)}</div>`).join('')}</div>`,
    btns: (w) => `<div class="w-btns ${w.small ? 'small' : ''}" style="--cols:${w.cols || 2}">${(w.items || []).map((it) => { const off = ['off', 'done', 'bad'].includes(it.state); return `<button class="b st-${it.state || 'none'}"${act(w.act, it.id)} ${off || !live ? 'disabled' : ''} style="${it.color ? `--c:${it.color}` : ''}">${it.emoji ? `<span class="e">${esc(it.emoji)}</span>` : ''}<span class="l">${esc(it.label)}</span></button>`; }).join('')}</div>`,
    pad: (w) => `<button class="w-pad ${w.big ? 'big' : ''} ${w.hot ? 'hot' : ''}"${live ? ` data-pad="${esc(w.act)}"${w.id ? ` data-id="${esc(w.id)}"` : ''}${w.hold ? ' data-hold="1"' : ''}` : ' disabled'}>${esc(w.label)}</button>`,
    dpad: (w) => (live ? `<div class="w-dpad">${['up', 'left', 'right', 'down'].map((d) => `<button class="d ${d}"${act(w.act, d)} aria-label="${d}">${{ up: '▲', left: '◀', right: '▶', down: '▼' }[d]}</button>`).join('')}</div>` : ''),
    meter: (w) => { const pct = Math.max(0, Math.min(100, (100 * w.v) / Math.max(1, w.max))); return `<div class="w-meter ${w.vertical ? 'vert' : ''}" style="--c:${w.color || '#FFB443'};--p:${pct}%"><span class="lab">${esc(w.label)}</span><div class="track"><i></i>${w.vertical ? '<span class="bucket">🪣</span>' : ''}</div></div>`; },
    grid: (w) => {
      const cells = (w.cells || []).map((c) => {
        if (c.k === 'stair') return `<i class="c k-stair">${stairSvg(c.e)}<em>${esc(c.label || '')}</em></i>`;
        return `<i class="c k-${c.k}">${c.e ? `<span>${esc(c.e)}</span>` : ''}${(c.who || []).map(dot).join('')}</i>`;
      }).join('');
      const rows = Math.ceil((w.cells || []).length / (w.cols || 1));
      const arrows = w.stairs ? `<span class="arrow in" style="--r:${w.start};--rows:${rows}">▶</span><span class="arrow out" style="--r:${w.end};--rows:${rows}">🚪</span>` : '';
      return `<div class="w-grid ${w.stairs ? 'stairs' : ''} ${w.cols > 9 ? 'fine' : ''}" style="--cols:${w.cols};--rows:${rows}">${arrows}${cells}</div>`;
    },
    clock: (w) => `<div class="w-clock"><svg viewBox="0 0 200 200" aria-label="Clock at ${w.h || 12}:${String((w.m || 0) * 5).padStart(2, '0')}"><circle cx="100" cy="100" r="92" class="face"/>${[...Array(12).keys()].map((i) => { const a = (i * Math.PI) / 6; return `<text x="${100 + 74 * Math.sin(a)}" y="${106 - 74 * Math.cos(a)}" class="num">${i || 12}</text>`; }).join('')}<line x1="100" y1="100" x2="100" y2="52" class="hour" transform="rotate(${(w.h || 0) * 30} 100 100)"/><line x1="100" y1="100" x2="100" y2="30" class="min" transform="rotate(${(w.m || 0) * 30} 100 100)"/><circle cx="100" cy="100" r="6" class="pin"/></svg><p>Set both hands to 12</p></div>`,
    beat: (w) => `<div class="w-beat" data-t0="${w.t0}" data-period="${w.period}" data-steps="${w.steps}"><div class="ring"><i></i></div><span class="cnt"></span></div>`,
    doll: (w) => `<div class="w-doll st-${w.state}">${W.img('mn-doll') ? `<img src="${W.img('mn-doll')}" alt="">` : '<span class="e">🪆</span>'}<b>${{ away: 'She is looking away. MOVE.', turn: 'She is turning...', look: 'FREEZE. She is watching.' }[w.state] || ''}</b></div>`,
    candle: (w) => `<div class="w-flame ${w.flicker ? 'flick' : ''}"><div class="fl"></div><div class="wick"></div><div class="stick"></div></div>`,
    dials: (w) => `<div class="w-dials">${(w.vals || []).map((v, i) => `<div class="dial">${live ? `<button${act(w.act, i)} data-dir="up">▲</button>` : ''}<b>${v}</b>${live ? `<button${act(w.act, i)} data-dir="down">▼</button>` : ''}</div>`).join('')}</div>`,
    input: (w) => (live ? `<form class="w-input" data-form="${esc(w.act)}"><input maxlength="14" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="${esc(w.placeholder || '')}"><button type="submit">Cast</button></form>` : ''),
    trace: (w) => {
      const pts = (w.pts || []).map(([x, y]) => `${(x * 300).toFixed(1)},${(y * 200).toFixed(1)}`).join(' ');
      const pos = w.pos ? `<circle cx="${w.pos[0] * 300}" cy="${w.pos[1] * 200}" r="9" class="pos"/>` : '';
      return `<div class="w-trace"${live ? ` data-trace="${esc(w.act)}" data-pts='${JSON.stringify(w.pts)}' data-width="${w.width}"` : ''}><svg viewBox="0 0 300 200" preserveAspectRatio="none"><polyline points="${pts}" class="road" style="stroke-width:${w.width * 200 * 2}"/><polyline points="${pts}" class="line"/><polyline points="${pts}" class="done" pathLength="1" style="stroke-dasharray:${w.prog || 0} 1"/>${w.pts?.length ? `<circle cx="${w.pts[0][0] * 300}" cy="${w.pts[0][1] * 200}" r="12" class="start"/><text x="${w.pts.at(-1)[0] * 300}" y="${w.pts.at(-1)[1] * 200 + 7}" class="end">🚪</text>` : ''}${pos}</svg></div>`;
    },
    dust: (w) => {
      const clean = new Set(w.clean || []); const n = w.cols * w.rows;
      return `<div class="w-dust" style="--cols:${w.cols}"${live ? ` data-dust="${esc(w.act)}"` : ''}>${[...Array(n).keys()].map((i) => `<i data-i="${i}" class="${clean.has(i) ? 'clean' : ''}">${w.key === i ? '<span class="key">🗝️</span>' : ''}</i>`).join('')}</div>`;
    },
    faces: (w) => {
      const p = P(w.who); if (!p) return '';
      return `<div class="w-faces">${[0, 1].map((i) => `<button class="fc ${i === w.fake ? `fake ${w.how}` : ''}"${act(w.act, i)} ${live ? '' : 'disabled'}>${W.bust(p, 'xl')}${i === w.fake && w.how === 'eyes' ? '<span class="eyes"><i></i><i></i></span>' : ''}<b>${esc(p.name)}?</b></button>`).join('')}</div>`;
    },
    door: (w) => `<div class="w-door ${w.open ? 'open' : ''} ${w.freeze ? 'frz' : ''}">
      <div class="dpan ghosts st-${w.ghost}"><span class="e">👻👻👻</span><b>${{ creep: 'The ghosts are creeping closer', warn: 'They are about to turn...', look: 'THEY ARE LOOKING. Nobody move.' }[w.ghost]}</b></div>
      <div class="dpan key ${w.missing ? '' : 'done'}"><span class="e">${w.missing ? esc(w.shape) : '🗝️'}</span><b>${w.missing ? `Key: ${w.missing} piece${w.missing > 1 ? 's' : ''} missing. This shape next.` : 'The key is whole'}</b></div>
      <div class="dpan lock ${w.open ? 'done' : ''}"><span class="e dl">${(w.dial || []).map((d) => `<i>${d}</i>`).join('')}</span><b>${w.open ? 'The lock is open' : 'The lock: three numbers'}</b></div>
      <div class="dpan flame st-${w.gust}"><span class="e">🕯️</span><b>${{ calm: 'Still air', warn: 'A draught is coming...', gust: 'DRAUGHT! Shield the flame!' }[w.gust]}</b></div>
      ${w.freeze ? '<div class="freeze">FREEZE!</div>' : ''}</div>`,
  };
  function render(list, opts = {}) { S = opts.S || S; live = !!opts.live; return (list || []).map((w) => { try { return (R[w.t] || (() => ''))(w); } catch (e) { console.error('widget', w.t, e); return ''; } }).join(''); }

  // the dance beat: a ring that closes in and glows exactly on each step
  (function loop() {
    document.querySelectorAll('.w-beat').forEach((el) => {
      const t0 = Number(el.dataset.t0); const per = Number(el.dataset.period); const steps = Number(el.dataset.steps);
      const now = W.now(); const ph = (now - t0) / per; const k = Math.round(ph); const off = Math.abs(now - (t0 + k * per));
      const frac = ((ph % 1) + 1) % 1; const ring = el.querySelector('.ring');
      ring.style.setProperty('--s', (1.9 - 0.9 * frac).toFixed(3));
      ring.classList.toggle('on', ph > -0.3 && k < steps && off < 170);
      const c = el.querySelector('.cnt'); const txt = ph < -0.2 ? `Get ready... ${Math.ceil(-ph)}` : k >= steps ? 'Done!' : `Step ${Math.max(1, Math.min(steps, k + 1))} of ${steps}`; if (c.textContent !== txt) c.textContent = txt;
    });
    requestAnimationFrame(loop);
  })();
  return { render };
})();
