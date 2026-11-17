// SHOTGUN on the TV: the 3D road, the car, the screens between stages, Dolly, the music and the sounds.
// The phones' controls arrive as 'sg:in'; what happens on the road goes back to the server as 'sg:report'.
import { createWorld, THREE, lerp, clamp, ease, makeCake } from './world.js';
import { buildStage, lightTheme } from './stages.js';
import { makeCar, createDrive } from './drive.js';
import { buildEntrance, createEntrance } from './entrance.js';

const $ = (q) => document.querySelector(q); const esc = W.esc;
const Q = new URLSearchParams(location.search);
const TEST = Q.has('test'); const NORENDER = Q.has('norender'); const TSCALE = Math.max(1, Number(Q.get('tscale') || 1));
const socket = window.__gnSocket;
let S = null; let P = null;

// ---------------------------------------------------------------- boot
const world = createWorld($('#gl'), { pixelRatio: NORENDER && !Q.has('snap') ? 0.25 : undefined });
let car = null; let show = null;
const ready = (async () => { await document.fonts?.load?.('64px Bungee').catch(() => {}); car = await makeCar(world); show = await buildShowroom(); })();
$('#bOpen').onclick = async () => {
  AV.init(); await W.ready; $('#gate').classList.add('hide');
  try { if (!TEST) document.documentElement.requestFullscreen?.(); } catch (e) { /* fine */ }
  await ready; socket.connect();
};
const KEY = TEST ? 'sgHostTest' : 'sgHost';
socket.on('connect', () => {
  const saved = sessionStorage.getItem(KEY);
  const create = () => { const from = sessionStorage.getItem('gnPrev'); sessionStorage.removeItem('gnPrev'); socket.emit('host:create', { game: 'sg', test: TEST, from }, (r) => sessionStorage.setItem(KEY, r.code)); };
  if (saved) socket.emit('host:attach', { code: saved, game: 'sg' }, (r) => { if (r.error) { if (S && S.phase !== 'LOBBY') flash('The game server restarted, so that game ended. Here is a fresh one.', 9000); create(); } }); else create();
});
function goMenu() { if (S) sessionStorage.setItem('gnPrev', S.code); sessionStorage.removeItem(KEY); location.href = TEST ? '/tv?test' : '/tv'; }
socket.on('menu', goMenu);
socket.on('state', (s) => { W.syncClock(s.now); P = S; S = s; window.__S = s; onState(); });
socket.on('sg:in', onInput);
$('#bMusic').onclick = (e) => { e.target.textContent = AV.toggleMusic() ? 'Music on' : 'Music off'; lastMusic = null; music(); };
$('#bSfx').onclick = (e) => { e.target.textContent = AV.toggleSfx() ? 'Sounds on' : 'Sounds off'; };
$('#bVoice').onclick = (e) => { e.target.textContent = AV.toggleVoice() ? 'Dolly on' : 'Dolly off'; };
$('#bSkip').onclick = () => socket.emit('host:skip');
$('#bFull').onclick = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.());
document.addEventListener('keydown', (e) => { if (e.code === 'Space' && S && S.phase !== 'LOBBY') { e.preventDefault(); socket.emit('host:skip'); } });
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-tv]'); if (!b) return; const a = b.dataset.tv;
  if (a === 'bot') socket.emit('host:addBot', {}, (r) => { if (r?.error) flash(r.error); });
  if (a === 'fill') { const need = Math.max(0, 4 - S.players.length); for (let i = 0; i < need; i++) socket.emit('host:addBot', {}); }
  if (a === 'nobots') socket.emit('host:removeBots', {});
  if (a === 'start') socket.emit('host:start', {}, (r) => { if (r?.error) flash(r.error); });
});
function flash(t, ms = 2500) { const d = document.createElement('div'); d.className = 'flash'; d.textContent = t; document.body.appendChild(d); setTimeout(() => d.remove(), ms); }
if (TEST) window.__sgLog = [];
const report = (a) => { if (S?.stage?.tok) socket.emit('sg:report', { tok: S.stage.tok, ...a }); if (TEST && a.type === 'hit') window.__sgLog.push(['hit', S.stage.key, a.kind, a.amt]); };

