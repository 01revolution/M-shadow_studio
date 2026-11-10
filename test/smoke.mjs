/**
 * 核心逻辑冒烟测试（纯 Node，不需要 Electron 界面）
 * 运行：node test/smoke.mjs
 */
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const text = require('../electron/lib/text.js');
const { scoreReading, align, normalizeTokens } = require('../electron/lib/score.js');
const { buildSrt, buildLrc, gapForText } = require('../electron/lib/export.js');
const { createStore } = require('../electron/lib/store.js');
const ff = require('../electron/lib/ffmpeg.js');
const tts = require('../electron/lib/tts.js');
const { translateTexts } = require('../electron/lib/translate.js');
const { parseSubtitle } = require('../electron/lib/import.js');

const results = [];
function ok(name, fn) {
  try {
    fn();
    results.push(`  PASS  ${name}`);
  } catch (e) {
    results.push(`  FAIL  ${name}  -> ${e.message}`);
    process.exitCode = 1;
  }
}
async function okAsync(name, fn, { soft = false } = {}) {
  try {
    await fn();
    results.push(`  PASS  ${name}`);
  } catch (e) {
    if (soft) {
      results.push(`  SKIP  ${name}  -> 网络/额度不可用：${e.message}`);
    } else {
      results.push(`  FAIL  ${name}  -> ${e.message}`);
      process.exitCode = 1;
    }
  }
}

// ---------- 断句 ----------
const sample = `Mr. Smith went to Washington D.C. in 2019. He paid $3.50 for a coffee.
The quick brown fox jumps over the lazy dog! Do you know why? I don't.
This sentence is intentionally made extremely long so that it exceeds the thirty two word limit and forces the splitter to break it somewhere sensible like at a comma, or at a conjunction because nobody wants to read a single line that never ends.`;

