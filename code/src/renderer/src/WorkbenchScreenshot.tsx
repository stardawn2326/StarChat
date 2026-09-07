import { useEffect, useMemo, useState } from 'react';
import type { PublicAppState } from '../../shared/ipc';
import { DEFAULT_ROLE_PACKAGE } from '../../shared/default-role';
import { DEFAULT_APP_SETTINGS, sanitizeAppSettings } from '../../shared/settings';
import { applyThemeToDocument } from '../../shared/theme';
import { AgentConsole } from './AgentConsole';
import { AgentWorkbench } from './AgentWorkbench';
import { SettingsHome } from './SettingsHome';
import { readWorkbenchLayoutState } from './workbench-layout';
import type { AgentTask } from '../../shared/agent';

const TASK_APPROVAL_FIXTURE: AgentTask = {
  id: 'screenshot-task', sessionId: 'screenshot-session', roleId: DEFAULT_ROLE_PACKAGE.id, message: '更新 Agent 审批界面并运行验证', mode: 'agent',
  route: { route: 'agent', method: 'forced', explain: '用户明确要求由 Agent 执行' }, status: 'waiting_for_approval',
  createdAt: 1_788_000_000_000, updatedAt: 1_788_000_003_000, currentStep: 3,
  steps: [
    { id: 'route', taskId: 'screenshot-task', index: 0, kind: 'route', status: 'completed', summary: '已路由到后台 Agent', createdAt: 1_788_000_000_000, finishedAt: 1_788_000_000_200 },
    { id: 'inspect', taskId: 'screenshot-task', index: 1, kind: 'tool', status: 'completed', summary: 'read_file：已读取任务面板', createdAt: 1_788_000_001_000, finishedAt: 1_788_000_001_300 },
    { id: 'approval', taskId: 'screenshot-task', index: 2, kind: 'approval', status: 'waiting', summary: '等待批准：src/renderer/AgentTaskPanel.tsx', createdAt: 1_788_000_003_000 }
  ],
  approval: {
    id: 'approval', taskId: 'screenshot-task', invocationId: 'patch', toolName: 'apply_patch', target: 'src/renderer/AgentTaskPanel.tsx', plan: '将更新 1 个文件，批准前不会写入。', createdAt: 1_788_000_003_000,
    preview: { files: ['src/renderer/AgentTaskPanel.tsx'], patch: '*** Begin Patch\n*** Update File: src/renderer/AgentTaskPanel.tsx\n@@\n-旧审批内容\n+可核对的精确补丁\n*** End Patch', additions: 1, deletions: 1 }
  }
};

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
  const tasksMode = useMemo(() => new URLSearchParams(window.location.search).get('mode') === 'tasks', []);
  const productionLayout = useMemo(() => new URLSearchParams(window.location.search).get('layout') === 'production', []);
  const state = useMemo(() => createScreenshotState(theme, live2dEntry), [live2dEntry, theme]);
  const [bottomPanelOpen, setBottomPanelOpen] = useState(() => productionLayout ? readWorkbenchLayoutState().bottomPanelOpen : true);
  useEffect(() => {
    document.documentElement.dataset.starchatWindow = 'settings';
    document.body.dataset.window = 'settings';
    document.title = 'StarChat';
    applyThemeToDocument(document, theme, theme === 'dark');
  }, [theme]);
  return <main className="app-shell settings-center-shell" data-live2d-preview={live2dEntry ? 'true' : 'false'}>
    <AgentWorkbench activePage={settingsMode ? 'settings' : null} roleName={state.role.displayName} modelLabel="默认模型" theme={theme} bottomPanelOpen={bottomPanelOpen} agentAvailable agentTasks={tasksMode ? [TASK_APPROVAL_FIXTURE] : []} activeTool={tasksMode ? 'tasks' : null} initialEnvironmentOpen={!settingsMode && !tasksMode} onToolAction={() => undefined} onNavigate={() => undefined} onToggleBottomPanel={() => setBottomPanelOpen((open) => !open)} onMinimize={() => undefined} onClose={() => undefined} workspaceLabel="Project-008" sessionTitle="设置工作台预览" sessionMetaLabel="刚刚" centerTitle="Project-008 设置工作台预览" referenceEnvironment referenceFixture={!productionLayout} referenceLayout={!productionLayout}>
      {settingsMode ? <SettingsHome state={state} presentation={state.settings.presentation} /> : <AgentConsole state={state} agentTasks={[]} agentEvent={null} onModeChange={() => undefined} contextUsageOverride={32} referenceFixture={!productionLayout} />}
    </AgentWorkbench>
  </main>;
}