// ---------------------------------------------------------------- the showroom: the car and the cake on a turntable
async function buildShowroom() {
  const g = new THREE.Group(); g.position.set(4000, 0, 4000); world.scene.add(g);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(60, 48), new THREE.MeshStandardMaterial({ color: 0xFFB98A, roughness: 0.8 })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; g.add(floor);
  const ped = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 4.9, 0.6, 48), new THREE.MeshStandardMaterial({ color: 0xFF4F8B, roughness: 0.35 })); ped.position.y = 0.3; ped.castShadow = true; ped.receiveShadow = true; g.add(ped);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(4.75, 0.12, 10, 64), new THREE.MeshStandardMaterial({ color: 0xFFD23F, metalness: 0.7, roughness: 0.3 })); rim.rotation.x = Math.PI / 2; rim.position.y = 0.6; g.add(rim);
  const balloons = [0xFF4F8B, 0xFFD23F, 0x3ED6A0, 0x4FB6FF, 0xC58BFF];
  for (let i = 0; i < 26; i++) { const a = (i / 26) * Math.PI * 2; const d = 9 + (i % 3) * 3; const b = new THREE.Mesh(new THREE.SphereGeometry(0.7, 16, 12), new THREE.MeshStandardMaterial({ color: balloons[i % 5], roughness: 0.25 })); b.position.set(Math.cos(a) * d, 2 + (i % 4) * 1.4, Math.sin(a) * d); b.scale.y = 1.15; b.castShadow = true; g.add(b); }
  const turn = new THREE.Group(); turn.position.y = 0.6; g.add(turn);
  return { g, turn, t: 0 };
}

// ---------------------------------------------------------------- stages: build each one while everyone reads their job
const cur = { tok: null, key: null, st: null, drive: null, E: null, ent: null, building: null };
async function ensureStage() {
  const sg = S?.stage; if (!sg || !car) return;
  if (cur.tok === sg.tok || cur.building === sg.tok) return;
  if (!['JOBS', 'DRIVE', 'ENTRANCE', 'PIT', 'RESULT'].includes(S.phase)) return;
  cur.building = sg.tok;
  if (cur.st) { cur.st.dispose(); cur.st = null; } if (cur.E) { cur.E.dispose(); cur.E = null; }
  cur.drive = null; cur.ent = null; world.clearParts(); world.clearSkids(); resetInputs();
  if (sg.key === 'entrance') {
    car.g.visible = false; const E = await buildEntrance(world, sg.seed);
    if (cur.building !== sg.tok) { E.dispose(); return; }
    cur.E = E; cur.ent = createEntrance(world, E); E.cake.lean = 0;
  } else {
    const st = await buildStage(world, sg.key, sg.seed);
    if (cur.building !== sg.tok) { st.dispose(); return; }
    car.g.visible = true; world.scene.add(world.skidMesh);
    car.cake.lean = clamp((100 - (S.cake || 100)) / 110, 0, 0.9); car.cake.g.visible = true;
    cur.st = st; cur.drive = createDrive(world, st, car, { allBots: allBots() });
    report({ type: 'track', pts: st.mapPts, marks: st.marks });
  }
  show.g.visible = false; cur.tok = sg.tok; cur.key = sg.key; cur.building = null;
}
function toShowroom() {
  if (!show || !car) return;
  if (cur.st) { cur.st.dispose(); cur.st = null; } if (cur.E) { cur.E.dispose(); cur.E = null; }
  cur.drive = null; cur.ent = null; cur.tok = null; world.clearParts(); world.clearSkids();
  lightTheme(world, 'city'); world.scene.fog = new THREE.Fog(0xFFC9A0, 40, 140);
  show.g.visible = true; car.g.visible = true; car.cake.g.visible = true; car.cake.lean = S?.phase === 'END' ? clamp((100 - (S.cake || 0)) / 110, 0, 0.9) : 0;
  show.turn.add(car.g); car.g.position.set(0, 0, 0); car.g.rotation.set(0, 0, 0); car.body.rotation.set(0, 0, 0);
  car.lights.forEach((l) => { l.intensity = 0; });
}

