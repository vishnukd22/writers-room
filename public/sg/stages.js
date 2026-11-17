// Every stage: a seeded road through its own little world, plus whatever makes that stage special.
import { THREE, lerp, clamp, wrapA, rng, makeCake, pawn } from './world.js';

export const W = 8; export const LANE = 2.05;
const right = (t) => new THREE.Vector3(-t.z, 0, t.x);

// ------------------------------------------------------------ the road
const SPEC = {
  rush: { len: 820, turn: 0.5, seg: 40, theme: 'city' },
  chase: { len: 860, turn: 0.55, seg: 40, theme: 'dusk' },
  night: { len: 740, turn: 0.85, seg: 34, theme: 'forest' },
  dunes: { len: 760, turn: 0.55, seg: 40, theme: 'desert' },
  park: { len: 170, turn: 0.04, seg: 42, theme: 'city' },
  pit: { len: 300, turn: 0.3, seg: 40, theme: 'city' },
  jump: { len: 440, turn: 0.12, seg: 44, theme: 'coast' },
};
function makePoints(r, spec) {
  for (let attempt = 0; attempt < 60; attempt++) {
    const pts = [new THREE.Vector3(0, 0, 0)]; let h = 0; let ok = true;
    const n = Math.ceil(spec.len / spec.seg) + 1;
    for (let i = 1; i <= n && ok; i++) {
      let placed = false;
      for (let tries = 0; tries < 25 && !placed; tries++) {
        const nh = i <= 1 || i >= n - 1 ? h : h + (r() - 0.5) * 2 * spec.turn;
        const p = pts[i - 1].clone().add(new THREE.Vector3(Math.sin(nh), 0, Math.cos(nh)).multiplyScalar(spec.seg));
        if (pts.slice(0, -2).every((q) => q.distanceTo(p) > 48)) { pts.push(p); h = nh; placed = true; }
      }
      if (!placed) ok = false;
    }
    if (ok) return pts;
  }
  return [...Array(Math.ceil(spec.len / spec.seg) + 2).keys()].map((i) => new THREE.Vector3(0, 0, i * spec.seg));
}
export function makeTrack(seed, key, height = null) {
  const spec = SPEC[key]; const r = rng(seed);
  const curve = new THREE.CatmullRomCurve3(makePoints(r, spec), false, 'centripetal');
  const L = curve.getLength(); const N = Math.round(L); const DS = L / N;
  const SP = curve.getSpacedPoints(N); const TAN = []; const HEAD = []; const CURV = [];
  for (let i = 0; i <= N; i++) { const a = SP[Math.max(0, i - 1)]; const b = SP[Math.min(N, i + 1)]; const t = new THREE.Vector3().subVectors(b, a).setY(0).normalize(); TAN.push(t); HEAD.push(Math.atan2(t.x, t.z)); }
  for (let i = 0; i <= N; i++) CURV.push(wrapA(HEAD[Math.min(N, i + 1)] - HEAD[Math.max(0, i - 1)]) / (2 * DS));
  if (height) for (const p of SP) p.y = height(p.x, p.z);
  // a grid of road samples, so "how far from the road?" is quick
  const G = 10; const grid = new Map(); const gk = (x, z) => `${Math.floor(x / G)},${Math.floor(z / G)}`;
  SP.forEach((p, i) => { const k = gk(p.x, p.z); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(i); });
  const tr = { key, L, N, DS, SP, TAN, HEAD, CURV, seed,
    at(s) { const u = clamp(s, 0, L - 0.001) / DS; const i = Math.min(N - 1, Math.floor(u)); const f = u - i; const p = SP[i].clone().lerp(SP[i + 1], f); const t = TAN[i].clone().lerp(TAN[i + 1], f).normalize(); return { p, t, r: right(t), head: Math.atan2(t.x, t.z), k: lerp(CURV[i], CURV[i + 1], f) }; },
    // nearest point on the road: distance along it (s) and how far to the side (lat, positive = right)
    nearest(x, z, hint = null, win = 60) {
      let best = -1; let bd = 1e18;
      if (hint != null) { const c = Math.round(hint / DS); for (let i = Math.max(0, c - win); i <= Math.min(N, c + win); i++) { const dx = SP[i].x - x; const dz = SP[i].z - z; const d = dx * dx + dz * dz; if (d < bd) { bd = d; best = i; } } }
      if (best < 0 || bd > 400) { const cx = Math.floor(x / G); const cz = Math.floor(z / G); for (let a = -3; a <= 3; a++) for (let b = -3; b <= 3; b++) for (const i of grid.get(`${cx + a},${cz + b}`) || []) { const dx = SP[i].x - x; const dz = SP[i].z - z; const d = dx * dx + dz * dz; if (d < bd) { bd = d; best = i; } } }
      if (best < 0) return { s: hint ?? 0, lat: 99 };
      const p = SP[best]; const rr = right(TAN[best]); return { s: best * DS, lat: (x - p.x) * rr.x + (z - p.z) * rr.z };
    },
    roadDist(x, z) { const n = tr.nearest(x, z); return Math.abs(n.lat); },
  };
  return tr;
}

