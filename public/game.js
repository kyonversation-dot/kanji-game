const socket = io();
const ROUND_TIME = 50;

// ======= 状態 =======
let mySocketId = null;
let drawerId = null;
let currentColor = '#111111';
let brushSize = 8;
let isDrawing = false;
let lastPoint = null;
let isComposing = false; // IME入力中フラグ

// ======= 要素取得 =======
const joinScreen     = document.getElementById('join-screen');
const gameScreen     = document.getElementById('game-screen');
const nameInput      = document.getElementById('name-input');
const joinBtn        = document.getElementById('join-btn');
const customToggle   = document.getElementById('custom-toggle');
const customPanel    = document.getElementById('custom-panel');
const customInput    = document.getElementById('custom-input');
const customSetBtn   = document.getElementById('custom-set-btn');
const customClearBtn = document.getElementById('custom-clear-btn');
const customStatus   = document.getElementById('custom-status');
const customBadge      = document.getElementById('custom-badge');
const mobileScoreBar   = document.getElementById('mobile-score-bar');

const statusText    = document.getElementById('status-text');
const timerEl       = document.getElementById('timer');
const wordDisplay   = document.getElementById('word-display');
const wordText      = document.getElementById('word-text');
const charHint      = document.getElementById('char-hint');
const canvas        = document.getElementById('game-canvas');
const ctx           = canvas.getContext('2d');
const drawingTools  = document.getElementById('drawing-tools');
const colorBtns     = document.querySelectorAll('.color-btn');
const clearBtn      = document.getElementById('clear-btn');
const guessArea     = document.getElementById('guess-area');
const guessInput    = document.getElementById('guess-input');
const guessBtn      = document.getElementById('guess-btn');
const playerList    = document.getElementById('player-list');
const chatLog       = document.getElementById('chat-log');
const roundOverlay      = document.getElementById('round-overlay');
const overlayContent    = document.getElementById('overlay-content');
const overlayCountdown  = document.getElementById('overlay-countdown');
const wordRevealOverlay = document.getElementById('word-reveal-overlay');
const revealWord        = document.getElementById('reveal-word');
const revealKunyomi     = document.getElementById('reveal-kunyomi');
const revealOnyomi      = document.getElementById('reveal-onyomi');
const revealBtn         = document.getElementById('reveal-btn');

// ======= キャンバス初期化 =======
function initCanvas() {
  const wrapper = canvas.parentElement;
  const size = Math.min(wrapper.clientWidth, wrapper.clientHeight);
  canvas.width  = 600;
  canvas.height = 600;
  clearLocalCanvas();
}

function clearLocalCanvas() {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

window.addEventListener('resize', initCanvas);
initCanvas();

// ======= 座標変換 =======
function getPos(e) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width  / rect.width;
  const scaleY = canvas.height / rect.height;
  const src = e.touches ? e.touches[0] : e;
  return {
    x: (src.clientX - rect.left) * scaleX,
    y: (src.clientY - rect.top)  * scaleY,
  };
}

function norm(pos) {
  return { nx: pos.x / canvas.width, ny: pos.y / canvas.height };
}

function denorm(nx, ny) {
  return { x: nx * canvas.width, y: ny * canvas.height };
}

// ======= 描画処理 =======
function drawDot(x, y, color, size) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, size / 2, 0, Math.PI * 2);
  ctx.fill();
}

function drawLine(x1, y1, x2, y2, color, size) {
  ctx.strokeStyle = color;
  ctx.lineWidth = size;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function applyDrawEvent(data) {
  const { x, y } = denorm(data.nx, data.ny);
  const color = data.color === 'eraser' ? '#ffffff' : data.color;
  const size  = data.color === 'eraser' ? 30 : data.size;

  if (data.type === 'begin') {
    drawDot(x, y, color, size);
    lastPoint = { x, y };
  } else if (data.type === 'move' && lastPoint) {
    drawLine(lastPoint.x, lastPoint.y, x, y, color, size);
    lastPoint = { x, y };
  } else if (data.type === 'end') {
    lastPoint = null;
  }
}

// ======= 描画イベント（描く人のみ） =======
function isMyTurn() {
  return mySocketId && mySocketId === drawerId;
}

function onPointerDown(e) {
  if (!isMyTurn()) return;
  e.preventDefault();
  isDrawing = true;
  const pos = getPos(e);
  const n = norm(pos);
  const data = { type: 'begin', ...n, color: currentColor, size: brushSize };
  applyDrawEvent(data);
  socket.emit('draw', data);
}

function onPointerMove(e) {
  if (!isMyTurn() || !isDrawing) return;
  e.preventDefault();
  const pos = getPos(e);
  const n = norm(pos);
  const data = { type: 'move', ...n, color: currentColor, size: brushSize };
  applyDrawEvent(data);
  socket.emit('draw', data);
}

function onPointerUp(e) {
  if (!isDrawing) return;
  e.preventDefault();
  isDrawing = false;
  lastPoint = null;
  const data = { type: 'end' };
  socket.emit('draw', data);
}

canvas.addEventListener('mousedown',  onPointerDown);
canvas.addEventListener('mousemove',  onPointerMove);
canvas.addEventListener('mouseup',    onPointerUp);
canvas.addEventListener('mouseleave', onPointerUp);
canvas.addEventListener('touchstart', onPointerDown, { passive: false });
canvas.addEventListener('touchmove',  onPointerMove, { passive: false });
canvas.addEventListener('touchend',   onPointerUp,   { passive: false });

// ======= 色・ツール =======
colorBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    colorBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentColor = btn.dataset.color;
  });
});

