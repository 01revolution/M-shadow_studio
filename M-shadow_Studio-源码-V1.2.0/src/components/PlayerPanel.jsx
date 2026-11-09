import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store.js';
import { playSeg, stopAll } from '../lib/playActions.js';
import { Recorder } from '../lib/recorder.js';
import * as player from '../lib/player.js';
import ScoreCard from './ScoreCard.jsx';
import { IconPlay, IconMic, IconRepeat, IconStop, IconPause } from './Icons.jsx';

const api = window.api;

export const RATES = [0.5, 0.75, 1, 1.25, 1.5];

const LOOP_MODES = {
  off: { label: '关闭循环', short: '不循环' },
  single: { label: '单句循环', short: '单句循环' },
  all: { label: '全篇循环', short: '全篇循环' },
  endless: { label: '无敌循环', short: '无敌循环' },
};
const LOOP_ORDER = ['off', 'single', 'all', 'endless'];

/** 平均分对应的评语（按用户给的文案，一字不改） */
export function avgComment(avg, allDone) {
  if (!avg) return 'Are you ready?';
  if (avg > 95) return 'Wow,! Are you a native speaker?';
  if (allDone && avg > 85 && avg <= 90) return 'Cool! You are awesome.';
  if (avg <= 30) return 'No way, bro!';
  if (avg <= 60) return 'Hurry up！practice more.';
  if (avg <= 85) return 'You can do better.';
  return 'Good! hang in there.';
}

