/** 播放动作：句子朗读（TTS）/ 原声片段 */
import { useStore } from '../store.js';
import * as player from './player.js';

const api = window.api;

/** 统一入口：按当前音色设置决定播 TTS 还是素材原声 */
export function playSeg(index, opts = {}) {
  const st = useStore.getState();
  const s = st.settings || {};
  const voice = opts.voice || s.voice;
  if (voice === 'original' && st.doc && st.doc.playbackPath) return playSegOriginal(index, opts);
  return playSegTts(index, opts);
}

export async function playSegTts(index, opts = {}) {
  const st = useStore.getState();
  const doc = st.doc;
  if (!doc || !doc.segments[index]) return;
  const seg = doc.segments[index];
  const rate = opts.rate || st.settings.rate;
  const voice = opts.voice
    || (st.settings.voice === 'original' ? st.settings.lastVoice : st.settings.voice);
  if (voice === 'original') return playSegOriginal(index, opts);
  try {
    const r = await st.ensureSegTts(seg, { rate, voice });
    // 已经切到别的页面就别再响了，避免「切到背生词却播着跟读篇」
    if (useStore.getState().view !== 'study') return;
    if (r && r.original) return playSegOriginal(index, opts);
    player.play({
      src: api.mediaUrl(r.file),
      start: 0,
      rate: 1, // 语速已经烘焙进音频
      onEnd: opts.onEnd || null,
      onError: () => st.notify('音频播放失败，请重试', 'error'),
    });
  } catch (e) {
    st.notify(e.message || '配音生成失败（检查网络）', 'error');
    if (opts.onEnd) opts.onEnd();
  }
}

export function playSegOriginal(index, opts = {}) {
  const st = useStore.getState();
  const doc = st.doc;
  if (!doc || !doc.playbackPath) {
    st.notify('这个素材是纯文本，没有原声音频', 'error');
    if (opts.onEnd) opts.onEnd();
    return;
  }
  const seg = doc.segments[index];
  if (!seg) return;
  player.play({
    src: api.mediaUrl(doc.playbackPath),
    start: seg.start,
    end: seg.end,
    rate: opts.rate || st.playbackRate || 1,
    onEnd: opts.onEnd || null,
  });
}

export function stopAll() {
  player.stop();
}

export function pauseAll() {
  player.pause();
}

export function isPlaying() {
  return player.isPlaying();
}
