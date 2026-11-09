/** 麦克风录音（带音量电平，便于界面反馈） */

let activeStream = null;

export function isSupported() {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
}

export async function requestMic() {
  if (!isSupported()) throw new Error('当前环境不支持录音');
  if (activeStream) return activeStream;
  activeStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      channelCount: 1,
      sampleRate: 48000,
    },
  });
  return activeStream;
}

function pickMime() {
  const list = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
  for (const m of list) {
    if (window.MediaRecorder && MediaRecorder.isTypeSupported(m)) return m;
  }
  return '';
}

export class Recorder {
  constructor() {
    this.mediaRecorder = null;
    this.chunks = [];
    this.stream = null;
    this.analyser = null;
    this.raf = null;
    this.startAt = 0;
    this.onLevel = null;
    this.onTick = null;
  }

  async start() {
    this.stream = await requestMic();
    this.mime = pickMime();
    this.chunks = [];
    this.mediaRecorder = new MediaRecorder(this.stream, this.mime ? { mimeType: this.mime } : undefined);
    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) this.chunks.push(e.data);
    };
    this.mediaRecorder.start(120);
    this.startAt = performance.now();

    const ctx = new AudioContext();
    this.ctx = ctx;
    const src = ctx.createMediaStreamSource(this.stream);
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    src.connect(this.analyser);
    const buf = new Uint8Array(this.analyser.frequencyBinCount);
    const loop = () => {
      if (!this.analyser) return;
      this.analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) {
        const v = (buf[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / buf.length);
      if (this.onLevel) this.onLevel(Math.min(1, rms * 3.2));
      if (this.onTick) this.onTick((performance.now() - this.startAt) / 1000);
      this.raf = requestAnimationFrame(loop);
    };
    loop();
    return true;
  }

  stop() {
    return new Promise((resolve) => {
      if (!this.mediaRecorder) return resolve(null);
      const rec = this.mediaRecorder;
      rec.onstop = async () => {
        const blob = new Blob(this.chunks, { type: this.mime || 'audio/webm' });
        const buf = await blob.arrayBuffer();
        this.cleanup();
        resolve({ buffer: buf, mime: this.mime || 'audio/webm', duration: (performance.now() - this.startAt) / 1000 });
      };
      try { rec.stop(); } catch (_) { resolve(null); }
    });
  }

  cancel() {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try { this.mediaRecorder.stop(); } catch (_) {}
    }
    this.cleanup();
  }

  cleanup() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = null;
    this.analyser = null;
    if (this.ctx) { try { this.ctx.close(); } catch (_) {} this.ctx = null; }
    this.mediaRecorder = null;
  }
}

/** 预加载麦克风权限，提前发现权限问题 */
export async function warmupMic() {
  try { await requestMic(); return true; } catch (e) { return false; }
}
