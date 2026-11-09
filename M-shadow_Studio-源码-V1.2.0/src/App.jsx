import React, { useEffect, useRef, useState } from 'react';
import { useStore } from './store.js';
import logoUrl from './assets/logo.png';
import Sidebar from './components/Sidebar.jsx';
import StudyView from './components/StudyView.jsx';
import SpellingView from './components/SpellingView.jsx';
import VocabView from './components/VocabView.jsx';
import SettingsView from './components/SettingsView.jsx';
import AboutModal from './components/AboutModal.jsx';
import { IconBook, IconEdit, IconGear, IconHelp, IconCards, IconSun, IconMoon, IconCog } from './components/Icons.jsx';

const TABS = [
  { key: 'study', label: '学习跟读', Icon: IconBook },
  { key: 'spelling', label: '听写拼写', Icon: IconEdit },
  { key: 'vocab', label: '生词背诵', Icon: IconCards },
];

export default function App() {
  const ready = useStore((s) => s.ready);
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const init = useStore((s) => s.init);
  const busy = useStore((s) => s.busy);
  const progress = useStore((s) => s.progress);
  const toast = useStore((s) => s.toast);
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  const [aboutOpen, setAboutOpen] = useState(false);
  const lastView = useRef('study');

  useEffect(() => {
    if (window.api && window.api.platform === 'win32') {
      document.body.classList.add('win-overlay');
      window.api.setTitleBar({
        color: theme === 'dark' ? '#141a20' : '#ffffff',
        symbolColor: theme === 'dark' ? '#c9d1d9' : '#5b6472',
      }).catch(() => {});
    } init(); }, [init]);

  useEffect(() => {
    if (window.api && window.api.platform === 'win32') {
      window.api.setTitleBar({
        color: theme === 'dark' ? '#141a20' : '#ffffff',
        symbolColor: theme === 'dark' ? '#c9d1d9' : '#5b6472',
      }).catch(() => {});
    }
  }, [theme]);

  if (!ready) {
    return (
      <div className="splash">
        <div className="splash-logo">M</div>
        <div className="splash-text">M-shadow Studio</div>
        <div className="splash-sub">正在加载你的素材库…</div>
      </div>
    );
  }

  const dark = theme === 'dark';

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark"><img src={logoUrl} alt="M" /></div>
          <div>
            <div className="brand-name">M-shadow Studio</div>
            <div className="brand-sub">厚积叠影，方见新生</div>
          </div>
        </div>

        <nav className="tabs">
          {TABS.map(({ key, label, Icon }) => (
            <button
              key={key}
              className={`tab ${view === key ? 'active' : ''}`}
              onClick={() => setView(key)}
            >
              <Icon size={15} />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div className="top-right">
          {busy && <span className="busy-dot" />}
          <button
            className="iconb"
            title={dark ? '切换到白天模式' : '切换到夜晚模式'}
            onClick={() => setTheme(dark ? 'light' : 'dark')}
          >
            {dark ? <IconSun size={16} /> : <IconMoon size={16} />}
          </button>
          <button
            className={`iconb ${view === 'settings' ? 'on' : ''}`}
            title="设置"
            onClick={() => {
              if (view === 'settings') setView(lastView.current || 'study');
              else { lastView.current = view; setView('settings'); }
            }}
          >
            <IconCog size={17} />
          </button>
          <button className="iconb" title="帮助 / 关于" onClick={() => setAboutOpen(true)}>
            <IconHelp size={16} />
          </button>
        </div>

        {window.api && window.api.platform === 'win32' && (
          <div className="win-controls">
            <button className="win-btn" title="最小化" onClick={() => window.api.winMin()}>
              <svg width="12" height="12" viewBox="0 0 12 12"><path d="M2 6h8" stroke="currentColor" strokeWidth="1.3" /></svg>
            </button>
            <button className="win-btn" title="最大化 / 还原" onClick={() => window.api.winToggleMax()}>
              <svg width="12" height="12" viewBox="0 0 12 12"><rect x="2.2" y="2.2" width="7.6" height="7.6" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.2" /></svg>
            </button>
            <button className="win-btn close" title="关闭" onClick={() => window.api.winClose()}>
              <svg width="12" height="12" viewBox="0 0 12 12"><path d="M2.4 2.4l7.2 7.2M9.6 2.4L2.4 9.6" stroke="currentColor" strokeWidth="1.3" /></svg>
            </button>
          </div>
        )}
      </header>

      {progress && (
        <div className="load-line" aria-hidden="true">
          <div className="load-line-bar" style={{ width: `${Math.max(4, Math.min(100, progress.percent || 0))}%` }} />
        </div>
      )}

      <div className="shell">
        {view !== 'settings' && <Sidebar />}
        <main className={`main ${view === 'settings' ? 'main-wide' : ''}`}>
          {/* 三个主页面一直挂载，切页不丢进度；只是显示/隐藏 */}
          <section className={`view ${view === 'study' ? 'view-active' : 'view-hidden'}`}><StudyView /></section>
          <section className={`view ${view === 'spelling' ? 'view-active' : 'view-hidden'}`}><SpellingView /></section>
          <section className={`view ${view === 'vocab' ? 'view-active' : 'view-hidden'}`}><VocabView /></section>
          {view === 'settings' && <SettingsView />}
        </main>
      </div>

      {toast && <div className={`toast ${toast.type}`}>{toast.message}</div>}
      {aboutOpen && <AboutModal onClose={() => setAboutOpen(false)} />}
    </div>
  );
}
