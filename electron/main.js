const { app, BrowserWindow, Menu, ipcMain, dialog, shell, protocol } = require('electron');
const path = require('path');
const fs = require('fs');

const { ensureDirs, DIRS } = require('./lib/paths');
const { createStore } = require('./lib/store');
const { importFile, importText, importUrl, readPdf, readDocx } = require('./lib/import');
const { translateTexts, testLlm } = require('./lib/translate');
const tts = require('./lib/tts');
const { scoreReading } = require('./lib/score');
const { exportMp3, buildSrt, buildLrc, writeText } = require('./lib/export');
const ff = require('./lib/ffmpeg');
const { transcribe } = require('./lib/asr');
const { rankWords, wordFamily, mnemonic } = require('./lib/vocab');
const dict = require('./lib/dict');
const { createVocab } = require('./lib/vocabstore');

// ---------------------------------------------------------------- 基础
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'media',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: true, corsEnabled: true },
  },
]);

const MIME = {
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.aac': 'audio/aac',
  '.ogg': 'audio/ogg', '.opus': 'audio/ogg', '.flac': 'audio/flac',
  '.mp4': 'video/mp4', '.webm': 'video/webm',
};

function encodePath(p) {
  return Buffer.from(p, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function decodePath(s) {
  const b = s.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(b, 'base64').toString('utf8');
}

/** media:// 协议：支持 Range，音频才能精确跳转到某一句 */
async function handleMedia(request) {
  try {
    const u = new URL(request.url);
    const b64 = u.pathname.replace(/^\/+/, '');
    const filePath = decodePath(b64);
    if (!filePath || !fs.existsSync(filePath)) {
      return new Response('not found', { status: 404 });
    }
    const size = fs.statSync(filePath).size;
    const mime = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
    const range = request.headers.get('range');
    const { Readable } = require('stream');

    if (range) {
      const m = /bytes=(\d*)-(\d*)/.exec(range);
      let start = m && m[1] ? parseInt(m[1], 10) : 0;
      let end = m && m[2] ? parseInt(m[2], 10) : size - 1;
      if (Number.isNaN(start) || start >= size) {
        return new Response('', { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
      }
      end = Math.min(end, size - 1);
      const stream = fs.createReadStream(filePath, { start, end });
      return new Response(Readable.toWeb(stream), {
        status: 206,
        headers: {
          'Content-Type': mime,
          'Content-Length': String(end - start + 1),
          'Content-Range': `bytes ${start}-${end}/${size}`,
          'Accept-Ranges': 'bytes',
        },
      });
    }

    const stream = fs.createReadStream(filePath);
    return new Response(Readable.toWeb(stream), {
      status: 200,
      headers: { 'Content-Type': mime, 'Content-Length': String(size), 'Accept-Ranges': 'bytes' },
    });
  } catch (e) {
    return new Response('error: ' + e.message, { status: 500 });
  }
}

// ---------------------------------------------------------------- 窗口
/**
 * 彻底去掉标题栏菜单（File / Edit / View / Window / Help），
 * 同时手动兜住复制 / 粘贴 / 剪切 / 全选快捷键，保证输入框照常能用。
 */
function installNoMenu() {
  Menu.setApplicationMenu(null);
  app.on('browser-window-created', (_e, w) => {
    w.webContents.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown') return;
      const mod = process.platform === 'darwin' ? input.meta : input.control;
      if (!mod || input.alt) return;
      const key = String(input.key || '').toLowerCase();
      const cmd = { c: 'copy', v: 'paste', x: 'cut', a: 'selectAll' }[key];
      if (!cmd) return;
      try {
        w.webContents[cmd]();
        event.preventDefault();
      } catch (_) {}
    });
  });
}

let win = null;
let store = null;
let dirs = null;
let vocab = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1320,
    height: 880,
    minWidth: 1080,
    minHeight: 680,
    backgroundColor: '#f7f8fa',
    title: 'M-shadow Studio',
    icon: path.join(__dirname, '..', 'resources', 'icon.png'),
    // 去掉系统标题栏里的 Electron 图标和标题，只保留右侧三个系统按钮
    titleBarStyle: 'hidden',
    show: false,
    autoHideMenuBar: true,
    frame: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
    },
  });
  win.setMenuBarVisibility(false);
  win.once('ready-to-show', () => win.show());

  const devUrl = process.env.VITE_DEV_URL;
  if (devUrl) {
    win.loadURL(devUrl);
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
  // 标题栏菜单彻底不显示（Alt 也不会弹出）
  win.webContents.on('did-finish-load', () => win.setMenuBarVisibility(false));
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // 开发/自检时把渲染进程日志转到终端
  if (process.env.ELECTRON_DEBUG || process.env.SMOKE_TEST) {
    win.webContents.on('console-message', (...args) => {
      const msg = args.find((a) => typeof a === 'string' && a.length > 0);
      // eslint-disable-next-line no-console
      console.log('[renderer]', args[2] || args[1] || msg);
    });
    win.webContents.on('did-finish-load', async () => {
      console.log('SMOKE_OK: renderer loaded');
      if (process.env.SMOKE_JS) {
        try {
          const r = await win.webContents.executeJavaScript(process.env.SMOKE_JS);
          console.log('SMOKE_JS_RESULT', JSON.stringify(r));
        } catch (e) {
          console.log('SMOKE_JS_ERROR', e.message);
        }
      }
      if (process.env.SMOKE_SHOT) {
        if (process.env.SMOKE_VIEW) {
          const tabs = { spelling: 1, settings: 2 };
          const i = tabs[process.env.SMOKE_VIEW];
          if (i != null) {
            await win.webContents.executeJavaScript(
              `document.querySelectorAll('.tab')[${i}] && document.querySelectorAll('.tab')[${i}].click()`
            );
            await new Promise((r) => setTimeout(r, 1800));
          }
        }
        await new Promise((r) => setTimeout(r, 900));
        try {
          const img = await win.webContents.capturePage();
          fs.writeFileSync(process.env.SMOKE_SHOT, img.toPNG());
          console.log('SMOKE_SHOT saved', process.env.SMOKE_SHOT);
        } catch (e) {
          console.error('SMOKE_SHOT failed', e.message);
        }
      }
      if (process.env.SMOKE_TEST) setTimeout(() => app.quit(), process.env.SMOKE_SHOT ? 2500 : 7000);
    });
  }
}

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

