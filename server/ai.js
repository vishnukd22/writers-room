'use strict';
// The writer: asks Claude for show text, always with a fallback so the game never stalls.

const KEY = () => process.env.ANTHROPIC_API_KEY || '';
const MODEL = () => process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';
const enabled = () => !!KEY();

const SYSTEM = `You are the head writer of a live party game called Writers' Room. Friends write lines that other friends perform out loud, and your words are read aloud by an expressive AI voice (ElevenLabs v3) to the whole room. Your job is to make the room laugh.

Style rules:
- Funny, sharp, specific. Adult humour and swearing are allowed. Punch up, never cruel about real-world groups.
- Short, speakable sentences. No stage directions in parentheses. No emoji. Never use em dashes or en dashes; use commas, full stops or ellipses.
- You may add ElevenLabs audio tags in square brackets to guide delivery, such as [whispers], [laughs], [sighs], [excited], [dramatically], [sarcastic], [curious], [gasps], [beat]. Use at most two per paragraph, placed before the words they colour.
- Use the names exactly as given. Build on what the players wrote; their jokes are canon. Keep every line short: one breath, under 16 words.
- Reply with JSON only, no prose before or after, matching the shape asked for.`;

async function ask(user, maxTokens = 1200, timeoutMs = 30000, system = SYSTEM) {
  if (!enabled()) return null;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const headers = { 'content-type': 'application/json', 'x-api-key': KEY(), 'anthropic-version': '2023-06-01' };
    if (process.env.ANTHROPIC_WORKSPACE_ID) headers['anthropic-workspace-id'] = process.env.ANTHROPIC_WORKSPACE_ID;
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers, signal: ctrl.signal,
      body: JSON.stringify({ model: MODEL(), max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] }),
    });
    if (!res.ok) { console.error('[ai] HTTP', res.status, (await res.text()).slice(0, 300)); return null; }
    const data = await res.json();
    const text = (data.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('');
    return parseJSON(text);
  } catch (e) {
    console.error('[ai] error', e.name === 'AbortError' ? 'timeout' : e.message);
    return null;
  } finally { clearTimeout(t); }
}

function parseJSON(text) {
  if (!text) return null;
  const s = text.indexOf('{'); const e = text.lastIndexOf('}');
  if (s < 0 || e <= s) return null;
  try { return JSON.parse(text.slice(s, e + 1)); } catch (err) { console.error('[ai] bad JSON'); return null; }
}

const clean = (s, n = 400) => String(s || '').replace(/[–—]/g, ', ').replace(/\s+/g, ' ').trim().slice(0, n);

// One call at the start of a game: a fresh setup for every Cold Read scene.
// scenes: [{ genre, actors: [names] }] -> [{ title, setting, roles: [..], opener }] (null entries fall back)
async function sceneSetups(scenes) {
  const ask1 = scenes.map((s, i) => `${i + 1}. Genre: ${s.genre.name} (${s.genre.tone}). Actors: ${s.actors.join(', ')}.`).join('\n');
  const r = await ask(`Set up ${scenes.length} short improvised scenes for a party. Two or three friends will stand up and perform lines that the rest of the room writes live, so the setup only needs to give them a situation and a role each.

${ask1}

For each scene return: "title" (a funny but plausible TV show title), "setting" (one sentence, under 14 words, where we are and what just went wrong), "roles" (one per actor, in order, each 3 to 7 words, a specific funny character like "a surgeon who faints at blood"), "opener" (the first line of dialogue, spoken by the first actor to the second, under 14 words, that kicks off conflict).
Return {"scenes": [{"title": "...", "setting": "...", "roles": ["..."], "opener": "..."}]} with exactly ${scenes.length} scenes in order.`, 2200, 22000);
  return scenes.map((s, i) => {
    const x = r?.scenes?.[i];
    if (!x || !x.opener || !Array.isArray(x.roles) || x.roles.length < s.actors.length) return null;
    return { title: clean(x.title, 60), setting: clean(x.setting, 140), roles: x.roles.slice(0, s.actors.length).map((t) => clean(t, 60)), opener: clean(x.opener, 140) };
  });
}

