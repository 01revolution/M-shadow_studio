/** 素材导入：文本 / PDF / Word / 字幕 / 音频 / 视频 / 视频网站链接 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const mammoth = require('mammoth');
const { probe, extractPlayback, extractAsrWav } = require('./ffmpeg');
const { transcribe } = require('./asr');
const { buildSegments, cleanText } = require('./text');

const TEXT_EXT = ['.txt', '.md', '.text'];
const SUB_EXT = ['.srt', '.vtt', '.lrc'];
const AUDIO_EXT = ['.mp3', '.wav', '.m4a', '.aac', '.flac', '.ogg', '.opus', '.wma'];
const VIDEO_EXT = ['.mp4', '.mov', '.mkv', '.webm', '.avi', '.flv', '.m4v', '.wmv'];

function newId() {
  return 'd_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/** 解析 "00:00:01,000" / "00:01,00" / "0:01.5" 这类时间戳 */
function parseTs(str) {
  const s = String(str).trim().replace(',', '.');
  const parts = s.split(':');
  let h = 0; let m = 0; let sec = 0;
  if (parts.length === 3) {
    h = parseFloat(parts[0]) || 0;
    m = parseFloat(parts[1]) || 0;
    sec = parseFloat(parts[2]) || 0;
  } else if (parts.length === 2) {
    m = parseFloat(parts[0]) || 0;
    sec = parseFloat(parts[1]) || 0;
  } else {
    sec = parseFloat(parts[0]) || 0;
  }
  return h * 3600 + m * 60 + sec;
}

const TS_RE = /(\d{1,3}:\d{2}(?::\d{2})?[.,]\d{1,3}|\d{1,3}:\d{2}(?::\d{2})?)/;

/** 解析 SRT / VTT 字幕，拿到真实时间轴 */
function parseSubtitle(raw) {
  let s = String(raw).replace(/\r/g, '');
  s = s.replace(/^WEBVTT.*$/m, '');
  s = s.replace(/^NOTE[\s\S]*?\n\n/gm, '');
  const blocks = s.split(/\n{2,}/);
  const cues = [];
  for (const b of blocks) {
    const lines = b.split('\n').filter((l) => l.trim() !== '');
    if (!lines.length) continue;
    const idx = lines.findIndex((l) => l.includes('-->'));
    if (idx < 0) continue;
    const head = lines[idx];
    const [a, z] = head.split('-->');
    const startM = a && a.match(TS_RE);
    const endM = z && z.match(TS_RE);
    if (!startM || !endM) continue;
    const start = parseTs(startM[1]);
    const end = parseTs(endM[1]);
    if (!(end > start)) continue;
    const text = lines.slice(idx + 1).join(' ')
      .replace(/<[^>]+>/g, '')
      .replace(/\[[^\]]*\]/g, '')
      .replace(/\{[^}]*\}/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (text) cues.push({ start: Math.round(start * 100) / 100, end: Math.round(end * 100) / 100, text });
  }
  return cues;
}

/** LRC 歌词式字幕 */
function parseLrc(raw) {
  const cues = [];
  const lines = String(raw).split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\[(\d{1,2}):(\d{2})(?:[.:](\d{1,2}))?\]\s*(.+)$/);
    if (!m) continue;
    const start = (+m[1]) * 60 + (+m[2]) + (m[3] ? +m[3] / 100 : 0);
    const text = m[4].trim();
    if (!text) continue;
    const next = i + 1 < lines.length ? lines[i + 1].match(/^\[(\d{1,2}):(\d{2})/) : null;
    const end = next ? (+next[1]) * 60 + (+next[2]) : start + 3;
    cues.push({ start, end: Math.max(start + 1, end), text });
  }
  return cues;
}

async function readPdf(file) {
  const { PDFParse } = require('pdf-parse');
  const buf = fs.readFileSync(file);
  const parser = new PDFParse({ data: buf });
  try {
    const r = await parser.getText();
    return r.text || '';
  } finally {
    try { await parser.destroy(); } catch (_) {}
  }
}

async function readDocx(file) {
  const { value } = await mammoth.extractRawText({ path: file });
  return value || '';
}

function hasYtdlp(settings) {
  const bin = settings?.ytdlpPath || 'yt-dlp';
  try {
    const r = spawn(bin, ['--version'], { windowsHide: true });
    return new Promise((resolve) => {
      r.on('error', () => resolve(false));
      r.on('close', (c) => resolve(c === 0));
      setTimeout(() => resolve(false), 8000);
    });
  } catch (_) { return Promise.resolve(false); }
}

function runYtdlp(bin, args, { proxy } = {}) {
  return new Promise((resolve, reject) => {
    const full = proxy ? ['--proxy', proxy, ...args] : args;
    const child = spawn(bin, full, { windowsHide: true });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => { out += d.toString(); });
    child.stderr.on('data', (d) => { err += d.toString(); });
    child.on('error', (e) => reject(new Error(`无法启动 yt-dlp：${e.message}`)));
    child.on('close', (code) => {
      if (code === 0) resolve({ out, err });
      else reject(new Error(err.slice(-800) || `yt-dlp 退出码 ${code}`));
    });
  });
}