// ------------------------------------------------------------ building blocks
let CUT = null; // the broken bridge: no road over the river
const cut = (i, tr) => CUT && i * tr.DS > CUT[0] && i * tr.DS < CUT[1];
function ribbon(tr, a, b, y, mat, vLen, hfn) {
  const pos = []; const uv = []; const idx = []; let s = 0;
  for (let i = 0; i <= tr.N; i++) {
    const p = tr.SP[i]; const r = right(tr.TAN[i]);
    let ax = p.x + r.x * a; let az = p.z + r.z * a; let bx = p.x + r.x * b; let bz = p.z + r.z * b;
    if (i > 0) { const t = tr.TAN[i]; const k = pos.length - 6; // an edge that would run backwards on a tight bend stays where it was
      if ((ax - pos[k]) * t.x + (az - pos[k + 2]) * t.z < 0) { ax = pos[k]; az = pos[k + 2]; }
      if ((bx - pos[k + 3]) * t.x + (bz - pos[k + 5]) * t.z < 0) { bx = pos[k + 3]; bz = pos[k + 5]; } }
    pos.push(ax, (hfn ? hfn(ax, az) : 0) + y, az, bx, (hfn ? hfn(bx, bz) : 0) + y, bz);
    uv.push(0, s / vLen, 1, s / vLen); s += tr.DS;
    if (i < tr.N && !cut(i, tr)) { const k = i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat); m.receiveShadow = true; return m;
}
function kerb(tr, off, h, w, mat, hfn) {
  const pos = []; const uv = []; const idx = []; let s = 0; const o = [off, off, off + w, off + w]; const ys = [0, h, h, 0];
  for (let i = 0; i <= tr.N; i++) { const p = tr.SP[i]; const r = right(tr.TAN[i]); for (let k = 0; k < 4; k++) { const x = p.x + r.x * o[k]; const z = p.z + r.z * o[k]; pos.push(x, ys[k] + (hfn ? hfn(x, z) : 0), z); uv.push(k / 3, s / 1.6); } s += tr.DS; if (i < tr.N && !cut(i, tr)) { const b = i * 4; for (let k = 0; k < 3; k++) idx.push(b + k, b + k + 4, b + k + 1, b + k + 1, b + k + 4, b + k + 5); } }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat); m.receiveShadow = true; m.castShadow = true; return m;
}
function texSet(world, theme) {
  const ct = world.canvasTex; const r = rng(99);
  const noise = (g, w, h, n, col, a) => { for (let i = 0; i < n; i++) { g.fillStyle = col(); g.globalAlpha = a; const s = 1 + r() * 3; g.fillRect(r() * w, r() * h, s, s); } g.globalAlpha = 1; };
  const sand = theme === 'desert'; const dark = theme === 'forest';
  const asphalt = ct(256, 1024, (g, w, h) => {
    g.fillStyle = sand ? '#C9A36A' : '#4B4858'; g.fillRect(0, 0, w, h); noise(g, w, h, 9000, () => (sand ? (r() < 0.5 ? '#B98F57' : '#D8B47C') : r() < 0.5 ? '#423F4E' : '#58556A'), 0.7);
    if (sand) { g.fillStyle = 'rgba(120,80,40,.35)'; g.fillRect(44, 0, 26, h); g.fillRect(w - 70, 0, 26, h); return; }
    g.fillStyle = '#F4EFE6'; g.fillRect(12, 0, 7, h); g.fillRect(w - 19, 0, 7, h); g.fillStyle = '#FFD23F'; g.fillRect(w / 2 - 5, 0, 10, h * 0.55);
  });
  const ground = ct(512, 512, (g, w, h) => {
    const base = sand ? '#E9C27E' : dark ? '#3E6B33' : theme === 'coast' ? '#86C24F' : '#7FBF4D';
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    noise(g, w, h, 5000, () => (sand ? (r() < 0.5 ? '#DDB26C' : '#F2D296') : r() < 0.5 ? '#6FAE40' : '#94CF5E'), 0.6);
  }); ground.repeat.set(80, 80);
  const kerbT = ct(8, 64, (g, w, h) => { g.fillStyle = sand ? '#E07A3F' : '#E2453E'; g.fillRect(0, 0, w, h / 2); g.fillStyle = '#FFF4E8'; g.fillRect(0, h / 2, w, h / 2); });
  const paving = ct(128, 128, (g, w, h) => { g.fillStyle = '#E9DCC7'; g.fillRect(0, 0, w, h); g.strokeStyle = '#CDBEA6'; g.lineWidth = 3; for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32, h); g.stroke(); g.beginPath(); g.moveTo(0, i * 32); g.lineTo(w, i * 32); g.stroke(); } });
  return { asphalt, ground, kerbT, paving };
}
function bannerTex(world, text, bg = '#FF4F8B') {
  return world.canvasTex(512, 128, (g, w, h) => { g.fillStyle = bg; g.fillRect(0, 0, w, h); g.strokeStyle = '#1B1530'; g.lineWidth = 12; g.strokeRect(6, 6, w - 12, h - 12); g.font = '64px Bungee, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#1B1530'; g.fillText(text, w / 2 + 4, h / 2 + 6); g.fillStyle = '#FFF6E9'; g.fillText(text, w / 2, h / 2 + 2); }, false);
}
function gate(world, tr, s, text, hfn) {
  const a = tr.at(s); const g = new THREE.Group(); const y0 = hfn ? hfn(a.p.x, a.p.z) : 0;
  const postM = new THREE.MeshStandardMaterial({ color: 0xFFF6E9, roughness: 0.5 });
  for (const side of [-1, 1]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 6, 12), postM); p.position.copy(a.p).addScaledVector(a.r, side * (W / 2 + 0.8)); p.position.y = y0 + 3; g.add(p); }
  const ban = new THREE.Mesh(new THREE.BoxGeometry(W + 2.2, 1.6, 0.2), [postM, postM, postM, postM, new THREE.MeshStandardMaterial({ map: bannerTex(world, text) }), new THREE.MeshStandardMaterial({ map: bannerTex(world, text) })]);
  ban.position.copy(a.p); ban.position.y = y0 + 5.6; ban.rotation.y = a.head; g.add(ban);
  for (let i = 0; i < 9; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 10), new THREE.MeshStandardMaterial({ color: [0xFF4F8B, 0xFFD23F, 0x3ED6A0, 0x4FB6FF][i % 4], roughness: 0.3 })); b.position.copy(a.p).addScaledVector(a.r, (i - 4) * 1.15); b.position.y = y0 + 6.7 + (i % 2) * 0.3; g.add(b); }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
  return g;
}

