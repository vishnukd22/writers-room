// The car: physics, collisions, the stage rules, the autopilot (bots and empty seats), the camera and the effects.
import { THREE, lerp, clamp, wrapA, ease, makeCake } from './world.js';
import { W, LANE } from './stages.js';

const UP = new THREE.Vector3(0, 1, 0);
export async function makeCar(world) {
  const g = new THREE.Group(); const body = world.glossy(await world.model('car/hatchback-red'), 0.28); body.scale.setScalar(1.22); g.add(body);
  const wheels = {}; body.traverse((o) => { if (/^wheel-/.test(o.name)) wheels[o.name] = o; });
  const cake = makeCake(1.22); cake.g.position.set(0, 0.55 * 1.22, -0.62 * 1.22); g.add(cake.g);
  // headlights: only switched on at night
  const lights = []; for (const x of [-0.42, 0.42]) { const sl = new THREE.SpotLight(0xFFF1C8, 0, 55, 0.48, 0.55, 1.2); sl.position.set(x, 0.75, 1.6); sl.target.position.set(x * 2, 0, 16); g.add(sl, sl.target); lights.push(sl); }
  const lens = new THREE.MeshStandardMaterial({ color: 0xFFF6D8, emissive: 0xFFF1C8, emissiveIntensity: 0 });
  for (const x of [-0.42, 0.42]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.14, 0.05), lens); l.position.set(x, 0.62, 1.72); g.add(l); }
  const brakeM = new THREE.MeshStandardMaterial({ color: 0x661111, emissive: 0xFF2222, emissiveIntensity: 0 });
  for (const x of [-0.5, 0.5]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.14, 0.05), brakeM); l.position.set(x, 0.72, -1.78); g.add(l); }
  world.scene.add(g);
  return { g, body, wheels, cake, lights, lens, brakeM };
}

