// Shotgun look test: one scripted run through a toy town, so the look can be judged before the real game is built.
// ?cap=1 turns off the clock: a recorder calls __look.step() once per frame and takes a picture.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { HorizontalTiltShiftShader } from 'three/addons/shaders/HorizontalTiltShiftShader.js';
import { VerticalTiltShiftShader } from 'three/addons/shaders/VerticalTiltShiftShader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const CAP = new URLSearchParams(location.search).has('cap');
const $ = (q) => document.querySelector(q);
const M = '/assets/sg/models/';
const W = 8; const LANE = 2.05; // road width, lane centre offset
let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrapA = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
const ease = (t) => (t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t));

// ------------------------------------------------------------------ renderer, light, post
const canvas = $('#gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(CAP ? 1 : Math.min(2, devicePixelRatio));
renderer.setSize(innerWidth, innerHeight, false);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.5, 900);
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.35;

function canvasTex(w, h, draw, repeat = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
const noise = (g, w, h, n, col, a) => { for (let i = 0; i < n; i++) { g.fillStyle = col(); g.globalAlpha = a; const s = 1 + rnd() * 3; g.fillRect(rnd() * w, rnd() * h, s, s); } g.globalAlpha = 1; };
scene.background = canvasTex(4, 256, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#5FB4F0'); gr.addColorStop(0.55, '#BFE0F2'); gr.addColorStop(1, '#FFD3A3'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }, false);
scene.fog = new THREE.Fog(0xF3D2AE, 110, 330);

const hemi = new THREE.HemisphereLight(0xCFE8FF, 0x7A9A4C, 0.62); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xFFD2A0, 3.3);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 140 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);

const rt = new THREE.WebGLRenderTarget(innerWidth, innerHeight, { samples: 4, type: THREE.HalfFloatType });
const composer = new EffectComposer(renderer, rt);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.32, 0.55, 0.92); composer.addPass(bloom);
// tilt-shift: sharp across the middle, soft at the top and bottom, like a photo of a model town
const hts = new ShaderPass(HorizontalTiltShiftShader); const vts = new ShaderPass(VerticalTiltShiftShader);
hts.uniforms.h.value = 2.2 / innerWidth; vts.uniforms.v.value = 2.2 / innerHeight; hts.uniforms.r.value = vts.uniforms.r.value = 0.52;
composer.addPass(hts); composer.addPass(vts);
composer.addPass(new OutputPass());
function resize() { const w = innerWidth; const h = innerHeight; renderer.setSize(w, h, false); composer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); hts.uniforms.h.value = 2.2 / w; vts.uniforms.v.value = 2.2 / h; }
addEventListener('resize', resize);

// ------------------------------------------------------------------ the track: one smooth loop
const PTS = [[0, -62], [44, -66], [82, -48], [96, -10], [84, 26], [52, 38], [30, 58], [-6, 70], [-48, 62], [-80, 34], [-86, -8], [-66, -46], [-34, -62]];
const curve = new THREE.CatmullRomCurve3(PTS.map(([x, z]) => new THREE.Vector3(x, 0, z)), true, 'centripetal');
const L = curve.getLength(); const N = 1400; const DS = L / N;
const SP = curve.getSpacedPoints(N); // N+1 points, last = first
const TAN = []; const HEAD = []; const CURV = [];
for (let i = 0; i <= N; i++) { const a = SP[(i - 1 + N) % N]; const b = SP[(i + 1) % N]; const t = new THREE.Vector3().subVectors(b, a).normalize(); TAN.push(t); HEAD.push(Math.atan2(t.x, t.z)); }
for (let i = 0; i <= N; i++) CURV.push(wrapA(HEAD[(i + 1) % N] - HEAD[(i - 1 + N) % N]) / (2 * DS));
const right = (t) => new THREE.Vector3(-t.z, 0, t.x);
function at(s) {
  const u = ((s % L) + L) % L / DS; const i = Math.floor(u) % N; const f = u - Math.floor(u);
  const p = SP[i].clone().lerp(SP[i + 1], f); const t = TAN[i].clone().lerp(TAN[i + 1], f).normalize();
  return { p, t, r: right(t), head: Math.atan2(t.x, t.z), k: lerp(CURV[i], CURV[(i + 1) % N], f) };
}
const kAhead = (s, d) => { let m = 0; for (let x = 0; x <= d; x += 2) m = Math.max(m, Math.abs(at(s + x).k)); return m; };
const insideLoop = (x, z) => { let inn = false; for (let i = 0, j = N - 1; i < N; j = i++) { const a = SP[i]; const b = SP[j]; if ((a.z > z) !== (b.z > z) && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) inn = !inn; } return inn; };
const roadDist = (x, z) => { let m = 1e9; for (let i = 0; i < N; i += 4) { const dx = SP[i].x - x; const dz = SP[i].z - z; m = Math.min(m, dx * dx + dz * dz); } return Math.sqrt(m); };

