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
  lastWordKanji: null,    // 直前の漢字（連続防止）
  timerStarted: false,   // タイマーが始まったか
  correctGuessers: [],   // 正解済みのsocketIdリスト
  startTimeout: null,  // 自動スタート用タイムアウト
};

// カタカナ→ひらがな変換
function toHiragana(str) {
  return str.replace(/[ァ-ヶ]/g, c =>
    String.fromCharCode(c.charCodeAt(0) - 0x60)
  );
}

// ローマ字→ひらがな変換（日本語入力できない子向け・答え合わせ用）
const ROMAJI_TABLE = {
  kya:'きゃ',kyu:'きゅ',kyo:'きょ',gya:'ぎゃ',gyu:'ぎゅ',gyo:'ぎょ',
  sha:'しゃ',shu:'しゅ',sho:'しょ',sya:'しゃ',syu:'しゅ',syo:'しょ',
  cha:'ちゃ',chu:'ちゅ',cho:'ちょ',tya:'ちゃ',tyu:'ちゅ',tyo:'ちょ',
  ja:'じゃ',ju:'じゅ',jo:'じょ',jya:'じゃ',jyu:'じゅ',jyo:'じょ',zya:'じゃ',zyu:'じゅ',zyo:'じょ',
  nya:'にゃ',nyu:'にゅ',nyo:'にょ',hya:'ひゃ',hyu:'ひゅ',hyo:'ひょ',
  bya:'びゃ',byu:'びゅ',byo:'びょ',pya:'ぴゃ',pyu:'ぴゅ',pyo:'ぴょ',
  mya:'みゃ',myu:'みゅ',myo:'みょ',rya:'りゃ',ryu:'りゅ',ryo:'りょ',
  shi:'し',chi:'ち',tsu:'つ',
  ka:'か',ki:'き',ku:'く',ke:'け',ko:'こ',
  sa:'さ',si:'し',su:'す',se:'せ',so:'そ',
  ta:'た',ti:'ち',tu:'つ',te:'て',to:'と',
  na:'な',ni:'に',nu:'ぬ',ne:'ね',no:'の',
  ha:'は',hi:'ひ',fu:'ふ',hu:'ふ',he:'へ',ho:'ほ',
  ma:'ま',mi:'み',mu:'む',me:'め',mo:'も',
  ya:'や',yu:'ゆ',yo:'よ',
  ra:'ら',ri:'り',ru:'る',re:'れ',ro:'ろ',
  wa:'わ',wo:'を',
  ga:'が',gi:'ぎ',gu:'ぐ',ge:'げ',go:'ご',
  za:'ざ',zi:'じ',ji:'じ',zu:'ず',ze:'ぜ',zo:'ぞ',
  da:'だ',di:'ぢ',du:'づ',de:'で',do:'ど',
  ba:'ば',bi:'び',bu:'ぶ',be:'べ',bo:'ぼ',
  pa:'ぱ',pi:'ぴ',pu:'ぷ',pe:'ぺ',po:'ぽ',
  fa:'ふぁ',fi:'ふぃ',fe:'ふぇ',fo:'ふぉ',
  a:'あ',i:'い',u:'う',e:'え',o:'お',
};
function romajiToHiragana(input) {
  const str = input.toLowerCase().replace(/[\s　]/g, '');
  let result = '';
  let i = 0;
  while (i < str.length) {
    const c = str[i];
    // 促音（子音の連続 kk / tt など）→ っ
    if (c === str[i + 1] && !'aiueon'.includes(c) && /[a-z]/.test(c)) {
      result += 'っ';
      i++;
      continue;
    }
    // 撥音 n（母音・y が続かない場合）→ ん
    if (c === 'n' && (str[i + 1] === undefined || !'aiueoy'.includes(str[i + 1]))) {
      // IME癖の「nn」はまとめて1つの「ん」（直後に母音/yが続くときは onna=おんな のように別音節）
      if (str[i + 1] === 'n' && (str[i + 2] === undefined || !'aiueoy'.includes(str[i + 2]))) {
        i += 2;
      } else {
        i++;
      }
      result += 'ん';
      continue;
    }
    // 3文字→2文字→1文字の順で最長一致
    let matched = false;
    for (let len = 3; len >= 1; len--) {
      const chunk = str.substr(i, len);
      if (ROMAJI_TABLE[chunk]) {
        result += ROMAJI_TABLE[chunk];
        i += len;
        matched = true;
        break;
      }
    }
    if (!matched) { result += c; i++; } // 変換できない文字はそのまま
  }
  return result;
}

// カスタムリストの文字列をパース（漢字 訓読み 音読み）
function parseCustomWords(text) {
  return text
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .map(line => {
      const parts = line.split(/[\s　]+/);
      const kanji    = parts[0] || '';
      const kunyomi  = parts[1] || '';
      const onyomi   = parts[2] || '';
      // 正解判定用：全読みをひらがなで保持
      const readings = [];
      if (kunyomi) readings.push(toHiragana(kunyomi));
      if (onyomi)  readings.push(toHiragana(onyomi));
      if (readings.length === 0 && readingMap[kanji]) {
        readings.push(...readingMap[kanji].map(toHiragana));
      }
      return { kanji, kunyomi, onyomi, readings };
    })
    .filter(w => w.kanji.length > 0);
}

