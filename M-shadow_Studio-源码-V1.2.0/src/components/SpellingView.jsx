import React, { useEffect, useRef, useState } from 'react';
import { useStore } from '../store.js';
import { IconPlay, IconCheck, IconClose, IconNext, IconEye, IconShuffle, IconList, IconVolume } from './Icons.jsx';
import { wordDiff, tokenize } from '../lib/utils.js';
import * as player from '../lib/player.js';

const api = window.api;

export const RATES = [0.5, 0.75, 1, 1.25, 1.5];

/** 题量下拉：默认 5/10/20/50/80/100；上限变大时选项变长，最后一项一定等于上限 */
export function countOptions(max) {
  const cap = Math.max(100, Math.min(9999, parseInt(max, 10) || 100));
  const base = [5, 10, 20, 50, 80, 100].filter((n) => n <= cap);
  let n = 120;
  while (n < cap) {
    base.push(n);
    n += n < 250 ? 30 : 50;
  }
  if (!base.includes(cap)) base.push(cap);
  return base;
}
const DEFAULT_KEYS = { replay: '1', meaning: '0', hint: '2', next: 'ArrowRight' };

/** 把用户按下的键和设置里存的键比对 */
function matchKey(e, key) {
  if (!key) return false;
  const k = String(key).toLowerCase();
  if (e.key && e.key.toLowerCase() === k) return true;
  if (e.code && e.code.toLowerCase() === k) return true;
  return false;
}