// ---------------------------------------------------------------- the controls coming in from the phones
let inputs = {}; let edges = {};
function resetInputs() { inputs = {}; edges = {}; }
function onInput(a) {
  if (!a || !a.p) return; const st = inputs[a.p] || (inputs[a.p] = {});
  const was = st[a.k]; st[a.k] = a.v;
  if (a.v && !was && ['gear', 'nitro', 'horn', 'lights'].includes(a.k)) edges[a.k] = true;
}
const player = (id) => S.players.find((p) => p.id === id);
const absent = (id) => { const p = id && player(id); return !p || p.bot || !p.connected || (TEST && Q.has('auto')); }; // ?test&auto: the autopilot drives for everyone
function allBots() { return S && ['left', 'right', 'gas', 'brake'].every((k) => absent(S.owner?.[k])); }
function controls() {
  const human = { edges }; edges = {};
  for (const k of ['left', 'right', 'gas', 'brake']) human[k] = Object.values(inputs).some((st) => st[k]);
  const hum = S.players.filter((p) => !p.bot && p.connected);
  human.lean = hum.length ? clamp(hum.reduce((t, p) => t + (inputs[p.id]?.lean || 0), 0) / hum.length * 1.4, -1, 1) : 0;
  const mask = {}; for (const k of ['left', 'right', 'gas', 'brake', 'gear', 'nitro', 'horn', 'lights']) mask[k] = absent(S.owner?.[k]);
  mask.lean = hum.length === 0;
  return { human, mask };
}
function lifts() {
  const o = { hL: 0, hR: 0, bL: 0, bR: 0, nL: 0, nR: 0 };
  for (const p of S.players) { const sd = S.sides?.[p.id] || 'L'; o[`n${sd}`]++; if (absent(p.id)) o[`b${sd}`]++; else if (inputs[p.id]?.lift) o[`h${sd}`]++; }
  return o;
}

