/** 配置与素材库持久化（JSON 文件，无需数据库） */
const fs = require('fs');
const path = require('path');

let ttsLib = null;
try { ttsLib = require('./tts'); } catch (_) { ttsLib = null; }

const DEFAULT_SETTINGS = {
  voice: 'en-GB-SoniaNeural',   // 默认英式女声；'original' = 素材原声
  lastVoice: 'en-GB-SoniaNeural', // 「原声」模式下仍记住上次的配音音色
  rate: 1.0,                 // 1.0 正常；0.8 慢速
  pitch: 'default',
  volume: 'default',
  translateProvider: 'auto', // auto | mymemory | google | llm
  llm: { baseUrl: '', apiKey: '', model: '' },
  asrModel: 'Xenova/whisper-small.en',
  modelHost: 'https://hf-mirror.com', // 国内可用的模型镜像
  wpm: 150,
  gap: 0.35,
  autoTranslate: true,
  autoTts: true,
  ytdlpPath: '',
  proxy: '',
  shadowPlayMode: 'tts',      // tts | original
  displayMode: 'both',        // both | en | zh | blur
  preListen: true,            // 跟读前先播一遍（可选）
  hotkeys: {
    study: { replay: '1', meaning: '0', hint: '2', next: 'ArrowRight' },
    spelling: { replay: '1', meaning: '0', hint: '2', next: 'ArrowRight' },
    vocab: {
      replay: '1', meaning: '0', hint: '2', next: 'ArrowRight',
      known: 'ArrowUp', unknown: 'ArrowDown', tooEasy: '6', rewrite: '9',
    },
  },
  autoSpeakSpell: false,   // 听写页自动播报（默认关）
  autoSpeakVocab: false,   // 背生词页自动播报（默认关）
  theme: 'light',
  singleLoopCount: 5,        // 单句循环次数
  allLoopCount: 5,           // 全篇循环次数
  spellMax: 100,             // 听写题量上限（最小 100，可调到 9999）
  spellCount: 10,            // 听写默认题量
  spellWrongLimit: 1,        // 背单词允许拼错几次后才亮出答案
  vocabPageSize: 20,         // 生词本一页的词数
  wordLevel: 3,              // 单词拼写取词策略 0–9（0 基础 / 9 英语专业）
  phoneticStyle: 'dj',       // 音标体系：dj = DJ 英式，kk = KK 美式
  autoPreviewVoice: true,    // 选完音色是否自动试听当前句
  pinnedDocs: [],            // 置顶素材 id，越靠前越新置顶
  sentenceHintPercent: 60,   // 整句拼写提示百分比：越高，挖空的词越少
};

/** 老版本里可能存着已下线的音色，统一回落到默认英音，避免整篇配音全崩 */
function sanitizeVoice(voice) {
  if (!voice) return DEFAULT_SETTINGS.voice;
  if (voice === 'original') return voice; // 原声（视频/音频原音）
  const V = ttsLib && ttsLib.VALID_VOICES;
  if (V) {
    const known = typeof V.has === 'function' ? V.has(voice) : Array.isArray(V) && V.includes(voice);
    return known ? voice : (ttsLib.DEFAULT_VOICE || DEFAULT_SETTINGS.voice);
  }
  return voice;
}

function readJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_) {
    return fallback;
  }
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

function createStore(storePath) {
  let state = readJson(storePath, null) || { settings: { ...DEFAULT_SETTINGS }, docs: [], lastDocId: null, spellingStats: {} };
  state.settings = { ...DEFAULT_SETTINGS, ...(state.settings || {}) };
  if (state.settings.asrModel === 'Xenova/whisper-base.en') state.settings.asrModel = 'Xenova/whisper-small.en';
  state.settings.voice = sanitizeVoice(state.settings.voice);
  // 老版本默认是美音 Aria；本次默认改为英音，帮老用户平滑切过去（仍可随时在跟读面板改回）
  if (!state.settings.voiceMigrated) {
    if (state.settings.voice === 'en-US-AriaNeural') state.settings.voice = 'en-GB-SoniaNeural';
    state.settings.voiceMigrated = true;
  }
  state.docs = state.docs || [];
  // 快捷键：老版本是扁平结构，升级成 学习 / 听写 / 背生词 三组
  {
    const def = DEFAULT_SETTINGS.hotkeys;
    const h = state.settings.hotkeys || {};
    const flat = h.replay ? h : null;
    state.settings.hotkeys = {
      study: { ...def.study, ...(h.study || (flat ? { replay: flat.replay, meaning: flat.meaning, hint: flat.hint, next: flat.next } : {})) },
      spelling: { ...def.spelling, ...(h.spelling || (flat ? { replay: flat.replay, meaning: flat.meaning, hint: flat.hint, next: flat.next } : {})) },
      vocab: { ...def.vocab, ...(h.vocab || (flat ? {
        replay: flat.replay, meaning: flat.meaning, hint: flat.hint, next: flat.next,
        tooEasy: flat.tooEasy, rewrite: flat.rewrite,
      } : {})) },
    };
  }
  const sm = Math.max(100, Math.min(9999, parseInt(state.settings.spellMax, 10) || 100));
  state.settings.spellMax = sm;
  state.settings.spellCount = Math.max(5, Math.min(sm, parseInt(state.settings.spellCount, 10) || 10));
  state.settings.spellWrongLimit = Math.max(1, Math.min(9, parseInt(state.settings.spellWrongLimit, 10) || 1));
  state.settings.wordLevel = Math.max(0, Math.min(9, parseInt(state.settings.wordLevel, 10) || 0));
  if (state.settings.phoneticStyle !== 'kk') state.settings.phoneticStyle = 'dj';
  state.settings.sentenceHintPercent = Math.max(10, Math.min(95, parseInt(state.settings.sentenceHintPercent, 10) || 60));

  function save() { writeJson(storePath, state); }

  return {
    getSettings: () => ({ ...state.settings }),
    setSettings(patch) {
      const p = { ...patch };
      if (p.voice) p.voice = sanitizeVoice(p.voice);
      state.settings = { ...state.settings, ...p };
      save();
      return { ...state.settings };
    },
    getDocs: () => state.docs,
    getDoc(id) { return state.docs.find((d) => d.id === id) || null; },
    upsertDoc(doc) {
      const i = state.docs.findIndex((d) => d.id === doc.id);
      if (i >= 0) state.docs[i] = doc; else state.docs.unshift(doc);
      state.lastDocId = doc.id;
      save();
      return doc;
    },
    updateDoc(id, patch) {
      const d = this.getDoc(id);
      if (!d) return null;
      Object.assign(d, patch);
      save();
      return d;
    },
    removeDoc(id) {
      state.docs = state.docs.filter((d) => d.id !== id);
      if (state.lastDocId === id) state.lastDocId = state.docs[0]?.id || null;
      save();
    },
    reorderDocs(ids) {
      if (!Array.isArray(ids) || !ids.length) return state.docs;
      const map = new Map(state.docs.map((d) => [d.id, d]));
      const next = ids.map((id) => map.get(id)).filter(Boolean);
      // 没在 id 列表里的（理论上不会有）补在后面，保证不丢数据
      state.docs.forEach((d) => { if (!ids.includes(d.id)) next.push(d); });
      state.docs = next;
      save();
      return state.docs;
    },
    getLastDocId: () => state.lastDocId,
    setLastDocId(id) { state.lastDocId = id; save(); },
    getSpellingStats: () => state.spellingStats || {},
    setSpellingStats(s) { state.spellingStats = s; save(); },
  };
}

module.exports = { createStore, DEFAULT_SETTINGS };
