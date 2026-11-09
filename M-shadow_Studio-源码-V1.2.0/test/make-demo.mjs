/** 生成一份演示素材，灌入应用数据目录，便于界面自检与截图 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const tts = require('../electron/lib/tts.js');
const { buildSegments } = require('../electron/lib/text.js');

const userData = process.argv[2];
const ttsDir = path.join(userData, 'tts');
const mediaDir = path.join(userData, 'media', 'demo1');
fs.mkdirSync(ttsDir, { recursive: true });
fs.mkdirSync(mediaDir, { recursive: true });

const SCRIPT = `Good morning, everyone. Today we are going to talk about how to improve your English listening skills.
The most important thing is to practice every day, even if it is only for ten minutes.
When you listen to a sentence, try to catch the key words first, and then fill in the details.
Shadowing means you speak at the same time as the audio, like a shadow following a person.
It is a simple method, but it can make your pronunciation and fluency much better over time.
Do not be afraid of making mistakes. Mistakes are the fastest way to learn.
Try to record yourself, listen to the recording, and compare it with the original audio.
If you keep doing this for three months, you will be surprised by your progress.`;

const segs = buildSegments(SCRIPT, { wpm: 150, gap: 0.35 });
const custom = [
  new Date().toISOString(),
];

const ZH = [
  '大家早上好。',
  '今天我们要聊的是如何提高英语听力水平。',
  '最重要的事情是每天练习，哪怕只有十分钟。',
  '听一个句子时，先抓住关键词，然后再补充细节。',
  '影子跟读就是和音频同时开口说，像影子跟着人一样。',
  '方法很简单，但长期坚持能让你的发音和流利度好很多。',
  '不要害怕犯错。',
  '犯错是最快的学习方式。',
  '试着把自己录下来，听一遍，再和原声对比。',
  '如果你坚持三个月，你会被自己的进步惊到。',
];
const translated = { texts: ZH };

const withTts = [];
for (let i = 0; i < segs.length; i++) {
  const s = segs[i];
  const r = await tts.ensure(s.text, { voice: 'en-US-AriaNeural', rate: 1 }, ttsDir);
  withTts.push({
    ...s,
    start: withTts.length ? withTts[withTts.length - 1].end + 0.35 : 0,
    end: (withTts.length ? withTts[withTts.length - 1].end + 0.35 : 0) + r.duration,
    timed: false,
    zh: translated.texts[i] || '',
    ttsKey: r.key,
    ttsFile: r.file,
    ttsDuration: r.duration,
    ttsRate: 1,
    bestScore: i === 0 ? 88 : i === 1 ? 76 : 0,
    lastScore: i === 0 ? 88 : i === 1 ? 76 : 0,
  });
}

const demoAudio = withTts[0].ttsFile;
const doc = {
  id: 'demo1',
  title: '如何提高英语听力（示范素材）',
  sourceType: 'audio',
  sourcePath: demoAudio,
  playbackPath: demoAudio,
  duration: withTts[withTts.length - 1].end,
  segments: withTts,
  hasTiming: true,
  createdAt: custom[0],
  translated: true,
};

const settings = {
  voice: 'en-US-AriaNeural',
  rate: 1,
  pitch: 'default',
  volume: 'default',
  translateProvider: 'auto',
  llm: { baseUrl: '', apiKey: '', model: '' },
  asrModel: 'Xenova/whisper-base.en',
  modelHost: 'https://hf-mirror.com',
  wpm: 150,
  gap: 0.35,
  autoTranslate: true,
  autoTts: true,
  ytdlpPath: '',
  proxy: '',
  shadowPlayMode: 'tts',
  theme: 'light',
};

fs.writeFileSync(path.join(userData, 'store.json'), JSON.stringify({
  settings,
  docs: [doc],
  lastDocId: doc.id,
  spellingStats: {},
}, null, 2));

console.log('demo store written to', path.join(userData, 'store.json'));
