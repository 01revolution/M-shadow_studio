import React, { useEffect, useRef, useState } from 'react';
import { useStore } from '../store.js';
import SentenceRow from './SentenceRow.jsx';
import PlayerPanel from './PlayerPanel.jsx';
import { playSeg } from '../lib/playActions.js';
import { IconSpark, IconDownload, IconVolume, IconClose } from './Icons.jsx';
import { fmtTime } from '../lib/utils.js';
import * as player from '../lib/player.js';

const MODES = [
  { key: 'both', label: '中英' },
  { key: 'en', label: '英文' },
  { key: 'zh', label: '中文' },
  { key: 'blur', label: '模糊' },
];

const EXPORT_OPTIONS = [
  { key: 'tts', label: '配音 MP3' },
  { key: 'record', label: '跟读录音 MP3' },
  { key: 'both', label: '配音+跟读' },
  { key: 'srt', label: 'SRT 字幕' },
];

export default function StudyView() {
  const doc = useStore((s) => s.doc);
  const currentIdx = useStore((s) => s.currentIdx);
  const setCurrentIdx = useStore((s) => s.setCurrentIdx);
  const requestShadow = useStore((s) => s.requestShadow);
  const displayMode = useStore((s) => s.displayMode);
  const setDisplayMode = useStore((s) => s.setDisplayMode);
  const translateDoc = useStore((s) => s.translateDoc);
  const exportMp3 = useStore((s) => s.exportMp3);
  const exportSub = useStore((s) => s.exportSub);
  const busy = useStore((s) => s.busy);
  const [exportKind, setExportKind] = useState('tts');
  const listRef = useRef(null);
  const [wordPop, setWordPop] = useState(null); // {word,x,y,loading,detail,added}
  const popRef = useRef(null);
  const settings = useStore((s) => s.settings);
  const notify = useStore((s) => s.notify);
  const refreshDoc = useStore((s) => s.refreshDoc);
  const [segMenu, setSegMenu] = useState(null);
  const [inlineEdit, setInlineEdit] = useState(null);
  const [splitModal, setSplitModal] = useState(null);
  const [mergeModal, setMergeModal] = useState(null);

  useEffect(() => {
    setInlineEdit(null); setSplitModal(null); setMergeModal(null); setSegMenu(null);
  }, [doc && doc.id]);



  async function persistSegments(next, { retranslate = true } = {}) {
    const live = useStore.getState().doc;
    if (!live) return;
    const fixed = next.map((x, i) => ({ ...x, idx: i }));
    await window.api.updateDoc(live.id, { segments: fixed });
    await refreshDoc(live.id);
    const nextIdx = Math.min(useStore.getState().currentIdx, Math.max(0, fixed.length - 1));
    useStore.setState({ currentIdx: nextIdx });
    if (retranslate) {
      // 改过文字的句子清空译文/配音，后台补齐，不阻塞继续使用
      window.api.translateDoc(live.id, 'missing', true)
        .then(() => window.api.ttsDoc(live.id, true, true))
        .then(() => refreshDoc(live.id))
        .catch(() => {});
    }
  }

  function startInlineEdit(i) {
    const seg = useStore.getState().doc.segments[i];
    setInlineEdit({ idx: i, text: seg.text });
    setSegMenu(null);
    setCurrentIdx(i);
  }

  async function saveInlineEdit() {
    if (!inlineEdit) return;
    const text = String(inlineEdit.text || '').trim();
    if (!text) return;
    const segs = useStore.getState().doc.segments.map((x) => ({ ...x }));
    const seg = segs[inlineEdit.idx];
    if (seg && seg.text !== text) {
      Object.assign(seg, { text, zh: '', ttsFile: '', ttsKey: '', ttsVoice: '', ttsDuration: 0, lastScore: 0, bestScore: 0, recordings: [] });
    }
    setInlineEdit(null);
    await persistSegments(segs);
    notify('句子已更新，译文与配音在后台补齐', 'success');
  }

  function openSplit(i) {
    const seg = useStore.getState().doc.segments[i];
    const words = String(seg.text).trim().split(/\s+/);
    if (words.length < 2) { notify('这句话太短，无法拆分', 'error'); return; }
    setSplitModal({ idx: i, splitAt: smartSplitAt(words) });
    setSegMenu(null);
  }

  function smartSplitAt(words) {
    const conj = new Set(['and','but','or','so','because','although','though','while','when','if','unless','since','as','that','which','who','whom','whose','where','before','after','until','whereas','yet','for']);
    const prep = new Set(['in','on','at','to','for','with','without','by','from','about','of','into','over','under','between','among','during','against','toward','towards','upon','within','through','across','behind','beside','beyond','despite']);
    const badEnd = new Set(['a','an','the','this','that','these','those','my','your','his','her','its','our','their','to','of','and','but','or','with','in','on','at','for','by','from']);
    const n = words.length;
    const mid = n / 2;
    let best = Math.max(1, Math.min(n - 1, Math.round(mid)));
    let bestScore = 999;
    for (let pos = 1; pos < n; pos++) {
      let score = Math.abs(pos - mid);
      if (/[,;:，；：—–-]$/.test(words[pos - 1])) score -= 4;
      const nxt = words[pos].replace(/[^A-Za-z']/g, '').toLowerCase();
      if (conj.has(nxt)) score -= 3;
      if (prep.has(nxt)) score -= 1.5;
      const prev = words[pos - 1].replace(/[^A-Za-z']/g, '').toLowerCase();
      if (badEnd.has(prev)) score += 2;
      if (score < bestScore) { bestScore = score; best = pos; }
    }
    return best;
  }

  async function applySplit(auto) {
    if (!splitModal) return;
    const segs = [...useStore.getState().doc.segments];
    const seg = segs[splitModal.idx];
    if (!seg) return;
    const words = String(seg.text).trim().split(/\s+/);
    let at = auto ? smartSplitAt(words) : splitModal.splitAt;
    if (at <= 0 || at >= words.length) { notify('请选择句子中间的位置切开', 'error'); return; }
    const t1 = words.slice(0, at).join(' ').replace(/[,;:，；：—–-]+$/g, '').trim();
    const t2 = words.slice(at).join(' ').trim();
    const start = seg.start || 0;
    const end = seg.end || start + 2;
    const mid = Math.round((start + (end - start) * (at / words.length)) * 100) / 100;
    const a = { ...seg, text: t1, zh: '', ttsFile: '', ttsKey: '', ttsVoice: '', ttsDuration: 0, lastScore: 0, bestScore: 0, recordings: [], start, end: mid };
    const b = { ...seg, id: seg.id + 'x' + Date.now().toString(36), text: t2, zh: '', ttsFile: '', ttsKey: '', ttsVoice: '', ttsDuration: 0, lastScore: 0, bestScore: 0, recordings: [], start: mid, end };
    segs.splice(splitModal.idx, 1, a, b);
    setSplitModal(null);
    await persistSegments(segs);
    notify('已拆成两句，译文与配音在后台补齐', 'success');
  }

  function openMerge(i) {
    const segs = useStore.getState().doc.segments;
    if (i >= segs.length - 1) { notify('后面已经没有句子可以合并', 'error'); return; }
    setMergeModal({ idx: i, count: 1 });
    setSegMenu(null);
  }

  function toggleMergeCount(j) {
    setMergeModal((m) => {
      if (!m) return m;
      const next = j === m.count ? j - 1 : j;
      return { ...m, count: Math.max(0, next) };
    });
  }

  async function applyMerge() {
    if (!mergeModal || mergeModal.count < 1) return;
    const segs = [...useStore.getState().doc.segments];
    const seg = segs[mergeModal.idx];
    if (!seg) return;
    const parts = segs.slice(mergeModal.idx, mergeModal.idx + mergeModal.count + 1);
    const text = parts.map((x) => x.text).join(' ').replace(/\s+/g, ' ').trim();
    const merged = { ...seg, text, end: parts[parts.length - 1].end, zh: '', ttsFile: '', ttsKey: '', ttsVoice: '', ttsDuration: 0, lastScore: 0, bestScore: 0, recordings: [] };
    segs.splice(mergeModal.idx, parts.length, merged);
    setMergeModal(null);
    await persistSegments(segs);
    notify(`已合并 ${parts.length} 句，译文与配音在后台补齐`, 'success');
  }

  async function deleteSeg(i) {
    const segs = useStore.getState().doc.segments.filter((_, k) => k !== i);
    setSegMenu(null);
    await persistSegments(segs, { retranslate: false });
    notify('已删除这一句', 'success');
  }

  // 双击句子里的单词 → 查中文并浮出小卡片
  useEffect(() => {
    if (!wordPop || wordPop.detail || wordPop.loading === 'done') return;
    let alive = true;
    window.api.vocabDefine({ word: wordPop.word, phrase: !!wordPop.phrase }).then((d) => {
      if (alive) setWordPop((p) => (p && p.word === wordPop.word ? { ...p, detail: d, loading: 'done' } : p));
    }).catch(() => {
      if (alive) setWordPop((p) => (p && p.word === wordPop.word ? { ...p, detail: null, loading: 'done' } : p));
    });
    return () => { alive = false; };
  }, [wordPop && wordPop.word]);

  useEffect(() => {
    if (!wordPop) return;
    const onDown = (e) => { if (popRef.current && !popRef.current.contains(e.target)) setWordPop(null); };
    setTimeout(() => document.addEventListener('mousedown', onDown), 0);
    return () => document.removeEventListener('mousedown', onDown);
  }, [wordPop]);

  function openWordPop(word, x, y, phrase = false) {
    setWordPop({ word: word.toLowerCase(), phrase: !!phrase, x: Math.min(x, window.innerWidth - 380), y: Math.min(y + 14, Math.max(8, window.innerHeight - 300)), loading: true });
  }

  async function addPopWord() {
    if (!wordPop) return;
    try {
      await window.api.vocabAdd({ word: wordPop.word, reason: 'manual', sentence: '', senZh: '' });
      setWordPop((p) => ({ ...p, added: true }));
      notify(`「${wordPop.word}」已加入生词库`, 'success');
    } catch (_) { notify('加入生词库失败', 'error'); }
  }

  async function speakPopWord() {
    if (!wordPop) return;
    const s = useStore.getState().settings || {};
    const voice = s.voice === 'original' ? (s.lastVoice || 'en-GB-SoniaNeural') : (s.voice || 'en-GB-SoniaNeural');
    try {
      const r = await window.api.ttsOne({ text: wordPop.word, voice, rate: s.rate || 1 });
      player.play({ src: window.api.mediaUrl(r.file) });
    } catch (_) {}
  }

  // 键盘：空格播放当前句，上下切换
  useEffect(() => {
    function onKey(e) {
      const tag = (e.target && e.target.tagName) || '';
      if (/INPUT|TEXTAREA|SELECT/.test(tag) || e.target?.isContentEditable) return;
      if (!doc) return;
      if (e.code === 'Space') {
        e.preventDefault();
        playSeg(currentIdx, { rate: useStore.getState().settings.rate });
      } else if (e.code === 'ArrowDown') {
        e.preventDefault();
        if (currentIdx < doc.segments.length - 1) setCurrentIdx(currentIdx + 1);
      } else if (e.code === 'ArrowUp') {
        e.preventDefault();
        if (currentIdx > 0) setCurrentIdx(currentIdx - 1);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [doc, currentIdx, setCurrentIdx]);

  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector('.sentence-row.active');
    if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [currentIdx]);

  if (!doc) {
    return (
      <div className="empty">
        <div className="empty-title">开始你的第一篇影子跟读</div>
        <div className="empty-hint">
          1. 左侧「导入文件」选一段英语文本 / 音频 / 视频，或者点「粘贴文本」把文章直接贴进来<br />
          2. 系统自动切句、翻译、生成配音（英音美音都能选）<br />
          3. 逐句精听，点麦克风跟读打分，最后导出 MP3 随身听
        </div>
      </div>
    );
  }

  const segs = doc.segments || [];
  const scored = segs.filter((s) => s.bestScore).length;
  const avg = scored ? Math.round(segs.reduce((a, s) => a + (s.bestScore || 0), 0) / Math.max(1, scored)) : 0;

  function doExport() {
    if (exportKind === 'srt') exportSub('srt');
    else exportMp3(exportKind);
  }

  return (
    <div className="study">
      <div className="study-main">
        <div className="toolbar">
          <div className="doc-head">
            <div className="doc-title" title={doc.title}>{doc.title}</div>
            <div className="doc-meta">
              <span>{segs.length} 句</span>
              {doc.duration ? <span>{fmtTime(doc.duration)}</span> : null}
              {scored ? <span>均分 {avg}</span> : null}
            </div>
          </div>

          <div className="toolbar-actions">
            <div className="mode-switch" title="切换句子显示方式">
              {MODES.map((m) => (
                <button
                  key={m.key}
                  className={`mode-btn ${displayMode === m.key ? 'on' : ''}`}
                  onClick={() => setDisplayMode(m.key)}
                >
                  {m.label}
                </button>
              ))}
            </div>
            {segs.some((s) => !s.zh) && (
              <button className="btn sm" disabled={busy} onClick={() => translateDoc('missing')} title="翻译还没翻译的句子">
                <IconSpark size={12} /> 补翻译
              </button>
            )}
            <select className="mini-select" value={exportKind} onChange={(e) => setExportKind(e.target.value)}>
              {EXPORT_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
            <button className="btn sm" disabled={busy} onClick={doExport}>
              <IconDownload size={12} /> 导出
            </button>
          </div>
        </div>

        <div className="sentence-list" ref={listRef}>
          {segs.map((seg, i) => (
            <SentenceRow
              key={seg.id}
              seg={seg}
              idx={i}
              active={i === currentIdx}
              mode={displayMode}
              onSelect={(k) => setCurrentIdx(k)}
              onPlay={(k) => { setCurrentIdx(k); playSeg(k); }}
              onShadow={(k) => requestShadow(k)}
              onReplay={(rec) => player.play({ src: window.api.mediaUrl(rec.wavPath) })}
              onWord={(w, x, y, _seg, opt) => openWordPop(w, x, y, !!(opt && opt.phrase))}
              editing={inlineEdit && inlineEdit.idx === i}
              editText={inlineEdit ? inlineEdit.text : ''}
              onEditText={(v) => setInlineEdit((e) => (e ? { ...e, text: v } : e))}
              onEditSave={saveInlineEdit}
              onEditCancel={() => setInlineEdit(null)}
              onMenu={(i, el) => {
                const r = el.getBoundingClientRect();
                setSegMenu({ idx: i, x: Math.min(r.left - 130, window.innerWidth - 160), y: r.top + 20 });
              }}
            />
          ))}
          {segs.length === 0 && (
            <div className="empty">
              <div className="empty-title">没有解析到英文句子</div>
              <div className="empty-hint">这个素材里可能没有英文内容，换一个文件试试。</div>
            </div>
          )}
        </div>
      </div>

      <PlayerPanel />

      {segMenu && (
        <>
          <div className="menu-mask" onClick={() => setSegMenu(null)} />
          <div className="seg-menu" style={{ left: Math.max(8, segMenu.x), top: segMenu.y }}>
            <button onClick={() => startInlineEdit(segMenu.idx)}>编辑</button>
            <button onClick={() => openSplit(segMenu.idx)}>拆分</button>
            <button onClick={() => openMerge(segMenu.idx)}>合并</button>
            <button className="danger" onClick={() => deleteSeg(segMenu.idx)}>删除</button>
          </div>
        </>
      )}

      {splitModal && (() => {
        const seg = useStore.getState().doc.segments[splitModal.idx];
        const words = String(seg.text).trim().split(/\s+/);
        const a = words.slice(0, splitModal.splitAt).join(' ');
        const b = words.slice(splitModal.splitAt).join(' ');
        return (
          <div className="modal-mask" onClick={() => setSplitModal(null)}>
            <div className="modal split-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-title">拆分第 {splitModal.idx + 1} 句</div>
              <div className="modal-hint">点一下某个词，表示在这个词后面切开；也可以直接一键从中间拆。</div>
              <div className="split-words">
                {words.map((w, k) => (
                  <button
                    key={k}
                    className={`split-chip ${k + 1 === splitModal.splitAt ? 'cut' : ''}`}
                    onClick={() => setSplitModal((m) => ({ ...m, splitAt: k + 1 }))}
                  >{w}</button>
                ))}
              </div>
              <div className="split-preview">
                <div><span>前一句</span>{a || '（空）'}</div>
                <div><span>后一句</span>{b || '（空）'}</div>
              </div>
              <div className="modal-foot">
                <button className="btn" onClick={() => setSplitModal(null)}>取消</button>
                <button className="btn" onClick={() => applySplit(true)}>一键拆分</button>
                <button className="btn primary" onClick={() => applySplit(false)}>按选中位置拆分</button>
              </div>
            </div>
          </div>
        );
      })()}

      {mergeModal && (() => {
        const segs = useStore.getState().doc.segments;
        const max = Math.min(5, segs.length - mergeModal.idx - 1);
        return (
          <div className="modal-mask" onClick={() => setMergeModal(null)}>
            <div className="modal merge-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-title">合并第 {mergeModal.idx + 1} 句</div>
              <div className="modal-hint">默认勾选下一句；继续往后勾会连同中间的句子一起合并。</div>
              <div className="merge-list">
                {Array.from({ length: max }, (_, k) => {
                  const j = k + 1;
                  const cand = segs[mergeModal.idx + j];
                  return (
                    <button key={j} className={`merge-item ${j <= mergeModal.count ? 'on' : ''}`} onClick={() => toggleMergeCount(j)}>
                      <span className="merge-check">{j <= mergeModal.count ? '✓' : ''}</span>
                      <span className="merge-idx">{mergeModal.idx + j + 1}</span>
                      <span className="merge-text">{cand.text}</span>
                    </button>
                  );
                })}
              </div>
              <div className="modal-foot">
                <button className="btn" onClick={() => setMergeModal(null)}>取消</button>
                <button className="btn primary" disabled={mergeModal.count < 1} onClick={applyMerge}>
                  合并 {mergeModal.count + 1} 句
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {wordPop && (
        <div className="word-pop" ref={popRef} style={{ left: wordPop.x, top: wordPop.y }}>
          <div className="word-pop-head">
            <b>{wordPop.word}</b>
            {wordPop.detail && wordPop.detail.phonetic ? <span className="word-pop-ph">{wordPop.detail.phonetic}</span> : null}
            <button className="icon-btn" title="发音" onClick={speakPopWord}><IconVolume size={13} /></button>
            <button className="word-pop-add" onClick={addPopWord} disabled={wordPop.added}>
              {wordPop.added ? '已加入' : '加入生词库'}
            </button>
            <button className="icon-btn" title="关闭" onClick={() => setWordPop(null)}><IconClose size={13} /></button>
          </div>
          <div className="word-pop-body">
            {!wordPop.detail ? '查词中…' : (wordPop.detail.zh || (wordPop.detail.defs || [])[0] || '没查到释义')}
          </div>
        </div>
      )}
    </div>
  );
}
