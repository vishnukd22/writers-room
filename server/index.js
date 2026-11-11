'use strict';
const path = require('path');
const fs = require('fs');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const QRCode = require('qrcode');
const { Game } = require('./game');
const voice = require('./voice');
const ai = require('./ai');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, '..', 'public');
const NM = path.join(__dirname, '..', 'node_modules');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { pingInterval: 10000, pingTimeout: 30000 });

app.get('/health', (_q, r) => r.send('ok'));
app.get('/tv', (_q, r) => r.sendFile(path.join(PUBLIC, 'tv.html')));
app.get('/', (_q, r) => r.sendFile(path.join(PUBLIC, 'play.html')));
app.get('/audio/:id', (q, r) => {
  const buf = voice.audio(q.params.id);
  if (!buf) return r.status(404).end();
  r.set('Content-Type', 'audio/mpeg'); r.set('Cache-Control', 'public, max-age=86400'); r.send(buf);
});
// Which art, music and sound files exist, so the TV can fall back gracefully for the rest.
app.get('/assets-manifest', (_q, r) => {
  const list = (dir) => { try { return fs.readdirSync(path.join(PUBLIC, 'assets', dir)).filter((f) => !f.startsWith('.')); } catch (e) { return []; } };
  r.json({ img: list('img'), music: list('music'), sfx: list('sfx'), ai: ai.enabled(), voice: voice.enabled() });
});
app.use('/fonts/baloo', express.static(path.join(NM, '@fontsource-variable', 'baloo-2'), { maxAge: '30d' }));
app.use('/fonts/courier', express.static(path.join(NM, '@fontsource', 'courier-prime'), { maxAge: '30d' }));
app.use('/fonts/kalam', express.static(path.join(NM, '@fontsource', 'kalam'), { maxAge: '30d' }));
app.use(express.static(PUBLIC, { maxAge: '1h' }));

const rooms = new Map();
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const newCode = () => { let c; do { c = Array.from({ length: 4 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join(''); } while (rooms.has(c)); return c; };
function originOf(socket) {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/$/, '');
  const h = socket.handshake.headers;
  const proto = (h['x-forwarded-proto'] || '').split(',')[0] || (socket.handshake.secure ? 'https' : 'http');
  return `${proto}://${h['x-forwarded-host'] || h.host}`;
}
async function createRoom(socket) {
  const code = newCode();
  const game = new Game(code, {
    toHost: (s) => io.to(`host:${code}`).emit('state', s),
    toPlayer: (pid, s) => io.to(`p:${pid}`).emit('state', s),
    kicked: (pid) => io.to(`p:${pid}`).emit('kicked'),
  });
  const origin = originOf(socket);
  game.joinUrl = `${origin}/?room=${code}`;
  game.qr = await QRCode.toDataURL(game.joinUrl, { margin: 1, width: 360, color: { dark: '#1E2A3A', light: '#F6EAD4' } });
  rooms.set(code, game);
  return game;
}

io.on('connection', (socket) => {
  const ack = (fn, v) => { if (typeof fn === 'function') fn(v); };
  socket.on('host:create', async (_a, fn) => { const g = await createRoom(socket); socket.join(`host:${g.code}`); socket.data = { code: g.code, host: true }; ack(fn, { code: g.code }); g.sync(); });
  socket.on('host:attach', (a, fn) => {
    const g = rooms.get(String(a?.code || '').toUpperCase());
    if (!g) return ack(fn, { error: 'Room not found' });
    socket.join(`host:${g.code}`); socket.data = { code: g.code, host: true }; ack(fn, { code: g.code }); g.sync();
  });
  socket.on('host:cueDone', (a) => { const g = rooms.get(socket.data?.code); if (g && socket.data.host && a?.id) g.cueFinished(a.id); });
  socket.on('host:skip', () => { const g = rooms.get(socket.data?.code); if (g && socket.data.host) g.skip(null); });
  socket.on('host:start', (a, fn) => { const g = rooms.get(socket.data?.code); if (g && socket.data.host) ack(fn, g.start(null, a?.genre) || {}); });

  socket.on('player:join', (a, fn) => {
    const g = rooms.get(String(a?.code || '').trim().toUpperCase());
    if (!g) return ack(fn, { error: 'No game with that code. Check the TV.' });
    const r = g.join(a.name, a.token, a.pron, a.act);
    if (r.error) return ack(fn, { error: r.error });
    socket.join(`p:${r.player.id}`); socket.data = { code: g.code, pid: r.player.id };
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

server.listen(PORT, () => console.log(`Writers' Room on http://localhost:${PORT}  (TV: /tv)  AI: ${ai.enabled() ? 'on' : 'off'}  Voice: ${voice.enabled() ? 'on' : 'off'}`));