/**
 * 导入单个本地文件
 * @returns {Promise<doc>}
 */
/** 从粘贴的文字创建素材（不需要文件） */
async function importText(rawText, { settings, dirs, title = '' }) {
  const text = String(rawText || '').replace(/\r\n?/g, '\n').trim();
  if (text.length < 3) throw new Error('粘贴的内容太短了');
  const id = newId();
  fs.mkdirSync(path.join(dirs.media, id), { recursive: true });
  const segs = buildSegments(text, { wpm: settings.wpm, gap: settings.gap });
  if (!segs.length) throw new Error('这段文字里没有识别到英文句子，请粘贴英文内容');
  const autoTitle = title
    || (text.slice(0, 40).replace(/\s+/g, ' ').trim() + (text.length > 40 ? '…' : ''));
  return {
    id,
    title: autoTitle,
    sourcePath: null,
    sourceType: 'text',
    createdAt: new Date().toISOString(),
    segments: segs,
    playbackPath: null,
    duration: 0,
    hasTiming: false,
    textLength: text.length,
    pasted: true,
  };
}

async function importFile(filePath, { settings, dirs, onProgress = () => {} }) {
  if (!fs.existsSync(filePath)) throw new Error('文件不存在：' + filePath);
  const ext = path.extname(filePath).toLowerCase();
  const title = path.basename(filePath, ext);
  const id = newId();
  const docDir = path.join(dirs.media, id);
  fs.mkdirSync(docDir, { recursive: true });

  const base = {
    id,
    title,
    sourcePath: filePath,
    createdAt: new Date().toISOString(),
    segments: [],
    playbackPath: null,
    duration: 0,
    hasTiming: false,
  };

  // ---------- 纯文本 ----------
  if (TEXT_EXT.includes(ext)) {
    const raw = fs.readFileSync(filePath, 'utf8');
    const segs = buildSegments(raw, { wpm: settings.wpm, gap: settings.gap });
    if (!segs.length) throw new Error('文本里没有找到英文句子');
    return { ...base, sourceType: 'text', segments: segs, textLength: raw.length };
  }

  // ---------- 字幕 ----------
  if (SUB_EXT.includes(ext)) {
    const raw = fs.readFileSync(filePath, 'utf8');
    const cues = ext === '.lrc' ? parseLrc(raw) : parseSubtitle(raw);
    if (!cues.length) throw new Error('字幕文件里没有解析到时间轴，请确认是标准 SRT/VTT/LRC');
    const text = cues.map((c) => c.text).join(' ');
    const segs = buildSegments(text, { chunks: cues, duration: cues[cues.length - 1].end });
    return {
      ...base,
      sourceType: 'subtitle',
      segments: segs,
      duration: cues[cues.length - 1].end,
      hasTiming: true,
    };
  }

  // ---------- PDF ----------
  if (ext === '.pdf') {
    onProgress({ phase: 'read', percent: 10, message: '读取 PDF 文本' });
    const raw = await readPdf(filePath);
    const segs = buildSegments(raw, { wpm: settings.wpm, gap: settings.gap });
    if (!segs.length) throw new Error('这个 PDF 里没有可提取的英文文字（可能是扫描件，请先用 OCR 转成文字）');
    return { ...base, sourceType: 'pdf', segments: segs };
  }

  // ---------- Word ----------
  if (ext === '.docx') {
    onProgress({ phase: 'read', percent: 10, message: '读取 Word 文本' });
    const raw = await readDocx(filePath);
    const segs = buildSegments(raw, { wpm: settings.wpm, gap: settings.gap });
    if (!segs.length) throw new Error('这个 Word 文件里没有可提取的英文文字');
    return { ...base, sourceType: 'docx', segments: segs };
  }

  // ---------- 音频 / 视频 ----------
  if (AUDIO_EXT.includes(ext) || VIDEO_EXT.includes(ext)) {
    const isVideo = VIDEO_EXT.includes(ext);
    onProgress({ phase: 'probe', percent: 8, message: '读取媒体信息' });
    const info = await probe(filePath);
    if (!info.hasAudio) throw new Error('这个文件里没有音轨');

    const copied = path.join(docDir, 'source' + ext);
    fs.copyFileSync(filePath, copied);

    // 用副本播放，避免源文件被移动/删除后失效
    let playbackPath = copied;
    if (isVideo) {
      onProgress({ phase: 'extract', percent: 18, message: '从视频中分离音轨' });
      playbackPath = await extractPlayback(filePath, path.join(docDir, 'audio.wav'));
    }

    return await transcribeToDoc({
      ...base,
      sourceType: isVideo ? 'video' : 'audio',
      playbackPath,
      duration: info.duration,
      docDir,
    }, { settings, onProgress });
  }

  throw new Error(`暂不支持的文件类型：${ext}`);
}

