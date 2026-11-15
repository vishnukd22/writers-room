'use strict';
// The narrator's voice: ElevenLabs text to speech, with a queue, a cache and graceful fallback.
const crypto = require('crypto');

const KEY = () => process.env.ELEVENLABS_API_KEY || '';
const enabled = () => !!KEY();
const MODEL = () => process.env.ELEVENLABS_MODEL || 'eleven_v3';
const NARRATOR = () => process.env.ELEVENLABS_VOICE_ID || 'iP95p4xoKVk53GoZ742B'; // "Chris": Johnny Primetime, the host
const EXEC = () => process.env.ELEVENLABS_EXEC_VOICE_ID || 'onwK4e9ZLuTAKqWW03F9'; // "Daniel": the Network
// Premade voices used for characters when the narrator doesn't read them. Override with ELEVENLABS_CHARACTER_VOICES.
const DEFAULT_CHAR_VOICES = [
  'cgSgspJ2msm6clMCkdW9', 'nPczCjzI2devNBz1zQrb', 'IKne3meq5aSn9XLyUdCD', 'FGY2WhTYpPnrIDTdsKH5',
  'N2lVS1w4EtoT3dr4eOWO', 'XrExE9yKIg1WjnnlVkGX', 'TX3LPaxmHKxFdv7VOQHJ', 'Xb7hH8MSUJpSbSDYk0k2',
]; // Jessica, Brian, Charlie, Laura, Callum, Matilda, Liam, Alice
const charVoices = () => (process.env.ELEVENLABS_CHARACTER_VOICES ? process.env.ELEVENLABS_CHARACTER_VOICES.split(',').map((s) => s.trim()).filter(Boolean) : DEFAULT_CHAR_VOICES);

const store = new Map(); // id -> { buf, ts }
const byKey = new Map(); // voice+text -> Promise<id|null>
const badVoices = new Set();
let v3Broken = false;
const MAX = 400;

// ---------------------------------------------------------------- numbers the way a person says them
// The screen keeps exact amounts ("AED 38,450"). The voice says "thirty-eight and a half thousand dirhams":
// voices slur long digit strings, and nobody says the exact figure out loud anyway.
const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
function words(n) {
  n = Math.floor(Math.abs(n));
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : '');
  if (n < 1000) return `${ONES[Math.floor(n / 100)]} hundred${n % 100 ? ` and ${words(n % 100)}` : ''}`;
  if (n < 1e6) return `${words(Math.floor(n / 1000))} thousand${n % 1000 ? (n % 1000 < 100 ? ' and ' : ' ') + words(n % 1000) : ''}`;
  return `${words(Math.floor(n / 1e6))} million${n % 1e6 ? ` ${words(n % 1e6)}` : ''}`;
}
function spokenAmount(n) {
  n = Math.round(Math.abs(n));
  if (n >= 1e6) { const m = Math.round(n / 1e5) / 10; return `${Number.isInteger(m) ? words(m) : `${words(Math.floor(m))} point ${ONES[Math.round((m % 1) * 10)]}`} million`; }
  if (n >= 10000) { const r = Math.round(n / 500) * 500; return `${words(Math.floor(r / 1000))}${r % 1000 ? ' and a half' : ''} thousand`; }
  return words(n);
}
const num = (s) => Number(String(s).replace(/,/g, ''));
function speakable(t) {
  return String(t || '')
    .replace(/(?:AED|Dhs?)\s?(\d[\d,]*(?:\.\d+)?)(\s+dirhams)?/gi, (_, n) => `${spokenAmount(num(n))} dirhams`)
    .replace(/\$(\d[\d,]*)(\s+Bucks)?/g, (_, n) => `${spokenAmount(num(n))} Bucks`)
    .replace(/\b\d{1,3}(?:,\d{3})+\b/g, (m) => spokenAmount(num(m)));
}

const stripTags = (t) => String(t || '').replace(/\[[^\]]*\]\s*/g, '').replace(/\s+/g, ' ').trim();

// queue so we never hit the plan's concurrency limit
const CONC = Number(process.env.ELEVENLABS_CONCURRENCY || 3);
let active = 0; const waiting = [];
function slot(urgent) { return new Promise((r) => { if (active < CONC) { active++; r(); } else if (urgent) waiting.unshift(r); else waiting.push(r); }); }
function release() { active--; const n = waiting.shift(); if (n) { active++; n(); } }