// ---------------------------------------------------------------- the loop
let last = performance.now(); let posT = 0; let hudT = 0; let lastGo = null;
// the TV steps its quality down by itself if it can't keep up (or set it with ?q=0..3)
const perf = { t: 0, n: 0, slow: 0 };
if (Q.has('q')) world.setQuality(clamp(Number(Q.get('q')) || 0, 0, 3));
function watchSpeed(raw) {
  if (NORENDER || Q.has('q') || document.hidden || !cur.drive) return;
  perf.t += raw; perf.n++;
  if (perf.t < 4) return;
  const ms = (perf.t / perf.n) * 1000; perf.t = 0; perf.n = 0;
  perf.slow = ms > 26 ? perf.slow + 1 : 0;
  if (perf.slow >= 2 && world.quality() > 0) { world.setQuality(world.quality() - 1); perf.slow = 0; }
}
function frame(now) {
  const raw = (now - last) / 1000; if (raw < 1) watchSpeed(raw);
  const real = Math.min(0.05, raw); last = now;
  const n = TSCALE; for (let i = 0; i < n; i++) tick(real);
  if (!NORENDER) world.composer.render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.__sgRender = () => world.composer.render();

function tick(dt) {
  if (!S || !car || !show) return;
  world.stepParts(dt);
  const paused = !!(S.ctl?.paused || S.ctl?.quit);
  const ph = S.phase;
  if (show.g.visible) { show.turn.rotation.y += dt * 0.35; const c = world.camera; const t = performance.now() / 1000; c.position.set(4000 + Math.sin(t * 0.08) * 13, 5.8, 4000 + Math.cos(t * 0.08) * 13); c.lookAt(4000, 1.5, 4000); c.fov = 40; c.updateProjectionMatrix(); world.sun.position.set(4020, 40, 4015); world.sun.target.position.set(4000, 0, 4000); return; }
  if (cur.drive && cur.tok === S.stage?.tok) {
    const d = cur.drive; const goIn = S.stage.go ? S.stage.go - W.now() : 0;
    if ((ph === 'DRIVE' || ph === 'JOBS') && (paused || goIn > 0 || ph === 'JOBS')) { posT += dt; if (posT > 0.5) { posT = 0; sendPos(d); } } // the co-pilot's map shows up before GO
    if (ph === 'DRIVE' && !paused && goIn <= 0) {
      const { human, mask } = controls();
      const out = d.step(dt, human, mask);
      for (const h of out.hits) report({ type: 'hit', amt: h.amt, kind: h.kind });
      for (const e of out.events) onEvent(e);
      posT += dt; if (posT > 0.16) { posT = 0; sendPos(d); }
      d.camera(dt);
    } else if (ph === 'PIT') { d.step(dt, { edges: {} }, {}); pitCrew(dt); d.camera(dt); }
    else if (ph === 'DRIVE' || ph === 'JOBS') { d.camera(dt, ph === 'JOBS' ? 1 : clamp(goIn / 3500, 0, 1)); }
    else { d.step(dt, { edges: {} }, {}); d.camera(dt); }
    engine(d.S, ph === 'DRIVE' && !paused);
  } else engine(null, false);
  if (cur.ent && cur.tok === S.stage?.tok) {
    const e = cur.ent; const goIn = S.stage.go ? S.stage.go - W.now() : 0;
    if (ph === 'ENTRANCE' && !paused && goIn <= 0) { const out = e.step(dt, lifts(), S.cake); for (const h of out.hits) report({ type: 'hit', amt: h.amt, kind: h.kind }); for (const ev of out.events) onEvent(ev); posT += dt; if (posT > 0.15) { posT = 0; report({ type: 'pos', x: 0, z: 0, h: 0, p: Math.round(e.progress * 1000) / 1000, r: Math.round(e.S.roll * 100) / 100 }); } }
    else if (ph === 'JOBS' || (ph === 'ENTRANCE' && goIn > 0)) { e.step(0.0001, { hL: 0, hR: 0, bL: 0, bR: 0, nL: 1, nR: 1 }, S.cake); }
    else e.step(0, { hL: 0, hR: 0, bL: 0, bR: 0, nL: 1, nR: 1 }, S.cake);
  }
  hudT += dt; if (hudT > 0.1) { hudT = 0; hud(); }
}
function pitCrew(dt) {
  const crew = cur.st?.special.crew; if (!crew) return; const S2 = cur.drive.S; const t = performance.now() / 1000;
  crew.forEach((p, i) => { const a = (i / crew.length) * Math.PI * 2 + t * 0.6; const tx = S2.x + Math.cos(a) * 2.2; const tz = S2.z + Math.sin(a) * 2.6; p.position.x = lerp(p.position.x, tx, Math.min(1, dt * 4)); p.position.z = lerp(p.position.z, tz, Math.min(1, dt * 4)); p.position.y = Math.abs(Math.sin(t * 9 + i)) * 0.3; p.rotation.y = a + Math.PI; });
  if (Math.random() < dt * 3) world.emit({ p: new THREE.Vector3(S2.x + (Math.random() - 0.5) * 3, 0.6, S2.z + (Math.random() - 0.5) * 3), v: new THREE.Vector3((Math.random() - 0.5) * 3, 3 + Math.random() * 3, (Math.random() - 0.5) * 3), life: 0.5, s0: 0.15, s1: 0.05, color: 0xFFC24A, add: true, grav: -14 });
}

// ---------------------------------------------------------------- what happened on the road: sounds, pops and Dolly
function onEvent(e) {
  const fx = (n, o) => AV.fx(n, o);
  switch (e.k) {
    case 'crash': fx('sg-crash', { gap: 300 }); if (e.imp > 8) { fx('sg-splat', { gap: 400 }); cakeHit(); } break;
    case 'cone': fx('sg-bump', { gap: 150 }); break;
    case 'screech': fx('sg-screech', { gap: 900 }); break;
    case 'horn': fx('sg-horn', { gap: 250 }); popOut('HONK!'); break;
    case 'nitro': fx('sg-nitro'); popOut('NITRO!'); report({ type: 'say', k: 'nitro' }); break;
    case 'gear': fx('sg-msg', { gap: 100 }); popOut(e.g === 'R' ? 'REVERSE' : 'DRIVE'); break;
    case 'lights': fx('sg-wiper', { gap: 100 }); if (e.flat) popOut('BATTERY FLAT!'); break;
    case 'jump': fx('sg-jump'); break;
    case 'land': fx('sg-land'); if (e.imp > 6) { fx('sg-splat'); cakeHit(); popOut('OOF!'); } else popOut('NAILED IT!'); break;
    case 'splash': fx('sg-splat'); fx('sg-gasp'); popOut('SPLASH!'); cakeHit(); break;
    case 'bump': fx('sg-bump', { gap: 300 }); fx('sg-wobble', { gap: 1500 }); break;
    case 'cop': fx('sg-siren', { gap: 2000 }); break;
    case 'done': fx('sg-cheer'); report({ type: 'done', t: Math.round(cur.drive?.S.t || 0) }); confetti(); break;
    case 'pit': fx('sg-wrench'); report({ type: 'pit' }); break;
    case 'say': report({ type: 'say', k: e.s }); if (e.s === 'steps') popOut('LIFT TOGETHER!'); else popOut(e.s === 'uncle' ? 'DANCING UNCLE!' : e.s === 'waiter' ? 'WAITER!' : 'TODDLER!'); fx('sg-gasp', { gap: 800 }); break;
    case 'stepsOk': popOut('SMOOTH!'); break;
    case 'fell': fx('sg-splat'); fx('sg-gasp'); report({ type: 'done', fell: true }); break;
    default: break;
  }
  if (e.k === 'done' && cur.ent) { /* the cake reached the head table */ }
}
function cakeHit() { const c = document.querySelector('.cakebox'); if (c) { c.classList.remove('hit'); void c.offsetWidth; c.classList.add('hit'); } }
function popOut(html) { const p = $('#pop'); p.innerHTML = html; p.classList.remove('on'); void p.offsetWidth; p.classList.add('on'); }
function confetti() { const pos = car.g.position.clone(); for (let i = 0; i < 80; i++) world.emit({ p: pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 10, 6 + Math.random() * 4, (Math.random() - 0.5) * 10)), v: new THREE.Vector3((Math.random() - 0.5) * 2, -1 - Math.random(), (Math.random() - 0.5) * 2), life: 2.4, s0: 0.22, s1: 0.22, color: [0xFF4F8B, 0xFFD23F, 0x3ED6A0, 0x4FB6FF][Math.floor(Math.random() * 4)], square: true, grav: -2, drag: 0.98, rot: 6 }); }

