// The BID-COIN! photo robot. Runs on GitHub (see .github/workflows/bidcoin-photos.yml), not on Render.
// For every item it finds one freely licensed photo on Wikimedia Commons (through Wikidata's main picture
// for that thing when there is one), shrinks it to a small square .webp, and records who took it.
//
//   node scripts/fetch-bc-images.js            only items that have no photo yet
//   REDO="rolex,lego" node scripts/...          fetch these again (for example after changing their search term)
//   ALL=1 node scripts/...                      fetch everything again
//
// To pick a photo yourself, add a line to server/bc-photo-overrides.json, for example:
//   { "rolex": "File:Rolex Submariner Date.jpg", "lego": "lego bricks pile" }
// A value starting with "File:" is an exact Commons file. Anything else is a Commons search.
'use strict';
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { ITEMS, CONTAINERS } = require('../server/bc-items');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'public', 'assets', 'bc', 'items');
const CREDITS = path.join(ROOT, 'public', 'assets', 'bc', 'credits.json');
const OVERRIDES = path.join(ROOT, 'server', 'bc-photo-overrides.json');
const WIKIDATA = process.env.WIKIDATA_API || 'https://www.wikidata.org/w/api.php';
const COMMONS = process.env.COMMONS_API || 'https://commons.wikimedia.org/w/api.php';
const UA = 'BID-COIN-party-game/1.0 (private party game; photo fetcher run from GitHub Actions)';
const SIZE = 480;

const BAD_TITLE = /\b(logo|map|diagram|icon|flag|coat of arms|chart|schematic|blueprint|patent|signature|screenshot|banknote|svg|clipart|clip art|drawing|sketch|illustration|engraving|cartoon|poster for)\b/i;
const BAD_DESC = /\b(company|band|film|album|song|single by|television|tv series|organi[sz]ation|village|city|town|family name|given name|surname|disambiguation|human|footballer|actor|singer|rapper|club|magazine|video game|episode|novel|musical group|record label|software|website|fictional|game show|river|mountain|journal|newspaper|scholarly article|scientific article|airline|restaurant chain|football team|sports team|asteroid|genus|species of)\b/i;

const sleep = (t) => new Promise((r) => setTimeout(r, t));
const strip = (html) => String(html || '').replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();

async function get(url, as = 'json') {
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, 'Api-User-Agent': UA } });
      if (r.status === 429 || r.status >= 500) { await sleep(1500 * (i + 1)); continue; }
      if (!r.ok) return null;
      return as === 'json' ? await r.json() : Buffer.from(await r.arrayBuffer());
    } catch (e) { await sleep(1000 * (i + 1)); }
  }
  return null;
}
const qs = (o) => new URLSearchParams({ format: 'json', formatversion: '2', origin: '*', ...o }).toString();

// Wikidata: the thing's own "main picture" (property P18), when the search finds the thing itself
async function viaWikidata(term) {
  const s = await get(`${WIKIDATA}?${qs({ action: 'wbsearchentities', search: term, language: 'en', type: 'item', limit: '6' })}`);
  const hit = (s?.search || []).find((x) => !BAD_DESC.test(x.description || ''));
  if (!hit) return null;
  const e = await get(`${WIKIDATA}?${qs({ action: 'wbgetclaims', entity: hit.id, property: 'P18' })}`);
  const file = e?.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
  return file ? `File:${file}` : null;
}
async function fileInfo(title) {
  const r = await get(`${COMMONS}?${qs({ action: 'query', titles: title, prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata', iiurlwidth: '640' })}`);
  const page = r?.query?.pages?.[0]; const ii = page?.imageinfo?.[0];
  return ii ? { title: page.title, ...ii } : null;
}
function good(ii) {
  if (!ii || !/image\/(jpeg|png|webp)/.test(ii.mime || '')) return false;
  if ((ii.width || 0) < 360 || (ii.height || 0) < 280) return false;
  const ratio = ii.width / ii.height; if (ratio < 0.5 || ratio > 2.1) return false;
  return !BAD_TITLE.test(ii.title || '');
}
// Commons search, best match first, skipping maps, logos, drawings and tiny files
async function viaCommons(term) {
  const r = await get(`${COMMONS}?${qs({ action: 'query', generator: 'search', gsrsearch: `${term} filetype:bitmap`, gsrnamespace: '6', gsrlimit: '15', prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata', iiurlwidth: '640' })}`);
  const pages = (r?.query?.pages || []).map((p) => ({ title: p.title, index: p.index ?? 99, ...(p.imageinfo?.[0] || {}) }));
  const words = term.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  const scored = pages.filter(good).map((p) => ({ p, score: p.index - words.filter((w) => p.title.toLowerCase().includes(w)).length * 2 - (/\.jpe?g$/i.test(p.title) ? 1 : 0) }));
  scored.sort((a, b) => a.score - b.score);
  return scored[0]?.p || null;
}

async function find(item, override) {
  const term = override || item.q || item.name;
  if (/^File:/i.test(term)) { const ii = await fileInfo(term); return ii && ii.thumburl ? ii : null; }
  if (!override && !/^c:/.test(term)) {
    const file = await viaWikidata(term);
    if (file) { const ii = await fileInfo(file); if (good(ii)) return ii; }
  }
  return viaCommons(term.replace(/^c:/, ''));
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  let credits = {}; try { credits = JSON.parse(fs.readFileSync(CREDITS, 'utf8')); } catch (e) { credits = {}; }
  let overrides = {}; try { overrides = JSON.parse(fs.readFileSync(OVERRIDES, 'utf8')); } catch (e) { overrides = {}; }
  const redo = new Set(String(process.env.REDO || '').split(/[\s,]+/).filter(Boolean));
  const all = /^(1|true|yes)$/i.test(process.env.ALL || '');
  const list = [...ITEMS, ...CONTAINERS];
  const todo = list.filter((it) => all || redo.has(it.id) || !fs.existsSync(path.join(OUT, `${it.id}.webp`)));
  console.log(`BID-COIN! photos: ${list.length} items, fetching ${todo.length}`);
  const missed = [];
  for (const it of todo) {
    try {
      const ii = await find(it, overrides[it.id]);
      if (!ii || !ii.thumburl) { missed.push(it.id); console.log(`  no photo  ${it.id}  (${it.q})`); continue; }
      const buf = await get(ii.thumburl, 'buf');
      if (!buf) { missed.push(it.id); console.log(`  download failed  ${it.id}`); continue; }
      await sharp(buf).rotate().resize(SIZE, SIZE, { fit: 'cover', position: sharp.strategy.attention }).webp({ quality: 72 }).toFile(path.join(OUT, `${it.id}.webp`));
      const m = ii.extmetadata || {};
      credits[it.id] = { author: strip(m.Artist?.value).slice(0, 140) || 'Unknown', license: strip(m.LicenseShortName?.value) || strip(m.License?.value) || 'see source', page: ii.descriptionurl || '', file: ii.title };
      console.log(`  ok  ${it.id}  <-  ${ii.title}`);
    } catch (e) { missed.push(it.id); console.log(`  error  ${it.id}  ${e.message}`); }
    await sleep(120);
  }
  const ordered = Object.fromEntries(Object.keys(credits).sort().map((k) => [k, credits[k]]));
  fs.writeFileSync(CREDITS, `${JSON.stringify(ordered, null, 1)}\n`);
  const have = list.filter((it) => fs.existsSync(path.join(OUT, `${it.id}.webp`))).length;
  console.log(`\nDone. ${have} of ${list.length} items have a photo.${missed.length ? ` Still missing: ${missed.join(', ')}` : ''}`);
})();