// ------------------------------------------------------------ lighting per theme
export function lightTheme(world, theme) {
  const { scene, sun, hemi, grade } = world;
  const sky = (top, mid, bot) => world.canvasTex(4, 256, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, top); gr.addColorStop(0.55, mid); gr.addColorStop(1, bot); g.fillStyle = gr; g.fillRect(0, 0, w, h); }, false);
  const T = {
    city: { sky: ['#4FA9EC', '#B9DDF2', '#FFD3A3'], fog: [0xF3D2AE, 140, 380], sun: [0xFFD2A0, 3.3], hemi: [0xCFE8FF, 0x7A9A4C, 0.6], env: 0.32, exp: 1.0, warm: 0.02 },
    dusk: { sky: ['#3B3F8F', '#C7709A', '#FFB070'], fog: [0xE7A08A, 120, 340], sun: [0xFF9A62, 3.0], hemi: [0xA9A7FF, 0x5C6A40, 0.55], env: 0.28, exp: 1.0, warm: 0.04 },
    forest: { sky: ['#05081A', '#0E1838', '#1B2550'], fog: [0x0A1024, 25, 110], sun: [0x8FA8FF, 0.32], hemi: [0x3A4A80, 0x101810, 0.22], env: 0.05, exp: 1.1, warm: -0.02 },
    desert: { sky: ['#5DB4F2', '#CFE6F0', '#FFE0B0'], fog: [0xF6DDB2, 150, 420], sun: [0xFFF0D0, 3.6], hemi: [0xDFF0FF, 0xC9A060, 0.7], env: 0.35, exp: 0.98, warm: 0.03 },
    coast: { sky: ['#3FA4F0', '#B5E0F5', '#E8F4FF'], fog: [0xD9EEF7, 150, 420], sun: [0xFFE6C0, 3.3], hemi: [0xCFEFFF, 0x6E9A4C, 0.65], env: 0.32, exp: 1.0, warm: 0.01 },
    hall: { sky: ['#2A1630', '#3A2040', '#4A2A40'], fog: [0x2A1A2A, 60, 160], sun: [0xFFD9A8, 1.15], hemi: [0xFFD8C0, 0x4A2A24, 0.42], env: 0.3, exp: 0.88, warm: 0.05 },
  }[theme] || {};
  scene.background = sky(...T.sky); scene.fog = new THREE.Fog(...T.fog);
  sun.color.set(T.sun[0]); sun.intensity = T.sun[1]; hemi.color.set(T.hemi[0]); hemi.groundColor.set(T.hemi[1]); hemi.intensity = T.hemi[2];
  scene.environmentIntensity = T.env; world.renderer.toneMappingExposure = T.exp; grade.uniforms.warm.value = T.warm;
}

// ------------------------------------------------------------ building a stage
const SUB = ['a', 'b', 'c', 'd', 'f', 'h', 'k', 'l'].map((x) => `sub/building-type-${x}`);
const COM = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((x) => `com/building-${x}`);
const TALL = ['a', 'b', 'c'].map((x) => `com/building-skyscraper-${x}`);
const TRAFFIC = ['car/sedan', 'car/taxi', 'car/van', 'car/suv', 'car/truck', 'car/sedan-sports'];

