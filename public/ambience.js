/* WRITERS' ROOM: living backgrounds.
   A slow camera drift on every picture, plus light and weather drawn on top:
   lamp glow, dust in the spotlights, and an effect per genre (snow, petals, neon...). */
(() => {
  const cv = document.getElementById('amb');
  if (!cv) { window.AMB = { set() {}, react() {} }; return; }
  const cx = cv.getContext('2d');
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const IMG_AR = 1672 / 941; // the art is 16:9-ish and drawn with background-size: cover
  let W = 0; let H = 0; let box = { x: 0, y: 0, w: 1, h: 1 };
  const rnd = (a, b) => a + Math.random() * (b - a);

  function size() {
    const dpr = Math.min(2, devicePixelRatio || 1);
    W = cv.clientWidth; H = cv.clientHeight; cv.width = W * dpr; cv.height = H * dpr; cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const s = Math.max(W / IMG_AR, H); const w = s * IMG_AR; const h = s; box = { x: (W - w) / 2, y: (H - h) / 2, w, h };
    if (cur) build(cur);
  }
  const at = (fx, fy) => [box.x + fx * box.w, box.y + fy * box.h];

  // Light sources painted into each room's picture (fractions of the image), so the glow sits on the lamp.
  const ROOMS = {
    'room-stage': {
      glows: [
        { p: [0.30, 0.10], r: 0.16, c: '255,214,150', a: 0.30, f: 0.05 },
        { p: [0.725, 0.10], r: 0.16, c: '255,214,150', a: 0.30, f: 0.05 },
        { p: [0.505, 0.085], r: 0.11, c: '255,70,60', a: 0.34, f: 0.0, pulse: 2.6 },
        { p: [0.925, 0.30], r: 0.07, c: '255,200,130', a: 0.30, f: 0.08 },
      ],
      dust: { n: 70, area: [0.18, 0.08, 0.84, 0.72] },
    },
    'room-network': {
      glows: [
        { p: [0.22, 0.46], r: 0.15, c: '255,200,120', a: 0.32, f: 0.07 },
        { p: [0.40, 0.21], r: 0.13, c: '255,80,70', a: 0.12, f: 0.0, pulse: 3.4 },
        { p: [0.86, 0.06], r: 0.10, c: '255,170,90', a: 0.16, f: 0.03 },
        { p: [0.86, 0.26], r: 0.10, c: '255,170,90', a: 0.16, f: 0.03 },
      ],
      twinkle: { n: 26, area: [0.0, 0.28, 0.3, 0.62] },
      dust: { n: 30, area: [0.05, 0.25, 0.6, 0.8] },
    },
    'room-writers': {
      glows: [
        { p: [0.665, 0.50], r: 0.17, c: '255,200,120', a: 0.34, f: 0.05 },
        { p: [0.40, 0.03], r: 0.22, c: '255,210,140', a: 0.10, f: 0.02 },
      ],
      rain: [0.21, 0.02, 0.585, 0.35],
      twinkle: { n: 14, area: [0.2, 0.0, 0.6, 0.07] },
      steam: [[0.118, 0.47]],
      dust: { n: 50, area: [0.4, 0.2, 0.95, 0.8] },
    },
    title: {
      glows: [{ p: [0.77, 0.17], r: 0.18, c: '255,205,120', a: 0.30, f: 0.06 }],
      steam: [[0.36, 0.11]],
      dust: { n: 40, area: [0.55, 0.12, 0.98, 0.7] },
    },
  };

  // One look per genre. Each is a list of layers.
  const GENRES = {
    'indian-serial': ['sparkle:gold', 'dust'], hospital: ['fluoro', 'dust'], 'nordic-noir': ['snow'], dating: ['bokeh:pink', 'sparkle:pink'],
    space: ['stars'], royal: ['candle', 'dust'], 'true-crime': ['rain'], zombie: ['fog', 'fluoro'], cop80s: ['neon', 'rain:light'],
    cooking: ['steam', 'embers'], kdrama: ['petals:pink', 'rain:light'], nature: ['dust:gold'], telenovela: ['petals:rose', 'candle'],
    legal: ['dust', 'candle:soft'], superhero: ['searchlight', 'sparkle:gold'], corporate: ['fluoro', 'dust'], shakespeare: ['candle', 'dust'],
    western: ['dust:wind'], horror: ['fog', 'lightning'], heist: ['laser', 'dust'], cult: ['embers', 'candle'], sports: ['rain', 'floodlight'],
    spy: ['fog', 'rain:light'], wedding: ['petals:marigold', 'sparkle:gold'],
  };

  let cur = null; let layers = []; let t0 = performance.now(); let alpha = 0;

  function set(key) {
    if (key === cur) return;
    cur = key; alpha = 0; build(key);
  }
  function build(key) {
    layers = [];
    if (!key) return;
    if (key.startsWith('genre:')) (GENRES[key.slice(6)] || ['dust']).forEach((spec) => layers.push(make(spec)));
    else {
      const r = ROOMS[key]; if (!r) return;
      r.glows.forEach((g) => layers.push(glow(g)));
      if (r.rain) layers.push(rain(70, r.rain));
      if (r.twinkle) layers.push(twinkle(r.twinkle));
      if (r.steam) r.steam.forEach((p) => layers.push(steamAt(p)));
      if (r.dust) layers.push(dust(r.dust.n, r.dust.area));
    }
  }

  // ------------------------------------------------------------ layers
  function make(spec) {
    const [k, v] = spec.split(':');
    switch (k) {
      case 'dust': return v === 'wind' ? dust(90, [0, 0, 1, 1], { wind: 1.4, c: '235,200,150' }) : dust(v === 'gold' ? 90 : 60, [0, 0, 1, 1], { c: v === 'gold' ? '255,215,120' : '255,225,180' });
      case 'snow': return fall(160, { r: [1, 3.4], v: [0.4, 1.3], sway: 0.6, c: '240,246,255', a: 0.75 });
      case 'rain': return rain(v === 'light' ? 90 : 220);
      case 'sparkle': return sparkle(v === 'pink' ? '255,190,220' : '255,220,130');
      case 'bokeh': return bokeh(v === 'pink' ? ['255,140,170', '255,190,120', '255,110,140'] : ['255,200,120']);
      case 'petals': return fall(34, { r: [4, 7], v: [0.5, 1.2], sway: 1.2, c: { pink: '255,183,205', rose: '200,40,60', marigold: '255,160,30' }[v] || '255,183,205', a: 0.85, petal: true });
      case 'embers': return rise(60, { c: '255,140,50' });
      case 'steam': return rise(26, { c: '255,255,255', steam: true });
      case 'stars': return stars();
      case 'fog': return fog();
      case 'candle': return tint('255,150,60', v === 'soft' ? 0.04 : 0.07, 'candle');
      case 'neon': return neon();
      case 'fluoro': return tint('200,235,255', 0.05, 'fluoro');
      case 'lightning': return lightning();
      case 'laser': return laser();
      case 'searchlight': return searchlight();
      case 'floodlight': return tint('230,240,255', 0.05, 'flood');
      default: return dust(50, [0, 0, 1, 1]);
    }
  }

  function glow(g) {
    return (t) => {
      const [x, y] = at(...g.p); const r = g.r * box.w;
      let a = g.a * (1 + (g.f ? (Math.sin(t * 7.3) * 0.4 + Math.sin(t * 13.1) * 0.3 + (Math.random() - 0.5) * 0.6) * g.f * 4 : 0));
      if (g.pulse) a *= 0.7 + 0.3 * Math.sin((t * Math.PI * 2) / g.pulse);
      const gr = cx.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(${g.c},${a})`); gr.addColorStop(1, `rgba(${g.c},0)`);
      cx.fillStyle = gr; cx.fillRect(x - r, y - r, r * 2, r * 2);
    };
  }
  function dust(n, area, o = {}) {
    const [ax, ay, bx, by] = area; const c = o.c || '255,225,180';
    const ps = Array.from({ length: n }, () => ({ x: rnd(ax, bx), y: rnd(ay, by), r: rnd(0.8, 2.4), vx: rnd(-0.00004, 0.00004) + (o.wind || 0) * rnd(0.0004, 0.0012), vy: rnd(-0.00003, 0.00002), ph: rnd(0, 6.28), sp: rnd(0.3, 1.1) }));
    return (t, dt) => {
      for (const p of ps) {
        p.x += p.vx * dt + Math.sin(t * 0.3 + p.ph) * 0.00002 * dt; p.y += p.vy * dt + Math.cos(t * 0.25 + p.ph) * 0.000015 * dt;
        if (p.x > bx) p.x = ax; if (p.x < ax) p.x = bx; if (p.y > by) p.y = ay; if (p.y < ay) p.y = by;
        const a = 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(t * p.sp + p.ph)); const [x, y] = at(p.x, p.y);
        cx.fillStyle = `rgba(${c},${a})`; cx.beginPath(); cx.arc(x, y, p.r, 0, 6.28); cx.fill();
      }
    };
  }
  function twinkle({ n, area }) {
    const [ax, ay, bx, by] = area;
    const ps = Array.from({ length: n }, () => ({ x: rnd(ax, bx), y: rnd(ay, by), ph: rnd(0, 6.28), sp: rnd(0.2, 0.9) }));
    return (t) => { for (const p of ps) { const a = Math.max(0, Math.sin(t * p.sp + p.ph)) * 0.5; const [x, y] = at(p.x, p.y); const r = box.w * 0.012; const gr = cx.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(255,220,150,${a})`); gr.addColorStop(1, 'rgba(255,220,150,0)'); cx.fillStyle = gr; cx.fillRect(x - r, y - r, r * 2, r * 2); } };
  }
  function steamAt(p0) {
    const ps = Array.from({ length: 10 }, (_, i) => ({ k: i / 10 }));
    return (t) => {
      for (const p of ps) {
        const k = (p.k + t * 0.12) % 1; const [x0, y0] = at(...p0);
        const x = x0 + Math.sin(k * 6 + t) * box.w * 0.008; const y = y0 - k * box.h * 0.12; const r = box.w * (0.006 + k * 0.02);
        const gr = cx.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(255,250,240,${0.16 * (1 - k)})`); gr.addColorStop(1, 'rgba(255,250,240,0)');
        cx.fillStyle = gr; cx.beginPath(); cx.arc(x, y, r, 0, 6.28); cx.fill();
      }
    };
  }
  function fall(n, o) {
    const ps = Array.from({ length: n }, () => ({ x: Math.random(), y: Math.random(), r: rnd(...o.r), v: rnd(...o.v), ph: rnd(0, 6.28), rot: rnd(0, 6.28), vr: rnd(-0.02, 0.02) }));
    return (t, dt) => {
      cx.fillStyle = `rgba(${o.c},${o.a})`;
      for (const p of ps) {
        p.y += (p.v * dt) / 16 / H; p.x += (Math.sin(t * 0.8 + p.ph) * o.sway * dt) / 16 / W; p.rot += p.vr * dt / 16;
        if (p.y > 1.02) { p.y = -0.02; p.x = Math.random(); }
        const x = p.x * W; const y = p.y * H;
        if (o.petal) { cx.save(); cx.translate(x, y); cx.rotate(p.rot); cx.beginPath(); cx.ellipse(0, 0, p.r, p.r * 0.55, 0, 0, 6.28); cx.fill(); cx.restore(); } else { cx.beginPath(); cx.arc(x, y, p.r, 0, 6.28); cx.fill(); }
      }
    };
  }
  // Rain over the whole screen, or only inside a window painted in the picture (area = [x0, y0, x1, y1] fractions).
  function rain(n, area) {
    const ps = Array.from({ length: n }, () => ({ x: Math.random(), y: Math.random(), l: rnd(10, 24), v: rnd(9, 15) }));
    return (t, dt) => {
      let ox = 0; let oy = 0; let w = W; let h = H;
      if (area) { const [x0, y0] = at(area[0], area[1]); const [x1, y1] = at(area[2], area[3]); ox = x0; oy = y0; w = x1 - x0; h = y1 - y0; cx.save(); cx.beginPath(); cx.rect(ox, oy, w, h); cx.clip(); }
      cx.strokeStyle = area ? 'rgba(190,205,235,.4)' : 'rgba(200,215,235,.28)'; cx.lineWidth = 1; cx.beginPath();
      for (const p of ps) { p.y += (p.v * dt) / 16 / h; p.x -= (p.v * 0.18 * dt) / 16 / w; if (p.y > 1) { p.y = -0.05; p.x = rnd(0, 1.15); } const x = ox + p.x * w; const y = oy + p.y * h; const l = area ? p.l * 0.7 : p.l; cx.moveTo(x, y); cx.lineTo(x - l * 0.18, y + l); }
      cx.stroke();
      if (area) cx.restore();
    };
  }
  function sparkle(c) {
    const ps = Array.from({ length: 34 }, () => ({ x: Math.random(), y: Math.random(), ph: rnd(0, 6.28), sp: rnd(0.6, 1.6), s: rnd(4, 10) }));
    return (t) => {
      for (const p of ps) {
        const a = Math.max(0, Math.sin(t * p.sp + p.ph)) ** 3; if (a < 0.02) { if (Math.sin(t * p.sp + p.ph) < -0.98) { p.x = Math.random(); p.y = Math.random(); } continue; }
        const x = p.x * W; const y = p.y * H; const s = p.s * (0.6 + a * 0.6);
        cx.fillStyle = `rgba(${c},${a * 0.9})`; cx.beginPath(); cx.moveTo(x, y - s); cx.quadraticCurveTo(x, y, x + s, y); cx.quadraticCurveTo(x, y, x, y + s); cx.quadraticCurveTo(x, y, x - s, y); cx.quadraticCurveTo(x, y, x, y - s); cx.fill();
      }
    };
  }
  function bokeh(cols) {
    const ps = Array.from({ length: 16 }, () => ({ x: Math.random(), y: Math.random(), r: rnd(20, 60), c: cols[Math.floor(Math.random() * cols.length)], ph: rnd(0, 6.28), vx: rnd(-0.004, 0.004), vy: rnd(-0.006, -0.002) }));
    return (t, dt) => {
      for (const p of ps) {
        p.x += (p.vx * dt) / 1000; p.y += (p.vy * dt) / 1000; if (p.y < -0.1) { p.y = 1.1; p.x = Math.random(); }
        const a = 0.08 + 0.06 * Math.sin(t * 0.7 + p.ph); const x = p.x * W; const y = p.y * H;
        const gr = cx.createRadialGradient(x, y, p.r * 0.6, x, y, p.r); gr.addColorStop(0, `rgba(${p.c},${a})`); gr.addColorStop(1, `rgba(${p.c},0)`);
        cx.fillStyle = gr; cx.beginPath(); cx.arc(x, y, p.r, 0, 6.28); cx.fill();
      }
    };
  }
  function rise(n, o) {
    const ps = Array.from({ length: n }, () => ({ x: Math.random(), y: Math.random(), r: o.steam ? rnd(30, 70) : rnd(1, 2.6), v: rnd(0.3, 1), ph: rnd(0, 6.28) }));
    return (t, dt) => {
      for (const p of ps) {
        p.y -= (p.v * dt) / 16 / H; p.x += (Math.sin(t + p.ph) * 0.3 * dt) / 16 / W; if (p.y < -0.05) { p.y = 1.05; p.x = Math.random(); }
        const x = p.x * W; const y = p.y * H;
        if (o.steam) { const a = 0.05 * Math.min(1, (1 - p.y) * 3); const gr = cx.createRadialGradient(x, y, 0, x, y, p.r); gr.addColorStop(0, `rgba(${o.c},${a})`); gr.addColorStop(1, `rgba(${o.c},0)`); cx.fillStyle = gr; cx.beginPath(); cx.arc(x, y, p.r, 0, 6.28); cx.fill(); } else { const a = 0.35 + 0.5 * Math.abs(Math.sin(t * 3 + p.ph)); cx.fillStyle = `rgba(${o.c},${a * (1 - Math.abs(p.y - 0.5))})`; cx.beginPath(); cx.arc(x, y, p.r, 0, 6.28); cx.fill(); }
      }
    };
  }
  function stars() {
    const ps = Array.from({ length: 150 }, () => ({ x: Math.random(), y: Math.random(), r: rnd(0.4, 1.6), ph: rnd(0, 6.28), sp: rnd(0.5, 2), v: rnd(0.002, 0.008) }));
    return (t, dt) => { for (const p of ps) { p.x -= (p.v * dt) / 1000; if (p.x < 0) p.x = 1; const a = 0.3 + 0.6 * Math.abs(Math.sin(t * p.sp + p.ph)); cx.fillStyle = `rgba(230,235,255,${a})`; cx.beginPath(); cx.arc(p.x * W, p.y * H, p.r, 0, 6.28); cx.fill(); } };
  }
  function fog() {
    const ps = Array.from({ length: 7 }, () => ({ x: Math.random(), y: rnd(0.45, 1), r: rnd(0.25, 0.45), v: rnd(0.004, 0.01) * (Math.random() < 0.5 ? 1 : -1) }));
    return (t, dt) => { for (const p of ps) { p.x += (p.v * dt) / 1000; if (p.x > 1.4) p.x = -0.4; if (p.x < -0.4) p.x = 1.4; const x = p.x * W; const y = p.y * H; const r = p.r * W; const gr = cx.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(210,220,230,.10)'); gr.addColorStop(1, 'rgba(210,220,230,0)'); cx.fillStyle = gr; cx.fillRect(x - r, y - r, r * 2, r * 2); } };
  }
  function tint(c, base, kind) {
    let off = 0;
    return (t) => {
      let a = base;
      if (kind === 'candle') a = base * (0.7 + 0.25 * Math.sin(t * 9) + 0.2 * Math.sin(t * 23) + (Math.random() - 0.5) * 0.3);
      if (kind === 'fluoro') { if (off <= 0 && Math.random() < 0.004) off = rnd(2, 6); if (off > 0) { off -= 1; a = 0; cx.fillStyle = 'rgba(0,0,0,.18)'; cx.fillRect(0, 0, W, H); return; } }
      if (kind === 'flood') { const gr = cx.createRadialGradient(W * 0.5, -H * 0.2, 0, W * 0.5, -H * 0.2, H * 1.2); gr.addColorStop(0, `rgba(${c},${a * 3})`); gr.addColorStop(1, `rgba(${c},0)`); cx.fillStyle = gr; cx.fillRect(0, 0, W, H); return; }
      const gr = cx.createRadialGradient(W * 0.5, H * 0.55, 0, W * 0.5, H * 0.55, W * 0.7); gr.addColorStop(0, `rgba(${c},${a})`); gr.addColorStop(1, `rgba(${c},${a * 0.3})`);
      cx.fillStyle = gr; cx.fillRect(0, 0, W, H);
    };
  }
  function neon() {
    let buzz = 0;
    return (t) => {
      if (buzz <= 0 && Math.random() < 0.006) buzz = rnd(4, 12);
      const on = buzz > 0 ? (Math.random() < 0.5 ? 0.3 : 1) : 1; if (buzz > 0) buzz -= 1;
      const k = 0.5 + 0.5 * Math.sin(t * 0.6);
      cx.fillStyle = `rgba(255,60,170,${0.07 * k * on})`; cx.fillRect(0, 0, W, H);
      cx.fillStyle = `rgba(40,220,230,${0.06 * (1 - k) * on})`; cx.fillRect(0, 0, W, H);
    };
  }
  function lightning() {
    let flash = 0;
    return () => { if (flash <= 0 && Math.random() < 0.0016) flash = 14; if (flash > 0) { const a = flash > 10 ? 0.35 : flash > 7 ? 0.05 : flash > 4 ? 0.25 : 0.02; cx.fillStyle = `rgba(220,230,255,${a})`; cx.fillRect(0, 0, W, H); flash -= 1; } };
  }
  function laser() {
    const ls = Array.from({ length: 4 }, (_, i) => ({ ph: i * 1.7, sp: rnd(0.15, 0.35), y: rnd(0.3, 0.9) }));
    return (t) => {
      cx.lineWidth = 2; cx.shadowColor = 'rgba(255,40,40,.9)'; cx.shadowBlur = 12;
      for (const l of ls) { const a = Math.sin(t * l.sp + l.ph); cx.strokeStyle = 'rgba(255,60,60,.45)'; cx.beginPath(); cx.moveTo(0, H * (l.y + a * 0.2)); cx.lineTo(W, H * (l.y - a * 0.2)); cx.stroke(); }
      cx.shadowBlur = 0;
    };
  }
  function searchlight() {
    return (t) => {
      const ang = Math.sin(t * 0.35) * 0.5 - Math.PI / 2; const x0 = W * 0.5; const y0 = H * 1.05; const len = H * 1.4; const w = 0.09;
      const gr = cx.createLinearGradient(x0, y0, x0 + Math.cos(ang) * len, y0 + Math.sin(ang) * len); gr.addColorStop(0, 'rgba(255,245,200,.18)'); gr.addColorStop(1, 'rgba(255,245,200,0)');
      cx.fillStyle = gr; cx.beginPath(); cx.moveTo(x0, y0); cx.lineTo(x0 + Math.cos(ang - w) * len, y0 + Math.sin(ang - w) * len); cx.lineTo(x0 + Math.cos(ang + w) * len, y0 + Math.sin(ang + w) * len); cx.closePath(); cx.fill();
    };
  }

  // ------------------------------------------------------------ loop
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(50, now - last); last = now; const t = (now - t0) / 1000;
    cx.clearRect(0, 0, W, H);
    if (!document.hidden && layers.length) {
      alpha = Math.min(1, alpha + dt / 1200); cx.globalAlpha = alpha;
      for (const L of layers) L(t, still ? 0 : dt);
      cx.globalAlpha = 1;
    }
    requestAnimationFrame(frame);
  }
  addEventListener('resize', size); size(); requestAnimationFrame(frame);

  // Portraits react to the audience: a shudder on a gasp, a droop on a boo, a bounce on a laugh.
  let reactTimer = null;
  function react(kind) {
    const st = document.getElementById('stage'); if (!st || still) return;
    st.classList.remove('r-laugh', 'r-gasp', 'r-boo'); void st.offsetWidth; st.classList.add(`r-${kind}`);
    clearTimeout(reactTimer); reactTimer = setTimeout(() => st.classList.remove(`r-${kind}`), 900);
  }

  window.AMB = { set, react };
})();
