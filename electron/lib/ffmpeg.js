/** ffmpeg 封装：探测、抽音轨、转码、拼接、音量与停顿分析 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

let cached = null;
function ffmpegPath() {
  if (cached) return cached;
  let p = null;

  // 1) 安装包内置的 ffmpeg（按平台命名，Windows 下是 ffmpeg.exe）
  const exe = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  const bundled = path.join(process.resourcesPath || '', 'bin', exe);
  if (fs.existsSync(bundled)) p = bundled;

  // 2) 开发环境用 ffmpeg-static
  if (!p) {
    try {
      const s = require('ffmpeg-static');
      if (s) p = s;
    } catch (_) { /* 用系统 ffmpeg */ }
  }
  if (!p) p = 'ffmpeg';
  if (typeof p === 'string' && p.includes('app.asar')) {
    p = p.replace('app.asar', 'app.asar.unpacked');
  }
  cached = p;
  return p;
}

function run(args, { timeout = 120000 } = {}) {
  return new Promise((resolve, reject) => {
    const bin = ffmpegPath();
    const child = spawn(bin, args, { windowsHide: true });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch (_) {}
      reject(new Error('ffmpeg 超时'));
    }, timeout);
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(new Error(`无法执行 ffmpeg（${bin}）：${err.message}`));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`ffmpeg 失败(${code})：${stderr.slice(-600)}`));
    });
  });
}

/** 探测媒体：时长 / 是否含音轨 / 是否含视频 */
async function probe(file) {
  if (!fs.existsSync(file)) throw new Error('文件不存在：' + file);
  let stderr = '';
  try {
    const r = await run(['-hide_banner', '-i', file, '-f', 'null', '-']);
    stderr = r.stderr;
  } catch (e) {
    stderr = e.message;
  }
  const durMatch = stderr.match(/Duration: (\d{2}):(\d{2}):(\d{2})\.(\d{2})/);
  const duration = durMatch
    ? (+durMatch[1]) * 3600 + (+durMatch[2]) * 60 + (+durMatch[3]) + (+durMatch[4]) / 100
    : 0;
  const hasAudio = /Stream #.*: Audio:/.test(stderr);
  const hasVideo = /Stream #.*: Video:/.test(stderr) && !/Video: (mjpeg|png)/i.test(stderr);
  return { duration: Math.round(duration * 100) / 100, hasAudio, hasVideo };
}

/** 抽取播放用音轨（44.1k 单声道 wav，体积可控且可精确 seek） */
async function extractPlayback(input, output) {
  await run(['-y', '-hide_banner', '-i', input, '-vn', '-ac', '1', '-ar', '44100',
    '-c:a', 'pcm_s16le', output]);
  return output;
}

/** 抽取 ASR 用的 16k 单声道 wav */
async function extractAsrWav(input, output) {
  await run(['-y', '-hide_banner', '-i', input, '-vn', '-ac', '1', '-ar', '16000',
    '-c:a', 'pcm_s16le', output]);
  return output;
}

/** 转成 float32 裸数据（Whisper 直接读） */
async function toFloat32(input, output) {
  await run(['-y', '-hide_banner', '-i', input, '-vn', '-ac', '1', '-ar', '16000',
    '-f', 'f32le', '-c:a', 'pcm_f32le', output]);
  return output;
}

/** 任意音频 -> 44.1k 单声道 wav（用于安全拼接） */
async function normalizeWav(input, output) {
  await run(['-y', '-hide_banner', '-i', input, '-vn', '-ac', '1', '-ar', '44100',
    '-c:a', 'pcm_s16le', output]);
  return output;
}

async function makeSilence(output, seconds = 0.3) {
  await run(['-y', '-hide_banner', '-f', 'lavfi', '-i',
    `anullsrc=r=44100:cl=mono`, '-t', String(seconds), '-c:a', 'pcm_s16le', output]);
  return output;
}

