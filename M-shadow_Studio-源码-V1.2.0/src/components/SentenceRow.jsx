import React from 'react';
import { IconPlay, IconMic, IconHeadphone } from './Icons.jsx';
import { fmtTime, scoreColor } from '../lib/utils.js';

/**
 * 四种显示模式：
 *   both 中英对照 / en 只看英文 / zh 只看中文 / blur 模糊（练纯听力）
 *
 * 一行句子右侧固定四个位置：评分 · 播放 · 跟读 · 回放我的录音。
 * 模糊模式下只有鼠标移到「左边文字区」才临时变清晰，移到右侧按钮区不变。
 */
export default function SentenceRow({ seg, idx, active, mode = 'both', onSelect, onPlay, onShadow, onReplay, onWord, onMenu, editing = false, editText = '', onEditText, onEditSave, onEditCancel }) {
  const score = seg.bestScore || seg.lastScore;
  const badgeClass = score >= 85 ? 'great' : score >= 70 ? 'mid' : 'low';
  const showEn = mode !== 'zh';
  const showZh = (mode === 'both' || mode === 'zh') && !!seg.zh;
  const lastRec = seg.recordings && seg.recordings.length ? seg.recordings[seg.recordings.length - 1] : null;

  return (
    <div className={`sentence-row ${active ? 'active' : ''}`}>
      <div className="row-tap" onClick={() => onSelect(idx)}>
        <div className="row-idx">{idx + 1}</div>
        <div className="row-main">
          {editing && (
            <div className="row-editing" onClick={(e) => e.stopPropagation()}>
              <textarea
                className="row-edit-input"
                autoFocus
                spellCheck={false}
                value={editText}
                onChange={(e) => onEditText && onEditText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') onEditCancel && onEditCancel();
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onEditSave && onEditSave(); }
                }}
              />
              <div className="row-edit-actions">
                <span className="row-edit-hint">可直接改词、删词，Enter 保存 · Esc 取消</span>
                <button className="btn sm" onClick={onEditCancel}>取消</button>
                <button className="btn sm primary" onClick={onEditSave}>保存</button>
              </div>
            </div>
          )}
          {showEn && !editing && (
            <div
              className={`row-en ${mode === 'blur' ? 'blurred' : ''}`}
              onDoubleClick={(e) => {
                if (!onWord) return;
                const w = String(window.getSelection() || '').trim().replace(/^[^A-Za-z]+|[^A-Za-z'’\-]+$/g, '');
                // 双击只取一个单词；短语/长句走「拖选 + 右键」
                if (!/^[A-Za-z][A-Za-z'’\-]*$/.test(w)) return;
                e.stopPropagation();
                onWord(w, e.clientX, e.clientY, seg);
              }}
              onContextMenu={(e) => {
                if (!onWord) return;
                const sel = window.getSelection();
                let w = String(sel || '').trim();
                w = w.replace(/^[^A-Za-z]+/, '').replace(/[^A-Za-z.!?,;:'’\-]+$/g, '').replace(/\s+/g, ' ').trim();
                if (!/\s/.test(w)) return;
                if (!/^[A-Za-z]/.test(w)) return;
                if (sel.anchorNode && !e.currentTarget.contains(sel.anchorNode)) return;
                e.preventDefault();
                e.stopPropagation();
                onWord(w, e.clientX, e.clientY, seg, { phrase: true });
              }}
            >{seg.text}</div>
          )}
          {mode === 'zh' && !seg.zh && !editing && <div className="row-en muted">{seg.text}</div>}
          {showZh && !editing && <div className="row-zh">{seg.zh}</div>}
          <div className="row-sub">
            <span>{fmtTime(seg.start)} – {fmtTime(seg.end)}</span>
            {seg.recordings && seg.recordings.length ? <span>已跟读 {seg.recordings.length} 次</span> : null}
          </div>
        </div>
      </div>
      <div className="row-actions">
        <span className={`score-slot ${score ? badgeClass : 'none'}`} style={score ? { color: scoreColor(score) } : null}>
          {score || '—'}
        </span>
        <button className="icon-btn" title="播放这一句" onClick={() => onPlay(idx)}>
          <IconPlay size={13} />
        </button>
        <button className="icon-btn rec" title="跟读这一句（点击开始录音）" onClick={() => onShadow(idx)}>
          <IconMic size={13} />
        </button>
        <button
          className="icon-btn"
          title={lastRec ? '回放我的录音' : '还没有跟读录音'}
          disabled={!lastRec}
          onClick={() => lastRec && onReplay(lastRec)}
        >
          <IconHeadphone size={13} />
        </button>
      </div>
      {onMenu && (
        <button
          className="seg-more"
          title="编辑 / 删除这一句"
          onClick={(e) => { e.stopPropagation(); onMenu(idx, e.currentTarget); }}
        >
          ⋯
        </button>
      )}
    </div>
  );
}
