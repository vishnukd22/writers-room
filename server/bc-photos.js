'use strict';
// BID-COIN! photo finder. Runs on the game server (Render), which can reach Wikimedia.
// For each item it asks Wikimedia Commons (and Wikidata) for one freely licensed photo, and remembers
// the small thumbnail address and who took it. The TV and phones then load the photo straight from
// Wikimedia, like any website showing a Commons image. Nothing to run on GitHub.
// A photo saved in public/assets/bc/items/<id>.webp always wins over a looked-up one.
const fs = require('fs');
const os = require('os');
const path = require('path');
const C = require('./bc-items');

const COMMONS = 'https://commons.wikimedia.org/w/api.php';
const WIKIDATA = 'https://www.wikidata.org/w/api.php';
const LOCAL_DIR = path.join(__dirname, '..', 'public', 'assets', 'bc', 'items');
const CACHE = path.join(os.tmpdir(), 'bidcoin-photos-v2.json');
const OVERRIDES = path.join(__dirname, 'bc-photo-overrides.json');
const WIDTH = 500; // a standard Wikimedia thumbnail size
const UA = () => `BID-COIN-party-game/2.0 (${process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || 'private party game'}; photo lookups for a home party game)`;

const BAD_TITLE = /\b(logo|map|diagram|icon|flag|coat of arms|chart|schematic|blueprint|patent|signature|screenshot|banknote|svg|clipart|clip art|drawing|sketch|illustration|engraving|cartoon|poster for|advert|advertisement|manual|catalogue page|label)\b/i;
const BAD_DESC = /\b(company|band|film|album|song|single by|television|tv series|organi[sz]ation|village|city|town|family name|given name|surname|disambiguation|human|footballer|actor|singer|club|magazine|video game|episode|novel|musical group|record label|software|website|fictional|game show|river|mountain|journal|newspaper|scholarly article|scientific article|football team|sports team)\b/i;
const STOP = new Set(['the', 'and', 'with', 'of', 'a', 'an', 'for', 'old', 'set', 'pile']);

const found = new Map(); // id -> { url, credit } or { none: true }
const busy = new Map(); // id -> promise
const tries = new Map();
const stats = { looked: 0, ok: 0, missing: 0, errors: 0, lastError: null, started: Date.now() };
let overrides = {};
try { overrides = JSON.parse(fs.readFileSync(OVERRIDES, 'utf8')); } catch (e) { overrides = {}; }
try { for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync(CACHE, 'utf8')))) if (v && v.url) found.set(k, v); } catch (e) { /* first run */ }
let local = new Set();
function scanLocal() { try { local = new Set(fs.readdirSync(LOCAL_DIR).filter((f) => f.endsWith('.webp')).map((f) => f.slice(0, -5))); } catch (e) { local = new Set(); } }
scanLocal();
let saveTimer = null;
function save() { clearTimeout(saveTimer); saveTimer = setTimeout(() => { try { fs.writeFileSync(CACHE, JSON.stringify(Object.fromEntries([...found].filter(([, v]) => v.url)))); } catch (e) { /* fine */ } }, 3000); }

const sleep = (t) => new Promise((r) => setTimeout(r, t));
const strip = (html) => String(html || '').replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
const qs = (o) => new URLSearchParams({ format: 'json', formatversion: '2', ...o }).toString();

async function get(url) {
  for (let i = 0; i < 3; i++) {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 9000);
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA(), 'Api-User-Agent': UA() }, signal: ctl.signal });
      clearTimeout(t);
      if (r.status === 429 || r.status >= 500) { await sleep(1500 * (i + 1)); continue; }
      if (!r.ok) { stats.lastError = `HTTP ${r.status} from ${new URL(url).host}`; throw new Error(stats.lastError); }
      return await r.json();
    } catch (e) { clearTimeout(t); stats.lastError = e.message; if (/^HTTP 4/.test(e.message)) throw e; await sleep(800 * (i + 1)); }
  }
  throw new Error(stats.lastError || 'no answer from Wikimedia');
}

