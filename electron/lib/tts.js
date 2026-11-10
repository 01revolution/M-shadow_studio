/** Edge TTS 配音：免费、多音色、可调语速，输出 mp3 并做内容哈希缓存 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');

const BITRATE = 48000; // AUDIO_24KHZ_48KBITRATE_MONO_MP3

/** 预置英文音色（音色名取自微软在线音色表，写错名字会直接合成失败） */
const CURATED_VOICES = [
  // —— 英式为主，跟读首选
  { name: 'en-GB-SoniaNeural', label: 'Sonia', gender: '女', accent: '英音', tag: '标准 RP，雅思听力常用' },
  { name: 'en-GB-LibbyNeural', label: 'Libby', gender: '女', accent: '英音', tag: '温柔清晰，适合精听' },
  { name: 'en-GB-MaisieNeural', label: 'Maisie', gender: '女', accent: '英音', tag: '少女音，轻快' },
  { name: 'en-GB-RyanNeural', label: 'Ryan', gender: '男', accent: '英音', tag: 'BBC 播报风格' },
  { name: 'en-GB-ThomasNeural', label: 'Thomas', gender: '男', accent: '英音', tag: '正式朗读，偏庄重' },
  { name: 'en-IE-EmilyNeural', label: 'Emily', gender: '女', accent: '爱尔兰音', tag: '英伦群岛口音，清亮' },
  { name: 'en-IE-ConnorNeural', label: 'Connor', gender: '男', accent: '爱尔兰音', tag: '英伦群岛口音，口语感' },
  // —— 美音
  { name: 'en-US-AriaNeural', label: 'Aria', gender: '女', accent: '美音', tag: '清晰标准，通用首选' },
  { name: 'en-US-JennyNeural', label: 'Jenny', gender: '女', accent: '美音', tag: '柔和自然' },
  { name: 'en-US-EmmaNeural', label: 'Emma', gender: '女', accent: '美音', tag: '明亮有活力' },
  { name: 'en-US-MichelleNeural', label: 'Michelle', gender: '女', accent: '美音', tag: '亲切温暖' },
  { name: 'en-US-GuyNeural', label: 'Guy', gender: '男', accent: '美音', tag: '沉稳新闻感' },
  { name: 'en-US-AndrewNeural', label: 'Andrew', gender: '男', accent: '美音', tag: '自然口语，对话感强' },
  { name: 'en-US-BrianNeural', label: 'Brian', gender: '男', accent: '美音', tag: '低沉有磁性' },
  // —— 其它口音
  { name: 'en-AU-NatashaNeural', label: 'Natasha', gender: '女', accent: '澳音', tag: '澳洲口音' },
  { name: 'en-AU-WilliamNeural', label: 'William', gender: '男', accent: '澳音', tag: '澳洲口音' },
  { name: 'en-CA-ClaraNeural', label: 'Clara', gender: '女', accent: '加音', tag: '北美轻口音' },
  { name: 'en-CA-LiamNeural', label: 'Liam', gender: '男', accent: '加音', tag: '北美轻口音' },
  { name: 'en-NZ-MollyNeural', label: 'Molly', gender: '女', accent: '新西兰音', tag: '新西兰口音' },
  { name: 'en-IN-NeerjaNeural', label: 'Neerja', gender: '女', accent: '印度音', tag: '印度英语' },
  { name: 'en-ZA-LeahNeural', label: 'Leah', gender: '女', accent: '南非音', tag: '南非口音' },
];

const VALID_VOICES = new Set(CURATED_VOICES.map((v) => v.name));
const DEFAULT_VOICE = 'en-GB-SoniaNeural';

/** 老版本里存过已下线音色时，自动回落到默认音色，避免整篇配音报错 */
function resolveVoice(v) {
  return VALID_VOICES.has(v) ? v : DEFAULT_VOICE;
}

let client = null;
let clientVoice = null;

async function getClient(voice) {
  if (client && clientVoice === voice) return client;
  if (client) { try { client.close(); } catch (_) {} }
  const c = new MsEdgeTTS();
  await c.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
  client = c;
  clientVoice = voice;
  return c;
}