/** 随安装包内置的识别模型（存在则完全不联网） */
/** 安装包自带的 yt-dlp.exe（B 站/YouTube 链接导入用） */
function bundledYtdlp() {
  const candidates = [
    path.join(process.resourcesPath || '', 'bin', 'yt-dlp.exe'),
    path.join(__dirname, '..', 'resources', 'bin', 'yt-dlp.exe'),
  ];
  for (const p of candidates) {
    try { if (p && fs.existsSync(p)) return p; } catch (_) {}
  }
  return '';
}

function modelRoots() {
  const out = [];
  const add = (p) => { try { if (p && fs.existsSync(p) && !out.includes(p)) out.push(p); } catch (_) {} };
  add(path.join(process.resourcesPath || '', 'models'));
  add(path.join(__dirname, '..', 'resources', 'models'));
  if (dirs && dirs.base) add(path.join(dirs.base, 'models'));
  return out;
}

/** 随包内置的模型根目录（存在任意一个可用模型即可离线） */
function bundledModels() {
  for (const root of modelRoots()) {
    try {
      if (root.includes('userdata')) continue;
      const x = path.join(root, 'Xenova');
      if (fs.existsSync(x) && fs.readdirSync(x).some((n) => fs.existsSync(path.join(x, n, 'config.json'))) ) return root;
    } catch (_) {}
  }
  return null;
}

/** 某模型是否在本地（内置或用户放进 userdata/models） */
function modelLocalDir(model) {
  for (const root of modelRoots()) {
    try {
      if (fs.existsSync(path.join(root, model, 'config.json'))) return root;
    } catch (_) {}
  }
  return '';
}

/** 扫描内置目录与 userdata/models，供设置页选择 */
function listAsrModels() {
  const out = [];
  const seen = new Set();
  const roots = modelRoots();
  const pushModel = (root, id, builtin) => {
    if (seen.has(id)) return;
    seen.add(id);
    let size = 0;
    try {
      const walk = (p) => {
        for (const f of fs.readdirSync(p, { withFileTypes: true })) {
          const q = path.join(p, f.name);
          if (f.isDirectory()) walk(q); else size += fs.statSync(q).size;
        }
      };
      walk(path.join(root, id));
    } catch (_) {}
    out.push({ id, name: path.basename(id), size, builtin });
  };
  for (const root of roots) {
    const builtin = !String(root).includes(path.join('userdata', 'models'));
    const xen = path.join(root, 'Xenova');
    if (fs.existsSync(xen)) {
      for (const n of fs.readdirSync(xen)) {
        if (fs.existsSync(path.join(xen, n, 'config.json'))) pushModel(root, 'Xenova/' + n, builtin);
      }
    }
    // 也允许直接把模型文件夹放在 models 根目录
    try {
      for (const n of fs.readdirSync(root)) {
        if (n === 'Xenova') continue;
        if (fs.existsSync(path.join(root, n, 'config.json'))) pushModel(root, n, builtin);
      }
    } catch (_) {}
  }
  return out;
}

function progress(scope, p) {
  send('progress', { scope, ...p });
}

