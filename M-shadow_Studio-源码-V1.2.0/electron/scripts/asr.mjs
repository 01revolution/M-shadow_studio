/**
 * ASR 子进程：用 transformers.js 在本地跑 Whisper（ONNX，无需 Python）
 * 入参（argv[2] JSON）: { f32, model, remoteHost, cacheDir, language, mode }
 * 输出：逐行 JSON —— {type:'progress'} / {type:'result'} / {type:'error'}
 */
import fs from 'fs';

const payload = JSON.parse(process.argv[2] || '{}');
const notify = (o) => process.stdout.write(JSON.stringify(o) + '\n');

async function main() {
  const { pipeline, env } = await import('@huggingface/transformers');

  if (payload.cacheDir) env.cacheDir = payload.cacheDir;
  if (payload.remoteHost) env.remoteHost = payload.remoteHost;

  // 安装包内置了模型 → 完全离线，不再尝试下载
  const model = payload.model || 'Xenova/whisper-base.en';
  let hasLocal = false;
  try { hasLocal = !!(payload.localDir && fs.existsSync(payload.localDir + '/' + model + '/config.json')); } catch (_) {}
  if (hasLocal) {
    env.localModelPath = payload.localDir;
    env.allowLocalModels = true;
    env.allowRemoteModels = false;
  } else {
    // 选中的模型没有随包内置 → 允许从 modelHost 下载一次，之后走本地缓存
    env.allowLocalModels = false;
    env.allowRemoteModels = true;
  }

  const isEnglishOnly = /\.en$/.test(model);

  notify({ type: 'stage', stage: 'load-model', model });

  const asr = await pipeline('automatic-speech-recognition', model, {
    dtype: 'q8',
    progress_callback: (p) => {
      if (p && p.status === 'progress' && typeof p.progress === 'number') {
        notify({ type: 'progress', stage: 'download', file: p.file, progress: p.progress });
      } else if (p && p.status === 'done') {
        notify({ type: 'progress', stage: 'download', file: p.file, progress: 100 });
      }
    },
  });

  notify({ type: 'stage', stage: 'decode' });
  const buf = fs.readFileSync(payload.f32);
  const f32 = new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 4));

  notify({ type: 'stage', stage: 'transcribe' });
  const opts = {
    chunk_length_s: 30,
    stride_length_s: 5,
    return_timestamps: true,
  };
  if (!isEnglishOnly) {
    opts.language = payload.language || 'en';
    opts.task = 'transcribe';
  }

  const out = await asr(f32, opts);

  const chunks = (out.chunks || []).map((c) => ({
    start: Array.isArray(c.timestamp) ? (c.timestamp[0] ?? 0) : 0,
    end: Array.isArray(c.timestamp) ? (c.timestamp[1] ?? c.timestamp[0] ?? 0) : 0,
    text: String(c.text || '').trim(),
  })).filter((c) => c.text);

  notify({
    type: 'result',
    value: { text: String(out.text || '').trim(), chunks, duration: f32.length / 16000 },
  });
}

main().catch((err) => {
  notify({ type: 'error', message: err && err.message ? err.message : String(err) });
  process.exit(1);
});