// the engine note follows the speed; the siren follows the nearest police car
function sendPos(d) { const cops = cur.st.special.cops?.filter((c) => c.active).map((c) => [Math.round(c.x), Math.round(c.z)]); report({ type: 'pos', x: Math.round(d.S.x * 10) / 10, z: Math.round(d.S.z * 10) / 10, h: Math.round(d.S.h * 100) / 100, p: Math.round(d.progress * 1000) / 1000, cops }); }
let engEl = null; let sirEl = null;
function loopEl(name) { const el = new Audio(`/assets/sfx/${name}.mp3`); el.loop = true; el.preservesPitch = false; el.mozPreservesPitch = false; el.webkitPreservesPitch = false; el.volume = 0; return el; }
function engine(st, on) {
  if (NORENDER) return;
  const sfx = AV.sfxEnabled?.() ?? true;
  if (!engEl) { engEl = loopEl('sg-engine'); sirEl = loopEl('sg-siren'); }
  const want = on && sfx && st;
  if (want) { if (engEl.paused) engEl.play().catch(() => {}); engEl.volume = 0.22; engEl.playbackRate = clamp(0.75 + Math.abs(st.v) / 25 * 0.85 + (st.nitroT > 0 ? 0.25 : 0), 0.6, 2); } else if (!engEl.paused) engEl.pause();
  const cops = cur.st?.special.cops?.filter((c) => c.active) || [];
  if (want && cops.length) { const d = Math.min(...cops.map((c) => Math.hypot(c.x - st.x, c.z - st.z))); if (sirEl.paused) sirEl.play().catch(() => {}); sirEl.volume = clamp(0.45 - d / 120, 0.05, 0.45); } else if (!sirEl.paused) sirEl.pause();
}

// ---------------------------------------------------------------- state changes
let lastPhase = null; let lastCue = null; let callTimer = null; let lastFx = 0; let lastPlayers = 0;
function onState() {
  if (!car) return;
  const ph = S.phase;
  if (['LOBBY', 'INTRO', 'MAP', 'END'].includes(ph) && !show.g.visible) toShowroom();
  if (['LOBBY', 'INTRO', 'MAP', 'END'].includes(ph) && show.g.visible && car.g.parent !== show.turn) toShowroom();
  if (['JOBS', 'DRIVE', 'ENTRANCE', 'PIT', 'RESULT'].includes(ph) && S.stage && cur.tok !== S.stage.tok) { if (car.g.parent !== world.scene) world.scene.add(car.g); ensureStage(); }
  document.body.dataset.phase = ph;
  screen(); hud(); dolly(); music();
  // sounds the server asked for
  const fresh = (S.fx || []).filter((f) => f.id > lastFx);
  if (P === null) lastFx = Math.max(0, ...(S.fx || []).map((f) => f.id)); else fresh.forEach((f) => { lastFx = Math.max(lastFx, f.id); AV.fx(f.name, { gap: 200 }); });
  if (ph === 'LOBBY' && S.players.length > lastPlayers && P) AV.fx('sg-msg');
  lastPlayers = S.players.length;
  if (P && P.cake > S.cake + 0.5 && ['DRIVE', 'ENTRANCE'].includes(ph)) cakeHit();
  lastPhase = ph;
}
const MOOD = { calm: 'calm', panic: 'panic', furious: 'furious', happy: 'relieved' };
function dolly() {
  const cue = S.cue; const box = $('#call');
  if (cue && cue.id !== lastCue) {
    lastCue = cue.id; $('#dolly').src = `/assets/img/${['INTRO', 'END'].includes(S.phase) ? '' : 't-'}sg-dolly-${MOOD[cue.mood] || 'calm'}.webp`; $('#callText').textContent = cue.text;
    box.classList.toggle('big', S.phase === 'INTRO'); box.classList.add('on', 'ring'); clearTimeout(callTimer); AV.fx('sg-msg', { gap: 400 });
    setTimeout(() => box.classList.remove('ring'), 800);
    AV.speak(cue, (id) => { socket.emit('host:cueDone', { id }); callTimer = setTimeout(() => { if (lastCue === id) box.classList.remove('on'); }, 1400); });
  } else if (!cue && lastCue && !AV.speakingId()) { callTimer = callTimer || setTimeout(() => { box.classList.remove('on'); callTimer = null; }, 1400); }
  if (S.phase === 'LOBBY') box.classList.remove('on');
}
let lastMusic = null;
function music() {
  const ph = S.phase; let key = 'sg-lobby';
  if (['DRIVE', 'PIT', 'ENTRANCE'].includes(ph) && S.stage) key = ph === 'PIT' ? 'sg-pit' : S.stage.music;
  if (ph === 'JOBS' && S.stage?.key === 'entrance') key = 'sg-entrance';
  if (ph === 'END') key = S.x.ending === 'ruined' ? 'sg-lose' : 'sg-win';
  AV.setBed(['DRIVE', 'ENTRANCE'].includes(ph) ? 0.4 : 0.5);
  if (key !== lastMusic) { lastMusic = key; AV.music(key, 'lobby'); }
}

