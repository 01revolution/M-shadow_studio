/**
 * 翻译：多通道适配（MyMemory 免费 / Google 免费端点 / 任意 OpenAI 兼容大模型）
 * 支持自动降级，结果带内存缓存。
 */
const crypto = require('crypto');

const cache = new Map();
const EMIT = 1000;

function key(text, provider) {
  return crypto.createHash('sha1').update(provider + '|' + text).digest('hex');
}

async function fetchJson(url, { timeout = 8000, headers = {} } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

/** MyMemory：免费，国内可直连，质量中等 */
async function myMemoryOne(text) {
  const chunks = text.length > 450 ? splitByLength(text, 450) : [text];
  const parts = [];
  for (const c of chunks) {
    const url = 'https://api.mymemory.translated.net/get?q=' + encodeURIComponent(c) + '&langpair=en|zh-CN';
    const j = await fetchJson(url);
    const t = j?.responseData?.translatedText || '';
    if (/MYMEMORY WARNING|QUERY LENGTH LIMIT/i.test(t)) throw new Error('MyMemory 今日额度已用完');
    parts.push(t);
  }
  return parts.join('');
}

/** Google 免费端点：质量好，但国内网络通常不可用 */
async function googleOne(text) {
  const chunks = text.length > 400 ? splitByLength(text, 400) : [text];
  const parts = [];
  for (const c of chunks) {
    const url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-CN&dt=t&q='
      + encodeURIComponent(c);
    const j = await fetchJson(url);
    if (!Array.isArray(j?.[0])) throw new Error('Google 翻译返回异常');
    parts.push(j[0].map((x) => x[0]).join(''));
  }
  return parts.join('');
}

/** 大模型批量翻译：一次请求整篇，质量最好 */
async function llmBatch(texts, llm) {
  const base = (llm.baseUrl || '').replace(/\/$/, '');
  const endpoint = base.endsWith('/chat/completions') ? base : base + '/chat/completions';
  const body = {
    model: llm.model,
    temperature: 0.2,
    messages: [
      {
        role: 'system',
        content: '你是英语教学翻译。把用户给出的每一行英文翻译成自然、口语化的简体中文，'
          + '保持逐行一一对应，不要合并、不要增删条目、不要解释。'
          + '特别注意习语、固定搭配和短语，要译出地道含义而不是逐词直译，'
          + '例如 piece of cake 应译为“小菜一碟”，不能译成“一块蛋糕”。'
          + '只输出 JSON：{"translations":["...","..."]}',
      },
      { role: 'user', content: JSON.stringify({ lines: texts }) },
    ],
  };
  const r = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${llm.apiKey}` },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error('大模型接口 HTTP ' + r.status);
  const j = await r.json();
  const content = j?.choices?.[0]?.message?.content || '';
  const m = content.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('大模型返回内容无法解析');
  const parsed = JSON.parse(m[0]);
  const arr = parsed.translations || parsed.lines || parsed.result;
  if (!Array.isArray(arr)) throw new Error('大模型返回结构不对');
  return arr.map((x) => String(x || '').trim());
}

function splitByLength(text, max) {
  const words = text.split(/(\s+)/);
  const out = [];
  let cur = '';
  for (const w of words) {
    if ((cur + w).length > max && cur) { out.push(cur); cur = w.trim(); }
    else cur += w;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

async function pool(items, limit, fn) {
  const out = new Array(items.length).fill(null);
  let i = 0;
  const workers = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    while (i < items.length) {
      const idx = i++;
      try { out[idx] = await fn(items[idx], idx); } catch (e) { out[idx] = null; }
    }
  });
  await Promise.all(workers);
  return out;
}

/**
 * 翻译一组句子
 * @returns {Promise<{texts: (string|null)[], provider: string, failed: number}>}
 */
async function translateTexts(texts, settings, { onProgress } = {}) {
  if (!texts || !texts.length) return { texts: [], provider: 'none', failed: 0 };

  let provider = settings.translateProvider || 'auto';
  const llmReady = settings.llm && settings.llm.apiKey && settings.llm.baseUrl && settings.llm.model;
  if (provider === 'auto') provider = llmReady ? 'llm' : 'mymemory';

  const results = new Array(texts.length).fill(null);
  const pending = [];

  texts.forEach((t, i) => {
    const ck = key(t, provider);
    if (cache.has(ck)) results[i] = cache.get(ck);
    else pending.push(i);
  });

  const norm = (x) => String(x || '').toLowerCase().replace(/[^a-z\u4e00-\u9fa5]/g, '');
  const finish = (i, val) => {
    // 有些免费通道在额度用尽时会原样返回英文，这里判为失败
    const clean = (val && norm(val) !== norm(texts[i])) ? val : null;
    results[i] = clean;
    if (clean) cache.set(key(texts[i], provider), clean);
  };

  try {
    if (provider === 'llm') {
      const arr = await llmBatch(pending.map((i) => texts[i]), settings.llm);
      pending.forEach((idx, k) => finish(idx, arr[k] || null));
    } else {
      const fn = provider === 'google' ? googleOne : myMemoryOne;
      let done = 0;
      const vals = await pool(pending.map((i) => texts[i]), 4, async (t) => {
        const v = await fn(t);
        done++;
        if (onProgress) onProgress({ done, total: pending.length });
        return v;
      });
      pending.forEach((idx, k) => finish(idx, vals[k]));
    }
  } catch (e) {
    // 主通道整体失败 → 自动换备用通道
    const alt = provider === 'google' ? 'mymemory' : 'google';
    try {
      const fn = alt === 'google' ? googleOne : myMemoryOne;
      const vals = await pool(pending.map((i) => texts[i]), 4, async (t) => fn(t));
      pending.forEach((idx, k) => finish(idx, vals[k]));
      provider = alt;
    } catch (e2) {
      return { texts: results, provider, failed: pending.length, error: e.message };
    }
  }

  const failed = results.filter((r) => !r).length;
  return { texts: results, provider, failed };
}

async function testLlm(llm) {
  const arr = await llmBatch(['Hello, how are you?'], llm);
  return arr[0];
}

module.exports = { translateTexts, testLlm, myMemoryOne, googleOne, llmBatch };