function ribbon(a, b, y, tex, vLen, opts = {}) {
  const pos = []; const uv = []; const idx = [];
  let s = 0;
  for (let i = 0; i <= N; i++) {
    const p = SP[i]; const r = right(TAN[i]);
    pos.push(p.x + r.x * a, y, p.z + r.z * a, p.x + r.x * b, y, p.z + r.z * b);
    uv.push(0, s / vLen, 1, s / vLen); s += DS;
    if (i < N) { const k = i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: tex, roughness: opts.rough ?? 0.9, side: THREE.DoubleSide }));
  m.receiveShadow = true; scene.add(m); return m;
}
function curb(off, h, w, col) { // a raised strip with a side wall, so it reads as a real kerb
  const pos = []; const uv = []; const idx = []; let s = 0;
  const o = [off, off, off + w, off + w]; const ys = [0, h, h, 0];
  for (let i = 0; i <= N; i++) { const p = SP[i]; const r = right(TAN[i]); for (let k = 0; k < 4; k++) { pos.push(p.x + r.x * o[k], ys[k], p.z + r.z * o[k]); uv.push(k / 3, s / 1.6); } s += DS; if (i < N) { const b = i * 4; for (let k = 0; k < 3; k++) idx.push(b + k, b + k + 4, b + k + 1, b + k + 1, b + k + 4, b + k + 5); } }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: col, roughness: 0.6, side: THREE.DoubleSide })); m.receiveShadow = true; m.castShadow = true; scene.add(m);
}

// ground, road, kerbs, pavement
const grass = canvasTex(512, 512, (g, w, h) => { g.fillStyle = '#7FBF4D'; g.fillRect(0, 0, w, h); noise(g, w, h, 5000, () => (rnd() < 0.5 ? '#6FAE40' : '#94CF5E'), 0.6); noise(g, w, h, 300, () => '#B9E07A', 0.8); });
grass.repeat.set(70, 70);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), new THREE.MeshStandardMaterial({ map: grass, roughness: 1 }));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
const asphalt = canvasTex(256, 1024, (g, w, h) => {
  g.fillStyle = '#4B4858'; g.fillRect(0, 0, w, h); noise(g, w, h, 9000, () => (rnd() < 0.5 ? '#423F4E' : '#58556A'), 0.7);
  g.fillStyle = '#F4EFE6'; g.fillRect(12, 0, 7, h); g.fillRect(w - 19, 0, 7, h);
  g.fillStyle = '#FFD23F'; g.fillRect(w / 2 - 5, 0, 10, h * 0.55);
});
ribbon(-W / 2, W / 2, 0.02, asphalt, 14, { rough: 0.85 });
const kerbTex = canvasTex(8, 64, (g, w, h) => { g.fillStyle = '#E2453E'; g.fillRect(0, 0, w, h / 2); g.fillStyle = '#FFF4E8'; g.fillRect(0, h / 2, w, h / 2); });
curb(W / 2, 0.14, 0.55, kerbTex); curb(-W / 2 - 0.55, 0.14, 0.55, kerbTex);
const paving = canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#E9DCC7'; g.fillRect(0, 0, w, h); g.strokeStyle = '#CDBEA6'; g.lineWidth = 3; for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32, h); g.stroke(); g.beginPath(); g.moveTo(0, i * 32); g.lineTo(w, i * 32); g.stroke(); } noise(g, w, h, 400, () => '#D8C9B0', 0.5); });
ribbon(W / 2 + 0.55, W / 2 + 3.4, 0.14, paving, 3); ribbon(-W / 2 - 3.4, -W / 2 - 0.55, 0.14, paving, 3);

// distant hills so the horizon isn't empty
for (let i = 0; i < 26; i++) {
  const a = (i / 26) * Math.PI * 2 + rnd() * 0.2; const d = 240 + rnd() * 60; const s = 30 + rnd() * 40;
  const hill = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 10), new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(0.27 + rnd() * 0.05, 0.42, 0.42 + rnd() * 0.08), roughness: 1, flatShading: true }));
  hill.position.set(Math.cos(a) * d, -s * 0.35, Math.sin(a) * d); hill.scale.set(s * 1.6, s * (0.55 + rnd() * 0.4), s * 1.3); scene.add(hill);
}

// ------------------------------------------------------------------ models
const loader = new GLTFLoader(); const cache = {};
async function model(path) { if (!cache[path]) cache[path] = loader.loadAsync(M + path + '.glb').then((g) => { g.scene.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); return g.scene; }); return (await cache[path]).clone(true); }
function glossy(obj, rough = 0.32) { obj.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.roughness = rough; o.material.metalness = 0.08; o.material.envMapIntensity = 1.2; } }); }