async function request(text, voice, model, speed) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 30000);
  try {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`, {
      method: 'POST', signal: ctrl.signal,
      headers: { 'xi-api-key': KEY(), 'content-type': 'application/json', accept: 'audio/mpeg' },
      body: JSON.stringify(speed && speed !== 1 ? { text, model_id: model, voice_settings: { speed } } : { text, model_id: model }),
    });
    if (!res.ok) { const body = (await res.text()).slice(0, 300); return { error: res.status, body }; }
    return { buf: Buffer.from(await res.arrayBuffer()) };
  } catch (e) { return { error: e.name === 'AbortError' ? 'timeout' : e.message }; } finally { clearTimeout(t); }
}

// Characters use a fast model so scenes play without gaps; the hosts keep the expressive one.
const FAST = () => process.env.ELEVENLABS_FAST_MODEL || 'eleven_flash_v2_5';
let fastBroken = false;
async function synth(text, voice, urgent, fast, speed) {
  await slot(urgent);
  try {
    if (fast && !fastBroken) {
      let r = await request(stripTags(text), voice, FAST(), speed);
      if (r.error && speed && (r.error === 400 || r.error === 422)) { console.error('[voice] speed refused, using normal speed:', r.body || ''); r = await request(stripTags(text), voice, FAST()); }
      if (!r.error) return { buf: r.buf };
      console.error('[voice] fast model failed, using the normal one:', r.error, r.body || ''); fastBroken = true;
    }
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
function get(text, voice, urgent = false, fast = false, speed = 1) {
  text = speakable(text);
  if (!enabled() || !stripTags(text)) return Promise.resolve(null);
  voice = voice || NARRATOR();
  if (badVoices.has(voice)) voice = voice === lgFound ? LG_FALLBACK : NARRATOR();
  const key = `${voice}|${fast ? 'f' : ''}|${speed}|${text}`;
  if (byKey.has(key)) return byKey.get(key);
  const p = (async () => {
    let r = await synth(text, voice, urgent, fast, speed);
    if (r.error && voice !== NARRATOR() && (r.error === 404 || r.error === 400 || r.error === 422)) {
      badVoices.add(voice);
      r = await synth(text, NARRATOR(), urgent, fast, speed);
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

// ---------------------------------------------------------------- Land Grab's narrator
// An English voice with an Indian accent. Set ELEVENLABS_LG_VOICE_ID to choose one yourself.
// Otherwise, on start-up, the most used female Indian-accent English voice in the ElevenLabs
// voice library is added to the account once (named "Land Grab gossip") and used from then on.
const LG_FALLBACK = 'cgSgspJ2msm6clMCkdW9'; // "Jessica", only if the search fails
let lgFound = null;
const LG = () => process.env.ELEVENLABS_LG_VOICE_ID || lgFound || LG_FALLBACK;
const LG_SPEED = () => Math.max(0.7, Math.min(1.2, Number(process.env.ELEVENLABS_LG_SPEED || 1.12)));
async function findIndianVoice() {
  if (!enabled() || process.env.ELEVENLABS_LG_VOICE_ID) return;
  const H = { 'xi-api-key': KEY() };
  try {
    const mine = await fetch('https://api.elevenlabs.io/v1/voices', { headers: H });
    if (mine.ok) { const j = await mine.json(); const have = (j.voices || []).find((v) => /^Land Grab gossip/.test(v.name)); if (have) { lgFound = have.voice_id; console.log('[voice] Land Grab gossip:', have.name); return; } }
    const q = new URLSearchParams({ page_size: '30', language: 'en', accent: 'indian', gender: 'female', sort: 'usage_character_count_1y' });
    const res = await fetch(`https://api.elevenlabs.io/v1/shared-voices?${q}`, { headers: H });
    if (!res.ok) { console.error('[voice] voice library search failed', res.status); return; }
    const list = (await res.json()).voices || [];
    const good = /convers|character|narrat|social|entertain|informative/i;
    const v = list.find((x) => good.test(`${x.use_case || ''} ${x.descriptive || ''}`)) || list[0];
    if (!v) { console.error('[voice] no Indian-accent voice found'); return; }
    const add = await fetch(`https://api.elevenlabs.io/v1/voices/add/${v.public_owner_id}/${v.voice_id}`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ new_name: `Land Grab gossip (${v.name})`.slice(0, 60) }) });
    if (add.ok) { const a = await add.json(); lgFound = a.voice_id || v.voice_id; } else { console.error('[voice] could not add library voice', add.status, (await add.text()).slice(0, 200)); lgFound = v.voice_id; }
    console.log('[voice] Land Grab gossip:', v.name, lgFound);
  } catch (e) { console.error('[voice] Indian voice search error', e.message); }
}
findIndianVoice();

// ---------------------------------------------------------------- BID-COIN!'s auctioneer: fast and lively. Set ELEVENLABS_BC_VOICE_ID to change it.
const BC = () => process.env.ELEVENLABS_BC_VOICE_ID || 'IKne3meq5aSn9XLyUdCD'; // "Charlie"
// RIGGED!'s host, Vince Velvet: a smooth old-school announcer. Set ELEVENLABS_RG_VOICE_ID to change it.
// Shifty Sid, who runs BID-COIN!'s back-room sales: a husky, shady voice. Set ELEVENLABS_BC_SID_VOICE_ID to change it.
const BC_SID = () => process.env.ELEVENLABS_BC_SID_VOICE_ID || 'N2lVS1w4EtoT3dr4eOWO'; // "Callum"
const RG = () => process.env.ELEVENLABS_RG_VOICE_ID || 'nPczCjzI2devNBz1zQrb'; // "Brian"

// Last Night in the Mansion's butler, Mortimer: an older, posh, polite British voice. Set ELEVENLABS_MN_VOICE_ID to change it.
const MN = () => process.env.ELEVENLABS_MN_VOICE_ID || 'JBFqnCBsd6RMkjVDRZzb'; // "George"

module.exports = { enabled, get, audio, stripTags, speakable, NARRATOR, EXEC, LG, LG_SPEED, BC, BC_SID, RG, MN, charVoices };
