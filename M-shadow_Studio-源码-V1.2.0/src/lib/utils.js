/** 前端通用工具 */

export function fmtTime(sec) {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function tokenize(s) {
  const m = String(s || '').match(/[A-Za-z0-9\u00C0-\u024F]+(?:['’-][A-Za-z0-9\u00C0-\u024F]+)*/g);
  return m || [];
}

/** 词级 diff（1 = 正确, -1 = 缺失, 0 = 多写/错误），用于听写结果展示 */
export function wordDiff(target, input) {
  const ref = tokenize(target).map((w) => w.toLowerCase());
  const hyp = tokenize(input).map((w) => w.toLowerCase());
  const n = ref.length;
  const m = hyp.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 0; i <= n; i++) dp[i][0] = i;
  for (let j = 0; j <= m; j++) dp[0][j] = j;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const cost = ref[i - 1] === hyp[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  const ops = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && dp[i][j] === dp[i - 1][j - 1] + (ref[i - 1] === hyp[j - 1] ? 0 : 1)) {
      ops.unshift({ type: ref[i - 1] === hyp[j - 1] ? 'ok' : 'wrong', ref: ref[i - 1], hyp: hyp[j - 1] });
      i--; j--;
    } else if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) {
      ops.unshift({ type: 'miss', ref: ref[i - 1], hyp: null });
      i--;
    } else {
      ops.unshift({ type: 'extra', ref: null, hyp: hyp[j - 1] });
      j--;
    }
  }
  const correct = ops.filter((o) => o.type === 'ok').length;
  return { ops, correct, total: ref.length, ratio: ref.length ? correct / ref.length : 0 };
}

/** 从句子集合里抽出用于单词听写的词表 */
const STOP = new Set(('a an the and or but if of to in on at for with from by as is am are was were be been being ' +
  'do does did have has had will would can could shall should may might must it its this that these those ' +
  'i you he she we they me him her us them my your his their our not no yes so than then there here ' +
  'what which who whom whose when where why how all any both each few more most other some such only own same ' +
  'too very just also about into over after before again further once during out off up down').split(' '));

export function collectWords(segments, { limit = 200, minLen = 3 } = {}) {
  const freq = new Map();
  for (const seg of segments) {
    for (const w of tokenize(seg.text)) {
      const lw = w.toLowerCase();
      if (lw.length < minLen || STOP.has(lw)) continue;
      if (/^\d+$/.test(lw)) continue;
      const item = freq.get(lw) || { word: lw, count: 0, sentence: seg.text, zh: seg.zh, segId: seg.id };
      item.count += 1;
      if (!item.sentence) item.sentence = seg.text;
      freq.set(lw, item);
    }
  }
  return [...freq.values()]
    .sort((a, b) => b.count - a.count || a.word.localeCompare(b.word))
    .slice(0, limit);
}

export function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

export function scoreColor(score) {
  if (score >= 90) return '#16a34a';
  if (score >= 80) return '#0891b2';
  if (score >= 70) return '#d97706';
  return '#dc2626';
}