const SUB = ['a', 'b', 'c', 'd', 'f', 'h', 'k', 'l'].map((x) => `sub/building-type-${x}`);
const COM = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((x) => `com/building-${x}`);
const TALL = ['a', 'b', 'c'].map((x) => `com/building-skyscraper-${x}`);
// everything that never moves is merged into one mesh per texture: a few draw calls instead of hundreds
const STATIC = new THREE.Group();
function bake() {
  STATIC.updateMatrixWorld(true); const by = new Map();
  STATIC.traverse((o) => { if (!o.isMesh) return; let g = o.geometry.clone(); g.applyMatrix4(o.matrixWorld); if (g.index) g = g.toNonIndexed(); for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k); if (!g.attributes.uv) return; const key = o.material.uuid; if (!by.has(key)) by.set(key, { m: o.material, gs: [] }); by.get(key).gs.push(g); });
  for (const { m, gs } of by.values()) { const mesh = new THREE.Mesh(mergeGeometries(gs), m); mesh.castShadow = true; mesh.receiveShadow = true; scene.add(mesh); gs.forEach((g) => g.dispose()); }
}
async function dressTown() {
  const jobs = [];
  const place = (path, x, z, rotY, sc) => jobs.push(model(path).then((m) => { m.position.set(x, 0, z); m.rotation.y = rotY; m.scale.setScalar(sc); STATIC.add(m); return m; }));
  // buildings along the outside of the loop, facing the road
  for (let s = 4; s < L; s += 8.5) {
    const a = at(s); if (Math.abs(a.k) > 0.035) continue;
    for (const side of [1, -1]) {
      const off = W / 2 + 3.4 + 3.6; const x = a.p.x + a.r.x * off * side; const z = a.p.z + a.r.z * off * side;
      if (roadDist(x, z) < off - 0.6) continue;
      const face = Math.atan2(-a.r.x * side, -a.r.z * side);
      if (insideLoop(x, z)) { if (rnd() < 0.55) place(rnd() < 0.5 ? 'toy/tree' : 'sub/tree-large', x + (rnd() - 0.5) * 2, z + (rnd() - 0.5) * 2, rnd() * 6, rnd() < 0.5 ? 4.2 : 6.5); continue; }
      const commercial = s > L * 0.42;
      place(commercial ? COM[Math.floor(rnd() * COM.length)] : SUB[Math.floor(rnd() * SUB.length)], x, z, face, commercial ? 5.2 : 4.8);
      if (!commercial && rnd() < 0.5) { const t = 2.6; place('sub/tree-small', x + a.t.x * t * 1.6, z + a.t.z * t * 1.6, rnd() * 6, 5); }
      // tall ones behind, as a skyline
      if (rnd() < 0.5) { const o2 = off + 14 + rnd() * 10; const x2 = a.p.x + a.r.x * o2 * side; const z2 = a.p.z + a.r.z * o2 * side; if (!insideLoop(x2, z2) && roadDist(x2, z2) > 14) place(commercial ? TALL[Math.floor(rnd() * 3)] : SUB[Math.floor(rnd() * SUB.length)], x2, z2, face, commercial ? 6 + rnd() * 2 : 5); }
    }
  }
  // front gardens: hedges and flower beds along the outside of the pavement
  const hedge = new THREE.MeshStandardMaterial({ color: 0x4E9A3A, roughness: 0.9, flatShading: true });
  const petals = [0xFF6FA3, 0xFFD23F, 0xFFFFFF, 0xB98CFF, 0xFF8A3D].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7 }));
  const bushG = new THREE.IcosahedronGeometry(1, 0); const flowerG = new THREE.SphereGeometry(0.16, 6, 4);
  for (let s = 2; s < L; s += 3.1) { const a = at(s); for (const side of [1, -1]) {
    const off = W / 2 + 3.4 + 0.9 + rnd() * 0.5; const x = a.p.x + a.r.x * off * side; const z = a.p.z + a.r.z * off * side;
    if (roadDist(x, z) < off - 0.5) continue;
    if (rnd() < 0.55) { const b = new THREE.Mesh(bushG, hedge); b.position.set(x, 0.35, z); b.scale.set(0.8 + rnd() * 0.5, 0.55 + rnd() * 0.35, 0.8 + rnd() * 0.5); b.rotation.y = rnd() * 6; STATIC.add(b); }
    else { const pm = petals[Math.floor(rnd() * petals.length)]; for (let k = 0; k < 7; k++) { const f = new THREE.Mesh(flowerG, pm); f.position.set(x + (rnd() - 0.5) * 1.6, 0.12, z + (rnd() - 0.5) * 1.6); STATIC.add(f); } }
  } }
  // street lights on both pavements
  for (let s = 0; s < L; s += 17) { const a = at(s); for (const side of [1, -1]) { const off = W / 2 + 2.9; place('roads/light-curved', a.p.x + a.r.x * off * side, a.p.z + a.r.z * off * side, Math.atan2(a.r.x * side, a.r.z * side) + Math.PI, 5.2); } }
  // a park in the middle of the loop
  for (let i = 0; i < 140; i++) { const x = -80 + rnd() * 170; const z = -60 + rnd() * 125; if (!insideLoop(x, z) || roadDist(x, z) < 9) continue; place(rnd() < 0.5 ? 'toy/tree-pine' : rnd() < 0.5 ? 'toy/tree' : 'sub/tree-large', x, z, rnd() * 6, 3.6 + rnd() * 3.2); }
  // more trees scattered outside
  for (let i = 0; i < 160; i++) { const a = rnd() * Math.PI * 2; const d = 110 + rnd() * 100; const x = Math.cos(a) * d; const z = Math.sin(a) * d * 0.8; if (insideLoop(x, z) || roadDist(x, z) < 22) continue; place(rnd() < 0.6 ? 'toy/tree-pine' : 'sub/tree-large', x, z, rnd() * 6, 4 + rnd() * 4); }
  await Promise.all(jobs);
}