app.whenReady().then(() => {
  installNoMenu();
  dirs = ensureDirs();
  store = createStore(dirs.store);
  vocab = createVocab(path.join(dirs.base, 'vocab.json'));
  protocol.handle('media', handleMedia);
  registerIpc();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ---------------------------------------------------------------- IPC
function registerIpc() {
  const settingsWithCache = () => ({
    ...store.getSettings(),
    modelCacheDir: dirs.models,
    localModelDir: bundledModels(),
    ytdlpBin: bundledYtdlp(),
  });

  ipcMain.handle('window:minimize', () => { if (win) win.minimize(); return true; });
  ipcMain.handle('window:toggleMax', () => {
    if (!win) return false;
    try { win.isMaximized() ? win.unmaximize() : win.maximize(); } catch (_) {}
    return true;
  });
  ipcMain.handle('window:close', () => { if (win) win.close(); return true; });
  ipcMain.handle('window:titlebar', () => true);

  ipcMain.handle('asr:models', () => ({ models: listAsrModels() }));
  ipcMain.handle('app:info', () => ({
    version: app.getVersion(),
    dataDir: dirs.base,
    mediaDir: dirs.media,
    exportDir: dirs.export,
    ffmpeg: ff.ffmpegPath(),
    platform: process.platform,
  }));

  ipcMain.handle('app:diagnose', async () => {
    const out = [];
    const fp = ff.ffmpegPath();
    out.push({ name: 'ffmpeg 组件', ok: fs.existsSync(fp), detail: fp });
    const dir = modelLocalDir(store.getSettings().asrModel) || bundledModels();
    const modelFile = path.join(dir || dirs.models, store.getSettings().asrModel, 'onnx', 'encoder_model_quantized.onnx');
    out.push({
      name: '本地语音识别模型',
      ok: fs.existsSync(modelFile),
      detail: dir ? '已内置，跟读评分可离线运行' : '未内置，首次使用需联网下载',
    });
    try {
      const bytes = await tts.testVoice(store.getSettings().voice);
      out.push({ name: '配音服务（Edge TTS）', ok: bytes > 0, detail: `合成成功，${bytes} 字节` });
    } catch (e) {
      out.push({ name: '配音服务（Edge TTS）', ok: false, detail: e.message || '连接失败，检查网络' });
    }

    const ytdlp = bundledYtdlp() || store.getSettings().ytdlpPath;
    out.push({
      name: '视频链接导入（yt-dlp）',
      ok: !!ytdlp && fs.existsSync(ytdlp),
      detail: ytdlp ? ytdlp : '缺少 yt-dlp.exe',
    });

    try {
      const sharp = require('sharp');
      out.push({ name: '评分图像库（sharp）', ok: true, detail: `版本 ${sharp.versions ? sharp.versions.vips || 'ok' : 'ok'}` });
    } catch (e) {
      out.push({ name: '评分图像库（sharp）', ok: false, detail: e.message });
    }
    return out;
  });

  ipcMain.handle('settings:get', () => store.getSettings());
  ipcMain.handle('settings:set', (e, patch) => {
    const cur = store.getSettings();
    if (patch && patch.voice) {
      if (patch.voice === 'original') {
        if (cur.voice && cur.voice !== 'original') patch.lastVoice = cur.voice;
      } else if (!patch.lastVoice) {
        patch.lastVoice = patch.voice;
      }
    }
    return store.setSettings(patch);
  });

  ipcMain.handle('store:docs', () => store.getDocs());
  ipcMain.handle('store:doc', (e, id) => store.getDoc(id));
  ipcMain.handle('doc:update', (e, { id, patch }) => store.updateDoc(id, patch));
  ipcMain.handle('doc:reorder', (e, ids) => store.reorderDocs(ids));
  ipcMain.handle('doc:remove', (e, id) => {
    store.removeDoc(id);
    return true;
  });

  ipcMain.handle('import:pickFiles', async () => {
    const r = await dialog.showOpenDialog(win, {
      title: '选择要导入的英语素材',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: '全部支持格式', extensions: ['txt', 'md', 'pdf', 'docx', 'srt', 'vtt', 'lrc', 'mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg', 'mp4', 'mov', 'mkv', 'webm', 'avi'] },
        { name: '文本 / 字幕', extensions: ['txt', 'md', 'pdf', 'docx', 'srt', 'vtt', 'lrc'] },
        { name: '音频', extensions: ['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg'] },
        { name: '视频', extensions: ['mp4', 'mov', 'mkv', 'webm', 'avi'] },
      ],
    });
    return r.canceled ? [] : r.filePaths;
  });

  ipcMain.handle('import:file', async (e, filePath) => {
    const s = settingsWithCache();
    const doc = await importFile(filePath, {
      settings: s,
      dirs,
      onProgress: (p) => progress('import', { ...p, file: path.basename(filePath) }),
    });
    store.upsertDoc(doc);
    return doc;
  });

  ipcMain.handle('import:text', async (e, { text, title }) => {
    const s = settingsWithCache();
    const doc = await importText(text, { settings: s, dirs, title });
    store.upsertDoc(doc);
    return doc;
  });

  ipcMain.handle('import:url', async (e, urlStr, taskId) => {
    const s = { ...settingsWithCache(), ytdlpBin: bundledYtdlp() };
    const doc = await importUrl(urlStr, {
      settings: s,
      dirs,
      onProgress: (p) => progress('import', { ...p, file: urlStr, taskId }),
    });
    store.upsertDoc(doc);
    return doc;
  });

  // ---------------- 翻译 ----------------
  ipcMain.handle('translate:doc', async (e, { id, scope = 'all', silent = false }) => {
    const doc = store.getDoc(id);
    if (!doc) throw new Error('素材不存在');
    const s = store.getSettings();
    let targets = doc.segments;
    if (scope === 'missing') targets = doc.segments.filter((x) => !x.zh);

    if (!silent) progress('translate', { phase: 'start', percent: 0, message: `翻译 ${targets.length} 句` });
    const res = await translateTexts(targets.map((t) => t.text), s, {
      onProgress: (p) => { if (!silent) progress('translate', {
        phase: 'run', percent: Math.round((p.done / Math.max(1, p.total)) * 100),
        message: `已翻译 ${p.done}/${p.total}`,
      }); },
    });

    targets.forEach((seg, i) => { if (res.texts[i]) seg.zh = res.texts[i]; });
    store.updateDoc(id, { segments: doc.segments, translated: true });
    if (!silent) progress('translate', { phase: 'done', percent: 100, message: '翻译完成' });
    // 只统计「这次跑完仍然没有中文」的句子，已译好的不再算失败
    const failed = targets.filter((t) => !t.zh).length;
    return { doc, provider: res.provider, failed, error: res.error || null };
  });

  ipcMain.handle('translate:one', async (e, text) => {
    const s = store.getSettings();
    const r = await translateTexts([text], s);
    return r.texts[0] || '';
  });

  ipcMain.handle('translate:testLlm', async (e, llm) => testLlm(llm));

  // ---------------- TTS ----------------
  ipcMain.handle('tts:voices', () => tts.CURATED_VOICES);
  ipcMain.handle('tts:allVoices', async () => tts.listAllVoices());
  ipcMain.handle('tts:testVoice', async (e, voice) => tts.testVoice(voice));

  ipcMain.handle('tts:one', async (e, { text, voice, rate, pitch, volume }) => {
    const s = store.getSettings();
    const r = await tts.ensure(text, {
      voice: voice || s.voice,
      rate: rate || s.rate,
      pitch: pitch || s.pitch,
      volume: volume || s.volume,
    }, dirs.tts);
    return r;
  });

  ipcMain.handle('tts:doc', async (e, { id, onlyMissing = true, silent = false }) => {
    const doc = store.getDoc(id);
    if (!doc) throw new Error('素材不存在');
    const s = { ...store.getSettings() };
    if (s.voice === 'original') s.voice = s.lastVoice || tts.DEFAULT_VOICE;
    const list = onlyMissing ? doc.segments.filter((x) => !x.ttsFile) : doc.segments;
    let done = 0;
    for (const seg of list) {
      try {
        const r = await tts.ensure(seg.text, {
          voice: s.voice, rate: s.rate, pitch: s.pitch, volume: s.volume,
        }, dirs.tts);
        seg.ttsKey = r.key;
        seg.ttsFile = r.file;
        seg.ttsDuration = r.duration;
        seg.ttsVoice = s.voice;
        seg.ttsRate = s.rate;
      } catch (err) {
        seg.ttsError = err.message;
      }
      done++;
      if (!silent) progress('tts', {
        phase: 'run',
        percent: Math.round((done / Math.max(1, list.length)) * 100),
        message: `配音 ${done}/${list.length}`,
      });
    }
    // 纯文本素材：配音生成后用它重算时间轴，保证时间显示与真实配音一致
    if (!doc.hasTiming) {
      let t = 0;
      for (const seg of doc.segments) {
        const d = seg.ttsDuration || 2;
        seg.start = Math.round(t * 100) / 100;
        seg.end = Math.round((t + d) * 100) / 100;
        t += d + store.getSettings().gap;
      }
      doc.duration = Math.round(t * 100) / 100;
    }

    store.updateDoc(id, { segments: doc.segments, ttsDone: doc.segments.filter((x) => x.ttsFile).length, duration: doc.duration });
    if (!silent) progress('tts', { phase: 'done', percent: 100, message: '配音完成' });
    return doc;
  });

  // ---------------- 跟读评分 ----------------
  ipcMain.handle('score:run', async (e, { docId, segId, target, bytes, mime = 'audio/webm', referenceDuration = 0 }) => {
    const doc = store.getDoc(docId);
    const seg = doc ? doc.segments.find((x) => x.id === segId) : null;
    const text = target || (seg ? seg.text : '');
    if (!text) throw new Error('缺少目标句子');

    const recDir = path.join(dirs.rec, docId || 'misc');
    fs.mkdirSync(recDir, { recursive: true });
    const stamp = Date.now();
    const ext = mime.includes('wav') ? '.wav' : mime.includes('ogg') ? '.ogg' : '.webm';
    const rawPath = path.join(recDir, `${segId || 'rec'}-${stamp}${ext}`);
    fs.writeFileSync(rawPath, Buffer.from(bytes));

    progress('score', { phase: 'convert', percent: 10, message: '处理录音' });
    const wavPath = path.join(recDir, `${segId || 'rec'}-${stamp}.wav`);
    await ff.normalizeWav(rawPath, wavPath);

    progress('score', { phase: 'analyze', percent: 25, message: '分析音量与停顿' });
    const audio = await ff.analyze(wavPath);
    const info = await ff.probe(wavPath);

    progress('score', { phase: 'asr', percent: 40, message: '识别你的朗读' });
    const s = settingsWithCache();
    let heard = '';
    try {
      const r = await transcribe(wavPath, {
        model: s.asrModel,
        remoteHost: s.modelHost,
        cacheDir: dirs.models,
        localDir: modelLocalDir(s.asrModel),
        onProgress: (m) => {
          if (m.type === 'stage' && m.stage === 'transcribe') {
            progress('score', { phase: 'asr', percent: 70, message: '识别中…' });
          }
        },
      });
      heard = r.text;
    } catch (err) {
      throw new Error('语音识别失败：' + err.message);
    }

    const result = scoreReading({
      target: text,
      hypothesis: heard,
      duration: info.duration,
      referenceDuration: referenceDuration || (seg && seg.ttsDuration) || 0,
      audio,
      wpm: s.wpm,
    });

    const rec = {
      id: 'r' + stamp,
      at: new Date().toISOString(),
      wavPath,
      rawPath,
      duration: info.duration,
      score: result.score,
      result,
    };

    if (doc && seg) {
      seg.recordings = seg.recordings || [];
      seg.recordings.push(rec);
      seg.lastScore = result.score;
      seg.bestScore = Math.max(seg.bestScore || 0, result.score);
      store.updateDoc(docId, { segments: doc.segments });
    }

    progress('score', { phase: 'done', percent: 100, message: '评分完成' });
    return { ...result, recording: rec };
  });

  // ---------------- 导出 ----------------
  ipcMain.handle('export:mp3', async (e, { docId, kind = 'tts', segIds }) => {
    const doc = store.getDoc(docId);
    if (!doc) throw new Error('素材不存在');
    const segs = segIds
      ? doc.segments.filter((x) => segIds.includes(x.id))
      : doc.segments;

    let files = [];
    if (kind === 'tts' || kind === 'both') {
      const missing = segs.filter((x) => !x.ttsFile);
      if (missing.length) {
        const s = { ...store.getSettings() };
        if (s.voice === 'original') s.voice = s.lastVoice || tts.DEFAULT_VOICE;
        for (const seg of missing) {
          const r = await tts.ensure(seg.text, { voice: s.voice, rate: s.rate, pitch: s.pitch, volume: s.volume }, dirs.tts);
          seg.ttsKey = r.key; seg.ttsFile = r.file; seg.ttsDuration = r.duration;
          seg.ttsVoice = s.voice; seg.ttsRate = s.rate;
        }
        store.updateDoc(docId, { segments: doc.segments });
      }
      files = segs.map((x) => x.ttsFile).filter(Boolean);
    }
    if (kind === 'record' || kind === 'both') {
      const recs = segs.flatMap((x) => (x.recordings || []).slice(-1).map((r) => r.wavPath));
      files = kind === 'both' ? [...files, ...recs] : recs;
    }

    const safeTitle = String(doc.title || 'export').replace(/[\\/:*?"<>|]/g, '_').slice(0, 60);
    const stamp = new Date().toISOString().slice(0, 10);
    const out = path.join(dirs.export,
      `${safeTitle}_${kind === 'record' ? '跟读' : kind === 'both' ? '配音+跟读' : '配音'}_${stamp}.mp3`);

    const texts = kind === 'record' ? [] : segs.map((x) => x.text);
    progress('export', { phase: 'run', percent: 30, message: '合成 mp3…' });
    const r = await exportMp3(files, out, { gap: store.getSettings().gap, texts });
    progress('export', { phase: 'done', percent: 100, message: '导出完成' });
    return r;
  });

  ipcMain.handle('export:sub', async (e, { docId, format = 'srt' }) => {
    const doc = store.getDoc(docId);
    if (!doc) throw new Error('素材不存在');
    const segs = doc.segments;
    const safeTitle = String(doc.title || 'export').replace(/[\\/:*?"<>|]/g, '_').slice(0, 60);
    const content = format === 'lrc' ? buildLrc(segs, doc.title) : buildSrt(segs);
    const out = path.join(dirs.export, `${safeTitle}.${format}`);
    return writeText(out, content);
  });

  // ---------------- 杂项 ----------------
  ipcMain.handle('shell:reveal', (e, p) => {
    if (p && fs.existsSync(p)) {
      shell.showItemInFolder(p);
      return true;
    }
    shell.openPath(dirs.export);
    return true;
  });
  ipcMain.handle('shell:open', (e, u) => shell.openExternal(u));
  ipcMain.handle('spelling:get', () => store.getSpellingStats());

  // ---------------- 词汇 / 拼写题库 ----------------
  ipcMain.handle('vocab:rank', (e, { docId, limit = 300 }) => {
    const doc = store.getDoc(docId);
    if (!doc) return { list: [], bank: vocab.size() };
    const level = store.getSettings().wordLevel;
    const ranked = rankWords(doc.segments, { limit, level });
    const bank = vocab.all();
    const list = ranked.map((w) => ({
      ...w,
      inBank: !!bank[w.word],
      bankInfo: bank[w.word] || null,
    }));
    // 题库只来自当前选中的文章，保证每一题都能在本篇找到例句
    return { list, bank: Object.keys(bank).length };
  });

  ipcMain.handle('vocab:define', async (e, { word, phrase }) => {
    const w = String(word || '').trim();
    // 常见习语直接给地道释义，避免免费翻译通道逐词直译
    const IDIOMS = {
      'piece of cake': '小菜一碟',
      'a piece of cake': '小菜一碟',
      'break the ice': '打破僵局；活跃气氛',
      'once in a blue moon': '千载难逢',
      'hit the books': '用功读书',
      'under the weather': '身体不舒服',
      'cost an arm and a leg': '价格昂贵',
      'let the cat out of the bag': '泄露秘密',
      'on the same page': '想法一致',
      "pull someone's leg": '开玩笑',
      'break a leg': '祝你好运',
      'kill two birds with one stone': '一举两得',
      'better late than never': '迟做总比不做好',
      'practice makes perfect': '熟能生巧',
      'rain cats and dogs': '下倾盆大雨',
    };
    const idiom = IDIOMS[w.toLowerCase()];
    if (idiom) return { word: w, phonetic: '', zh: idiom, defs: [], phrase: true };
    // 短语没有词典条目，直接走翻译通道，避免一直卡在「查词中」
    if (phrase || /\s/.test(w)) {
      try {
        const r = await translateTexts([w], store.getSettings());
        return { word: w, phonetic: '', zh: r.texts[0] || '', defs: [], phrase: true };
      } catch (_) {
        return { word: w, phonetic: '', zh: '短语翻译失败，请稍后再试', defs: [], phrase: true };
      }
    }
    return dict.lookup(w, store.getSettings(), path.join(dirs.base, 'dict-cache.json'));
  });

  // 背生词：释义 + 例句 + 派生词 + 联想记忆
  ipcMain.handle('vocab:detail', async (e, { word }) => {
    const entry = vocab.get(word) || {};
    const lookupP = dict.lookup(word, store.getSettings(), path.join(dirs.base, 'dict-cache.json'));
    const tatoebaP = dict.tatoebaExample(word).catch(() => null);
    const d = await lookupP;
    const zh = (entry.zh || d.zh || '');
    let example = d.example || '';
    let exampleZh = (d.exampleZh || '');
    if (!example) {
      const t = await tatoebaP;
      if (t) { example = t.en; exampleZh = t.zh; }
    }
    return {
      word,
      zh,
      phonetic: d.phonetic || '',
      defs: d.defs || [],
      example,
      exampleZh,
      synonyms: d.synonyms || [],
      family: wordFamily(word),
      mnemonic: mnemonic(word, zh),
      sentence: entry.sentence || '',
      senZh: entry.senZh || '',
      wrong: entry.wrong || 0,
      peek: entry.peek || 0,
    };
  });

  ipcMain.handle('dialog:chooseDir', async (e, { defaultPath = '' } = {}) => {
    const r = await dialog.showOpenDialog(win, {
      title: '选择导出目录',
      defaultPath: defaultPath || dirs['export'] || dirs.base,
      properties: ['openDirectory', 'createDirectory'],
    });
    if (r.canceled || !r.filePaths.length) return { ok: false, canceled: true };
    return { ok: true, path: r.filePaths[0] };
  });
  ipcMain.handle('vocab:exportInfo', () => ({ dir: dirs['export'] || dirs.base }));

  /** 给生词库缺音标/中文的词补数据；后台并发 3，慢慢补完 */
  async function enrichVocabWords(words = [], onProgress = null) {
    const settings = store.getSettings();
    const cache = path.join(dirs.base, 'dict-cache.json');
    let i = 0, done = 0, finished = 0;
    const total = words.length || 1;
    const report = () => { if (onProgress) onProgress({ percent: Math.round(95 * finished / total), done: finished, total: words.length }); };
    const worker = async () => {
      while (i < words.length) {
        const w = words[i++];
        const entry = vocab.get(w);
        if (!entry) { finished++; report(); continue; }
        if (entry.zh && entry.phonetic) { finished++; report(); continue; }
        try {
          const d = await dict.lookup(w, settings, cache);
          // 查词期间用户可能已经把词删了，不能再 add 回去
          if (!vocab.get(w)) { finished++; report(); continue; }
          if (d) {
            vocab.add(w, {
              zh: (entry && entry.zh) || d.zh || '',
              phonetic: (entry && entry.phonetic) || d.phonetic || '',
              phoneticUk: (entry && entry.phoneticUk) || d.phoneticUk || '',
              phoneticUs: (entry && entry.phoneticUs) || d.phoneticUs || '',
              defs: (entry && entry.defs) || d.defs || [],
              enrichedAt: new Date().toISOString(),
            });
            done++;
          }
        } catch (_) {}
        finished++;
        if (finished % 5 === 0 || finished >= words.length) report();
      }
    };
    await Promise.all(Array.from({ length: 5 }, () => worker()));
    report();
    return done;
  }

  // 生词库导出：CSV / TXT，内容是「英文单词 + 中文意思」
  ipcMain.handle('vocab:export', async (e, { format = 'csv', rows = [], fields = {}, targetPath = '' }) => {
    const wantPhonetic = !!fields.phonetic;
    const wantMeaning = fields.meaning !== false;
    const stamp = new Date().toISOString().slice(0, 10);
    const ext = format === 'txt' ? 'txt' : 'csv';
    const name = `生词本-${stamp}.${ext}`;
    let outPath = '';
    if (targetPath && String(targetPath).trim()) {
      const p = String(targetPath).trim();
      // 输入的是完整文件名就直接用；是目录就自动拼上默认文件名
      outPath = path.extname(p).toLowerCase() === '.' + ext
        ? p
        : path.join(p, name);
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
    } else {
      const r = await dialog.showSaveDialog({
        title: '导出单词本',
        defaultPath: path.join(dirs['export'] || dirs.base, name),
        filters: format === 'txt' ? [{ name: '文本文件', extensions: ['txt'] }] : [{ name: 'CSV 文件', extensions: ['csv'] }],
      });
      if (r.canceled || !r.filePath) return { ok: false, canceled: true };
      outPath = r.filePath;
    }
    const list = (rows && rows.length ? rows : Object.values(vocab.all())).map((x) => ({ ...x }));
    // 导出前补齐缺的音标 / 中文，避免用户没点开过生词库就导出空白
    const settings = store.getSettings();
    const cache = path.join(dirs.base, 'dict-cache.json');
    send('vocab-export-progress', { percent: 5, message: '准备导出' });
    let i = 0, finished = 0;
    const total = list.length || 1;
    const worker = async () => {
      while (i < list.length) {
        const it = list[i++];
        if ((!wantMeaning || it.zh) && (!wantPhonetic || it.phonetic)) {
          finished++;
          continue;
        }
        try {
          const d = await dict.lookup(it.word, settings, cache);
          if (d) {
            if (wantMeaning && !it.zh) it.zh = d.zh || '';
            if (wantPhonetic && !it.phonetic) it.phonetic = d.phonetic || '';
          }
        } catch (_) {}
        finished++;
        if (finished % 5 === 0 || finished >= list.length) {
          send('vocab-export-progress', { percent: 5 + Math.round(70 * finished / total), message: `补齐释义 ${finished}/${list.length}` });
        }
      }
    };
    await Promise.all(Array.from({ length: 8 }, () => worker()));
    send('vocab-export-progress', { percent: 80, message: '写入文件' });
    let text;
    const cols = ['word'].concat(wantPhonetic ? ['phonetic'] : []).concat(wantMeaning ? ['meaning'] : []);
    if (format === 'txt') {
      text = list.map((x) => cols.map((c) => String((c === 'word' ? x.word : c === 'phonetic' ? x.phonetic : x.zh) || '').replace(/\t/g, ' ')).join('\t')).join('\n');
    } else {
      const esc = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
      text = cols.join(',') + '\n' + list.map((x) => cols.map((c) => esc((c === 'word' ? x.word : c === 'phonetic' ? x.phonetic : x.zh) || '')).join(',')).join('\n');
    }
    fs.writeFileSync(outPath, '\ufeff' + text, 'utf8');
    send('vocab-export-progress', { percent: 100, message: '导出完成' });
    return { ok: true, path: outPath, count: list.length };
  });

  /** 从 txt / pdf / docx / csv 里抽英文单词进生词库（重复只留一个） */
  ipcMain.handle('vocab:import', async (e) => {
    const r = await dialog.showOpenDialog(win, {
      title: '导入生词（从文件里提取英文单词）',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: '文本 / 表格', extensions: ['txt', 'md', 'pdf', 'docx', 'csv'] }],
    });
    if (r.canceled || !r.filePaths.length) return { ok: false, canceled: true };
    const words = [];
    for (const p of r.filePaths) {
      const ext = path.extname(p).toLowerCase();
      let raw = '';
      try {
        if (ext === '.pdf') raw = await readPdf(p);
        else if (ext === '.docx') raw = await readDocx(p);
        else raw = fs.readFileSync(p, 'utf8');
      } catch (err) {
        throw new Error(`读取 ${path.basename(p)} 失败：${err.message}`);
      }
      // 兼容短语和用逗号 / 斜杠 / 分号 / 竖线分隔的清单
      const cleaned = raw
        .replace(/\ufeff/g, '')
        .replace(/[，、；;|/\\\t]+/g, '\n')
        .replace(/\r/g, '');
      const lines = cleaned.split(/\n+/).map((x) => x.trim()).filter(Boolean);
      const pushPhrase = (p0) => {
        let p1 = p0.replace(/^[^A-Za-z]+|[^A-Za-z'’\- ]+$/g, '')
          .replace(/\s+/g, ' ')
          .trim();
        if (!p1) return;
        const ws = p1.split(' ').filter(Boolean);
        // 只收 1–4 个词的词条；太长的整句退回成单词
        if (ws.length <= 4) {
          const low = p1.toLowerCase();
          if (low.replace(/[^a-z]/g, '').length >= 2) words.push(low);
        } else {
          for (const w of ws) pushPhrase(w);
        }
      };
      for (const line of lines) {
        if (/^[A-Za-z][A-Za-z'’\- ]{0,60}$/.test(line)) pushPhrase(line);
        else {
          const hits = line.match(/[A-Za-z][A-Za-z'’\-]{2,}/g) || [];
          hits.forEach(pushPhrase);
        }
      }
    }
    const uniq = [];
    const seen = new Set();
    for (const w of words) {
      const k = w.toLowerCase().replace(/\.+$/, '');
      if (!k || seen.has(k)) continue;
      seen.add(k);
      uniq.push(k);
    }
    return { ok: true, words: uniq, total: uniq.length };
  });

  ipcMain.handle('vocab:mark', (e, { word, correct = 0, wrong = 0, seen = 0 }) => {
    const payload = {};
    if (correct) payload.correct = correct;
    if (wrong) payload.wrong = wrong;
    if (seen || correct || wrong) payload.seen = seen || 1;
    return vocab.add(word, payload);
  });

  ipcMain.handle('vocab:removeMany', (e, { words = [] } = {}) => {
    for (const w of words) vocab.remove(w);
    return { removed: words.length };
  });

  ipcMain.handle('vocab:add', (e, { word, reason = 'wrong', sentence = '', senZh = '', zh = '' }) => {
    const payload = { sentence, senZh, zh };
    if (reason === 'wrong') payload.wrong = 1;
    else if (reason === 'peek') payload.peek = 1;
    return vocab.add(word, payload);
  });

  ipcMain.handle('vocab:enrich', (e, { words = [] } = {}) => enrichVocabWords(words, (p) => {
    try { e.sender.send('vocab-enrich-progress', p); } catch (_) {}
  }));
  ipcMain.handle('vocab:addMany', (e, { words = [], reason = 'import' } = {}) => {
    const n = vocab.addMany(words, reason === 'import' ? {} : {});
    return { added: n };
  });
  ipcMain.handle('vocab:remove', (e, word) => vocab.remove(word));
  ipcMain.handle('vocab:clear', () => { vocab.clear(); return true; });
  ipcMain.handle('vocab:list', () => vocab.all());
  ipcMain.handle('vocab:seen', (e, word) => vocab.add(word, { seen: 1 }));
  ipcMain.handle('spelling:set', (e, stats) => { store.setSpellingStats(stats); return stats; });

  ipcMain.handle('dialog:savePath', async (e, { defaultName }) => {
    const r = await dialog.showSaveDialog(win, {
      title: '保存文件',
      defaultPath: path.join(dirs.export, defaultName || 'export.mp3'),
    });
    return r.canceled ? null : r.filePath;
  });
  ipcMain.handle('file:copy', async (e, { from, to }) => {
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
    return to;
  });
}
