const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const SCALES = require('./data/scales');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// ── Pick words for a round (up to 3 per zone) ────────────────────────────────
function pickWords(scale) {
  const byZone = [[], [], [], [], []];
  scale.words.forEach(w => byZone[w.z - 1].push(w));
  const selected = [];
  for (let z = 0; z < 5; z++) {
    const pool = [...byZone[z]].sort(() => Math.random() - 0.5);
    selected.push(...pool.slice(0, 3));
  }
  return selected;
}

// ── Scoring ──────────────────────────────────────────────────────────────────
function scoreWord(submitted, correct) {
  const diff = Math.abs(submitted - correct);
  if (diff === 0) return 20;
  if (diff === 1) return 10;
  return 0;
}

// ── Room management ──────────────────────────────────────────────────────────
const rooms = {};

function createRoom(code, settings) {
  const yr = settings.year || 5;
  const pool = SCALES[yr] || SCALES[5];
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  const scales = [];
  while (scales.length < settings.rounds) scales.push(...shuffled);
  return {
    code,
    hostId: null,
    players: {},
    settings: { rounds: settings.rounds, roundTime: settings.roundTime, year: yr },
    scales: scales.slice(0, settings.rounds),
    currentRound: 0,
    phase: 'lobby',
    roundWords: [],
    timer: null,
    timeLeft: 0,
    submissions: {},
  };
}

function startRound(room) {
  room.currentRound++;
  room.phase = 'playing';
  room.submissions = {};
  Object.values(room.players).forEach(p => { p.roundScore = 0; });

  const scale = room.scales[room.currentRound - 1];
  room.roundWords = pickWords(scale);

  const displayWords = room.roundWords.map((w, i) => ({ word: w.w, index: i }))
    .sort(() => Math.random() - 0.5);

  room.timeLeft = room.settings.roundTime;

  io.to(room.code).emit('roundStart', {
    round: room.currentRound,
    totalRounds: room.settings.rounds,
    scale: { category: scale.cat, left: scale.left, right: scale.right },
    words: displayWords,
    timeLeft: room.timeLeft,
  });

  room.timer = setInterval(() => {
    room.timeLeft--;
    io.to(room.code).emit('timerTick', { timeLeft: room.timeLeft });
    if (room.timeLeft <= 0) endRound(room);
  }, 1000);
}

function endRound(room) {
  if (room.timer) { clearInterval(room.timer); room.timer = null; }
  room.phase = 'roundEnd';

  const scale = room.scales[room.currentRound - 1];
  const isLast = room.currentRound >= room.settings.rounds;

  // Score ALL players — use their submission if they have one, empty otherwise
  Object.entries(room.players).forEach(([socketId, player]) => {
    const submission = room.submissions[socketId] || {};
    let roundScore = 0;
    const wordResults = {};
    room.roundWords.forEach((w, i) => {
      const submitted = submission[i] ?? null;
      const pts = submitted !== null ? scoreWord(submitted, w.z) : 0;
      roundScore += pts;
      wordResults[i] = { submittedZone: submitted, correctZone: w.z, points: pts };
    });
    player.score += roundScore;
    player.roundScore = roundScore;

    // Send personal results to every player
    io.to(socketId).emit('roundEnd', {
      round: room.currentRound,
      totalRounds: room.settings.rounds,
      scale: { left: scale.left, right: scale.right },
      words: room.roundWords,
      playerResults: wordResults,
      scoreboard: getScoreboard(room),
      isLast,
    });
  });

  // Send results to host
  io.to(room.hostId).emit('roundEnd', {
    round: room.currentRound,
    totalRounds: room.settings.rounds,
    scale: { left: scale.left, right: scale.right, category: scale.cat },
    words: room.roundWords,
    playerResults: null,
    scoreboard: getScoreboard(room),
    isLast,
    submissionCount: Object.keys(room.submissions).length,
    playerCount: Object.keys(room.players).length,
  });
}

function endGame(room) {
  room.phase = 'gameEnd';
  io.to(room.code).emit('gameEnd', { scoreboard: getScoreboard(room) });
}