// ------------------------------------------------------------------ the cake: five tiers on springs
function makeCake() {
  const g = new THREE.Group(); const tiers = [];
  const icing = new THREE.MeshStandardMaterial({ color: 0xFFF7EC, roughness: 0.5, envMapIntensity: 0.6 });
  const pink = new THREE.MeshStandardMaterial({ color: 0xFF7FAA, roughness: 0.45 });
  const pearl = new THREE.MeshStandardMaterial({ color: 0xFFFFFF, roughness: 0.2, metalness: 0.1 });
  const R = [0.47, 0.39, 0.31, 0.24, 0.17]; const H = [0.25, 0.23, 0.21, 0.19, 0.17];
  let parent = g; let y = 0;
  R.forEach((r, i) => {
    const t = new THREE.Group(); t.position.y = i === 0 ? 0 : H[i - 1]; parent.add(t);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r, H[i], 32), icing); body.position.y = H[i] / 2; t.add(body);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(r, 0.03, 8, 32), icing); rim.rotation.x = Math.PI / 2; rim.position.y = H[i]; t.add(rim);
    const n = 10 + i * 0; for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2; const p = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 6), pearl); p.position.set(Math.cos(a) * r, 0.03, Math.sin(a) * r); t.add(p); }
    if (i === 0 || i === 2) { const band = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.005, r + 0.005, 0.05, 32), pink); band.position.y = H[i] * 0.45; t.add(band); }
    if (i === 1 || i === 3) for (let k = 0; k < 3; k++) { const a = k * 2.1 + i; const rose = new THREE.Mesh(new THREE.IcosahedronGeometry(0.06, 1), pink); rose.position.set(Math.cos(a) * (r - 0.02), H[i] + 0.02, Math.sin(a) * (r - 0.02)); t.add(rose); }
    t.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    tiers.push({ g: t, x: 0, z: 0, vx: 0, vz: 0 }); parent = t; y += H[i];
  });
  // a gold topper
  const top = new THREE.Mesh(new THREE.TorusKnotGeometry(0.05, 0.016, 48, 8), new THREE.MeshStandardMaterial({ color: 0xFFC94A, metalness: 0.8, roughness: 0.25, emissive: 0x332200 }));
  top.position.y = H[4] + 0.1; tiers[4].g.add(top);
  return { g, tiers };
}

// ------------------------------------------------------------------ particles: smoke, sparks, icing, nitro, confetti
const dot = canvasTex(64, 64, (g, w) => { const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.5, 'rgba(255,255,255,.6)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, w, w); }, false);
const sq = canvasTex(8, 8, (g) => { g.fillStyle = '#fff'; g.fillRect(0, 0, 8, 8); }, false);
const parts = [];
function emit(o) {
  const mat = new THREE.SpriteMaterial({ map: o.square ? sq : dot, color: o.color, transparent: true, depthWrite: false, opacity: o.alpha ?? 1, blending: o.add ? THREE.AdditiveBlending : THREE.NormalBlending, fog: true });
  const sp = new THREE.Sprite(mat); sp.position.copy(o.p); sp.scale.setScalar(o.s0); scene.add(sp);
  parts.push({ sp, v: o.v.clone(), life: o.life, age: 0, s0: o.s0, s1: o.s1 ?? o.s0, a: o.alpha ?? 1, grav: o.grav || 0, drag: o.drag ?? 0.9, rot: o.rot || 0 });
}
function stepParts(dt) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i]; p.age += dt; const f = p.age / p.life;
    if (f >= 1) { scene.remove(p.sp); p.sp.material.dispose(); parts.splice(i, 1); continue; }
    p.v.y += p.grav * dt; p.v.multiplyScalar(Math.pow(p.drag, dt * 10)); p.sp.position.addScaledVector(p.v, dt);
    if (p.sp.position.y < 0.05 && p.grav < 0) { p.sp.position.y = 0.05; p.v.y *= -0.3; p.v.x *= 0.6; p.v.z *= 0.6; }
    p.sp.scale.setScalar(lerp(p.s0, p.s1, f)); p.sp.material.opacity = p.a * (1 - f) * (1 - f * 0.2); p.sp.material.rotation += p.rot * dt;
  }
}
// skid marks: dark dashes left on the road while sliding
const SKIDS = 2400; const skidMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.2, 0.42), new THREE.MeshBasicMaterial({ color: 0x1C1A22, transparent: true, opacity: 0.42, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), SKIDS);
skidMesh.count = 0; skidMesh.frustumCulled = false; scene.add(skidMesh); let skidN = 0;
const _m = new THREE.Matrix4(); const _q = new THREE.Quaternion(); const _e = new THREE.Euler();
function skid(p, yaw) { _e.set(-Math.PI / 2, 0, -yaw); _q.setFromEuler(_e); _m.compose(new THREE.Vector3(p.x, 0.035, p.z), _q, new THREE.Vector3(1, 1, 1)); skidMesh.setMatrixAt(skidN % SKIDS, _m); skidN++; skidMesh.count = Math.min(SKIDS, skidN); skidMesh.instanceMatrix.needsUpdate = true; }

// ------------------------------------------------------------------ the script
// car speed: a pure function of time and position, so the run can be worked out in advance
const T_GO = 3; const T_NITRO = [13.4, 15.6]; const T_END = 19.4; const T_STOP = 21.5;
function targetSpeed(T, s, crashAt) {
  if (T < T_GO) return 0;
  if (T > T_END) return 0;
  if (crashAt != null && T - crashAt < 1.1) return 7;
  const nitro = T > T_NITRO[0] && T < T_NITRO[1];
  const k = kAhead(s, 22); const corner = Math.sqrt(30 / Math.max(k, 1e-4)) * 1.18;
  return Math.min(nitro ? 36 : 24, nitro ? corner * 1.25 : corner);
}
function speedStep(st, T, dt, crashAt) { const tv = targetSpeed(T, st.s, crashAt); const dv = tv - st.v; st.v += clamp(dv, -26 * dt, (T > T_NITRO[0] && T < T_NITRO[1] ? 22 : 11) * dt); st.v = Math.max(0, st.v); st.s += st.v * dt; }
const S0 = 6; // start a little way along the loop
const PRE = (() => { const st = { s: S0, v: 0 }; const out = []; for (let i = 0; i <= 30 * 22; i++) { out.push(st.s); speedStep(st, i / 30, 1 / 30, null); } return (T) => out[Math.min(out.length - 1, Math.round(T * 30))]; })();
const S_CRASH = PRE(11.0) + 3;
const ONCOMING = [{ m: 'car/taxi', tm: 9.0, v: 15 }, { m: 'car/van', tm: 5.4, v: 14 }, { m: 'car/sedan', tm: 7.3, v: 16 }, { m: 'car/suv', tm: 12.8, v: 13 }, { m: 'car/truck', tm: 16.2, v: 12 }, { m: 'car/sedan-sports', tm: 18.2, v: 16 }];