export async function buildStage(world, key, seed) {
  const r = rng(seed + 11); const spec = SPEC[key]; const theme = spec.theme;
  lightTheme(world, theme);
  // desert ground rolls; the road rides the dunes
  const hfn = theme === 'desert' ? (x, z) => 1.6 * Math.sin(x * 0.045 + 1.3) * Math.cos(z * 0.05) + 0.9 * Math.sin((x + z) * 0.09) + 0.5 * Math.sin(x * 0.17 - z * 0.13) : null;
  const tr = makeTrack(seed, key, hfn);
  const root = new THREE.Group(); const STATIC = new THREE.Group(); world.scene.add(root);
  const tex = texSet(world, theme);
  const obstacles = []; const dyn = []; const marks = [];
  const solid = (x, z, rad, kind = 'wall', extra = {}) => { const o = { x, z, r: rad, kind, ...extra }; obstacles.push(o); return o; };
  const jobs = [];
  const place = (p, x, z, rot, sc, opts = {}) => jobs.push(world.model(p).then((m) => { m.position.set(x, (hfn ? hfn(x, z) : 0) + (opts.y || 0), z); m.rotation.y = rot; m.scale.setScalar(sc); (opts.live ? root : STATIC).add(m); return m; }));

  // ground and road
  if (hfn) {
    const geo = new THREE.PlaneGeometry(1400, 1400, 220, 220); geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position; const c = tr.SP[Math.floor(tr.N / 2)];
    geo.translate(c.x, 0, c.z); for (let i = 0; i < pos.count; i++) pos.setY(i, hfn(pos.getX(i), pos.getZ(i)) - 0.05); geo.computeVertexNormals();
    const gm = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex.ground, roughness: 1 })); gm.receiveShadow = true; root.add(gm);
  } else {
    const c = tr.SP[Math.floor(tr.N / 2)];
    const gm = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600), new THREE.MeshStandardMaterial({ map: tex.ground, roughness: 1 })); gm.rotation.x = -Math.PI / 2; gm.position.set(c.x, 0, c.z); gm.receiveShadow = true; root.add(gm);
  }
  CUT = key === 'jump' ? [tr.L * 0.66 + 0.3, tr.L * 0.66 + 21.7] : null;
  const road = new THREE.MeshStandardMaterial({ map: tex.asphalt, roughness: 0.85, side: THREE.DoubleSide });
  root.add(ribbon(tr, -W / 2, W / 2, 0.03, road, 14, hfn));
  if (theme !== 'desert') {
    const km = new THREE.MeshStandardMaterial({ map: tex.kerbT, roughness: 0.6, side: THREE.DoubleSide });
    root.add(kerb(tr, W / 2, 0.14, 0.55, km)); root.add(kerb(tr, -W / 2 - 0.55, 0.14, 0.55, km));
    if (theme !== 'forest' && theme !== 'coast') { const pv = new THREE.MeshStandardMaterial({ map: tex.paving, roughness: 0.9, side: THREE.DoubleSide }); root.add(ribbon(tr, W / 2 + 0.55, W / 2 + 3.4, 0.14, pv, 3)); root.add(ribbon(tr, -W / 2 - 3.4, -W / 2 - 0.55, 0.14, pv, 3)); }
  }

  // scenery by theme
  const hedge = new THREE.MeshStandardMaterial({ color: 0x4E9A3A, roughness: 0.9, flatShading: true });
  const petals = [0xFF6FA3, 0xFFD23F, 0xFFFFFF, 0xB98CFF, 0xFF8A3D].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7 }));
  const bushG = new THREE.IcosahedronGeometry(1, 0); const flowerG = new THREE.SphereGeometry(0.16, 6, 4);
  const river = CUT ? tr.at((CUT[0] + CUT[1]) / 2) : null; // nothing grows in the river
  const sideClear = (x, z, need) => tr.roadDist(x, z) > need && !(river && Math.abs((x - river.p.x) * river.t.x + (z - river.p.z) * river.t.z) < 14);
  if (theme === 'city' || theme === 'dusk') {
    for (let s = 6; s < tr.L - 6; s += 8.6) {
      const a = tr.at(s); if (Math.abs(a.k) > 0.04) continue;
      for (const side of [1, -1]) {
        const off = W / 2 + 3.4 + 3.8; const x = a.p.x + a.r.x * off * side; const z = a.p.z + a.r.z * off * side;
        if (!sideClear(x, z, off - 0.8)) continue;
        if (key === 'park' && side === 1 && Math.abs(s - 104) < 22) continue; // keep the wedding venue side open
        const face = Math.atan2(-a.r.x * side, -a.r.z * side); const comm = theme === 'dusk' || r() < 0.45;
        place(comm ? COM[Math.floor(r() * COM.length)] : SUB[Math.floor(r() * SUB.length)], x, z, face, comm ? 5.2 : 4.8); solid(x, z, 3.4, 'building');
        if (r() < 0.5) { const o2 = off + 15 + r() * 10; const x2 = a.p.x + a.r.x * o2 * side; const z2 = a.p.z + a.r.z * o2 * side; if (sideClear(x2, z2, 14)) place(comm ? TALL[Math.floor(r() * 3)] : SUB[Math.floor(r() * SUB.length)], x2, z2, face, comm ? 6 + r() * 2 : 5); }
      }
    }
    for (let s = 2; s < tr.L; s += 3.2) { const a = tr.at(s); for (const side of [1, -1]) { const off = W / 2 + 4.3 + r() * 0.5; const x = a.p.x + a.r.x * off * side; const z = a.p.z + a.r.z * off * side; if (!sideClear(x, z, off - 0.5)) continue; if (r() < 0.55) { const b = new THREE.Mesh(bushG, hedge); b.position.set(x, 0.35, z); b.scale.set(0.8 + r() * 0.5, 0.55 + r() * 0.35, 0.8 + r() * 0.5); STATIC.add(b); } else { const pm = petals[Math.floor(r() * petals.length)]; for (let k = 0; k < 6; k++) { const f = new THREE.Mesh(flowerG, pm); f.position.set(x + (r() - 0.5) * 1.6, 0.12, z + (r() - 0.5) * 1.6); STATIC.add(f); } } } }
    for (let s = 0; s < tr.L; s += 17) { const a = tr.at(s); for (const side of [1, -1]) { const off = W / 2 + 2.9; place('roads/light-curved', a.p.x + a.r.x * off * side, a.p.z + a.r.z * off * side, Math.atan2(a.r.x * side, a.r.z * side) + Math.PI, 5.2); } }
    for (let i = 0; i < 220; i++) { const s = r() * tr.L; const a = tr.at(s); const side = r() < 0.5 ? 1 : -1; const off = 20 + r() * 50; const x = a.p.x + a.r.x * off * side; const z = a.p.z + a.r.z * off * side; if (!sideClear(x, z, 16)) continue; place(r() < 0.5 ? 'toy/tree-pine' : r() < 0.5 ? 'toy/tree' : 'sub/tree-large', x, z, r() * 6, 3.6 + r() * 3); }
  }
  if (theme === 'forest') {
    const refl = new THREE.MeshStandardMaterial({ color: 0xFFB347, emissive: 0xFF9A1F, emissiveIntensity: 1.6 });
    for (let s = 4; s < tr.L; s += 9) { const a = tr.at(s); for (const side of [1, -1]) { const off = W / 2 + 0.9; const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.9, 0.16), refl); post.position.copy(a.p).addScaledVector(a.r, off * side); post.position.y = 0.45; STATIC.add(post); } }
    for (let i = 0; i < 900; i++) { const s = r() * tr.L; const a = tr.at(s); const side = r() < 0.5 ? 1 : -1; const off = W / 2 + 2.2 + Math.pow(r(), 1.6) * 40; const x = a.p.x + a.r.x * off * side; const z = a.p.z + a.r.z * off * side; if (!sideClear(x, z, W / 2 + 2)) continue; place(r() < 0.7 ? 'toy/tree-pine' : 'toy/tree', x, z, r() * 6, 3.4 + r() * 3.5); if (off < 14) solid(x, z, 0.9, 'tree'); }
    const moon = new THREE.Mesh(new THREE.SphereGeometry(9, 24, 16), new THREE.MeshBasicMaterial({ color: 0xFFF6D8, fog: false })); const c = tr.SP[Math.floor(tr.N * 0.6)]; moon.position.set(c.x + 160, 120, c.z + 200); root.add(moon);
  }
  if (theme === 'desert') {
    const trunk = new THREE.MeshStandardMaterial({ color: 0x9A6B3E, roughness: 0.9, flatShading: true }); const leaf = new THREE.MeshStandardMaterial({ color: 0x3F9E45, roughness: 0.7, flatShading: true }); const rock = new THREE.MeshStandardMaterial({ color: 0xB0764A, roughness: 1, flatShading: true });
    const palm = (x, z, sc) => { const g = new THREE.Group(); const y0 = hfn(x, z); for (let k = 0; k < 5; k++) { const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 1.2, 7), trunk); seg.position.set(k * 0.12, y0 + 0.6 + k * 1.1, 0); seg.rotation.z = -0.1; g.add(seg); } for (let k = 0; k < 7; k++) { const l = new THREE.Mesh(new THREE.ConeGeometry(0.5, 3.2, 4), leaf); const a = (k / 7) * Math.PI * 2; l.position.set(0.6 + Math.cos(a) * 1.3, y0 + 5.6, Math.sin(a) * 1.3); l.rotation.set(Math.sin(a) * 1.2, 0, -Math.cos(a) * 1.2 - 0.0); l.scale.set(1, 1, 0.35); g.add(l); } g.position.set(x, 0, z); g.scale.setScalar(sc); g.traverse((o) => { if (o.isMesh) { o.castShadow = true; } }); STATIC.add(g); };
    for (let i = 0; i < 260; i++) { const s = r() * tr.L; const a = tr.at(s); const side = r() < 0.5 ? 1 : -1; const off = W / 2 + 3 + Math.pow(r(), 1.4) * 60; const x = a.p.x + a.r.x * off * side; const z = a.p.z + a.r.z * off * side; if (!sideClear(x, z, W / 2 + 2.5)) continue; if (r() < 0.45) { palm(x, z, 0.9 + r() * 0.5); if (off > 9 && off < 14) solid(x, z, 0.6, 'tree'); } else { const k = new THREE.Mesh(new THREE.DodecahedronGeometry(0.6 + r() * 1.4, 0), rock); k.position.set(x, hfn(x, z) + 0.3, z); k.rotation.set(r(), r(), r()); k.castShadow = true; STATIC.add(k); if (off > 9 && off < 14) solid(x, z, 0.9, 'rock'); } }
    for (let s = 6; s < tr.L; s += 14) { const a = tr.at(s); for (const side of [1, -1]) { const x = a.p.x + a.r.x * (W / 2 + 0.6) * side; const z = a.p.z + a.r.z * (W / 2 + 0.6) * side; const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.4, 6), new THREE.MeshStandardMaterial({ color: side > 0 ? 0xE2453E : 0xFFFFFF })); pole.position.set(x, hfn(x, z) + 0.7, z); STATIC.add(pole); } }
  }
  if (theme === 'coast') {
    for (let i = 0; i < 300; i++) { const s = r() * tr.L; const a = tr.at(s); const side = r() < 0.5 ? 1 : -1; const off = W / 2 + 4 + Math.pow(r(), 1.3) * 60; const x = a.p.x + a.r.x * off * side; const z = a.p.z + a.r.z * off * side; if (!sideClear(x, z, W / 2 + 3)) continue; place(r() < 0.5 ? 'toy/tree' : 'sub/tree-large', x, z, r() * 6, 4 + r() * 3); if (off < 12) solid(x, z, 0.9, 'tree'); }
  }
  // distant hills (dunes in the desert)
  const c0 = tr.SP[Math.floor(tr.N / 2)];
  let hillR = 0; for (const p of tr.SP) hillR = Math.max(hillR, Math.hypot(p.x - c0.x, p.z - c0.z));
  for (let i = 0; i < 30; i++) { const a = (i / 30) * Math.PI * 2 + r() * 0.2; const s = 40 + r() * 50; const d = Math.max(330, hillR + 50 + s * 1.6) + r() * 60; const col = theme === 'desert' ? new THREE.Color().setHSL(0.09, 0.55, 0.62 + r() * 0.08) : theme === 'forest' ? new THREE.Color(0x0C1A14) : new THREE.Color().setHSL(0.27 + r() * 0.05, 0.42, 0.42 + r() * 0.08); const hill = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 10), new THREE.MeshStandardMaterial({ color: col, roughness: 1, flatShading: true })); hill.position.set(c0.x + Math.cos(a) * d, -s * 0.35, c0.z + Math.sin(a) * d); hill.scale.set(s * 1.6, s * (0.5 + r() * 0.4), s * 1.3); root.add(hill); }

  // ------------------------------------------------------------ stage specials
  const st = { key, theme, tr, root, obstacles, dyn, marks, hfn, startS: 6, finishS: tr.L - 14, special: {} };
  const traffic = async (s0, lane, v, m) => { const g = new THREE.Group(); const c = world.glossy(await world.model(m), 0.35); c.scale.setScalar(1.22); g.add(c); root.add(g); const o = { kind: 'car', s: s0, lane, v, v0: v, g, r: 1.2, x: 0, z: 0, pull: 0 }; dyn.push(o); return o; };
  if (key === 'rush' || key === 'pit' || key === 'dunes') {
    const n = key === 'rush' ? 9 : key === 'dunes' ? 3 : 0;
    for (let i = 0; i < n; i++) await traffic(60 + i * (tr.L / (n + 1)) + r() * 20, LANE, key === 'dunes' ? 9 : 8 + r() * 4, TRAFFIC[Math.floor(r() * TRAFFIC.length)]);
    for (let i = 0; i < (key === 'rush' ? 10 : 4); i++) await traffic(40 + i * (tr.L / 10) + r() * 30, -LANE, -(12 + r() * 4), TRAFFIC[Math.floor(r() * TRAFFIC.length)]);
  }
  if (key === 'rush') {
    // roadworks: cones across one lane in a few places
    for (const s of [tr.L * 0.32, tr.L * 0.61]) { const a = tr.at(s); const lane = r() < 0.5 ? 1 : -1; for (let i = 0; i < 5; i++) { const c = await world.model('car/cone'); c.scale.setScalar(1.5); const p = a.p.clone().addScaledVector(a.r, LANE * lane + (i % 2 ? 0.8 : -0.8)).addScaledVector(a.t, i * 1.6); c.position.copy(p); root.add(c); dyn.push({ kind: 'cone', g: c, x: p.x, z: p.z, r: 0.4, v: new THREE.Vector3(), w: new THREE.Vector3(), hit: false }); } marks.push({ k: 'cones', x: a.p.x + a.r.x * LANE * lane, z: a.p.z + a.r.z * LANE * lane }); }
  }
  if (key === 'chase') {
    for (const f of [0.18, 0.3, 0.43, 0.55, 0.68, 0.8]) {
      const s = tr.L * f; const a = tr.at(s); const lane = r() < 0.5 ? 1 : -1;
      for (let i = 0; i < 3; i++) { const b = await world.model('roads/construction-barrier'); b.scale.setScalar(4); const p = a.p.clone().addScaledVector(a.r, LANE * lane + (i - 1) * 1.35); b.position.copy(p); b.rotation.y = a.head + Math.PI / 2; root.add(b); solid(p.x, p.z, 0.75, 'barrier'); }
      const lt = new THREE.PointLight(0xFF3B30, 0, 10); lt.position.copy(a.p).addScaledVector(a.r, LANE * lane).setY(2); root.add(lt); st.special.flashers = st.special.flashers || []; st.special.flashers.push(lt);
      marks.push({ k: 'block', x: a.p.x + a.r.x * LANE * lane, z: a.p.z + a.r.z * LANE * lane });
      (st.special.blocks = st.special.blocks || []).push({ s, lane });
    }
    st.special.cops = [];
    for (let i = 0; i < 3; i++) { const g = new THREE.Group(); const c = world.glossy(await world.model('car/police'), 0.3); c.scale.setScalar(1.22); g.add(c); const mk = (col, x) => { const b = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.24), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0 })); b.position.set(x, 1.72, -0.06); g.add(b); return b; }; const lights = [mk(0xFF2340, 0.27), mk(0x2F6BFF, -0.27)]; const pl = new THREE.PointLight(0xFF2340, 0, 16, 1.6); pl.position.set(0, 2.4, 0); g.add(pl); g.visible = false; root.add(g); st.special.cops.push({ g, lights, pl, s: -40, lat: LANE, v: 0, active: false, joinAt: [0.02, 0.33, 0.6][i] * tr.L, h: 0, x: 0, z: 0, hitT: 0 }); }
  }
  if (key === 'park') {
    // a row of parked cars along the right kerb, with one space between two supercars
    const slot = 104; const lat = W / 2 - 1.15; st.special.slot = { s: slot, lat };
    const parked = async (s, m, gloss = 0.35) => { const a = tr.at(s); const c = world.glossy(await world.model(m), gloss); c.scale.setScalar(1.22); c.position.copy(a.p).addScaledVector(a.r, lat); c.rotation.y = a.head; root.add(c); return c; };
    for (let s = 34; s < tr.L - 10; s += 6.8) { if (Math.abs(s - slot) < 10) continue; if (r() < 0.25) continue; const a = tr.at(s); await parked(s, TRAFFIC[Math.floor(r() * 4)]); const p = a.p.clone().addScaledVector(a.r, lat); solid(p.x - a.t.x * 1.1, p.z - a.t.z * 1.1, 0.85, 'parked'); solid(p.x + a.t.x * 1.1, p.z + a.t.z * 1.1, 0.85, 'parked'); }
    for (const [ds, m] of [[-5.6, 'car/sedan-sports'], [5.6, 'car/race-future']]) { const a = tr.at(slot + ds); const c = await parked(slot + ds, m, 0.18); c.traverse((o) => { if (o.isMesh && ds < 0) o.material.color?.offsetHSL(0.12, 0.2, 0.05); }); const p = a.p.clone().addScaledVector(a.r, lat); solid(p.x - a.t.x * 1.1, p.z - a.t.z * 1.1, 0.85, 'super'); solid(p.x + a.t.x * 1.1, p.z + a.t.z * 1.1, 0.85, 'super'); }
    // the space, painted on the road
    const a = tr.at(slot); const lineM = new THREE.MeshBasicMaterial({ color: 0xFFFFFF }); const box = new THREE.Group();
    for (const [w, d, x, z] of [[0.12, 7.6, -1.1, 0], [0.12, 7.6, 1.1, 0], [2.3, 0.12, 0, -3.8], [2.3, 0.12, 0, 3.8]]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), lineM); m.rotation.x = -Math.PI / 2; m.position.set(x, 0.05, z); box.add(m); }
    const pm = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.4), new THREE.MeshBasicMaterial({ map: bannerTex(world, 'P', '#4FB6FF'), transparent: true })); pm.rotation.x = -Math.PI / 2; pm.position.y = 0.06; box.add(pm);
    box.position.copy(a.p).addScaledVector(a.r, lat); box.rotation.y = a.head; root.add(box);
    marks.push({ k: 'slot', x: box.position.x, z: box.position.z });
    root.add(gate(world, tr, slot + 2, 'THE WEDDING'));
    // the venue itself, just beyond the space
    const v = await world.model('com/building-skyscraper-b'); v.scale.setScalar(6.5); const vp = a.p.clone().addScaledVector(a.r, W / 2 + 9); v.position.copy(vp); v.rotation.y = a.head - Math.PI / 2; root.add(v); solid(vp.x, vp.z, 4.5, 'building');
    st.finishS = null;
  }
  if (key === 'pit') {
    const s = tr.L - 46; const a = tr.at(s); st.special.pit = { s, lat: LANE };
    const canopy = new THREE.Group(); const red = new THREE.MeshStandardMaterial({ color: 0xE2453E, roughness: 0.4 }); const white = new THREE.MeshStandardMaterial({ color: 0xFFF6E9, roughness: 0.5 });
    const roof = new THREE.Mesh(new THREE.BoxGeometry(12, 0.8, 16), red); roof.position.y = 5.4; canopy.add(roof);
    const sign = new THREE.Mesh(new THREE.BoxGeometry(12.2, 0.9, 0.2), new THREE.MeshStandardMaterial({ map: bannerTex(world, 'PETROL', '#FFD23F') })); sign.position.set(0, 5.4, 8.15); canopy.add(sign); st.special.pit.roof = [roof, sign];
    for (const [x, z] of [[-5.4, -7], [5.4, -7], [-5.4, 7], [5.4, 7]]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 5.2, 10), white); p.position.set(x, 2.6, z); canopy.add(p); }
    for (const z of [-3, 3]) { const pump = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.8, 0.7), red); pump.position.set(4.6, 0.9, z); canopy.add(pump); const top = new THREE.Mesh(new THREE.BoxGeometry(1, 0.4, 0.8), white); top.position.set(4.6, 1.9, z); canopy.add(top); }
    canopy.position.copy(a.p).addScaledVector(a.r, LANE); canopy.rotation.y = a.head; canopy.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); root.add(canopy);
    const bm = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 5.6), new THREE.MeshBasicMaterial({ color: 0xFFD23F, transparent: true, opacity: 0.85 })); bm.rotation.x = -Math.PI / 2; bm.rotation.z = -a.head; bm.position.copy(a.p).addScaledVector(a.r, LANE).setY(0.05); root.add(bm);
    st.special.box = bm; marks.push({ k: 'pit', x: bm.position.x, z: bm.position.z }); st.finishS = null;
    // the pit crew: pawns that rush in when the car stops
    st.special.crew = []; for (let i = 0; i < 5; i++) { const pw = pawn([0xE2453E, 0xFFFFFF, 0xE2453E, 0x4FB6FF, 0xE2453E][i], 1.6); pw.position.copy(a.p).addScaledVector(a.r, LANE + 4.4).addScaledVector(a.t, (i - 2) * 1.4); pw.userData.home = pw.position.clone(); root.add(pw); st.special.crew.push(pw); }
  }
  if (key === 'jump') {
    // a ramp at the river; the bridge beyond it is broken
    const sR = tr.L * 0.66; const gap = 22; st.special.ramp = { s: sR, gap };
    const a = tr.at(sR); const stripes = world.canvasTex(64, 64, (g) => { for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#FFF6E9' : '#E2453E'; g.fillRect(0, i * 8, 64, 8); } }, true);
    const rg = new THREE.BufferGeometry(); const hw = W / 2 - 0.3; const len = 10; const hgt = 2.4;
    const v = [-hw, 0, -len, hw, 0, -len, -hw, hgt, 0, hw, hgt, 0, -hw, 0, 0, hw, 0, 0];
    rg.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); rg.setIndex([0, 2, 1, 1, 2, 3, 2, 4, 3, 3, 4, 5, 0, 4, 2, 1, 3, 5]); rg.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 1, 1, 0, 0, 1, 0], 2)); rg.computeVertexNormals();
    const ramp = new THREE.Mesh(rg, new THREE.MeshStandardMaterial({ map: stripes, roughness: 0.5, side: THREE.DoubleSide })); ramp.position.copy(a.p); ramp.rotation.y = a.head; ramp.castShadow = true; ramp.receiveShadow = true; root.add(ramp);
    // the river cuts across the road and the fields
    const b = tr.at(sR + gap / 2);
    const water = new THREE.Mesh(new THREE.PlaneGeometry(gap - 1.5, 700), new THREE.MeshStandardMaterial({ color: 0x2E8FD8, roughness: 0.12, metalness: 0.15, emissive: 0x0A3A6A, emissiveIntensity: 0.35 })); water.rotation.x = -Math.PI / 2; water.rotation.z = b.head - Math.PI / 2; water.position.copy(b.p).setY(0.06); water.receiveShadow = true; root.add(water);
    const edgeM = new THREE.MeshStandardMaterial({ color: 0xC9B48A, roughness: 1 });
    for (const ds of [0, gap]) { const c = tr.at(sR + ds); const e = new THREE.Mesh(new THREE.BoxGeometry(700, 0.25, 0.9), edgeM); e.position.copy(c.p).setY(0.1); e.rotation.y = c.head; root.add(e); }
    // the broken bridge: railings that stop at the edge
    const railM = new THREE.MeshStandardMaterial({ color: 0x8A8FA8, roughness: 0.6 });
    for (const [ds, len] of [[-12, 12], [gap, 10]]) for (const side of [-1, 1]) { const c = tr.at(sR + ds + len / 2); const rl = new THREE.Mesh(new THREE.BoxGeometry(0.25, 1, len), railM); rl.position.copy(c.p).addScaledVector(c.r, side * (W / 2 + 0.4)).setY(0.6); rl.rotation.y = c.head; root.add(rl); }
    st.special.cutGround = { s0: sR, s1: sR + gap };
    marks.push({ k: 'ramp', x: a.p.x, z: a.p.z });
  }
  if (st.finishS != null) { root.add(gate(world, tr, st.finishS, key === 'chase' ? 'SAFE!' : 'THE WEDDING', hfn)); marks.push({ k: 'finish', x: tr.at(st.finishS).p.x, z: tr.at(st.finishS).p.z }); }
  await Promise.all(jobs);
  world.bake(STATIC, root);
  // obstacles grid for quick collision checks
  const OG = 8; st.og = new Map(); for (const o of obstacles) { const k = `${Math.floor(o.x / OG)},${Math.floor(o.z / OG)}`; if (!st.og.has(k)) st.og.set(k, []); st.og.get(k).push(o); }
  st.near = (x, z) => { const out = []; const cx = Math.floor(x / OG); const cz = Math.floor(z / OG); for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const o of st.og.get(`${cx + a},${cz + b}`) || []) out.push(o); return out; };
  st.dispose = () => { world.scene.remove(root); world.disposeTree(root); };
  // what the phones draw: the road, and anything worth shouting about
  st.mapPts = tr.SP.filter((_, i) => i % 5 === 0).map((p) => [Math.round(p.x * 10) / 10, Math.round(p.z * 10) / 10]);
  return st;
}

export { makeCake, pawn };
