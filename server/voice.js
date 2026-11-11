'use strict';
// The narrator's voice: ElevenLabs text to speech, with a queue, a cache and graceful fallback.
const crypto = require('crypto');

const KEY = () => process.env.ELEVENLABS_API_KEY || '';
const enabled = () => !!KEY();
const MODEL = () => process.env.ELEVENLABS_MODEL || 'eleven_v3';
const NARRATOR = () => process.env.ELEVENLABS_VOICE_ID || 'JBFqnCBsd6RMkjVDRZzb'; // "George": warm storyteller
// Premade voices used for characters when the narrator doesn't read them. Override with ELEVENLABS_CHARACTER_VOICES.
const DEFAULT_CHAR_VOICES = [
  'EXAVITQu4vr4xnSDxMaL', 'TX3LPaxmHKxFdv7VOQHJ', 'XB0fDUnXU5powFXDhCwa', 'IKne3meq5aSn9XLyUdCD',
  'pFZP5JQG7iQjIQuC4Bku', 'nPczCjzI2devNBz1zQrb', 'Xb7hH8MSUJpSbSDYk0k2', 'onwK4e9ZLuTAKqWW03F9',
  'cgSgspJ2msm6clMCkdW9', 'iP95p4xoKVk53GoZ742B', 'XrExE9yKIg1WjnnlVkGX', 'N2lVS1w4EtoT3dr4eOWO',
];
const charVoices = () => (process.env.ELEVENLABS_CHARACTER_VOICES ? process.env.ELEVENLABS_CHARACTER_VOICES.split(',').map((s) => s.trim()).filter(Boolean) : DEFAULT_CHAR_VOICES);

const store = new Map(); // id -> { buf, ts }
const byKey = new Map(); // voice+text -> Promise<id|null>
const badVoices = new Set();
let v3Broken = false;
const MAX = 400;

const stripTags = (t) => String(t || '').replace(/\[[^\]]*\]\s*/g, '').replace(/\s+/g, ' ').trim();

// queue so we never hit the plan's concurrency limit
const CONC = Number(process.env.ELEVENLABS_CONCURRENCY || 2);
let active = 0; const waiting = [];
function slot() { return new Promise((r) => { if (active < CONC) { active++; r(); } else waiting.push(r); }); }
function release() { active--; const n = waiting.shift(); if (n) { active++; n(); } }

async function request(text, voice, model) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 30000);
  try {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`, {
      method: 'POST', signal: ctrl.signal,
      headers: { 'xi-api-key': KEY(), 'content-type': 'application/json', accept: 'audio/mpeg' },
      body: JSON.stringify({ text, model_id: model }),
    });
    if (!res.ok) { const body = (await res.text()).slice(0, 300); return { error: res.status, body }; }
    return { buf: Buffer.from(await res.arrayBuffer()) };
  } catch (e) { return { error: e.name === 'AbortError' ? 'timeout' : e.message }; } finally { clearTimeout(t); }
}

async function synth(text, voice) {
  await slot();
  try {
    let model = v3Broken ? 'eleven_multilingual_v2' : MODEL();
    let input = model === 'eleven_v3' ? text : stripTags(text);
    let r = await request(input, voice, model);
    if (r.error && model === 'eleven_v3' && (r.error === 400 || r.error === 422 || /model/i.test(r.body || ''))) {
      console.error('[voice] v3 failed, falling back to v2:', r.error, r.body);
      v3Broken = true; model = 'eleven_multilingual_v2'; input = stripTags(text);
      r = await request(input, voice, model);
    }
    if (r.error) { console.error('[voice] error', r.error, r.body || ''); return { error: r.error }; }
    return { buf: r.buf };
  } finally { release(); }
}

// Returns a promise of an audio id (or null when there is no voice available).
function get(text, voice) {
  if (!enabled() || !stripTags(text)) return Promise.resolve(null);
  voice = voice || NARRATOR();
  if (badVoices.has(voice)) voice = NARRATOR();
  const key = `${voice}|${text}`;
  if (byKey.has(key)) return byKey.get(key);
  const p = (async () => {
    let r = await synth(text, voice);
    if (r.error && voice !== NARRATOR() && (r.error === 404 || r.error === 400 || r.error === 422)) {
      badVoices.add(voice);
      r = await synth(text, NARRATOR());
    }
    if (!r.buf) { byKey.delete(key); return null; }
    const id = crypto.randomBytes(8).toString('hex');
    store.set(id, { buf: r.buf, ts: Date.now() });
    if (store.size > MAX) { const old = [...store.entries()].sort((a, b) => a[1].ts - b[1].ts).slice(0, store.size - MAX); old.forEach(([k]) => store.delete(k)); for (const [k, v] of byKey) { v.then((vid) => { if (vid && !store.has(vid)) byKey.delete(k); }); } }
    return id;
  })();
  byKey.set(key, p);
  return p;
}

function audio(id) { return store.get(id)?.buf || null; }

module.exports = { enabled, get, audio, stripTags, NARRATOR, charVoices };