// ------------------------------------------------------------------ build it
const world = { T: 0, vt: 0, frame: 0, events: [], st: { s: S0, v: 0 }, crashAt: null, cakeHP: 100, shake: 0, fov: 40, slow: 1, lastScreech: -9, driftT: 0, hornAt: -9, ready: false };
const ev = (name, vol = 1) => world.events.push({ t: +world.vt.toFixed(3), name, vol });
let hero; let cake; let police; let polL; const traffic = []; const cones = [];
async function build() {
  await dressTown();
  hero = new THREE.Group(); const car = await model('car/hatchback-red'); glossy(car, 0.28); car.scale.setScalar(1.22); hero.add(car); hero.userData.car = car;
  hero.userData.wheels = {}; car.traverse((o) => { if (/^wheel-/.test(o.name)) hero.userData.wheels[o.name] = o; });
  cake = makeCake(); cake.g.position.set(0, 0.55, -0.62); car.add(cake.g);
  scene.add(hero);
  police = new THREE.Group(); const pc = await model('car/police'); glossy(pc, 0.3); pc.scale.setScalar(1.22); police.add(pc); police.visible = false; scene.add(police);
  const mk = (c, x) => { const b = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.12, 0.2), new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0 })); b.position.set(x, 1.42, -0.05); pc.add(b); const l = new THREE.PointLight(c, 0, 14, 1.6); l.position.set(x * 2, 1.9, 0); pc.add(l); return { b, l }; };
  polL = [mk(0xFF2340, 0.22), mk(0x2F6BFF, -0.22)];
  for (const o of ONCOMING) { const g = new THREE.Group(); const m = await model(o.m).catch(() => model('car/sedan')); glossy(m, 0.35); m.scale.setScalar(1.22); g.add(m); scene.add(g); traffic.push({ ...o, g, s0: PRE(o.tm) + o.v * o.tm }); }
  // parked cars by the kerb
  for (const [s, m] of [[60, 'car/suv'], [140, 'car/van'], [230, 'car/sedan'], [300, 'car/taxi']]) { const a = at(s); const c = await model(m); glossy(c, 0.35); c.scale.setScalar(1.22); c.position.copy(a.p).addScaledVector(a.r, -W / 2 - 1.6); c.position.y = 0.14; c.rotation.y = a.head + Math.PI; STATIC.add(c); }
  // roadworks: the cones the car is going to hit
  const a = at(S_CRASH);
  for (let i = 0; i < 6; i++) { const c = await model('car/cone'); c.scale.setScalar(1.5); const off = LANE + (i % 3 - 1) * 1.0; c.position.copy(a.p).addScaledVector(a.r, off).addScaledVector(a.t, Math.floor(i / 3) * 1.6); scene.add(c); cones.push({ m: c, v: new THREE.Vector3(), w: new THREE.Vector3(), hit: false }); }
  const bar = await model('roads/construction-barrier'); bar.scale.setScalar(4.2); bar.position.copy(a.p).addScaledVector(a.r, W / 2 + 1.6).addScaledVector(a.t, -2); bar.rotation.y = a.head + Math.PI / 2; STATIC.add(bar);
  for (const s of [S_CRASH - 70, S_CRASH + 120]) { const b = at(s); const tl = await model('roads/traffic-light'); tl.scale.setScalar(5); tl.position.copy(b.p).addScaledVector(b.r, W / 2 + 1.2); tl.rotation.y = b.head + Math.PI; STATIC.add(tl); }
  bake();
  buildHud();
  world.ready = true;
}

