const words = [
  // 動物
  { kanji: '犬', readings: ['いぬ'] },
  { kanji: '猫', readings: ['ねこ'] },
  { kanji: '魚', readings: ['さかな', 'うお'] },
  { kanji: '鳥', readings: ['とり'] },
  { kanji: '虫', readings: ['むし'] },
  { kanji: '牛', readings: ['うし'] },
  { kanji: '馬', readings: ['うま'] },
  { kanji: '豚', readings: ['ぶた'] },
  { kanji: '羊', readings: ['ひつじ'] },
  { kanji: '象', readings: ['ぞう'] },
  { kanji: '熊', readings: ['くま'] },
  { kanji: '猿', readings: ['さる'] },
  { kanji: '兎', readings: ['うさぎ'] },
  { kanji: '蛙', readings: ['かえる'] },
  { kanji: '蛇', readings: ['へび'] },

  // 自然
  { kanji: '山', readings: ['やま'] },
  { kanji: '川', readings: ['かわ'] },
  { kanji: '海', readings: ['うみ'] },
  { kanji: '空', readings: ['そら'] },
  { kanji: '火', readings: ['ひ'] },
  { kanji: '水', readings: ['みず'] },
  { kanji: '木', readings: ['き'] },
  { kanji: '花', readings: ['はな'] },
  { kanji: '草', readings: ['くさ'] },
  { kanji: '森', readings: ['もり'] },
  { kanji: '林', readings: ['はやし'] },
  { kanji: '石', readings: ['いし'] },
  { kanji: '雨', readings: ['あめ'] },
  { kanji: '雪', readings: ['ゆき'] },
  { kanji: '風', readings: ['かぜ'] },
  { kanji: '雲', readings: ['くも'] },
  { kanji: '星', readings: ['ほし'] },
  { kanji: '月', readings: ['つき'] },
  { kanji: '日', readings: ['ひ', 'たいよう'] },

  // 食べ物
  { kanji: '米', readings: ['こめ'] },
  { kanji: '麦', readings: ['むぎ'] },
  { kanji: '肉', readings: ['にく'] },
  { kanji: '卵', readings: ['たまご'] },
  { kanji: '茶', readings: ['ちゃ', 'おちゃ'] },
  { kanji: '梅', readings: ['うめ'] },
  { kanji: '桃', readings: ['もも'] },
  { kanji: '栗', readings: ['くり'] },

  // 身の回り
  { kanji: '手', readings: ['て'] },
  { kanji: '足', readings: ['あし'] },
  { kanji: '目', readings: ['め'] },
  { kanji: '耳', readings: ['みみ'] },
  { kanji: '口', readings: ['くち'] },
  { kanji: '心', readings: ['こころ'] },
  { kanji: '顔', readings: ['かお'] },
  { kanji: '頭', readings: ['あたま'] },
  { kanji: '体', readings: ['からだ'] },

  // 乗り物・道具
  { kanji: '車', readings: ['くるま'] },
  { kanji: '船', readings: ['ふね'] },
  { kanji: '傘', readings: ['かさ'] },
  { kanji: '刀', readings: ['かたな'] },
  { kanji: '弓', readings: ['ゆみ'] },
  { kanji: '鍵', readings: ['かぎ'] },

  // 季節・時
  { kanji: '春', readings: ['はる'] },
  { kanji: '夏', readings: ['なつ'] },
  { kanji: '秋', readings: ['あき'] },
  { kanji: '冬', readings: ['ふゆ'] },
  { kanji: '朝', readings: ['あさ'] },
  { kanji: '昼', readings: ['ひる'] },
  { kanji: '夜', readings: ['よる'] },

  // 二文字熟語（少し難しめ）
  { kanji: '電車', readings: ['でんしゃ'] },
  { kanji: '花火', readings: ['はなび'] },
  { kanji: '学校', readings: ['がっこう'] },
  { kanji: '先生', readings: ['せんせい'] },
  { kanji: '動物', readings: ['どうぶつ'] },
  { kanji: '音楽', readings: ['おんがく'] },
  { kanji: '海水', readings: ['かいすい'] },
  { kanji: '山川', readings: ['やまかわ'] },
  { kanji: '雪山', readings: ['ゆきやま'] },
  { kanji: '花見', readings: ['はなみ'] },
  { kanji: '虹色', readings: ['にじいろ'] },
];

function getRandomWord() {
  return words[Math.floor(Math.random() * words.length)];
}

function getAllWords() {
  return words;
}

module.exports = { getRandomWord, getAllWords };
