/* Last Night in the Mansion, 8-bit: draws the hallway, the puzzle rooms and the ghost battles on the TV,
   and runs the D-pad and the heart on the phones. Art: Ninja Adventure pack by Pixel-boy (CC0). */
window.PX = (() => {
  const TILES = ['floor', 'floor2', 'tan', 'carpet', 'carpet2', 'ice', 'ice2', 'snow', 'wTL', 'wT', 'wTR', 'wL', 'wR', 'wBL', 'wB', 'wBR', 'plate', 'plateOn', 'crate', 'heavy', 'gate', 'gateOpen', 'rock', 'iceblock', 'hole', 'spikes', 'orb', 'orbBlue', 'orbRed', 'orbGold', 'stairs', 'stairsUp', 'door', 'doorW', 'doorG', 'doorT', 'shelfA', 'shelfB', 'dresser', 'pot', 'pot2', 'plant', 'chair', 'chest', 'barrel', 'clock', 'stool', 'jar', 'tableL', 'tableM', 'tableR', 'grave', 'cross', 'statue', 'statueG'];
  const MONS = ['Flam2', 'SkullBlue', 'LanternRed', 'LanternGreen', 'BlueBat', 'Flam', 'Skull'];
  const ITEMS = ['GoldKey', 'Book', 'Scroll', 'feather', 'Hourglass', 'LittleTreasureChest', 'GemPurple'];
  const IMG = {}; let loaded = 0;
  ['tiles', 'chars', 'mons', 'boss', 'faces', 'items'].forEach((k) => { const im = new Image(); im.onload = () => { loaded++; }; im.src = `/assets/px/${k}.png`; IMG[k] = im; });
  const esc = W.esc;
  const T = 16;
  const ti = (n) => TILES.indexOf(n);
  function tile(ctx, name, x, y) { const i = ti(name); if (i < 0 || !IMG.tiles.complete) return; ctx.drawImage(IMG.tiles, i * 16, 0, 16, 32, x, y - 16, 16, 32); }
  const DIRCOL = { d: 0, u: 1, l: 2, r: 3 };
  const FLOOR = { hub: ['floor', 'floor2'], ice: ['tan', 'tan'], cellar: ['floor', 'floor2'], mercy: ['carpet2', 'carpet2'] };
  const DECO = { b: 'shelfA', k: 'statue', p: 'pot', l: 'plant', t: 'tableM', C: 'clock', D: 'dresser', c: 'chest', r: 'barrel', x: 'hole' };
  const hash = (x, y) => ((x * 73856093) ^ (y * 19349663)) >>> 0;

  // ---------------------------------------------------------------- the map (shared by the hallway and the walking rooms)
  const view = { sprites: {}, last: 0 };
  const Z = 2; const LS = { w: 320, h: 200 };
  function prep(c, w, h) { if (c.width !== w * Z || c.height !== h * Z) { c.width = w * Z; c.height = h * Z; } LS.w = w; LS.h = h; const ctx = c.getContext('2d'); ctx.setTransform(Z, 0, 0, Z, 0, 0); ctx.imageSmoothingEnabled = false; return ctx; }
  function drawMap(ctx, d, now, candle) {
    const rows = d.map; const h = rows.length; const w = rows[0].length; const ox = T, oy = T * 2; // one tile of wall all round, a row on top for door signs
    ctx.fillStyle = '#120c18'; ctx.fillRect(0, 0, LS.w, LS.h);
    const fl = FLOOR[d.theme] || FLOOR.hub;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const c = rows[y][x]; const px = ox + x * T, py = oy + y * T;
      tile(ctx, c === ':' ? 'carpet' : fl[hash(x, y) % 7 === 0 ? 1 : 0], px, py + T);
      if (c === '~') tile(ctx, hash(x, y) % 5 === 0 ? 'ice2' : 'ice', px, py + T);
    }
    // walls
    for (let x = -1; x <= w; x++) { tile(ctx, x === -1 ? 'wTL' : x === w ? 'wTR' : 'wT', ox + x * T, oy); tile(ctx, x === -1 ? 'wBL' : x === w ? 'wBR' : 'wB', ox + x * T, oy + (h + 1) * T); }
    for (let y = 0; y < h; y++) { tile(ctx, 'wL', ox - T, oy + (y + 1) * T); tile(ctx, 'wR', ox + w * T, oy + (y + 1) * T); }
    // things on the floor, back to front so tall things overlap properly
    const things = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const c = rows[y][x]; const px = ox + x * T, py = oy + (y + 1) * T;
      if (c === 'o') tile(ctx, (d.plates || []).some(([a, b]) => a === x && b === y) && isHeld(d, x, y) ? 'plateOn' : 'plate', px, py);
      else if (c === 'E') tile(ctx, 'stairs', px, py);
      else if (c === 'g') tile(ctx, d.open ? 'gateOpen' : 'gate', px, py);
      else if (c === '#') things.push([y, () => tile(ctx, d.theme === 'cellar' ? (hash(x, y) % 3 ? 'barrel' : 'jar') : 'rock', px, py)]);
      else if (c === 'O') { const s = (d.stands || []).find((o) => o.x === x && o.y === y); things.push([y, () => tile(ctx, s && s.lit ? 'orbGold' : 'orb', px, py)]); }
      else if (DECO[c]) things.push([y, () => tile(ctx, DECO[c], px, py)]);
    }
    if (d.theme === 'cellar' && d.gate) { const [gx, gy] = d.gate; if (gx + 1 >= w) tile(ctx, 'stairs', ox + (gx + 1) * T, oy + (gy + 1) * T); }
    // hallway doors in the top wall, with their signs
    if (d.doors) for (const dr of d.doors) {
      if (dr.hide) continue; const px = ox + dr.x * T, py = oy;
      tile(ctx, dr.key === 'front' ? 'doorT' : dr.key === 'mercy' ? 'doorW' : 'door', px, py);
      if (!dr.open) { ctx.fillStyle = 'rgba(10,6,20,.55)'; ctx.fillRect(px, py - T + 2, T, T * 2 - 2); }
      const zone = d.zone === dr.key;
      if (dr.open) { ctx.fillStyle = zone ? `rgba(255,214,90,${0.35 + 0.25 * Math.sin(now / 120)})` : 'rgba(255,214,90,.12)'; ctx.fillRect(px - T, oy + T, T * 3, T * 2); }
      sign(ctx, dr.label, px + T / 2, T - 3, dr.done ? '#6f6' : dr.open ? '#ffe08a' : '#8a7f99', dr.done ? '✓ ' : !dr.open && dr.key === 'front' ? '🔒 ' : '');
      if (zone && d.countFrom) { const left = Math.max(0, 2.5 - (W.now() - d.countFrom) / 1000); text(ctx, left > 0 ? `${Math.ceil(left)}` : 'GO', px + T / 2, oy + T * 3 + 10, '#fff', 'center'); }
    }
    if (d.secrets) for (const [x, y] of d.secrets) { const ph = (now / 600 + hash(x, y) % 10) % 6; if (ph < 0.6) { ctx.fillStyle = `rgba(255,255,220,${0.9 - ph})`; const px = ox + x * T + 8, py = oy + (y + 1) * T + 8; ctx.fillRect(px - 1, py - 3, 2, 6); ctx.fillRect(px - 3, py - 1, 6, 2); } }
    things.sort((a, b) => a[0] - b[0]).forEach(([, f]) => f());
    if (d.crates) for (const c of d.crates) tile(ctx, c.h ? 'heavy' : 'crate', ox + c.x * T, oy + (c.y + 1) * T);
    // ghosts drifting about
    (d.ghosts || []).forEach((gh, i) => { const fr = Math.floor(now / 200 + i) % 4; ctx.globalAlpha = 0.75; ctx.drawImage(IMG.mons, fr * 16, 0, 16, 16, ox + gh.x * T, oy + (gh.y + 1) * T + Math.sin(now / 400 + i) * 2, 16, 16); ctx.globalAlpha = 1; });
    // people
    const acts = (d.actors || []).filter((a) => !a.out);
    const dt = Math.min(0.1, (now - (view.last || now)) / 1000); view.last = now;
    const seen = new Set();
    for (const a of acts) {
      seen.add(a.id); let s = view.sprites[a.id]; if (!s || Math.hypot(s.x - a.x, s.y - a.y) > 12) s = view.sprites[a.id] = { x: a.x, y: a.y, walk: 0 };
      const dist = Math.hypot(a.x - s.x, a.y - s.y); const sp = Math.max(7, dist * 9) * dt;
      if (dist > 0.001) { const k = Math.min(1, sp / dist); s.x += (a.x - s.x) * k; s.y += (a.y - s.y) * k; s.walk += dt * 8; s.moving = true; } else s.moving = false;
    }
    Object.keys(view.sprites).forEach((id) => { if (!seen.has(id)) delete view.sprites[id]; });
    acts.sort((a, b) => view.sprites[a.id].y - view.sprites[b.id].y).forEach((a) => {
      const s = view.sprites[a.id]; const px = Math.round(ox + s.x * T), py = Math.round(oy + (s.y + 1) * T);
      const fr = s.moving && a.slide <= 1 ? Math.floor(s.walk) % 4 : 0;
      if (a.look === 8) ctx.globalAlpha = 0.6 + 0.15 * Math.sin(now / 300);
      ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(px + 3, py + 13, 10, 3);
      ctx.drawImage(IMG.chars, a.look * 64 + DIRCOL[a.dir || 'd'] * 16, fr * 16, 16, 16, px, py, 16, 16);
      ctx.globalAlpha = 1;
    });
    // candle light: the dark closes in as the candle burns down
    if (!view.dark) view.dark = document.createElement('canvas');
    const dk = view.dark; dk.width = LS.w * Z; dk.height = LS.h * Z; const dc = dk.getContext('2d'); dc.setTransform(Z, 0, 0, Z, 0, 0);
    const base = d.nodark ? 0 : d.dark ? 0.97 : d.theme === 'mercy' ? 0.35 : 0.3 + (1 - Math.max(0, Math.min(100, candle)) / 100) * 0.4;
    dc.fillStyle = `rgba(8,4,18,${base})`; dc.fillRect(0, 0, LS.w, LS.h); dc.globalCompositeOperation = 'destination-out';
    const glow = (x, y, r, a) => { const g = dc.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, `rgba(0,0,0,${a})`); g.addColorStop(1, 'rgba(0,0,0,0)'); dc.fillStyle = g; dc.fillRect(x - r, y - r, r * 2, r * 2); };
    acts.forEach((a) => { const s = view.sprites[a.id]; glow(ox + s.x * T + 8, oy + (s.y + 1) * T + 8, d.dark ? T * 1.7 : T * 3.2, d.dark ? 0.95 : 0.9); });
    (d.stands || []).filter((s) => s.lit).forEach((s) => glow(ox + s.x * T + 8, oy + (s.y + 1) * T + 8, T * 2.5, 0.9));
    if (d.doors) d.doors.filter((x) => x.open && !x.hide).forEach((x) => glow(ox + x.x * T + 8, oy, T * 1.6, 0.6));
    dc.globalCompositeOperation = 'source-over'; ctx.drawImage(dk, 0, 0, LS.w, LS.h);
    if (d.cracks) d.cracks.forEach(([x, y]) => { const px = ox + x * T, py = oy + (y + 1) * T; ctx.strokeStyle = '#ff3b3b'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(px + 3, py + 3); ctx.lineTo(px + 13, py + 13); ctx.moveTo(px + 13, py + 3); ctx.lineTo(px + 3, py + 13); ctx.stroke(); });
    // names on top of everything
    acts.forEach((a) => { const s = view.sprites[a.id]; nameTag(ctx, a.name, Math.round(ox + s.x * T + 8), Math.round(oy + (s.y + 1) * T - 1), a.c); });
    if (d.msg) { const m = `${d.msg.by} ${d.msg.text}`; banner(ctx, m, LS.w / 2, LS.h - 10); }
  }
  function isHeld(d, x, y) { if (d.crates) return d.crates.some((c) => c.x === x && c.y === y); return (d.actors || []).some((a) => !a.out && a.x === x && a.y === y); }
  const sp = (s) => String(s);
  function text(ctx, s, x, y, col, align = 'left', size = 8) { s = sp(s); ctx.font = `${size}px PX`; ctx.textAlign = align; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = '#000'; ctx.fillText(s, x + 1, y + 1); ctx.fillStyle = col; ctx.fillText(s, x, y); }
  function sign(ctx, s, x, y, col, pre) { ctx.font = '8px PX'; const t = pre + s; const w = ctx.measureText(t).width + 6; ctx.fillStyle = 'rgba(18,10,24,.85)'; ctx.fillRect(Math.round(x - w / 2), y - 8, Math.round(w), 11); text(ctx, t, x, y, col, 'center'); }
  function nameTag(ctx, s, x, y, col) { ctx.font = '8px PX'; const w = ctx.measureText(s).width + 4; ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(Math.round(x - w / 2), y - 9, Math.round(w), 9); ctx.fillStyle = col; ctx.textAlign = 'center'; ctx.fillText(s, x, y - 2); }
  function banner(ctx, s, x, y) { ctx.font = '8px PX'; const w = Math.min(LS.w - 8, ctx.measureText(sp(s)).width + 12); ctx.fillStyle = '#000'; ctx.fillRect(x - w / 2, y - 10, w, 14); ctx.strokeStyle = '#fff'; ctx.strokeRect(x - w / 2 + 0.5, y - 9.5, w - 1, 13); text(ctx, s, x, y, '#fff', 'center'); }

  // ---------------------------------------------------------------- the battle box (TV and phone draw it the same way)
  const waves = {};
  function bulletsFor(wv) { if (!wv) return null; const k = `${wv.seed}|${wv.L}|${wv.secs}`; if (!waves[k]) { waves[k] = MNB.wave(wv.seed, wv.set, wv.L, wv.secs); const ks = Object.keys(waves); if (ks.length > 6) delete waves[ks[0]]; } return waves[k]; }
  function drawFoe(ctx, foe, cx, cy, s, now, yellow) {
    if (foe === 'boss') { const fr = Math.floor(now / 160) % 5; ctx.save(); ctx.filter = 'hue-rotate(160deg) saturate(2.6) brightness(0.95)'; ctx.drawImage(IMG.boss, fr * 50, 0, 50, 50, Math.round(cx - 25 * s), Math.round(cy - 25 * s + Math.sin(now / 500) * 3 * s), 50 * s, 50 * s); ctx.restore(); return; }
    const i = Math.max(0, MONS.indexOf(foe)); const fr = Math.floor(now / 220) % 4;
    ctx.drawImage(IMG.mons, i * 64 + fr * 16, 0, 16, 16, Math.round(cx - 8 * s), Math.round(cy - 8 * s + Math.sin(now / 400) * 2 * s), 16 * s, 16 * s);
  }
  function drawBox(ctx, bx, by, bw, bh, wv, hearts, meId, local, now) {
    const s = bw / MNB.BW; ctx.fillStyle = '#000'; ctx.fillRect(bx, by, bw, bh); ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(2, s * 1.2); ctx.strokeRect(bx, by, bw, bh);
    ctx.save(); ctx.beginPath(); ctx.rect(bx, by, bw, bh); ctx.clip();
    const list = bulletsFor(wv); const t = wv ? (W.now() - wv.t0) / 1000 : -1;
    if (list && t >= 0) MNB.drawBullets(ctx, list, t, s, bx, by);
    for (const h of hearts || []) { if (h.id === meId && local) continue; const blink = h.inv && Math.floor(now / 90) % 2; MNB.drawHeart(ctx, bx + h.x * s, by + h.y * s, s, h.c, meId ? (blink ? 0.15 : 0.35) : blink ? 0.3 : 1); }
    if (local) { const blink = local.inv > performance.now() && Math.floor(now / 90) % 2; MNB.drawHeart(ctx, bx + local.x * s, by + local.y * s, s * 1.15, local.c, blink ? 0.3 : 1); }
    if (wv && t < 0) { ctx.fillStyle = '#fff'; ctx.font = `${Math.round(8 * s)}px PX`; ctx.textAlign = 'center'; ctx.fillText('GET READY', bx + bw / 2, by + bh / 2); }
    ctx.restore();
    return t;
  }

  // ---------------------------------------------------------------- TV
  let tvEl = null; let tvCanvas = null; let tvHud = null; let tvS = null; let raf = 0; let lastTvKey = '';
  const STAGES = [[1, 'Round 1'], [2, 'Round 2']];
  function tvSetup(root) {
    tvEl = root; root.innerHTML = '<canvas id="pxc"></canvas><div id="pxhud"></div>'; tvCanvas = root.querySelector('#pxc'); tvHud = root.querySelector('#pxhud');
    const loop = () => { raf = requestAnimationFrame(loop); try { tvFrame(); } catch (e) { console.error(e); } }; loop();
  }
  function stagePips(S) { if (!S.x.room || ['hub', 'mercy', 'boss'].includes(S.x.room.key)) return ''; if (S.x.kind === 'quick') return '<div class="pips"><span class="on">The Collapse: fast!</span></div>'; return `<div class="pips">${STAGES.map(([k, l]) => `<span class="${S.x.kind === k ? 'on' : ''}">${l}</span>`).join('')}</div>`; }
  function candleBar(S) { const c = Math.max(0, Math.min(100, S.candle)); return `<div class="pxcandle ${c < 20 ? 'low' : ''}"><b>Candle</b><i><u style="width:${c}%"></u></i><span>${Math.round(c)}%</span></div>`; }
  function keysRow(S) { const n = S.x.ctx ? S.x.ctx.keys : S.keys; return `<div class="pxkeys">${[0, 1, 2, 3].map((i) => `<span class="${i < n ? 'on' : ''}"></span>`).join('')}<b>Key pieces</b></div>`; }
  function timerBar(S) { if (!S.x.ends || !S.x.start) return ''; return `<div class="pxtimer"><i data-pxends="${S.x.ends}" data-start="${S.x.start}"></i></div>`; }
  function tvHudHtml(S) {
    const r = S.x.room; const ph = S.phase; const st = S.step; const px = S.x.px;
    const head = `<div class="pxtop"><div class="pxtitle">${r ? esc(r.name) : ''}${stagePips(S)}</div><div class="pxright">${keysRow(S)}${candleBar(S)}</div></div>`;
    let mid = '';
    if (ph === 'STORY') { const s = S.x.story || {}; return `${head}<div class="pxcard story"><div class="face f0"></div><div><h2>A memory: ${esc(s.mem)}</h2><p>${esc(s.text || '')}</p></div></div>`; }
    if (ph === 'BOSS' && st === 'intro') mid = `<div class="pxcard"><h2>The House</h2><p>${esc(r?.how || '')}</p></div>`;
    else if (st === 'intro') mid = `<div class="pxcard"><h2>${esc(r?.name || '')}</h2><p>${esc(r?.how || '')}</p></div>`;
    else if (st === 'ready') mid = `<div class="pxcard small"><h2>${S.x.kind === 'practice' ? 'Practice' : `Stage ${S.x.kind}`}</h2><p>${S.x.kind === 'practice' ? 'Nothing counts. Get the hang of it.' : 'The candle is burning.'}</p></div>`;
    else if (st === 'won') mid = '<div class="pxcard small win"><h2>Stage cleared!</h2></div>';
    else if (st === 'lost') mid = '<div class="pxcard small lose"><h2>Stage failed</h2><p>The candle drips.</p></div>';
    else if (st === 'result') mid = r?.key === 'mercy' ? `<div class="pxcard small win"><h2>Candle +${S.x.gained || 0}%</h2></div>` : `<div class="pxcard ${S.x.gotKey ? 'win' : 'lose'}"><h2>${S.x.gotKey ? 'Key piece found!' : 'No key piece'}</h2><p>${S.x.wins} of 3 stages cleared.${S.x.gotKey ? '' : ' You needed 2.'}</p></div>`;
    if (px && px.said && px.said.length && px.phase === 'menu') return `${head}<div class="pxsaid">${px.said.map((c) => `<p><b>${esc(c.name)} says:</b> ${esc(c.text)}</p>`).join('')}</div>${timerBar(S)}`;
    const info = px && px.info ? `<div class="pxinfo">${esc(px.info)}${st === 'demo' ? ' <em>Mortimer is showing you how.</em>' : st === 'practice' ? ' <em>Practice.</em>' : ''}</div>` : '';
    const tag = st === 'demo' ? '<div class="pxtag">Watch Mortimer\'s ghost</div>' : st === 'practice' ? '<div class="pxtag">Practice: the candle won\'t burn</div>' : '';
    return `${head}${tag}${mid}${['play', 'practice', 'demo'].includes(st) ? timerBar(S) : ''}${info}`;
  }
  function tvFrame() {
    if (!tvS || !tvCanvas) return; const S = tvS; const px = S.x.px; const now = performance.now();
    if (S.ctl && S.ctl.paused) return; // freeze the picture while the game is paused
    let ctx;
    document.querySelectorAll('#pxhud [data-pxends]').forEach((el) => { const e = Number(el.dataset.pxends), s = Number(el.dataset.start); el.style.width = `${Math.max(0, Math.min(100, ((e - W.now()) / Math.max(1, e - s)) * 100))}%`; });
    if (px && px.battle) { ctx = prep(tvCanvas, 320, 200); fitCanvas(tvCanvas, 320, 200, 0.88); return tvBattle(ctx, S, px, now); }
    if (px && px.map) {
      const w = (px.map[0].length + 2) * T, h = (px.map.length + 3) * T;
      ctx = prep(tvCanvas, w, h); fitCanvas(tvCanvas, w, h, 0.84);
      drawMap(ctx, px, now, S.candle); return;
    }
    // between screens: a dim hallway backdrop
    ctx = prep(tvCanvas, 320, 180); fitCanvas(tvCanvas, 320, 180, 1, true);
    ctx.fillStyle = '#0d0912'; ctx.fillRect(0, 0, 320, 180);
    for (let y = 0; y < 12; y++) for (let x = 0; x < 20; x++) tile(ctx, hash(x, y) % 7 ? 'floor' : 'floor2', x * 16, y * 16 + 16);
    ctx.fillStyle = 'rgba(8,4,18,.72)'; ctx.fillRect(0, 0, 320, 180);
    if (S.phase === 'BOSS') drawFoe(ctx, 'boss', 160, 70, 1.6, now);
    else if (S.phase === 'STORY') { ctx.globalAlpha = 0.85; ctx.drawImage(IMG.chars, 8 * 64, 0, 16, 16, 136, 36 + Math.sin(now / 500) * 3, 48, 48); ctx.globalAlpha = 1; }
  }
  function fitCanvas(c, w, h, maxH, cover) {
    const vw = innerWidth, vh = innerHeight; const top = vh * 0.12; const avail = vh * maxH - (cover ? 0 : top * 0.4);
    let s = cover ? Math.max(vw / w, vh / h) : Math.min((vw * 0.96) / w, avail / h);
    if (!cover && s >= 2) s = Math.floor(s * 2) / 2;
    c.style.width = `${Math.round(w * s)}px`; c.style.height = `${Math.round(h * s)}px`;
    c.style.left = `${Math.round((vw - w * s) / 2)}px`; c.style.top = cover ? `${Math.round((vh - h * s) / 2)}px` : `${Math.round(top + (vh - top - h * s) / 2.2)}px`;
  }
  // Undertale-style screen: the foe on top, the box in the middle, the text and the party underneath
  const BTN = ['FIGHT', 'ACT', 'ITEM', 'MERCY'];
  function tvBattle(ctx, S, b, now) {
    const w = 320, h = 200;
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
    const menu = b.phase === 'menu' || b.phase === 'spared';
    drawFoe(ctx, b.foe, w / 2, b.wave ? 28 : 48, b.wave ? (b.foe === 'boss' ? 0.9 : 2) : b.foe === 'boss' ? 1.6 : 3, now);
    ctx.font = '8px PX'; ctx.textAlign = 'center'; ctx.fillStyle = b.yellow ? '#FFE14D' : '#fff'; ctx.fillText(b.foeName || '', w / 2, b.wave ? 56 : 86);
    if (b.boss && b.grip != null) { const gw = 80; ctx.fillStyle = '#400'; ctx.fillRect(w / 2 - gw / 2, b.wave ? 59 : 90, gw, 4); ctx.fillStyle = '#e33'; ctx.fillRect(w / 2 - gw / 2, b.wave ? 59 : 90, gw * Math.max(0, b.grip) / 100, 4); }
    if (b.wave) {
      const bw = 200, bh = 120, bx = (w - bw) / 2, by = 64; drawBox(ctx, bx, by, bw, bh * 0.98, b.wave, b.hearts, null, null, now);
    } else {
      // the text box
      const bx = 20, by = 100, bw = w - 40, bh = 52; ctx.fillStyle = '#000'; ctx.fillRect(bx, by, bw, bh); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(bx, by, bw, bh);
      typewriter(ctx, b.text || '', bx + 8, by + 14, bw - 16, now);
      // the four buttons, lit for the chosen one after the vote
      BTN.forEach((k, i) => { const x = 22 + i * 72, y = 166; const chosen = b.chosen && (b.chosen === k || (k === 'ACT' && !['FIGHT', 'ITEM', 'MERCY'].includes(b.chosen))) && !menu; const col = k === 'MERCY' && b.yellow ? '#FFE14D' : chosen ? '#FFE14D' : '#FF8A1F'; ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, 62, 15); ctx.fillStyle = col; ctx.font = '8px PX'; ctx.textAlign = 'center'; ctx.fillText(`${k === 'MERCY' && b.yellow ? '♥ ' : ''}${k}`, x + 31, y + 11); });
    }
    // party: a heart and a name for everyone, filled in once they have chosen
    const hs = b.hearts || []; const per = Math.min(70, (w - 20) / Math.max(1, hs.length)); const y = h - 8;
    hs.forEach((hh, i) => { const x = 10 + per * i + per / 2; const voted = (b.voted || []).includes(hh.id); MNB.drawHeart(ctx, x - per / 2 + 6, y - 3, 1.6, hh.c, menu && !voted ? 0.3 : 1); ctx.font = '8px PX'; ctx.textAlign = 'left'; ctx.fillStyle = '#fff'; ctx.fillText(hh.name.slice(0, 8), x - per / 2 + 12, y); });
  }
  const tw = { text: '', at: 0 };
  function typewriter(ctx, s, x, y, maxW, now) {
    if (s !== tw.text) { tw.text = s; tw.at = now; }
    const n = Math.floor((now - tw.at) / 28); const shown = s.slice(0, n);
    ctx.font = '8px PX'; ctx.textAlign = 'left'; ctx.fillStyle = '#fff';
    const words = shown.split(' '); let line = ''; let yy = y;
    for (const wd of words) { const t = line ? `${line} ${wd}` : wd; if (ctx.measureText(t).width > maxW) { ctx.fillText(line, x, yy); line = wd; yy += 11; } else line = t; }
    ctx.fillText(line, x, yy);
  }
  function tv(S, root) {
    const on = ['HUB', 'PX', 'BOSS', 'COLLAPSE'].includes(S.phase) && !!S.x.px && !S.x.px.ui && ['walk', 'play', 'won', 'lost', 'practice', 'demo'].includes(S.step);
    document.body.classList.toggle('pxmode', on);
    if (!on) { tvS = null; return; }
    if (!tvEl) tvSetup(root);
    tvS = S; const html = tvHudHtml(S); if (tvHud.__h !== html) { tvHud.__h = html; tvHud.innerHTML = html; }
  }

  // ---------------------------------------------------------------- phone
  let phEl = null; let phS = null; let send = null; let phKey = ''; let hold = null;
  const me = () => phS?.me;
  // the heart I steer with my finger (or the arrow keys on a computer)
  const heart = { x: 50, y: 46, inv: 0, c: '#f33', moving: false, lastMove: 0, sentAt: 0, wave: null, hitAt: 0 };
  let drag = null; let boxCanvas = null; let phRaf = 0;
  function phone(S, root, sendFn) {
    send = sendFn; phS = S; const m = S.me || {}; const px = m.px; const st = S.step;
    const active = !!(['HUB', 'PX', 'BOSS', 'COLLAPSE'].includes(S.phase) && px && !px.ui && ['walk', 'play', 'practice'].includes(st));
    root.hidden = !active; document.body.classList.toggle('pxphone', active);
    if (!active) { phKey = ''; stopHold(); return false; }
    phEl = root; heart.c = m.color || '#f33';
    const mode = px.battle ? (px.menu ? 'menu' : 'box') : px.lanternMap ? 'map' : 'pad';
    const key = `${mode}|${S.phase}|${S.x.room?.key}|${S.x.kind}`;
    if (key !== phKey) { phKey = key; stopHold(); root.innerHTML = mode === 'pad' ? padHtml() : mode === 'box' ? boxHtml() : mode === 'map' ? '<div class="pxph"><div id="pxinfo"></div><canvas id="pxmap"></canvas></div>' : '<div id="pxmenu"></div>'; bindPhone(root, mode); }
    if (mode === 'pad') { mount(root.querySelector('#pxinfo'), padInfo(S, px)); drawMini(root, px.mini); }
    if (mode === 'map') { mount(root.querySelector('#pxinfo'), padInfo(S, px)); drawMini(root, { ...px.lanternMap, nodark: true }, '#pxmap'); }
    if (mode === 'menu') mount(root.querySelector('#pxmenu'), menuHtml(S, px));
    if (mode === 'box') { mount(root.querySelector('#pxinfo'), `<p>${esc(px.text || '')}</p>`); if (px.wave && (!heart.wave || heart.wave.seed !== px.wave.seed)) { heart.wave = px.wave; const mine = (px.hearts || []).find((h) => h.id === px.me); if (mine) { heart.x = mine.x; heart.y = mine.y; } heart.inv = 0; } }
    return true;
  }
  // a small copy of the map on a phone (lantern holder, thin-ice spotters); redrawn every frame while it shows
  let miniData = null; let miniSel = null; let miniRaf = 0;
  function drawMini(root, data, sel = '#pxmini') {
    miniData = data ? { ...data, nodark: true } : null; miniSel = sel; const c = root.querySelector(sel); if (c) c.hidden = !data; if (!data) return;
    if (!miniRaf) { const loop = () => { miniRaf = requestAnimationFrame(loop); const cv = document.querySelector(miniSel); if (!cv || !miniData) return; const w = (miniData.map[0].length + 2) * T, h = (miniData.map.length + 3) * T; const ctx = prep(cv, w, h); cv.style.width = '100%'; cv.style.height = 'auto'; drawMap(ctx, miniData, performance.now(), 100); }; loop(); }
  }
  const padHtml = () => `<div class="pxph"><div id="pxinfo"></div><canvas id="pxmini" hidden></canvas><div class="dpad"><button data-d="u" aria-label="Up">▲</button><button data-d="l" aria-label="Left">◀</button><span class="mid"></span><button data-d="r" aria-label="Right">▶</button><button data-d="d" aria-label="Down">▼</button></div></div>`;
  function padInfo(S, px) {
    const btns = (px.btns || []).map(([a, l]) => `<button class="pxbtn" data-pa="${a}">${esc(l)}</button>`).join('');
    const skip = S.step === 'practice' && me()?.vip ? '<button class="pxbtn ghost" data-pa="skip">Skip practice</button>' : '';
    const rooms = px.rooms ? `<div class="pxrooms">${px.rooms.map((r) => `<span class="${r.done ? 'done' : ''}">${r.done ? '✓ ' : ''}${esc(r.label)}</span>`).join('')}</div>` : '';
    const tag = S.step === 'practice' ? '<div class="pxtagp">Practice</div>' : '';
    return `${tag}${px.big ? `<h2>${esc(px.big)}</h2>` : ''}<p>${esc(px.text || '')}</p>${rooms}<div class="pxbtns">${btns}${skip}</div>`;
  }
  const boxHtml = () => '<div class="pxph battle"><canvas id="pxbox"></canvas><div id="pxinfo"></div><div id="pxdrag"><span>Drag here to move your heart</span></div></div>';
  function menuHtml(S, px) {
    const mine = px.mine; const left = px.until ? Math.max(0, Math.ceil((px.until - W.now()) / 1000)) : '';
    const clues = (px.clues || []).map((c) => `<div class="clue"><b>Your clue (step ${c.n})</b>${esc(c.text)}</div>`).join('');
    const hint = px.boss ? `<div class="clue boss"><b>The House remembers</b>${esc(px.hint || '')}</div>` : '';
    const acts = (px.opts || []).map((o) => `<button class="act ${mine === o ? 'on' : ''}" data-k="${esc(o)}">* ${esc(o)}</button>`).join('');
    const top = ['FIGHT', ...(px.boss ? ['ITEM'] : []), 'MERCY'].map((k) => `<button class="tbtn ${k === 'MERCY' && px.yellow ? 'yellow' : ''} ${mine === k ? 'on' : ''}" data-k="${k}">${k === 'MERCY' && px.yellow ? '♥ ' : ''}${k}${k === 'ITEM' ? ` (${px.stubs || 0})` : ''}</button>`).join('');
    return `<div class="pxph menu">${hint}${clues}<h3>ACT <small>${left ? `${left}s` : ''}</small></h3><div class="acts">${acts}</div><div class="tops">${top}</div><p class="hint">${mine ? `You chose ${esc(mine)}. The most popular choice happens.` : 'Agree out loud, then all pick the same thing.'}</p></div>`;
  }
  function stopHold() { if (hold) { clearInterval(hold.t); hold = null; } }
  function bindPhone(root, mode) {
    if (mode === 'pad') {
      root.querySelectorAll('[data-d]').forEach((b) => {
        const go = () => { send('px', { a: 'mv', d: b.dataset.d }); navigator.vibrate?.(8); };
        b.addEventListener('pointerdown', (e) => { e.preventDefault(); stopHold(); go(); hold = { t: setInterval(go, 170) }; b.classList.add('down'); try { b.setPointerCapture(e.pointerId); } catch (er) { /* fine */ } });
        ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((ev) => b.addEventListener(ev, () => { stopHold(); b.classList.remove('down'); }));
        b.addEventListener('click', (e) => { if (e.detail === 0) go(); }); // keyboard or a script pressing it
      });
      root.addEventListener('click', (e) => { const b = e.target.closest('[data-pa]'); if (b) send('px', { a: b.dataset.pa }); });
    }
    if (mode === 'menu') root.addEventListener('click', (e) => { const b = e.target.closest('[data-k]'); if (!b) return; send('px', { a: 'pick', k: b.dataset.k }); navigator.vibrate?.(10); });
    if (mode === 'box') {
      boxCanvas = root.querySelector('#pxbox'); const pad = root.querySelector('#pxdrag');
      const start = (e) => { e.preventDefault(); drag = { x: e.clientX, y: e.clientY, hx: heart.x, hy: heart.y }; try { pad.setPointerCapture(e.pointerId); } catch (er) { /* fine */ } };
      const moveTo = (e) => { if (!drag) return; const k = 0.28; heart.x = MNB.clampX(drag.hx + (e.clientX - drag.x) * k); heart.y = MNB.clampY(drag.hy + (e.clientY - drag.y) * k); heart.lastMove = performance.now(); };
      pad.addEventListener('pointerdown', start); pad.addEventListener('pointermove', moveTo); ['pointerup', 'pointercancel'].forEach((ev) => pad.addEventListener(ev, () => { drag = null; }));
      cancelAnimationFrame(phRaf); const loop = () => { phRaf = requestAnimationFrame(loop); if (!document.body.contains(boxCanvas)) { cancelAnimationFrame(phRaf); return; } phoneFrame(); }; loop();
    }
  }
  const keys = {};
  addEventListener('keydown', (e) => { keys[e.key] = true; if (phKey.startsWith('pad') && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) { e.preventDefault(); send('px', { a: 'mv', d: { ArrowUp: 'u', ArrowDown: 'd', ArrowLeft: 'l', ArrowRight: 'r' }[e.key] }); } });
  addEventListener('keyup', (e) => { keys[e.key] = false; });
  let lastF = 0;
  function phoneFrame() {
    const S = phS; const px = S?.me?.px; if (!px || !boxCanvas) return; const now = performance.now();
    if (S.ctl && S.ctl.paused) { lastF = now; return; } const dt = Math.min(0.05, (now - (lastF || now)) / 1000); lastF = now;
    const kx = (keys.ArrowRight ? 1 : 0) - (keys.ArrowLeft ? 1 : 0), ky = (keys.ArrowDown ? 1 : 0) - (keys.ArrowUp ? 1 : 0);
    if (kx || ky) { heart.x = MNB.clampX(heart.x + kx * MNB.SPEED * dt); heart.y = MNB.clampY(heart.y + ky * MNB.SPEED * dt); heart.lastMove = now; }
    heart.moving = now - heart.lastMove < 120;
    const cw = Math.min(boxCanvas.parentElement.clientWidth, 600); const ch = Math.round(cw * 0.6);
    if (boxCanvas.width !== cw * 2) { boxCanvas.width = cw * 2; boxCanvas.height = ch * 2; boxCanvas.style.width = `${cw}px`; boxCanvas.style.height = `${ch}px`; }
    const ctx = boxCanvas.getContext('2d'); ctx.imageSmoothingEnabled = false;
    const t = drawBox(ctx, 2, 2, boxCanvas.width - 4, boxCanvas.height - 4, px.wave, px.hearts, px.me, px.me ? heart : null, now);
    if (!px.me || !px.wave) return;
    const list = bulletsFor(px.wave);
    if (t > 0 && t < px.wave.secs && now > heart.inv && MNB.hit(list, t, heart.x, heart.y, heart.moving)) { heart.inv = now + 1100; send('px', { a: 'hit' }); navigator.vibrate?.(60); }
    if (now - heart.sentAt > 90) { heart.sentAt = now; send('px', { a: 'pos', x: Math.round(heart.x * 10) / 10, y: Math.round(heart.y * 10) / 10, m: heart.moving ? 1 : 0 }); }
  }
  return { tv, phone, drawMap, MONS, ITEMS };
})();
