const socket = io();
let myName = '';
let myScore = 0;
let currentWords = [];
let placements = {};
let dIdx = null;
const ghost = document.getElementById('drag-ghost');

function show(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-' + id).classList.add('active');
}

function rankClass(i) { return ['rank-1', 'rank-2', 'rank-3'][i] || ''; }

// ── Join ──────────────────────────────────────────────────────────────────────
function joinGame() {
  const code = document.getElementById('j-code').value.trim().toUpperCase();
  const name = document.getElementById('j-name').value.trim();
  const err  = document.getElementById('j-error');
  if (code.length < 4) { err.textContent = 'Enter the room code from your teacher\'s screen.'; return; }
  if (!name)           { err.textContent = 'Enter your name.'; return; }
  err.textContent = '';
  socket.emit('joinRoom', { code, name }, res => {
    if (res.error) { err.textContent = res.error; return; }
    myName = name;
    document.getElementById('w-name').textContent = `Hi, ${name}!`;
    show('waiting');
  });
}

socket.on('playerJoined', ({ players }) => {
  document.getElementById('w-players').innerHTML =
    players.map(n => `<span class="player-chip">${n}</span>`).join('');
});
socket.on('playerLeft', ({ players }) => {
  document.getElementById('w-players').innerHTML =
    players.map(n => `<span class="player-chip">${n}</span>`).join('');
});

// ── Round start ───────────────────────────────────────────────────────────────
socket.on('roundStart', ({ round, totalRounds, scale, words, timeLeft }) => {
  placements = {};
  currentWords = words;
  myScore = myScore; // preserved

  document.getElementById('p-name').textContent = myName;
  document.getElementById('p-cat').textContent = scale.category;
  document.getElementById('p-left').textContent = scale.left;
  document.getElementById('p-right').textContent = scale.right;
  document.getElementById('p-timer').textContent = timeLeft;
  document.getElementById('p-timer').className = 'timer sm';
  document.getElementById('p-score').textContent = myScore;

  for (let z = 1; z <= 5; z++) document.getElementById(`dz-${z}`).innerHTML = '';

  const bank = document.getElementById('p-bank');
  bank.innerHTML = '';
  words.forEach(({ word, index }) => bank.appendChild(mkBank(word, index)));

  updateProgress();
  document.getElementById('p-submit').disabled = true;
  show('playing');
});

socket.on('timerTick', ({ timeLeft }) => {
  const el = document.getElementById('p-timer');
  el.textContent = timeLeft;
  el.className = 'timer sm' + (timeLeft <= 10 ? ' warn' : '');
  if (timeLeft <= 0) autoSubmit();
});

// ── Tiles ─────────────────────────────────────────────────────────────────────
function mkBank(word, idx) {
  const t = document.createElement('span');
  t.className = 'tile bank'; t.dataset.idx = idx;
  t.textContent = word; t.title = word;
  addDrag(t); return t;
}
function mkZone(word, idx, z) {
  const t = document.createElement('span');
  t.className = 'tile placed'; t.dataset.idx = idx; t.dataset.z = z;
  t.textContent = word; t.title = word;
  addDrag(t); return t;
}
function addDrag(t) {
  t.addEventListener('mousedown', onMD);
  t.addEventListener('touchstart', onTS, { passive: false });
}

function updateProgress() {
  const n = Object.keys(placements).length, total = currentWords.length;
  document.getElementById('p-placed').textContent =
    n >= total ? `All ${total} placed ✓` : `${n} of ${total} placed`;
  document.getElementById('p-submit').disabled = n < total;
}

function placeTile(idx, z) {
  document.querySelector(`.zone-words [data-idx="${idx}"]`)?.remove();
  document.querySelector(`#p-bank [data-idx="${idx}"]`)?.remove();
  const w = currentWords.find(w => w.index === idx);
  if (!w) return;
  placements[idx] = z;
  document.getElementById(`dz-${z}`).appendChild(mkZone(w.word, idx, z));
  updateProgress();
}
function returnToBank(idx) {
  document.querySelector(`.zone-words [data-idx="${idx}"]`)?.remove();
  delete placements[idx];
  const w = currentWords.find(w => w.index === idx);
  if (!w) return;
  if (!document.querySelector(`#p-bank [data-idx="${idx}"]`))
    document.getElementById('p-bank').appendChild(mkBank(w.word, idx));
  updateProgress();
}

// ── Drag (mouse) ──────────────────────────────────────────────────────────────
function onMD(e) {
  e.preventDefault();
  dIdx = parseInt(e.currentTarget.dataset.idx);
  startGhost(e.currentTarget.textContent, e.clientX, e.clientY);
  e.currentTarget.classList.add('dragging');
  document.addEventListener('mousemove', onMM);
  document.addEventListener('mouseup', onMU);
}
function onMM(e) { moveGhost(e.clientX, e.clientY); hlZone(e.clientX, e.clientY); }
function onMU(e) {
  document.querySelector(`[data-idx="${dIdx}"]`)?.classList.remove('dragging');
  ghost.style.display = 'none'; clearHL(); drop(e.clientX, e.clientY);
  document.removeEventListener('mousemove', onMM);
  document.removeEventListener('mouseup', onMU);
}

