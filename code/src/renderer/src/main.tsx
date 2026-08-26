import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

import coreUrl from '../../../vendor/live2d-sdk-web/Core/live2dcubismcore.js?url';

async function loadCubismCore(): Promise<void> {
  const globalScope = globalThis as typeof globalThis & { Live2DCubismCore?: unknown };
  if (globalScope.Live2DCubismCore) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.async = false;
    script.src = coreUrl;
    script.addEventListener('load', () => resolve(), { once: true });
    script.addEventListener('error', () => reject(new Error('Cubism Core 脚本加载失败')), { once: true });
    document.head.appendChild(script);
  });
}

function setSettingsWindowActiveState(active: boolean): void {
  const value = String(active);
  document.documentElement.dataset.windowActive = value;
  document.body.dataset.windowActive = value;
  document.getElementById('root')?.setAttribute('data-window-active', value);
}

async function boot(): Promise<void> {
  const root = document.getElementById('root');
  if (!root) {
    return;
  }
  const role = new URLSearchParams(window.location.search).get('window') === 'pet' ? 'pet' : 'settings';
  document.documentElement.dataset.baoyinWindow = role;
  document.body.dataset.window = role;
  document.title = role === 'pet' ? '' : 'StarChat';
  if (role === 'settings') {
    setSettingsWindowActiveState(false);
    window.baoyin.app.onWindowFocusState(setSettingsWindowActiveState);
  }
  try {
    if (role === 'pet') {
      await loadCubismCore();
    }
    const { default: App } = role === 'pet' ? await import('./PetApp') : await import('./App');
    createRoot(root).render(
      <StrictMode>
        <App />
      </StrictMode>
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Live2D runtime 启动失败';
    document.body.dataset.bootError = message;
    console.error(`[${role}-boot] ${message}`, error);
    root.textContent = '';
    root.className = 'boot-error-root';
    const panel = document.createElement('section');
    panel.className = 'boot-error-panel';
    panel.setAttribute('role', 'alert');
    const heading = document.createElement('strong');
    heading.textContent = role === 'pet' ? '白音模型启动失败' : '白音界面启动失败';
    const detail = document.createElement('span');
    detail.textContent = message;
    const hint = document.createElement('small');
    hint.textContent = '界面仍保持可见；请在设置中检查模型入口或查看启动日志。';
    panel.append(heading, detail, hint);
    root.appendChild(panel);
  }
}

void boot();