function good(ii) {
  if (!ii || !ii.thumburl || !/image\/(jpeg|png|webp|tiff)/.test(ii.mime || '')) return false;
  if ((ii.width || 0) < 300 || (ii.height || 0) < 240) return false;
  const ratio = ii.width / ii.height; if (ratio < 0.45 || ratio > 2.3) return false;
  return !BAD_TITLE.test(ii.title || '');
}
function pack(ii) {
  const m = ii.extmetadata || {};
  const author = strip(m.Artist?.value).slice(0, 80) || 'Unknown';
  const license = strip(m.LicenseShortName?.value) || 'free licence';
  return { url: ii.thumburl, credit: `${author}, ${license}, via Wikimedia Commons`, page: ii.descriptionurl || '', file: ii.title };
}
async function fileInfo(title) {
  const r = await get(`${COMMONS}?${qs({ action: 'query', titles: title, prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata', iiurlwidth: String(WIDTH), iiextmetadatafilter: 'Artist|LicenseShortName' })}`);
  const p = r?.query?.pages?.[0]; const ii = p?.imageinfo?.[0];
  return ii ? { title: p.title, ...ii } : null;
}
async function viaWikidata(term) {
  const s = await get(`${WIKIDATA}?${qs({ action: 'wbsearchentities', search: term, language: 'en', type: 'item', limit: '6' })}`);
  const hit = (s?.search || []).find((x) => !BAD_DESC.test(x.description || ''));
  if (!hit) return null;
  const e = await get(`${WIKIDATA}?${qs({ action: 'wbgetclaims', entity: hit.id, property: 'P18' })}`);
  const file = e?.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
  if (!file) return null;
  const ii = await fileInfo(`File:${file}`);
  return good(ii) ? ii : null;
}
// Commons search: the best photo whose file name mentions the most words of what we're looking for
async function viaCommons(term) {
  const words = term.toLowerCase().replace(/[()'"]/g, ' ').split(/\s+/).filter((w) => w.length > 1 && !STOP.has(w));
  const r = await get(`${COMMONS}?${qs({ action: 'query', generator: 'search', gsrsearch: `${term} filetype:bitmap`, gsrnamespace: '6', gsrlimit: '20', prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata', iiurlwidth: String(WIDTH), iiextmetadatafilter: 'Artist|LicenseShortName' })}`);
  const pages = (r?.query?.pages || []).map((p) => ({ title: p.title, index: p.index ?? 99, ...(p.imageinfo?.[0] || {}) })).filter(good);
  if (!pages.length) return null;
  const score = (p) => { const t = p.title.toLowerCase(); const hits = words.filter((w) => t.includes(w)).length; return hits * 10 - p.index + (/\.jpe?g$/i.test(p.title) ? 2 : 0); };
  pages.sort((a, b) => score(b) - score(a));
  const best = pages[0];
  // at least one real word of the search must be in the file name, or it's probably something else
  if (words.length && !words.some((w) => best.title.toLowerCase().includes(w))) return null;
  return best;
}
async function lookup(item) {
  const term = overrides[item.id] || item.q || item.name;
  if (/^File:/i.test(term)) { const ii = await fileInfo(term); return ii && ii.thumburl ? ii : null; }
  if (/^wd:/i.test(term)) { const ii = await viaWikidata(term.slice(3)); if (ii) return ii; }
  const plain = term.replace(/^wd:/i, '');
  // try the full search, then shorter versions (drop words from the end) until something fits
  const parts = plain.split(/\s+/);
  for (let n = parts.length; n >= Math.min(2, parts.length); n--) {
    const ii = await viaCommons(parts.slice(0, n).join(' '));
    if (ii) return ii;
  }
  return null;
}

const ALL = () => [...C.ITEMS, ...C.CONTAINERS];
const byId = (id) => C.BY_ID[id] || C.CONTAINERS.find((c) => c.id === id);
function resolve(id) {
  if (local.has(id) || found.has(id)) return Promise.resolve(found.get(id) || null);
  if (busy.has(id)) return busy.get(id);
  const item = byId(id); if (!item) return Promise.resolve(null);
  const p = (async () => {
    stats.looked++;
    try {
      const ii = await lookup(item);
      if (ii) { found.set(id, pack(ii)); stats.ok++; save(); } else { found.set(id, { none: true }); stats.missing++; }
    } catch (e) {
      // a network problem, not a missing photo: try again in a minute (three times at most)
      stats.errors++; stats.lastError = e.message;
      tries.set(id, (tries.get(id) || 0) + 1);
      if (tries.get(id) < 3) setTimeout(() => warm([id]), 60000).unref();
    }
    busy.delete(id);
    return found.get(id) || null;
  })();
  busy.set(id, p); return p;
}
// look up a list of ids, a few at a time, most urgent first
const queue = [];
let running = 0;
const LIMIT = 3;
function pump() {
  while (running < LIMIT && queue.length) {
    const id = queue.shift(); if (local.has(id) || found.has(id)) continue;
    running++;
    resolve(id).finally(() => { running--; setTimeout(pump, 120); });
  }
}
function warm(ids, urgent = false) {
  const fresh = ids.filter((id) => id && !local.has(id) && !found.has(id) && !queue.includes(id));
  if (urgent) queue.unshift(...fresh); else queue.push(...fresh);
  pump();
}
// warm the whole catalogue in the background, starting a few seconds after the server starts
setTimeout(() => warm(ALL().map((i) => i.id)), 4000).unref();

// the address of an item's photo right now (or null while it's still being looked up)
function urlFor(id) {
  if (!id) return null;
  if (local.has(id)) return `/assets/bc/items/${id}.webp`;
  const f = found.get(id); return f && f.url ? f.url : null;
}
function creditFor(id) { const f = found.get(id); return f && f.credit ? f.credit : null; }
function info(id) { const f = found.get(id); return f && f.url ? f : null; }
function status() {
  const all = ALL();
  return { items: all.length, withPhoto: all.filter((i) => urlFor(i.id)).length, stillLooking: queue.length + running, noPhotoFound: [...found].filter(([, v]) => v.none).map(([k]) => k), ...stats, sinceSeconds: Math.round((Date.now() - stats.started) / 1000) };
}

module.exports = { urlFor, creditFor, info, warm, status, resolve, scanLocal };
