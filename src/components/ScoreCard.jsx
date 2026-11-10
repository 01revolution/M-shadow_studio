import React from 'react';
import { scoreColor } from '../lib/utils.js';

export default function ScoreCard({ result }) {
  if (!result) return null;
  const { score, grade, stars, breakdown, stats, suggestions, issues, heard, words } = result;
  const color = scoreColor(score);

  return (
    <div className="score-card">
      <div className="score-top">
        <div
          className="score-ring"
          style={{ '--ring': score, '--ring-color': color }}
        >
          <span className="score-num">{score}</span>
        </div>
        <div className="score-info">
          <div className="score-grade" style={{ color }}>{grade}</div>
          <div className="score-stars">{'★'.repeat(stars)}{'☆'.repeat(5 - stars)}</div>
          <div className="score-note">
            用时 {stats.duration}s · 参考 {stats.expected}s · 语速 {stats.wpm} wpm
          </div>
        </div>
      </div>

      <div className="bar-row">
        <span className="bar-label">准确度</span>
        <div className="bar-track">
          <div className="bar-fill" style={{ width: `${breakdown.accuracy}%`, background: scoreColor(breakdown.accuracy) }} />
        </div>
        <span className="bar-val">{breakdown.accuracy}</span>
      </div>
      <div className="bar-row">
        <span className="bar-label">流利度</span>
        <div className="bar-track">
          <div className="bar-fill" style={{ width: `${breakdown.fluency}%`, background: scoreColor(breakdown.fluency) }} />
        </div>
        <span className="bar-val">{breakdown.fluency}</span>
      </div>
      <div className="bar-row">
        <span className="bar-label">音量</span>
        <div className="bar-track">
          <div className="bar-fill" style={{ width: `${breakdown.volume}%`, background: scoreColor(breakdown.volume) }} />
        </div>
        <span className="bar-val">{breakdown.volume}</span>
      </div>

      {words && words.length > 0 && (
        <div className="words-diff">
          {words.map((w, i) => {
            if (w.type === 'ok') return <span key={i} className="word-chip ok">{w.ref}</span>;
            if (w.type === 'sub') {
              return (
                <span key={i} className="word-chip wrong" title={`应读 ${w.ref}，识别为 ${w.hyp}`}>
                  {w.ref}
                </span>
              );
            }
            if (w.type === 'del') return <span key={i} className="word-chip miss">{w.ref}</span>;
            return <span key={i} className="word-chip extra">{w.hyp}</span>;
          })}
        </div>
      )}

      {(issues?.substitutions?.length > 0) && (
        <div className="heard-line">
          <b>读偏的词：</b>
          {issues.substitutions.map((s, i) => (
            <span key={i}>{s.expected}（听成 {s.heard}）{i < issues.substitutions.length - 1 ? '，' : ''}</span>
          ))}
        </div>
      )}

      <div className="heard-line">
        <b>系统听到：</b>{heard || '（没有识别到语音）'}
      </div>

      {suggestions && suggestions.length > 0 && (
        <ul className="sugg-list" style={{ marginTop: 12 }}>
          {suggestions.map((s, i) => (
            <li className="sugg-item" key={i}>
              <span className="sugg-dot">·</span>
              <span>{s}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
