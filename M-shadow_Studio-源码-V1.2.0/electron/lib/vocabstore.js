/** 生词库：拼错、或看过中文/提示的词自动进来，后面会再随机出现 */
const fs = require('fs');
const path = require('path');

function createVocab(file) {
  let state = { words: {} };
  try { if (fs.existsSync(file)) state = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { state = { words: {} }; }
  state.words = state.words || {};

  function save() {
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(state, null, 2), 'utf8');
    } catch (_) {}
  }

  return {
    all: () => ({ ...state.words }),
    get(word) { return state.words[String(word || '').toLowerCase()] || null; },
    add(word, payload = {}) {
      const k = String(word || '').toLowerCase().trim();
      if (!k) return null;
      const old = state.words[k] || { word: k, wrong: 0, peek: 0, seen: 0, correct: 0, createdAt: new Date().toISOString() };
      const next = {
        ...old,
        ...payload,
        word: k,
        wrong: payload.wrong === undefined ? old.wrong : (old.wrong || 0) + payload.wrong,
        peek: payload.peek === undefined ? (old.peek || 0) : (old.peek || 0) + payload.peek,
        seen: payload.seen === undefined ? (old.seen || 0) : (old.seen || 0) + payload.seen,
        correct: payload.correct === undefined ? (old.correct || 0) : (old.correct || 0) + payload.correct,
        lastSeenAt: payload.seen || payload.correct ? new Date().toISOString() : (old.lastSeenAt || null),
        updatedAt: new Date().toISOString(),
      };
      state.words[k] = next;
      save();
      return next;
    },
    addMany(words = [], payload = {}) {
      let n = 0;
      for (const word of words) {
        const k = String(word || '').toLowerCase().trim();
        if (!k) continue;
        const old = state.words[k] || { word: k, wrong: 0, peek: 0, seen: 0, correct: 0, createdAt: new Date().toISOString() };
        state.words[k] = { ...old, ...payload, word: k, updatedAt: new Date().toISOString() };
        n++;
      }
      if (n) save();
      return n;
    },
    remove(word) {
      const k = String(word || '').toLowerCase();
      delete state.words[k];
      save();
      return true;
    },
    clear() { state.words = {}; save(); return true; },
    size: () => Object.keys(state.words).length,
  };
}

module.exports = { createVocab };