// ------------------------------------------------------------------ HUD
const JOBS = [{ n: 'Vishnu', j: 'Gas', b: 1, c: '#3ED6A0' }, { n: 'Ahmed', j: 'Left', b: 5, c: '#4FB6FF' }, { n: 'Bella', j: 'Right', b: 9, c: '#FFD23F' }, { n: 'Carlos', j: 'Brake', b: 12, c: '#FF6B5A' }, { n: 'Dina', j: 'Horn', b: 17, c: '#C58BFF' }, { n: 'Erik', j: 'Nitro', b: 20, c: '#FF8A3D' }];
function buildHud() { $('#jobs').innerHTML = JOBS.map((p, i) => `<div class="job" id="job${i}" style="--c:${p.c}"><img src="/assets/img/bust-${String(p.b).padStart(2, '0')}.webp" alt=""><div><b>${p.j}</b><small>${p.n}</small></div></div>`).join(''); }
const CALLS = [{ t: [3.7, 7.8], img: 'panic', text: 'The bride is crying. WHERE IS THE CAKE?' }, { t: [11.5, 14.6], img: 'furious', text: 'WHAT WAS THAT NOISE?!' }, { t: [17.2, 20.6], img: 'relieved', text: 'Is it... still a cake? Oh, thank God.' }];
let lastCall = -1; let lastCount = '';
function hud(T, info) {
  const title = $('#title'); title.classList.toggle('gone', T > T_GO + 0.3);
  const c = T < 0.4 ? '' : T < 1.2 ? '3' : T < 2.0 ? '2' : T < 2.8 ? '1' : T < 3.6 ? 'GO!' : '';
  if (c !== lastCount) { lastCount = c; $('#count').textContent = c; }
  $('#stage').style.opacity = T > T_GO ? 1 : 0;
  const left = Math.max(0, 45 - Math.max(0, T - T_GO)); $('#clock').textContent = `0:${String(Math.ceil(left)).padStart(2, '0')}`;
  const ci = CALLS.findIndex((x) => T >= x.t[0] && T < x.t[1]);
  if (ci !== lastCall) { lastCall = ci; const box = $('#call'); if (ci >= 0) { $('#dolly').src = `/assets/img/t-sg-dolly-${CALLS[ci].img}.webp`; $('#callText').textContent = CALLS[ci].text; box.classList.add('on', 'ring'); ev('sg-ring', 0.6); } else box.classList.remove('on', 'ring'); }
  if (ci >= 0 && T - CALLS[ci].t[0] > 0.9) $('#call').classList.remove('ring');
  $('#cakebar').style.width = `${world.cakeHP}%`; $('#cakepct').textContent = `${Math.round(world.cakeHP)}%`; $('#cake').classList.toggle('low', world.cakeHP < 60);
  const on = [info.gas, info.left, info.right, info.brake, T - world.hornAt < 0.9, T > T_NITRO[0] && T < T_NITRO[1]];
  on.forEach((v, i) => $(`#job${i}`)?.classList.toggle('on', !!v));
  $('#clear').classList.toggle('on', T > T_END + 0.3);
}
function pop(html) { const p = $('#pop'); p.innerHTML = html; p.classList.remove('on'); void p.offsetWidth; p.classList.add('on'); }

