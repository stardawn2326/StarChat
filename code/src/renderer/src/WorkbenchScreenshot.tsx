import { useEffect, useMemo } from 'react';
import type { PublicAppState } from '../../shared/ipc';
import { DEFAULT_ROLE_PACKAGE } from '../../shared/default-role';
import { DEFAULT_APP_SETTINGS } from '../../shared/settings';
import { applyThemeToDocument } from '../../shared/theme';
import { AgentConsole } from './AgentConsole';
import { AgentWorkbench } from './AgentWorkbench';

function createScreenshotState(theme: 'light' | 'dark'): PublicAppState {
  const settings = { ...DEFAULT_APP_SETTINGS, assistantMode: 'agent' as const, themePreference: theme };
  return {
    settings,
    hasApiKey: false,
    role: DEFAULT_ROLE_PACKAGE,
    roles: [DEFAULT_ROLE_PACKAGE],
    live2d: {
      entryPath: null, directoryPath: null, selectionKind: null, status: 'not_configured', message: '', version: null,
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
  const state = useMemo(() => createScreenshotState(theme), [theme]);
  useEffect(() => {
    document.documentElement.dataset.baoyinWindow = 'settings';
    document.body.dataset.window = 'settings';
    document.title = 'StarChat';
    applyThemeToDocument(document, theme, theme === 'dark');
  }, [theme]);
  return <main className="app-shell settings-center-shell">
    <AgentWorkbench activePage={null} roleName={state.role.displayName} modelLabel="默认模型" bottomPanelOpen agentAvailable agentTasks={[]} initialEnvironmentOpen onNavigate={() => undefined} onToggleBottomPanel={() => undefined} onMinimize={() => undefined} onClose={() => undefined}>
      <AgentConsole state={state} agentTasks={[]} agentEvent={null} onModeChange={() => undefined} />
    </AgentWorkbench>
  </main>;
}