function getWordForRound() {
  const list = state.customWords.length > 0 ? state.customWords : getAllWords();
  if (list.length === 1) return list[0];
  let word, attempts = 0;
  do {
    word = list[Math.floor(Math.random() * list.length)];
    attempts++;
  } while (word.kanji === state.lastWordKanji && attempts < 10);
  state.lastWordKanji = word.kanji;
  return word;
}

function beginTimer() {
  if (state.phase !== 'drawing' || state.timerStarted) return;
  state.timerStarted = true;
  clearTimeout(state.startTimeout);
  state.timeLeft = ROUND_TIME;
  io.emit('timerStarted', { timeLeft: ROUND_TIME });
  state.timer = setInterval(() => {
    state.timeLeft--;
    io.emit('tick', { timeLeft: state.timeLeft });
    if (state.timeLeft <= 0) endRound(null);
  }, 1000);
}

const ROUND_TIME = 50;      // 1ラウンドの秒数
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
  state.timerStarted = false;
  state.correctGuessers = [];
  state.currentWord = getWordForRound();
  const drawerId = getDrawerId();

  io.emit('clearCanvas');
  io.emit('roundStart', {
    drawerId,
    drawerName: state.players[drawerId]?.name,
    timeLeft: ROUND_TIME,
    charCount: state.currentWord.kanji.length,
  });

  // お絵かき担当にだけ漢字・訓読み・音読みを送る
  io.to(drawerId).emit('yourWord', {
    kanji:   state.currentWord.kanji,
    kunyomi: state.currentWord.kunyomi || (state.currentWord.readings[0] || ''),
    onyomi:  state.currentWord.onyomi  || '',
  });

  // 10秒後に描く人がボタンを押さなくても自動でタイマー開始
  state.startTimeout = setTimeout(beginTimer, 10000);
}

function endRound(reason) {
  if (state.phase !== 'drawing') return; // 二重呼び出し防止
  clearInterval(state.timer);
  clearTimeout(state.startTimeout);
  state.phase = 'roundEnd';

  io.emit('roundEnd', {
    word: state.currentWord.kanji,
    reading: state.currentWord.readings[0] || state.currentWord.kanji,
    reason, // 'all'=全員正解 / null=時間切れ
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

// 長音の省略を吸収（kyo=きょう・se=せい など。お段+う／え段+い を短い形に畳んで比較）
function relaxLongVowels(s) {
  return s
    .replace(/([おこそとのほもよろをごぞどぼぽょ])う/g, '$1')
    .replace(/([えけせてねへめれげぜでべぺぇ])い/g, '$1');
}

function checkGuess(guess) {
  if (!state.currentWord || state.phase !== 'drawing') return false;
  const raw = toHiragana(guess.trim());
  const romaji = romajiToHiragana(guess.trim()); // ローマ字入力にも対応
  const kanji = state.currentWord.kanji;
  const readings = (state.currentWord.readings || []).map(toHiragana);
  const candidates = [raw, romaji];
  const readingsRelaxed = readings.map(relaxLongVowels);
  const matched = candidates.some(g => g === kanji || readings.includes(g))
    || candidates.some(g => readingsRelaxed.includes(relaxLongVowels(g)));
  console.log(`[GUESS] 入力:"${raw}" ローマ字変換:"${romaji}" 正解:"${kanji}" 読み:${JSON.stringify(readings)} 結果:${matched}`);
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
    const drawerId = getDrawerId();
    if (socket.id === drawerId) return;
    if (state.correctGuessers.includes(socket.id)) return; // 既に正解済み

    const playerName = state.players[socket.id]?.name || '?';
    io.emit('chat', { system: true, text: `${playerName} が答えました` });

    if (checkGuess(text)) {
      // 順位ボーナス：1位=6pt、2位=5pt、3位=4pt…（最低1pt）
      const rank = state.correctGuessers.length; // 0=1位, 1=2位…
      const points = Math.max(1, 6 - rank);
      state.players[socket.id].score += points;
      state.correctGuessers.push(socket.id);

      // 描いた人は正解者1人につき+1pt
      if (drawerId && state.players[drawerId]) {
        state.players[drawerId].score += 1;
      }

      io.emit('playerList', getPlayerList());
      io.emit('correctGuess', { name: playerName, points });
      socket.emit('yourGuessCorrect', { points }); // 正解者本人に通知

      // 全員（描く人以外）が正解したら終了
      const nonDrawers = state.order.filter(id => id !== drawerId);
      if (nonDrawers.length > 0 && nonDrawers.every(id => state.correctGuessers.includes(id))) {
        endRound('all');
      }
    }
  });

  socket.on('startDrawing', () => {
    if (socket.id === getDrawerId()) beginTimer();
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