/** 用 ASR 给音频生成句子表 */
async function transcribeToDoc(base, { settings, onProgress }) {
  const docDir = base.docDir || path.join(path.dirname(base.playbackPath || base.sourcePath), base.id);
  fs.mkdirSync(docDir, { recursive: true });
  const asrWav = path.join(docDir, 'asr16k.wav');
  onProgress({ phase: 'asr', percent: 25, message: '准备音频（16kHz 单声道）' });
  await extractAsrWav(base.playbackPath || base.sourcePath, asrWav);

  onProgress({ phase: 'asr', percent: 35, message: '正在识别语音…' });
  const res = await transcribe(asrWav, {
    model: settings.asrModel,
    remoteHost: settings.modelHost,
    cacheDir: settings.modelCacheDir,
    localDir: settings.localModelDir,
    onProgress: (m) => {
      if (m.type === 'progress') {
        onProgress({ phase: 'asr', percent: 35 + (m.progress || 0) * 0.2, message: `下载模型 ${Math.round(m.progress || 0)}%` });
      } else if (m.stage === 'transcribe') {
        onProgress({ phase: 'asr', percent: 60, message: '识别中…' });
      }
    },
  });

  if (!res.chunks || !res.chunks.length) throw new Error('没有识别到英文语音内容');

  const text = res.chunks.map((c) => c.text).join(' ');
  const segs = buildSegments(text, {
    chunks: res.chunks,
    duration: res.duration || base.duration,
    wpm: settings.wpm,
    gap: settings.gap,
  });
  onProgress({ phase: 'done', percent: 100, message: '识别完成' });
  const { docDir: _drop, ...rest } = base;
  return {
    ...rest,
    segments: segs,
    duration: res.duration || base.duration,
    hasTiming: true,
    asrText: text,
  };
}

/** 用户经常整段粘贴分享文案，这里把真正的链接抠出来 */
function extractUrl(raw) {
  const t = String(raw || '');
  const m = t.match(/https?:\/\/[A-Za-z0-9\-._~:/?#\[\]@!$&'()*+,;=%]+/);
  if (!m) return '';
  let u = m[0];
  // 去掉中文标点、右括号等尾巴
  u = u.replace(/[）)】」》>,，。！!；;、]+$/g, '');
  return u;
}

/** 导入视频网站链接（yt-dlp） */
async function importUrl(rawUrl, { settings, dirs, onProgress = () => {} }) {
  const url = extractUrl(rawUrl) || String(rawUrl || '').trim();
  if (!/^https?:\/\//.test(url)) throw new Error('没有识别到有效链接，请把 http 开头的地址贴进来');
  const bin = settings.ytdlpBin || settings.ytdlpPath || 'yt-dlp';
  if (!(await hasYtdlp({ ytdlpPath: bin }))) {
    throw new Error(
      '找不到 yt-dlp 组件。安装包里自带 yt-dlp.exe（resources/bin/yt-dlp.exe），如果被杀毒软件删掉了，'
      + '请到 https://github.com/yt-dlp/yt-dlp/releases 重新下载 yt-dlp.exe 放进程序目录的 resources\\bin 文件夹。'
    );
  }
  const id = newId();
  const docDir = path.join(dirs.media, id);
  fs.mkdirSync(docDir, { recursive: true });

  onProgress({ phase: 'fetch', percent: 10, message: '解析链接并下载音频' });
  const outTpl = path.join(docDir, 'source.%(ext)s');
  const common = ['--no-playlist', '--no-warnings', '--restrict-filenames'];
  try {
    await runYtdlp(bin, [
      ...common,
      '-f', 'bestaudio/best',
      '--write-subs', '--write-auto-subs',
      '--sub-langs', 'en.*,en',
      '--sub-format', 'srt/vtt/best',
      '-o', outTpl, url,
    ], { proxy: settings.proxy });
  } catch (e) {
    throw new Error('链接下载失败：' + e.message);
  }

  const files = fs.readdirSync(docDir);
  const src = files.find((f) => f.startsWith('source.') && !/\.(srt|vtt|ass|json|lrc|txt)$/i.test(f));
  if (!src) throw new Error('下载完成但没有找到音频文件');
  const srcPath = path.join(docDir, src);
  const sub = files.find((f) => /\.(srt|vtt)$/i.test(f) && f.startsWith('source.'));

  const info = await probe(srcPath);
  const title = path.basename(src, path.extname(src)) || '网络素材';

  onProgress({ phase: 'extract', percent: 30, message: '转换音轨' });
  const playbackPath = await extractPlayback(srcPath, path.join(docDir, 'audio.wav'));

  const base = {
    id, title, createdAt: new Date().toISOString(), sourcePath: srcPath,
    playbackPath, duration: info.duration, sourceType: 'url', url,
  };

  if (sub) {
    onProgress({ phase: 'subtitle', percent: 65, message: '使用网站自带字幕断句' });
    const cues = parseSubtitle(fs.readFileSync(path.join(docDir, sub), 'utf8'));
    if (cues.length) {
      const text = cues.map((c) => c.text).join(' ');
      return {
        ...base,
        segments: buildSegments(text, { chunks: cues, duration: info.duration }),
        hasTiming: true,
      };
    }
  }

  return await transcribeToDoc({ ...base, docDir }, { settings, onProgress });
}

module.exports = { importFile, importText, importUrl, transcribeToDoc, parseSubtitle, parseLrc, extractUrl, readPdf, readDocx };
