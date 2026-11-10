/** 在主进程里调度 ASR 子进程 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { toFloat32 } = require('./ffmpeg');

const SCRIPT = path.join(__dirname, '..', 'scripts', 'asr.mjs');

function nodeBin() {
  // 打包后 process.execPath 是 electron 可执行文件，靠 ELECTRON_RUN_AS_NODE 当 node 用
  return process.execPath;
}

/**
 * @param {string} audioPath 任意音频/视频文件
 * @param {object} opts { model, remoteHost, cacheDir, language, onProgress }
 * @returns {Promise<{text:string, chunks:Array, duration:number}>}
 */
async function transcribe(audioPath, opts = {}) {
  const f32 = path.join(os.tmpdir(), `ss-${Date.now()}-${Math.round(Math.random() * 1e6)}.f32`);
  await toFloat32(audioPath, f32);

  const payload = {
    f32,
    model: opts.model || 'Xenova/whisper-base.en',
    remoteHost: opts.remoteHost || 'https://hf-mirror.com',
    cacheDir: opts.cacheDir || '',
    localDir: opts.localDir || '',
    language: opts.language || 'en',
  };

  return new Promise((resolve, reject) => {
    const child = spawn(nodeBin(), [SCRIPT, JSON.stringify(payload)], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      windowsHide: true,
    });

    let result = null;
    let errMsg = '';
    const timer = setTimeout(() => {
      try { child.kill(); } catch (_) {}
      reject(new Error('语音识别超时（首次使用需下载模型，请检查网络或切换模型源）'));
    }, 15 * 60 * 1000);

    child.stdout.on('data', (d) => {
      for (const line of d.toString().split('\n')) {
        if (!line.trim()) continue;
        let msg;
        try { msg = JSON.parse(line); } catch (_) { continue; }
        if (msg.type === 'progress' && opts.onProgress) opts.onProgress(msg);
        else if (msg.type === 'stage' && opts.onProgress) opts.onProgress(msg);
        else if (msg.type === 'result') result = msg.value;
        else if (msg.type === 'error') errMsg = msg.message;
      }
    });

    let stderr = '';
    child.stderr.on('data', (d) => { stderr += d.toString(); });

    child.on('close', () => {
      clearTimeout(timer);
      try { fs.unlinkSync(f32); } catch (_) {}
      if (result) return resolve(result);
      reject(new Error(errMsg || (`语音识别失败：${stderr.slice(-500) || '未知错误'}`)));
    });
  });
}

module.exports = { transcribe };
