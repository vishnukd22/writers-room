// TV sound: music beds that crossfade and duck under the narrator, sound effects, and the narrator voice.
window.AV = (() => {
  let ctx = null; let master = null; let musicBus = null; let sfxBus = null;
  let musicOn = true; let sfxOn = true; let voiceVol = 1;
  const init = () => {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = 1; master.connect(ctx.destination);
    musicBus = ctx.createGain(); musicBus.gain.value = 0.55; musicBus.connect(master);
    sfxBus = ctx.createGain(); sfxBus.gain.value = 0.8; sfxBus.connect(master);
  };
  const has = (dir, name) => W.manifest()[dir].includes(`${name}.mp3`);

  // ---------------------------------------------------------------- music
  // Each mood has a built-in stand-in score, used until a real track is dropped in.
  const MOODS = {
    lobby: { bpm: 84, prog: [[50, 53, 57, 60], [55, 59, 62, 65], [48, 52, 55, 59], [45, 48, 52, 55]], style: 'jazz' },
    casting: { bpm: 112, prog: [[60, 64, 67], [65, 69, 72], [67, 71, 74], [60, 64, 67]], style: 'pizz' },
    pitch: { bpm: 120, prog: [[57, 60, 64], [57, 60, 64], [53, 57, 60], [55, 59, 62]], style: 'tick' },
    writing: { bpm: 78, prog: [[48, 52, 55, 59], [45, 48, 52, 55], [41, 45, 48, 52], [43, 47, 50, 53]], style: 'lofi' },
    ratings: { bpm: 118, prog: [[60, 64, 67, 71], [62, 65, 69, 72], [64, 67, 71, 74], [65, 69, 72, 76]], style: 'show' },
    finale: { bpm: 90, prog: [[48, 55, 60, 64], [53, 57, 60, 65], [55, 59, 62, 67], [48, 55, 60, 64]], style: 'swell' },
    melodrama: { bpm: 96, prog: [[57, 60, 64], [56, 60, 63], [53, 57, 60], [52, 56, 59]], style: 'tabla' },
    tense: { bpm: 104, prog: [[45, 48, 52], [45, 48, 53], [44, 48, 52], [43, 47, 50]], style: 'pulse' },
    dark: { bpm: 70, prog: [[38, 45, 50], [37, 44, 49], [36, 43, 48], [35, 42, 47]], style: 'drone' },
    pop: { bpm: 116, prog: [[60, 64, 67], [55, 59, 62], [57, 60, 64], [53, 57, 60]], style: 'pop' },
    epic: { bpm: 92, prog: [[50, 57, 62], [46, 53, 58], [48, 55, 60], [45, 52, 57]], style: 'swell' },
    retro: { bpm: 112, prog: [[52, 55, 59], [50, 54, 57], [48, 52, 55], [47, 50, 54]], style: 'pop' },
    romantic: { bpm: 72, prog: [[53, 57, 60, 64], [52, 55, 59, 62], [50, 53, 57, 60], [55, 59, 62, 65]], style: 'lofi' },
    gentle: { bpm: 66, prog: [[48, 55, 60], [53, 57, 60], [45, 52, 57], [50, 55, 59]], style: 'drone' },
  };
  const hz = (m) => 440 * 2 ** ((m - 69) / 12);
  let synthTimer = null; let synthGain = null; let synthMood = null;
  function note(freq, t, dur, type, vol, dest, attack = 0.01) {
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest); o.start(t); o.stop(t + dur + 0.05);
  }
  function noise(t, dur, vol, dest, freq = 6000) {
    const b = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * dur)), ctx.sampleRate); const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const s = ctx.createBufferSource(); s.buffer = b; const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; const g = ctx.createGain(); g.gain.value = vol;
    s.connect(f).connect(g).connect(dest); s.start(t);
  }
  function startSynth(moodName) {
    stopSynth();
    const m = MOODS[moodName] || MOODS.lobby; synthMood = moodName;
    synthGain = ctx.createGain(); synthGain.gain.value = 0.0001; synthGain.connect(musicBus);
    synthGain.gain.exponentialRampToValueAtTime(0.5, ctx.currentTime + 1.5);
    const beat = 60 / m.bpm; let bar = 0; let next = ctx.currentTime + 0.1; const g = synthGain;
    const schedule = () => {
      while (next < ctx.currentTime + 0.6) {
        const ch = m.prog[bar % m.prog.length]; const t = next;
        // pad
        if (['jazz', 'lofi', 'swell', 'drone'].includes(m.style)) ch.forEach((n) => note(hz(n), t, beat * 4, 'triangle', m.style === 'swell' ? 0.07 : 0.05, g, m.style === 'swell' ? 0.6 : 0.08));
        else ch.forEach((n) => note(hz(n), t, beat * 3.8, 'sine', 0.035, g, 0.3));
        note(hz(ch[0] - 12), t, beat * 1.8, 'sine', 0.12, g); if (m.style !== 'drone') note(hz(ch[0] - 12), t + beat * 2, beat * 1.8, 'sine', 0.1, g);
        for (let k = 0; k < 4; k++) {
          const tk = t + k * beat;
          if (m.style === 'pizz') { note(hz(ch[k % ch.length] + 12), tk, 0.18, 'triangle', 0.1, g); note(hz(ch[(k + 1) % ch.length] + 12), tk + beat / 2, 0.15, 'triangle', 0.07, g); }
          if (m.style === 'jazz') { noise(tk, 0.08, 0.05, g, 9000); if (k % 2) note(hz(ch[(k + 2) % ch.length] + 12), tk + beat * 0.66, 0.25, 'sine', 0.05, g); }
          if (m.style === 'lofi') { if (k % 2 === 0) note(55, tk, 0.25, 'sine', 0.25, g, 0.005); else noise(tk, 0.12, 0.12, g, 1800); noise(tk + beat / 2, 0.05, 0.04, g, 8000); }
          if (m.style === 'tick') { noise(tk, 0.04, 0.12, g, 7000); noise(tk + beat / 2, 0.03, 0.06, g, 9000); if (k === 0) note(hz(ch[2] + 12), tk, 0.2, 'square', 0.03, g); }
          if (m.style === 'show' || m.style === 'pop') { if (k % 2 === 0) note(60, tk, 0.2, 'sine', 0.28, g, 0.005); else noise(tk, 0.1, 0.14, g, 2500); noise(tk + beat / 2, 0.04, 0.05, g, 8000); note(hz(ch[k % ch.length] + 12), tk + beat / 2, 0.2, 'square', 0.025, g); }
          if (m.style === 'pulse') { note(hz(ch[0]), tk, 0.12, 'sawtooth', 0.04, g); note(hz(ch[0]), tk + beat / 2, 0.12, 'sawtooth', 0.03, g); }
          if (m.style === 'tabla') { note(k % 2 ? 180 : 95, tk, 0.22, 'sine', 0.2, g, 0.003); note(240, tk + beat * 0.75, 0.1, 'sine', 0.08, g, 0.003); if (k === 0) note(hz(ch[2] + 12), tk, beat * 2, 'sawtooth', 0.025, g, 0.2); }
        }
        next += beat * 4; bar++;
      }
    };
    schedule(); synthTimer = setInterval(schedule, 200);
  }
  function stopSynth() {
    if (synthTimer) clearInterval(synthTimer); synthTimer = null;
    if (synthGain) { const g = synthGain; g.gain.cancelScheduledValues(ctx.currentTime); g.gain.setValueAtTime(g.gain.value, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.2); setTimeout(() => g.disconnect(), 1500); }
    synthGain = null; synthMood = null;
  }
  let current = { key: null, el: null, gain: null };
  // key: track file name (without .mp3); mood: built-in fallback
  // BID-COIN! borrows Writers' Room tracks until its own arrive
  const MUSIC_ALIAS = { 'bc-lobby': 'lobby', 'bc-auction': 'pitch', 'bc-reveal': 'ratings', 'bc-finale': 'finale' };
  function music(key, mood) {
    if (!ctx) return;
    const want = key && has('music', key) ? key : key && MUSIC_ALIAS[key] && has('music', MUSIC_ALIAS[key]) ? MUSIC_ALIAS[key] : null;
    const id = want || `synth:${mood}`;
    if (current.key === id) return;
    // fade out the old
    if (current.el) { const { el, gain } = current; gain.gain.cancelScheduledValues(ctx.currentTime); gain.gain.setValueAtTime(gain.gain.value, ctx.currentTime); gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 1.5); setTimeout(() => { el.pause(); el.src = ''; }, 1700); }
    if (synthGain && !id.startsWith('synth:')) stopSynth();
    current = { key: id, el: null, gain: null };
    if (!musicOn) return;
    if (want) {
      const el = new Audio(`/assets/music/${want}.mp3`); el.loop = true; el.crossOrigin = 'anonymous';
      const src = ctx.createMediaElementSource(el); const gain = ctx.createGain(); gain.gain.value = 0;
      src.connect(gain).connect(musicBus); el.play().catch(() => {});
      gain.gain.linearRampToValueAtTime(0.9, ctx.currentTime + 1.5);
      current.el = el; current.gain = gain;
    } else if (synthMood !== mood) startSynth(mood);
  }
  // bed: the music level when nobody is talking (lower while friends perform, so they can be heard)
  let bed = 0.55; let ducked = false;
  function duck(on) { ducked = on; if (!ctx) return; musicBus.gain.cancelScheduledValues(ctx.currentTime); musicBus.gain.setValueAtTime(musicBus.gain.value, ctx.currentTime); musicBus.gain.linearRampToValueAtTime(on ? Math.min(0.16, bed * 0.6) : bed, ctx.currentTime + (on ? 0.25 : 0.9)); }
  function setBed(v) { if (bed === v) return; bed = v; if (!ducked) duck(false); }

  // ---------------------------------------------------------------- sound effects
  const synthFx = {
    laugh: () => { for (let i = 0; i < 9; i++) noise(ctx.currentTime + i * 0.09 + Math.random() * 0.04, 0.08, 0.25, sfxBus, 900 + Math.random() * 900); },
    gasp: () => noise(ctx.currentTime, 0.5, 0.35, sfxBus, 2500),
    boo: () => { const o = ctx.createOscillator(); const g = ctx.createGain(); o.type = 'sawtooth'; o.frequency.setValueAtTime(160, ctx.currentTime); o.frequency.linearRampToValueAtTime(110, ctx.currentTime + 0.8); g.gain.setValueAtTime(0.12, ctx.currentTime); g.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.9); o.connect(g).connect(sfxBus); o.start(); o.stop(ctx.currentTime + 1); },
    applause: () => { for (let i = 0; i < 40; i++) noise(ctx.currentTime + i * 0.05 + Math.random() * 0.05, 0.05, 0.18, sfxBus, 2000 + Math.random() * 3000); },
    gavel: () => { noise(ctx.currentTime, 0.12, 0.8, sfxBus, 500); note(110, ctx.currentTime, 0.3, 'sine', 0.5, sfxBus, 0.002); noise(ctx.currentTime + 0.25, 0.12, 0.8, sfxBus, 500); },
    typewriter: () => { for (let i = 0; i < 10; i++) noise(ctx.currentTime + i * 0.11 + Math.random() * 0.05, 0.03, 0.3, sfxBus, 3500); note(2400, ctx.currentTime + 1.3, 0.6, 'sine', 0.15, sfxBus, 0.002); },
    bell: () => note(2400, ctx.currentTime, 0.8, 'sine', 0.2, sfxBus, 0.002),
    drumroll: () => { for (let i = 0; i < 30; i++) noise(ctx.currentTime + i * 0.05, 0.05, 0.1 + i * 0.012, sfxBus, 1500); noise(ctx.currentTime + 1.55, 0.5, 0.6, sfxBus, 4000); },
    dundun: () => { [0, 0.35, 0.7].forEach((t, i) => { note(hz(i === 2 ? 38 : 43), ctx.currentTime + t, i === 2 ? 1.6 : 0.3, 'sawtooth', 0.14, sfxBus, 0.01); note(hz(i === 2 ? 50 : 55), ctx.currentTime + t, i === 2 ? 1.6 : 0.3, 'sawtooth', 0.08, sfxBus, 0.01); }); },
    scratch: () => { const o = ctx.createOscillator(); const g = ctx.createGain(); o.type = 'sawtooth'; o.frequency.setValueAtTime(900, ctx.currentTime); o.frequency.exponentialRampToValueAtTime(120, ctx.currentTime + 0.35); g.gain.setValueAtTime(0.15, ctx.currentTime); g.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.4); o.connect(g).connect(sfxBus); o.start(); o.stop(ctx.currentTime + 0.45); },
    trombone: () => { [0, 0.35, 0.7, 1.05].forEach((t, i) => { const o = ctx.createOscillator(); const g = ctx.createGain(); o.type = 'sawtooth'; const f = [233, 220, 207, 196][i]; o.frequency.setValueAtTime(f, ctx.currentTime + t); if (i === 3) o.frequency.linearRampToValueAtTime(185, ctx.currentTime + t + 0.9); g.gain.setValueAtTime(0.0001, ctx.currentTime + t); g.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + t + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + (i === 3 ? 1 : 0.32)); o.connect(g).connect(sfxBus); o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 1.1); }); },
    thunder: () => noise(ctx.currentTime, 1.6, 0.9, sfxBus, 180),
    sting: () => { [55, 58, 61].forEach((m) => note(hz(m), ctx.currentTime, 1.2, 'sawtooth', 0.07, sfxBus, 0.005)); },
    whoosh: () => noise(ctx.currentTime, 0.45, 0.35, sfxBus, 1400),
    clapper: () => { noise(ctx.currentTime, 0.04, 1, sfxBus, 2500); },
    stamp: () => { noise(ctx.currentTime, 0.08, 0.9, sfxBus, 400); note(80, ctx.currentTime, 0.25, 'sine', 0.5, sfxBus, 0.002); },
    swell: () => { [48, 55, 60, 64].forEach((m) => note(hz(m), ctx.currentTime, 2.5, 'triangle', 0.08, sfxBus, 0.8)); },
    fanfare: () => { [[60, 0], [64, 0.15], [67, 0.3], [72, 0.45]].forEach(([m, t]) => note(hz(m), ctx.currentTime + t, t === 0.45 ? 1.2 : 0.2, 'square', 0.06, sfxBus, 0.01)); },
    join: () => { note(hz(76), ctx.currentTime, 0.3, 'sine', 0.15, sfxBus, 0.005); note(hz(83), ctx.currentTime + 0.12, 0.4, 'sine', 0.12, sfxBus, 0.005); },
    blip: () => { note(hz(84), ctx.currentTime, 0.09, 'square', 0.07, sfxBus, 0.002); note(hz(91), ctx.currentTime + 0.05, 0.12, 'square', 0.06, sfxBus, 0.002); },
    tick: () => { note(1200, ctx.currentTime, 0.06, 'square', 0.12, sfxBus, 0.001); noise(ctx.currentTime, 0.04, 0.3, sfxBus, 5000); },
    tick2: () => { [0, 0.12].forEach((t) => { note(1500, ctx.currentTime + t, 0.06, 'square', 0.12, sfxBus, 0.001); noise(ctx.currentTime + t, 0.04, 0.3, sfxBus, 5000); }); },
    thud: () => { note(70, ctx.currentTime, 0.18, 'sine', 0.4, sfxBus, 0.002); noise(ctx.currentTime, 0.06, 0.25, sfxBus, 700); },
    freeze: () => { [88, 95, 100, 107].forEach((m, i) => note(hz(m), ctx.currentTime + i * 0.05, 0.6, 'sine', 0.06, sfxBus, 0.005)); noise(ctx.currentTime, 0.5, 0.15, sfxBus, 9000); },
    door: () => { for (let i = 0; i < 14; i++) noise(ctx.currentTime + i * 0.07, 0.07, 0.22, sfxBus, 600 + i * 40); note(55, ctx.currentTime + 1.05, 0.4, 'sine', 0.4, sfxBus, 0.003); },
  };
  // Land Grab sounds fall back to these built-in ones until the real files arrive
  const ALIAS = { 'lg-stamp': 'stamp', 'lg-paper': 'whoosh', 'lg-murmur': 'gasp', 'lg-bus': 'trombone', 'lg-shutter': 'thunder', 'lg-cash': 'bell',
    // BID-COIN!
    'bc-bid': 'blip', 'bc-gavel': 'gavel', 'bc-door': 'door', 'bc-tick': 'tick', 'bc-tick2': 'tick2', 'bc-thud': 'thud', 'bc-cash': 'bell', 'bc-legend': 'fanfare',
    'bc-curse': 'dundun', 'bc-lock': 'stamp', 'bc-plant': 'scratch', 'bc-boom': 'fanfare', 'bc-bust': 'trombone', 'bc-freeze': 'freeze', 'bc-phantom': 'sting',
    'bc-steal': 'scratch', 'bc-tax': 'bell', 'bc-swap': 'whoosh', 'bc-appraise': 'bell' };
  const lastPlayed = {};
  const buffers = {};
  async function loadBuf(name) {
    if (buffers[name] !== undefined) return buffers[name];
    buffers[name] = null;
    try { const r = await fetch(`/assets/sfx/${name}.mp3`); buffers[name] = await ctx.decodeAudioData(await r.arrayBuffer()); } catch (e) { buffers[name] = null; }
    return buffers[name];
  }
  async function fx(name, opts = {}) {
    if (!ctx || !sfxOn) return;
    const gap = opts.gap ?? 120; if (Date.now() - (lastPlayed[name] || 0) < gap) return; lastPlayed[name] = Date.now();
    // no file of its own: borrow a real recording from another game if there is one (the gavel, the bell...)
    if (!has('sfx', name) && ALIAS[name] && has('sfx', ALIAS[name])) name = ALIAS[name];
    if (has('sfx', name)) {
      const b = await loadBuf(name);
      if (b) { const s = ctx.createBufferSource(); s.buffer = b; const g = ctx.createGain(); g.gain.value = opts.vol ?? 1; s.connect(g).connect(sfxBus); s.start(); return; }
    }
    (synthFx[name] || synthFx[ALIAS[name]])?.();
  }
  ['laugh', 'gasp', 'boo', 'applause', 'gavel', 'typewriter', 'bell', 'drumroll', 'dundun', 'scratch', 'trombone', 'thunder', 'sting', 'whoosh', ...Object.keys(ALIAS)].forEach((n) => W.ready.then(() => { if (ctx && has('sfx', n)) loadBuf(n); }));

  // ---------------------------------------------------------------- narrator
  let voiceEl = null; let speaking = null;
  let browserVoice = null;
  if ('speechSynthesis' in window) { const pv = () => { const vs = speechSynthesis.getVoices(); browserVoice = vs.find((v) => /en[-_]GB/i.test(v.lang)) || vs.find((v) => /^en/i.test(v.lang)) || null; }; pv(); speechSynthesis.onvoiceschanged = pv; }
  function speak(cue, onDone) {
    stopVoice();
    speaking = cue.id; duck(true);
    const finish = () => { if (speaking !== cue.id) return; speaking = null; duck(false); onDone(cue.id); };
    // if the voice fails, still leave the words up long enough to read
    const t0 = Date.now(); const readMs = 800 + (cue.text || '').length * 55;
    const fail = () => setTimeout(finish, Math.max(0, readMs - (Date.now() - t0)));
    if (cue.audio) {
      voiceEl = new Audio(cue.audio); voiceEl.volume = voiceVol;
      voiceEl.onended = finish; voiceEl.onerror = fail;
      voiceEl.play().catch(fail);
    } else if ('speechSynthesis' in window && voiceVol > 0) {
      const u = new SpeechSynthesisUtterance(cue.speak || cue.text); if (browserVoice) u.voice = browserVoice; u.rate = 1.02; u.pitch = cue.kind === 'char' ? 1.15 : 0.95;
      u.onend = () => (Date.now() - t0 < 500 ? fail() : finish()); u.onerror = fail; speechSynthesis.speak(u);
      setTimeout(() => { if (speaking === cue.id && !speechSynthesis.speaking) fail(); }, 2500);
    } else setTimeout(finish, readMs);
  }
  function stopVoice() { if (voiceEl) { voiceEl.onended = null; voiceEl.pause(); voiceEl = null; } if ('speechSynthesis' in window) speechSynthesis.cancel(); if (speaking) { speaking = null; duck(false); } }

  return {
    init, music, fx, speak, stopVoice, duck, setBed,
    toggleMusic() { musicOn = !musicOn; if (!musicOn) { if (current.el) current.el.pause(); stopSynth(); current = { key: null }; } return musicOn; },
    toggleSfx() { sfxOn = !sfxOn; return sfxOn; },
    toggleVoice() { voiceVol = voiceVol ? 0 : 1; if (voiceEl) voiceEl.volume = voiceVol; return voiceVol > 0; },
    speakingId: () => speaking,
  };
})();
