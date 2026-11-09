import React, { useEffect, useState } from 'react';
import { IconClose } from './Icons.jsx';

export const APP_VERSION = 'V1.2.0（2026/11）';
export const APP_AUTHOR = 'SeanZhou2933';
export const APP_MAIL = 'zxq2933@qq.com';

export default function AboutModal({ onClose }) {
  const [info, setInfo] = useState(null);

  useEffect(() => {
    window.api.info().then(setInfo).catch(() => {});
  }, []);

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal about-modal" onClick={(e) => e.stopPropagation()}>
        <div className="about-head">
          <div className="about-mark">M</div>
          <div>
            <div className="about-name">M-shadow Studio</div>
            <div className="about-tag">厚积叠影，方见新生 · 影子跟读 / 听写拼写 / 生词背诵</div>
          </div>
          <button className="icon-btn about-close" onClick={onClose}><IconClose size={15} /></button>
        </div>

        <div className="about-meta">
          <div className="about-row"><span>版本</span><b>{APP_VERSION}</b></div>
          <div className="about-row"><span>Author</span><b>{APP_AUTHOR}</b></div>
          <div className="about-row"><span>反馈Mail</span><b>{APP_MAIL}</b></div>
          {info && <div className="about-row"><span>数据目录</span><b className="about-path">{info.dataDir}</b></div>}
        </div>

        <div className="modal-foot">
          <span className="modal-tip">遇到问题可以直接发邮件，附上截图更容易定位</span>
          <button className="btn primary" onClick={onClose}>知道了</button>
        </div>
      </div>
    </div>
  );
}
