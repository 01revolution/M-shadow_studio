/** 导出：配音 mp3 合辑、跟读录音合辑、SRT/LRC 字幕 */
const fs = require('fs');
const path = require('path');
const { concatToMp3 } = require('./ffmpeg');

function pad(n, w = 2) { return String(n).padStart(w, '0'); }

function srtTime(t) {
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = Math.floor(t % 60);
  const ms = Math.round((t - Math.floor(t)) * 1000);
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
}

function lrcTime(t) {
  const m = Math.floor(t / 60);
  const s = (t % 60).toFixed(2);
  return `[${pad(m)}:${s.padStart(5, '0')}]`;
}

function buildSrt(segments) {
  return segments.map((s, i) =>
    `${i + 1}\n${srtTime(s.start)} --> ${srtTime(Math.max(s.end, s.start + 0.5))}\n${s.text}\n`
  ).join('\n');
}

function buildLrc(segments, title = '') {
  const head = `[ti:${title}]\n[by:M-shadow Studio]\n`;
  return head + segments.map((s) => `${lrcTime(s.start)}${s.text}`).join('\n') + '\n';
}

/**
 * 句间停顿：按句末标点自适应。逗号只留短停，句号留完整换气，问句再多一点
 * 配合 ffmpeg 的 trimEdges（先把每句自带的首尾静音削掉），整段才像连贯讲话
 * 这样整段听起来像一个人连着说话，而不是「一句一句念完再停」
 */
function gapForText(text, base = 0.35) {
  const t = String(text || '').trim();
  if (!t) return base;
  if (/[，,]\s*$/.test(t)) return Math.max(0.14, base * 0.45);   // 逗号：一口气里的短停
  if (/[;；:]\s*$/.test(t)) return Math.max(0.22, base * 0.7);    // 分号/冒号：中停
  if (/\?\s*$/.test(t)) return Math.max(0.35, base * 1.5);       // 问句：留出语气
  if (/!\s*$/.test(t)) return Math.max(0.3, base * 1.25);
  if (/\.\s*$/.test(t)) return Math.max(0.32, base * 1.5);       // 句号：完整换气
  return Math.max(0.2, base * 1.0);
}

/**
 * 把多个音频合成一个 mp3
 * @param {string[]} files
 * @param {string} outPath
 * @param {{gap?:number, texts?:string[], trim?:boolean}} opts
 *        texts 用于按标点自适应句间停顿（轮数与 files 对齐）
 */
async function exportMp3(files, outPath, { gap = 0.35, texts = null, trim = true } = {}) {
  const pairs = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    if (f && fs.existsSync(f) && fs.statSync(f).size > 0) {
      pairs.push({ file: f, text: texts ? texts[i] : '' });
    }
  }
  if (!pairs.length) throw new Error('没有可导出的音频，请先生成配音或录制跟读');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const gaps = pairs.map((p) => gapForText(p.text, gap));
  await concatToMp3(pairs.map((p) => p.file), outPath, { gap, gaps, trim });
  const size = fs.statSync(outPath).size;
  return { file: outPath, size, count: pairs.length };
}

function writeText(outPath, content) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, content, 'utf8');
  return { file: outPath, size: fs.statSync(outPath).size };
}

module.exports = { exportMp3, buildSrt, buildLrc, writeText, gapForText };