function blankWord(sentence, word) {
  if (!sentence) return '';
  const re = new RegExp('\\b' + word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
  return sentence.replace(re, () => '＿'.repeat(Math.max(2, word.replace(/[^A-Za-z']/g, '').length)));
}

const HINT_STOP = new Set(['the','and','for','that','this','with','from','have','has','was','were','are','but','not','you','your','they','them','their','there','what','when','which','who','will','would','can','could','should','into','onto','about','than','then','them','these','those','been','being','very','just','also','more','most','some','such','only','other','over','under','after','before','because','while']);

/** 整句提示：按百分比把较长/较难的词挖空；百分比越高，挖空越少 */
function maskSentence(sentence, percent) {
  const tokens = String(sentence || '').split(/\s+/).filter(Boolean);
  if (!tokens.length) return '';
  const cand = tokens
    .map((t, i) => ({ i, clean: t.replace(/[^A-Za-z']/g, '').toLowerCase(), len2: t.replace(/[^A-Za-z']/g, '').length }))
    .filter((x) => x.i > 0 && x.len2 >= 5 && !HINT_STOP.has(x.clean))
    .sort((a, b) => b.len2 - a.len2);
  if (!cand.length) return tokens.join(' ');
  const ratio = (100 - Math.max(10, Math.min(95, percent))) / 100;
  // 挖空数量按整句词数算，但最多只挖一半的实词，保留足够线索
  const want = Math.round(tokens.length * ratio);
  const blanks = Math.max(1, Math.min(Math.ceil(cand.length / 2), want));
  const pick = new Set(cand.slice(0, blanks).map((x) => x.i));
  return tokens.map((t, i) => {
    if (!pick.has(i)) return t;
    const n = Math.max(2, t.replace(/[^A-Za-z']/g, '').length); // 下划线长度＝单词字母数
    return '＿'.repeat(n);
  }).join(' ');
}

export default function SpellingView() {
  const doc = useStore((s) => s.doc);
  const settings = useStore((s) => s.settings);
  const notify = useStore((s) => s.notify);

  const [mode, setMode] = useState('word');       // word | sentence
  const [count, setCount] = useState((settings && settings.spellCount) || 10);
  const [order, setOrder] = useState('rank');     // rank 顺序 | shuffle 随机
  const [rate, setRate] = useState(1);
  const [items, setItems] = useState([]);
  const [pos, setPos] = useState(0);
  const [queue, setQueue] = useState([]);
  const [input, setInput] = useState('');
  const [checked, setChecked] = useState(null);
  const [stats, setStats] = useState({ correct: 0, total: 0 });
  const [zhText, setZhText] = useState('');
  const [zhLoading, setZhLoading] = useState(false);
  const [hintText, setHintText] = useState('');
  const [peeked, setPeeked] = useState(false);
  const [viewedHint, setViewedHint] = useState(false);
  const [bankCount, setBankCount] = useState(0);
  const reinserted = useRef(new Set());
  const mounted = useRef(false);
  const inputRef = useRef(null);

  const keys = {
    ...DEFAULT_KEYS,
    ...((settings && settings.hotkeys && settings.hotkeys.spelling) || {}),
  };
  const hintPercent = Math.max(10, Math.min(95, parseInt(settings && settings.sentenceHintPercent, 10) || 60));

  useEffect(() => {
    if (settings) {
      setRate(settings.rate || 1);
      setCount(settings.spellCount || 10);
    }
  }, [settings && settings.rate, settings && settings.spellCount]);

  // 重建题库
  useEffect(() => { buildSet(); }, [doc && doc.id, mode, count, order]);

  async function buildSet() {
    if (!doc) return;
    let list = [];
    if (mode === 'word') {
      try {
        const r = await api.vocabRank({ docId: doc.id, limit: 300 });
        list = (r.list || []).map((w) => ({
          target: w.word,
          sentence: w.sentence || '',
          senZh: w.senZh || '',
          weight: w.weight,
          inBank: w.inBank,
          segId: w.segId,
        }));
        setBankCount(r.bank || 0);
      } catch (_) {
        list = [];
      }
    } else {
      list = doc.segments
        .filter((s) => s.text && s.text.split(/\s+/).length >= 4)
        .map((s) => ({ target: s.text, sentence: s.text, senZh: s.zh || '', weight: 50, segId: s.id }));
      if (order === 'shuffle') list = shuffle(list);
    }
    if (order === 'shuffle' && mode === 'word') list = shuffle(list);
    list = list.slice(0, count);
    setItems(list);
    setQueue(list);
    setPos(0);
    setInput('');
    setChecked(null);
    setZhText('');
    setHintText('');
    setPeeked(false);
    setViewedHint(false);
    setStats({ correct: 0, total: 0 });
    reinserted.current = new Set();
  }

  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  const cur = queue[pos] || null;

  // 换题：只重置答题状态（不在这里自动朗读；进页面也不读）
  const qkey = cur ? `${pos}:${cur.target}` : '';
  useEffect(() => {
    setInput('');
    setChecked(null);
    setZhText('');
    setHintText('');
    setPeeked(false);
    setViewedHint(false);
  }, [qkey]);

  // 换题只聚焦输入框；只有「自动播报」打开时才自动读
  useEffect(() => {
    setTimeout(() => inputRef.current && inputRef.current.focus(), 60);
    if (!cur || !(settings && settings.autoSpeakSpell)) return;
    const t = setTimeout(() => playCurrent(), 320);
    return () => clearTimeout(t);
  }, [pos, cur && cur.target, settings && settings.autoSpeakSpell]);

  async function playCurrent(target) {
    if (useStore.getState().view !== 'spelling') return;
    const text = target || (cur && cur.target);
    if (!text) return;
    try {
      const r = await api.ttsOne({ text, voice: settings.voice, rate });
      player.play({ src: api.mediaUrl(r.file) });
    } catch (e) {
      notify('配音失败：' + (e.message || ''), 'error');
    }
  }

  /** 中文意思：走词典接口（英文释义 → 中文），并记一次「看过」 */
  async function showMeaning(mark = true) {
    if (!cur) return;
    if (mode === 'sentence') {
      setZhText(cur.senZh || '（这句还没有译文）');
      if (mark) markPeek('sentence-meaning');
      return;
    }
    setZhLoading(true);
    setZhText('查询中…');
    try {
      const d = await api.vocabDefine({ word: cur.target });
      setZhText((d && d.zh) || (d && d.defs && d.defs[0]) || '（词典没查到，检查网络）');
    } catch (e) {
      setZhText('查词失败：' + (e.message || ''));
    } finally {
      setZhLoading(false);
    }
    if (mark) { setViewedHint(true); markPeek('meaning'); }
  }

  /** 提示：原句挖掉要拼的词 */
  function showHint() {
    if (!cur) return;
    if (mode === 'sentence') {
      setHintText(maskSentence(cur.target, hintPercent));
    } else {
      setHintText(blankWord(cur.sentence, cur.target) || '（没有例句）');
    }
    setViewedHint(true);
    // 查看提示只显示挖空句，不加入生词库、不安排重现
  }

  /** 看过中文 → 自动进生词库，并在 3 个词之后再次出现（提示不计入） */
  function markPeek(reason) {
    if (!cur) return;
    setPeeked(true);
    if (mode === 'word') { // 只有单词听写才计入生词库
      api.vocabAdd({
        word: cur.target,
        reason: 'peek',
        sentence: cur.sentence,
        senZh: cur.senZh,
        zh: zhText,
      }).then((v) => { if (v) setBankCount((n) => n + 1); }).catch(() => {});
      scheduleReinsert(cur);
    }
  }

  /** 把这道题在至少 3 题之后再插回来 */
  function scheduleReinsert(item) {
    const key = item.target;
    if (reinserted.current.has(key)) {
      // 已经排过一次 → 插到队尾循环
      setQueue((q) => [...q, item]);
      return;
    }
    reinserted.current.add(key);
    setQueue((q) => {
      const copy = [...q];
      const at = Math.min(copy.length, pos + 4);
      copy.splice(at, 0, item);
      return copy;
    });
  }

  async function submit() {
    if (!cur || checked) return;
    const target = cur.target;
    const diff = wordDiff(target, input);
    const ok = diff.ratio === 1 && tokenize(input).length === tokenize(target).length;
    setChecked({ ok, diff, target, typed: input });
    setStats((s) => ({ correct: s.correct + (ok ? 1 : 0), total: s.total + 1 }));
    // 拼完自动把中文意思和提示亮出来
    showMeaning(false).catch(() => {});
    if (mode === 'sentence') setHintText(maskSentence(target, hintPercent));
    else setHintText(blankWord(cur.sentence, target) || '（没有例句）');

    if (!ok && mode === 'word') {
      api.vocabAdd({ word: target, reason: 'wrong', sentence: cur.sentence, senZh: cur.senZh })
        .then(() => setBankCount((n) => n + 1)).catch(() => {});
      scheduleReinsert(cur);
    }
    if (mode === 'word') api.vocabSeen(target).catch(() => {});
  }

  function nextQ() {
    if (pos < queue.length - 1) setPos(pos + 1);
    else if (items.length) {
      notify('这一组做完了，可以重新选个题量继续', 'info');
    }
  }


  // 快捷键全部来自设置
  useEffect(() => {
    function onKey(e) {
      if (useStore.getState().view !== 'spelling') return;
      if (!cur) return;
      if (matchKey(e, keys.replay)) { e.preventDefault(); playCurrent(); }
      else if (matchKey(e, keys.meaning)) { e.preventDefault(); showMeaning(); }
      else if (matchKey(e, keys.hint)) { e.preventDefault(); showHint(); }
      else if (matchKey(e, keys.next)) {
        if (checked) { e.preventDefault(); nextQ(); }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cur, checked, keys.replay, keys.meaning, keys.hint, keys.next, rate, mode]);

  if (!doc) {
    return (
      <div className="empty">
        <div className="empty-title">先导入素材，再从素材里听写</div>
        <div className="empty-hint">听写词表来自当前素材：优先挑雅思/四级高频词、正文高频词，以及你跟读时读不准的词。</div>
      </div>
    );
  }

  const accuracy = stats.total ? Math.round((stats.correct / stats.total) * 100) : 0;

  return (
    <div className="spell">
      <div className="spell-head">
        <div className="seg-tabs">
          <button className={`seg-tab ${mode === 'word' ? 'active' : ''}`} onClick={() => setMode('word')}>单词听写</button>
          <button className={`seg-tab ${mode === 'sentence' ? 'active' : ''}`} onClick={() => setMode('sentence')}>整句听写</button>
        </div>
        <span className="ctrl-label">题量</span>
        <select
          className="mini-select"
          value={count}
          onChange={(e) => {
            const n = parseInt(e.target.value, 10);
            setCount(n);
            useStore.getState().patchSettings({ spellCount: n }).catch(() => {});
          }}
        >
          {countOptions((settings && settings.spellMax) || 100).map((n) => (
            <option key={n} value={n}>{n} 题</option>
          ))}
        </select>
        <div className="seg-tabs">
          <button className={`seg-tab ${order === 'rank' ? 'active' : ''}`} onClick={() => setOrder('rank')} title="按词汇重要性顺序">
            <IconList size={12} /> 顺序
          </button>
          <button className={`seg-tab ${order === 'shuffle' ? 'active' : ''}`} onClick={() => setOrder('shuffle')} title="随机出题">
            <IconShuffle size={12} /> 随机
          </button>
        </div>
        <button className="btn sm" onClick={buildSet} title="重置本轮进度，重新出题">重置</button>
        <button
          className={`toggle ${settings && settings.autoSpeakSpell ? 'on' : ''}`}
          onClick={() => useStore.getState().patchSettings({ autoSpeakSpell: !(settings && settings.autoSpeakSpell) }).catch(() => {})}
          title="打开后每换一题自动播报；关闭时点播放键或按快捷键才读"
        >
          <IconPlay size={11} /> 自动播报 {settings && settings.autoSpeakSpell ? '开' : '关'}
        </button>
        <div className="rate-chips small">
          {RATES.map((r) => (
            <button key={r} className={`rate-chip ${Math.abs(rate - r) < 0.001 ? 'on' : ''}`} onClick={() => setRate(r)}>
              {r}×
            </button>
          ))}
        </div>
      </div>

      <div className="spell-keys">
        <kbd>{keys.replay}</kbd> 再听 <kbd>{keys.meaning}</kbd> 中文 <kbd>{keys.hint}</kbd> 提示 <kbd>{keys.next}</kbd> 下一题
        <span className="keys-tip">快捷键可在「设置」里改</span>
      </div>

      {!cur ? (
        <div className="spell-card">
          <div className="empty-hint">这组题目为空：换一个素材，或把题量调大。</div>
        </div>
      ) : (
        <div className="spell-card">
          <div className="spell-top">
            <span>第 {pos + 1} / {queue.length} 题</span>
            <div className="spell-progress"><div style={{ width: `${((pos + (checked ? 1 : 0)) / Math.max(1, queue.length)) * 100}%` }} /></div>
            <span>正确率 {accuracy}%</span>
            {mode === 'word' && cur.weight >= 40 && <span className="tag-hf">雅思高频</span>}
          </div>

          <div className="spell-play">
            <button className="spell-btn" onClick={() => playCurrent()} title={`再听一遍（${keys.replay}）`}>
              <IconVolume size={22} />
            </button>
            <div className="spell-hint">
              {mode === 'word' ? '听单词，写出拼写' : '听整句，写出完整句子'}
            </div>
            <div className="spell-tools">
              <button className="btn sm zh-btn" onClick={showMeaning} disabled={zhLoading} title={`中文意思（${keys.meaning}）`}>
                <IconEye size={12} /> {zhLoading ? '查询中…' : '中文意思'}
              </button>
              <button className="btn sm zh-btn" onClick={showHint} title={`提示（${keys.hint}）`}>
                提示
              </button>
            </div>
          </div>

          {zhText && (
            <div className="zh-reveal">
              中文意思：<b>{zhText}</b>
              {mode === 'word' && cur.senZh ? <span className="zh-ctx">· 原句意：{cur.senZh}</span> : null}
            </div>
          )}
          {hintText && (
            <div className="zh-reveal hint-reveal">
              {mode === 'word' ? <>原句提示：<b>{hintText}</b></> : <>提示：{hintText}</>}
            </div>
          )}
          {peeked && mode === 'word' && (
            <div className="peek-note">看过中文的词已加入生词库（查看提示不会加入）</div>
          )}
          {checked && !checked.ok && mode === 'word' && !peeked && !viewedHint && (
            <div className="peek-note">单词已加入生词库！</div>
          )}

          <div className="spell-input-row">
            <input
              className={`spell-input ${checked ? (checked.ok ? 'right' : 'wrong') : ''}`}
              placeholder={mode === 'word' ? '输入你听到的单词…' : '输入你听到的整句…'}
              value={input}
              ref={inputRef}
              autoFocus
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { if (!checked) submit(); else nextQ(); }
              }}
              disabled={!!checked}
            />
            {!checked ? (
              <button className="btn primary" onClick={submit} disabled={!input.trim()}>检查</button>
            ) : (
              <button className="btn primary" onClick={nextQ}>
                {pos >= queue.length - 1 ? '已完成' : '下一题'} <IconNext size={12} />
              </button>
            )}
          </div>

          {checked && (
            <div className="spell-result">
              <div className={`result-banner ${checked.ok ? 'right' : 'wrong'}`}>
                {checked.ok ? <IconCheck size={16} /> : <IconClose size={16} />}
                {checked.ok ? '完全正确' : `正确率 ${Math.round(checked.diff.ratio * 100)}%（${checked.diff.correct}/${checked.diff.total} 词）`}
              </div>

              {!checked.ok && (
                <div className="words-diff">
                  {checked.diff.ops.map((o, i) => {
                    if (o.type === 'ok') return <span key={i} className="word-chip ok">{o.ref}</span>;
                    if (o.type === 'wrong') return <span key={i} className="word-chip wrong" title={`你写了 ${o.hyp}`}>{o.ref}</span>;
                    if (o.type === 'miss') return <span key={i} className="word-chip miss">{o.ref}</span>;
                    return <span key={i} className="word-chip extra">{o.hyp}</span>;
                  })}
                </div>
              )}

              <div className="answer-line">答案：<b>{checked.target}</b></div>

              <div className="spell-foot">
                <button className="btn sm" onClick={() => playCurrent()}>
                  <IconPlay size={12} /> 再听一遍
                </button>
                {!checked.ok && (
                  <button className="btn sm" onClick={() => { setInput(''); setChecked(null); }}>
                    重写一遍
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="spell-stats">
        <div className="stat-box">
          <div className="stat-num">{stats.total}</div>
          <div className="stat-label">本轮已做</div>
        </div>
        <div className="stat-box">
          <div className="stat-num" style={{ color: '#15803d' }}>{stats.correct}</div>
          <div className="stat-label">答对</div>
        </div>
        <div className="stat-box">
          <div className="stat-num" style={{ color: accuracy >= 80 ? '#15803d' : '#b45309' }}>{accuracy}%</div>
          <div className="stat-label">正确率</div>
        </div>
      </div>

    </div>
  );
}
