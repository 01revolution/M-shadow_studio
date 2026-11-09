/**
 * 跟读评分：把识别结果与目标句子做词级对齐，给出多维分数和中文建议。
 * 说明：本地 Whisper 只能给出“听成了什么”，因此准确度是“可懂度/还原度”层面的评分，
 * 不是音素级的发音分析；配合语速、停顿、音量，足以支撑日常跟读训练。
 */

function normalizeTokens(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z0-9'\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.replace(/^'+|'+$/g, ''))
    .filter(Boolean);
}

/** 编辑距离对齐，返回 [{type, ref, hyp}] */
function align(refTokens, hypTokens) {
  const n = refTokens.length;
  const m = hypTokens.length;
  const dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = 0; i <= n; i++) dp[i][0] = i;
  for (let j = 0; j <= m; j++) dp[0][j] = j;

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const cost = refTokens[i - 1] === hypTokens[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,        // 少读（删除）
        dp[i][j - 1] + 1,        // 多读（插入）
        dp[i - 1][j - 1] + cost  // 匹配或替换
      );
    }
  }

  const ops = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && dp[i][j] === dp[i - 1][j - 1] + (refTokens[i - 1] === hypTokens[j - 1] ? 0 : 1)) {
      ops.unshift({
        type: refTokens[i - 1] === hypTokens[j - 1] ? 'match' : 'sub',
        ref: refTokens[i - 1],
        hyp: hypTokens[j - 1],
      });
      i--; j--;
    } else if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) {
      ops.unshift({ type: 'del', ref: refTokens[i - 1], hyp: null });
      i--;
    } else {
      ops.unshift({ type: 'ins', ref: null, hyp: hypTokens[j - 1] });
      j--;
    }
  }
  return ops;
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

/**
 * @param {object} p
 * @param {string} p.target 目标句子
 * @param {string} p.hypothesis 识别出来的文本
 * @param {number} p.duration 录音时长（秒）
 * @param {number} p.referenceDuration 参考音频时长（秒，可为 0）
 * @param {object} p.audio {meanVolume, silenceCount, silenceTotal}
 * @param {number} p.wpm 参考语速
 */
function scoreReading({ target, hypothesis, duration, referenceDuration, audio = {}, wpm = 150 }) {
  const ref = normalizeTokens(target);
  const hyp = normalizeTokens(hypothesis);
  const ops = align(ref, hyp);

  const matches = ops.filter((o) => o.type === 'match').length;
  const subs = ops.filter((o) => o.type === 'sub');
  const dels = ops.filter((o) => o.type === 'del');
  const inss = ops.filter((o) => o.type === 'ins');

  const refLen = Math.max(1, ref.length);
  const recall = (matches + subs.length * 0.4) / refLen;
  const precision = hyp.length ? (matches + subs.length * 0.4) / hyp.length : 0;

  // ---- 准确度（60 分权重）----
  const accuracy = clamp(recall * 100 * 0.85 + precision * 100 * 0.15, 0, 100);

  // ---- 流利度（25 分权重）----
  const expected = referenceDuration && referenceDuration > 0.5
    ? referenceDuration
    : (refLen / Math.max(80, wpm)) * 60;
  const dur = Math.max(0.3, duration || 0);
  const ratio = dur / expected;
  let fluency = 100;
  if (ratio < 0.7) fluency -= (0.7 - ratio) * 120;      // 太快/抢读
  else if (ratio > 1.35) fluency -= (ratio - 1.35) * 85; // 太慢/拖沓
  const pausePenalty = Math.min(30, (audio.silenceCount || 0) * 5 + (audio.silenceTotal || 0) * 3);
  fluency = clamp(fluency - pausePenalty, 30, 100);

  // ---- 音量（15 分权重）----
  let volumeScore = 85;
  if (audio.meanVolume != null) {
    if (audio.meanVolume >= -24) volumeScore = 100;
    else if (audio.meanVolume >= -38) volumeScore = 100 - (Math.abs(audio.meanVolume) - 24) * 4.2;
    else volumeScore = clamp(40 - (Math.abs(audio.meanVolume) - 38) * 2, 10, 45);
  }
  if (audio.maxVolume != null && audio.maxVolume > -3) volumeScore -= 8; // 可能爆音

  const total = clamp(Math.round(accuracy * 0.60 + fluency * 0.25 + volumeScore * 0.15), 0, 100);

  const grade = total >= 90 ? '优秀' : total >= 80 ? '良好' : total >= 70 ? '及格' : '要加油';
  const stars = total >= 92 ? 5 : total >= 85 ? 4 : total >= 75 ? 3 : total >= 65 ? 2 : 1;

  return {
    score: total,
    grade,
    stars,
    breakdown: {
      accuracy: Math.round(accuracy),
      fluency: Math.round(fluency),
      volume: Math.round(volumeScore),
    },
    stats: {
      refWords: ref.length,
      heardWords: hyp.length,
      matches,
      subs: subs.length,
      dels: dels.length,
      inss: inss.length,
      recall: Math.round(recall * 100),
      precision: Math.round(precision * 100),
      duration: Math.round(dur * 100) / 100,
      expected: Math.round(expected * 100) / 100,
      speedRatio: Math.round(ratio * 100) / 100,
      wpm: Math.round((ref.length / dur) * 60),
      silenceCount: audio.silenceCount || 0,
      silenceTotal: Math.round((audio.silenceTotal || 0) * 10) / 10,
      meanVolume: audio.meanVolume,
    },
    words: ops.map((o) => ({
      type: o.type,
      ref: o.ref,
      hyp: o.hyp,
    })),
    // 只保留出了问题的词，界面高亮用
    issues: {
      substitutions: subs.map((o) => ({ expected: o.ref, heard: o.hyp })),
      missing: dels.map((o) => o.ref),
      extra: inss.map((o) => o.hyp),
    },
    suggestions: buildSuggestions({
      total, accuracy, fluency, volumeScore, ratio, refLen,
      subs, dels, inss, audio, dur, expected,
    }),
    heard: String(hypothesis || '').trim(),
  };
}

