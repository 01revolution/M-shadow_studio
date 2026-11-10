import React from 'react';

const wrap = (d, props) => (
  <svg viewBox="0 0 24 24" width={props.size || 16} height={props.size || 16}
    fill="none" stroke="currentColor" strokeWidth={props.stroke || 1.8}
    strokeLinecap="round" strokeLinejoin="round" className={props.className}>
    {d}
  </svg>
);

export const IconVolume = (p) => wrap(<><path d="M4 9.5v5h3.6L13 18.6V5.4L7.6 9.5H4Z" fill="currentColor" stroke="none" /><path d="M16.2 8.4a4.6 4.6 0 0 1 0 7.2" /><path d="M18.8 5.8a8 8 0 0 1 0 12.4" /></>, p);
export const IconPlay = (p) => wrap(<polygon points="6 3 20 12 6 21 6 3" fill="currentColor" stroke="none" />, p);
export const IconPause = (p) => wrap(<><rect x="6" y="4" width="4" height="16" fill="currentColor" stroke="none" /><rect x="14" y="4" width="4" height="16" fill="currentColor" stroke="none" /></>, p);
export const IconStop = (p) => wrap(<rect x="6" y="6" width="12" height="12" fill="currentColor" stroke="none" />, p);
export const IconMic = (p) => wrap(<><path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z" /><path d="M5 11a7 7 0 0 0 14 0" /><path d="M12 18v3" /></>, p);
export const IconNext = (p) => wrap(<><polygon points="5 4 15 12 5 20 5 4" fill="currentColor" stroke="none" /><rect x="17" y="4" width="2.4" height="16" fill="currentColor" stroke="none" /></>, p);
export const IconPrev = (p) => wrap(<><polygon points="19 4 9 12 19 20 19 4" fill="currentColor" stroke="none" /><rect x="4.6" y="4" width="2.4" height="16" fill="currentColor" stroke="none" /></>, p);
export const IconRepeat = (p) => wrap(<><path d="M17 2l4 4-4 4" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><path d="M7 22l-4-4 4-4" /><path d="M21 13v2a4 4 0 0 1-4 4H3" /></>, p);
export const IconDownload = (p) => wrap(<><path d="M12 3v12" /><path d="M7 11l5 5 5-5" /><path d="M4 20h16" /></>, p);
export const IconTrash = (p) => wrap(<><path d="M4 7h16" /><path d="M9 7V4h6v3" /><path d="M6 7l1 13h10l1-13" /></>, p);
export const IconPlus = (p) => wrap(<><path d="M12 5v14" /><path d="M5 12h14" /></>, p);
export const IconLink = (p) => wrap(<><path d="M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1" /><path d="M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1" /></>, p);
export const IconBook = (p) => wrap(<><path d="M4 5a2 2 0 0 1 2-2h6v18H6a2 2 0 0 0-2 2V5Z" /><path d="M20 19a2 2 0 0 0-2-2h-6v-14h6a2 2 0 0 1 2 2v14Z" /></>, p);
export const IconCog = (p) => wrap(<><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /><circle cx="12" cy="12" r="3.1" /></>, p);
export const IconGear = (p) => wrap(<><circle cx="12" cy="12" r="3.2" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" /></>, p);
export const IconCheck = (p) => wrap(<path d="M4 12l5 5L20 6" />, p);
export const IconClose = (p) => wrap(<><path d="M6 6l12 12" /><path d="M18 6L6 18" /></>, p);
export const IconSpark = (p) => wrap(<><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z" /></>, p);
export const IconEdit = (p) => wrap(<><path d="M4 20h4l10-10-4-4L4 16v4Z" /><path d="M14 6l4 4" /></>, p);
export const IconHelp = (p) => wrap(<><circle cx="12" cy="12" r="9" /><path d="M9.4 9.2a2.7 2.7 0 0 1 5.2.9c0 1.7-2.5 2-2.5 3.5" /><circle cx="12" cy="17.2" r="0.9" fill="currentColor" stroke="none" /></>, p);
export const IconShuffle = (p) => wrap(<><path d="M16 3h5v5" /><path d="M21 3-9 12" /><path d="M16 21h5v-5" /><path d="M21 21-5-5" /><path d="M3 7h4l3 3" /><path d="M3 17h4l3-3" /></>, p);
export const IconList = (p) => wrap(<><path d="M8 6h12" /><path d="M8 12h12" /><path d="M8 18h12" /><circle cx="4" cy="6" r="1" fill="currentColor" stroke="none" /><circle cx="4" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="4" cy="18" r="1" fill="currentColor" stroke="none" /></>, p);
export const IconText = (p) => wrap(<><path d="M4 6h16" /><path d="M4 12h10" /><path d="M4 18h7" /></>, p);
export const IconSun = (p) => wrap(<><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" /></>, p);
export const IconMoon = (p) => wrap(<><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" /></>, p);
export const IconHelm = (p) => wrap(<><circle cx="12" cy="12" r="8.4" /><circle cx="12" cy="12" r="2.6" /><path d="M12 3.6v5.8M12 14.6v5.8M3.6 12h5.8M14.6 12h5.8M6 6l3.2 3.2M14.8 14.8l3.2 3.2M18 6l-3.2 3.2M9.2 14.8L6 18" /></>, p);
export const IconCards = (p) => wrap(<><rect x="3" y="6" width="12" height="14" rx="2" /><path d="M9 6V4a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-3" /><path d="M7 10h5M7 14h4" /></>, p);
export const IconEye = (p) => wrap(<><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z" /><circle cx="12" cy="12" r="2.6" /></>, p);

export const IconHeadphone = (p) => wrap(<><path d="M4 14v-2a8 8 0 0 1 16 0v2" /><path d="M4 14a2 2 0 0 1 2-2h1a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H6a2 2 0 0 1-2-2Z" /><path d="M20 14a2 2 0 0 0-2-2h-1a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h1a2 2 0 0 0 2-2Z" /></>, p);
export const IconUpload = (p) => wrap(<><path d="M12 17V4" /><path d="M7 9l5-5 5 5" /><path d="M4 20h16" /></>, p);
export const IconSearch = (p) => wrap(<><circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5L21 21" /></>, p);
