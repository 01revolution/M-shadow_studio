/**
 * 文本处理：清洗 / 智能断句 / 时间轴估算 / 与 ASR 片段对齐 / 词级比对
 * 纯 Node 模块，不依赖 electron，便于单测。
 */

const ABBREVIATIONS = new Set([
  'mr', 'mrs', 'ms', 'miss', 'dr', 'prof', 'sr', 'jr', 'st', 'mt', 'ft',
  'etc', 'vs', 'e.g', 'i.e', 'a.m', 'p.m', 'u.s', 'u.k', 'u.n', 'no',
  'inc', 'ltd', 'co', 'corp', 'dept', 'univ', 'est', 'fig', 'ref', 'al',
  'ave', 'blvd', 'rd', 'sq', 'ph.d', 'b.a', 'm.a', 'jan', 'feb', 'mar',
  'apr', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec', 'approx'
]);

const CLOSERS = `"'”’)]}`;

/** 词数统计（把缩写、连字符、数字都按词处理） */
function wordCount(s) {
  const m = String(s).trim().match(/[A-Za-z0-9\u00C0-\u024F]+(?:['’-][A-Za-z0-9\u00C0-\u024F]+)*/g);
  return m ? m.length : 0;
}

/** 清洗：统一换行、去页眉页脚、修复连字符断行 */
function cleanText(raw) {
  let s = String(raw || '');
  s = s.replace(/\r\n?/g, '\n');
  s = s.replace(/\u00a0|\u3000/g, ' ');
  s = s.replace(/\u0000/g, '');
  // PDF 分页标记  -- 1 of 12 --
  s = s.replace(/^\s*-{2,}\s*\d+\s*of\s*\d+\s*-{2,}\s*$/gim, '\n');
  // 行末连字符断词：exam-\nple -> example
  s = s.replace(/([A-Za-z])-\s*\n\s*([a-z])/g, '$1$2');
  // 全角字母数字 -> 半角
  s = s.replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) =>
    String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  // 常见排版符号归一
  s = s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
  s = s.replace(/[—–]/g, ' - ');
  return s;
}

function isDecimalPoint(s, i) {
  const prev = s[i - 1];
  const next = s[i + 1];
  return /\d/.test(prev || '') && /\d/.test(next || '');
}

function trailingWord(buf) {
  const m = buf.match(/([A-Za-z.\u00C0-\u024F]+)\s*$/);
  return m ? m[1] : '';
}

/** 核心断句 */
function splitSentences(input) {
  const text = cleanText(input).replace(/\n+/g, ' ');
  const out = [];
  let buf = '';
  let i = 0;
  const TERM = new Set(['.', '!', '?', '…']);

  while (i < text.length) {
    const ch = text[i];
    if (TERM.has(ch)) {
      if (ch === '.' && isDecimalPoint(text, i)) {
        buf += ch; i++; continue;
      }
      // 吃掉连续的终止符，例如 "?!" / "..."
      let j = i;
      while (j < text.length && TERM.has(text[j])) { buf += text[j]; j++; }
      // 吃掉紧跟的引号 / 括号
      while (j < text.length && CLOSERS.includes(text[j])) { buf += text[j]; j++; }
      // 看后面的字符决定是否真的断句
      let k = j;
      while (k < text.length && text[k] === ' ') k++;
      const next = text[k] || '';
      const w = trailingWord(buf).replace(/\.+$/, '').toLowerCase();

      let boundary = true;
      if (!next) boundary = true;
      else if (/[a-z]/.test(next)) boundary = false;          // 后面是小写，基本不是句末
      else if (ABBREVIATIONS.has(w)) boundary = false;         // Mr. / U.S. 等
      else if (/^[A-Z\u00C0-\u024F]$/.test(trailingWord(buf).replace(/\.$/, ''))) boundary = false; // 姓名缩写 J.
      else if (/^[a-z]$/i.test(next) === false && /[,;]/.test(next)) boundary = false;

      if (boundary) {
        out.push(buf);
        buf = '';
        i = k;
        continue;
      }
      i = j;
      continue;
    }
    buf += ch;
    i++;
  }
  if (buf.trim()) out.push(buf);

  return postProcess(out);
}

/** 去掉编号/项目符号，并合并过短片段、拆分过长片段 */
function postProcess(rawList) {
  let list = rawList
    .map((s) => s.replace(/^\s*[-•*·]\s+/, '').replace(/^\s*\d{1,2}[.)、]\s+/, ''))
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter((s) => s && wordCount(s) > 0 && /[A-Za-z]/.test(s));

  // 合并太短的碎片（<3 词）到前一句
  const merged = [];
  for (const s of list) {
    const prev = merged[merged.length - 1];
    if (prev && wordCount(s) < 3 && wordCount(prev) + wordCount(s) <= 30) {
      merged[merged.length - 1] = prev + ' ' + s;
    } else {
      merged.push(s);
    }
  }

  // 拆分太长（>32 词）的句子
  const MAX = 32;
  const final = [];
  for (const s of merged) {
    if (wordCount(s) <= MAX) { final.push(s); continue; }
    let rest = s;
    while (wordCount(rest) > MAX) {
      const tokens = rest.split(' ');
      // 在前 32 词内找最靠后的逗号/分号/连词
      let cut = -1;
      for (let i = 22; i < Math.min(tokens.length - 1, MAX); i++) {
        const t = tokens[i];
        if (/^[,;]$/.test(t) || /^[,;]$/.test((tokens[i + 1] || '')) ||
            /^(and|but|because|so|while|although|which|where|when)$/i.test(tokens[i + 1] || '')) {
          cut = i;
        }
      }
      if (cut < 0) cut = MAX - 1;
      final.push(tokens.slice(0, cut + 1).join(' ').replace(/[,;]$/, '') + '.');
      rest = tokens.slice(cut + 1).join(' ');
    }
    if (rest.trim()) final.push(rest.trim());
  }
  return final;
}

/** 只有文本时，按语速估算时间轴 */
function estimateTimeline(sentences, { wpm = 150, gap = 0.35 } = {}) {
  let t = 0;
  const segs = [];
  sentences.forEach((text, idx) => {
    const wc = Math.max(1, wordCount(text));
    const dur = Math.max(1.2, (wc / wpm) * 60);
    segs.push({ idx, text, start: round2(t), end: round2(t + dur), timed: false });
    t += dur + gap;
  });
  return segs;
}

function round2(n) { return Math.round(n * 100) / 100; }

/** 把 ASR 片段（带真实时间戳）铺平成“每个词一个时间点” */
function flattenChunkWords(chunks) {
  const words = [];
  (chunks || []).forEach((c) => {
    const ws = sentenceTokens(c.text);
    const span = Math.max(0.01, (c.end - c.start));
    const n = Math.max(1, ws.length);
    ws.forEach((w, i) => {
      words.push({
        w,
        t: c.start + (span * i) / n,
        tEnd: c.start + (span * (i + 1)) / n,
        chunkStart: c.start,
      });
    });
  });
  return words;
}

function sentenceTokens(s) {
  const m = String(s).match(/[A-Za-z0-9\u00C0-\u024F]+(?:['’-][A-Za-z0-9\u00C0-\u024F]+)*/g);
  return m || [];
}

/**
 * 用 ASR 时间戳给句子定时间轴。
 * 句子词数与 ASR 词数可能不一致，用累计词数比例映射过去。
 */
function alignToChunks(sentences, chunks, totalDuration) {
  const words = flattenChunkWords(chunks);
  let cum = 0;
  const segs = sentences.map((text, idx) => {
    const wc = Math.max(1, wordCount(text));
    const startWord = cum;
    const endWord = cum + wc - 1;
    cum += wc;
    const a = words[Math.min(startWord, words.length - 1)];
    const b = words[Math.min(endWord, words.length - 1)];
    return {
      idx,
      text,
      start: round2(a ? a.t : 0),
      end: round2(b ? Math.max(b.tEnd, (a ? a.t : 0) + 0.4) : 0),
      timed: true,
    };
  });
  // 收尾：保证首尾相接、不超过总时长
  for (let i = 0; i < segs.length; i++) {
    if (i > 0 && segs[i].start < segs[i - 1].end) segs[i].start = segs[i - 1].end;
    if (i < segs.length - 1) {
      segs[i].end = Math.min(segs[i].end, segs[i + 1].start > segs[i].start ? segs[i + 1].start : segs[i].end);
    }
    if (totalDuration) segs[i].end = Math.min(segs[i].end, round2(totalDuration));
  }
  return segs;
}

/** 构建完整句表 */
function buildSegments(text, opts = {}) {
  const sentences = splitSentences(text);
  const { chunks, duration, wpm, gap } = opts;
  const base = chunks && chunks.length
    ? alignToChunks(sentences, chunks, duration)
    : estimateTimeline(sentences, { wpm, gap });
  return base.map((s) => ({
    id: `s${s.idx + 1}`,
    idx: s.idx,
    text: s.text,
    start: s.start,
    end: s.end,
    timed: !!s.timed,
    zh: '',
  }));
}

module.exports = {
  cleanText,
  splitSentences,
  wordCount,
  estimateTimeline,
  alignToChunks,
  buildSegments,
  sentenceTokens,
  round2,
};
