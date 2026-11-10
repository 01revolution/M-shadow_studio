import { create } from 'zustand';
import * as player from './lib/player.js';

const api = window.api;

function replaceDocIn(list, doc) {
  const i = list.findIndex((d) => d.id === doc.id);
  if (i >= 0) {
    const copy = [...list];
    copy[i] = doc;
    return copy;
  }
  return [doc, ...list];
}

export const useStore = create((set, get) => ({
  ready: false,
  settings: null,
  docs: [],
  activeId: null,
  doc: null,
  view: 'study',
  progress: null,
  toast: null,
  busy: false,
  tasks: [],
  currentIdx: 0,
  loopMode: 'off', // off | single | all | endless
  displayMode: 'both', // both | en | zh | blur
  playbackRate: 1,
  theme: 'light',

  // ---------------------------------------------------------------- 初始化
  init: async () => {
    const [settings, docs] = await Promise.all([api.getSettings(), api.getDocs()]);
    const active = docs[0] || null;
    const theme = (settings && settings.theme) || 'light';
    document.documentElement.setAttribute('data-theme', theme);
    set({
      settings,
      theme,
      displayMode: (settings && settings.displayMode) || 'both',
      docs,
      doc: active,
      activeId: active ? active.id : null,
      ready: true,
      currentIdx: 0,
    });
    api.onProgress((p) => {
      if (p.scope === 'import' && p.taskId) {
        set((st) => ({
          tasks: st.tasks.map((t) => (t.id === p.taskId
            ? { ...t, percent: Math.max(t.percent || 0, p.percent || 0), phase: p.message || t.phase }
            : t)),
        }));
        return;
      }
      set({ progress: p });
      if (p.phase === 'done') {
        setTimeout(() => {
          const cur = get().progress;
          if (cur && cur.phase === 'done') set({ progress: null });
        }, 1200);
      }
    });
  },

  notify: (message, type = 'info') => {
    const id = Date.now();
    set({ toast: { message, type, id } });
    setTimeout(() => {
      if (get().toast && get().toast.id === id) set({ toast: null });
    }, type === 'error' ? 6000 : 2600);
  },

  setView: (view) => {
    player.stop();
    set({ view });
  },

  // ---------------------------------------------------------------- 设置
  patchSettings: async (patch) => {
    const settings = await api.setSettings(patch);
    set({ settings });
    return settings;
  },

  // ---------------------------------------------------------------- 素材
  selectDoc: (id) => {
    if (get().activeId === id) { player.stop(); set({ currentIdx: 0 }); return; }
    player.stop();
    const doc = get().docs.find((d) => d.id === id) || null;
    set({ doc, activeId: id, currentIdx: 0 });
    // 有原声素材就预热音频文件，换篇后第一次播放更跟手
    if (doc && doc.playbackPath) {
      try { player.warm(api.mediaUrl(doc.playbackPath)); } catch (_) {}
    }
  },

  reorderDocs: (from, to) => {
    const list = [...get().docs];
    if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return;
    const [item] = list.splice(from, 1);
    list.splice(to, 0, item);
    set({ docs: list });
    api.reorderDocs(list.map((d) => d.id)).catch(() => {});
  },

  refreshDoc: async (id) => {
    const doc = await api.getDoc(id || get().activeId);
    if (!doc) return;
    set({ doc, docs: replaceDocIn(get().docs, doc) });
    return doc;
  },

  importPaths: async (paths) => {
    if (!paths || !paths.length) return;
    set({ busy: true });
    const added = [];
    try {
      for (const p of paths) {
        const taskId = 'task-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
        const name = String(p).split(/[\\/]/).pop() || '素材';
        set((st) => ({ tasks: [{ id: taskId, title: name, kind: 'file', percent: 15, phase: '读取素材…' }, ...st.tasks] }));
        try {
          const doc = await api.importFile(p);
          set((st) => ({ tasks: st.tasks.map((t) => (t.id === taskId ? { ...t, title: doc.title, percent: 92, phase: '翻译并配音…' } : t)) }));
          const ready = (await get().enrichDoc(doc.id).catch(() => null)) || doc;
          set((st) => ({ docs: replaceDocIn(st.docs, ready), tasks: st.tasks.filter((t) => t.id !== taskId) }));
          added.push(ready);
        } catch (e) {
          set((st) => ({ tasks: st.tasks.filter((t) => t.id !== taskId) }));
          get().notify(`${name}：${e.message || '导入失败'}`, 'error');
        }
      }
      if (added.length) {
        const last = added[added.length - 1];
        const docs = get().docs;
        const fresh = docs.find((d) => d.id === last.id) || last;
        set({ doc: fresh, activeId: fresh.id, currentIdx: 0, view: 'study' });
        if (fresh.playbackPath) get().patchSettings({ voice: 'original' }).catch(() => {});
        get().notify(`已导入 ${added.length} 个素材`);
      }
    } finally {
      set({ busy: false, progress: null });
    }
  },

  pickAndImport: async () => {
    const paths = await api.pickFiles();
    if (paths && paths.length) await get().importPaths(paths);
  },

  importText: async (text, title) => {
    const taskId = 'task-' + Date.now();
    const label = String(title || '').trim() || '粘贴的文本';
    set((st) => ({ tasks: [{ id: taskId, title: label, kind: 'text', percent: 15, phase: '切分句子…' }, ...st.tasks] }));
    try {
      const doc = await api.importText({ text, title });
      set((st) => ({ tasks: st.tasks.map((t) => (t.id === taskId ? { ...t, title: doc.title, percent: 92, phase: '翻译并配音…' } : t)) }));
      // 文章等翻译/配音都补齐后再出现在素材列表
      get().enrichDoc(doc.id).then((fresh) => {
        const ready = fresh || doc;
        set((st) => ({ docs: replaceDocIn(st.docs, ready), doc: ready, activeId: ready.id, currentIdx: 0, view: 'study', tasks: st.tasks.filter((t) => t.id !== taskId), busy: false }));
        get().notify(`已导入 ${ready.segments.length} 句`);
      }).catch(() => {
        set((st) => ({ docs: replaceDocIn(st.docs, doc), doc, activeId: doc.id, currentIdx: 0, view: 'study', tasks: st.tasks.filter((t) => t.id !== taskId), busy: false }));
        get().notify(`已导入 ${doc.segments.length} 句`);
      });
      return doc;
    } catch (e) {
      set((st) => ({ tasks: st.tasks.filter((t) => t.id !== taskId), busy: false }));
      get().notify(e.message || '导入失败', 'error');
      return null;
    }
  },

  importUrl: async (url) => {
    if (!/^https?:\/\//.test(url)) {
      get().notify('请填写以 http(s) 开头的视频链接', 'error');
      return;
    }
    const taskId = 'task-' + Date.now();
    const title = /bilibili|b23\.tv/i.test(url) ? 'B站视频' : '网络视频';
    set((st) => ({ tasks: [{ id: taskId, title, url, percent: 2, phase: '解析链接…' }, ...st.tasks] }));
    // 后台独立导入：不锁界面、不抢当前文章
    api.importUrl(url, taskId).then(async (doc) => {
      set((st) => ({
        docs: replaceDocIn(st.docs, doc),
        tasks: st.tasks.map((t) => (t.id === taskId ? { ...t, percent: 92, phase: '翻译并配音…' } : t)),
      }));
      const st = get();
      if (!st.activeId) {
        set({ doc, activeId: doc.id, currentIdx: 0 });
        if (doc.playbackPath) get().patchSettings({ voice: 'original' }).catch(() => {});
      }
      await get().enrichDoc(doc.id).catch(() => {});
      set((s2) => ({ tasks: s2.tasks.filter((t) => t.id !== taskId) }));
      get().notify(`「${doc.title}」导入完成`);
    }).catch((e) => {
      set((st) => ({ tasks: st.tasks.filter((t) => t.id !== taskId) }));
      get().notify(e.message || '链接导入失败', 'error');
    });
  },

  /** 后台补齐译文与配音，不阻塞界面、不切换当前文章 */
  enrichDoc: async (id) => {
    const s = get().settings || {};
    // 翻译与配音都写同一份 segments，串行执行避免互相覆盖
    if (s.autoTranslate) await api.translateDoc(id, 'missing', true).catch(() => null);
    if (s.autoTts) await api.ttsDoc(id, true, true).catch(() => null);
    const fresh = await api.getDoc(id);
    if (!fresh) return null;
    set((st) => ({
      // 还在后台导入、尚未放进列表的文章不要提前出现
      docs: st.docs.some((d) => d.id === id) ? replaceDocIn(st.docs, fresh) : st.docs,
      doc: st.activeId === id ? fresh : st.doc,
    }));
    return fresh;
  },

  renameDoc: async (id, title) => {
    const t = String(title || '').trim();
    if (!t) return;
    const fresh = await api.updateDoc(id, { title: t });
    if (!fresh) return;
    set((st) => ({
      docs: replaceDocIn(st.docs, fresh),
      doc: st.activeId === id ? fresh : st.doc,
    }));
  },

  togglePinDoc: async (id) => {
    const cur = get().settings.pinnedDocs || [];
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [id, ...cur.filter((x) => x !== id)];
    await get().patchSettings({ pinnedDocs: next });
  },

  removeDoc: (id) => {
    // 列表先立即移除，文件/缓存清理交给后台，不阻塞继续导入
    const pinnedDocs = (get().settings.pinnedDocs || []).filter((x) => x !== id);
    if (pinnedDocs.length !== (get().settings.pinnedDocs || []).length) get().patchSettings({ pinnedDocs }).catch(() => {});
    const docs = get().docs.filter((d) => d.id !== id);
    const next = docs[0] || null;
    set({ docs, doc: next, activeId: next ? next.id : null, currentIdx: 0 });
    api.removeDoc(id).catch(() => {});
  },

  // ---------------------------------------------------------------- 翻译 / 配音
  translateDoc: async (scope = 'all', docId) => {
    const id = docId || get().activeId;
    if (!id) return;
    if (!docId) set({ busy: true });
    try {
      const r = await api.translateDoc(id, scope, !!docId);
      set((st) => ({
        docs: replaceDocIn(st.docs, r.doc),
        doc: st.activeId === id ? r.doc : st.doc,
      }));
      if (r.failed) {
        const hint = r.provider === 'mymemory'
          ? '（免费通道可能今日额度用尽，可在「设置」里填大模型 Key 后继续，或明天再试）'
          : '';
        get().notify(`${r.failed} 句翻译失败${hint}`, 'error');
      }
      else get().notify(`翻译完成（${r.provider}）`);
    } catch (e) {
      get().notify(e.message || '翻译失败', 'error');
    } finally {
      if (!docId) set({ busy: false, progress: null });
    }
  },

  buildTts: async (docId) => {
    const id = docId || get().activeId;
    if (!id) return;
    if (!docId) set({ busy: true });
    try {
      const doc = await api.ttsDoc(id, true, !!docId);
      set((st) => ({
        docs: replaceDocIn(st.docs, doc),
        doc: st.activeId === id ? doc : st.doc,
      }));
      get().notify('配音已生成');
    } catch (e) {
      get().notify(e.message || '配音失败', 'error');
    } finally {
      if (!docId) set({ busy: false, progress: null });
    }
  },

  /** 保证某句有配音文件，返回 {file, duration}；语速变化会重新合成 */
  ensureSegTts: async (seg, opts = {}) => {
    const s = get().settings;
    const doc = get().doc;
    const wanted = opts.voice || s.voice;
    // 「原声」：直接返回片段坐标，由调用方播放素材音轨（视频/音频/链接导入才有）
    if (wanted === 'original') {
      if (doc && doc.playbackPath) {
        return { original: true, file: doc.playbackPath, start: seg.start || 0, end: seg.end || null, duration: seg.ttsDuration };
      }
      // 纯文本素材没有原声 → 回落到上次用的配音音色
      return get().ensureSegTts(seg, { ...opts, voice: s.lastVoice || 'en-GB-SoniaNeural' });
    }
    const rate = opts.rate || s.rate;
    const voice = wanted;
    const sameRate = seg.ttsFile && Math.abs((seg.ttsRate ?? s.rate) - rate) < 0.001;
    // 必须严格比对音色：老素材没有 ttsVoice 记录时视为「音色未知」，重新合成一次
    const sameVoice = !!seg.ttsVoice && seg.ttsVoice === voice;
    if (sameRate && sameVoice) return { file: seg.ttsFile, duration: seg.ttsDuration };
    const r = await api.ttsOne({
      text: seg.text,
      voice,
      rate,
    });
    const liveDoc = get().doc;
    if (liveDoc) {
      const seg2 = liveDoc.segments.find((x) => x.id === seg.id);
      if (seg2) {
        seg2.ttsKey = r.key;
        seg2.ttsFile = r.file;
        seg2.ttsDuration = r.duration;
        seg2.ttsRate = rate;
        seg2.ttsVoice = voice;
        set({ doc: { ...liveDoc }, docs: replaceDocIn(get().docs, liveDoc) });
        api.updateDoc(liveDoc.id, { segments: liveDoc.segments }).catch(() => {});
      }
    }
    return { file: r.file, duration: r.duration };
  },

  // ---------------------------------------------------------------- 交互状态
  shadowToken: 0,
  requestShadow: (idx) => set({ currentIdx: idx, shadowToken: Date.now() }),
  setCurrentIdx: (i) => set({ currentIdx: i }),
  setAutoNext: (v) => set({ autoNext: v }),
  setLoopMode: (v) => set({ loopMode: v }),
  /** 当前实际用于 TTS 的音色（「原声」模式下回落到上次的配音音色） */
  ttsVoice: () => {
    const s = get().settings || {};
    return s.voice === 'original' ? (s.lastVoice || 'en-GB-SoniaNeural') : s.voice;
  },
  setTheme: (v) => {
    document.documentElement.setAttribute('data-theme', v);
    set({ theme: v });
    get().patchSettings({ theme: v }).catch(() => {});
  },

  setDisplayMode: (v) => {
    set({ displayMode: v });
    api.setSettings({ displayMode: v }).catch(() => {});
  },
  setPlaybackRate: (v) => set({ playbackRate: v }),

  // ---------------------------------------------------------------- 导出
  exportMp3: async (kind) => {
    const id = get().activeId;
    if (!id) return;
    set({ busy: true });
    try {
      const r = await api.exportMp3({ docId: id, kind });
      get().notify(`已导出：${r.file.split(/[\\/]/).pop()}`);
      return r;
    } catch (e) {
      get().notify(e.message || '导出失败', 'error');
      return null;
    } finally {
      set({ busy: false, progress: null });
    }
  },

  exportSub: async (format) => {
    const id = get().activeId;
    if (!id) return;
    try {
      const r = await api.exportSub({ docId: id, format });
      get().notify(`已导出字幕：${r.file.split(/[\\/]/).pop()}`);
      return r;
    } catch (e) {
      get().notify(e.message || '字幕导出失败', 'error');
      return null;
    }
  },
}));
