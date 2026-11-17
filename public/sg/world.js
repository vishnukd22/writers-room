// Shotgun's 3D world: renderer, lights, the colour grade, models, textures, particles, skid marks and the cake.
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

export { THREE };
export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const wrapA = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
export const ease = (t) => (t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t));
export function rng(seed) { let s = (Math.abs(Math.floor(seed)) % 2147483646) + 1; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }

// richer colour and contrast, applied last, on the finished picture
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, sat: { value: 1.3 }, con: { value: 1.14 }, warm: { value: 0.02 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float sat; uniform float con; uniform float warm; varying vec2 vUv;
    void main(){ vec4 c = texture2D(tDiffuse, vUv); float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      vec3 g = mix(vec3(l), c.rgb, sat); g = (g - 0.5) * con + 0.5; g.r += warm; g.b -= warm * 0.6;
      vec2 d = vUv - 0.5; float vig = 1.0 - dot(d, d) * 0.55; gl_FragColor = vec4(clamp(g * vig, 0.0, 1.0), c.a); }`,
};

export function createWorld(canvas, opts = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  const pr = opts.pixelRatio ?? Math.min(1.5, devicePixelRatio);
  renderer.setPixelRatio(pr); renderer.setSize(innerWidth, innerHeight, false);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.4, 900);
  const envTex = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTex; scene.environmentIntensity = 0.32;
  const hemi = new THREE.HemisphereLight(0xCFE8FF, 0x7A9A4C, 0.6); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xFFD2A0, 3.3); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -32, right: 32, top: 32, bottom: -32, near: 1, far: 150 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03; scene.add(sun, sun.target);

  const rt = new THREE.WebGLRenderTarget(innerWidth * pr, innerHeight * pr, { samples: 4, type: THREE.HalfFloatType });
  const composer = new EffectComposer(renderer, rt);
  composer.setPixelRatio(pr);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.3, 0.55, 0.9); composer.addPass(bloom);
  const hts = new ShaderPass(HorizontalTiltShiftShader); const vts = new ShaderPass(VerticalTiltShiftShader);
  hts.uniforms.r.value = vts.uniforms.r.value = 0.52; composer.addPass(hts); composer.addPass(vts);
  composer.addPass(new OutputPass());
  const grade = new ShaderPass(GradeShader); composer.addPass(grade);
  const tilt = (amt) => { hts.uniforms.h.value = amt / innerWidth; vts.uniforms.v.value = amt / innerHeight; };
  tilt(2.2);
  function resize() { const w = innerWidth; const h = innerHeight; renderer.setSize(w, h, false); composer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); tilt(hts.__amt || 2.2); }
  addEventListener('resize', resize);

  // quality steps down by itself if the TV can't keep up
  let quality = 3;
  function setQuality(q) {
    quality = q;
    bloom.enabled = q >= 2; hts.enabled = vts.enabled = q >= 3;
    renderer.shadowMap.enabled = q >= 1; sun.castShadow = q >= 1;
    renderer.setPixelRatio(q >= 2 ? pr : Math.min(pr, 0.85)); resize();
    scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
  }

  // ------------------------------------------------------------ textures and models
  const canvasTex = (w, h, draw, repeat = true) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
  };
  const loader = new GLTFLoader(); const cache = {};
  async function model(p) {
    if (!cache[p]) cache[p] = loader.loadAsync(`/assets/sg/models/${p}.glb`).then((g) => { g.scene.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); return g.scene; });
    return (await cache[p]).clone(true);
  }
  const glossy = (obj, rough = 0.3) => { obj.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.roughness = rough; o.material.metalness = 0.08; o.material.envMapIntensity = 1.2; } }); return obj; };
  // everything that never moves is merged into one mesh per material: a handful of draw calls
  function bake(group, into) {
    group.updateMatrixWorld(true); const by = new Map();
    group.traverse((o) => {
      if (!o.isMesh) return; let g = o.geometry.clone(); g.applyMatrix4(o.matrixWorld); if (g.index) g = g.toNonIndexed();
      for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      const key = o.material.uuid; if (!by.has(key)) by.set(key, { m: o.material, gs: [], shadow: o.castShadow }); by.get(key).gs.push(g);
    });
    for (const { m, gs, shadow } of by.values()) { const mesh = new THREE.Mesh(mergeGeometries(gs), m); mesh.castShadow = shadow !== false; mesh.receiveShadow = true; into.add(mesh); gs.forEach((g) => g.dispose()); }
  }
  function disposeTree(o) { o.traverse((c) => { if (c.isMesh && c.geometry && !c.userData.keep) c.geometry.dispose(); }); }

  // ------------------------------------------------------------ particles
  const dot = canvasTex(64, 64, (g, w) => { const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.5, 'rgba(255,255,255,.6)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, w, w); }, false);
  const sq = canvasTex(8, 8, (g) => { g.fillStyle = '#fff'; g.fillRect(0, 0, 8, 8); }, false);
  const parts = [];
  function emit(o) {
    if (parts.length > 420) return;
    const mat = new THREE.SpriteMaterial({ map: o.square ? sq : dot, color: o.color, transparent: true, depthWrite: false, opacity: o.alpha ?? 1, blending: o.add ? THREE.AdditiveBlending : THREE.NormalBlending, fog: true });
    const sp = new THREE.Sprite(mat); sp.position.copy(o.p); sp.scale.setScalar(o.s0); scene.add(sp);
    parts.push({ sp, v: o.v.clone(), life: o.life, age: 0, s0: o.s0, s1: o.s1 ?? o.s0, a: o.alpha ?? 1, grav: o.grav || 0, drag: o.drag ?? 0.9, rot: o.rot || 0, floor: o.floor ?? 0.05 });
  }
  function stepParts(dt) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]; p.age += dt; const f = p.age / p.life;
      if (f >= 1) { scene.remove(p.sp); p.sp.material.dispose(); parts.splice(i, 1); continue; }
      p.v.y += p.grav * dt; p.v.multiplyScalar(Math.pow(p.drag, dt * 10)); p.sp.position.addScaledVector(p.v, dt);
      if (p.sp.position.y < p.floor && p.grav < 0) { p.sp.position.y = p.floor; p.v.y *= -0.3; p.v.x *= 0.6; p.v.z *= 0.6; }
      p.sp.scale.setScalar(lerp(p.s0, p.s1, f)); p.sp.material.opacity = p.a * (1 - f); p.sp.material.rotation += p.rot * dt;
    }
  }
  function clearParts() { for (const p of parts) { scene.remove(p.sp); p.sp.material.dispose(); } parts.length = 0; }
  const SKIDS = 2400; const skidMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.22, 0.45), new THREE.MeshBasicMaterial({ color: 0x1C1A22, transparent: true, opacity: 0.4, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), SKIDS);
  skidMesh.count = 0; skidMesh.frustumCulled = false; skidMesh.userData.keep = true; let skidN = 0;
  const _m = new THREE.Matrix4(); const _q = new THREE.Quaternion(); const _e = new THREE.Euler(); const _s = new THREE.Vector3(1, 1, 1); const _p = new THREE.Vector3();
  function skid(x, y, z, yaw) { _e.set(-Math.PI / 2, 0, -yaw); _q.setFromEuler(_e); _p.set(x, y + 0.03, z); _m.compose(_p, _q, _s); skidMesh.setMatrixAt(skidN % SKIDS, _m); skidN++; skidMesh.count = Math.min(SKIDS, skidN); skidMesh.instanceMatrix.needsUpdate = true; }
  function clearSkids() { skidN = 0; skidMesh.count = 0; }

  return { renderer, scene, camera, composer, sun, hemi, bloom, grade, tilt: (a) => { hts.__amt = a; tilt(a); }, setQuality, quality: () => quality, canvasTex, model, glossy, bake, disposeTree, emit, stepParts, clearParts, skidMesh, skid, clearSkids, envTex };
}

// ------------------------------------------------------------ the cake: five tiers on springs
export function makeCake(scale = 1) {
  const g = new THREE.Group(); const tiers = [];
  const icing = new THREE.MeshStandardMaterial({ color: 0xFFF7EC, roughness: 0.5, envMapIntensity: 0.6 });
  const pink = new THREE.MeshStandardMaterial({ color: 0xFF6FA3, roughness: 0.45 });
  const pearl = new THREE.MeshStandardMaterial({ color: 0xFFFFFF, roughness: 0.2, metalness: 0.1 });
  const R = [0.47, 0.39, 0.31, 0.24, 0.17]; const H = [0.25, 0.23, 0.21, 0.19, 0.17];
  let parent = g;
  R.forEach((r, i) => {
    const t = new THREE.Group(); t.position.y = i === 0 ? 0 : H[i - 1]; parent.add(t);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r, H[i], 32), icing); body.position.y = H[i] / 2; t.add(body);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(r, 0.03, 8, 32), icing); rim.rotation.x = Math.PI / 2; rim.position.y = H[i]; t.add(rim);
    for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2; const p = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 6), pearl); p.position.set(Math.cos(a) * r, 0.03, Math.sin(a) * r); t.add(p); }
    if (i === 0 || i === 2) { const band = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.005, r + 0.005, 0.05, 32), pink); band.position.y = H[i] * 0.45; t.add(band); }
    if (i === 1 || i === 3) for (let k = 0; k < 3; k++) { const a = k * 2.1 + i; const rose = new THREE.Mesh(new THREE.IcosahedronGeometry(0.06, 1), pink); rose.position.set(Math.cos(a) * (r - 0.02), H[i] + 0.02, Math.sin(a) * (r - 0.02)); t.add(rose); }
    t.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    tiers.push({ g: t, x: 0, z: 0, vx: 0, vz: 0 }); parent = t;
  });
  const top = new THREE.Mesh(new THREE.TorusKnotGeometry(0.05, 0.016, 48, 8), new THREE.MeshStandardMaterial({ color: 0xFFC94A, metalness: 0.8, roughness: 0.25, emissive: 0x332200 }));
  top.position.y = H[4] + 0.1; tiers[4].g.add(top);
  g.scale.setScalar(scale);
  // springs: pushed by the car's acceleration (in the car's own frame), damage adds a permanent lean
  const cake = { g, tiers, lean: 0,
    step(ax, az, dt) {
      tiers.forEach((t, i) => {
        const gain = 0.1 * (1 + i * 0.5); const kk = 90 - i * 8;
        t.vx += (-kk * t.x - 5 * t.vx - ax * gain) * dt; t.vz += (-kk * t.z - 5 * t.vz - az * gain) * dt;
        t.x = clamp(t.x + t.vx * dt, -0.1, 0.1); t.z = clamp(t.z + t.vz * dt, -0.1, 0.1);
        const l = i >= 2 ? cake.lean * (i - 1) * 0.5 : 0;
        t.g.position.x = t.x + l * 0.08; t.g.position.z = t.z; t.g.rotation.z = -t.x * 1.8 - l * 0.12; t.g.rotation.x = t.z * 1.8;
      });
    },
    jolt(s) { tiers.forEach((t, i) => { t.vx += (Math.random() - 0.5) * s * (1 + i * 0.4); t.vz += (Math.random() - 0.5) * s * (1 + i * 0.4); }); },
  };
  return cake;
}

// toy people for the wedding: board-game pawns with heads
export function pawn(color, h = 1.5, skin = 0xF2C9A0) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22 * h / 1.5, 0.34 * h / 1.5, h * 0.62, 14), new THREE.MeshStandardMaterial({ color, roughness: 0.45 }));
  body.position.y = h * 0.31; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2 * h / 1.5, 16, 12), new THREE.MeshStandardMaterial({ color: skin, roughness: 0.6 }));
  head.position.y = h * 0.78; g.add(head);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  g.userData.head = head; return g;
}
