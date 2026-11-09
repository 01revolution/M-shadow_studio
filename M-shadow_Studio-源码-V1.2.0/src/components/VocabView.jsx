import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store.js';
import {
  IconPlay, IconCheck, IconClose, IconNext, IconShuffle,
  IconDownload, IconUpload, IconSearch, IconTrash, IconEye, IconVolume,
} from './Icons.jsx';
import { wordDiff } from '../lib/utils.js';
import * as player from '../lib/player.js';

const api = window.api;

const DEFAULT_KEYS = {
  replay: '1', meaning: '0', hint: '2', next: 'ArrowRight',
  known: 'ArrowUp', unknown: 'ArrowDown', tooEasy: '6', rewrite: '9',
};
const DEFAULT_COLS = [34, 146, 104, 264, 118, 77];

const ORDERS = [
  { key: 'shuffle', label: '随机' },
  { key: 'az', label: '字母顺序 A–Z' },
  { key: 'addedDesc', label: '加入时间（新→旧）' },
  { key: 'addedAsc', label: '加入时间（旧→新）' },
  { key: 'reviewedDesc', label: '上次复习时间（新→旧）' },
  { key: 'familiarityDesc', label: '熟悉程度（错得多→少）' },
];

const LIB_SORTS = [
  { key: 'az', label: 'A–Z 正序' },
  { key: 'za', label: 'A–Z 倒序' },
  { key: 'addedDesc', label: '加入时间 新→旧' },
  { key: 'addedAsc', label: '加入时间 旧→新' },
  { key: 'reviewedDesc', label: '上次复习 新→旧' },
  { key: 'reviewedAsc', label: '上次复习 旧→新' },
  { key: 'familiarityAsc', label: '熟悉程度 低→高' },
  { key: 'familiarityDesc', label: '熟悉程度 高→低' },
];

function matchKey(e, key) {
  if (!key) return false;
  const k = String(key).toLowerCase();
  if (e.key && e.key.toLowerCase() === k) return true;
  if (e.code && e.code.toLowerCase() === k) return true;
  return false;
}

function shuffle(a) {
  const x = [...a];
  for (let i = x.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [x[i], x[j]] = [x[j], x[i]];
  }
  return x;
}

function sortWords(list, key) {
  const by = (f) => (a, b) => String(f(a) || '').localeCompare(String(f(b) || '')) || 0;
  const ts = (f) => (a, b) => String(f(a) || '').localeCompare(String(f(b) || ''));
  switch (key) {
    case 'az': return list.sort(by((x) => x.word));
    case 'za': return list.sort(by((x) => x.word)).reverse();
    case 'addedAsc': return list.sort(ts((x) => x.createdAt));
    case 'addedDesc': return list.sort(ts((x) => x.createdAt)).reverse();
    case 'reviewedDesc': return list.sort(ts((x) => x.lastSeenAt)).reverse();
    case 'reviewedAsc': return list.sort(ts((x) => x.lastSeenAt));
    case 'familiarityAsc': return list.sort((a, b) => (a.wrong || 0) - (b.wrong || 0));
    case 'familiarityDesc': return list.sort((a, b) => (b.wrong || 0) - (a.wrong || 0));
    default: return shuffle(list);
  }
}