const sentences = text.splitSentences(sample);
ok('断句：缩写不被拆开（Mr. / D.C.）', () => {
  const joined = sentences.join(' | ');
  assert.ok(!joined.includes('Mr. |'), 'Mr. 被拆开了: ' + joined);
  assert.ok(sentences.some((s) => s.includes('Washington D.C. in 2019.')), joined);
});
ok('断句：问号感叹号正常断开', () => {
  assert.ok(sentences.some((s) => s.includes('Do you know why?')), sentences.join('|'));
  assert.ok(sentences.some((s) => /I don't\.?$/.test(s)), sentences.join('|'));
});
ok('断句：超长句被拆分', () => {
  const long = sentences.find((s) => s.startsWith('This sentence is intentionally'));
  assert.ok(text.wordCount(long) <= 34, 'too long: ' + text.wordCount(long));
});
ok('断句：结果数量合理', () => {
  assert.ok(sentences.length >= 6 && sentences.length <= 9, 'got ' + sentences.length);
});

// ---------- 时间轴 ----------
const segs = text.buildSegments('Hello world. This is a test sentence for timing.');
ok('时间轴估算：单调递增', () => {
  assert.ok(segs[1].start >= segs[0].end);
  assert.ok(segs[0].end > segs[0].start);
});

const chunks = [
  { start: 0, end: 3.2, text: 'Hello world.' },
  { start: 3.6, end: 7.1, text: 'This is a test sentence for timing.' },
];
const aligned = text.buildSegments('Hello world. This is a test sentence for timing.', { chunks, duration: 7.1 });
ok('ASR 对齐：使用真实时间戳', () => {
  assert.ok(Math.abs(aligned[0].start - 0) < 0.1, String(aligned[0].start));
  assert.ok(Math.abs(aligned[1].start - 3.6) < 0.6, String(aligned[1].start));
  assert.ok(aligned[1].end <= 7.2);
});

// ---------- 字幕解析 ----------
ok('SRT 解析', () => {
  const srt = `1\n00:00:01,000 --> 00:00:03,500\nHello there.\n\n2\n00:00:04,000 --> 00:00:06,000\nHow are you?\n`;
  const cues = parseSubtitle(srt);
  assert.equal(cues.length, 2);
  assert.equal(cues[0].start, 1);
  assert.equal(cues[1].text, 'How are you?');
});

// ---------- 评分 ----------
ok('评分：完全正确的朗读应高分', () => {
  const target = 'The quick brown fox jumps over the lazy dog.';
  const r = scoreReading({
    target,
    hypothesis: 'The quick brown fox jumps over the lazy dog.',
    duration: 3.4,
    referenceDuration: 3.3,
    audio: { meanVolume: -18, maxVolume: -6, silenceCount: 0, silenceTotal: 0 },
  });
  assert.ok(r.score >= 90, 'score=' + r.score);
  assert.equal(r.breakdown.accuracy, 100);
  assert.ok(r.suggestions.length > 0);
});

ok('评分：漏词会被扣分并给出建议', () => {
  const target = 'I want to go to the park with my friends tomorrow.';
  const r = scoreReading({
    target,
    hypothesis: 'I want to go park with friends.',
    duration: 2.0,
    referenceDuration: 3.5,
    audio: { meanVolume: -40, maxVolume: -12, silenceCount: 3, silenceTotal: 2.4 },
  });
  assert.ok(r.score < 85, 'score=' + r.score);
  assert.ok(r.issues.missing.length > 0);
  assert.ok(r.suggestions.some((s) => s.includes('没读出来')));
});

ok('评分：识别为空时准确度为 0', () => {
  const r = scoreReading({ target: 'Hello world.', hypothesis: '', duration: 2, audio: {} });
  assert.equal(r.stats.matches, 0);
  assert.ok(r.score < 50);
});

ok('对齐算法：替换/插入/删除都能识别', () => {
  const ops = align(normalizeTokens('a b c d'), normalizeTokens('a x c y d'));
  assert.deepEqual(ops.map((o) => o.type), ['match', 'sub', 'match', 'ins', 'match']);
});

// ---------- 导出文本 ----------
ok('SRT / LRC 生成', () => {
  const segs2 = [
    { start: 0, end: 2, text: 'Hello.' },
    { start: 2.5, end: 4, text: 'World.' },
  ];
  const srt = buildSrt(segs2);
  assert.ok(srt.includes('00:00:00,000 --> 00:00:02,000'));
  const lrc = buildLrc(segs2, 'Demo');
  assert.ok(lrc.includes('[ti:Demo]'));
  assert.ok(lrc.includes('[00:02.50]World.'));
});

// ---------- 媒体 / TTS / 翻译（需要网络，失败不致命） ----------
const tmp = path.join(os.tmpdir(), 'ss-smoke-' + Date.now());
fs.mkdirSync(tmp, { recursive: true });

await okAsync('ffmpeg 可用且能生成音频', async () => {
  const wav = path.join(tmp, 'silence.wav');
  await ff.makeSilence(wav, 1);
  const info = await ff.probe(wav);
  assert.ok(info.duration > 0.8 && info.duration < 1.3, String(info.duration));
});

await okAsync('Edge TTS 能合成并通过 ffmpeg 分析', async () => {
  const r = await tts.ensure('This is a pronunciation test sentence.', { voice: 'en-GB-SoniaNeural', rate: 1 }, tmp);
  assert.ok(r.bytes > 5000, 'bytes=' + r.bytes);
  assert.ok(r.duration > 1.5, 'dur=' + r.duration);
  const stats = await ff.analyze(r.file);
  assert.ok(stats.meanVolume != null);
}, { soft: true });

await okAsync('mp3 拼接导出', async () => {
  const a = await tts.ensure('First sentence.', { voice: 'en-GB-SoniaNeural', rate: 1 }, tmp);
  const b = await tts.ensure('Second sentence.', { voice: 'en-GB-SoniaNeural', rate: 1 }, tmp);
  const out = path.join(tmp, 'out.mp3');
  const r = await ff.concatToMp3([a.file, b.file], out, { gap: 0.3 });
  assert.ok(fs.statSync(out).size > 5000);
  const info = await ff.probe(out);
  assert.ok(info.duration > 1.5, String(info.duration));
}, { soft: true });

ok('句间停顿：句号比逗号长，且都在合理范围', () => {
  const g1 = gapForText('Hello,', 0.35);
  const g2 = gapForText('Hello.', 0.35);
  const g3 = gapForText('Hello?', 0.35);
  assert.ok(g2 > g1, `${g2} vs ${g1}`);
  assert.ok(g3 >= g2, `${g3} vs ${g2}`);
  assert.ok(g1 > 0.1 && g2 < 0.7, `${g1} / ${g2}`);
});

ok('老配置里下线的音色会自动回落到英音默认', () => {
  const p = path.join(os.tmpdir(), 'ss-store-' + Date.now() + '.json');
  fs.writeFileSync(p, JSON.stringify({ settings: { voice: 'en-US-NancyNeural' }, docs: [] }));
  const st = createStore(p);
  assert.equal(st.getSettings().voice, 'en-GB-SoniaNeural');
  assert.equal(st.getSettings().displayMode, 'both');
  assert.equal(st.getSettings().preListen, true);
});

await okAsync('去首尾静音后音频明显变短', async () => {
  const t = await tts.ensure('Short test.', { voice: 'en-GB-SoniaNeural', rate: 1 }, tmp);
  const wavIn = path.join(tmp, 'raw.wav');
  const wavOut = path.join(tmp, 'trim.wav');
  await ff.normalizeWav(t.file, wavIn);
  await ff.trimEdges(wavIn, wavOut);
  const a = (await ff.probe(wavIn)).duration;
  const b = (await ff.probe(wavOut)).duration;
  assert.ok(b < a - 0.3, `${a} -> ${b}`);
  assert.ok(b > 0.4, 'trim 太狠了：' + b);
}, { soft: true });

await okAsync('免费翻译通道', async () => {
  const r = await translateTexts(['Good morning, how are you today?'], { translateProvider: 'mymemory' });
  assert.ok(r.texts[0] && r.texts[0].length > 0, 'empty translation');
}, { soft: true });

// ---------- 汇总 ----------
console.log('\n核心逻辑冒烟测试\n' + results.join('\n'));
const fails = results.filter((r) => r.includes('FAIL')).length;
console.log(`\n${results.length - fails}/${results.length} 通过`);
fs.rmSync(tmp, { recursive: true, force: true });
