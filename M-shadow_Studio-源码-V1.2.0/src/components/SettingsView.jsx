import React, { useEffect, useRef, useState } from 'react';
import { useStore } from '../store.js';
import * as player from '../lib/player.js';

const api = window.api;
let lastScroll = { top: 0, at: 0 };

function HotkeyInput({ label, value, onSet }) {
  return (
    <div className="hotkey-item">
      <span>{label}</span>
      <input
        className="hotkey-input"
        readOnly
        value={value}
        placeholder="按一个键"
        onKeyDown={(e) => {
          e.preventDefault();
          if (e.key === 'Escape') return;
          onSet(e.key);
        }}
      />
    </div>
  );
}

function Field({ label, help, children }) {
  return (
    <div className="field">
      <div>
        <div className="field-label">{label}</div>
        {help ? <div className="field-help">{help}</div> : null}
      </div>
      <div>{children}</div>
    </div>
  );
}

export default function SettingsView() {
  const settings = useStore((s) => s.settings);
  const patchSettings = useStore((s) => s.patchSettings);
  const notify = useStore((s) => s.notify);

  const [info, setInfo] = useState(null);
  const [asrModels, setAsrModels] = useState([]);
  const wrapRef = useRef(null);

  const [testResult, setTestResult] = useState('');
  const [diag, setDiag] = useState(null);
  const [diagRunning, setDiagRunning] = useState(false);

  async function runDiagnose() {
    setDiagRunning(true);
    try {
      const r = await api.diagnose();
      setDiag(r);
    } catch (e) {
      setDiag([{ name: '自检', ok: false, detail: e.message || '检测失败' }]);
    } finally {
      setDiagRunning(false);
    }
  }

  useEffect(() => {
    api.info().then(setInfo).catch(() => {});
  }, []);

  // 离开设置页 1 分钟内再回来，回到原来的滚动位置
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    if (Date.now() - lastScroll.at < 60000) {
      requestAnimationFrame(() => { el.scrollTop = lastScroll.top; });
    }
    const onScroll = () => { lastScroll = { top: el.scrollTop, at: Date.now() }; };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  if (!settings) return null;

  useEffect(() => {
    api.asrModels().then((r) => setAsrModels((r && r.models) || [])).catch(() => setAsrModels([]));
  }, []);

  const save = (patch) => patchSettings(patch).catch((e) => notify(e.message, 'error'));

  const asrOptions = (asrModels.length ? asrModels : [
    { id: 'Xenova/whisper-small.en', name: 'small.en', size: 250 * 1024 * 1024, builtin: true },
    { id: 'Xenova/whisper-tiny.en', name: 'tiny.en', size: 42 * 1024 * 1024, builtin: true },
  ]).slice();
  if (settings && settings.asrModel && !asrOptions.some((m) => m.id === settings.asrModel)) {
    asrOptions.push({ id: settings.asrModel, name: String(settings.asrModel).split('/').pop(), size: 0, builtin: false });
  }

  async function testTranslate() {
    setTestResult('正在测试翻译…');
    try {
      if (settings.translateProvider === 'llm' || (settings.translateProvider === 'auto' && settings.llm.apiKey)) {
        const t = await api.testLlm(settings.llm);
        setTestResult('大模型翻译可用：' + t);
      } else {
        const t = await api.translateOne('Practice makes perfect.');
        setTestResult(t ? '免费通道可用：' + t : '免费通道无返回，可能额度用尽');
      }
    } catch (e) {
      setTestResult('翻译测试失败：' + (e.message || ''));
    }
  }

  return (
    <div className="settings-wrap" ref={wrapRef}>
      <div className="settings-inner">

        <div className="settings-section-title">一、学习与跟读</div>
        <div className="settings-section-hint">跟读播放、循环次数，改了立刻生效。</div>

        <div className="setting-card">
          <h3>跟读循环</h3>
          <p className="setting-desc">控制跟读页面「单句循环 / 全篇循环」每一轮重复多少次。</p>

          <Field label="单句循环次数" help="循环方式选「单句循环」时，每句重复多少遍">
            <input
              type="number" min={1} max={50} style={{ width: 100 }}
              value={settings.singleLoopCount}
              onChange={(e) => save({ singleLoopCount: Math.max(1, Math.min(50, parseInt(e.target.value, 10) || 5)) })}
            />
          </Field>

          <Field label="全篇循环次数" help="循环方式选「全篇循环」时，从当前句读到最后重复多少遍">
            <input
              type="number" min={1} max={50} style={{ width: 100 }}
              value={settings.allLoopCount}
              onChange={(e) => save({ allLoopCount: Math.max(1, Math.min(50, parseInt(e.target.value, 10) || 5)) })}
            />
          </Field>

        </div>

        <div className="setting-card">
          <h3>听写与背词</h3>
          <p className="setting-desc">题量、挖空、取词难度、音标体系和生词库分页都在这里。</p>

          <Field label="听写题量上限" help="最小值 100，可调到 9999；听写页的下拉选项会跟着变长">
            <input
              type="number" min={100} max={9999} style={{ width: 120 }}
              value={settings.spellMax}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                save({ spellMax: Math.max(100, Math.min(9999, v || 100)) });
              }}
            />
          </Field>

          <Field label="背单词拼错几次后显示答案" help="默认 1 次；改成 5 就是第 5 次拼错才亮出中文和例句">
            <input
              type="number" min={1} max={9} style={{ width: 100 }}
              value={settings.spellWrongLimit}
              onChange={(e) => save({ spellWrongLimit: Math.max(1, Math.min(9, parseInt(e.target.value, 10) || 1)) })}
            />
          </Field>

          <Field label="单词拼写取词策略" help="0 = 0 基础（约 1000–2000 词量）；9 = 英语专业（约 20000–26000 词量）。只作用于单词听写从文章里取词。">
            <div className="range-row" style={{ minWidth: 300 }}>
              <input
                type="range" min={0} max={9} step={1}
                value={Number(settings.wordLevel) || 0}
                onChange={(e) => save({ wordLevel: parseInt(e.target.value, 10) || 0 })}
              />
              <span className="range-val">{Number(settings.wordLevel) || 0}</span>
            </div>
          </Field>

          <Field label="音标体系" help="全局生效：DJ 为英式音标（默认），KK 为美式音标；改了之后生词库和背单词页一起换">
            <select
              className="mini-select"
              value={settings.phoneticStyle || 'dj'}
              onChange={(e) => save({ phoneticStyle: e.target.value })}
            >
              <option value="dj">DJ 音标（英式）</option>
              <option value="kk">KK 音标（美式）</option>
            </select>
          </Field>

          <Field label="整句拼写提示百分比" help="越高挖空的词越少；默认 60，即挖掉约 40% 的词">
            <div className="range-row" style={{ minWidth: 300 }}>
              <input
                type="range" min={10} max={95} step={5}
                value={Number(settings.sentenceHintPercent) || 60}
                onChange={(e) => save({ sentenceHintPercent: parseInt(e.target.value, 10) || 60 })}
              />
              <span className="range-val">{Number(settings.sentenceHintPercent) || 60}%</span>
            </div>
          </Field>

          <Field label="生词库每页词数" help="生词库列表一页展示多少个词；选「全部」后不分页，一张表滚轮看到底">
            <div className="inline">
              {[10, 20, 50, 100].map((n) => (
                <button
                  key={n}
                  className={`seg-tab ${Number(settings.vocabPageSize) === n ? 'active' : ''}`}
                  onClick={() => save({ vocabPageSize: n })}
                >
                  {n}
                </button>
              ))}
              <button
                className={`seg-tab ${Number(settings.vocabPageSize) === 0 ? 'active' : ''}`}
                onClick={() => save({ vocabPageSize: 0 })}
              >
                全部
              </button>
            </div>
          </Field>
        </div>

        <div className="settings-section-title">二、听写与背诵</div>
        <div className="settings-section-hint">这两个页面各自的快捷键，互不影响。</div>

        <div className="setting-card">
          <h3>快捷键</h3>
          <p className="setting-desc">
            听写拼写和生词背诵各有自己的快捷键。点一下输入框，再按下你想用的键（数字键、单字母、方向键、F1–F12 都可以）。
          </p>

          <div className="hotkey-block">
            <div className="hotkey-block-title">听写拼写</div>
            <div className="hotkey-block-hint">在听写页面按这些键：再听一遍、显示中文意思、提示、下一题。</div>
            <div className="hotkey-grid">
              {[
                ['replay', '再听一遍'],
                ['meaning', '中文意思'],
                ['hint', '提示'],
                ['next', '下一题'],
              ].map(([k, label]) => (
                <HotkeyInput
                  key={`spell-${k}`}
                  label={label}
                  value={(settings.hotkeys && settings.hotkeys.spelling && settings.hotkeys.spelling[k]) || ''}
                  onSet={(key) => save({ hotkeys: { ...settings.hotkeys, spelling: { ...settings.hotkeys.spelling, [k]: key } } })}
                />
              ))}
            </div>
          </div>

          <div className="hotkey-block">
            <div className="hotkey-block-title">生词背诵</div>
            <div className="hotkey-block-hint">在生词背诵页面按这些键：认识 / 不认识 / 太简单 / 重写，以及常规的再听、释义和切换。</div>
            <div className="hotkey-grid">
              {[
                ['replay', '再听一遍'],
                ['meaning', '中文意思'],
                ['hint', '提示'],
                ['next', '下一个'],
                ['known', '认识'],
                ['unknown', '不认识'],
                ['tooEasy', '太简单了！'],
                ['rewrite', '重写一遍'],
              ].map(([k, label]) => (
                <HotkeyInput
                  key={`vocab-${k}`}
                  label={label}
                  value={(settings.hotkeys && settings.hotkeys.vocab && settings.hotkeys.vocab[k]) || ''}
                  onSet={(key) => save({ hotkeys: { ...settings.hotkeys, vocab: { ...settings.hotkeys.vocab, [k]: key } } })}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="settings-section-title">三、声音与导出</div>
        <div className="settings-section-hint">换音色后的试听行为，以及导出 MP3 的节奏。</div>

        <div className="setting-card">
          <h3>试听</h3>
          <p className="setting-desc">双击句子里的单词直接查词；想翻译短语或长句时，用鼠标左键拖选，再单击右键即可。</p>

          <Field label="切换音色后自动试听" help="关闭后，换音色只保存设置，不再自动朗读当前句">
            <button
              className={`toggle ${settings.autoPreviewVoice !== false ? 'on' : ''}`}
              onClick={() => save({ autoPreviewVoice: settings.autoPreviewVoice === false })}
            >
              {settings.autoPreviewVoice !== false ? '开' : '关'}
            </button>
          </Field>
        </div>

        <div className="setting-card">
          <h3>朗读与导出</h3>
          <p className="setting-desc">句间停顿只影响导出的 MP3。</p>

          <Field label="缺省语速（纯文本）" help="给没有真实音频的文本估算每句时间轴时使用">
            <div className="inline">
              <input
                type="number" min={80} max={240} style={{ width: 100 }}
                value={settings.wpm}
                onChange={(e) => save({ wpm: parseInt(e.target.value, 10) || 150 })}
              />
              <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>词 / 分钟</span>
            </div>
          </Field>
          <Field label="句间停顿" help="导出 MP3 时句与句之间的基本停顿（会按标点自动微调）">
            <div className="range-row">
              <input
                type="range" min={0} max={1.2} step={0.05}
                value={settings.gap}
                onChange={(e) => save({ gap: parseFloat(e.target.value) })}
              />
              <span className="range-val">{Number(settings.gap).toFixed(2)}s</span>
            </div>
          </Field>
        </div>

        <div className="settings-section-title">四、翻译、识别与导入</div>
        <div className="settings-section-hint">这些需要联网或依赖外部程序，平时不用改；出问题时再动。</div>

        <div className="setting-card">
          <h3>翻译通道</h3>
          <p className="setting-desc">
            默认使用免费通道（MyMemory，国内可直连，无需配置）。如果你有大模型 Key，可切到大模型，整篇翻译质量更高、语气更自然。
          </p>

          <Field label="通道">
            <select
              value={settings.translateProvider}
              onChange={(e) => save({ translateProvider: e.target.value })}
            >
              <option value="auto">自动（有大模型 Key 就用大模型）</option>
              <option value="mymemory">MyMemory（免费，国内直连）</option>
              <option value="google">Google 免费端点（质量好，需能访问）</option>
              <option value="llm">大模型（OpenAI 兼容接口）</option>
            </select>
          </Field>

          {(settings.translateProvider === 'llm' || settings.translateProvider === 'auto') && (
            <>
              <Field label="接口地址" help="例如 https://api.deepseek.com/v1 或 https://ark.cn-beijing.volces.com/api/v3">
                <input
                  type="text"
                  value={settings.llm.baseUrl}
                  placeholder="https://api.deepseek.com/v1"
                  onChange={(e) => save({ llm: { ...settings.llm, baseUrl: e.target.value } })}
                />
              </Field>
              <Field label="模型名">
                <input
                  type="text"
                  value={settings.llm.model}
                  placeholder="deepseek-chat / doubao-1-5-pro-32k"
                  onChange={(e) => save({ llm: { ...settings.llm, model: e.target.value } })}
                />
              </Field>
              <Field label="API Key">
                <input
                  type="password"
                  value={settings.llm.apiKey}
                  placeholder="sk-…"
                  onChange={(e) => save({ llm: { ...settings.llm, apiKey: e.target.value } })}
                />
              </Field>
            </>
          )}

          <Field label="连通性测试">
            <div className="inline">
              <button className="btn sm" onClick={testTranslate}>测试翻译</button>
              {testResult ? <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{testResult}</span> : null}
            </div>
          </Field>
        </div>

        <div className="setting-card">
          <h3>语音识别（跟读评分 / 音频素材转文字）</h3>
          <p className="setting-desc">
            内置 small.en（推荐，最准）和 tiny.en（最快），装好就能离线识别，不需要 Python、不需要联网。
            也可以自己下载别的 Whisper 模型包，放进程序目录的「userdata\models\Xenova\模型文件夹」，
            回到这里点开下拉就能选中。
          </p>

          <Field label="识别模型" help="内置的可以直接用；列表里的「自定义」是你自己放进模型目录的">
            <select value={settings.asrModel} onChange={(e) => save({ asrModel: e.target.value })}>
              {asrOptions.map((m) => (
                <option key={m.id} value={m.id}>
                  {String(m.name).replace(/^whisper-/, '')}{m.builtin ? '（内置' : '（自定义'}
                  {m.size ? `，约 ${Math.max(1, Math.round(m.size / 1024 / 1024))}MB` : ''}）
                  {m.id === 'Xenova/whisper-small.en' ? ' · 推荐' : ''}
                </option>
              ))}
            </select>
          </Field>

          <Field label="模型下载源" help="内置模型可直接用；只有选中的模型本地没有、需要联网下载时才会用到">
            <select value={settings.modelHost} onChange={(e) => save({ modelHost: e.target.value })}>
              <option value="https://hf-mirror.com">hf-mirror.com（国内镜像）</option>
              <option value="https://huggingface.co">huggingface.co（官方）</option>
            </select>
          </Field>

          <Field label="环境自检" help="跟读评分报错时，先跑一次这个，能直接看出是哪一环的问题">
            <div>
              <button className="btn sm" onClick={runDiagnose} disabled={diagRunning}>
                {diagRunning ? '检测中…' : '运行自检'}
              </button>
              {diag && diag.length > 0 && (
                <div className="diag-list">
                  {diag.map((d) => (
                    <div key={d.name} className={`diag-row ${d.ok ? 'ok' : 'bad'}`}>
                      <span className="diag-mark">{d.ok ? '✓' : '✕'}</span>
                      <span className="diag-name">{d.name}</span>
                      <span className="diag-detail">{d.detail}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Field>
        </div>

        <div className="setting-card">
          <h3>视频链接导入</h3>
          <p className="setting-desc">
            链接导入依赖 yt-dlp（开源下载器），软件已经内置一份，路径留空就自动用内置的；
            只有你手动删掉了 resources\\bin\\yt-dlp.exe 时，才需要在这里指定一个新的。
            本地 MP3 / MP4 导入不需要它。YouTube 等站点在国内需要代理。
          </p>

          <Field label="yt-dlp 路径" help="Windows 一般填 yt-dlp.exe 的完整路径">
            <div className="inline">
              <input
                type="text"
                value={settings.ytdlpPath}
                placeholder="留空自动用内置 yt-dlp；需要时填 C:\\tools\\yt-dlp.exe"
                onChange={(e) => save({ ytdlpPath: e.target.value })}
              />
              <button className="btn sm" onClick={() => api.openExternal('https://github.com/yt-dlp/yt-dlp/releases')}>
                下载页
              </button>
            </div>
          </Field>

          <Field label="代理（可选）" help="例如 http://127.0.0.1:7890">
            <input
              type="text"
              value={settings.proxy}
              placeholder="http://127.0.0.1:7890"
              onChange={(e) => save({ proxy: e.target.value })}
            />
          </Field>
        </div>

        <div className="settings-section-title">五、数据与版本</div>
        <div className="settings-section-hint">数据存在哪里、当前版本和运行环境。</div>

        <div className="setting-card">
          <h3>数据与版本</h3>
          <Field label="数据目录">
            <div>
              <button className="btn sm" onClick={() => api.reveal(null)}>打开数据目录</button>
              <div className="path-line">{info ? info.dataDir : ''}</div>
            </div>
          </Field>

          <Field label="版本">
            <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>
              M-shadow Studio {info ? info.version : ''} · {info ? info.platform : ''}
            </div>
          </Field>
        </div>

      </div>
    </div>
  );
}