function buildSuggestions(p) {
  const out = [];
  const {
    total, ratio, subs, dels, inss, audio, expected, dur,
  } = p;

  if (dels.length) {
    const list = dels.slice(0, 6).map((o) => o.ref).join('、');
    out.push(`有 ${dels.length} 个词没读出来：${list}${dels.length > 6 ? ' 等' : ''}。先慢速跟读整句，确认每个词都发出来。`);
  }
  if (subs.length) {
    const list = subs.slice(0, 5).map((o) => `「${o.ref}」（你读成了「${o.hyp}」）`).join('、');
    out.push(`${list} 这几个词听起来不够准，单独把词拆开念 3 遍，再放回句子连读。`);
  }
  if (inss.length > 2) {
    out.push(`识别到 ${inss.length} 个多余的词（可能是口头填充词或停顿声），尽量保持句子干净。`);
  }
  if (ratio < 0.75) {
    out.push(`语速偏快：录音 ${dur.toFixed(1)}s，参考约 ${expected.toFixed(1)}s。用意群停顿代替赶速度，重读关键词。`);
  } else if (ratio > 1.4) {
    out.push(`语速偏慢：录音 ${dur.toFixed(1)}s，参考约 ${expected.toFixed(1)}s。试着把相邻单词连成一个意群再读。`);
  }
  if ((audio.silenceCount || 0) >= 3) {
    out.push(`录音里有 ${audio.silenceCount} 处长停顿（合计约 ${(audio.silenceTotal || 0).toFixed(1)}s），说明句子被拆散了，先背熟再跟读。`);
  }
  if (audio.meanVolume != null && audio.meanVolume < -34) {
    out.push(`整体音量偏低（平均 ${audio.meanVolume.toFixed(1)} dB），离麦克风近一点或提高音量，识别会更准。`);
  }
  if (audio.maxVolume != null && audio.maxVolume > -3) {
    out.push('音量接近上限，可能存在爆音，稍微离远一点效果更好。');
  }
  if (!out.length) {
    out.push(total >= 90
      ? '非常棒，句子完整、节奏自然。可以试试 1.15 倍速朗读挑战更高难度。'
      : '整体完成度不错，重点再打磨一下重音位置和句尾语调。');
  }
  return out;
}

module.exports = { scoreReading, align, normalizeTokens, buildSuggestions };
