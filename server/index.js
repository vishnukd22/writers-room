'use strict';
const path = require('path');
const fs = require('fs');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const QRCode = require('qrcode');
const { Game } = require('./game');
const { LandGrab } = require('./landgrab');
const { BidCoin } = require('./bidcoin');
const BCI = require('./bc-items');
const voice = require('./voice');
const ai = require('./ai');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, '..', 'public');
const NM = path.join(__dirname, '..', 'node_modules');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { pingInterval: 10000, pingTimeout: 30000 });

app.get('/health', (_q, r) => r.send('ok'));
app.get('/tv', (_q, r) => r.sendFile(path.join(PUBLIC, 'menu.html')));
app.get('/tv/writers', (_q, r) => r.sendFile(path.join(PUBLIC, 'tv.html')));
app.get('/tv/landgrab', (_q, r) => r.sendFile(path.join(PUBLIC, 'lg-tv.html')));
app.get('/', (_q, r) => r.sendFile(path.join(PUBLIC, 'play.html')));
app.get('/lg', (_q, r) => r.sendFile(path.join(PUBLIC, 'lg-play.html')));
app.get('/tv/bidcoin', (_q, r) => r.sendFile(path.join(PUBLIC, 'bc-tv.html')));
app.get('/bc', (_q, r) => r.sendFile(path.join(PUBLIC, 'bc-play.html')));
// every BID-COIN! item with its photo and who took it, for checking the photos and for the credits
app.get(['/bidcoin/gallery', '/bidcoin/credits'], (_q, r) => r.sendFile(path.join(PUBLIC, 'bc-gallery.html')));
app.get('/bidcoin/items.json', (_q, r) => {
  let credits = {}; try { credits = JSON.parse(fs.readFileSync(path.join(PUBLIC, 'assets', 'bc', 'credits.json'), 'utf8')); } catch (e) { credits = {}; }
  const have = new Set((() => { try { return fs.readdirSync(path.join(PUBLIC, 'assets', 'bc', 'items')); } catch (e) { return []; } })());
  const row = (i) => ({ id: i.id, name: i.name, cat: i.cat, rar: i.rar || 's', value: i.value ?? null, line: i.line, photo: have.has(`${i.id}.webp`), credit: credits[i.id] || null });
  r.set('Cache-Control', 'no-cache'); r.json({ items: [...BCI.ITEMS.map(row), ...BCI.CONTAINERS.map(row)], cats: BCI.CATS });
});
app.get('/audio/:id', (q, r) => {
  const buf = voice.audio(q.params.id);
  if (!buf) return r.status(404).end();
  r.set('Content-Type', 'audio/mpeg'); r.set('Cache-Control', 'public, max-age=86400'); r.send(buf);
});
// Which art, music and sound files exist, so the TV can fall back gracefully for the rest.
app.get('/assets-manifest', (_q, r) => {
  const list = (dir) => { try { return fs.readdirSync(path.join(PUBLIC, 'assets', dir)).filter((f) => !f.startsWith('.')); } catch (e) { return []; } };
  r.json({ img: list('img'), music: list('music'), sfx: list('sfx'), bc: list('bc/items').map((f) => f.replace(/\.webp$/, '')), ai: ai.enabled(), voice: voice.enabled() });
});
app.use('/fonts/baloo', express.static(path.join(NM, '@fontsource-variable', 'baloo-2'), { maxAge: '30d' }));
app.use('/fonts/courier', express.static(path.join(NM, '@fontsource', 'courier-prime'), { maxAge: '30d' }));
app.use('/fonts/kalam', express.static(path.join(NM, '@fontsource', 'kalam'), { maxAge: '30d' }));
app.use('/fonts/bungee', express.static(path.join(NM, '@fontsource', 'bungee'), { maxAge: '30d' }));
// Pictures and music can be cached for days. Code is always checked for updates, so a new upload shows up at once.
app.use('/assets', express.static(path.join(PUBLIC, 'assets'), { maxAge: '7d' }));
app.use(express.static(PUBLIC, { setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache') }));

const rooms = new Map();
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const newCode = () => { let c; do { c = Array.from({ length: 4 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join(''); } while (rooms.has(c)); return c; };
function originOf(socket) {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/$/, '');
  const h = socket.handshake.headers;
  const proto = (h['x-forwarded-proto'] || '').split(',')[0] || (socket.handshake.secure ? 'https' : 'http');
  return `${proto}://${h['x-forwarded-host'] || h.host}`;
}
// kind: 'wr' (Writers' Room), 'lg' (Land Grab) or 'bc' (BID-COIN!). test: the bot buttons.
const KINDS = ['wr', 'lg', 'bc'];
const phonePath = (kind, code) => (kind === 'lg' ? `/lg?room=${code}` : kind === 'bc' ? `/bc?room=${code}` : `/?room=${code}`);
async function createRoom(socket, kind = 'wr', test = false) {
  const code = newCode();
  const hooks = {
    toHost: (s) => io.to(`host:${code}`).emit('state', s),
    toPlayer: (pid, s) => io.to(`p:${pid}`).emit('state', s),
    kicked: (pid) => io.to(`p:${pid}`).emit('kicked'),
    menu: () => io.to(`host:${code}`).emit('menu'),
    blast: (ev, data) => io.to(`room:${code}`).emit(ev, data), // tiny instant messages to everyone in the room (bids)
  };
  const game = kind === 'lg' ? new LandGrab(code, hooks, { test }) : kind === 'bc' ? new BidCoin(code, hooks, { test }) : new Game(code, hooks);
  game.kind = kind;
  const origin = originOf(socket);
  game.joinUrl = `${origin}${phonePath(kind, code)}`;
  game.qr = await QRCode.toDataURL(game.joinUrl, { margin: 1, width: 360, color: { dark: '#1E2A3A', light: '#F6EAD4' } });
  rooms.set(code, game);
  return game;
}

io.on('connection', (socket) => {
  const ack = (fn, v) => { if (typeof fn === 'function') fn(v); };
  socket.on('host:create', async (a, fn) => {
    const g = await createRoom(socket, KINDS.includes(a?.game) ? a.game : 'wr', !!a?.test); socket.join(`host:${g.code}`); socket.join(`room:${g.code}`); socket.data = { code: g.code, host: true }; ack(fn, { code: g.code }); g.sync();
    // coming back from the game menu: send everyone from the last game straight into this one
    const old = a?.from && rooms.get(String(a.from).toUpperCase());
    if (old && old !== g) { const url = phonePath(g.kind, g.code); for (const p of old.players) if (!p.bot) io.to(`p:${p.id}`).emit('moveTo', { url }); }
  });
  socket.on('host:attach', (a, fn) => {
    const g = rooms.get(String(a?.code || '').toUpperCase());
    if (!g || (a?.game && a.game !== g.kind)) return ack(fn, { error: 'Room not found' });
    socket.join(`host:${g.code}`); socket.join(`room:${g.code}`); socket.data = { code: g.code, host: true }; ack(fn, { code: g.code }); g.sync();
  });
  socket.on('host:cueDone', (a) => { const g = rooms.get(socket.data?.code); if (g && socket.data.host && a?.id) g.cueFinished(a.id); });
  socket.on('host:skip', () => { const g = rooms.get(socket.data?.code); if (g && socket.data.host) g.skip(null); });
  socket.on('host:start', (a, fn) => { const g = rooms.get(socket.data?.code); if (g && socket.data.host) ack(fn, g.start(null, a?.genre) || {}); });
  socket.on('host:addBot', (_a, fn) => { const g = rooms.get(socket.data?.code); if (g && socket.data.host && g.addBot) ack(fn, g.addBot()); });
  socket.on('host:removeBots', (_a, fn) => { const g = rooms.get(socket.data?.code); if (g && socket.data.host && g.removeBots) { g.removeBots(); ack(fn, {}); } });

  socket.on('player:join', (a, fn) => {
    const g = rooms.get(String(a?.code || '').trim().toUpperCase());
    if (!g) return ack(fn, { error: 'No game with that code. Check the TV.' });
    const want = KINDS.includes(a.game) ? a.game : 'wr';
    if (g.kind !== want) return ack(fn, { redirect: phonePath(g.kind, g.code) });
    const r = g.join(a.name, a.token, a.pron, a.act);
    if (r.error) return ack(fn, { error: r.error });
    socket.join(`p:${r.player.id}`); socket.join(`room:${g.code}`); socket.data = { code: g.code, pid: r.player.id };
    g.setConnected(r.player.id, true);
    ack(fn, { ok: true, token: r.player.token, code: g.code });
  });
  socket.on('act', (a, fn) => {
    const g = rooms.get(socket.data?.code); const pid = socket.data?.pid;
    if (!g || !pid) return ack(fn, { error: 'Not in a game' });
    try { ack(fn, g.act(pid, a) || {}); } catch (e) { console.error(e); ack(fn, { error: 'Something went wrong' }); }
  });
  socket.on('disconnect', async () => {
    const { code, pid } = socket.data || {}; const g = rooms.get(code);
    if (!g || !pid) return;
    const still = await io.in(`p:${pid}`).fetchSockets();
    if (!still.length) g.setConnected(pid, false);
  });
});

setInterval(() => { for (const [code, g] of rooms) if (Date.now() - g.lastActive > 6 * 3600 * 1000) { g.runId++; rooms.delete(code); } }, 10 * 60 * 1000);

server.listen(PORT, () => console.log(`Party games on http://localhost:${PORT}  (TV: /tv)  AI: ${ai.enabled() ? 'on' : 'off'}  Voice: ${voice.enabled() ? 'on' : 'off'}`));
