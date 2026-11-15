/* The ghost battles (Undertale style): every bullet is worked out from a seed, so the TV, every phone
   and the server all see exactly the same attack without sending it over the network.
   The box is 100 wide and 60 tall. A bullet is a pellet (k:'p') or a bar (k:'bar').
   Colours: 'w' white always hurts, 'b' blue only hurts if you are moving, 'o' orange only hurts if you stand still. */
(function (root) {
  const BW = 100, BH = 60, HR = 1.7, SPEED = 40;
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const PAT = {
    // pellets falling from the top
    rain(r, t0, d, L, out) { const gap = Math.max(0.16, 0.42 - L * 0.06); for (let t = t0; t < t0 + d; t += gap) out.push({ k: 'p', t0: t, t1: t + 5, x0: 3 + r() * 94, y0: -3, vx: (r() - 0.5) * 6, vy: 20 + L * 5 + r() * 6, r: 1.6 }); },
    // pellets from both sides, in rows
    sides(r, t0, d, L, out) { const gap = Math.max(0.22, 0.55 - L * 0.07); let s = 1; for (let t = t0; t < t0 + d; t += gap) { s = -s; out.push({ k: 'p', t0: t, t1: t + 6, x0: s > 0 ? -3 : BW + 3, y0: 4 + r() * 52, vx: s * (24 + L * 5), vy: 0, r: 1.7 }); } },
    // walls sliding across with a gap to slip through
    walls(r, t0, d, L, out) { const every = Math.max(1.05, 1.7 - L * 0.15); const gapH = Math.max(11, 18 - L * 1.6); let dir = r() < 0.5 ? 1 : -1; for (let t = t0; t < t0 + d - 0.5; t += every) { const gy = 4 + r() * (BH - 8 - gapH); const v = dir * (30 + L * 5); const x0 = dir > 0 ? -4 : BW + 4; out.push({ k: 'bar', t0: t, t1: t + 5, x0, y0: 0, w: 3, h: gy, vx: v, vy: 0, c: 'w' }); out.push({ k: 'bar', t0: t, t1: t + 5, x0, y0: gy + gapH, w: 3, h: BH - gy - gapH, vx: v, vy: 0, c: 'w' }); if (L >= 3 && r() < 0.4) dir = -dir; } },
    // a ring bursting out of the middle, with one gap
    ring(r, t0, d, L, out) { const every = Math.max(1.1, 1.9 - L * 0.18); const n = 16 + L * 3; for (let t = t0; t < t0 + d - 0.6; t += every) { const cx = 25 + r() * 50, cy = 15 + r() * 30; const hole = Math.floor(r() * n); for (let i = 0; i < n; i++) { if (i === hole || i === (hole + 1) % n || (L < 2 && i === (hole + 2) % n)) continue; const a = (i / n) * Math.PI * 2; const v = 17 + L * 3; out.push({ k: 'p', t0: t, t1: t + 5, x0: cx, y0: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: 1.5 }); } } },
    // blue bars (stand still) and orange bars (keep moving) sweeping the whole box
    bones(r, t0, d, L, out) { const every = Math.max(0.9, 1.5 - L * 0.12); let side = r() < 0.5 ? 1 : -1; for (let t = t0; t < t0 + d - 0.5; t += every) { const c = r() < 0.5 ? 'b' : 'o'; out.push({ k: 'bar', t0: t, t1: t + 5, x0: side > 0 ? -4 : BW + 4, y0: 0, w: 4, h: BH, vx: side * (26 + L * 4), vy: 0, c }); if (r() < 0.5) side = -side; } },
    // pellets wiggling across
    zig(r, t0, d, L, out) { const gap = Math.max(0.2, 0.5 - L * 0.06); for (let t = t0; t < t0 + d; t += gap) { const s = r() < 0.5 ? 1 : -1; out.push({ k: 'p', t0: t, t1: t + 7, x0: s > 0 ? -3 : BW + 3, y0: 8 + r() * 44, vx: s * (18 + L * 4), vy: 0, ay: 6 + r() * 6, af: 3 + r() * 2, ph: r() * 6, r: 1.6 }); } },
    // a spinning sprinkler in the middle
    spiral(r, t0, d, L, out) { const cx = 50, cy = 30; const gap = Math.max(0.07, 0.16 - L * 0.02); let a = r() * 6; const spin = (r() < 0.5 ? 1 : -1) * (2.2 + L * 0.3); for (let t = t0; t < t0 + d; t += gap) { a += spin * gap; for (const off of L >= 2 ? [0, Math.PI] : [0]) { const v = 20 + L * 2; out.push({ k: 'p', t0: t, t1: t + 4, x0: cx, y0: cy, vx: Math.cos(a + off) * v, vy: Math.sin(a + off) * v, r: 1.4 }); } } },
  };
  // a whole attack: patterns one after another, a short breather between them
  function wave(seed, set, L, dur) {
    const r = rng(seed); const out = []; let t = 0.9; const list = set && set.length ? set : Object.keys(PAT); let i = Math.floor(r() * list.length);
    while (t < dur - 1.2) { const d = Math.min(dur - 0.8 - t, 4.2 + r() * 1.6); PAT[list[i % list.length]](r, t, d, L, out); t += d + 0.7; i += 1 + Math.floor(r() * 2); }
    return out;
  }
  function pos(b, t) {
    if (t < b.t0 || t > b.t1) return null; const dt = t - b.t0;
    let x = b.x0 + b.vx * dt, y = b.y0 + b.vy * dt;
    if (b.ay) { const s = Math.sin(dt * b.af + (b.ph || 0)) * b.ay; if (Math.abs(b.vx) > Math.abs(b.vy)) y += s; else x += s; }
    return { x, y };
  }
  function hit(list, t, hx, hy, moving) {
    for (const b of list) {
      if (t < b.t0 || t > b.t1) continue; const p = pos(b, t);
      if (b.k === 'p') { const dx = p.x - hx, dy = p.y - hy; const rr = b.r + HR - 0.4; if (dx * dx + dy * dy < rr * rr) return true; }
      else {
        if (b.c === 'b' && !moving) continue; if (b.c === 'o' && moving) continue;
        const cx = Math.max(p.x, Math.min(hx, p.x + b.w)), cy = Math.max(p.y, Math.min(hy, p.y + b.h)); const dx = hx - cx, dy = hy - cy;
        if (dx * dx + dy * dy < (HR - 0.3) * (HR - 0.3)) return true;
      }
    }
    return false;
  }
  // how a bot (or the demo ghost) dodges: steps away from whatever is closest, with a little slack
  function botMove(list, t, me, dt, skill) {
    let fx = (50 - me.x) * 0.004, fy = (30 - me.y) * 0.006; let near = 0; let blue = false, orange = false;
    for (const b of list) {
      if (t < b.t0 - 0.2 || t > b.t1) continue;
      for (const la of [0.08, 0.3]) {
        const p = pos(b, t + la); if (!p) continue;
        let dx, dy;
        if (b.k === 'p') { dx = me.x - p.x; dy = me.y - p.y; }
        else {
          const ddx = me.x - (p.x + b.w / 2);
          if (b.c === 'b') { if (Math.abs(ddx) < 9) blue = true; continue; }
          if (b.c === 'o') { if (Math.abs(ddx) < 9) orange = true; continue; }
          dx = ddx * 0.15; const gapMid = b.y0 === 0 ? b.h + 6 : b.y0 - 6; dy = (gapMid - me.y) * 0.8; if (Math.abs(ddx) > 22) continue;
        }
        const d2 = dx * dx + dy * dy; if (d2 > 160) continue; near++; const f = 18 / (d2 + 4); fx += dx * f; fy += dy * f;
      }
    }
    if (blue && Math.random() < skill) return { x: me.x, y: me.y, moving: false };
    if (orange && Math.random() < skill) { const dir = Math.floor(t * 2) % 2 ? 1 : -1; return { x: me.x, y: clampY(me.y + dir * SPEED * dt * 0.6), moving: true }; }
    const m = Math.hypot(fx, fy); if (m < 0.05 || Math.random() > skill) return { x: me.x, y: me.y, moving: false };
    const s = SPEED * dt * Math.min(1, m); return { x: clampX(me.x + (fx / m) * s), y: clampY(me.y + (fy / m) * s), moving: near > 0 };
  }
  const clampX = (x) => Math.max(HR, Math.min(BW - HR, x)), clampY = (y) => Math.max(HR, Math.min(BH - HR, y));
  // drawing (TV and phones)
  const HEART = ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...'];
  function drawHeart(ctx, x, y, s, color, alpha) { ctx.globalAlpha = alpha == null ? 1 : alpha; ctx.fillStyle = color; const px = Math.max(1, s * 0.55); const ox = x - 3.5 * px, oy = y - 3 * px; HEART.forEach((row, j) => { for (let i = 0; i < row.length; i++) if (row[i] === '#') ctx.fillRect(Math.round(ox + i * px), Math.round(oy + j * px), Math.ceil(px), Math.ceil(px)); }); ctx.globalAlpha = 1; }
  function drawBullets(ctx, list, t, s, ox, oy) {
    for (const b of list) {
      const p = pos(b, t); if (!p) continue;
      if (b.k === 'p') { ctx.fillStyle = '#fff'; const r = b.r * s; ctx.fillRect(Math.round(ox + p.x * s - r), Math.round(oy + p.y * s - r), Math.round(r * 2), Math.round(r * 2)); }
      else { ctx.fillStyle = b.c === 'b' ? '#14A9FF' : b.c === 'o' ? '#FCA600' : '#fff'; ctx.fillRect(Math.round(ox + p.x * s), Math.round(oy + p.y * s), Math.max(2, Math.round(b.w * s)), Math.round(b.h * s)); }
    }
  }
  const API = { BW, BH, HR, SPEED, rng, wave, pos, hit, botMove, clampX, clampY, drawHeart, drawBullets, PATTERNS: Object.keys(PAT) };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.MNB = API;
})(typeof window !== 'undefined' ? window : globalThis);
