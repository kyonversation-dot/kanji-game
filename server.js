const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const os = require('os');
const { getRandomWord, getAllWords } = require('./words');

// 読み方辞書（漢字 → readings の逆引き用）
const readingMap = {};
getAllWords().forEach(w => { readingMap[w.kanji] = w.readings; });

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

// ゲーム状態
const state = {
  players: {},      // socketId -> { name, score }
  order: [],        // 参加順のsocketId配列
  drawerIdx: 0,
  currentWord: null, // { kanji, readings }
  phase: 'waiting', // waiting | drawing | roundEnd
  timer: null,
  timeLeft: 0,
  customWords: [],  // 今週の漢字リスト（空のときはランダム）
};

// カスタムリストの文字列をパース
function parseCustomWords(text) {
  return text
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .map(line => {
      const parts = line.split(/[\s　]+/); // 半角・全角スペースで分割
      const kanji = parts[0];
      const manualReadings = parts.slice(1).filter(r => r.length > 0);
      const readings = manualReadings.length > 0
        ? manualReadings
        : (readingMap[kanji] || []);
      return { kanji, readings };
    })
    .filter(w => w.kanji.length > 0);
}

function getWordForRound() {
  const list = state.customWords.length > 0 ? state.customWords : null;
  if (list) return list[Math.floor(Math.random() * list.length)];
  return getRandomWord();
}

const ROUND_TIME = 60;      // 1ラウンドの秒数
const ROUND_END_WAIT = 5000; // ラウンド終了後の待機時間(ms)

function getDrawerId() {
  if (state.order.length === 0) return null;
  return state.order[state.drawerIdx % state.order.length];
}

function getPlayerList() {
  return state.order.map(id => ({
    id,
    name: state.players[id]?.name || '?',
    score: state.players[id]?.score || 0,
  }));
}

function startRound() {
  if (state.order.length < 2) {
    state.phase = 'waiting';
    io.emit('waiting');
    return;
  }

  state.phase = 'drawing';
  state.currentWord = getWordForRound();
  state.timeLeft = ROUND_TIME;
  const drawerId = getDrawerId();

  io.emit('clearCanvas');
  io.emit('roundStart', {
    drawerId,
    drawerName: state.players[drawerId]?.name,
    timeLeft: ROUND_TIME,
    charCount: state.currentWord.kanji.length,
  });

  // お絵かき担当にだけ読み方（ひらがな）を送る
  const displayWord = state.currentWord.readings[0] || state.currentWord.kanji;
  io.to(drawerId).emit('yourWord', { word: displayWord });

  state.timer = setInterval(() => {
    state.timeLeft--;
    io.emit('tick', { timeLeft: state.timeLeft });
    if (state.timeLeft <= 0) {
      endRound(null);
    }
  }, 1000);
}

function endRound(winnerId) {
  clearInterval(state.timer);
  state.phase = 'roundEnd';

  io.emit('roundEnd', {
    word: state.currentWord.kanji,
    reading: state.currentWord.readings[0] || state.currentWord.kanji,
    winnerId,
    winnerName: winnerId ? state.players[winnerId]?.name : null,
    players: getPlayerList(),
  });

  state.drawerIdx++;

  setTimeout(() => {
    if (state.order.length >= 2) {
      startRound();
    } else {
      state.phase = 'waiting';
      io.emit('waiting');
    }
  }, ROUND_END_WAIT);
}

function checkGuess(guess) {
  if (!state.currentWord || state.phase !== 'drawing') return false;
  const g = guess.trim();
  const matched = g === state.currentWord.kanji || state.currentWord.readings.includes(g);
  console.log(`[GUESS] 入力:"${g}" 正解:"${state.currentWord.kanji}" 読み:${JSON.stringify(state.currentWord.readings)} 結果:${matched}`);
  return matched;
}

io.on('connection', (socket) => {
  socket.on('join', ({ name }) => {
    if (!name || name.trim() === '') return;

    state.players[socket.id] = { name: name.trim(), score: 0 };
    state.order.push(socket.id);

    io.emit('playerList', getPlayerList());
    socket.emit('joined', { socketId: socket.id });
    io.emit('chat', { system: true, text: `${name.trim()} が参加しました！` });

    if (state.order.length >= 2 && state.phase === 'waiting') {
      setTimeout(startRound, 2000);
    }
  });

  socket.on('draw', (data) => {
    if (socket.id === getDrawerId()) {
      socket.broadcast.emit('draw', data);
    }
  });

  socket.on('clearCanvas', () => {
    if (socket.id === getDrawerId()) {
      io.emit('clearCanvas');
    }
  });

  socket.on('guess', ({ text }) => {
    if (!text || !text.trim()) return;
    if (socket.id === getDrawerId()) return;

    const playerName = state.players[socket.id]?.name || '?';
    // 答えはチャットに出さない。「○○が答えました」だけ全員に見せる
    io.emit('chat', { system: true, text: `${playerName} が答えました` });

    if (checkGuess(text)) {
      const drawerId = getDrawerId();
      // スピードボーナス：残り時間が多いほど高得点（1〜6pt）
      const points = Math.max(1, Math.ceil(state.timeLeft / 10));
      state.players[socket.id].score += points;
      if (drawerId && state.players[drawerId]) {
        state.players[drawerId].score += 2;
      }
      io.emit('playerList', getPlayerList());
      io.emit('correctGuess', { name: playerName, points });
      endRound(socket.id);
    }
  });

  socket.on('setCustomWords', ({ text }) => {
    state.customWords = parseCustomWords(text || '');
    io.emit('customWordsUpdated', { count: state.customWords.length });
  });

  socket.on('clearCustomWords', () => {
    state.customWords = [];
    io.emit('customWordsUpdated', { count: 0 });
  });

  socket.on('disconnect', () => {
    const name = state.players[socket.id]?.name;
    const wasDrawer = socket.id === getDrawerId();

    delete state.players[socket.id];
    state.order = state.order.filter(id => id !== socket.id);

    if (state.order.length > 0) {
      io.emit('playerList', getPlayerList());
      if (name) {
        io.emit('chat', { system: true, text: `${name} が退出しました` });
      }
    }

    if (state.order.length < 2) {
      clearInterval(state.timer);
      state.phase = 'waiting';
      io.emit('waiting');
    } else if (wasDrawer && state.phase === 'drawing') {
      clearInterval(state.timer);
      endRound(null);
    }
  });
});

// ローカルIPアドレスを表示
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  const ip = getLocalIP();
  console.log('\n========================================');
  console.log('  ✏️  漢字ゲームサーバー 起動中！');
  console.log('========================================');
  console.log(`  このPC:     http://localhost:${PORT}`);
  console.log(`  他の端末:   http://${ip}:${PORT}`);
  console.log('');
  console.log('  同じWiFiにつないだスマホ・タブレットから');
  console.log(`  http://${ip}:${PORT} を開いてね！`);
  console.log('========================================\n');
});
