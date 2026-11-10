/** 词性缩写：noun → n.，verb → v. */
function shortPos(pos) {
  const p = String(pos || '').toLowerCase();
  const map = {
    noun: 'n.', verb: 'v.', adjective: 'adj.', adverb: 'adv.', pronoun: 'pron.',
    preposition: 'prep.', conjunction: 'conj.', interjection: 'int.', determiner: 'det.',
    numeral: 'num.', article: 'art.', auxiliary: 'aux.', 'auxiliary verb': 'aux.', particle: 'part.',
    exclamation: 'int.', phrase: 'phr.',
  };
  return map[p] || (p ? p + '.' : '');
}

/** 单词释义：先查英文词典接口，再翻成中文；带本地缓存 */
const fs = require('fs');
const path = require('path');

let translateTexts = null;
try { translateTexts = require('./translate').translateTexts; } catch (_) { translateTexts = null; }

function readCache(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return {}; }
}
function writeCache(file, data) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
  } catch (_) {}
}

async function fetchJson(url, timeout = 6000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'M-ShadowStudio/1.0' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}


/** 有道词典公开接口：中文释义带词性缩写、音标、双语句例（国内可直连） */
async function youdaoEntry(word) {
  try {
    const j = await fetchJson('https://dict.youdao.com/jsonapi?q=' + encodeURIComponent(word) + '&le=en', 6000);
    const ec = j && j.ec && j.ec.word && j.ec.word[0];
    const simple = j && j.simple && j.simple.word && j.simple.word[0];
    const ukphone = (ec && ec.ukphone) || (simple && simple.ukphone) || '';
    const usphone = (ec && ec.usphone) || (simple && simple.usphone) || '';
    const phonetic = ukphone || usphone || '';
    const defs = [];
    if (ec && Array.isArray(ec.trs)) {
      for (const t of ec.trs) {
        const lines = (t.tr || []).map((x) => (x.l && x.l.i && x.l.i[0]) || '').filter(Boolean);
        lines.forEach((l) => defs.push(String(l).trim()));
      }
    }
    let example = '';
    let exampleZh = '';
    const pairs = j && j.blng_sents_part && j.blng_sents_part['sentence-pair'];
    if (Array.isArray(pairs) && pairs.length) {
      const pick = pairs.find((p) => p['sentence-eng'] && p['sentence-eng'].length < 150) || pairs[0];
      example = String(pick['sentence-eng'] || pick.sentence || '').replace(/<[^>]+>/g, '').trim();
      exampleZh = String(pick['sentence-translation'] || '').trim();
    }
    if (!defs.length && !phonetic) return null;
    return { phonetic, ukphone, usphone, defs: defs.slice(0, 6), example, exampleZh };
  } catch (_) {
    return null;
  }
}

/** 取英文词典里的释义（dictionaryapi.dev，免 key） */
async function englishSenses(word) {
  try {
    const j = await fetchJson('https://api.dictionaryapi.dev/api/v2/entries/en/' + encodeURIComponent(word));
    const entry = Array.isArray(j) ? j[0] : null;
    if (!entry) return null;
    const phon = entry.phonetic || (entry.phonetics || []).map((p) => p.text).find(Boolean) || '';
    const senses = [];
    const examples = [];
    const syns = [];
    for (const m of entry.meanings || []) {
      for (const d of (m.definitions || []).slice(0, 3)) {
        if (d.definition) senses.push({ pos: m.partOfSpeech || '', def: d.definition });
        if (d.example) examples.push(d.example);
        (d.synonyms || []).forEach((x) => syns.push(x));
      }
      (m.synonyms || []).forEach((x) => syns.push(x));
      if (senses.length >= 4) break;
    }
    return {
      phonetic: phon,
      senses: senses.slice(0, 3),
      example: examples.find((x) => x && x.length > 6 && x.length < 160) || '',
      synonyms: [...new Set(syns)].slice(0, 8),
    };
  } catch (_) {
    return null;
  }
}

/**
 * 查一个词的释义（中文优先，查不到退英文原文）
 * @returns {{word, zh, pos, phonetic, defs, source}}
 */
async function lookup(word, settings, cacheFile) {
  const key = String(word || '').toLowerCase().trim();
  if (!key) return { word: key, zh: '', pos: '', defs: [] };
  const cache = readCache(cacheFile);
  // 有缓存就直接用（含只查到英文释义的），避免每次都等网络
  // 只信任 v2 缓存（v1 存的是纯英文释义，需要重查中文）
  if (cache[key] && cache[key].v === 3) {
    const style = (settings && settings.phoneticStyle) || 'dj';
    const c = cache[key];
    return { ...c, phonetic: (style === 'kk' ? (c.phoneticUs || c.phoneticUk) : (c.phoneticUk || c.phoneticUs)) || c.phonetic || '' };
  }

  // 有道（中文）和英文词典并行查，谁先回来用谁，别串行等两次网络
  const [yd, en] = await Promise.all([youdaoEntry(key), englishSenses(key)]);
  const defs = yd && yd.defs.length
    ? yd.defs
    : (en ? en.senses.map((sense) => `(${shortPos(sense.pos)}) ${sense.def}`) : []);
  const example = (yd && yd.example) || (en ? en.example : '');
  const exampleZh = (yd && yd.exampleZh) || '';
  const synonyms = en ? en.synonyms : [];
  let zh = yd && yd.defs.length ? yd.defs.slice(0, 2).join('；') : '';
  let source = zh ? 'youdao' : 'dict';
  if (!zh && translateTexts) {
    const targets = defs.length ? defs : [key];
    try {
      const r = await translateTexts(targets, settings || {});
      const arr = (r.texts || []).filter(Boolean);
      if (arr.length) zh = arr.join('；');
    } catch (_) {}
  }
  if (!zh) {
    // 词典释义没翻出来 → 直接翻这个词
    if (translateTexts) {
      try {
        const r = await translateTexts([key], settings || {});
        zh = (r.texts || [])[0] || '';
      } catch (_) {}
    }
    source = 'translate';
  }
  const uk = (yd && yd.ukphone) || '';
  const us = (yd && yd.usphone) || '';
  const style0 = (settings && settings.phoneticStyle) || 'dj';
  const phonetic = (style0 === 'kk' ? (us || uk) : (uk || us)) || (yd && yd.phonetic) || (en ? en.phonetic : '');
  const out = {
    word: key,
    zh: zh || '',
    pos: defs.length && en ? (en.senses[0].pos || '') : '',
    phonetic,
    phoneticUk: uk,
    phoneticUs: us,
    pos: '',
    defs,
    example,
    exampleZh,
    synonyms,
    source,
    v: 3,
    at: Date.now(),
  };
  // 查不到也缓存，避免下次再等十几秒（30 天后自然会被覆盖刷新）
  cache[key] = out;
  writeCache(cacheFile, cache);
  return out;
}

/** 例句兜底：Tatoeba 公开语料（带中文翻译时一并取出） */
async function tatoebaExample(word) {
  try {
    const j = await fetchJson(
      'https://tatoeba.org/en/api_v0/search?query=' + encodeURIComponent(word) + '&from=eng&to=cmn&sort=relevance',
      12000
    );
    const r = (j.results || [])[0];
    if (!r || !r.text) return null;
    const tr = (r.translations || []).flat().find((t) => t && t.text && /cmn|zho/.test(t.lang || ''));
    return { en: r.text, zh: tr ? tr.text : '' };
  } catch (_) {
    return null;
  }
}

module.exports = { lookup, englishSenses, tatoebaExample };