function rateToPercent(rate) {
  const r = typeof rate === 'number' ? rate : parseFloat(rate) || 1;
  const pct = Math.round((r - 1) * 100);
  return (pct >= 0 ? '+' : '') + pct + '%';
}

function cacheKey(text, { voice, rate = 1, pitch = 'default', volume = 'default' }) {
  return crypto.createHash('sha1')
    .update([voice, rate, pitch, volume, text].join('|'))
    .digest('hex').slice(0, 24);
}

/** 单次合成（内部用）：拿到音频 Buffer */
function synthOnce(text, opts, v, c) {
  const { rate = 1, pitch = 'default', volume = 'default' } = opts || {};
  const { audioStream } = c.toStream(String(text), { rate: rateToPercent(rate), pitch, volume });
  return new Promise((resolve, reject) => {
    const chunks = [];
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      reject(new Error('语音合成超时'));
    }, 45000);
    audioStream.on('data', (d) => chunks.push(Buffer.from(d)));
    audioStream.on('end', () => {
      if (done) return;
      done = true; clearTimeout(timer); resolve(Buffer.concat(chunks));
    });
    audioStream.on('error', (e) => {
      if (done) return;
      done = true; clearTimeout(timer);
      const err = new Error(e && e.message ? e.message : '语音合成失败');
      err.partial = Buffer.concat(chunks);
      reject(err);
    });
  });
}

/**
 * 合成一句话到 mp3 文件。
 * Edge 服务偶尔会提前断流（Stream closed before ... no turn.end received），
 * 这里自动重连重试一次；仍然失败但有部分音频时，就落盘已拿到的部分，不打断用户。
 */
async function synth(text, opts, outPath) {
  const { voice = DEFAULT_VOICE } = opts || {};
  const v = resolveVoice(voice);
  let lastErr = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const c = await getClient(v);
      const buf = await synthOnce(text, opts, v, c);
      if (!buf.length) throw new Error('语音合成返回空音频');
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, buf);
      return { file: outPath, bytes: buf.length, duration: Math.round((buf.length * 8 / BITRATE) * 100) / 100 };
    } catch (e) {
      lastErr = e;
      // 断流后客户端状态不可靠，直接丢弃，下次重建连接
      try { if (client) client.close(); } catch (_) {}
      client = null; clientVoice = null;
      if (e.partial && e.partial.length > 2048) {
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        fs.writeFileSync(outPath, e.partial);
        return { file: outPath, bytes: e.partial.length, duration: Math.round((e.partial.length * 8 / BITRATE) * 100) / 100, truncated: true };
      }
      if (attempt === 0) await new Promise((r) => setTimeout(r, 250));
    }
  }
  throw lastErr || new Error('语音合成失败');
}

/** 带缓存：同一句 + 同一音色只合成一次 */
async function ensure(text, opts, ttsDir) {
  const k = cacheKey(text, { ...opts, voice: resolveVoice(opts && opts.voice) });
  const file = path.join(ttsDir, `${k}.mp3`);
  if (fs.existsSync(file) && fs.statSync(file).size > 0) {
    const bytes = fs.statSync(file).size;
    return { key: k, file, bytes, duration: Math.round((bytes * 8 / BITRATE) * 100) / 100, cached: true };
  }
  const r = await synth(text, opts, file);
  return { key: k, ...r, cached: false };
}

async function listAllVoices() {
  const c = new MsEdgeTTS();
  const v = await c.getVoices();
  return v.filter((x) => x.Locale && x.Locale.startsWith('en-'));
}

async function testVoice(voice) {
  const c = new MsEdgeTTS();
  await c.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
  const { audioStream } = c.toStream('Hello, this is your shadowing voice.');
  const buf = await new Promise((resolve, reject) => {
    const chunks = [];
    audioStream.on('data', (d) => chunks.push(Buffer.from(d)));
    audioStream.on('end', () => resolve(Buffer.concat(chunks)));
    audioStream.on('error', reject);
    setTimeout(() => reject(new Error('试听超时')), 20000);
  });
  try { c.close(); } catch (_) {}
  return buf.length;
}

module.exports = {
  ensure, synth, CURATED_VOICES, listAllVoices, testVoice, cacheKey, rateToPercent,
  resolveVoice, DEFAULT_VOICE, VALID_VOICES,
};