// ---------------------------------------------------------------- the screens between stages
const ATOM = { left: ['Left', '#4FB6FF'], right: ['Right', '#FFD23F'], gas: ['Gas', '#3ED6A0'], brake: ['Brake', '#FF6B5A'], gear: ['Gearbox', '#C58BFF'], nitro: ['Nitro', '#FF8A3D'], horn: ['Horn', '#FF4F8B'], lights: ['Lights', '#FFF6E9'], nav: ['Map', '#9BE86B'] };
const chips = (atoms) => `<div class="chips">${atoms.map((a) => `<span class="chip" style="--c:${ATOM[a][1]}">${ATOM[a][0]}</span>`).join('')}</div>`;
const nameOf = (id) => esc(player(id)?.name || 'Someone');
let lastScreen = '';
function screen() {
  const ph = S.phase; const x = S.x || {}; let h = '';
  if (ph === 'LOBBY') {
    const n = S.players.length;
    h = `<div class="scr lobby"><div class="left"><div class="logo">SHOTGUN</div><div class="tag">Deliver the cake. Together.</div>
      <div class="how"><p><b>One car.</b> Everyone controls one part of it on their phone.</p><p><b>One cake.</b> Five tiers in the back seat. Every crash shows.</p><p><b>One wedding.</b> Dolly the planner is calling. She is not calm.</p></div></div>
      <div class="join card">${S.qr ? `<img src="${S.qr}" alt="QR code">` : ''}<div class="code">${esc(S.code)}</div><small>${esc((S.joinUrl || '').replace(/^https?:\/\//, '').replace(/\?.*$/, ''))}</small><small>2 to 8 players. Start from the first phone.</small>
      ${TEST ? '<div class="botbar"><button data-tv="bot">Add bot</button><button data-tv="fill">Fill to 4</button><button data-tv="nobots">No bots</button><button data-tv="start">Start</button></div>' : ''}</div>
      ${n ? '' : '<div class="note">Scan the code to get in the car</div>'}
      <div class="crew">${S.players.map((p) => `<div class="who">${W.bust(p, 'sm')}${esc(p.name)}${p.bot ? ' (bot)' : ''}</div>`).join('')}</div></div>`;
  } else if (ph === 'INTRO') {
    h = `<div class="scr intro">${S.step === 'rules' ? '<div class="rules"><div class="card"><b>Your job</b>is on your phone. Do it, and only it.</div><div class="card"><b>The cake</b>loses a bit with every bump and crash.</div><div class="card"><b>Talk</b>Shout at each other. That is the game.</div></div>' : ''}</div>`;
  } else if (ph === 'MAP') {
    const opts = x.opts || [];
    h = `<div class="scr mapv"><div class="art" style="background-image:url(/assets/img/sg-map.webp)"></div><div class="top"><div class="big">Which way?</div><div class="tag">Vote on your phones</div></div>
      <div class="opts">${opts.map((o, i) => `<div class="opt card ${x.win != null ? (x.win === i ? 'win' : 'lose') : ''}"><img src="/assets/img/t-sg-stage-${o.key === 'entrance' ? 'entrance' : o.key}.webp" alt=""><div class="route">${o.route}</div><h3>${esc(o.title)}</h3><div class="votes" id="v${i}">${'<i></i>'.repeat(o.votes)}</div></div>`).join('')}</div></div>`;
  } else if (ph === 'JOBS') {
    const k = S.stage?.key; const ent = k === 'entrance';
    const rows = ent ? S.players.map((p, i) => `<div class="jrow card" style="animation-delay:${i * 0.07}s">${W.bust(p, 'sm')}<div><b>${esc(p.name)}</b><small>Holds the ${S.sides?.[p.id] === 'R' ? 'right' : 'left'} side</small></div><span class="side">${S.sides?.[p.id] === 'R' ? 'RIGHT' : 'LEFT'}</span></div>`).join('')
      : (S.jobs || []).map((j, i) => { const p = player(j.pid); return `<div class="jrow card" style="animation-delay:${i * 0.07}s">${W.bust(p, 'sm')}<div><b>${esc(j.role)}</b><small>${esc(p?.name || '')}${p?.bot ? ' (bot)' : ''}</small></div>${chips(j.atoms)}</div>`; }).join('');
    h = `<div class="scr jobs"><div class="art"><img src="/assets/img/sg-stage-${k}.webp" alt=""></div><div class="list"><h2>${ent ? 'Who holds what' : `Stage ${(S.stage?.i || 0) + 1} of ${S.stage?.total || 6}: the jobs`}</h2>${rows}</div></div>`;
  } else if (ph === 'RESULT') {
    h = `<div class="scr result"><div class="card"><div class="lbl">${esc(S.stage?.title || '')}</div>${x.gone ? '<div class="pct">SPLAT</div><div class="lost">The cake is gone.</div>' : `<div class="lbl">The cake</div><div class="pct">${Math.round(x.cake)}%</div><div class="lost">${x.lost ? `Lost ${x.lost}% on this stage` : 'Not a scratch!'}</div>`}${x.late ? '<div class="stamp">LATE: ICING MELTED</div>' : ''}${x.pit ? `<div class="lost">Pit crew fixed ${x.pit.fix}%</div>` : ''}</div></div>`;
  } else if (ph === 'PIT') {
    h = `<div class="scr pit"><div class="card"><div class="big">${x.step === 'done' ? `+${x.fix}% cake` : 'PIT STOP'}</div><p>${x.step === 'done' ? 'Back on the road!' : `Everyone, look at your phone! ${x.done || 0} of ${S.players.length} done`}</p></div></div>`;
  } else if (ph === 'END') {
    const art = x.ending === 'perfect' ? 'sg-end-perfect' : x.ending === 'damaged' ? 'sg-end-damaged' : 'sg-end-ruined';
    h = `<div class="scr end"><div class="art" style="background-image:url(/assets/img/${art}.webp)"></div><div class="box"><div class="card"><small>The cake</small><div class="pct">${x.cake}%</div><div class="stages">${(x.results || []).map((r) => `<span class="${r.lost > 12 || r.late ? 'bad' : ''}">${esc(SAYT[r.key] || r.key)} -${r.lost}%</span>`).join('')}</div></div>
      ${(x.awards || []).length ? `<div class="awards">${x.awards.map((a) => `<div class="card award"><small>${esc(a.title)}</small><b>${nameOf(a.who)}</b><small>${esc(a.text)}</small></div>`).join('')}</div>` : ''}</div></div>`;
  }
  if (h !== lastScreen) { lastScreen = h; $('#screen').innerHTML = h; }
}
const SAYT = { rush: 'Rush Hour', park: 'Parking', night: 'Night Road', jump: 'The Jump', chase: 'Police', pit: 'Pit Stop', dunes: 'Dunes' };