export default function PlayerPanel() {
  const doc = useStore((s) => s.doc);
  const idx = useStore((s) => s.currentIdx);
  const settings = useStore((s) => s.settings);
  const patchSettings = useStore((s) => s.patchSettings);
  const setCurrentIdx = useStore((s) => s.setCurrentIdx);
  const loopMode = useStore((s) => s.loopMode);
  const setLoopMode = useStore((s) => s.setLoopMode);
  const notify = useStore((s) => s.notify);
  const shadowToken = useStore((s) => s.shadowToken);
  const refreshDoc = useStore((s) => s.refreshDoc);

  const [mode, setMode] = useState('idle'); // idle | playing | recording | scoring
  const [level, setLevel] = useState(0);
  const [secs, setSecs] = useState(0);
  const [result, setResult] = useState(null);
  const [rate, setRate] = useState(settings ? settings.rate : 1);
  const [voices, setVoices] = useState([]);
  const [preListen, setPreListen] = useState(true);
  const [scoreError, setScoreError] = useState('');
  const [playing, setPlaying] = useState(false);
  const [playIdx, setPlayIdx] = useState(null);
  const recRef = useRef(null);
  const recIdxRef = useRef(-1);
  const runRef = useRef({ id: 0 });
  const selfAdvance = useRef(false);

  const seg = doc && doc.segments ? doc.segments[idx] : null;
  const total = doc && doc.segments ? doc.segments.length : 0;

  useEffect(() => {
    // 由总控播放推进句子时，不要打断播放
    if (selfAdvance.current) { selfAdvance.current = false; return; }
    setResult(null);
    setSecs(0);
    setLevel(0);
    setScoreError('');
    stopAll();
    setPlaying(false);
    setPlayIdx(null);
    runRef.current.id++;
    setMode('idle');
    if (recRef.current) { recRef.current.cancel(); recRef.current = null; }
  }, [idx, doc && doc.id]);

  useEffect(() => {
    if (settings) {
      setRate(settings.rate);
      setPreListen(settings.preListen !== false);
    }
  }, [settings && settings.rate, settings && settings.preListen]);

  useEffect(() => { api.voices().then(setVoices).catch(() => {}); }, []);
  useEffect(() => () => { runRef.current.id++; stopAll(); if (recRef.current) recRef.current.cancel(); }, []);

  // 进入学习跟读页不自动朗读、也不自动录音：只在本次停留期间响应麦克风点击
  useEffect(() => {
    if (useStore.getState().shadowToken) useStore.setState({ shadowToken: 0 });
  }, []);
  useEffect(() => {
    if (!shadowToken) return;
    // 同一个麦克风按钮：正在录 → 停并评分；否则开始录
    if (mode === 'recording' && recIdxRef.current === idx) stopAndScore();
    else if (mode !== 'scoring') startShadow();
  }, [shadowToken]);

  const voiceGroups = useMemo(() => {
    const order = ['英音', '爱尔兰音', '美音', '澳音', '加音', '新西兰音', '南非音', '印度音'];
    const groups = {};
    voices.forEach((v) => { (groups[v.accent] = groups[v.accent] || []).push(v); });
    return Object.keys(groups)
      .sort((a, b) => (order.indexOf(a) + 99) - (order.indexOf(b) + 99))
      .map((k) => ({ accent: k, list: groups[k] }));
  }, [voices]);

  const currentVoice = settings ? settings.voice : '';

  const scoredSegs = (doc && doc.segments ? doc.segments : []).filter((s) => s.bestScore);
  const avg = scoredSegs.length
    ? Math.round(scoredSegs.reduce((a, s) => a + s.bestScore, 0) / scoredSegs.length)
    : 0;
  const allDone = total > 0 && scoredSegs.length === total;

  if (!doc || !seg) {
    return (
      <div className="side-panel">
        <div className="panel-block">
          <div className="panel-title">还没有素材</div>
          <div className="card-note" style={{ marginTop: 8 }}>
            从左侧导入英语素材（TXT / PDF / Word / MP3 / MP4 / 视频链接），也可以直接粘贴一段英文。
            系统会自动断句、翻译并生成配音。
          </div>
        </div>
      </div>
    );
  }

  function haltTransport() {
    runRef.current.id++;
    stopAll();
    setPlaying(false);
    setPlayIdx(null);
    setMode('idle');
  }

  /** 播一句，结束时 resolve（同时兼容 TTS 与素材原声） */
  function playOne(i, opts = {}) {
    return new Promise((resolve) => {
      let settled = false;
      const done = () => { if (!settled) { settled = true; resolve(); } };
      const myId = runRef.current.id;
      playSeg(i, {
        ...opts,
        onEnd: () => { done(); },
      });
      // 兜底：万一 onEnd 没触发（音频被替换/解码异常），最多等 20 秒
      setTimeout(() => { if (runRef.current.id === myId) done(); }, 20000);
    });
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function runFrom(startIdx, kind) {
    const token = ++runRef.current.id;
    const alive = () => runRef.current.id === token;
    const st = useStore.getState();
    const singleN = Math.max(1, parseInt(st.settings.singleLoopCount, 10) || 5);
    const allN = Math.max(1, parseInt(st.settings.allLoopCount, 10) || 5);

    setPlaying(true);
    setMode('playing');
    try {
      if (kind === 'off') {
        setPlayIdx(startIdx);
        selfAdvance.current = true;
        setCurrentIdx(startIdx);
        await playOne(startIdx);
        return;
      }
      if (kind === 'single') {
        for (let r = 0; r < singleN; r++) {
          if (!alive()) return;
          setPlayIdx(startIdx);
          selfAdvance.current = true;
          setCurrentIdx(startIdx);
          await playOne(startIdx);
          if (!alive()) return;
          await sleep(180);
        }
        return;
      }
      if (kind === 'all') {
        for (let r = 0; r < allN; r++) {
          const list = useStore.getState().doc.segments;
          for (let i = startIdx; i < list.length; i++) {
            if (!alive()) return;
            setPlayIdx(i);
            selfAdvance.current = true;
            setCurrentIdx(i);
            await playOne(i);
            if (!alive()) return;
            await sleep(140);
          }
        }
        return;
      }
      // 无敌循环：本篇读完后顺着素材列表读下一篇，一直循环
      let curDocId = useStore.getState().activeId;
      let begin = startIdx;
      while (alive()) {
        const list = useStore.getState().doc.segments;
        for (let i = begin; i < list.length; i++) {
          if (!alive()) return;
          setPlayIdx(i);
          selfAdvance.current = true;
          setCurrentIdx(i);
          await playOne(i);
          if (!alive()) return;
          await sleep(140);
        }
        const docs = useStore.getState().docs || [];
        const ci = docs.findIndex((d) => d.id === curDocId);
        const nextDoc = docs.length > 1 && ci >= 0 ? docs[(ci + 1) % docs.length] : null;
        if (!nextDoc) { begin = 0; continue; }
        selfAdvance.current = true; // 换篇时不打断循环
        useStore.setState({ doc: nextDoc, activeId: nextDoc.id, currentIdx: 0 });
        curDocId = nextDoc.id;
        begin = 0;
        await sleep(250);
      }
    } finally {
      if (alive()) { setPlaying(false); setPlayIdx(null); setMode('idle'); }
    }
  }

  function toggleTransport() {
    if (playing) { haltTransport(); return; }
    if (mode === 'recording' || mode === 'scoring') return;
    runFrom(idx, loopMode);
  }

  function cycleLoop() {
    const i = LOOP_ORDER.indexOf(loopMode);
    const next = LOOP_ORDER[(i + 1) % LOOP_ORDER.length];
    setLoopMode(next);
    // 正在播时切换循环，立刻按新模式重开
    if (playing) { haltTransport(); setTimeout(() => runFrom(useStore.getState().currentIdx, next), 30); }
  }

  async function changeVoice(v) {
    await patchSettings({ voice: v }).catch(() => {});
    haltTransport();
    if (settings && settings.autoPreviewVoice === false) return;
    const i = useStore.getState().currentIdx;
    playSeg(i, { voice: v, rate });
  }

  async function changeRate(r) {
    setRate(r);
    patchSettings({ rate: r }).catch(() => {});
    haltTransport();
    playSeg(useStore.getState().currentIdx, { rate: r });
  }

  async function startRec() {
    try {
      haltTransport();
      const rec = new Recorder();
      rec.onLevel = (v) => setLevel(v);
      rec.onTick = (t) => {
        setSecs(t);
        if (t > 30) stopAndScore();
      };
      await rec.start();
      recRef.current = rec;
      recIdxRef.current = idx;
      setSecs(0);
      setMode('recording');
    } catch (e) {
      notify('无法使用麦克风：' + (e.message || '请检查 Windows 的麦克风权限'), 'error');
      setMode('idle');
    }
  }

  async function startShadow() {
    if (mode === 'recording') { stopAndScore(); return; }
    if (mode === 'scoring') return;
    setResult(null);
    setScoreError('');
    if (preListen) {
      setMode('playing');
      playSeg(idx, { rate, onEnd: () => { startRec(); } });
    } else {
      stopAll();
      await startRec();
    }
  }

  async function stopAndScore() {
    const rec = recRef.current;
    if (!rec) return;
    recRef.current = null;
    setMode('scoring');
    stopAll();
    let payload = null;
    try { payload = await rec.stop(); } catch (_) { payload = null; }
    if (!payload || !payload.buffer || payload.buffer.byteLength < 2000) {
      notify('没录到声音：录音太短，或麦克风被静音了', 'error');
      setMode('idle');
      return;
    }
    try {
      const res = await api.score({
        docId: doc.id,
        segId: seg.id,
        target: seg.text,
        bytes: new Uint8Array(payload.buffer),
        mime: payload.mime,
        referenceDuration: seg.ttsDuration || 0,
      });
      setResult(res);
      setMode('idle');
      refreshDoc(doc.id).catch(() => {});
    } catch (e) {
      const msg = e && e.message ? e.message : '评分失败';
      setScoreError(msg);
      notify(msg, 'error');
      setMode('idle');
    }
  }

  function cancelRecord() {
    if (recRef.current) { recRef.current.cancel(); recRef.current = null; }
    stopAll();
    setMode('idle');
    setSecs(0);
  }

  const loopMeta = LOOP_MODES[loopMode] || LOOP_MODES.off;

  return (
    <div className="side-panel">
      <div className="panel-block">
        <div className="panel-mini">
          <span>第 {idx + 1} / {total} 句</span>
        </div>

        <div className="voice-row">
          <span className="ctrl-label">音色</span>
          <select className="voice-select" value={currentVoice} onChange={(e) => changeVoice(e.target.value)}>
            {doc.playbackPath ? (
              <optgroup label="素材原声">
                <option value="original">原声（素材里的原始人声）</option>
              </optgroup>
            ) : null}
            {voiceGroups.map((g) => (
              <optgroup key={g.accent} label={g.accent}>
                {g.list.map((v) => (
                  <option key={v.name} value={v.name}>{v.label}（{v.gender}）{v.tag ? ' · ' + v.tag : ''}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        <div className="ctrl-line">
          <span className="ctrl-label">语速</span>
          <div className="rate-chips">
            {RATES.map((r) => (
              <button key={r} className={`rate-chip ${Math.abs(rate - r) < 0.001 ? 'on' : ''}`} onClick={() => changeRate(r)}>
                {r}×
              </button>
            ))}
          </div>
        </div>

        <div className="transport-line">
          <button className={`transport-btn ${playing ? 'on' : ''}`} onClick={toggleTransport} title="从当前选中的句子开始播放；再点一下停止">
            {playing ? <IconStop size={14} /> : <IconPlay size={14} />}
            {playing ? '停止' : '播放'}
          </button>
          <button className={`toggle loop-btn ${loopMode !== 'off' ? 'on' : ''}`} onClick={cycleLoop} title="切换循环方式">
            <IconRepeat size={12} /> {loopMeta.short}
          </button>
        </div>
        <div className="hint-inline loop-hint">
          {loopMode === 'single' && `单句重复 ${settings.singleLoopCount || 5} 次（设置里可改）`}
          {loopMode === 'all' && `本篇从当前句起循环 ${settings.allLoopCount || 5} 遍（设置里可改）`}
          {loopMode === 'endless' && '读完本篇自动接下一篇，一直循环'}
        </div>
      </div>

      <div className="panel-block">
        <div className="panel-title">影子跟读</div>
        {mode === 'recording' ? (
          <div className="rec-live">
            <div className="rec-head">
              <span className="rec-dot" />
              <span>正在录音</span>
              <span className="rec-timer">{secs.toFixed(1)}s</span>
            </div>
            <div className="level-meter">
              {Array.from({ length: 28 }).map((_, i) => {
                const seed = ((i * 37) % 11) / 11;
                const h = Math.max(6, Math.round((level * (0.5 + seed * 0.9)) * 26));
                return <div key={i} className="level-bar" style={{ height: h, opacity: level > 0.02 ? 0.85 : 0.35 }} />;
              })}
            </div>
            <div className="rec-actions" style={{ marginTop: 10 }}>
              <button className="btn primary" onClick={stopAndScore}><IconStop size={13} /> 停止并评分</button>
              <button className="btn" onClick={cancelRecord}>取消</button>
            </div>
          </div>
        ) : (
          <>
            <div className="rec-actions">
              <button className="btn primary shadow-btn" onClick={startShadow} disabled={mode === 'scoring'}>
                {preListen ? <IconPlay size={13} /> : <IconMic size={13} />}
                {preListen ? '先听后读' : '直接朗读'}
              </button>
              {mode === 'scoring' && <span style={{ color: 'var(--accent)', fontWeight: 600 }}>正在评分…</span>}
            </div>
            <div className="ctrl-line" style={{ marginTop: 10 }}>
              <button
                className={`toggle ${preListen ? 'on' : ''}`}
                onClick={() => {
                  const v = !preListen;
                  setPreListen(v);
                  patchSettings({ preListen: v }).catch(() => {});
                }}
                title="开着＝先播一遍再录；关掉＝点一下直接开始录"
              >
                先播一遍再录
              </button>
              <span className="hint-inline">录音最长 30 秒</span>
            </div>
          </>
        )}

      <div className="panel-sub">
        <div className="panel-subtitle">评分与建议</div>

        <div className="avg-card">
          <div className="avg-score">平均得分：<b>{avg}</b></div>
          <div className="avg-comment">{avgComment(avg, allDone)}</div>
          <div className="avg-meta">{scoredSegs.length} / {total} 句参与评分</div>
        </div>

        {result ? (
          <ScoreCard result={result} />
        ) : scoreError ? (
          <div className="card-note error-note">
            {scoreError}
            <div style={{ marginTop: 8 }}><button className="btn sm" onClick={startShadow}>重试</button></div>
          </div>
        ) : seg.lastScore ? (
          <div className="card-note">
            这句上次得分 {seg.lastScore}。再跟读一次试试。
          </div>
        ) : (
          <div className="card-note">
            跟读后这里会显示总分、准确度、流利度、音量，以及哪些词漏读或读偏了。
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