// ── Drag (touch) ──────────────────────────────────────────────────────────────
function onTS(e) {
  e.preventDefault();
  dIdx = parseInt(e.currentTarget.dataset.idx);
  const t = e.touches[0];
  startGhost(e.currentTarget.textContent, t.clientX, t.clientY);
  e.currentTarget.classList.add('dragging');
  document.addEventListener('touchmove', onTM, { passive: false });
  document.addEventListener('touchend', onTE);
}
function onTM(e) { e.preventDefault(); const t = e.touches[0]; moveGhost(t.clientX, t.clientY); hlZone(t.clientX, t.clientY); }
function onTE(e) {
  const t = e.changedTouches[0];
  document.querySelector(`[data-idx="${dIdx}"]`)?.classList.remove('dragging');
  ghost.style.display = 'none'; clearHL(); drop(t.clientX, t.clientY);
  document.removeEventListener('touchmove', onTM);
  document.removeEventListener('touchend', onTE);
}

function startGhost(txt, x, y) { ghost.textContent = txt; ghost.style.display = 'block'; moveGhost(x, y); }
function moveGhost(x, y) { ghost.style.left = (x - 30) + 'px'; ghost.style.top = (y - 18) + 'px'; }
function hlZone(x, y) { clearHL(); document.elementFromPoint(x, y)?.closest('.zone')?.classList.add('over'); }
function clearHL() { document.querySelectorAll('.zone').forEach(z => z.classList.remove('over')); }
function drop(x, y) {
  const el = document.elementFromPoint(x, y);
  const zone = el?.closest('.zone');
  const bank = el?.closest('#p-bank');
  if (zone) placeTile(dIdx, parseInt(zone.dataset.z));
  else if (bank) returnToBank(dIdx);
  dIdx = null;
}

// ── Submit ────────────────────────────────────────────────────────────────────
function submitPlacements() {
  const code = document.getElementById('j-code').value.trim().toUpperCase();
  socket.emit('submitPlacements', { code, placements }, res => {
    if (res.error) { alert(res.error); return; }
    show('submitted');
  });
}
function autoSubmit() {
  currentWords.forEach(w => { if (placements[w.index] === undefined) placements[w.index] = 3; });
  submitPlacements();
}

// ── Round end ─────────────────────────────────────────────────────────────────
socket.on('roundEnd', ({ round, totalRounds, words, playerResults, scoreboard, isLast }) => {
  if (!playerResults) return; // host message — ignore on player side

  let roundScore = 0;
  if (playerResults) Object.values(playerResults).forEach(r => { roundScore += r.points; });
  myScore += roundScore;

  document.getElementById('pre-title').textContent = isLast ? 'Final round done!' : `Round ${round} done!`;
  document.getElementById('pre-round-score').textContent = roundScore;
  document.getElementById('pre-total-score').textContent = myScore;
  document.getElementById('pre-waiting').textContent = isLast ? 'Waiting for final scores…' : 'Waiting for next round…';

  document.getElementById('pre-word-results').innerHTML = (words || []).map((w, i) => {
    const r = playerResults?.[i];
    if (!r) return '';
    const cls = r.points === 20 ? 'correct' : r.points === 10 ? 'partial' : 'wrong';
    const note = r.submittedZone === r.correctZone
      ? `Zone ${r.correctZone} ✓`
      : `You: zone ${r.submittedZone ?? '?'} · Correct: zone ${r.correctZone}`;
    return `<div class="wr ${cls}">
      <span class="wr-word">${w.w}</span>
      <span class="wr-note">${note}</span>
      <span class="wr-pts">${r.points === 20 ? '+20' : r.points === 10 ? '+10' : '0'}</span>
    </div>`;
  }).join('');

  document.getElementById('pre-scoreboard').innerHTML = scoreboard.map((p, i) => `
    <div class="score-row">
      <div class="score-left">
        <span class="rank-num ${rankClass(i)}">${i + 1}</span>
        <span class="score-name">${p.name}${p.name === myName ? ' (you)' : ''}</span>
      </div>
      <span class="score-pts">${p.score}</span>
    </div>`).join('');

  show('roundend');
});

// ── Game end ──────────────────────────────────────────────────────────────────
socket.on('gameEnd', ({ scoreboard }) => {
  document.getElementById('pge-scoreboard').innerHTML = scoreboard.map((p, i) => `
    <div class="score-row">
      <div class="score-left">
        <span class="rank-num ${rankClass(i)}">${i + 1}</span>
        <span class="score-name">${p.name}${p.name === myName ? ' (you)' : ''}${i === 0 ? ' 🏆' : ''}</span>
      </div>
      <span class="score-pts">${p.score}</span>
    </div>`).join('');
  show('gameend');
});

// ── Play again / back to lobby ────────────────────────────────────────────────
socket.on('backToLobby', ({ players }) => {
  myScore = 0;
  placements = {};
  document.getElementById('w-players').innerHTML =
    players.map(n => `<span class="player-chip">${n}</span>`).join('');
  document.getElementById('w-name').textContent = `Hi, ${myName}!`;
  show('waiting');
});

socket.on('hostLeft', () => {
  alert('The host has ended the game.');
  location.href = '/';
});

// Enter key on join
document.addEventListener('DOMContentLoaded', () => {
  ['j-code', 'j-name'].forEach(id => {
    document.getElementById(id)?.addEventListener('keydown', e => {
      if (e.key === 'Enter') joinGame();
    });
  });
});