// ------------------------------------------------------------------ one tick
const prev = { pos: new THREE.Vector3(), vel: new THREE.Vector3(), yaw: 0, init: false };
const camPos = new THREE.Vector3(); const camLook = new THREE.Vector3(); let camInit = false;
function step(dtv, noRender = false) {
  if (!world.ready) return;
  // slow motion for a second after the crash
  const slow = world.crashAt != null ? (() => { const d = world.T - world.crashAt; return d < 0.05 ? 1 : d < 0.55 ? 0.28 : d < 0.9 ? lerp(0.28, 1, (d - 0.55) / 0.35) : 1; })() : 1;
  const dt = dtv * slow; world.vt += dtv; world.T += dt; const T = world.T;
  const st = world.st; const v0 = st.v; speedStep(st, T, dt, world.crashAt);
  if (T >= T_GO && T - dt < T_GO) ev('sg-rev', 0.9);
  if (T >= T_NITRO[0] && T - dt < T_NITRO[0]) { ev('sg-nitro', 1); pop('NITRO!'); }
  if (T >= T_END && T - dt < T_END) { ev('sg-cheer', 0.8); ev('sg-win', 0.7); }
  const a = at(st.s);
  // drift: the nose swings into the corner, harder the faster you go
  const lat = a.k * st.v * st.v; const drift = clamp(a.k * st.v * st.v * 0.012, -0.42, 0.42);
  const pos = a.p.clone().addScaledVector(a.r, LANE); pos.y = 0.02;
  hero.position.copy(pos); hero.rotation.y = a.head + drift;
  const car = hero.userData.car; car.rotation.z = clamp(-lat * 0.0016, -0.07, 0.07); car.rotation.x = clamp(-(st.v - v0) / Math.max(dt, 1e-4) * 0.0018, -0.06, 0.06);
  for (const [n, w] of Object.entries(hero.userData.wheels)) { w.rotation.x += st.v * dt / 0.3; if (/front/.test(n)) w.rotation.y = clamp(a.k * 7, -0.45, 0.45); }
  // the cake: springs pushed around by the car's acceleration
  if (prev.init && dt > 0) {
    const vel = pos.clone().sub(prev.pos).divideScalar(dt); const acc = vel.clone().sub(prev.vel).divideScalar(dt); prev.vel.copy(vel);
    const yaw = hero.rotation.y; const ax = acc.x * Math.cos(yaw) - acc.z * Math.sin(yaw); const az = acc.x * Math.sin(yaw) + acc.z * Math.cos(yaw);
    cake.tiers.forEach((t, i) => {
      const gain = 0.0016 * (1 + i * 0.5); const kk = 90 - i * 8; const c = 5;
      t.vx += (-kk * t.x - c * t.vx - ax * gain * 60) * dt; t.vz += (-kk * t.z - c * t.vz - az * gain * 60) * dt;
      t.x = clamp(t.x + t.vx * dt, -0.09, 0.09); t.z = clamp(t.z + t.vz * dt, -0.09, 0.09);
      t.g.position.x = t.x + (i === 4 && world.crashAt != null ? 0.05 : 0); t.g.position.z = t.z;
      t.g.rotation.z = -t.x * 1.8 + (i >= 3 && world.crashAt != null ? -0.12 : 0); t.g.rotation.x = t.z * 1.8;
    });
    if (Math.abs(lat) > 11 && st.v > 9) { world.driftT += dt; if (world.driftT > 0.45) { world.driftT = 0; world.cakeHP = Math.max(0, world.cakeHP - 0.6); } }
  }
  prev.pos.copy(pos); prev.init = true;
  // tyre smoke and skid marks while sliding
  const sliding = Math.abs(lat) > 13 && st.v > 9;
  if (sliding) {
    if (T - world.lastScreech > 1.6) { world.lastScreech = T; ev('sg-screech', 0.8); }
    for (const sx of [-0.5, 0.5]) {
      const wp = new THREE.Vector3(sx, 0, -0.85).applyAxisAngle(new THREE.Vector3(0, 1, 0), hero.rotation.y).add(pos);
      skid(wp, hero.rotation.y);
      if (rnd() < 0.7) emit({ p: wp.clone().setY(0.25), v: new THREE.Vector3((rnd() - 0.5) * 2, 0.8 + rnd(), (rnd() - 0.5) * 2), life: 1.3, s0: 0.5, s1: 2.6, color: 0xF3ECE2, alpha: 0.5, drag: 0.8 });
    }
  }
  // dust behind the wheels at speed
  if (st.v > 14 && rnd() < 0.25) { const wp = new THREE.Vector3((rnd() - 0.5), 0.2, -1.4).applyAxisAngle(new THREE.Vector3(0, 1, 0), hero.rotation.y).add(pos); emit({ p: wp, v: new THREE.Vector3(0, 0.4, 0), life: 0.8, s0: 0.3, s1: 1.2, color: 0xEADBC5, alpha: 0.35 }); }
  // nitro flames
  if (T > T_NITRO[0] && T < T_NITRO[1]) for (let i = 0; i < 3; i++) { const fwd = new THREE.Vector3(Math.sin(hero.rotation.y), 0, Math.cos(hero.rotation.y)); const ex = new THREE.Vector3(0.3, 0.32, -1.5).applyAxisAngle(new THREE.Vector3(0, 1, 0), hero.rotation.y).add(pos); emit({ p: ex, v: fwd.clone().multiplyScalar(-6 - rnd() * 4).add(new THREE.Vector3((rnd() - 0.5), rnd() * 0.5, (rnd() - 0.5))), life: 0.28, s0: 0.55, s1: 0.1, color: rnd() < 0.5 ? 0x6FD6FF : 0xFF8A3D, add: true }); }
  // the crash
  if (world.crashAt == null && st.s >= S_CRASH - 1.2) {
    world.crashAt = T; world.shake = 1; ev('sg-crash', 1); ev('sg-splat', 0.9); ev('sg-wobble', 0.9);
    world.cakeHP = Math.max(0, world.cakeHP - 12); $('#cake').classList.add('hit'); setTimeout(() => $('#cake').classList.remove('hit'), 600);
    pop('BUMP!<small>Cake -12%</small>');
    const fwd = new THREE.Vector3(Math.sin(hero.rotation.y), 0, Math.cos(hero.rotation.y));
    for (const c of cones) { c.hit = true; c.v.copy(fwd).multiplyScalar(9 + rnd() * 6).add(new THREE.Vector3((rnd() - 0.5) * 7, 5 + rnd() * 5, (rnd() - 0.5) * 7)); c.w.set(rnd() * 12 - 6, rnd() * 12 - 6, rnd() * 12 - 6); }
    const front = pos.clone().addScaledVector(fwd, 1.4).setY(0.5);
    for (let i = 0; i < 46; i++) emit({ p: front, v: new THREE.Vector3((rnd() - 0.5) * 12, 2 + rnd() * 6, (rnd() - 0.5) * 12).addScaledVector(fwd, 4), life: 0.5 + rnd() * 0.4, s0: 0.14, s1: 0.05, color: 0xFFC24A, add: true, grav: -16, drag: 0.95 });
    const top = new THREE.Vector3(0, 1.4, -0.6).applyAxisAngle(new THREE.Vector3(0, 1, 0), hero.rotation.y).add(pos);
    for (let i = 0; i < 26; i++) emit({ p: top, v: new THREE.Vector3((rnd() - 0.5) * 5, 2 + rnd() * 4, (rnd() - 0.5) * 5).addScaledVector(fwd, 3), life: 0.9 + rnd() * 0.5, s0: 0.22, s1: 0.16, color: rnd() < 0.75 ? 0xFFF7EC : 0xFF7FAA, grav: -12, drag: 0.92 });
    for (let i = 0; i < 18; i++) emit({ p: front.clone().setY(0.4), v: new THREE.Vector3((rnd() - 0.5) * 4, 1 + rnd() * 2, (rnd() - 0.5) * 4), life: 1.4, s0: 0.8, s1: 3.2, color: 0xEDE4D8, alpha: 0.55, drag: 0.75 });
  }
  for (const c of cones) if (c.hit) { c.v.y -= 22 * dt; c.m.position.addScaledVector(c.v, dt); c.m.rotation.x += c.w.x * dt; c.m.rotation.z += c.w.z * dt; if (c.m.position.y < 0) { c.m.position.y = 0; c.v.multiplyScalar(0.45); c.v.y = Math.abs(c.v.y) * 0.4; c.w.multiplyScalar(0.6); } }
  // horn when the taxi comes the other way
  if (T > 8.55 && T - dt <= 8.55) { world.hornAt = T; ev('sg-horn', 1); }
  // oncoming traffic
  for (const o of traffic) { const s = o.s0 - o.v * T; const b = at(s); o.g.position.copy(b.p).addScaledVector(b.r, -LANE); o.g.position.y = 0.02; o.g.rotation.y = b.head + Math.PI; }
  // the police: closing in, then left behind by the nitro
  if (T > 5.6) {
    if (!police.visible) { police.visible = true; ev('sg-siren', 0.55); }
    let gap = Math.max(9, 34 - (T - 5.6) * 4.8); if (T > T_NITRO[0]) gap += Math.min(50, (T - T_NITRO[0]) * 9);
    const b = at(st.s - gap); police.position.copy(b.p).addScaledVector(b.r, LANE * 0.6); police.position.y = 0.02; police.rotation.y = b.head + clamp(b.k * 20 * 0.4, -0.3, 0.3);
    const on = Math.floor(world.vt * 7) % 2; polL[0].l.intensity = on ? 40 : 0; polL[1].l.intensity = on ? 0 : 40; polL[0].b.material.emissiveIntensity = on ? 4 : 0.2; polL[1].b.material.emissiveIntensity = on ? 0.2 : 4;
    if (Math.floor((T - 5.6) / 5.2) !== Math.floor((T - dt - 5.6) / 5.2) && T < T_END) ev('sg-siren', 0.45);
  }
  stepParts(dt);
  // camera: a crane shot to start, then behind the car; a close side shot for the crash; wider for nitro
  const fwd = new THREE.Vector3(Math.sin(a.head), 0, Math.cos(a.head)); const rgt = a.r.clone();
  let want = pos.clone().addScaledVector(fwd, -8.6).addScaledVector(rgt, 1.2).add(new THREE.Vector3(0, 4.6, 0));
  let look = pos.clone().addScaledVector(fwd, 5).add(new THREE.Vector3(0, 0.9, 0));
  let fov = 40; let speed = 3.2;
  if (T < T_GO + 0.6) { const f = ease(T / (T_GO + 0.6)); const crane = pos.clone().addScaledVector(fwd, -26).addScaledVector(rgt, 9).add(new THREE.Vector3(0, 22, 0)); want = crane.lerp(want, f); look = pos.clone().add(new THREE.Vector3(0, 0.5, 0)).lerp(look, f); speed = 20; }
  const cd = world.crashAt != null ? T - world.crashAt : 99;
  if (cd < 1.3) { const f = cd < 0.9 ? 1 : 1 - (cd - 0.9) / 0.4; const side = pos.clone().addScaledVector(rgt, 6.5).addScaledVector(fwd, 3.5).add(new THREE.Vector3(0, 2.6, 0)); want.lerp(side, f); look.lerp(pos.clone().add(new THREE.Vector3(0, 1, 0)), f); speed = 6; fov = lerp(40, 34, f); }
  if (T > T_NITRO[0] && T < T_NITRO[1] + 0.6) { const f = Math.min(1, (T - T_NITRO[0]) * 3) * (T > T_NITRO[1] ? 1 - (T - T_NITRO[1]) / 0.6 : 1); fov = lerp(fov, 54, f); want.addScaledVector(fwd, -3 * f).add(new THREE.Vector3(0, -1.4 * f, 0)); }
  if (T > T_END) { const f = ease((T - T_END) / 1.8); want.lerp(pos.clone().addScaledVector(fwd, 7).addScaledVector(rgt, -5).add(new THREE.Vector3(0, 4.5, 0)), f); look.lerp(pos.clone().add(new THREE.Vector3(0, 1, 0)), f); }
  if (!camInit) { camPos.copy(want); camLook.copy(look); camInit = true; }
  const k = 1 - Math.exp(-dtv * speed); camPos.lerp(want, k); camLook.lerp(look, Math.min(1, k * 1.6));
  world.shake *= Math.exp(-dtv * 4.5);
  camera.position.copy(camPos).add(new THREE.Vector3((rnd() - 0.5), (rnd() - 0.5), (rnd() - 0.5)).multiplyScalar(world.shake * 0.9));
  camera.lookAt(camLook); world.fov = lerp(world.fov, fov, 1 - Math.exp(-dtv * 5)); camera.fov = world.fov; camera.updateProjectionMatrix();
  // the sun and its shadows follow the action
  sun.position.copy(pos).add(new THREE.Vector3(34, 46, 20)); sun.target.position.copy(pos);
  // end of the stage: confetti
  if (T > T_END + 0.3 && T < T_END + 1.6) for (let i = 0; i < 4; i++) emit({ p: pos.clone().add(new THREE.Vector3((rnd() - 0.5) * 8, 6 + rnd() * 3, (rnd() - 0.5) * 8)), v: new THREE.Vector3((rnd() - 0.5) * 2, -1 - rnd(), (rnd() - 0.5) * 2), life: 2.2, s0: 0.22, s1: 0.22, color: [0xFF4F8B, 0xFFD23F, 0x3ED6A0, 0x4FB6FF][Math.floor(rnd() * 4)], square: true, grav: -2, drag: 0.98, rot: 6 });
  hud(T, { gas: st.v > v0 + 0.001 && T > T_GO, brake: st.v < v0 - 26 * dt * 0.3, left: a.k > 0.012 && st.v > 2, right: a.k < -0.012 && st.v > 2 });
  if (CAP) for (const an of document.getAnimations()) { an.pause(); an.currentTime = (an.currentTime || 0) + dtv * 1000; }
  if (!noRender) composer.render();
  world.frame++;
}

window.__look = { step, world, renderer, composer, bloom, hts, vts, sun, rt, finish: () => { const gl = renderer.getContext(); const px = new Uint8Array(4); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); return px[0]; }, ready: build().then(() => { step(1 / 30); return true; }) };
if (!CAP) {
  let last = performance.now();
  window.__look.ready.then(() => { const loop = (now) => { const dt = Math.min(1 / 20, (now - last) / 1000); last = now; step(dt); if (world.T > T_STOP + 1.5) location.reload(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
}
