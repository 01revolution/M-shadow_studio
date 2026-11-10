/** 应用数据目录管理：默认放在程序目录下的 userdata/（绿色版可整体拷走） */
const { app } = require('electron');
const path = require('path');
const fs = require('fs');

let cached = null;

function programDir() {
  // 打包后：exe 所在目录；开发时：工程根目录
  return app.isPackaged ? path.dirname(app.getPath('exe')) : app.getAppPath();
}

function writable(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.accessSync(dir, fs.constants.W_OK);
    return true;
  } catch (_) { return false; }
}

/** 老版本数据在系统 userData 下，首次启动时搬过来 */
function migrateFrom(oldDir, newDir) {
  try {
    if (!fs.existsSync(oldDir) || oldDir === newDir) return;
    const marker = path.join(newDir, 'store.json');
    if (fs.existsSync(marker)) return;
    for (const name of ['store.json', 'vocab.json', 'dict-cache.json', 'tts', 'recordings', 'exports', 'media']) {
      const src = path.join(oldDir, name);
      if (!fs.existsSync(src)) continue;
      const dst = path.join(newDir, name);
      try { fs.cpSync(src, dst, { recursive: true }); } catch (_) {}
    }
  } catch (_) {}
}

function base() {
  if (cached) return cached;
  const exeBase = path.join(programDir(), 'userdata');
  if (writable(exeBase)) {
    migrateFrom(app.getPath('userData'), exeBase);
    cached = exeBase;
  } else {
    cached = app.getPath('userData');
  }
  return cached;
}

const DIRS = () => ({
  base: base(),
  media: path.join(base(), 'media'),
  tts: path.join(base(), 'tts'),
  rec: path.join(base(), 'recordings'),
  export: path.join(base(), 'exports'),
  models: path.join(base(), 'models'),
  tmp: path.join(base(), 'tmp'),
  logs: path.join(base(), 'logs'),
  store: path.join(base(), 'store.json'),
});

function ensureDirs() {
  const d = DIRS();
  for (const k of ['media', 'tts', 'rec', 'export', 'models', 'tmp', 'logs']) {
    try { fs.mkdirSync(d[k], { recursive: true }); } catch (_) {}
  }
  return d;
}

module.exports = { DIRS, ensureDirs, base };
