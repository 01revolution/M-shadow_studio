import React, { useEffect, useRef, useState } from 'react';
import { useStore } from '../store.js';
import { IconPlus, IconLink, IconTrash, IconText, IconSearch } from './Icons.jsx';
import { fmtTime } from '../lib/utils.js';

const TYPE_LABEL = { text: 'TXT', pdf: 'PDF', docx: 'DOC', audio: 'MP3', video: 'MP4', url: 'URL', subtitle: 'SRT' };

export default function Sidebar() {
  const docs = useStore((s) => s.docs);
  const activeId = useStore((s) => s.activeId);
  const selectDoc = useStore((s) => s.selectDoc);
  const removeDoc = useStore((s) => s.removeDoc);
  const pickAndImport = useStore((s) => s.pickAndImport);
  const reorderDocs = useStore((s) => s.reorderDocs);
  const importUrl = useStore((s) => s.importUrl);
  const importText = useStore((s) => s.importText);
  const renameDoc = useStore((s) => s.renameDoc);
  const togglePinDoc = useStore((s) => s.togglePinDoc);
  const settings = useStore((s) => s.settings);
  const busy = useStore((s) => s.busy);
  const tasks = useStore((s) => s.tasks);
  const [url, setUrl] = useState('');
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [pasteTitle, setPasteTitle] = useState('');
  const [pasting, setPasting] = useState(false);
  const pasteRef = useRef(null);
  const [query, setQuery] = useState('');
  const [ctx, setCtx] = useState(null);
  const [dragId, setDragId] = useState(null);
  const [overId, setOverId] = useState(null);
  const [renameId, setRenameId] = useState(null);
  const [renameText, setRenameText] = useState('');

  useEffect(() => {
    if (!pasteOpen) return;
    setPasteText('');
    setPasteTitle('');
    setPasting(false);
    // 刚删完素材时渲染可能还没稳定，多试几次聚焦，避免“点开却打不了字”
    const timers = [0, 80, 260, 600].map((ms) => setTimeout(() => {
      try { pasteRef.current && pasteRef.current.focus(); } catch (_) {}
    }, ms));
    return () => timers.forEach(clearTimeout);
  }, [pasteOpen]);

  async function confirmPaste() {
    if (!pasteText.trim() || pasting) return;
    setPasting(true);
    const ok = await importText(pasteText, pasteTitle.trim());
    setPasting(false);
    if (ok) setPasteOpen(false);
  }

  const pinned = (settings && settings.pinnedDocs) || [];
  const q = query.trim().toLowerCase();
  const shownDocs = docs
    .filter((d) => !q || String(d.title || '').toLowerCase().includes(q))
    .sort((a, b) => {
      const ra = pinned.indexOf(a.id), rb = pinned.indexOf(b.id);
      if (ra >= 0 && rb >= 0) return ra - rb;
      if (ra >= 0) return -1;
      if (rb >= 0) return 1;
      return docs.findIndex((d) => d.id === a.id) - docs.findIndex((d) => d.id === b.id);
    });
  const shownTasks = tasks.filter((t) => !q || String(t.title || '').toLowerCase().includes(q));

  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <div className="import-row">
          <button className="btn primary" disabled={busy} onClick={pickAndImport}>
            <IconPlus size={14} /> 导入文件
          </button>
          <button className="btn" onClick={() => setPasteOpen(true)} title="直接粘贴一段英文">
            <IconText size={14} /> 粘贴文本
          </button>
        </div>
        <div className="url-box">
          <input
            placeholder="粘贴视频链接（B站/YouTube）"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && url.trim()) { importUrl(url.trim()); setUrl(''); }
            }}
          />
          <button
            className="btn"
            disabled={busy || !url.trim()}
            title="从链接导入"
            onClick={() => { importUrl(url.trim()); setUrl(''); }}
          >
            <IconLink size={14} />
          </button>
        </div>
      </div>

      <div className="lib-search">
        <IconSearch size={13} />
        <input
          value={query}
          placeholder="搜索文章名…"
          onChange={(e) => setQuery(e.target.value)}
        />
        {query ? <button className="lib-search-clear" onClick={() => setQuery('')} title="清空">×</button> : null}
      </div>

      <div className="lib-list">
        {shownTasks.map((t) => (
          <div key={t.id} className="lib-item importing" title="正在后台导入，可以先去做别的">
            <div className="lib-icon">{t.kind === 'text' ? 'TXT' : t.kind === 'file' ? 'FILE' : (t.url && /bilibili|b23/i.test(t.url) ? 'B站' : 'URL')}</div>
            <div className="lib-main">
              <div className="lib-title">{t.title}</div>
              <div className="lib-meta">{t.phase || '导入中…'} · {Math.round(t.percent || 0)}%</div>
              <div className="lib-progress"><i style={{ width: `${Math.max(3, Math.min(100, t.percent || 0))}%` }} /></div>
            </div>
          </div>
        ))}
        {shownDocs.length === 0 && shownTasks.length === 0 && (
          <div style={{ padding: '24px 10px', fontSize: 12, color: 'var(--ink-3)', lineHeight: 1.7 }}>
            {docs.length ? '没有匹配的文章。' : '还没有素材。点「导入文件」选 TXT / PDF / Word / MP3 / MP4，或点「粘贴文本」直接把文章贴进来。'}
          </div>
        )}
        {shownDocs.map((d) => {
          const isPinned = pinned.includes(d.id);
          const baseIdx = docs.findIndex((x) => x.id === d.id);
          return (
            <div
              key={d.id}
              className={`lib-item ${d.id === activeId ? 'active' : ''} ${dragId === d.id ? 'dragging' : ''} ${overId === d.id && dragId !== d.id ? 'drop-target' : ''}`}
              draggable={!isPinned}
              title="右键可改名 / 置顶 / 删除"
              onContextMenu={(e) => {
                e.preventDefault();
                setCtx({ id: d.id, x: Math.min(e.clientX, window.innerWidth - 150), y: Math.min(e.clientY, window.innerHeight - 130) });
              }}
              onDragStart={(e) => {
                if (isPinned) return;
                setDragId(d.id);
                e.dataTransfer.effectAllowed = 'move';
                try { e.dataTransfer.setData('text/plain', d.id); } catch (_) {}
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (overId !== d.id) setOverId(d.id);
              }}
              onDragLeave={() => { if (overId === d.id) setOverId(null); }}
              onDrop={(e) => {
                e.preventDefault();
                const fromId = dragId || e.dataTransfer.getData('text/plain');
                const from = docs.findIndex((x) => x.id === fromId);
                const to = docs.findIndex((x) => x.id === d.id);
                if (from >= 0 && to >= 0 && from !== to) reorderDocs(from, to);
                setDragId(null); setOverId(null);
              }}
              onDragEnd={() => { setDragId(null); setOverId(null); }}
              onClick={() => selectDoc(d.id)}
            >
              <div className="lib-icon">{TYPE_LABEL[d.sourceType] || 'FILE'}</div>
              <div className="lib-main">
                <div className="lib-title">
                  {isPinned ? <span className="lib-pin">置顶</span> : null}{d.title}
                </div>
                <div className="lib-meta">
                  {d.segments ? `${d.segments.length} 句` : ''}
                  {d.duration ? ` · ${fmtTime(d.duration)}` : ''}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {ctx && (() => {
        const d = docs.find((x) => x.id === ctx.id);
        if (!d) return null;
        const isPinned = pinned.includes(d.id);
        return (
          <>
            <div className="menu-mask" onClick={() => setCtx(null)} />
            <div className="lib-menu" style={{ left: ctx.x, top: ctx.y }}>
              <button onClick={() => { setRenameId(d.id); setRenameText(d.title); setCtx(null); }}>改名</button>
              <button onClick={() => { togglePinDoc(d.id); setCtx(null); }}>{isPinned ? '取消置顶' : '置顶'}</button>
              <button className="danger" onClick={() => { setCtx(null); if (confirm(`确定删除「${d.title}」吗？`)) removeDoc(d.id); }}>删除</button>
            </div>
          </>
        );
      })()}

      {renameId && (
        <div className="modal-mask" onClick={() => setRenameId(null)}>
          <div className="modal rename-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">修改文章名</div>
            <input
              className="rename-input"
              autoFocus
              value={renameText}
              onChange={(e) => setRenameText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && renameText.trim()) { renameDoc(renameId, renameText).then(() => setRenameId(null)); }
              }}
            />
            <div className="modal-foot">
              <button className="btn" onClick={() => setRenameId(null)}>取消</button>
              <button
                className="btn primary"
                disabled={!renameText.trim()}
                onClick={() => renameDoc(renameId, renameText).then(() => setRenameId(null))}
              >保存</button>
            </div>
          </div>
        </div>
      )}

      {pasteOpen && (
        <div className="modal-mask" onClick={() => setPasteOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">粘贴英文文本</div>
            <div className="modal-hint">
              把文章、课文、台词直接贴进来，换行和段落会自动处理，系统会帮你切句、翻译、配音。
            </div>
            <input
              className="modal-title-input"
              placeholder="标题（可留空，默认取开头几个词）"
              value={pasteTitle}
              onChange={(e) => setPasteTitle(e.target.value)}
            />
            <textarea
              ref={pasteRef}
              className="modal-textarea"
              placeholder="在这里粘贴英文内容…"
              value={pasteText}
              spellCheck={false}
              autoFocus
              onChange={(e) => setPasteText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) confirmPaste();
              }}
            />
            <div className="modal-foot">
              <span className="modal-tip">{pasteText.trim() ? `${pasteText.trim().split(/\s+/).length} 个词` : ''} · Ctrl+Enter 快速导入</span>
              <button className="btn" onClick={() => setPasteOpen(false)}>取消</button>
              <button className="btn primary" disabled={pasting || !pasteText.trim()} onClick={confirmPaste}>
                {pasting ? '导入中…' : '导入'}
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