clearBtn.addEventListener('click', () => {
  clearLocalCanvas();
  socket.emit('clearCanvas');
});

// ======= 今週の漢字パネル =======
customToggle.addEventListener('click', () => {
  const open = !customPanel.classList.contains('hidden');
  customPanel.classList.toggle('hidden', open);
  customToggle.textContent = open
    ? '📝 今週の漢字を設定する ▼'
    : '📝 今週の漢字を設定する ▲';
});

customSetBtn.addEventListener('click', () => {
  const text = customInput.value.trim();
  if (!text) return;
  socket.emit('setCustomWords', { text });
});

customClearBtn.addEventListener('click', () => {
  customInput.value = '';
  socket.emit('clearCustomWords');
});

socket.on('customWordsUpdated', ({ count }) => {
  if (count > 0) {
    customStatus.textContent = `✅ ${count}語を設定しました！`;
    customStatus.className = 'custom-status ok';
    customBadge.textContent = `📝 今週の漢字 ${count}語`;
    customBadge.classList.remove('hidden');
  } else {
    customStatus.textContent = 'リセットしました。ランダムモードで遊びます。';
    customStatus.className = 'custom-status off';
    customBadge.classList.add('hidden');
  }
});

// ======= 参加 =======
joinBtn.addEventListener('click', joinGame);
nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') joinGame(); });

function joinGame() {
  const name = nameInput.value.trim();
  if (!name) { nameInput.focus(); return; }
  socket.emit('join', { name });
}

// ======= 答え送信 =======
guessBtn.addEventListener('click', sendGuess);

guessInput.addEventListener('compositionstart', () => { isComposing = true; });
guessInput.addEventListener('compositionend',   () => { isComposing = false; });
guessInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !isComposing) sendGuess();
});

function sendGuess() {
  const text = guessInput.value.trim();
  if (!text) return;
  socket.emit('guess', { text });
  guessInput.value = '';
}

// ======= チャット追加 =======
function addChat(msg) {
  const el = document.createElement('div');
  el.className = 'chat-msg' + (msg.system ? ' system-msg' : '');
  if (msg.system) {
    el.textContent = msg.text;
  } else {
    el.innerHTML = `<span class="chat-name">${escHtml(msg.name)}：</span>${escHtml(msg.text)}`;
  }
  chatLog.appendChild(el);
  chatLog.scrollTop = chatLog.scrollHeight;
}