export function createDrive(world, st, car, opts = {}) {
  const tr = st.tr; const sp = st.special; const key = st.key;
  const a0 = tr.at(st.startS);
  const L0 = key === 'park' ? 0.5 : LANE;
  const S = { x: a0.p.x + a0.r.x * L0, z: a0.p.z + a0.r.z * L0, h: a0.head, y: 0, v: 0, steerS: 0, yawRate: 0, vy: 0, air: false, roll: 0, rollV: 0,
    gear: 'D', nitro: 3, nitroT: 0, lights: false, battery: 100, s: st.startS, lat: LANE, off: false, done: false, pit: false, t: 0, hold: 0, splashT: 0, finishT: 0, crash: 0, bumpT: 0, horned: 0 };
  const out = { hits: [], events: [] };
  let acc = 0; let accKind = 'hit'; let accT = 0; const cool = {};
  const hit = (amt, kind, cd = 0.35) => { if (cool[kind] && S.t - cool[kind] < cd) return; cool[kind] = S.t; acc += amt; if (amt >= 1.5 || kind !== 'offroad') accKind = kind; };
  const ev = (k, data) => out.events.push({ k, ...data });
  const steerBuf = []; // the desert's slow steering
  let prevV = 0; let prevPos = new THREE.Vector3(S.x, 0, S.z); let prevVel = new THREE.Vector3(); let yPrev = 0; let vyG = 0;
  const fwd = () => new THREE.Vector3(Math.sin(S.h), 0, Math.cos(S.h));

  // ------------------------------------------------------------ the autopilot: drives every seat a bot (or nobody) has
  let parkPhase = 0; let parkT = 0;
  function auto(dt) {
    const o = { left: 0, right: 0, gas: 0, brake: 0, gear: null, nitro: false, horn: false, lights: null, lean: 0 };
    const n = tr.nearest(S.x, S.z, S.s);
    // which lane: dodge slow cars, cones and roadblocks
    let lane = 1; const look = 34;
    const staticBlock = (ln, from, to) => (sp.blocks || []).some((b) => b.lane === ln && b.s > from && b.s < to) || st.dyn.some((d) => d.kind === 'cone' && !d.hit && (() => { const q = tr.nearest(d.x, d.z, S.s); return q.s > from && q.s < to && Math.sign(q.lat) === ln; })());
    const slowCar = (ln, from, to) => st.dyn.some((d) => d.kind === 'car' && d.lane * ln > 0 && d.v > 0 && d.s > from && d.s < to && !d.pull);
    const oncoming = (from, to) => st.dyn.some((d) => d.kind === 'car' && d.v < 0 && d.s > from && d.s < to);
    // stay right; overtake on the left only when nothing is coming the other way
    if (staticBlock(1, n.s, n.s + look)) lane = -1;
    else if (key !== 'dunes' && slowCar(1, n.s, n.s + look) && !oncoming(n.s - 5, n.s + 110) && !staticBlock(-1, n.s, n.s + look)) lane = -1;
    if (S.lat < 0 && slowCar(1, n.s - 6, n.s + 4)) lane = -1; // finish the overtake first
    let latT = LANE * lane; let vT = 25;
    // follow whatever is in front in this lane
    for (const d of st.dyn) { if (d.kind !== 'car' || d.v < 0 || Math.min(Math.abs((d.lat ?? d.lane) - latT), Math.abs((d.lat ?? d.lane) - S.lat)) > 2.2) continue; const gap = d.s - n.s; if (gap > 0 && gap < 45) vT = Math.min(vT, Math.max(0, (d.v > 0 ? d.v : 0) + Math.sqrt(2 * 9 * Math.max(0, gap - 7.5)) - 1)); }
    const kA = (() => { let m = 0; for (let x = 0; x < 26; x += 3) m = Math.max(m, Math.abs(tr.at(n.s + x).k)); return m; })();
    vT = Math.min(vT, Math.sqrt(26 / Math.max(kA, 1e-4)));
    if (key === 'dunes') vT = Math.min(vT, 14);
    if (key === 'night') vT = Math.min(vT, S.lights ? 19 : 12);
    if (key === 'park') {
      const slot = sp.slot; const along = n.s - slot.s;
      if (parkPhase === 0) { latT = 0.5; vT = Math.min(vT, clamp((slot.s + 8 - n.s) * 0.6, 0, 9)); if (along > 6 && Math.abs(S.v) < 0.6) parkPhase = 1; }
      if (parkPhase === 1) { o.gear = 'R'; if (S.gear === 'R') parkPhase = 2; }
      if (parkPhase >= 2) { latT = slot.lat; vT = -clamp(Math.abs(along) * 0.5, 0.6, 3); if (Math.abs(along) < 0.5) vT = 0; }
    }
    if (key === 'pit') { const d = sp.pit.s - n.s; if (d < 60) vT = Math.min(vT, clamp(Math.sqrt(Math.max(0, d) * 9), 0, 20)); latT = LANE; }
    if (key === 'jump') { vT = 30; if (n.s > sp.ramp.s - 70 && n.s < sp.ramp.s - 8 && S.nitro > 0 && S.nitroT <= 0) o.nitro = true; latT = 0; }
    // steering: aim at a point down the road (behind the car when reversing)
    const rev = S.gear === 'R' || vT < 0;
    const la = tr.at(n.s + (rev ? -4 : 5 + Math.abs(S.v) * (key === 'dunes' ? 0.6 : 0.45))); const tp = la.p.clone().addScaledVector(la.r, latT);
    let want = Math.atan2(tp.x - S.x, tp.z - S.z); if (rev) want = wrapA(want + Math.PI);
    let diff = wrapA(want - S.h); if (rev) diff = -diff;
    if (key === 'park' && parkPhase >= 2) { const hd = wrapA(la.head - S.h); diff = clamp((n.lat - latT) * 0.9 + hd * -1.6, -1, 1); if (Math.abs(n.s - sp.slot.s) < 3) diff = clamp(-hd * 3, -1, 1); }
    const dz = key === 'dunes' ? 0.08 : 0.06; if (diff > dz) o.left = 1; else if (diff < -dz) o.right = 1;
    const sv = S.gear === 'R' ? -S.v : S.v; const tv = Math.abs(vT);
    if ((key === 'park' && parkPhase >= 2) ? sv < tv - 0.2 : sv < tv - 1) o.gas = 1; else if (sv > tv + (key === 'park' ? 0.3 : 3)) o.brake = 1;
    if (vT === 0 && Math.abs(S.v) > 0.05) { o.gas = 0; o.brake = 1; }
    if (key !== 'park' && S.gear === 'R') o.gear = 'D';
    if (key !== 'park' && key !== 'pit' && key !== 'jump' && kA < 0.006 && S.v > 18 && S.nitro > 0 && S.nitroT <= 0 && Math.random() < 0.004) o.nitro = true;
    if (st.dyn.some((d) => d.kind === 'car' && d.lane > 0 && d.s - n.s > 16 && d.s - n.s < 30 && !d.pull)) o.horn = true;
    if (key === 'night') o.lights = S.battery > 35 ? true : S.battery < 6 ? false : null;
    if (S.air) o.lean = clamp(S.roll * 2.6 + S.rollV * 0.6, -1, 1);
    return o;
  }

  // ------------------------------------------------------------ one step of the world
  function step(dt, human, mask) {
    out.hits = []; out.events = [];
    if (S.done || S.pit) { idle(dt); return out; }
    S.t += dt;
    const ap = auto(dt);
    // each control comes from its owner's phone, or from the autopilot if a bot (or nobody) has it
    const c = {}; for (const k of ['left', 'right', 'gas', 'brake']) c[k] = mask[k] ? ap[k] : human[k] ? 1 : 0;
    if (mask.gear && ap.gear && ap.gear !== S.gear) human.edges.gear = true;
    if (mask.nitro && ap.nitro) human.edges.nitro = true;
    if (mask.horn && ap.horn && S.t - S.horned > 2.5) human.edges.horn = true;
    if (mask.lights && ap.lights != null && ap.lights !== S.lights) human.edges.lights = true;
    S.ctl = c;
    const lean = (mask.lean ? ap.lean : 0) + (human.lean || 0);
    if (human.edges.gear) { S.gear = S.gear === 'D' ? 'R' : 'D'; ev('gear', { g: S.gear }); }
    if (human.edges.nitro && S.nitro > 0 && S.nitroT <= 0 && S.gear === 'D') { S.nitro--; S.nitroT = 1.6; ev('nitro'); }
    if (human.edges.horn) { S.horned = S.t; ev('horn'); for (const d of st.dyn) if (d.kind === 'car' && d.lane > 0 && d.s - S.s > 0 && d.s - S.s < 32) d.pull = 3.2; }
    if (human.edges.lights) { S.lights = !S.lights && S.battery > 3; ev('lights', { on: S.lights }); }
    human.edges = {};
    // the night: the lights eat the battery
    if (key === 'night') { if (S.lights) { S.battery = Math.max(0, S.battery - 7.5 * dt); if (S.battery <= 0) { S.lights = false; ev('lights', { on: false, flat: true }); } } else S.battery = Math.min(100, S.battery + 5 * dt); }
    // steering (the sand delays it)
    let steer = c.left - c.right;
    if (key === 'dunes') { // only people feel the sand lag; the autopilot already allows for it
      const hs = (mask.left ? 0 : c.left) - (mask.right ? 0 : c.right); const bs = steer - hs;
      steerBuf.push({ t: S.t, s: hs }); let d = steerBuf.delayed ?? 0; while (steerBuf.length && steerBuf[0].t <= S.t - 0.35) d = steerBuf.shift().s; steerBuf.delayed = d; steer = clamp(d + bs, -1, 1); }
    S.steerS += (steer - S.steerS) * Math.min(1, dt * (key === 'dunes' ? 4 : 7));
    // engine and brakes
    const n0 = tr.nearest(S.x, S.z, S.s); S.off = Math.abs(n0.lat) > W / 2 + 0.6;
    const nitroOn = S.nitroT > 0; S.nitroT = Math.max(0, S.nitroT - dt);
    let vmax = nitroOn ? 36 : key === 'dunes' ? 21 : 25; if (S.off) vmax = key === 'dunes' ? 11 : 13;
    if (!S.air) {
      if (S.gear === 'D') { if (c.gas) S.v += (nitroOn ? 22 : S.v < 8 ? 15 : 11) * dt; if (nitroOn) S.v += 8 * dt; if (S.v > vmax) S.v = Math.max(vmax, S.v - 14 * dt); }
      else if (c.gas) S.v = Math.max(-9, S.v - 9 * dt);
      if (c.brake) { const d = 30 * dt; S.v = Math.abs(S.v) <= d ? 0 : S.v - Math.sign(S.v) * d; }
      if (!c.gas && !c.brake) { const d = (S.off ? 9 : 3) * dt; S.v = Math.abs(S.v) <= d ? 0 : S.v - Math.sign(S.v) * d; }
      if (S.off && Math.abs(S.v) > 8) { hit(1.2 * dt * 10, 'offroad', 0.9); if (Math.random() < 0.3) world.emit({ p: new THREE.Vector3(S.x, S.y + 0.3, S.z), v: new THREE.Vector3((Math.random() - 0.5) * 2, 1, (Math.random() - 0.5) * 2), life: 0.9, s0: 0.4, s1: 1.8, color: key === 'dunes' ? 0xE8C690 : 0x9BC27A, alpha: 0.5 }); }
      // turning
      const grip = key === 'dunes' ? 0.8 : 1;
      S.yawRate = S.steerS * 2.0 * clamp(Math.abs(S.v) / 6, 0, 1) * (1 - 0.32 * Math.min(1, Math.abs(S.v) / 30)) * Math.sign(S.v || 1) * grip;
      S.h += S.yawRate * dt;
    }
    S.x += Math.sin(S.h) * S.v * dt; S.z += Math.cos(S.h) * S.v * dt;
    // ground height: dunes, the ramp, and the air
    let ground = st.hfn ? st.hfn(S.x, S.z) : 0;
    const n = tr.nearest(S.x, S.z, S.s); S.s = n.s; S.lat = n.lat;
    if (key === 'jump') {
      const R = sp.ramp; const onRamp = n.s > R.s - 10 && n.s <= R.s && Math.abs(n.lat) < W / 2;
      if (onRamp) ground = (n.s - (R.s - 10)) / 10 * 2.4;
      const overRiver = n.s > R.s && n.s < R.s + R.gap;
      if (!S.air && n.s > R.s && n.s < R.s + 1.5 && S.y > 1.2) { S.air = true; S.vy = Math.abs(S.v) * 0.42 + 2; S.rollV = (Math.random() - 0.5) * 2.4; S.flightT = 0; ev('jump'); }
      if (!S.air && overRiver && !S.splashT) { S.air = true; S.vy = 0; }
      if (S.air) {
        S.flightT = (S.flightT || 0) + dt; S.vy -= 28 * dt; S.y += S.vy * dt;
        S.rollV += (Math.sin(S.t * 2.7) * 1.1 + Math.cos(S.t * 1.3) * 0.6 - lean * 3.6 - S.roll * 0.4) * dt; S.roll += S.rollV * dt; S.roll = clamp(S.roll, -1.2, 1.2);
        const landY = overRiver ? -6 : 0;
        if (overRiver && S.y < -0.6 && !S.splashT) { S.splashT = 1.4; S.v *= 0.3; hit(15, 'splash', 0); ev('splash'); for (let i = 0; i < 40; i++) world.emit({ p: new THREE.Vector3(S.x, 0.3, S.z), v: new THREE.Vector3((Math.random() - 0.5) * 8, 4 + Math.random() * 7, (Math.random() - 0.5) * 8), life: 1.2, s0: 0.5, s1: 0.2, color: Math.random() < 0.5 ? 0xBFE6FF : 0xFFFFFF, grav: -14, floor: 0.06 }); }
        if (!overRiver && S.y <= landY) { const imp = Math.max(0, -S.vy - 11) * 0.7 + Math.abs(S.roll) * 22; if (imp > 1) hit(Math.min(20, imp), 'land', 0); ev('land', { imp }); S.y = 0; S.air = false; S.vy = 0; S.roll = 0; S.rollV = 0; car.cake.jolt(3 + imp * 0.4); }
      } else S.y = ground;
      if (S.splashT) { S.splashT -= dt; S.y = Math.max(-2.5, S.y); if (S.splashT <= 0) { S.splashT = 0; const b = tr.at(R.s - 75); S.x = b.p.x + b.r.x * LANE * 0.3; S.z = b.p.z + b.r.z * LANE * 0.3; S.h = b.head; S.v = 0; S.y = 0; S.air = false; S.roll = 0; S.s = R.s - 75; ev('respawn'); } }
    } else {
      S.y = ground;
      if (st.hfn) { const vyg = (ground - yPrev) / Math.max(dt, 1e-3); const ayg = (vyg - vyG) / Math.max(dt, 1e-3); vyG = vyg; if (ayg < -55 && S.v > 13 && S.t - S.bumpT > 0.7) { S.bumpT = S.t; hit(2, 'bump', 0.7); car.cake.jolt(4); ev('bump'); } }
    }
    yPrev = ground;
    // collisions
    if (!S.air) collide(dt);
    // traffic, cones, police
    stepDyn(dt);
    // goals
    if (st.finishS != null && S.s >= st.finishS && !S.done) { S.done = true; ev('done'); }
    if (key === 'park') {
      const sl = sp.slot; const nn = tr.nearest(S.x, S.z, S.s); const hd = Math.abs(wrapA(S.h - tr.at(nn.s).head)); const par = Math.min(hd, Math.PI - hd);
      const inside = Math.abs(nn.s - sl.s) < 1.4 && Math.abs(nn.lat - sl.lat) < 0.7 && par < 0.24 && Math.abs(S.v) < 0.45;
      S.hold = inside ? S.hold + dt : 0; S.parkOk = inside; if (S.hold > 1.0) { S.done = true; ev('done'); }
      // a full car of bots slides the last bit in
      if (opts.allBots && parkPhase >= 2 && Math.abs(nn.s - sl.s) < 6) { parkT += dt; const b = tr.at(sl.s); const tx = b.p.x + b.r.x * sl.lat; const tz = b.p.z + b.r.z * sl.lat; const f = Math.min(1, dt * 1.5); S.x = lerp(S.x, tx, f); S.z = lerp(S.z, tz, f); S.h += wrapA(b.head - S.h) * f; S.v *= 0.9; if (parkT > 2.5) { S.v = 0; S.hold += dt * 2; } }
    }
    if (key === 'pit') { const p = sp.pit; const nn = tr.nearest(S.x, S.z, S.s); const inBox = Math.abs(nn.s - p.s) < 2.2 && Math.abs(nn.lat - p.lat) < 1.5 && Math.abs(S.v) < 0.5; S.hold = inBox ? S.hold + dt : 0; S.boxOk = inBox; if (S.hold > 0.5) { S.pit = true; S.v = 0; ev('pit'); } }
    // cake damage goes out in little bundles
    accT += dt; if (acc >= 1 && accT > 0.35) { out.hits.push({ amt: Math.round(acc * 10) / 10, kind: accKind }); acc = 0; accT = 0; accKind = 'hit'; }
    pose(dt, c, nitroOn);
    prevV = S.v;
    return out;
  }
  function idle(dt) { S.t += dt; S.v *= Math.pow(0.05, dt); pose(dt, { gas: 0, brake: 1 }, false); stepDyn(dt); }

  function collide() {
    if (opts.allBots && key === 'park' && parkPhase >= 2) return;
    const f = fwd(); const circles = [[1.15, 0.86], [-1.15, 0.86]];
    for (const [off, rad] of circles) {
      const cx = S.x + f.x * off; const cz = S.z + f.z * off;
      for (const o of st.near(cx, cz)) {
        const dx = cx - o.x; const dz = cz - o.z; const d = Math.hypot(dx, dz); const min = rad + o.r;
        if (d >= min || d < 1e-4) continue;
        const nx = dx / d; const nz = dz / d; const push = min - d; S.x += nx * push; S.z += nz * push;
        const vn = (Math.sin(S.h) * nx + Math.cos(S.h) * nz) * S.v;
        if (vn < -0.5) {
          const imp = -vn; if (o.hitT && S.t - o.hitT < 1.0) { S.v *= 0.6; continue; } o.hitT = S.t; S.v *= o.kind === 'parked' || o.kind === 'super' ? 0.45 : 0.25;
          const kind = o.kind === 'super' ? 'scratch' : o.kind === 'parked' ? 'scratch' : 'hit';
          const dmg = o.kind === 'super' && imp < 1.5 ? 0 : clamp((imp - 2) * (o.kind === 'super' ? 1.1 : 1.0), o.kind === 'super' ? 3 : 0, 18);
          if (dmg > 0.3) { hit(dmg, kind, 0.25); crash(cx, cz, imp); if (window.__sgLog) window.__sgLog.push(['static', key, o.kind, Math.round(imp), Math.round(S.s), Math.round(S.lat * 10) / 10]); }
        }
      }
      for (const o of st.dyn) {
        if (o.kind === 'cone') { if (o.hit) continue; const dx = cx - o.x; const dz = cz - o.z; if (dx * dx + dz * dz < (rad + o.r) ** 2) { o.hit = true; const ff = fwd(); o.v.copy(ff).multiplyScalar(Math.abs(S.v) * 0.7 + 4).add(new THREE.Vector3((Math.random() - 0.5) * 5, 4 + Math.random() * 4, (Math.random() - 0.5) * 5)); o.w.set(Math.random() * 10 - 5, Math.random() * 10 - 5, Math.random() * 10 - 5); hit(1.2, 'hit', 0.2); ev('cone'); } continue; }
        if (o.kind !== 'car') continue;
        const dx = cx - o.x; const dz = cz - o.z; const d = Math.hypot(dx, dz); const min = rad + o.r;
        if (d >= min || d < 1e-4) continue;
        const nx = dx / d; const nz = dz / d; S.x += nx * (min - d); S.z += nz * (min - d);
        const rel = Math.abs(S.v - (o.lane > 0 ? o.v : -Math.abs(o.v)) * Math.sign(S.v || 1));
        if (o.hitT && S.t - o.hitT < 1.2) { S.v *= 0.9; continue; }
        if (rel > 2.5) { o.hitT = S.t; hit(clamp((rel - 2) * 0.9, 1, 18), 'hit', 0.5); crash(cx, cz, rel); S.v *= 0.35; o.v *= 0.2; o.pull = 2.5; if (window.__sgLog) window.__sgLog.push(['car', key, o.lane, Math.round(rel), Math.round(S.s), Math.round(S.lat * 10) / 10]); }
      }
    }
  }
  function crash(x, z, imp) {
    S.crash = Math.min(1, 0.4 + imp / 20); ev('crash', { imp }); car.cake.jolt(3 + imp * 0.5); car.cake.lean = Math.min(1, car.cake.lean + imp / 60);
    const p = new THREE.Vector3(x, S.y + 0.6, z);
    for (let i = 0; i < 20 + imp * 2; i++) world.emit({ p, v: new THREE.Vector3((Math.random() - 0.5) * 10, 2 + Math.random() * 6, (Math.random() - 0.5) * 10), life: 0.5 + Math.random() * 0.4, s0: 0.14, s1: 0.05, color: 0xFFC24A, add: true, grav: -16, drag: 0.95 });
    const top = new THREE.Vector3(0, 1.8, -0.75).applyAxisAngle(UP, S.h).add(new THREE.Vector3(S.x, S.y, S.z));
    for (let i = 0; i < 10 + imp; i++) world.emit({ p: top, v: new THREE.Vector3((Math.random() - 0.5) * 5, 2 + Math.random() * 4, (Math.random() - 0.5) * 5), life: 1, s0: 0.22, s1: 0.16, color: Math.random() < 0.75 ? 0xFFF7EC : 0xFF6FA3, grav: -12, drag: 0.92 });
    for (let i = 0; i < 8; i++) world.emit({ p: p.clone().setY(S.y + 0.4), v: new THREE.Vector3((Math.random() - 0.5) * 4, 1 + Math.random() * 2, (Math.random() - 0.5) * 4), life: 1.3, s0: 0.8, s1: 3, color: 0xEDE4D8, alpha: 0.5, drag: 0.75 });
  }

  // traffic, flying cones and the police
  function stepDyn(dt) {
    for (const o of st.dyn) {
      if (o.kind === 'cone') { if (!o.hit) continue; o.v.y -= 22 * dt; o.g.position.addScaledVector(o.v, dt); o.g.rotation.x += o.w.x * dt; o.g.rotation.z += o.w.z * dt; if (o.g.position.y < 0) { o.g.position.y = 0; o.v.multiplyScalar(0.45); o.v.y = Math.abs(o.v.y) * 0.4; o.w.multiplyScalar(0.6); } o.x = o.g.position.x; o.z = o.g.position.z; continue; }
      if (o.kind !== 'car') continue;
      o.pull = Math.max(0, (o.pull || 0) - dt);
      const out = o.lat != null && o.lat > W / 2 + 0.8; const want = o.pull > 0 ? (o.lane > 0 && out ? 3 : Math.abs(o.v0) * 0.8) : Math.abs(o.v0);
      const sp0 = Math.abs(o.v); o.v = Math.sign(o.v0) * (sp0 + clamp(want - sp0, -10 * dt, 4 * dt));
      o.s += o.v * dt;
      const dodge = o.lane < 0 && S.lat < 1.2 && o.s - S.s > -4 && o.s - S.s < 40 ? -1.3 : 0; const latT = o.pull > 0 && o.lane > 0 ? W / 2 + 1.7 : o.lane + dodge; o.lat = o.lat == null ? o.lane : lerp(o.lat, latT, Math.min(1, dt * 2));
      if (o.s < 1 || o.s > tr.L - 1) { o.g.visible = false; o.x = 1e6; o.z = 1e6; continue; }
      const b = tr.at(o.s); o.x = b.p.x + b.r.x * o.lat; o.z = b.p.z + b.r.z * o.lat; o.g.visible = true;
      o.g.position.set(o.x, (st.hfn ? st.hfn(o.x, o.z) : 0) + 0.02, o.z); o.g.rotation.y = b.head + (o.v < 0 ? Math.PI : 0) + (o.pull > 0 && o.lane > 0 ? 0.18 : 0);
    }
    // the police: they join the chase, close in, and ram you
    if (sp.cops) {
      const flash = Math.floor(S.t * 7) % 2;
      for (const c of sp.cops) {
        if (!c.active) { if (S.s >= c.joinAt) { c.active = true; c.s = Math.max(1, S.s - 38); c.v = Math.max(10, S.v); c.lat = LANE; c.g.visible = true; ev('cop'); } else continue; }
        const gap = S.s - c.s; const vT = clamp(S.v + (gap - 5) * 0.7, 0, 30);
        c.v += clamp(vT - c.v, -18 * dt, 14 * dt); c.s += c.v * dt;
        // dodge the roadblocks, then come for the car
        let lt = clamp(S.lat, -LANE, LANE); for (const b of sp.blocks || []) if (b.s - c.s > 0 && b.s - c.s < 18) lt = -b.lane * LANE;
        c.lat = lerp(c.lat, lt, Math.min(1, dt * 1.6));
        const b = tr.at(c.s); c.x = b.p.x + b.r.x * c.lat; c.z = b.p.z + b.r.z * c.lat;
        c.g.position.set(c.x, 0.02, c.z); c.g.rotation.y = b.head + clamp((lt - c.lat) * 0.3, -0.3, 0.3);
        c.lights[0].material.emissiveIntensity = flash ? 5 : 0.2; c.lights[1].material.emissiveIntensity = flash ? 0.2 : 5; c.pl.color.set(flash ? 0xFF2340 : 0x2F6BFF); c.pl.intensity = 35;
        const d = Math.hypot(S.x - c.x, S.z - c.z);
        if (d < 2.4 && S.t - c.hitT > 1.2) { c.hitT = S.t; hit(3, 'police', 0); S.v *= 0.78; c.v *= 0.5; car.cake.jolt(4); crash((S.x + c.x) / 2, (S.z + c.z) / 2, 6); }
      }
    }
    if (sp.flashers) { const on = Math.floor(S.t * 3) % 2; sp.flashers.forEach((l, i) => { l.intensity = (on + i) % 2 ? 14 : 0; }); }
  }

  // ------------------------------------------------------------ how it looks: the car, the cake, smoke and skids
  function pose(dt, c, nitroOn) {
    const g = car.g; g.position.set(S.x, S.y + 0.02, S.z);
    const slip = clamp(S.yawRate * Math.abs(S.v) * 0.022, -0.42, 0.42);
    g.rotation.set(0, S.h + slip, 0);
    let pitch = clamp(-(S.v - prevV) / Math.max(dt, 1e-4) * 0.0018, -0.06, 0.06);
    if (st.hfn) { const ahead = st.hfn(S.x + Math.sin(S.h) * 1.4, S.z + Math.cos(S.h) * 1.4); const behind = st.hfn(S.x - Math.sin(S.h) * 1.4, S.z - Math.cos(S.h) * 1.4); pitch += -Math.atan2(ahead - behind, 2.8); }
    if (key === 'jump' && !S.air) { const R = sp.ramp; if (S.s > R.s - 10 && S.s <= R.s) pitch -= 0.235; }
    if (S.air) pitch = clamp(-S.vy * 0.025, -0.4, 0.3);
    car.body.rotation.x = pitch; car.body.rotation.z = clamp(-S.yawRate * S.v * 0.0035, -0.08, 0.08) + (S.air ? S.roll : 0);
    for (const [nm, w] of Object.entries(car.wheels)) { w.rotation.x += S.v * dt / 0.36; if (/front/.test(nm)) w.rotation.y = S.steerS * 0.45; }
    car.cake.g.rotation.x = car.body.rotation.x; car.cake.g.rotation.z = car.body.rotation.z;
    // the cake feels the car's acceleration
    const pos = new THREE.Vector3(S.x, 0, S.z);
    if (dt > 0) { const vel = pos.clone().sub(prevPos).divideScalar(dt); const ac = vel.clone().sub(prevVel).divideScalar(dt); prevVel.copy(vel); const yaw = S.h; const ax = ac.x * Math.cos(yaw) - ac.z * Math.sin(yaw); const az = ac.x * Math.sin(yaw) + ac.z * Math.cos(yaw); car.cake.step(clamp(ax, -60, 60), clamp(az, -60, 60), dt); }
    prevPos.copy(pos);
    const night = key === 'night'; const on = night && S.lights;
    car.lights.forEach((l) => { l.intensity = on ? 120 : 0; }); car.lens.emissiveIntensity = on ? 3 : night ? 0.1 : 0.4; car.brakeM.emissiveIntensity = c.brake ? 3 : 0.4;
    // smoke and skid marks while sliding
    if (Math.abs(S.yawRate * S.v) > 17 && Math.abs(S.v) > 9 && !S.air) { for (const sx of [-0.55, 0.55]) { const wp = new THREE.Vector3(sx, 0, -1.05).applyAxisAngle(UP, S.h + slip).add(pos); world.skid(wp.x, S.y, wp.z, S.h + slip); if (Math.random() < 0.6) world.emit({ p: wp.clone().setY(S.y + 0.25), v: new THREE.Vector3((Math.random() - 0.5) * 2, 0.8 + Math.random(), (Math.random() - 0.5) * 2), life: 1.2, s0: 0.5, s1: 2.4, color: key === 'dunes' ? 0xEACB92 : 0xF3ECE2, alpha: 0.5, drag: 0.8 }); } if (S.t - (S.screechT || 0) > 1.4) { S.screechT = S.t; ev('screech'); } }
    if (key === 'dunes' && Math.abs(S.v) > 6 && Math.random() < 0.5) { const wp = new THREE.Vector3((Math.random() - 0.5), 0.2, -1.6).applyAxisAngle(UP, S.h).add(pos); wp.y += S.y; world.emit({ p: wp, v: new THREE.Vector3(0, 0.7, 0), life: 1.1, s0: 0.5, s1: 2, color: 0xEAD0A0, alpha: 0.45 }); }
    if (nitroOn) for (let i = 0; i < 3; i++) { const ex = new THREE.Vector3(0.35, 0.38, -1.85).applyAxisAngle(UP, S.h).add(pos); ex.y += S.y; world.emit({ p: ex, v: fwd().multiplyScalar(-6 - Math.random() * 4).add(new THREE.Vector3((Math.random() - 0.5), Math.random() * 0.5, (Math.random() - 0.5))), life: 0.28, s0: 0.6, s1: 0.1, color: Math.random() < 0.5 ? 0x6FD6FF : 0xFF8A3D, add: true }); }
    S.crash *= Math.pow(0.02, dt);
  }

  // ------------------------------------------------------------ the camera
  const cam = { pos: new THREE.Vector3(), look: new THREE.Vector3(), init: false, fov: 40 };
  function camera(dt, intro = 0) {
    const a = tr.at(S.s); const f = new THREE.Vector3(Math.sin(a.head), 0, Math.cos(a.head)); const r = a.r;
    const carPos = new THREE.Vector3(S.x, S.y, S.z);
    const hf = new THREE.Vector3(Math.sin(S.h), 0, Math.cos(S.h)); const dir = f.clone().lerp(hf, 0.4).normalize();
    let want = carPos.clone().addScaledVector(dir, -8.8).addScaledVector(r, 1.1).add(new THREE.Vector3(0, key === 'night' ? 4.2 : 4.9, 0));
    let look = carPos.clone().addScaledVector(dir, 5).add(new THREE.Vector3(0, 0.9, 0)); let fov = 40; let speed = 3.2;
    // parking and the pit: a high, steady view so you can judge the gap
    const near = key === 'park' ? Math.abs(S.s - sp.slot.s) < 30 : key === 'pit' ? Math.abs(S.s - sp.pit.s) < 34 : false;
    if (near || S.pit) { const tgt = key === 'park' ? tr.at(sp.slot.s) : tr.at(sp.pit.s); const tp = tgt.p.clone().addScaledVector(tgt.r, key === 'park' ? sp.slot.lat : LANE); want = tp.clone().lerp(carPos, 0.5).addScaledVector(tgt.r, -7).addScaledVector(tgt.t, -6).add(new THREE.Vector3(0, 15, 0)); look = tp.clone().lerp(carPos, 0.5); speed = 2.2; fov = 42; }
    if (key === 'pit' && sp.pit.roof) for (const m of sp.pit.roof) m.visible = !(near || S.pit); // lift the roof off for the view from above
    if (S.air || S.splashT) { want = carPos.clone().addScaledVector(r, 12).addScaledVector(hf, -2).add(new THREE.Vector3(0, 3.5, 0)); look = carPos.clone(); speed = 4; fov = 46; }
    if (S.nitroT > 0) { fov = 50; want.addScaledVector(dir, -1.5); }
    if (intro > 0) { const k = ease(1 - intro); const crane = carPos.clone().addScaledVector(dir, -24).addScaledVector(r, 8).add(new THREE.Vector3(0, 20, 0)); want = crane.lerp(want, k); look = carPos.clone().add(new THREE.Vector3(0, 0.6, 0)).lerp(look, k); speed = 30; }
    if (!cam.init) { cam.pos.copy(want); cam.look.copy(look); cam.init = true; }
    const k = 1 - Math.exp(-dt * speed); cam.pos.lerp(want, k); cam.look.lerp(look, Math.min(1, k * 1.6));
    const shake = S.crash * 0.7; const C = world.camera;
    C.position.copy(cam.pos).add(new THREE.Vector3((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake));
    if (st.hfn) C.position.y = Math.max(C.position.y, st.hfn(C.position.x, C.position.z) + 1.5);
    C.lookAt(cam.look); cam.fov = lerp(cam.fov, fov, 1 - Math.exp(-dt * 4)); C.fov = cam.fov; C.updateProjectionMatrix();
    world.sun.position.copy(carPos).add(new THREE.Vector3(34, 46, 20)); world.sun.target.position.copy(carPos);
  }

  pose(0, {}, false);
  return { S, step, camera, auto, get progress() { return st.finishS ? clamp(S.s / st.finishS, 0, 1) : clamp(S.s / tr.L, 0, 1); } };
}
