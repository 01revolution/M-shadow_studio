import path from 'node:path'; import fs from 'node:fs'; import os from 'node:os';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const tts = require('../electron/lib/tts.js');
const { importFile } = require('../electron/lib/import.js');
const { translateTexts } = require('../electron/lib/translate.js');

const dirs = { media: path.join(os.tmpdir(),'e2e','media'), tts: path.join(os.tmpdir(),'e2e','tts'), models: path.join(os.tmpdir(),'e2e','models') };
for (const d of Object.values(dirs)) fs.mkdirSync(d, { recursive: true });
const settings = { wpm:150, gap:0.35, asrModel:'Xenova/whisper-base.en', modelHost:'https://hf-mirror.com', voice:'en-US-AriaNeural', rate:1 };

const speech = "The quick brown fox jumps over the lazy dog. I went to the park yesterday with my friends. We played football until it got dark.";
const a = await tts.ensure(speech, { voice: 'en-US-AriaNeural', rate: 1 }, dirs.tts);
console.log('1) 生成测试音频', a.bytes, 'bytes');

const doc = await importFile(a.file, { settings, dirs, onProgress: p => console.log('   progress:', p.percent + '%', p.message) });
console.log('2) 导入识别完成，句子数:', doc.segments.length, '时长:', doc.duration);
doc.segments.forEach(s => console.log(`   [${s.start}-${s.end}] ${s.text}`));

const tr = await translateTexts(doc.segments.map(s=>s.text), { translateProvider:'mymemory' });
doc.segments.forEach((s,i)=> s.zh = tr.texts[i] || '');
console.log('3) 翻译:', tr.provider, '失败:', tr.failed);
doc.segments.forEach(s => console.log(`   EN: ${s.text}\n   ZH: ${s.zh}`));

const t = await tts.ensure(doc.segments[0].text, { voice: 'en-US-AriaNeural', rate: 0.8 }, dirs.tts);
console.log('4) 慢速配音 ok, 时长', t.duration, 's');
fs.writeFileSync('/tmp/e2e-doc.json', JSON.stringify(doc, null, 2));