function escHtml(s) {
  if (s == null) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ======= ソケットイベント =======
socket.on('joined', ({ socketId }) => {
  mySocketId = socketId;
  joinScreen.classList.add('hidden');
  gameScreen.classList.remove('hidden');
  initCanvas();
});

socket.on('waiting', () => {
  statusText.textContent = '友達が来るのを待っています... (2人以上でスタート)';
  timerEl.classList.add('hidden');
  wordDisplay.classList.add('hidden');
  charHint.classList.add('hidden');
  drawingTools.classList.add('hidden');
  guessArea.classList.add('hidden');
  roundOverlay.classList.add('hidden');
  drawerId = null;
});

socket.on('roundStart', (data) => {
  drawerId = data.drawerId;
  roundOverlay.classList.add('hidden');
  timerEl.classList.add('hidden'); // ボタンを押すまで非表示
  timerEl.textContent = ROUND_TIME;
  timerEl.classList.remove('urgent');
  clearLocalCanvas();

  if (isMyTurn()) {
    statusText.textContent = `✏️ あなたの番！漢字を書いてね`;
    wordDisplay.classList.add('hidden');
    charHint.classList.add('hidden');
    drawingTools.classList.remove('hidden');
    guessArea.classList.add('hidden');
  } else {
    statusText.textContent = `${data.drawerName} が書いています...`;
    wordDisplay.classList.add('hidden');
    charHint.classList.remove('hidden');
    charHint.textContent = `文字数：${'○'.repeat(data.charCount)}`;
    drawingTools.classList.add('hidden');
    guessArea.classList.remove('hidden');
    guessInput.focus();
  }
});

revealBtn.addEventListener('click', () => {
  wordRevealOverlay.classList.add('hidden');
  socket.emit('startDrawing'); // ここからタイマースタート
});

socket.on('yourWord', ({ kanji, kunyomi, onyomi }) => {
  wordDisplay.classList.remove('hidden');
  wordText.textContent = kanji;

  const readingStr = [kunyomi, onyomi].filter(Boolean).join('・');
  statusText.textContent = `✏️ お題：${kanji}（${readingStr}）← 書いてね`;

  // ポップアップに漢字・訓読み・音読みを表示
  revealWord.textContent = kanji;
  revealKunyomi.innerHTML = kunyomi
    ? `<span class="label">訓読み</span>${kunyomi}` : '';
  revealOnyomi.innerHTML  = onyomi
    ? `<span class="label">音読み</span>${onyomi}`  : '';
  wordRevealOverlay.classList.remove('hidden');
});

socket.on('draw', (data) => {
  applyDrawEvent(data);
});

socket.on('clearCanvas', () => {
  clearLocalCanvas();
});

socket.on('timerStarted', ({ timeLeft }) => {
  timerEl.classList.remove('hidden');
  timerEl.textContent = timeLeft;
  timerEl.classList.remove('urgent');
});

socket.on('tick', ({ timeLeft }) => {
  timerEl.textContent = timeLeft;
  if (timeLeft <= 10) {
    timerEl.classList.add('urgent');
  }
});

socket.on('chat', (msg) => {
  addChat(msg);
});

socket.on('correctGuess', ({ name, points }) => {
  addChat({ system: true, text: `🎉 ${name} が正解！ +${points}pt` });
});

socket.on('roundEnd', (data) => {
  timerEl.classList.add('hidden');
  wordDisplay.classList.add('hidden');
  drawingTools.classList.add('hidden');
  guessArea.classList.add('hidden');

  const scoreHtml = data.players
    .sort((a, b) => b.score - a.score)
    .map(p => `<div class="score-row"><span>${escHtml(p.name)}</span><span>${p.score}pt</span></div>`)
    .join('');

  overlayContent.innerHTML = data.winnerId
    ? `<div class="overlay-emoji">🎉</div>
       <div class="overlay-title">正解！</div>
       <div class="overlay-word">${escHtml(data.word)}</div>
       <div class="overlay-reading">よみかた：${escHtml(data.reading)}</div>
       <div class="overlay-winner">${escHtml(data.winnerName)} の勝ち！</div>
       <div class="score-list">${scoreHtml}</div>`
    : `<div class="overlay-emoji">⏰</div>
       <div class="overlay-title">時間切れ！</div>
       <div class="overlay-word">${escHtml(data.word)}</div>
       <div class="overlay-reading">よみかた：${escHtml(data.reading)}</div>
       <div class="score-list">${scoreHtml}</div>`;

  roundOverlay.classList.remove('hidden');

  // カウントダウン表示
  let sec = 5;
  overlayCountdown.textContent = `次のラウンドまで ${sec} 秒...`;
  const cd = setInterval(() => {
    sec--;
    if (sec <= 0) {
      clearInterval(cd);
      overlayCountdown.textContent = '';
    } else {
      overlayCountdown.textContent = `次のラウンドまで ${sec} 秒...`;
    }
  }, 1000);
});

socket.on('playerList', (players) => {
  // サイドバーのリスト
  playerList.innerHTML = '';
  players.forEach(p => {
    const el = document.createElement('div');
    el.className = 'player-item' + (p.id === drawerId ? ' is-drawer' : '');
    el.innerHTML = `<span class="player-name">${escHtml(p.name)}</span><span class="player-score">${p.score}pt</span>`;
    playerList.appendChild(el);
  });
  // スマホ用スコアバー
  mobileScoreBar.innerHTML = players
    .map(p => `<div class="mobile-score-item">${p.id === drawerId ? '✏️ ' : ''}${escHtml(p.name)}<span class="mscore">${p.score}pt</span></div>`)
    .join('');
});
