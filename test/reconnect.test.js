// 走らせ方: kanji-game フォルダで  node test/reconnect.test.js   （サーバーは自動で起動・停止する）
//
// 漢字ゲーム「瞬断（スマホの画面消灯・アプリ切替・回線揺れ）」の結合テスト。
// 実サーバー(server.js)を子プロセスで起動し、socket.io-client で本物の切断／復帰を起こす。
//
// ★このテストは「合格させる」ためでなく「今どこまで直っているか」を残すためのもの。
//   2026-08-10 時点（commit 96ce032＝8/4の瞬断対応が入った状態）の実測は 16合格 / 2不合格。
//   不合格2つは未修正のバグそのもの＝直したらここが✅に変わる（＝回帰テストとして使う）：
//     ・瞬断中の人がいても全員正解で終われる      … 落ちた子を待って時間切れまで止まる
//     ・再読み込み後、名前を打ち直さずに自動復帰できる … iOS Safariのタブ破棄＝子には「はじかれた」と同じ
//   ＋準備の行に出る「ラウンド起動回数」は 1 が正しい。2 なら同時参加でラウンドが二重に始まっている
//     （描き始めた線とお題が作り直される＝「線が見えない」の一因）。
//   診断の詳細は vault の projects/project_kanji_game.md を見ること。

const { spawn } = require('child_process');
const path = require('path');

const GAME_DIR = path.join(__dirname, '..');           // PCごとにクローン先が違うので絶対パスは書かない
const { io } = require(path.join(GAME_DIR, 'node_modules', 'socket.io-client'));

const PORT = 3177;
const URL = `http://127.0.0.1:${PORT}`;                // ★localhost だと ::1 に行って繋がらない環境がある

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; failures.push(name); console.log(`  ❌ ${name}${extra ? ' … ' + extra : ''}`); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---- テスト用クライアント（ブラウザ側 game.js の受信をそのまま真似る） ----
function makeClient(label, token) {
  const sock = io(URL, { reconnection: false, transports: ['websocket'] });
  const c = {
    label, token, sock,
    id: null,
    drawerId: null,
    strokesSeen: [],        // 'draw' で届いた線
    canvasState: null,      // 'canvasState' で巻き戻された線
    chats: [],
    players: [],
    yourWord: null,
    roundStarts: 0,
    roundEnds: [],
    waiting: 0,
    timerStarted: null,
  };
  sock.on('joined', ({ socketId }) => { c.id = socketId; });
  sock.on('roundStart', d => { c.roundStarts++; c.drawerId = d.drawerId; c.lastRoundStart = d; });
  sock.on('draw', d => c.strokesSeen.push(d));
  sock.on('canvasState', ({ strokes }) => { c.canvasState = strokes; });
  sock.on('chat', m => c.chats.push(m.text));
  sock.on('playerList', p => { c.players = p; });
  sock.on('yourWord', w => { c.yourWord = w; });
  sock.on('roundEnd', d => c.roundEnds.push(d));
  sock.on('waiting', () => c.waiting++);
  sock.on('timerStarted', d => { c.timerStarted = d; });
  return c;
}

function join(c, name) {
  c.name = name;
  c.sock.emit('join', { name, token: c.token });
}

async function connected(c) {
  if (c.sock.connected) return;
  await new Promise((res, rej) => {
    c.sock.once('connect', res);
    c.sock.once('connect_error', rej);
  });
}

// 瞬断＝ソケットを切って、同じトークンで新しいソケットとして座り直す。
// 実機と同じ：socket.io が再接続すると socket.id は新しくなり、身分証はトークンだけになる。
async function blip(c, downMs) {
  c.sock.disconnect();
  await sleep(downMs);
  const fresh = makeClient(c.label, c.token);
  await connected(fresh);
  join(fresh, c.name);
  await sleep(400);
  return fresh;
}