/** 去掉首尾静音（Edge 合成每句自带 0.3~0.5s 尾静音，直接拼会显得一顿一顿） */
async function trimEdges(input, output, { thresholdDb = -50 } = {}) {
  await run(['-y', '-hide_banner', '-i', input, '-af',
    `silenceremove=start_periods=1:start_duration=0.03:start_threshold=${thresholdDb}dB`,
    '-c:a', 'pcm_s16le', output]);
  // 上面只去了开头；尾部用「倒放→去开头→再倒放」处理
  const rev = output.replace(/\.wav$/, '.rev.wav');
  await run(['-y', '-hide_banner', '-i', output, '-af',
    `areverse,silenceremove=start_periods=1:start_duration=0.06:start_threshold=${thresholdDb}dB,areverse`,
    '-c:a', 'pcm_s16le', rev]);
  fs.renameSync(rev, output);
  return output;
}

/**
 * 把多个音频拼成一个 mp3
 * @param {string[]} files
 * @param {string} output
 * @param {{gap?:number, gaps?:number[], trim?:boolean}} opts
 *        gaps[i] 表示第 i 句后面插入的静音秒数（缺省用 gap）
 */
async function concatToMp3(files, output, { gap = 0.35, gaps = null, trim = true } = {}) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ss-concat-'));
  const parts = [];
  for (let i = 0; i < files.length; i++) {
    const raw = path.join(tmpDir, `r${i}.wav`);
    const wav = path.join(tmpDir, `p${i}.wav`);
    await normalizeWav(files[i], raw);
    if (trim) {
      try {
        await trimEdges(raw, wav);
        if (!fs.existsSync(wav) || fs.statSync(wav).size < 4000) fs.copyFileSync(raw, wav);
      } catch (_) {
        fs.copyFileSync(raw, wav);
      }
    } else {
      fs.copyFileSync(raw, wav);
    }
    parts.push(wav);
    const g = gaps ? (typeof gaps[i] === 'number' ? gaps[i] : gap) : gap;
    if (g > 0 && i < files.length - 1) {
      const sil = path.join(tmpDir, `g${i}.wav`);
      await makeSilence(sil, g);
      parts.push(sil);
    }
  }
  const listFile = path.join(tmpDir, 'list.txt');
  fs.writeFileSync(listFile, parts.map((p) => `file '${p.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`).join('\n'));
  await run(['-y', '-hide_banner', '-f', 'concat', '-safe', '0', '-i', listFile,
    '-c:a', 'libmp3lame', '-b:a', '128k', '-ar', '44100', output]);
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
  return output;
}

/** 音量与停顿分析 */
async function analyze(input) {
  let stderr = '';
  try {
    const r = await run(['-hide_banner', '-i', input, '-af',
      'volumedetect,silencedetect=noise=-35dB:d=0.45', '-f', 'null', '-']);
    stderr = r.stderr;
  } catch (e) {
    stderr = e.message;
  }
  const mean = stderr.match(/mean_volume: ([-0-9.]+) dB/);
  const max = stderr.match(/max_volume: ([-0-9.]+) dB/);
  const starts = [...stderr.matchAll(/silence_start: ([0-9.]+)/g)].map((m) => +m[1]);
  const ends = [...stderr.matchAll(/silence_end: ([0-9.]+)/g)].map((m) => +m[1]);
  const silences = [];
  for (let i = 0; i < starts.length; i++) {
    if (ends[i] != null) silences.push({ start: starts[i], end: ends[i] });
  }
  return {
    meanVolume: mean ? +mean[1] : null,
    maxVolume: max ? +max[1] : null,
    silences,
    silenceCount: silences.length,
    silenceTotal: silences.reduce((a, s) => a + (s.end - s.start), 0),
  };
}

/** 截取片段（用于“原声单句循环”） */
async function cutSegment(input, output, start, end) {
  const dur = Math.max(0.2, end - start);
  await run(['-y', '-hide_banner', '-ss', String(start), '-t', String(dur),
    '-i', input, '-vn', '-ac', '1', '-ar', '44100', '-c:a', 'pcm_s16le', output]);
  return output;
}

module.exports = {
  ffmpegPath, run, probe, extractPlayback, extractAsrWav,
  toFloat32, normalizeWav, concatToMp3, analyze, cutSegment, makeSilence, trimEdges,
};
