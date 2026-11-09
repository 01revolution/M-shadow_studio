const { contextBridge, ipcRenderer } = require('electron');

const invoke = (ch, arg) => ipcRenderer.invoke(ch, arg);

function mediaUrl(p) {
  if (!p) return '';
  const b64 = Buffer.from(String(p), 'utf8').toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return 'media://local/' + b64;
}

contextBridge.exposeInMainWorld('api', {
  platform: process.platform,
  setTitleBar: (p) => invoke('window:titlebar', p),
  winMin: () => invoke('window:minimize'),
  winToggleMax: () => invoke('window:toggleMax'),
  winClose: () => invoke('window:close'),
  mediaUrl,

  info: () => invoke('app:info'),
  diagnose: () => invoke('app:diagnose'),
  getSettings: () => invoke('settings:get'),
  setSettings: (patch) => invoke('settings:set', patch),

  pickFiles: () => invoke('import:pickFiles'),
  importFile: (p) => invoke('import:file', p),
  importText: (payload) => invoke('import:text', payload),
  importUrl: (u, taskId) => invoke('import:url', u, taskId),

  getDocs: () => invoke('store:docs'),
  getDoc: (id) => invoke('store:doc', id),
  updateDoc: (id, patch) => invoke('doc:update', { id, patch }),
  reorderDocs: (ids) => invoke('doc:reorder', ids),
  removeDoc: (id) => invoke('doc:remove', id),

  translateDoc: (id, scope, silent = false) => invoke('translate:doc', { id, scope, silent }),
  translateOne: (text) => invoke('translate:one', text),
  testLlm: (llm) => invoke('translate:testLlm', llm),

  voices: () => invoke('tts:voices'),
  allVoices: () => invoke('tts:allVoices'),
  testVoice: (voice) => invoke('tts:testVoice', voice),
  ttsOne: (payload) => invoke('tts:one', payload),
  ttsDoc: (id, onlyMissing = true, silent = false) => invoke('tts:doc', { id, onlyMissing, silent }),

  score: (payload) => invoke('score:run', payload),

  exportMp3: (payload) => invoke('export:mp3', payload),
  exportSub: (payload) => invoke('export:sub', payload),

  reveal: (p) => invoke('shell:reveal', p),
  openExternal: (u) => invoke('shell:open', u),
  savePath: (defaultName) => invoke('dialog:savePath', { defaultName }),
  copyFile: (from, to) => invoke('file:copy', { from, to }),

  vocabRank: (payload) => invoke('vocab:rank', payload),
  vocabDefine: (payload) => invoke('vocab:define', payload),
  vocabAdd: (payload) => invoke('vocab:add', payload),
  vocabAddMany: (payload) => invoke('vocab:addMany', payload),
  vocabRemove: (word) => invoke('vocab:remove', word),
  vocabRemoveMany: (words) => invoke('vocab:removeMany', { words }),
  vocabClear: () => invoke('vocab:clear'),
  vocabList: () => invoke('vocab:list'),
  vocabDetail: (payload) => invoke('vocab:detail', payload),
  vocabExport: (payload) => invoke('vocab:export', payload),
  vocabExportInfo: () => invoke('vocab:exportInfo'),
  chooseDir: (payload) => invoke('dialog:chooseDir', payload),
  vocabSeen: (word) => invoke('vocab:seen', word),
  vocabImport: () => invoke('vocab:import'),
  vocabEnrich: (payload) => invoke('vocab:enrich', payload),
  asrModels: () => invoke('asr:models'),
  vocabMark: (payload) => invoke('vocab:mark', payload),

  getSpellingStats: () => invoke('spelling:get'),
  setSpellingStats: (s) => invoke('spelling:set', s),

  onVocabEnrichProgress: (cb) => {
    const handler = (e, d) => cb(d);
    ipcRenderer.on('vocab-enrich-progress', handler);
    return () => ipcRenderer.removeListener('vocab-enrich-progress', handler);
  },
  onVocabExportProgress: (cb) => {
    const handler = (e, d) => cb(d);
    ipcRenderer.on('vocab-export-progress', handler);
    return () => ipcRenderer.removeListener('vocab-export-progress', handler);
  },
  onProgress: (cb) => {
    const handler = (e, d) => cb(d);
    ipcRenderer.on('progress', handler);
    return () => ipcRenderer.removeListener('progress', handler);
  },
});