// The CUT! finale script, with every player as a character under their own name.
async function finaleScript(genre, names, n = 14) {
  const r = await ask(`Write a ridiculous ${genre.name} scene (${genre.tone}) starring these friends as themselves: ${names.join(', ')}.
It will be read aloud line by line, and at any moment a player can shout CUT and write the next line themselves, so make every line a strong, escalating beat with twists, and give every person at least one line.
Exactly ${n} lines, each under 16 words. Speakers must be exactly one of the names given.
Return {"title": "...", "lines": [{"speaker": "<name>", "text": "..."}]}.`, 1800, 22000);
  const lines = (r?.lines || []).map((l) => ({ speaker: names.find((nm) => nm.toLowerCase() === String(l.speaker || '').trim().toLowerCase()), text: clean(l.text, 160) })).filter((l) => l.speaker && l.text);
  return lines.length >= 8 ? { title: clean(r.title, 60), lines } : null;
}

// After a player's CUT line: the next few lines react to it. last = true means land the ending.
async function continueFinale(genre, names, sofar, inserted, count, last) {
  const r = await ask(`A ${genre.name} scene (${genre.tone}) is being performed live with these characters: ${names.join(', ')}.
Scene so far:
${sofar.map((l) => `${l.speaker}: ${l.text}`).join('\n')}
A player just shouted CUT and wrote this line, which is now canon:
${inserted.speaker}: ${inserted.text}

Write the next ${count} lines. React directly to the player's line, take it seriously, and escalate it into something even more absurd.${last ? ' The final line must end the scene with a big, funny button.' : ''} Each line under 16 words. Speakers must be exactly one of the names given.
Return {"lines": [{"speaker": "<name>", "text": "..."}]}.`, 700, 9000);
  const lines = (r?.lines || []).map((l) => ({ speaker: names.find((nm) => nm.toLowerCase() === String(l.speaker || '').trim().toLowerCase()), text: clean(l.text, 160) })).filter((l) => l.speaker && l.text);
  return lines.length ? lines.slice(0, count) : null;
}

// Pilot season: a title for the winning pitch.
async function pilotTitle(genre, pitch) {
  const r = await ask(`A ${genre.name} TV pilot (${genre.tone}) was just pitched: "${pitch}". Give it a funny but plausible TV show title, 2 to 5 words. Return {"title": "..."}.`, 120, 7000);
  return clean(r?.title, 50) || null;
}

// Pilot season: turn the room's winning beat into a short scene for the two characters.
// Returns { lines: [{ who: 'hero'|'rival'|'narrator', text }], noteHonoured: bool }
async function pilotScene(o) {
  const r = await ask(`You are writing a scene for ${o.episode ? `"${o.episode}" of` : ''} a ${o.genre.name} TV show (${o.genre.tone}).
Pitch: ${o.pitch}
Hero: ${o.hero.name}. ${o.hero.traits.join('. ')}
Rival: ${o.rival.name}. ${o.rival.traits.join('. ')}
${o.prev ? `Previously: ${o.prev}\n` : ''}The writers' room chose this for the ${o.kind === 'ending' ? 'ending' : o.kind === 'cliffhanger' ? 'cliffhanger (end on a shock that sets up next week)' : 'big problem'}: "${o.beat}"
The Network gave this note: "${o.note}"

Write a 5-line scene that dramatises exactly what the room chose, uses the characters' traits and catchphrases, and lands a big laugh on the last line. Lines are spoken by "hero", "rival", or "narrator" (a short stage direction read aloud, at most one). Each line under 16 words. Keep it fast and punchy. Then judge honestly whether the room's chosen line honoured the Network note.
Return {"lines": [{"who": "hero", "text": "..."}], "noteHonoured": true}.`, 900, 12000);
  const lines = (r?.lines || []).map((l) => ({ who: ['hero', 'rival', 'narrator'].includes(l.who) ? l.who : 'narrator', text: clean(l.text, 180) })).filter((l) => l.text);
  return lines.length >= 3 ? { lines: lines.slice(0, 6), noteHonoured: !!r.noteHonoured } : null;
}