function getScoreboard(room) {
  return Object.values(room.players)
    .map(p => ({ name: p.name, score: p.score, roundScore: p.roundScore || 0 }))
    .sort((a, b) => b.score - a.score);
}

// ── Socket events ─────────────────────────────────────────────────────────────
io.on('connection', (socket) => {

  socket.on('createRoom', (settings, cb) => {
    const code = Math.random().toString(36).substring(2, 7).toUpperCase();
    const room = createRoom(code, settings);
    room.hostId = socket.id;
    rooms[code] = room;
    socket.join(code);
    cb({ code });
  });

  socket.on('joinRoom', ({ code, name }, cb) => {
    const room = rooms[code];
    if (!room) return cb({ error: 'Room not found. Check your code.' });
    if (room.phase !== 'lobby') return cb({ error: 'Game already in progress.' });
    if (Object.values(room.players).some(p => p.name.toLowerCase() === name.toLowerCase()))
      return cb({ error: 'That name is already taken.' });
    socket.join(code);
    socket.data.roomCode = code;
    socket.data.name = name;
    room.players[socket.id] = { name, score: 0, roundScore: 0 };
    io.to(code).emit('playerJoined', { name, players: Object.values(room.players).map(p => p.name) });
    cb({ ok: true });
  });

  socket.on('startGame', ({ code }) => {
    const room = rooms[code];
    if (!room || room.hostId !== socket.id) return;
    if (Object.keys(room.players).length === 0) return;
    startRound(room);
  });

  socket.on('submitPlacements', ({ code, placements }, cb) => {
    const room = rooms[code];
    if (!room || room.phase !== 'playing') return cb({ error: 'No active round.' });
    const player = room.players[socket.id];
    if (!player) return cb({ error: 'Not in this game.' });
    room.submissions[socket.id] = placements;
    const submitted = Object.keys(room.submissions).length;
    const total = Object.keys(room.players).length;
    io.to(room.hostId).emit('submissionUpdate', { submittedCount: submitted, playerCount: total });
    cb({ ok: true });
    if (submitted >= total) endRound(room);
  });

  socket.on('endRound', ({ code }) => {
    const room = rooms[code];
    if (!room || room.hostId !== socket.id) return;
    endRound(room);
  });

  socket.on('nextRound', ({ code }) => {
    const room = rooms[code];
    if (!room || room.hostId !== socket.id) return;
    if (room.currentRound >= room.settings.rounds) endGame(room);
    else startRound(room);
  });

  socket.on('playAgain', ({ code, settings }, cb) => {
    const room = rooms[code];
    if (!room || room.hostId !== socket.id) return;
    Object.values(room.players).forEach(p => { p.score = 0; p.roundScore = 0; });
    const yr = settings.year || room.settings.year;
    const pool = SCALES[yr] || SCALES[5];
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    const scales = [];
    while (scales.length < settings.rounds) scales.push(...shuffled);
    room.settings = { rounds: settings.rounds, roundTime: settings.roundTime, year: yr };
    room.scales = scales.slice(0, settings.rounds);
    room.currentRound = 0;
    room.phase = 'lobby';
    room.submissions = {};
    if (room.timer) { clearInterval(room.timer); room.timer = null; }
    io.to(code).emit('backToLobby', { players: Object.values(room.players).map(p => p.name) });
    cb({ ok: true });
  });

  socket.on('disconnect', () => {
    const code = socket.data.roomCode;
    if (!code || !rooms[code]) return;
    const room = rooms[code];
    if (room.hostId === socket.id) {
      io.to(code).emit('hostLeft');
      if (room.timer) clearInterval(room.timer);
      delete rooms[code];
    } else {
      const name = room.players[socket.id]?.name;
      delete room.players[socket.id];
      if (name) io.to(code).emit('playerLeft', { name, players: Object.values(room.players).map(p => p.name) });
    }
  });
});

app.get('/api/scales', (req, res) => {
  const summary = {};
  Object.entries(SCALES).forEach(([yr, list]) => {
    summary[yr] = list.map(s => ({ cat: s.cat, left: s.left, right: s.right, words: s.words.length }));
  });
  res.json(summary);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Gradients running on http://localhost:${PORT}`));
