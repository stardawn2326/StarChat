import type { ReactNode } from 'react';

export type WorkbenchIconName =
  | 'arrowDown'
  | 'arrowUp'
  | 'browser'
  | 'chat'
  | 'check'
  | 'chevron'
  | 'close'
  | 'copy'
  | 'context'
  | 'environment'
  | 'file'
  | 'folder'
  | 'layout'
  | 'maximize'
  | 'menu'
  | 'mic'
  | 'minimize'
  | 'model'
  | 'pause'
  | 'pet'
  | 'plus'
  | 'refresh'
  | 'resource'
  | 'search'
  | 'settings'
  | 'share'
  | 'sidebar'
  | 'source'
  | 'star'
  | 'step'
  | 'strength'
  | 'send'
  | 'task'
  | 'terminal'
  | 'thumbsDown'
  | 'thumbsUp';

interface WorkbenchIconProps {
  name: WorkbenchIconName;
  size?: number;
  strokeWidth?: number;
  className?: string;
}

const path = (d: string): ReactNode => <path d={d} />;

export function WorkbenchIcon({ name, size = 18, strokeWidth = 1.7, className = '' }: WorkbenchIconProps): JSX.Element {
  let content: ReactNode;
  switch (name) {
    case 'arrowDown': content = path('M6 9l6 6 6-6'); break;
    case 'arrowUp': content = path('M6 15l6-6 6 6'); break;
    case 'browser': content = <><rect x="3" y="4" width="18" height="16" rx="2" />{path('M3 8h18M7 6h.01M10 6h.01M13 6h.01')}</>; break;
    case 'chat': content = <><path d="M4 5.5A2.5 2.5 0 016.5 3h11A2.5 2.5 0 0120 5.5v7a2.5 2.5 0 01-2.5 2.5H11l-4.5 4v-4.1A2.5 2.5 0 014 12.5z" />{path('M8 8.5h8M8 11.5h5')}</>; break;
    case 'check': content = path('M5 12.5l4 4L19 6.5'); break;
    case 'chevron': content = path('M8 10l4 4 4-4'); break;
    case 'close': content = path('M6 6l12 12M18 6L6 18'); break;
    case 'copy': content = <><rect x="8" y="8" width="11" height="11" rx="1.5" />{path('M5 15H4a1 1 0 01-1-1V4a1 1 0 011-1h10a1 1 0 011 1v1')}</>; break;
    case 'context': content = <><circle cx="12" cy="12" r="8" />{path('M12 8v4l2.5 2.5')}</>; break;
    case 'environment': content = <><path d="M12 3v18M3 12h18" />{path('M5 5h14v14H5z')}</>; break;
    case 'file': content = <><path d="M6 3h8l4 4v14H6z" />{path('M14 3v5h5M9 12h6M9 16h6')}</>; break;
    case 'folder': content = path('M3 6.5A1.5 1.5 0 014.5 5h5l2 2h8A1.5 1.5 0 0121 8.5v9a1.5 1.5 0 01-1.5 1.5h-15A1.5 1.5 0 013 17.5z'); break;
    case 'layout': content = <><rect x="3" y="4" width="18" height="16" rx="2" />{path('M8 4v16M8 9h13')}</>; break;
    case 'maximize': content = path('M8 4H4v4M16 4h4v4M20 16v4h-4M4 16v4h4'); break;
    case 'menu': content = path('M4 7h16M4 12h16M4 17h16'); break;
    case 'mic': content = <><rect x="8" y="3" width="8" height="12" rx="4" />{path('M5 11a7 7 0 0014 0M12 18v3M9 21h6')}</>; break;
    case 'minimize': content = path('M5 12h14'); break;
    case 'model': content = <><path d="M5 5h14v14H5z" />{path('M8 9h8M8 13h5')}</>; break;
    case 'pause': content = path('M8 5v14M16 5v14'); break;
    case 'pet': content = <><circle cx="12" cy="12" r="7" />{path('M9 10h.01M15 10h.01M9 14c1.8 1.4 4.2 1.4 6 0')}</>; break;
    case 'plus': content = path('M12 5v14M5 12h14'); break;
    case 'refresh': content = <><path d="M20 11a8 8 0 00-13.7-4.8L4 8.5" />{path('M4 4v4.5h4.5M4 13a8 8 0 0013.7 4.8L20 15.5M20 20v-4.5h-4.5')}</>; break;
    case 'resource': content = <><path d="M4 5.5A1.5 1.5 0 015.5 4h5l2 2h6A1.5 1.5 0 0120 7.5v11a1.5 1.5 0 01-1.5 1.5h-13A1.5 1.5 0 014 18.5z" />{path('M8 11h8M8 15h5')}</>; break;
    case 'search': content = <><circle cx="10.5" cy="10.5" r="6.5" />{path('M16 16l5 5')}</>; break;
    case 'settings': content = <><circle cx="12" cy="12" r="3" />{path('M19.4 15a1.7 1.7 0 00.3 1.9l.1.1-1.7 1.7-.1-.1a1.7 1.7 0 00-1.9-.3 1.7 1.7 0 00-1 1.6v.1h-2.4v-.1a1.7 1.7 0 00-1-1.6 1.7 1.7 0 00-1.9.3l-.1.1L8 17l.1-.1a1.7 1.7 0 00.3-1.9 1.7 1.7 0 00-1.6-1H6v-2.4h.8a1.7 1.7 0 001.6-1 1.7 1.7 0 00-.3-1.9L8 8.6l1.7-1.7.1.1a1.7 1.7 0 001.9.3 1.7 1.7 0 001-1.6v-.1h2.4v.1a1.7 1.7 0 001 1.6 1.7 1.7 0 001.9-.3l.1-.1 1.7 1.7-.1.1a1.7 1.7 0 00-.3 1.9 1.7 1.7 0 001.6 1h.1V14h-.1a1.7 1.7 0 00-1.6 1z')}</>; break;
    case 'share': content = <><circle cx="18" cy="5" r="2.2" />{path('M8 12l8.2-5.2M8 12l8.2 5.2')}<circle cx="6" cy="12" r="2.2" /><circle cx="18" cy="19" r="2.2" /></>; break;
    case 'sidebar': content = <><rect x="3" y="4" width="18" height="16" rx="2" />{path('M8 4v16')}</>; break;
    case 'source': content = <><path d="M8 6L3 12l5 6M16 6l5 6-5 6" />{path('M14 4l-4 16')}</>; break;
    case 'star': content = path('M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9z'); break;
    case 'step': content = <><circle cx="6" cy="6" r="2" />{path('M8 6h6a4 4 0 014 4v8')}</>; break;
    case 'strength': content = <><path d="M5 6h14M5 12h14M5 18h14" />{path('M9 4v4M15 10v4M11 16v4')}</>; break;
    case 'send': content = path('M4 4l16 8-16 8 3-8zM7 12h6'); break;
    case 'task': content = <><rect x="4" y="3" width="16" height="18" rx="2" />{path('M8 8h8M8 12h8M8 16h5')}</>; break;
    case 'terminal': content = <><rect x="3" y="4" width="18" height="16" rx="2" />{path('M7 9l3 3-3 3M12 15h4')}</>; break;
    case 'thumbsDown': content = path('M7 4v10M7 14H5a2 2 0 01-2-2V9a2 2 0 012-2h2m0 7h8.5a2 2 0 001.9-1.4l1.6-4.5A2 2 0 0016.1 5H11l.7-2.1A1.5 1.5 0 0010.3 1L7 4'); break;
    case 'thumbsUp': content = path('M7 20V10M7 10H5a2 2 0 01-2-2V5a2 2 0 012-2h2m0 7h8.5a2 2 0 001.9 1.4l1.6 4.5A2 2 0 0116.1 19H11l.7 2.1A1.5 1.5 0 0010.3 23L7 20'); break;
  }

  return <svg className={`workbench-svg-icon ${className}`.trim()} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{content}</svg>;
}