// Pilot season: the Network exec's verdict. score 0..3
async function pilotVerdict(o) {
  const r = await ask(`You are a ruthless, funny TV network executive. You just watched a ${o.genre.name} pilot called "${o.title}".
Pitch: ${o.pitch}
Hero: ${o.hero}. Rival: ${o.rival}.
Problem: ${o.problem}
Ending: ${o.ending}
Give a score from 0 to 3 for how much you'd commission it, and one funny sentence of feedback (under 22 words).
Return {"score": 2, "line": "..."}.`, 200, 9000);
  if (!r) return null;
  return { score: Math.max(0, Math.min(3, Number(r.score) || 0)), line: clean(r.line, 200) };
}

// Date Night: the exec picks between two entries.
async function pickBetween(prompt, a, b) {
  const r = await ask(`Two writers answered "${prompt}".
A: ${a}
B: ${b}
Which is funnier and more usable on TV? Reply with one funny sentence explaining your pick (under 20 words).
Return {"pick": "A", "why": "..."}.`, 150, 7000);
  if (!r) return null;
  return { pick: String(r.pick).toUpperCase().startsWith('B') ? 1 : 0, why: clean(r.why, 160) };
}

// Date Night: a third character barges into a two-person scene with one line.
async function interject(genre, role, sofar) {
  const r = await ask(`A two-person ${genre.name} scene (${genre.tone}) is being performed by a couple at home. Scene so far:
${sofar.map((l) => `${l.speaker}: ${l.text}`).join('\n')}

You are ${role}, a third character who barges in. Write ONE line (under 16 words) that reacts to the last line, makes it more awkward or absurd, and gives the couple something new to fight about. Return {"text": "..."}.`, 300, 7000);
  return clean(r?.text, 160) || null;
}

// Date Night: a critic reviews the scene the couple just performed.
async function critique(genre, critic, lines) {
  const r = await ask(`You are ${critic.name} of ${critic.outlet}: ${critic.style}. You just watched a couple improvise this ${genre.name} scene, each writing the other's lines:
${lines.map((l, i) => `${i + 1}. ${l.speaker}: ${l.text}`).join('\n')}

Review it in two short, funny sentences, in character, naming at least one of them. Give stars out of 5. Pick the single funniest line by its number.
Return {"stars": 4, "review": "...", "best": 3}.`, 400, 9000);
  if (!r) return null;
  const best = Math.round(Number(r.best)) - 1;
  return { stars: Math.max(1, Math.min(5, Math.round(Number(r.stars)) || 3)), review: clean(r.review, 300), best: best >= 0 && best < lines.length ? best : null };
}

// BID-COIN!: one-of-a-kind legendary finds, invented fresh each game. base: an existing item whose photo is borrowed.
const BC_SYSTEM = `You write items for BID-COIN!, a family-friendly party game about bidding on storage lockers in Dubai. Items are read aloud by an auctioneer voice. Be funny and specific. Never name real people. Real brands and exact product models are welcome. Never use em dashes or en dashes. Reply with JSON only.`;
async function bcLegends(n, baseIds) {
  const r = await ask(`Invent ${n} legendary one-of-a-kind finds that could turn up at the back of a storage locker in Dubai. Each must be a real-world product with its exact model name, given a special twist (for example: a specific watch model with its original box and papers, a classic car with very low mileage). Each needs: name (under 10 words), line (one funny sentence under 14 words), value (realistic resale value in AED, between 15000 and 90000), base (the id from this list that looks most like it, so we can show its photo): ${baseIds.join(', ')}.
Shape: {"items":[{"name":"","line":"","value":40000,"base":""}]}`, 600, 8000, BC_SYSTEM);
  const ok = (r?.items || []).filter((x) => x && x.name && baseIds.includes(x.base)).map((x) => ({ name: clean(x.name, 60), line: clean(x.line, 90), value: Number(x.value) || 40000, base: x.base }));
  return ok.length ? ok : null;
}

module.exports = { bcLegends, enabled, sceneSetups, finaleScript, continueFinale, interject, critique, pilotTitle, pilotScene, pilotVerdict, pickBetween };
