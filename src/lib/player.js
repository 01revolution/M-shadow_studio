/** 全局音频播放引擎（单实例，供各组件复用） */

const el = new Audio();
el.preload = 'auto';
let current = null;

function fire() {
  const c = current;
  current = null;
  if (c && c.onEnd) c.onEnd();
}

el.addEventListener('timeupdate', () => {
  if (current && current.stopAt != null && el.currentTime >= current.stopAt - 0.01) {
    el.pause();
    fire();
  }
});

el.addEventListener('ended', fire);
el.addEventListener('error', () => {
  if (current && current.onError) {
    const c = current;
    current = null;
    c.onError(el.error);
  }
});

/**
 * @param {object} p { src, start, end, rate, onEnd, onError, volume }
 */
export function play({ src, start = 0, end = null, rate = 1, volume = 1, onEnd = null, onError = null }) {
  if (!src) return Promise.resolve();
  current = { onEnd, onError, stopAt: end };
  el.volume = volume;
  el.playbackRate = rate || 1;
  const sameSrc = el.src === src || el.getAttribute('src') === src;
  if (!sameSrc) el.src = src;
  if (start > 0 || !sameSrc) {
    try { el.currentTime = start; } catch (_) {}
  } else {
    try { el.currentTime = 0; } catch (_) {}
  }
  return el.play().catch((e) => {
    if (onError) onError(e);
  });
}

export function pause() {
  el.pause();
  current = null;
}

export function stop() {
  el.pause();
  current = null;
}

export function isPlaying() { return !el.paused; }

export function setRate(r) { el.playbackRate = r || 1; }

/** 预热音频源：换篇时先把文件挂上去，点播放就没有等加载的迟滞 */
export function warm(src) {
  if (!src) return;
  if (el.src === src || el.getAttribute('src') === src) return;
  if (!el.paused) return;
  try {
    el.src = src;
    el.load();
  } catch (_) {}
}

export function getElement() { return el; }

export function currentTime() { return el.currentTime; }