export default function VocabView() {
  const settings = useStore((s) => s.settings);
  const notify = useStore((s) => s.notify);

  const [tab, setTab] = useState('study'); // study | library
  const [bank, setBank] = useState({});
  const [order, setOrder] = useState('shuffle');
  const [goal, setGoal] = useState(10);
  const [session, setSession] = useState([]);
  const [pos, setPos] = useState(0);
  const [phase, setPhase] = useState('ask'); // ask | spell | reveal
  const [input, setInput] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [result, setResult] = useState(null);
  const [stats, setStats] = useState({ known: 0, unknown: 0, correct: 0, wrong: 0 });
  const [progress, setProgress] = useState(0);
  const [finished, setFinished] = useState(false);
  const [detail, setDetail] = useState(null);
  const [askDetail, setAskDetail] = useState(null);
  const [askShowDef, setAskShowDef] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [rate, setRate] = useState(1);
  const [busy, setBusy] = useState(false);
  const mounted = useRef(false);
  const inputRef = useRef(null);

  // 生词本
  const [mask, setMask] = useState('none'); // none | word | meaning
  const [libSort, setLibSort] = useState('az');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState([]);
  const [revealed, setRevealed] = useState({});
  const [libDetails, setLibDetails] = useState({});
  const [exportFormat, setExportFormat] = useState('csv');
  const [exportOpen, setExportOpen] = useState(false);
  const [exportPhonetic, setExportPhonetic] = useState(false);
  const [exportMeaning, setExportMeaning] = useState(true);
  const [exportPath, setExportPath] = useState('');
  const [exportTask, setExportTask] = useState({ running: false, percent: 0 });
  const [importTask, setImportTask] = useState({ running: false, percent: 0 });
  const [exportError, setExportError] = useState('');
  const [libKind, setLibKind] = useState('all');
  const [cols, setCols] = useState(DEFAULT_COLS);
  const [zhTip, setZhTip] = useState('');

  const keys = {
    ...DEFAULT_KEYS,
    ...((settings && settings.hotkeys && settings.hotkeys.vocab) || {}),
  };
  const wrongLimit = Math.max(1, parseInt(settings && settings.spellWrongLimit, 10) || 1);
  const allWordsMode = Number(settings && settings.vocabPageSize) === 0;
  const pageSize = allWordsMode ? 999999 : Math.max(5, parseInt(settings && settings.vocabPageSize, 10) || 20);

  useEffect(() => {
    if (settings) setRate(settings.rate || 1);
  }, [settings && settings.rate]);

  useEffect(() => { reload(); }, []);
  // 切换音标体系后清掉本地释义缓存，重新按新音标取
  useEffect(() => { setLibDetails({}); }, [settings && settings.phoneticStyle]);
  // 常驻挂载后，切回生词库/切回本页时要重新拉一次，否则会显示旧列表
  useEffect(() => {
    if (tab === 'library') reload();
  }, [tab]);
  useEffect(() => useStore.subscribe((st, prev) => {
    if (st.view === 'vocab' && prev.view !== 'vocab' && tab === 'library') reload();
  }), [tab]);

  async function reload() {
    try {
      const b = await api.vocabList();
      setBank(b || {});
    } catch (_) { setBank({}); }
  }

  const bankList = useMemo(() => Object.values(bank || {}), [bank]);

  function storeVoice() {
    const s = useStore.getState().settings || {};
    return s.voice === 'original' ? (s.lastVoice || 'en-GB-SoniaNeural') : s.voice;
  }

  async function playWord(word) {
    if (!word || useStore.getState().view !== 'vocab') return;
    try {
      const r = await api.ttsOne({ text: word, voice: storeVoice(), rate });
      player.play({ src: api.mediaUrl(r.file) });
    } catch (e) {
      notify('配音失败：' + (e.message || ''), 'error');
    }
  }

  async function playExample(text) {
    if (!text) return;
    try {
      const r = await api.ttsOne({ text, voice: storeVoice(), rate });
      player.play({ src: api.mediaUrl(r.file) });
    } catch (e) {
      notify('例句配音失败：' + (e.message || ''), 'error');
    }
  }

  async function ensureDetail(word) {
    if (libDetails[word]) return libDetails[word];
    setLoadingDetail(true);
    try {
      const d = await api.vocabDetail({ word });
      setLibDetails((m) => ({ ...m, [word]: d }));
      return d;
    } catch (_) {
      return null;
    } finally { setLoadingDetail(false); }
  }

  // ---------------------------------------------------------------- 背诵
  const cur = session[pos] || null;
  const qkey = cur ? cur.word : '';

  useEffect(() => {
    if (!cur) return;
    setPhase('ask');
    setInput('');
    setAttempts(0);
    setResult(null);
    setDetail(null);
    setAskDetail(null);
    setAskShowDef(false);
    setTimeout(() => inputRef.current && inputRef.current.focus(), 60);
    // 「认识 / 不认识」那一步先取一个中文意思，遮挡着展示
    const cached = libDetails[cur.word];
    if (cached) setAskDetail(cached);
    api.vocabDetail({ word: cur.word })
      .then((d) => {
        if (useStore.getState().view === 'vocab') {
          setAskDetail(d);
          setLibDetails((m) => ({ ...m, [cur.word]: d }));
        }
      })
      .catch(() => {});
    if (!(settings && settings.autoSpeakVocab)) return;
    const t = setTimeout(() => playWord(cur.word), 320);
    return () => clearTimeout(t);
  }, [qkey, pos, settings && settings.autoSpeakVocab]);

  function buildSession() {
    if (!bankList.length) { notify('生词库还是空的，可以先去听写，或从文件导入生词', 'info'); return; }
    const list = sortWords(bankList.map((x) => ({ ...x })), order);
    const size = Math.max(1, Math.min(9999, parseInt(goal, 10) || 10));
    setSession(list.slice(0, size));
    setPos(0);
    setPhase('ask');
    setInput('');
    setAttempts(0);
    setResult(null);
    setDetail(null);
    setStats({ known: 0, unknown: 0, correct: 0, wrong: 0 });
    setProgress(0);
    setFinished(false);
    // 预热前几个词的中文释义，避免第一屏一直显示「查词中」
    list.slice(0, 3).forEach((w) => {
      api.vocabDetail({ word: w.word })
        .then((d) => setLibDetails((m) => (m[w.word] ? m : { ...m, [w.word]: d })))
        .catch(() => {});
    });
  }

  async function openAnswer(reason) {
    setPhase('reveal');
    setResult(reason === 'correct' ? { ok: true } : { ok: false, reason });
    const d = await ensureDetail(cur.word);
    setDetail(d);
    if (reason === 'unknown') {
      setStats((s) => ({ ...s, unknown: s.unknown + 1 }));
      api.vocabMark({ word: cur.word, wrong: 1, seen: 1 }).catch(() => {});
    } else if (reason === 'wrong') {
      setStats((s) => ({ ...s, wrong: s.wrong + 1 }));
      api.vocabMark({ word: cur.word, wrong: 1, seen: 1 }).catch(() => {});
    } else {
      setStats((s) => ({ ...s, correct: s.correct + 1 }));
      api.vocabMark({ word: cur.word, correct: 1, seen: 1 }).catch(() => {});
    }
    setProgress((p) => p + 1);
  }

  function markKnown() {
    if (!cur) return;
    setPhase('spell');
    setStats((s) => ({ ...s, known: s.known + 1 }));
    setTimeout(() => inputRef.current && inputRef.current.focus(), 30);
  }

  function submitSpell() {
    if (!cur || phase !== 'spell') return;
    const d = wordDiff(cur.word, input);
    if (d.ratio === 1) { openAnswer('correct'); return; }
    const n = attempts + 1;
    setAttempts(n);
    if (n >= wrongLimit) openAnswer('wrong');
    else { /* 剩余次数在输入框上方常驻显示，不再弹提示 */ }
  }

  function nextWord() {
    if (pos + 1 >= session.length) setFinished(true);
    else setPos(pos + 1);
  }

  async function deleteCurrent() {
    await api.vocabRemove(cur.word).catch(() => {});
    await reload();
    notify('已从生词库移除，这个单词以后不会再出现', 'info');
    nextWord();
  }

  function cancelSession() {
    setSession([]);
    setFinished(false);
    setProgress(0);
    setPos(0);
    setPhase('ask');
    setInput('');
    setAttempts(0);
    setResult(null);
    setDetail(null);
    setStats({ known: 0, unknown: 0, correct: 0, wrong: 0 });
  }

  // 快捷键：「认识/不认识」阶段只认这两个键 + 重听/提示；中文键在这一步失效
  useEffect(() => {
    function onKey(e) {
      if (useStore.getState().view !== 'vocab') return;
      if (!cur || finished) return;
      if (phase === 'ask') {
        if (matchKey(e, keys.replay)) { e.preventDefault(); playWord(cur.word); }
        else if (matchKey(e, keys.hint)) { e.preventDefault(); setAskShowDef((v) => !v); }
        else if (matchKey(e, keys.known)) { e.preventDefault(); markKnown(); }
        else if (matchKey(e, keys.unknown)) { e.preventDefault(); openAnswer('unknown'); }
        return;
      }
      if (matchKey(e, keys.replay)) { e.preventDefault(); playWord(cur.word); }
      else if (matchKey(e, keys.meaning) && phase !== 'reveal') {
        e.preventDefault();
        setAttempts(wrongLimit);
        openAnswer('unknown');
      } else if (matchKey(e, keys.hint) && phase === 'spell') {
        e.preventDefault();
        notify(`提示：${cur.word[0].toUpperCase()} 开头，共 ${cur.word.length} 个字母`, 'info');
      } else if (matchKey(e, keys.next) && phase === 'reveal') {
        e.preventDefault(); nextWord();
      } else if (matchKey(e, keys.tooEasy) && phase === 'reveal' && result && result.ok) {
        e.preventDefault(); deleteCurrent();
      } else if (matchKey(e, keys.rewrite) && phase === 'reveal') {
        e.preventDefault();
        setPhase('spell'); setInput('');
        setTimeout(() => inputRef.current && inputRef.current.focus(), 30);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cur, phase, finished, result, keys.replay, keys.meaning, keys.hint, keys.next, keys.tooEasy, keys.rewrite, keys.known, keys.unknown, wrongLimit, rate, detail]);

  useEffect(() => {
    if (!api.onVocabEnrichProgress) return undefined;
    return api.onVocabEnrichProgress((p) => {
      if (!p) return;
      setImportTask((t) => (t.running ? { ...t, percent: Math.max(t.percent, 15 + Math.round(0.8 * (p.percent || 0))) } : t));
    });
  }, []);

  useEffect(() => {
    if (!api.onVocabExportProgress) return undefined;
    return api.onVocabExportProgress((p) => {
      if (!p) return;
      setExportTask((t) => ({ ...t, running: true, percent: Math.max(0, Math.min(100, p.percent || 0)) }));
    });
  }, []);

  // ---------------------------------------------------------------- 生词本
  const libList = useMemo(() => {
    let list = bankList.map((x) => ({
      ...x,
      zh: (libDetails[x.word] && libDetails[x.word].zh) || x.zh || '',
    }));
    if (libKind === 'word') list = list.filter((x) => !/\s/.test(String(x.word || '').trim()));
    else if (libKind === 'phrase') list = list.filter((x) => /\s/.test(String(x.word || '').trim()));
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((x) => x.word.toLowerCase().includes(q));
    }
    return sortWords(list, libSort);
  }, [bankList, libSort, search, libDetails, libKind]);

  const pageCount = Math.max(1, Math.ceil(libList.length / pageSize));

  useEffect(() => { if (page > pageCount) setPage(pageCount); }, [pageCount]);

  // 只给当前页前 12 个词补词典数据，避免一次打太多请求
  useEffect(() => {
    if (tab !== 'library') return;
    // 整页都补词典数据（并发 4 个，边回来边填，避免出现一排「—」）
    const pageList = libList.slice((page - 1) * pageSize, page * pageSize);
    const todo = pageList.filter((w) => !libDetails[w.word]).map((w) => w.word);
    let i = 0;
    const worker = async () => {
      while (i < todo.length) {
        const word = todo[i++];
        try {
          const d = await api.vocabDetail({ word });
          setLibDetails((m) => (m[word] ? m : { ...m, [word]: d }));
        } catch (_) {}
      }
    };
    for (let k = 0; k < 4; k++) worker();
  }, [tab, page, pageSize, libList]);

  async function importWords() {
    if (importTask.running) return;
    setBusy(true);
    setImportTask({ running: true, percent: 2 });
    try {
      const r = await api.vocabImport();
      if (!r || r.canceled) { setImportTask({ running: false, percent: 0 }); return; }
      const all = r.words || [];
      const newWords = all.filter((w) => !bank[w]);
      const needEnrich = all.filter((w) => !bank[w] || !bank[w].zh || !bank[w].phonetic);
      setImportTask({ running: true, percent: 8 });
      if (newWords.length) await api.vocabAddMany({ words: newWords });
      setImportTask({ running: true, percent: 15 });
      await reload();
      if (needEnrich.length) {
        await api.vocabEnrich({ words: needEnrich });
      }
      await reload();
      setImportTask({ running: true, percent: 100 });
      notify(`已从文件导入 ${newWords.length} 个新单词，音标和中文意思已补全`, 'info');
      setTimeout(() => setImportTask({ running: false, percent: 0 }), 1500);
    } catch (e) {
      setImportTask({ running: false, percent: 0 });
      notify('导入失败：' + (e.message || ''), 'error');
    } finally { setBusy(false); }
  }

  function toggleSelect(word) {
    setSelected((s) => (s.includes(word) ? s.filter((x) => x !== word) : [...s, word]));
  }

  function pageWords() {
    return libList.slice((page - 1) * pageSize, page * pageSize).map((x) => x.word);
  }

  function toggleAllOnPage() {
    // 表头全选 = 当前筛选下的全部词（不只是这一页），避免分页时误以为全删了
    const words = libList.map((x) => x.word);
    const all = words.every((w) => selected.includes(w));
    setSelected((s) => (all ? s.filter((w) => !words.includes(w)) : [...new Set([...s, ...words])]));
  }

  // 列宽拖拽（像 Excel 一样拉表头右边缘）
  function startResize(i, e) {
    e.preventDefault();
    const startX = e.clientX;
    const startW = cols[i];
    const move = (ev) => {
      const w = Math.max(70, Math.min(640, startW + ev.clientX - startX));
      setCols((c) => { const n = [...c]; n[i] = Math.round(w); return n; });
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }

  async function removeSelected() {
    if (!selected.length) return;
    const n = selected.length;
    const left = libList.length - n;
    const nextPageCount = Math.max(1, Math.ceil(left / pageSize));
    try { await api.vocabRemoveMany(selected); } catch (_) {}
    setSelected([]);
    await reload();
    setPage((p) => Math.min(p, nextPageCount)); // 一次删除、页码一次性收拢，避免表格连续抽动
    notify(`已删除 ${n} 个生词`, 'info');
  }

  async function openExport() {
    setExportError('');
    setExportOpen(true);
    if (!exportPath) {
      try {
        const info = await api.vocabExportInfo();
        setExportPath((info && info.dir) || '');
      } catch (_) {}
    }
  }

  async function pickExportDir() {
    setExportError('');
    try {
      const r = await api.chooseDir({ defaultPath: exportPath });
      if (r && r.ok) setExportPath(r.path);
    } catch (e) {
      setExportError('选择目录失败：' + (e.message || ''));
    }
  }

  async function startExport() {
    if (!exportPath.trim()) { setExportError('请填写或选择导出目录'); return; }
    if (exportTask.running) return;
    setExportError('');
    setExportOpen(false);
    setExportTask({ running: true, percent: 2 });
    try {
      const rows = libList.map((x) => ({ word: x.word, zh: x.zh || '', phonetic: x.phonetic || '' }));
      const r = await api.vocabExport({
        format: exportFormat,
        rows,
        fields: { phonetic: exportPhonetic, meaning: exportMeaning },
        targetPath: exportPath.trim(),
      });
      if (r && r.ok) {
        setExportTask({ running: false, percent: 100 });
        notify(`已导出 ${r.count} 个单词：${r.path}`, 'info');
        setTimeout(() => setExportTask({ running: false, percent: 0 }), 1500);
      } else if (r && r.canceled) {
        setExportTask({ running: false, percent: 0 });
        setExportOpen(true);
        setExportError('已取消导出');
      } else {
        setExportTask({ running: false, percent: 0 });
        setExportOpen(true);
        setExportError('导出没有完成，请重试');
      }
    } catch (e) {
      setExportTask({ running: false, percent: 0 });
      setExportOpen(true);
      setExportError('导出失败：' + (e.message || '未知错误'));
    }
  }

  function toggleSelect(word) {
    setSelected((s) => (s.includes(word) ? s.filter((x) => x !== word) : [...s, word]));
  }

  function pageWords() {
    return libList.slice((page - 1) * pageSize, page * pageSize).map((x) => x.word);
  }

  function toggleAllOnPage() {
    // 表头全选 = 当前筛选下的全部词（不只是这一页），避免分页时误以为全删了
    const words = libList.map((x) => x.word);
    const all = words.every((w) => selected.includes(w));
    setSelected((s) => (all ? s.filter((w) => !words.includes(w)) : [...new Set([...s, ...words])]));
  }

  // 列宽拖拽（像 Excel 一样拉表头右边缘）
  function startResize(i, e) {
    e.preventDefault();
    const startX = e.clientX;
    const startW = cols[i];
    const move = (ev) => {
      const w = Math.max(70, Math.min(640, startW + ev.clientX - startX));
      setCols((c) => { const n = [...c]; n[i] = Math.round(w); return n; });
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }

  // ---------------------------------------------------------------- 渲染
  const accuracy = (stats.correct + stats.wrong + stats.unknown)
    ? Math.round((stats.correct / (stats.correct + stats.wrong + stats.unknown)) * 100)
    : 0;

  return (
    <div className="vocab-page">
      <div className="spell-head vocab-head">
        <div className="seg-tabs">
          <button className={`seg-tab ${tab === 'study' ? 'active' : ''}`} onClick={() => setTab('study')}>背单词</button>
          <button className={`seg-tab ${tab === 'library' ? 'active' : ''}`} onClick={() => setTab('library')}>
            生词库（{bankList.length}）
          </button>
        </div>
        <div className="spell-head-right">
          <button
            className={`btn sm vocab-import-btn ${importTask.running ? 'running' : ''}`}
            onClick={importWords}
            disabled={busy}
            title={importTask.running ? '正在导入并补全音标/释义，全部完成后才算导入完成' : '从文件导入生词'}
          >
            {importTask.running ? (
              <>
                <span className="vocab-import-fill" style={{ width: `${importTask.percent}%` }} />
                <span className="vocab-import-label">导入中 {importTask.percent}%</span>
              </>
            ) : (
              <><IconUpload size={12} /> 从文件导入生词</>
            )}
          </button>
          <button
            className={`btn sm vocab-export-btn ${exportTask.running ? 'running' : ''}`}
            onClick={openExport}
            disabled={!libList.length || exportTask.running}
            title={exportTask.running ? '正在后台导出，不影响使用其他功能' : '导出单词本'}
          >
            {exportTask.running ? (
              <>
                <span className="vocab-export-fill" style={{ width: `${exportTask.percent}%` }} />
                <span className="vocab-export-label">导出中 {exportTask.percent}%</span>
              </>
            ) : (
              <><IconDownload size={12} /> 导出单词本</>
            )}
          </button>
        </div>
      </div>

      {tab === 'study' ? (
        <>
          <div className="vocab-bar">
            <span className="ctrl-label">背的顺序</span>
            <select className="mini-select" value={order} onChange={(e) => setOrder(e.target.value)}>
              {ORDERS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
            <span className="ctrl-label">背几个</span>
            <input
              className="mini-num"
              type="number" min={1} max={9999}
              value={goal}
              onChange={(e) => setGoal(parseInt(e.target.value, 10) || 1)}
              title="输入这次要背多少个单词"
            />
            <button className="btn primary sm" onClick={buildSession}>
              <IconShuffle size={12} /> 开始
            </button>
            <button className="btn sm" onClick={cancelSession} disabled={!session.length} title="结束这次背单词，回到开始页">
              取消
            </button>
            <span className="bar-sep" />
            <button
              className={`toggle ${settings && settings.autoSpeakVocab ? 'on' : ''}`}
              onClick={() => useStore.getState().patchSettings({ autoSpeakVocab: !(settings && settings.autoSpeakVocab) }).catch(() => {})}
              title="打开后每换一个词自动播报；关闭时点播放键才读"
            >
              <IconPlay size={11} /> 自动播报 {settings && settings.autoSpeakVocab ? '开' : '关'}
            </button>
            <div className="rate-chips small" style={{ marginLeft: 'auto' }}>
              {[0.5, 0.75, 1, 1.25, 1.5].map((r) => (
                <button key={r} className={`rate-chip ${Math.abs(rate - r) < 0.001 ? 'on' : ''}`} onClick={() => setRate(r)}>
                  {r}×
                </button>
              ))}
            </div>
          </div>

          {finished ? (
            <div className="spell-card vocab-summary">
              <div className="empty-title" style={{ fontSize: 17 }}>这一轮背完了</div>
              <div className="summary-grid">
                <div><div className="stat-num">{session.length}</div><div className="stat-label">本次目标</div></div>
                <div><div className="stat-num" style={{ color: 'var(--green)' }}>{stats.correct}</div><div className="stat-label">拼对</div></div>
                <div><div className="stat-num" style={{ color: 'var(--amber)' }}>{stats.unknown + stats.wrong}</div><div className="stat-label">不认识 / 拼错</div></div>
                <div><div className="stat-num">{accuracy}%</div><div className="stat-label">正确率</div></div>
              </div>
              <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
                <button className="btn primary" onClick={buildSession}>再背一轮</button>
                <button className="btn" onClick={() => setTab('library')}>去生词库看看</button>
              </div>
            </div>
          ) : !cur ? (
            <div className="spell-card">
              <div className="empty-title" style={{ fontSize: 15 }}>
                {bankList.length ? '准备好了就开始' : '生词库还是空的'}
              </div>
              <div className="empty-hint">
                {bankList.length
                  ? `生词库里有 ${bankList.length} 个词。选好「背的顺序」和「背几个」，点上面的「开始背」就行。`
                  : '可以从文件导入生词（txt / pdf / word / csv），或者在「听写拼写」里拼错几个词，它们会自动进来。'}
              </div>
              <div style={{ marginTop: 16 }} className="inline empty-actions">
                {bankList.length ? (
                  <button className="btn primary" onClick={buildSession}>开始</button>
                ) : (
                  <button className="btn primary" onClick={importWords} disabled={busy}>从文件导入生词</button>
                )}
                <button className="btn" onClick={() => setTab('library')}>打开生词库</button>
              </div>
            </div>
          ) : (
            <div className="spell-card vocab-card">
              <div className="spell-top">
                <span>第 {pos + 1} / {session.length} 个</span>
                <div className="spell-progress"><div style={{ width: `${(progress / Math.max(1, session.length)) * 100}%` }} /></div>
                <span>已背 {progress}</span>
                {cur.wrong ? <span className="tag-bank">不认识 {cur.wrong} 次</span> : null}
              </div>

              <div className={`vocab-ask ${phase === 'ask' ? 'ask' : ''}`}>
                <div className="vocab-ask-row">
                  <button className="spell-btn vocab-play" onClick={() => playWord(cur.word)} title="点一下听发音">
                    <IconVolume size={18} />
                  </button>
                  {phase === 'ask' ? (
                    <div className="vocab-peek">
                      <span className={`vocab-peek-text ${askShowDef ? '' : 'masked'}`}>
                        {(askDetail && ((askDetail.defs && askDetail.defs[0]) || askDetail.zh)) || '查词中…'}
                      </span>
                      <button
                        className="icon-btn peek-eye"
                        onClick={() => setAskShowDef((v) => !v)}
                        title={askShowDef ? '遮住释义' : '提示：先看一个中文意思'}
                      >
                        <IconEye size={13} />
                      </button>
                    </div>
                  ) : null}
                </div>
                {phase === 'ask' ? (
                  <>
                    <div className="vocab-ask-title">你认识这个单词吗？</div>
                    <div className="known-split">
                      <button className="known-half known" onClick={markKnown} title={`认识，去拼写（${keys.known}）`}>
                        认识
                      </button>
                      <button className="known-half unknown" onClick={() => openAnswer('unknown')} title={`不认识，直接看释义（${keys.unknown}）`}>
                        不认识
                      </button>
                    </div>
                  </>
                ) : null}
              </div>

              {phase === 'spell' ? (
                <>
                  <div className="vocab-spell-hint">
                    <div>听发音，把这个单词拼出来</div>
                    <div className="wrong-left">还可以再试 {Math.max(0, wrongLimit - attempts)} 次</div>
                  </div>
                  <div className="spell-input-row">
                    <input
                      ref={inputRef}
                      className="spell-input"
                      placeholder="输入你听到的单词…"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') submitSpell(); }}
                    />
                    <button className="btn primary" onClick={submitSpell} disabled={!input.trim()}>检查</button>
                  </div>
                </>
              ) : null}

              {phase === 'reveal' ? (
                <div className="spell-result">
                  {result && result.ok && (
                    <button className="easy-btn" onClick={deleteCurrent} title={`从生词库移除（${keys.tooEasy}）`}>
                      太简单了！
                    </button>
                  )}
                  <div className={`result-banner ${result && result.ok ? 'right' : 'wrong'}`}>
                    {result && result.ok ? <IconCheck size={16} /> : <IconClose size={16} />}
                    {result && result.ok
                      ? '拼写正确，记住它'
                      : (result && result.reason === 'unknown' ? '不认识没关系，看看怎么记' : '这个词还没拼对，看看怎么记')}
                  </div>

                  <div className="vocab-word">
                    <span className="vocab-main">{cur.word}</span>
                    {detail && detail.phonetic ? <span className="vocab-ph">{detail.phonetic}</span> : null}
                    <button className="icon-btn" onClick={() => playWord(cur.word)} title="再听一遍单词"><IconVolume size={14} /></button>
                  </div>

                  <div className="vocab-block">
                    <div className="vocab-label">词性 + 中文意思</div>
                    <div className="vocab-text">
                      {detail && detail.defs && detail.defs.length
                        ? detail.defs.slice(0, 2).map((x, i) => <div key={i}>{x}</div>)
                        : (detail && detail.zh ? detail.zh : (loadingDetail ? '查词典中…' : '（词典没查到，检查网络）'))}
                    </div>
                  </div>

                  {detail && detail.mnemonic && (
                    <div className="vocab-block">
                      <div className="vocab-label">联想记忆</div>
                      <div className="vocab-text">{detail.mnemonic}</div>
                    </div>
                  )}

                  {detail && detail.family && detail.family.length > 0 && (
                    <div className="vocab-block">
                      <div className="vocab-label">单词派生</div>
                      <div className="word-diff">
                        {detail.family.map((w) => <span className="word-chip ok" key={w}>{w}</span>)}
                      </div>
                    </div>
                  )}

                  {detail && detail.example && (
                    <div className="vocab-block">
                      <div className="vocab-label">例句</div>
                      <div className="vocab-text en">
                        {detail.example}
                        <button className="icon-btn inline-audio" onClick={() => playExample(detail.example)} title="播放例句">
                          <IconPlay size={11} />
                        </button>
                      </div>
                      {detail.exampleZh ? <div className="vocab-sub">{detail.exampleZh}</div> : null}
                    </div>
                  )}

                  {detail && detail.sentence && (
                    <div className="vocab-block">
                      <div className="vocab-label">导入原文</div>
                      <div className="vocab-text en">{detail.sentence}</div>
                      {detail.senZh ? <div className="vocab-sub">{detail.senZh}</div> : null}
                    </div>
                  )}

                  <div className="spell-foot">
                    <button
                      className="btn sm"
                      onClick={() => { setPhase('spell'); setInput(''); setTimeout(() => inputRef.current && inputRef.current.focus(), 30); }}
                      title={`重写一遍（${keys.rewrite}）`}
                    >
                      重写一遍
                    </button>
                    <button className="btn primary sm" onClick={nextWord}>
                      {pos + 1 >= session.length ? '完成' : '下一个'} <IconNext size={12} />
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="vocab-bar vocab-bar-lib">
            <div className="vocab-search">
              <IconSearch size={12} />
              <input
                placeholder="搜索生词"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              />
            </div>
            <select className="mini-select" value={libKind} onChange={(e) => { setLibKind(e.target.value); setPage(1); }}>
              <option value="all">全部内容</option>
              <option value="word">全单词</option>
              <option value="phrase">全短语</option>
            </select>
            <select className="mini-select" value={libSort} onChange={(e) => { setLibSort(e.target.value); setPage(1); }}>
              {LIB_SORTS.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
            </select>
            <div className="seg-tabs">
              <button className={`seg-tab ${mask === 'word' ? 'active' : ''}`} onClick={() => setMask('word')}>遮挡单词</button>
              <button className={`seg-tab ${mask === 'meaning' ? 'active' : ''}`} onClick={() => setMask('meaning')}>遮挡释义</button>
              <button className={`seg-tab ${mask === 'none' ? 'active' : ''}`} onClick={() => setMask('none')}>不遮挡</button>
            </div>
            <button className="btn sm" onClick={removeSelected} disabled={!selected.length}>
              <IconTrash size={12} /> 删除 {selected.length ? `(${selected.length})` : ''}
            </button>
          </div>

          <div className="bank-table">
            <div className="bank-row bank-head" style={{ gridTemplateColumns: cols.map((c) => `${c}px`).join(' ') }}>
              <span className="bank-check">
                <input type="checkbox" checked={pageWords().length > 0 && pageWords().every((w) => selected.includes(w))} onChange={toggleAllOnPage} />
              </span>
              {['单词', '音标', '词性 / 中文意思', '熟悉度', '加入时间'].map((label, idx) => (
                <span className="bank-th" key={label}>
                  {label}
                  {idx < 4 && (
                    <span className="col-resize" onMouseDown={(e) => startResize(idx + 1, e)} title="拖动调整列宽" />
                  )}
                </span>
              ))}
            </div>

            {libList.slice((page - 1) * pageSize, page * pageSize).map((w) => {
              const d = libWordDetailOf(libDetails, w.word);
              const showWord = mask !== 'word' || revealed[w.word];
              const showMeaning = mask !== 'meaning' || revealed[w.word];
              const full = d && d.defs && d.defs.length
                ? d.defs.slice(0, 2).join('；')
                : (w.zh || (d && d.zh) || '—');
              const long = full && full.length > 34;
              return (
                <div className="bank-row" key={w.word} style={{ gridTemplateColumns: cols.map((c) => `${c}px`).join(' ') }}>
                  <span className="bank-check">
                    <input type="checkbox" checked={selected.includes(w.word)} onChange={() => toggleSelect(w.word)} />
                  </span>
                  <div
                    className={`bank-word ${showWord ? '' : 'masked'}`}
                    title={showWord ? '点击发音' : '点击显示单词'}
                    onClick={() => {
                      if (!showWord) setRevealed((m) => ({ ...m, [w.word]: true }));
                      else playWord(w.word);
                    }}
                  >
                    {w.word}
                  </div>
                  <div className={`bank-ph ${showWord ? '' : 'masked'}`} onClick={() => setRevealed((m) => ({ ...m, [w.word]: true }))}>
                    {d && d.phonetic ? d.phonetic : '—'}
                  </div>
                  <div
                    className={`bank-zh-cell ${showMeaning ? '' : 'masked'}`}
                    onMouseEnter={() => setZhTip(w.word)}
                    onMouseLeave={() => setZhTip('')}
                    onClick={() => setRevealed((m) => ({ ...m, [w.word]: true }))}
                  >
                    <div className="bank-zh">{full}</div>
                    {long ? <button className="zh-more" title="展开完整释义" onClick={(e) => { e.stopPropagation(); setZhTip(w.word); }}>…</button> : null}
                    {showMeaning && zhTip === w.word && long ? (
                      <div className="bank-zh-pop">{full}</div>
                    ) : null}
                  </div>
                  <div className="bank-fam">
                    <span className="tag-warn">不认识 {w.wrong || 0}</span>
                    <span className="tag-bank">看过 {w.peek || 0}</span>
                  </div>
                  <div className="bank-added">{(w.createdAt || '').slice(0, 10) || '—'}</div>
                </div>
              );
            })}
            {!libList.length && (
              <div className="bank-empty">
                {search ? '没有匹配的生词' : '生词本还是空的，先导入一些单词吧！'}
              </div>
            )}
          </div>

          {allWordsMode ? (
            <div className="pager">
              <span>共 {libList.length} 词 · 全部显示，滚轮往下浏览</span>
            </div>
          ) : (
            <div className="pager">
              <button className="btn sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>上一页</button>
              <span>{page} / {pageCount} 页 · 共 {libList.length} 词</span>
              <button className="btn sm" disabled={page >= pageCount} onClick={() => setPage(page + 1)}>下一页</button>
              <span className="hint-inline">每页 {pageSize} 词（设置里可改）</span>
            </div>
          )}
        </>
      )}

      {exportOpen && (
        <div className="modal-mask" onClick={() => setExportOpen(false)}>
          <div className="modal export-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">导出设置</div>
            <div className="export-row">
              <div className="export-label">导出格式</div>
              <div className="export-choices">
                <button className={`choice ${exportFormat === 'csv' ? 'on' : ''}`} onClick={() => setExportFormat('csv')}>CSV</button>
                <button className={`choice ${exportFormat === 'txt' ? 'on' : ''}`} onClick={() => setExportFormat('txt')}>TXT</button>
              </div>
            </div>
            <div className="export-row export-path-row">
              <div className="export-label">导出路径</div>
              <div className="export-path">
                <input
                  className="export-path-input"
                  value={exportPath}
                  placeholder="选择或直接输入导出目录"
                  onChange={(e) => { setExportPath(e.target.value); setExportError(''); }}
                />
                <button className="btn sm" onClick={pickExportDir}>选择目录</button>
              </div>
            </div>
            <div className="export-row">
              <div className="export-label">导出项</div>
              <div className="export-checks">
                <label className="ck"><input type="checkbox" checked disabled /> 英文单词（必选）</label>
                <label className="ck"><input type="checkbox" checked={exportPhonetic} onChange={(e) => setExportPhonetic(e.target.checked)} /> 音标</label>
                <label className="ck"><input type="checkbox" checked={exportMeaning} onChange={(e) => setExportMeaning(e.target.checked)} /> 中文意思</label>
              </div>
            </div>
            <div className="export-tip">共 {libList.length} 个单词。文件名自动生成：生词本-日期.{exportFormat === 'txt' ? 'txt' : 'csv'}。音标和中文缺失时会在导出前自动补齐。</div>
            {exportError ? <div className="export-error">{exportError}</div> : null}
            <div className="modal-foot">
              <button className="btn" onClick={startExport} title="关闭弹窗，导出放到后台继续，不影响其他操作">后台导出</button>
              <button className="btn" onClick={() => setExportOpen(false)}>取消</button>
              <button className="btn primary" onClick={startExport} disabled={exportTask.running}>导出</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function libWordDetailOf(map, word) {
  return map[word] || null;
}