function startServer(env = {}) {
  const p = spawn('node', ['server.js'], {
    cwd: GAME_DIR,
    env: { ...process.env, PORT: String(PORT), ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  p.stdout.on('data', () => {});                       // サーバーの起動バナーは捨てる
  p.stderr.on('data', d => console.log('[server-err]', d.toString().trim()));
  return p;
}

// 起動待ちは固定の sleep にしない（PCの機嫌で足りず ECONNREFUSED で落ちる＝テストが信用できなくなる）
async function waitForServer(timeoutMs = 15000) {
  const http = require('http');
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ok = await new Promise(res => {
      const req = http.get(URL + '/', r => { r.resume(); res(true); });
      req.on('error', () => res(false));
      req.setTimeout(1000, () => { req.destroy(); res(false); });
    });
    if (ok) return;
    await sleep(200);
  }
  throw new Error(`サーバーが ${timeoutMs}ms 以内に起動しませんでした（${URL}）`);
}

async function main() {
  const server = startServer();
  await waitForServer();

  const A = makeClient('A', 'tok-A');
  const B = makeClient('B', 'tok-B');
  const C = makeClient('C', 'tok-C');
  await Promise.all([connected(A), connected(B), connected(C)]);

  console.log('\n=== 準備：3人が参加してラウンド開始 ===');
  join(A, 'あきら');  await sleep(150);
  join(B, 'ぼたん');  await sleep(150);
  join(C, 'ちひろ');
  await sleep(2600); // startRound の 2秒待ちを越える

  const drawer = [A, B, C].find(c => c.id === A.drawerId);
  const guessers = [A, B, C].filter(c => c !== drawer);
  check('ラウンドが始まった', A.roundStarts >= 1, `roundStarts=${A.roundStarts}`);
  check('描く人にお題が届いた', !!drawer && !!drawer.yourWord);
  check('参加者が3人', A.players.length === 3, `len=${A.players.length}`);
  console.log(`  （描く人＝${drawer && drawer.name}／同時参加でのラウンド起動回数=${A.roundStarts} ← 1が正しい）`);

  console.log('\n=== 1. 描く人が線を引く → 他の人に届く ===');
  drawer.sock.emit('draw', { type: 'begin', nx: 0.1, ny: 0.1, color: '#111', size: 8 });
  drawer.sock.emit('draw', { type: 'move',  nx: 0.5, ny: 0.5, color: '#111', size: 8 });
  drawer.sock.emit('draw', { type: 'move',  nx: 0.9, ny: 0.2, color: '#111', size: 8 });
  await sleep(300);
  check('答える人に線が3本届いた', guessers[0].strokesSeen.length === 3, `n=${guessers[0].strokesSeen.length}`);

  console.log('\n=== 2. 答える人が瞬断 → 同じトークンで復帰 ===');
  const g0name = guessers[0].name;
  const scoreBefore = A.players.find(p => p.name === g0name)?.score ?? 0;
  const chatsBefore = A.chats.length;
  const G0 = await blip(guessers[0], 500);
  check('席が残っている（人数3のまま）', A.players.length === 3, `len=${A.players.length}`);
  check('名前が保たれている', A.players.some(p => p.name === g0name));
  check('「退出しました」が出ていない', !A.chats.slice(chatsBefore).some(t => t.includes('退出')), JSON.stringify(A.chats.slice(chatsBefore)));
  check('「参加しました」も出ていない（復帰は静かに）', !A.chats.slice(chatsBefore).some(t => t.includes('参加')), JSON.stringify(A.chats.slice(chatsBefore)));
  check('復帰した人に線が巻き戻された（3本）', (G0.canvasState || []).length === 3, `n=${(G0.canvasState || []).length}`);
  check('復帰した人が今のラウンドを見ている', G0.roundStarts === 1 && G0.drawerId === drawer.id, `drawerId一致=${G0.drawerId === drawer.id}`);

  console.log('\n=== 3. 復帰後も線の続きが届く ===');
  drawer.sock.emit('draw', { type: 'move', nx: 0.3, ny: 0.8, color: '#111', size: 8 });
  await sleep(300);
  check('復帰した人に続きの線が届く', G0.strokesSeen.length === 1, `n=${G0.strokesSeen.length}`);

  console.log('\n=== 4. 描く人が瞬断 → 描く権が維持されるか ===');
  const drawerName = drawer.name;
  const D2 = await blip(drawer, 500);
  check('描く人が描く人のまま', D2.drawerId === D2.id, `drawerId=${D2.drawerId} myId=${D2.id}`);
  check('復帰した描く人にお題が再表示された', !!D2.yourWord);
  check('描く人の名前が保たれている', D2.players.some(p => p.name === drawerName));
  D2.sock.emit('draw', { type: 'begin', nx: 0.7, ny: 0.7, color: '#111', size: 8 });
  await sleep(300);
  check('復帰した描く人の線が他の人に届く', guessers[1].strokesSeen.length >= 4, `n=${guessers[1].strokesSeen.length}`);

  console.log('\n=== 5. 正解の判定と得点が復帰後も効く ===');
  // ★観測は「今つながっているクライアント」から見る。
  //   元の drawer(A) は手順4で切断済み＝playerList が届かないので観測に使えない（一度ここで嘘の不合格を出した）。
  const word = D2.yourWord;
  G0.sock.emit('guess', { text: word.kanji });
  await sleep(300);
  const g0score = D2.players.find(p => p.name === g0name)?.score ?? 0;
  check('復帰した人が正解して加点された', g0score > scoreBefore, `score=${g0score}`);

  console.log('\n=== 6. 全員正解の早期終了に「瞬断中の人」が絡む場合 ===');
  // 残りの答える人を落としたまま、つながっている答える人は全員正解済み → 全員正解で終われるか？
  const other = guessers[1];
  other.sock.disconnect();
  await sleep(400);
  const endsBefore = D2.roundEnds.length;
  await sleep(1500);
  check('瞬断中の人がいても全員正解で終われる', D2.roundEnds.length > endsBefore,
    `roundEnds=${D2.roundEnds.length}（瞬断中の人を待って時間切れまで止まるなら不合格）`);

  console.log('\n=== 7. ページ再読み込み（iOS Safariのタブ破棄）を再現 ===');
  // ブラウザが再読み込みされると game.js の myName は消える。localStorage のトークンだけが残る。
  // game.js の socket.on('connect') は myName が無いと join を投げない＝何も起きない。
  const reloaded = makeClient('B-reload', 'tok-B');
  await connected(reloaded);
  await sleep(800);
  check('再読み込み後、名前を打ち直さずに自動復帰できる',
    reloaded.id !== null,
    '（joinedが来ない＝参加画面に戻される＝子には「はじかれた」と同じ見え方）');

  await sleep(300);
  server.kill();
  await sleep(300);

  console.log(`\n========== 結果: ${pass} 合格 / ${fail} 不合格 ==========`);
  if (failures.length) { console.log('不合格:'); failures.forEach(f => console.log('  - ' + f)); }
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
