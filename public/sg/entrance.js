// The Grand Entrance: the car can't go any further, so the cake is carried in on a tray.
// Half the room holds the left side, half the right. Lift your side when it dips; lift together on the steps.
import { THREE, lerp, clamp, rng, makeCake, pawn } from './world.js';
import { lightTheme } from './stages.js';

const PATH = [[0, -34], [0, -22], [0, -12], [0, -2], [3, 8], [-2.5, 18], [2, 28], [0, 36], [0, 41]];
const STEPS = [[-22, -17]]; // z range of the front steps
const EVENTS = [{ f: 0.34, k: 'uncle', push: -1.4 }, { f: 0.52, k: 'waiter', push: 1.4 }, { f: 0.7, k: 'toddler', push: 0 }, { f: 0.83, k: 'uncle', push: 1.2 }];

export async function buildEntrance(world, seed) {
  const r = rng(seed + 5); lightTheme(world, 'hall');
  const root = new THREE.Group(); world.scene.add(root); const STATIC = new THREE.Group();
  const ct = world.canvasTex;
  const marble = ct(256, 256, (g, w, h) => { for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { g.fillStyle = (x + y) % 2 ? '#E8D6BE' : '#B99C7C'; g.fillRect(x * 64, y * 64, 64, 64); } g.globalAlpha = 0.15; for (let i = 0; i < 40; i++) { g.strokeStyle = '#B9A58C'; g.beginPath(); g.moveTo(r() * w, r() * h); g.lineTo(r() * w, r() * h); g.stroke(); } }); marble.repeat.set(14, 18);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(56, 72), new THREE.MeshStandardMaterial({ map: marble, roughness: 0.42, metalness: 0.05 })); floor.rotation.x = -Math.PI / 2; floor.position.set(0, 1.2, 16); floor.receiveShadow = true; root.add(floor);
  const outside = new THREE.Mesh(new THREE.PlaneGeometry(80, 40), new THREE.MeshStandardMaterial({ color: 0x8A8496, roughness: 0.9 })); outside.rotation.x = -Math.PI / 2; outside.position.set(0, 0, -38); outside.receiveShadow = true; root.add(outside);
  // the front steps, with a red carpet up them and down the aisle
  const stone = new THREE.MeshStandardMaterial({ color: 0xEDE3D3, roughness: 0.6 }); const carpetM = new THREE.MeshStandardMaterial({ color: 0xC2264B, roughness: 0.8 });
  for (let i = 0; i < 4; i++) { const st = new THREE.Mesh(new THREE.BoxGeometry(18, 0.3 * (i + 1), 1.4), stone); st.position.set(0, 0.15 * (i + 1), -22 + i * 1.4 + 0.7); st.castShadow = true; st.receiveShadow = true; STATIC.add(st); const cp = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.3 * (i + 1) + 0.02, 1.4), carpetM); cp.position.set(0, 0.15 * (i + 1) + 0.01, -22 + i * 1.4 + 0.7); STATIC.add(cp); }
  const plat = new THREE.Mesh(new THREE.BoxGeometry(18, 1.2, 2.8), stone); plat.position.set(0, 0.6, -15.6); STATIC.add(plat);
  const curve = new THREE.CatmullRomCurve3(PATH.map(([x, z]) => new THREE.Vector3(x, 0, z)));
  for (let i = 0; i < 80; i++) { const p = curve.getPointAt(i / 80); if (p.z < -14) continue; const t = curve.getTangentAt(i / 80); const cp = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.04, 1.2), carpetM); cp.position.set(p.x, 1.22, p.z); cp.rotation.y = Math.atan2(t.x, t.z); cp.receiveShadow = true; STATIC.add(cp); }
  // walls, columns and the grand door
  const wallM = new THREE.MeshStandardMaterial({ color: 0xF6D9C8, roughness: 0.8 }); const goldM = new THREE.MeshStandardMaterial({ color: 0xE8B84A, metalness: 0.7, roughness: 0.3 });
  for (const [w, h, d, x, z] of [[1, 12, 72, -28, 16], [1, 12, 72, 28, 16], [56, 12, 1, 0, 52]]) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallM); m.position.set(x, 6 + 1.2, z); m.receiveShadow = true; STATIC.add(m); }
  for (const x of [-27, -13, 13, 27]) { const fw = new THREE.Mesh(new THREE.BoxGeometry(x === -27 || x === 27 ? 1 : 22, 12, 1), wallM); fw.position.set(x === -27 ? -20 : x === 27 ? 20 : 0, 7.2, -14.2); if (Math.abs(x) === 13) continue; STATIC.add(fw); }
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(14, 4, 1), wallM); lintel.position.set(0, 11.2, -14.2); STATIC.add(lintel);
  for (const x of [-7.5, 7.5]) { const col = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.7, 10, 16), stone); col.position.set(x, 6.2, -14.4); col.castShadow = true; STATIC.add(col); }
  const sign = new THREE.Mesh(new THREE.BoxGeometry(12, 1.6, 0.2), new THREE.MeshStandardMaterial({ map: ct(512, 96, (g, w, h) => { g.fillStyle = '#1B1530'; g.fillRect(0, 0, w, h); g.font = '58px Bungee, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#E8B84A'; g.fillText('THE GRAND HOTEL', w / 2, h / 2 + 3); }, false) })); sign.position.set(0, 12.1, -14.9); STATIC.add(sign);
  // round tables with white cloths, guests around them, plants and chandeliers
  const guestCols = [0xFF4F8B, 0x3ED6A0, 0xFFD23F, 0x4FB6FF, 0xC58BFF, 0xFF8A3D, 0x26C6C6, 0xFFFFFF, 0x1B1530];
  const skins = [0xF2C9A0, 0xD9A27A, 0xB57B52, 0x8A5A3C, 0xF7D7B8];
  const clothM = new THREE.MeshStandardMaterial({ color: 0xFFFFFF, roughness: 0.6 });
  const tables = [];
  for (const z of [2, 13, 24, 33]) for (const x of [-16, -9, 9, 16]) {
    if (Math.abs(x) < 10 && z > 30) continue;
    const t = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.1, 1.1, 24), clothM); t.position.set(x + (r() - 0.5), 1.75, z + (r() - 0.5)); t.castShadow = true; t.receiveShadow = true; STATIC.add(t); tables.push(t.position.clone());
    const fl = new THREE.Mesh(new THREE.IcosahedronGeometry(0.45, 1), new THREE.MeshStandardMaterial({ color: 0xFF7FAA, roughness: 0.6 })); fl.position.set(t.position.x, 2.6, t.position.z); STATIC.add(fl);
    for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2 + r(); const pw = pawn(guestCols[Math.floor(r() * guestCols.length)], 1.5, skins[Math.floor(r() * skins.length)]); pw.position.set(t.position.x + Math.cos(a) * 2.7, 1.2, t.position.z + Math.sin(a) * 2.7); STATIC.add(pw); }
  }
  for (const [x, z] of [[-24, -8], [24, -8], [-24, 46], [24, 46], [-8, 46], [8, 46]]) { const p = await world.model('furn/pottedPlant'); p.scale.setScalar(6); p.position.set(x, 1.2, z); STATIC.add(p); }
  for (const [x, z] of [[-10, 8], [10, 8], [-10, 28], [10, 28], [0, 18]]) { const ch = new THREE.Group(); const ring = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.12, 8, 24), goldM); ring.rotation.x = Math.PI / 2; ch.add(ring); for (let k = 0; k < 8; k++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), new THREE.MeshStandardMaterial({ color: 0xFFF2C8, emissive: 0xFFE2A0, emissiveIntensity: 2.2 })); const a = (k / 8) * Math.PI * 2; b.position.set(Math.cos(a) * 1.6, -0.2, Math.sin(a) * 1.6); ch.add(b); } ch.position.set(x, 11, z); root.add(ch); const pl = new THREE.PointLight(0xFFD9A0, 60, 26, 1.6); pl.position.set(x, 10, z); root.add(pl); }
  // the head table, the bride and groom
  const head = new THREE.Mesh(new THREE.BoxGeometry(12, 1.1, 2.4), clothM); head.position.set(0, 1.75, 45); head.castShadow = true; STATIC.add(head);
  const bride = pawn(0xFFFFFF, 1.6, 0xD9A27A); bride.position.set(-1.2, 1.2, 46.6); STATIC.add(bride); const groom = pawn(0x1B1530, 1.7, 0xB57B52); groom.position.set(1.2, 1.2, 46.6); STATIC.add(groom);
  world.bake(STATIC, root);
  // the tray, the cake and the two waiters carrying it
  const party = new THREE.Group(); root.add(party);
  const tray = new THREE.Group(); party.add(tray);
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.08, 32), goldM); plate.castShadow = true; tray.add(plate);
  const cake = makeCake(2.1); cake.g.position.y = 0.04; tray.add(cake.g); tray.position.y = 1.5;
  const waiters = [pawn(0x1B1530, 1.6), pawn(0x1B1530, 1.6)]; waiters[0].position.set(-1.35, 0, 0); waiters[1].position.set(1.35, 0, 0); waiters.forEach((w) => party.add(w));
  for (const w of waiters) { const bow = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.06), new THREE.MeshStandardMaterial({ color: 0xFFFFFF })); bow.position.set(0, 1.1, 0.3); w.add(bow); }
  // the people who get in the way
  const actors = {
    uncle: pawn(0xFFD23F, 1.7, 0xB57B52), waiter: pawn(0x1B1530, 1.6, 0xF2C9A0), toddler: pawn(0x4FB6FF, 0.8, 0xF7D7B8),
  };
  for (const a of Object.values(actors)) { a.visible = false; root.add(a); }
  const wtray = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.05, 20), goldM); wtray.position.set(0.5, 1.25, 0); actors.waiter.add(wtray);
  return { root, curve, party, tray, cake, waiters, actors, tables, dispose: () => { world.scene.remove(root); world.disposeTree(root); } };
}