// ---------------------------------------------------------------- the driving HUD
let lastHud = '';
function hud() {
  const el = $('#hud'); const ph = S?.phase;
  const on = ['DRIVE', 'PIT', 'ENTRANCE'].includes(ph) && S.stage && cur.tok === S.stage.tok;
  el.hidden = !on; if (!on) { $('#count').innerHTML = ''; return; }
  const d = cur.drive?.S; const ent = cur.ent; const k = S.stage.key;
  const left = W.left(S.endsAt); const secs = Math.ceil(left / 1000);
  const goIn = S.stage.go ? S.stage.go - W.now() : 0;
  const cnt = goIn > 2400 ? '3' : goIn > 1300 ? '2' : goIn > 200 ? '1' : goIn > -700 ? 'GO!' : '';
  const ce = $('#count'); if (ce.dataset.c !== cnt) { ce.dataset.c = cnt; ce.innerHTML = cnt ? `<span>${cnt}</span>` : ''; }
  const cake = Math.round(S.cake);
  const jobsBar = (S.jobs || []).map((j) => { const p = player(j.pid); const act = j.atoms.some((a) => d?.ctl?.[a]) || (j.atoms.includes('horn') && d && d.t - d.horned < 0.8) || (j.atoms.includes('nitro') && d?.nitroT > 0); return `<div class="job ${act ? 'on' : ''} ${p?.bot ? 'bot' : ''}" style="--c:${ATOM[j.atoms[0]][1]}">${W.bust(p, 'sm')}<div><b>${esc(j.role)}</b><small>${esc(p?.name || '')}</small></div></div>`; }).join('');
  let prompt = ''; let extra = '';
  if (d && ph === 'DRIVE') {
    if (k === 'park') prompt = d.parkOk ? 'HOLD IT...' : Math.abs(d.s - (cur.st.special.slot?.s || 0)) < 14 && d.gear !== 'R' && d.s > cur.st.special.slot.s ? 'GEARBOX: REVERSE!' : '';
    if (k === 'pit') prompt = d.boxOk ? 'HOLD IT...' : Math.abs(d.s - cur.st.special.pit.s) < 25 ? 'STOP IN THE BOX!' : '';
    if (k === 'jump') prompt = d.air ? 'LEAN TO LEVEL IT!' : d.s > cur.st.special.ramp.s - 60 && d.s < cur.st.special.ramp.s ? (d.v < 22 ? 'MORE SPEED!' : 'HOLD ON!') : '';
    if (k === 'night' && !d.lights && d.battery > 30) prompt = 'LIGHTS!';
    if (d.off && Math.abs(d.v) > 6) prompt = 'GET BACK ON THE ROAD!';
    const nitro = [0, 1, 2].map((i) => `<i class="n ${i < d.nitro ? '' : 'used'}"></i>`).join('');
    extra = `<div class="gauge"><div class="spd">${Math.round(Math.abs(d.v) * 4)}<small> km/h</small></div><div class="row"><span class="gear ${d.gear === 'R' ? 'r' : ''}">${d.gear}</span>${nitro}</div>${k === 'night' ? `<div class="bat"><span style="width:${Math.round(d.battery)}%"></span></div>` : ''}</div>`;
  }
  let prog = cur.drive ? cur.drive.progress : ent ? ent.progress : 0;
  if (ent && ph === 'ENTRANCE') {
    const L = lifts(); const tilt = ent.S.roll;
    if (ent.S.warn > 0.5) prompt = tilt > 0 ? 'RIGHT SIDE, LIFT!' : 'LEFT SIDE, LIFT!';
    if (ent.S.stepWarned && !ent.S.stepDone.has(0)) prompt = 'LIFT TOGETHER!';
    const side = (sd) => S.players.filter((p) => (S.sides?.[p.id] || 'L') === sd).map((p) => `<span class="bust ${inputs[p.id]?.lift || (absent(p.id) && (sd === 'L' ? ent.S.lift.L : ent.S.lift.R) > 0.5) ? 'up' : ''}" style="--c:${p.color}">${W.bustSrc(p.bust, true) ? `<img src="${W.bustSrc(p.bust, true)}" alt="">` : ''}</span>`).join('');
    extra = `<div class="lift"><div class="side card"><b>LEFT</b><div class="ppl">${side('L')}</div></div><div class="side card"><b>RIGHT</b><div class="ppl">${side('R')}</div></div></div><div class="tiltm"><i style="left:${clamp(50 + tilt * 90, 2, 98)}%"></i></div>`;
    void L;
  }
  const html = `<div class="logo">SHOTGUN</div><div class="pill"><small>${k === 'entrance' ? 'The finale' : `Stage ${S.stage.i + 1} of ${S.stage.total}`}</small><b>${esc(S.stage.title)}</b></div>
    <div class="prog"><span style="width:${Math.round(prog * 100)}%"></span><i style="left:${Math.round(prog * 100)}%"></i><em>💒</em></div>
    <div class="clock ${secs <= 10 && ph === 'DRIVE' ? 'low' : ''}">0:${String(Math.max(0, Math.min(99, secs))).padStart(2, '0')}</div>
    <div class="cakebox ${cake < 50 ? 'low' : ''}"><div class="ic"><i></i><i></i><i></i><i></i><i></i></div><div class="meter"><small>The cake</small><div class="bar"><span style="width:${cake}%"></span></div></div><b>${cake}%</b></div>
    ${ent ? '' : `<div class="jobsbar">${jobsBar}</div>`}${extra}<div id="prompt" class="${prompt ? 'on' : ''}">${esc(prompt)}</div>`;
  if (html !== lastHud) { lastHud = html; const hitNow = el.querySelector('.cakebox.hit'); el.innerHTML = html; if (hitNow) el.querySelector('.cakebox')?.classList.add('hit'); }
}
