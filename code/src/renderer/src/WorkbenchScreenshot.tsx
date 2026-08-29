import { useEffect, useMemo, useState } from 'react';
import type { PublicAppState } from '../../shared/ipc';
import { DEFAULT_ROLE_PACKAGE } from '../../shared/default-role';
import { DEFAULT_APP_SETTINGS, sanitizeAppSettings } from '../../shared/settings';
import { applyThemeToDocument } from '../../shared/theme';
import { AgentConsole } from './AgentConsole';
import { AgentWorkbench } from './AgentWorkbench';
import { SettingsHome } from './SettingsHome';
import { readWorkbenchLayoutState } from './workbench-layout';

function createScreenshotState(theme: 'light' | 'dark', live2dEntry: string | null): PublicAppState {
  const settings = sanitizeAppSettings({
    ...DEFAULT_APP_SETTINGS,
    assistantMode: 'agent',
    themePreference: theme,
    live2dModelPath: live2dEntry,
    live2dShowWatermark: live2dEntry ? undefined : DEFAULT_APP_SETTINGS.live2dShowWatermark
  });
  return {
    settings,
    hasApiKey: false,
    role: DEFAULT_ROLE_PACKAGE,
    roles: [DEFAULT_ROLE_PACKAGE],
    live2d: {
      entryPath: live2dEntry,
      directoryPath: live2dEntry ? live2dEntry.replace(/[\\/][^\\/]+$/u, '') : null,
      selectionKind: live2dEntry ? 'file' : null,
      status: live2dEntry ? 'ready' : 'not_configured',
      message: live2dEntry ? '真实外部 Live2D 预览 · 只读引用' : '',
      version: live2dEntry ? 4 : null,
      files: [], expressions: [], motions: [], editorAnimations: [], parameters: [], groups: [], physics: null, adapter: null,
      license: null, issues: [], warnings: []
    },
    live2dModels: [],
    companion: { roleId: DEFAULT_ROLE_PACKAGE.id, interactionCount: 3, affinity: 38, stageIndex: 1, stageLabel: '熟悉', memoryCount: 2 },
    voices: []
  };
}

export function WorkbenchScreenshot(): JSX.Element {
  const theme = useMemo<'light' | 'dark'>(() => new URLSearchParams(window.location.search).get('theme') === 'light' ? 'light' : 'dark', []);
  const live2dEntry = useMemo(() => new URLSearchParams(window.location.search).get('live2dEntry')?.trim() || null, []);
  const settingsMode = useMemo(() => new URLSearchParams(window.location.search).get('mode') === 'settings', []);
  const productionLayout = useMemo(() => new URLSearchParams(window.location.search).get('layout') === 'production', []);
  const state = useMemo(() => createScreenshotState(theme, live2dEntry), [live2dEntry, theme]);
  const [bottomPanelOpen, setBottomPanelOpen] = useState(() => productionLayout ? readWorkbenchLayoutState().bottomPanelOpen : true);
  useEffect(() => {
    document.documentElement.dataset.baoyinWindow = 'settings';
    document.body.dataset.window = 'settings';
    document.title = 'StarChat';
    applyThemeToDocument(document, theme, theme === 'dark');
  }, [theme]);
  return <main className="app-shell settings-center-shell" data-live2d-preview={live2dEntry ? 'true' : 'false'}>
    <AgentWorkbench activePage={settingsMode ? 'settings' : null} roleName={state.role.displayName} modelLabel="默认模型" theme={theme} bottomPanelOpen={bottomPanelOpen} agentAvailable agentTasks={[]} initialEnvironmentOpen={!settingsMode} onNavigate={() => undefined} onToggleBottomPanel={() => setBottomPanelOpen((open) => !open)} onMinimize={() => undefined} onClose={() => undefined} workspaceLabel="Project-008" sessionTitle="设置工作台预览" sessionMetaLabel="刚刚" centerTitle="Project-008 设置工作台预览" referenceEnvironment referenceFixture={!productionLayout} referenceLayout={!productionLayout}>
      {settingsMode ? <SettingsHome state={state} presentation={state.settings.presentation} /> : <AgentConsole state={state} agentTasks={[]} agentEvent={null} onModeChange={() => undefined} contextUsageOverride={32} referenceFixture={!productionLayout} />}
    </AgentWorkbench>
  </main>;
}
