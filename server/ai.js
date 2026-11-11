'use strict';
// The writer: asks Claude for show text, always with a fallback so the game never stalls.

const KEY = () => process.env.ANTHROPIC_API_KEY || '';
const MODEL = () => process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';
const enabled = () => !!KEY();

const SYSTEM = `You are the head writer and narrator of a live party game called Writers' Room. Friends are writing a TV show together, and your words are read aloud by an expressive AI voice (ElevenLabs v3) to the whole room.

Style rules:
- Funny, sharp, specific. Adult humour and swearing are allowed. Punch up, never cruel about real-world groups.
- Short, speakable sentences. No stage directions in parentheses. No emoji. Never use em dashes or en dashes; use commas, full stops or ellipses.
- You may add ElevenLabs audio tags in square brackets to guide delivery, such as [whispers], [laughs], [sighs], [excited], [dramatically], [sarcastic], [curious], [gasps], [beat]. Use at most two per paragraph, placed before the words they colour.
- Use the character names exactly as given. Build on what the players wrote; their jokes are canon.
- Reply with JSON only, no prose before or after, matching the shape asked for.`;

async function ask(user, maxTokens = 1200, timeoutMs = 30000) {
  if (!enabled()) return null;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const headers = { 'content-type': 'application/json', 'x-api-key': KEY(), 'anthropic-version': '2023-06-01' };
    if (process.env.ANTHROPIC_WORKSPACE_ID) headers['anthropic-workspace-id'] = process.env.ANTHROPIC_WORKSPACE_ID;
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers, signal: ctrl.signal,
      body: JSON.stringify({ model: MODEL(), max_tokens: maxTokens, system: SYSTEM, messages: [{ role: 'user', content: user }] }),
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

const cap = (t) => (t ? String(t).charAt(0).toUpperCase() + String(t).slice(1) : '');
const castBlock = (cast) => cast.map((c) => `- ${c.name} (played by ${c.player}): ${c.job}. Secret: ${c.secret}. Weakness: ${c.weakness}. Catchphrase: "${c.catchphrase}".`).join('\n');
const clean = (s, n = 400) => String(s || '').replace(/[–—]/g, ', ').trim().slice(0, n);

async function showBible(genre, fallbackTitle) {
  const r = await ask(`Invent a TV show in this genre: ${genre.name}, described as ${genre.tone}.
Return {"title": "...", "logline": "..."} where the title is short and funny-but-plausible, and the logline is one punchy sentence the narrator reads out, in the voice of: ${genre.voice}.`, 300, 15000);
  return { title: clean(r?.title, 60) || fallbackTitle, logline: clean(r?.logline, 300) || `A ${genre.name.toLowerCase()} the network has already regretted commissioning.` };
}

async function castIntros(show, genre, cast) {
  const r = await ask(`Show: "${show.title}", a ${genre.name} (${genre.tone}).
The players created these characters for each other:
${castBlock(cast)}

Write a movie-trailer introduction for each character, two or three short sentences, read by the narrator in the voice of: ${genre.voice}. Mention their job, tease the secret, and end with their catchphrase. Return {"intros": [{"name": "<exact character name>", "intro": "..."}]}.`, 1500);
  const map = {};
  for (const c of cast) {
    const hit = r?.intros?.find((x) => x.name && x.name.trim().toLowerCase() === c.name.trim().toLowerCase());
    map[c.id] = clean(hit?.intro, 500) || `${c.name}. ${cap(c.job)}. [whispers] ${cap(c.secret)}. [beat] And one rule: "${c.catchphrase}"`;
  }
  return map;
}

async function episodeSetup(ctx) {
  const scenesAsk = ctx.scenes.map((s, i) => `Scene ${i + 1}: characters ${s.chars.join(' and ')}${s.interference ? `. Extra network note for this scene: ${s.interference}` : ''}`).join('\n');
  const r = await ask(`Show: "${ctx.show.title}", a ${ctx.genre.name} (${ctx.genre.tone}).
Cast:
${castBlock(ctx.cast)}
${ctx.previously ? `Story so far: ${ctx.previously}\n` : ''}Episode ${ctx.n} plot, pitched by a player: "${ctx.plot}"
Network note for the whole episode: ${ctx.note}${ctx.twist ? `\nMid-season twist: ${ctx.twist}` : ''}

The players will now write the dialogue themselves, scene by scene. For each scene below, give them a setup:
${scenesAsk}

Return {"episodeTitle": "...", "scenes": [{"slug": "INT. PLACE - TIME", "mustHappen": "one sentence: what must happen in this scene, tied to the plot", "direction": "one or two vivid sentences of opening stage direction, read aloud by the narrator"}]} with exactly ${ctx.scenes.length} scenes in order.`, 1500);
  return {
    title: clean(r?.episodeTitle, 80) || `Episode ${ctx.n}`,
    scenes: ctx.scenes.map((s, i) => {
      const x = r?.scenes?.[i] || {};
      return {
        slug: clean(x.slug, 80) || ['INT. A ROOM THAT HAS SEEN THINGS - NIGHT', 'EXT. A CAR PARK IN THE RAIN - NIGHT', 'INT. A VERY SMALL KITCHEN - DAWN', 'INT. A HOSPITAL LIFT - DAY'][i % 4],
        mustHappen: clean(x.mustHappen, 240) || `${s.chars[0]} must confront ${s.chars[1] || 'the truth'} about this: ${ctx.plot}`,
        direction: clean(x.direction, 300) || ctx.fallbackDirection(i),
      };
    }),
  };
}

async function afterEpisode(ctx) {
  const r = await ask(`Show: "${ctx.show.title}", a ${ctx.genre.name}.
Cast:
${castBlock(ctx.cast)}
${ctx.previously ? `Story before this episode: ${ctx.previously}\n` : ''}Episode ${ctx.n}, "${ctx.title}". Plot: ${ctx.plot}
Here is the script the players wrote and performed:
${ctx.script}

Return {"cliffhanger": "two or three sentences, a dramatic cliffhanger ending for this episode in the voice of: ${ctx.genre.voice}, ending with 'Next time, on ${ctx.show.title}.'", "recap": "three sentences summarising the whole story so far, for a 'previously on' read aloud before the next episode"}.`, 700);
  return {
    cliffhanger: clean(r?.cliffhanger, 600) || `[dramatically] Nothing will ever be the same again. [beat] Probably. Next time, on ${ctx.show.title}.`,
    recap: clean(r?.recap, 600) || `Previously, on ${ctx.show.title}: ${ctx.plot}`,
  };
}

async function finalePack(ctx) {
  const r = await ask(`Show: "${ctx.show.title}", a ${ctx.genre.name} (${ctx.genre.tone}).
Cast:
${castBlock(ctx.cast)}
The whole season so far: ${ctx.recap}
Season rating: ${ctx.rating.toFixed(1)} out of 10 (renewal needs 5.0).

1. Write the series finale narration in two parts, in the voice of: ${ctx.genre.voice}. "open": three or four sentences setting up the final scene, bringing every character together. "close": two sentences that land the ending after each character speaks their final line.
2. The critic ${ctx.critic.name} of ${ctx.critic.outlet}, ${ctx.critic.style}, reviews the season in two or three sentences, mentioning at least two characters by name. Give a star rating out of five that fits the season rating.

Return {"open": "...", "close": "...", "review": "...", "stars": 3}.`, 900);
  const stars = Math.max(1, Math.min(5, Math.round(Number(r?.stars) || (ctx.rating >= 7 ? 4 : ctx.rating >= 5 ? 3 : 2))));
  return {
    open: clean(r?.open, 700) || '[softly] And so, for the last time, everyone found themselves in the same room. Nobody had planned it. Everybody had a reason to be there.',
    close: clean(r?.close, 500) || '[beat] The lights went down. [sighs] And somewhere, a network executive cried into a spreadsheet.',
    review: clean(r?.review, 600) || 'It happened. I watched it. I would like those hours back.',
    stars,
  };
}

module.exports = { enabled, showBible, castIntros, episodeSetup, afterEpisode, finalePack };
