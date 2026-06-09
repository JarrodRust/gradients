const socket = io();
let roomCode = null;

const YR = { 3: 'Plain', 4: 'Witty', 5: 'Articulate', 6: 'Eloquent' };

function show(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-' + id).classList.add('active');
}

function rankClass(i) { return ['rank-1', 'rank-2', 'rank-3'][i] || ''; }

function createRoom() {
  const settings = {
    year:      parseInt(document.getElementById('s-year').value),
    rounds:    parseInt(document.getElementById('s-rounds').value),
    roundTime: parseInt(document.getElementById('s-time').value),
  };
  socket.emit('createRoom', settings, ({ code }) => {
    roomCode = code;
    document.getElementById('lobby-code').textContent = code;
    document.getElementById('lobby-url').textContent =
      location.hostname + (location.port ? ':' + location.port : '') + '/player.html';
    show('lobby');
  });
}

// ── Lobby ─────────────────────────────────────────────────────────────────────
socket.on('playerJoined', ({ name, players }) => {
  renderLobbyPlayers(players);
  const btn = document.getElementById('start-btn');
  btn.disabled = false;
  btn.textContent = `Start game — ${players.length} player${players.length !== 1 ? 's' : ''} ready`;
});

socket.on('playerLeft', ({ players }) => {
  renderLobbyPlayers(players);
  if (players.length === 0) {
    const btn = document.getElementById('start-btn');
    btn.disabled = true;
    btn.textContent = 'Waiting for players…';
  }
});

function renderLobbyPlayers(players) {
  document.getElementById('lobby-count').textContent = players.length;
  document.getElementById('lobby-players').innerHTML =
    players.map(n => `<span class="player-chip">${n}</span>`).join('');
}

function startGame() {
  socket.emit('startGame', { code: roomCode });
}

// ── Round start ───────────────────────────────────────────────────────────────
socket.on('roundStart', ({ round, totalRounds, scale, words, timeLeft }) => {
  document.getElementById('g-cat').textContent = scale.category;
  document.getElementById('g-yr').textContent = YR[parseInt(document.getElementById('s-year').value)] || 'Year 5';
  document.getElementById('g-round').textContent = `Round ${round} of ${totalRounds}`;
  document.getElementById('g-left').textContent = scale.left;
  document.getElementById('g-right').textContent = scale.right;
  document.getElementById('g-timer').textContent = timeLeft;
  document.getElementById('g-timer').className = 'timer';
  document.getElementById('g-sub-fill').style.width = '0%';
  document.getElementById('g-sub-label').textContent = '0 of 0 submitted';
  document.getElementById('g-scoreboard').innerHTML = '';

  document.getElementById('g-word-grid').innerHTML =
    words.map(w => `<span class="host-chip">${w.word}</span>`).join('');

  show('playing');
});

socket.on('timerTick', ({ timeLeft }) => {
  const el = document.getElementById('g-timer');
  el.textContent = timeLeft;
  el.className = 'timer' + (timeLeft <= 10 ? ' warn' : '');
});

socket.on('submissionUpdate', ({ submittedCount, playerCount }) => {
  const pct = playerCount > 0 ? (submittedCount / playerCount) * 100 : 0;
  document.getElementById('g-sub-fill').style.width = pct + '%';
  document.getElementById('g-sub-label').textContent = `${submittedCount} of ${playerCount} submitted`;
});

function endRoundEarly() {
  socket.emit('endRound', { code: roomCode });
}

// ── Round end ─────────────────────────────────────────────────────────────────
socket.on('roundEnd', ({ round, totalRounds, scale, words, scoreboard, isLast }) => {
  document.getElementById('re-title').textContent = `Round ${round} results`;
  document.getElementById('re-scale').textContent = `${scale.left} → ${scale.right}`;

  const byZone = [[], [], [], [], []];
  words.forEach(w => byZone[w.z - 1].push(w.w));
  document.getElementById('re-answer-zones').innerHTML = byZone.map((ws, i) => `
    <div class="answer-zone" data-z="${i + 1}">
      <div class="answer-zone-num">${i + 1}</div>
      ${ws.map(w => `<span class="answer-chip" data-z="${i + 1}">${w}</span>`).join('')}
    </div>`).join('');

  document.getElementById('re-scoreboard').innerHTML = renderScoreboard(scoreboard);
  document.getElementById('re-next').textContent = isLast ? 'Final scores →' : 'Next round →';
  show('roundend');
});

function nextRound() {
  socket.emit('nextRound', { code: roomCode });
}

// ── Game end ──────────────────────────────────────────────────────────────────
socket.on('gameEnd', ({ scoreboard }) => {
  document.getElementById('ge-scoreboard').innerHTML = renderScoreboard(scoreboard, true);
  show('gameend');
});

function renderScoreboard(players, final = false) {
  return players.map((p, i) => `
    <div class="score-row">
      <div class="score-left">
        <span class="rank-num ${rankClass(i)}">${i + 1}</span>
        <span class="score-name">${p.name}</span>
        ${final && i === 0 ? '<span class="badge badge-green" style="margin-left:6px">Champion 🏆</span>' : ''}
      </div>
      <span class="score-pts">${p.score}${!final && p.roundScore ? `<span class="round-pts">+${p.roundScore}</span>` : ''}</span>
    </div>`).join('');
}

// ── Play again ────────────────────────────────────────────────────────────────
socket.on('backToLobby', ({ players }) => {
  renderLobbyPlayers(players);
  const btn = document.getElementById('start-btn');
  btn.disabled = players.length === 0;
  btn.textContent = players.length > 0
    ? `Start game — ${players.length} player${players.length !== 1 ? 's' : ''} ready`
    : 'Waiting for players…';
  show('lobby');
});

function playAgain() {
  const settings = {
    year:      parseInt(document.getElementById('s-year').value),
    rounds:    parseInt(document.getElementById('s-rounds').value),
    roundTime: parseInt(document.getElementById('s-time').value),
  };
  socket.emit('playAgain', { code: roomCode, settings }, res => {
    if (res.ok) show('lobby');
  });
}