export function createEntrance(world, E, opts = {}) {
  const S = { t: 0, f: 0, roll: 0, rollV: 0, done: false, fell: false, tiltT: 0, events: new Set(), stepDone: new Set(), lift: { L: 0, R: 0 }, warn: 0, cue: null };
  const out = { hits: [], events: [] }; const ev = (k, d) => out.events.push({ k, ...d });
  const LEN = E.curve.getLength(); const SPEED = 1.32;
  let acc = 0; let accT = 0; let act = null;
  const botLift = { L: 0, R: 0 }; let react = { L: 0, R: 0 };
  // lift: how many people on each side are holding LIFT (hL, hR), how many bots (bL, bR), and side sizes (nL, nR)
  function step(dt, lift, cake) {
    out.hits = []; out.events = [];
    if (S.done) { idle(dt); return out; }
    S.t += dt; S.f = Math.min(1, S.f + (SPEED * dt) / LEN);
    const p = E.curve.getPointAt(S.f); const tg = E.curve.getTangentAt(S.f);
    const onSteps = STEPS.some(([a, b]) => p.z > a && p.z < b);
    // bots on each side lift when their side dips (a little late, like people)
    for (const side of ['L', 'R']) {
      const pr = S.roll + S.rollV * 0.25; const dips = side === 'L' ? pr < -0.06 : pr > 0.06;
      react[side] = dips || onSteps ? react[side] + dt : 0;
      botLift[side] = react[side] > 0.16 ? 1 : 0;
    }
    const L = (lift.hL + botLift.L * lift.bL) / Math.max(1, lift.nL); const R = (lift.hR + botLift.R * lift.bR) / Math.max(1, lift.nR);
    S.lift = { L, R };
    // a damaged cake is a wobbly cake
    const wob = 1 + (100 - cake) / 130;
    const torque = Math.sin(S.t * 1.7) * 0.5 * wob + Math.sin(S.t * 0.73 + 1) * 0.35 * wob + 2.6 * (L - R) + S.roll * 0.5;
    S.rollV += (torque - S.rollV * 2.8) * dt; S.roll = clamp(S.roll + S.rollV * dt, -0.9, 0.9);
    for (const e of EVENTS) if (S.f >= e.f && !S.events.has(e)) { S.events.add(e); ev('say', { s: e.k }); S.rollV += (e.push || (Math.random() < 0.5 ? -1.4 : 1.4)) * wob; act = { e, t: 0, a: E.actors[e.k], side: e.push < 0 ? -1 : 1 }; }
    // the steps: both sides lift together, or the cake takes a bump
    if (onSteps && !S.stepDone.has(0)) { if (!S.stepWarned) { S.stepWarned = true; ev('say', { s: 'steps' }); } S.stepT = (S.stepT || 0) + dt; if (L >= 0.5 && R >= 0.5) S.stepOk = (S.stepOk || 0) + dt; }
    if (!onSteps && S.stepT && !S.stepDone.has(0)) { S.stepDone.add(0); if ((S.stepOk || 0) < S.stepT * 0.55) { acc += 6; E.cake.jolt(6); ev('bump'); } else ev('stepsOk'); }
    const tilt = Math.abs(S.roll);
    if (tilt > 0.26) { acc += (tilt - 0.2) * 14 * dt * wob; S.warn = 1; } else S.warn = Math.max(0, S.warn - dt * 2);
    S.tiltT = tilt > 0.55 ? S.tiltT + dt : 0;
    if (S.tiltT > 0.7) { S.done = true; S.fell = true; ev('fell'); spill(); }
    if (S.f >= 1 && !S.done) { S.done = true; ev('done'); }
    accT += dt; if (acc >= 1 && accT > 0.5) { out.hits.push({ amt: Math.round(acc * 10) / 10, kind: 'tilt' }); acc = 0; accT = 0; }
    // move everyone
    E.party.position.set(p.x, p.z > -14 ? 1.2 : onSteps ? clamp((p.z + 22) / 5, 0, 1) * 1.2 : 0, p.z); E.party.rotation.y = Math.atan2(tg.x, tg.z);
    E.tray.rotation.z = -S.roll; E.tray.position.y = 1.5 + Math.abs(Math.sin(S.t * 6)) * 0.05;
    E.cake.g.position.x = clamp(Math.sin(S.roll) * 0.35, -0.3, 0.3);
    E.waiters[0].position.y = (L ? 0.18 : 0) + Math.abs(Math.sin(S.t * 6)) * 0.06; E.waiters[1].position.y = (R ? 0.18 : 0) + Math.abs(Math.sin(S.t * 6 + 1.5)) * 0.06;
    E.cake.step(-S.rollV * 20, Math.sin(S.t * 6) * 4, dt);
    if (act) { act.t += dt; const a = act.a; a.visible = act.t < 3.2; const k = act.e.k; const sd = act.side; a.position.set(p.x + (k === 'toddler' ? lerp(-8, 8, act.t / 3) : sd * lerp(6, 1.8, Math.min(1, act.t / 0.8)) + (act.t > 1 ? sd * (act.t - 1) * 3 : 0)), 1.2 + (k === 'uncle' ? Math.abs(Math.sin(act.t * 9)) * 0.5 : 0), p.z + 1.5); a.rotation.y = act.t * (k === 'uncle' ? 9 : 0); if (act.t > 3.2) act = null; }
    camera(dt, p, tg);
    return out;
  }
  function spill() { const p = E.party.position.clone(); for (let i = 0; i < 60; i++) world.emit({ p: p.clone().add(new THREE.Vector3(0, 2.4, 0)), v: new THREE.Vector3((Math.random() - 0.5) * 7, 2 + Math.random() * 5, (Math.random() - 0.5) * 7), life: 1.6, s0: 0.4, s1: 0.3, color: Math.random() < 0.7 ? 0xFFF7EC : 0xFF6FA3, grav: -12, floor: 1.25 }); E.cake.g.visible = false; }
  function idle(dt) { S.t += dt; if (!S.fell && Math.random() < 0.3) { const p = E.party.position.clone(); world.emit({ p: p.add(new THREE.Vector3((Math.random() - 0.5) * 10, 8, (Math.random() - 0.5) * 6)), v: new THREE.Vector3((Math.random() - 0.5) * 2, -1, (Math.random() - 0.5) * 2), life: 2.4, s0: 0.25, s1: 0.25, color: [0xFF4F8B, 0xFFD23F, 0x3ED6A0, 0x4FB6FF][Math.floor(Math.random() * 4)], square: true, grav: -1.5, drag: 0.98, rot: 6, floor: 1.25 }); } camera(dt, E.party.position, new THREE.Vector3(0, 0, 1)); }
  const cam = { pos: new THREE.Vector3(), look: new THREE.Vector3(), init: false };
  function camera(dt, p, tg) {
    const want = new THREE.Vector3(p.x, 0, p.z).addScaledVector(tg, -7.5).add(new THREE.Vector3(3, 6.2 + (p.z > -14 ? 1.2 : 0), 0)); const look = new THREE.Vector3(p.x, 2.6, p.z).addScaledVector(tg, 3);
    if (!cam.init) { cam.pos.copy(want); cam.look.copy(look); cam.init = true; }
    const k = 1 - Math.exp(-dt * 2.5); cam.pos.lerp(want, k); cam.look.lerp(look, k);
    world.camera.position.copy(cam.pos); world.camera.lookAt(cam.look); world.camera.fov = 44; world.camera.updateProjectionMatrix();
    world.sun.position.set(p.x + 20, 40, p.z - 10); world.sun.target.position.set(p.x, 0, p.z);
  }
  return { S, step, get progress() { return S.f; } };
}
