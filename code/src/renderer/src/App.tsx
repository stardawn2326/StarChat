import { useEffect, useMemo, useRef, useState } from 'react';
import type { CubismDebugCommand, CubismRuntimeCommand, PublicAppState } from '../../shared/ipc';
import type { AgentEvent, AgentTask } from '../../shared/agent';
import type { CubismRuntimeCapabilities, CubismRuntimeMetrics, CubismRuntimeResult } from '../../shared/cubism';
import type { Live2DModelState } from '../../shared/live2d';
import type { PresentationEvent } from '../../shared/presentation';
import { cloneRolePackage, createBlankRolePackage, type RolePackage } from '../../shared/role-package';
import { DEFAULT_APP_SETTINGS, DEFAULT_MODEL_VIEWPORT, modelViewportForPath, sanitizeModelViewport, type AppSettings, type ModelViewportSettings } from '../../shared/settings';
import { SettingsDetailsV2 } from './SettingsDetailsV2';
import { SettingsHome } from './SettingsHome';
import type { SettingsPageId } from './settings-schema';
import { emitSettingsPreview, isWindowIntent } from './settings-preview';
import { DEFAULT_PRESENTATION_SETTINGS, sanitizePresentationSettings, type PresentationSettings } from '../../shared/presentation-contract';
import { applyThemeToDocument } from '../../shared/theme';
import { syncPetBoundsIntoSettings } from './settings-state';
import { AgentWorkbench, type WorkbenchPage } from './AgentWorkbench';
import type { WorkbenchInspection, WorkbenchInspectionKind } from '../../shared/workbench';
import type { WorkbenchToolAction } from './AgentWorkbench';
import { AgentConsole } from './AgentConsole';
import { readWorkbenchLayoutState, writeWorkbenchLayoutPatch } from './workbench-layout';

function sameBounds(a: AppSettings['petBounds'], b: AppSettings['petBounds']): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function useThemePreference(preference: AppSettings['themePreference']): void {
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = (): void => {
      applyThemeToDocument(document, preference, media.matches);
    };
    apply();
    const onSystemThemeChange = (): void => {
      if (preference === 'system') apply();
    };
    media.addEventListener('change', onSystemThemeChange);
    return () => media.removeEventListener('change', onSystemThemeChange);
  }, [preference]);
}

function pathLabel(path: string | null | undefined): string {
  const value = path?.replaceAll('\\', '/').split('/').filter(Boolean).at(-1);
  return value || '本地工作区';
}

function App(): JSX.Element {
  const [appState, setAppState] = useState<PublicAppState | null>(null);
  const [settingsDraft, setSettingsDraft] = useState<AppSettings | null>(null);
  const [roleDraft, setRoleDraft] = useState<RolePackage | null>(null);
  const [live2dPreview, setLive2dPreview] = useState<Live2DModelState | null>(null);
  const [debugMetrics, setDebugMetrics] = useState<CubismRuntimeMetrics | null>(null);
  const [runtimeCapabilities, setRuntimeCapabilities] = useState<CubismRuntimeCapabilities | null>(null);
  const [runtimeResult, setRuntimeResult] = useState<CubismRuntimeResult | null>(null);
  const [runtimeReadyEpoch, setRuntimeReadyEpoch] = useState(0);
  const [displays, setDisplays] = useState<Awaited<ReturnType<typeof window.baoyin.display.list>>>([]);
  const [page, setPage] = useState<WorkbenchPage>(null);
  const [bottomPanelOpen, setBottomPanelOpen] = useState(() => readWorkbenchLayoutState().bottomPanelOpen);
  const [conversationKey, setConversationKey] = useState(() => `conversation.${crypto.randomUUID()}`);
  const [sessionTitle, setSessionTitle] = useState('新对话');
  const [sessionMessageCount, setSessionMessageCount] = useState(0);
  const [workbenchInspection, setWorkbenchInspection] = useState<WorkbenchInspection | null>(null);
  const [activeWorkbenchTool, setActiveWorkbenchTool] = useState<WorkbenchInspectionKind | null>(null);
  const [isMaximized, setIsMaximized] = useState(false);
  const [error, setError] = useState('');
  const [apiKeyDraft, setApiKeyDraft] = useState('');
  const [presentationDraft, setPresentationDraft] = useState<PresentationSettings>(DEFAULT_PRESENTATION_SETTINGS);
  const [agentTasks, setAgentTasks] = useState<AgentTask[] | null>(null);
  const [agentEvent, setAgentEvent] = useState<AgentEvent | null>(null);
  const settingsDirty = useRef(false);
  const roleDirty = useRef(false);
  const settingsTimer = useRef<number | null>(null);
  const presentationTimer = useRef<number | null>(null);
  const stateRef = useRef<PublicAppState | null>(null);
  const settingsRef = useRef<AppSettings | null>(null);
  const roleRef = useRef<RolePackage | null>(null);
  const presentationRef = useRef<PresentationSettings>(presentationDraft);

  const applyState = (next: PublicAppState): void => {
    if (stateRef.current?.live2d.entryPath !== next.live2d.entryPath) {
      setRuntimeCapabilities(null);
      setRuntimeResult(null);
    }
    stateRef.current = next;
    setAppState(next);
    if (!settingsDirty.current) {
      settingsRef.current = next.settings;
      setSettingsDraft(next.settings);
      presentationRef.current = next.settings.presentation;
      setPresentationDraft(next.settings.presentation);
    }
    if (!roleDirty.current) {
      roleRef.current = next.role;
      setRoleDraft(next.role);
    }
    setLive2dPreview(next.live2d);
  };

  useEffect(() => {
    document.body.dataset.window = 'settings';
    void Promise.all([window.baoyin.state.get(), window.baoyin.display.list()]).then(([next, displayList]) => {
      applyState(next);
      setDisplays(displayList);
    }).catch((loadError: unknown) => setError(loadError instanceof Error ? loadError.message : '设置初始化失败'));
    const unsubscribe = window.baoyin.state.onChange(applyState);
    const unsubscribeBounds = window.baoyin.pet.onBoundsChange((bounds) => {
      if (settingsDirty.current) return;
      const current = settingsRef.current ?? settingsDraft;
      if (!current || sameBounds(current.petBounds, bounds)) return;
      const next = syncPetBoundsIntoSettings(current, bounds);
      settingsRef.current = next;
      setSettingsDraft(next);
      setAppState((previous) => previous ? { ...previous, settings: syncPetBoundsIntoSettings(previous.settings, bounds) } : previous);
    });
    const unsubscribePreview = window.baoyin.settings.onPreview((detail) => {
      if (detail.domain !== 'settings' || !detail.patch.modelViewportByModel) return;
      const current = settingsRef.current;
      if (!current) return;
      const next = { ...current, modelViewportByModel: detail.patch.modelViewportByModel };
      settingsRef.current = next;
      setSettingsDraft(next);
    });
    const unsubscribeRuntimeReady = window.baoyin.debug.onRuntimeReady((modelIdentity) => {
      const currentIdentity = stateRef.current?.live2d.entryPath;
      if (modelIdentity && currentIdentity && modelIdentity !== currentIdentity) return;
      setRuntimeReadyEpoch((epoch) => epoch + 1);
    });
    void window.baoyin.app.isMaximized().then(setIsMaximized).catch(() => undefined);
    const unsubscribeMaximized = window.baoyin.app.onMaximizedChanged(setIsMaximized);
    void window.baoyin.workbench.inspect({ kind: 'source' }).then(setWorkbenchInspection).catch(() => undefined);
    const popstate = (): void => {
      const route = window.location.hash.slice(1);
      const settingsPageIds: readonly SettingsPageId[] = ['chat', 'personality', 'model', 'voice', 'service', 'behavior'];
      setPage(route === 'settings' ? 'settings' : settingsPageIds.includes(route as SettingsPageId) ? route as SettingsPageId : null);
    };
    window.addEventListener('popstate', popstate);
    window.history.replaceState({ settingsPage: null }, '', '#home');
    return () => {
      delete document.body.dataset.window;
      unsubscribe();
      unsubscribeBounds();
      unsubscribePreview();
      unsubscribeRuntimeReady();
      unsubscribeMaximized();
      window.removeEventListener('popstate', popstate);
      if (settingsTimer.current) window.clearTimeout(settingsTimer.current);
      if (presentationTimer.current) window.clearTimeout(presentationTimer.current);
    };
  }, []);

  useEffect(() => {
    writeWorkbenchLayoutPatch({ bottomPanelOpen });
  }, [bottomPanelOpen]);

  useEffect(() => {
    let disposed = false;
    const mergeTask = (task: AgentTask): void => {
      if (disposed) return;
      setAgentTasks((current) => [...(current ?? []).filter((item) => item.id !== task.id), task].sort((a, b) => b.updatedAt - a.updatedAt));
    };
    void window.baoyin.agent.list().then((tasks) => {
      if (!disposed) setAgentTasks([...tasks].sort((a, b) => b.updatedAt - a.updatedAt));
    }).catch(() => {
      if (!disposed) setAgentTasks(null);
    });
    const unsubscribe = window.baoyin.agent.onEvent((event) => {
      setAgentEvent(event);
      if (event.type === 'task') {
        mergeTask(event.task);
        return;
      }
      void window.baoyin.agent.get(event.taskId).then((task) => { if (task) mergeTask(task); }).catch(() => undefined);
    });
    return () => { disposed = true; unsubscribe(); };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void window.baoyin.debug.metrics().then(setDebugMetrics).catch(() => undefined);
    }, 800);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || !page) return;
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return;
      event.preventDefault();
      window.history.back();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [page]);

  const settings = settingsDraft ?? appState?.settings ?? DEFAULT_APP_SETTINGS;
  const role = roleDraft ?? appState?.role ?? null;
  useThemePreference(settings.themePreference);
  settingsRef.current = settingsDraft;
  roleRef.current = roleDraft;
  const modelViewport = useMemo(() => modelViewportForPath(settings, settings.live2dModelPath), [settings]);

  const persistSettings = async (next: AppSettings, clearApiKey = false): Promise<void> => {
    try {
      const saved = await window.baoyin.settings.save({ settings: next, apiKey: apiKeyDraft.trim() || undefined, clearApiKey });
      settingsDirty.current = false;
      settingsRef.current = saved.settings;
      setSettingsDraft(saved.settings);
      applyState(saved);
      setApiKeyDraft('');
      setError('');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '设置保存失败');
    }
  };

  const scheduleSettingsSave = (next: AppSettings): void => {
    if (settingsTimer.current) window.clearTimeout(settingsTimer.current);
    settingsTimer.current = window.setTimeout(() => void persistSettings(next), 360);
  };

  const onSettingsChange = (patch: Partial<AppSettings>, persist = true): void => {
    const normalizedPatch = typeof patch.petLocked === 'boolean'
      ? { ...patch, petInteractionMode: !patch.petLocked }
      : typeof patch.petInteractionMode === 'boolean'
        ? { ...patch, petLocked: !patch.petInteractionMode }
        : patch;
    const next = { ...settings, ...normalizedPatch };
    settingsDirty.current = true;
    settingsRef.current = next;
    setSettingsDraft(next);
    emitSettingsPreview({ domain: isWindowIntent(patch) ? 'window' : 'settings', patch });
    if (persist) scheduleSettingsSave(next);
  };

  const onPresentationChange = (patch: Partial<PresentationSettings>, persist = true): void => {
    const next = sanitizePresentationSettings({ ...presentationRef.current, ...patch });
    presentationRef.current = next;
    setPresentationDraft(next);
    emitSettingsPreview({ domain: 'presentation', patch });
    if (presentationTimer.current) window.clearTimeout(presentationTimer.current);
    if (persist) {
      presentationTimer.current = window.setTimeout(() => {
        const current = settingsRef.current ?? settings;
        const merged = { ...current, presentation: next };
        settingsDirty.current = true;
        settingsRef.current = merged;
        setSettingsDraft(merged);
        void persistSettings(merged);
      }, 360);
    }
  };

  const onRoleChange = (next: RolePackage): void => {
    roleDirty.current = true;
    roleRef.current = next;
    setRoleDraft(next);
  };

  const saveRole = async (): Promise<void> => {
    if (!role) return;
    try {
      const saved = await window.baoyin.roles.save({ role });
      roleDirty.current = false;
      applyState(saved);
      setError('');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '角色包保存失败');
    }
  };

  const openPage = (nextPage: SettingsPageId | 'settings'): void => {
    window.history.pushState({ settingsPage: nextPage }, '', `#${nextPage}`);
    setPage(nextPage);
  };

  const navigateWorkbench = (nextPage: WorkbenchPage): void => {
    if (nextPage === null) {
      window.history.pushState({ settingsPage: null }, '', '#home');
      setPage(null);
      return;
    }
    openPage(nextPage);
  };

  const startNewConversation = (): void => {
    setConversationKey(`conversation.${crypto.randomUUID()}`);
    setSessionTitle('新对话');
    setSessionMessageCount(0);
    setAgentEvent(null);
    setActiveWorkbenchTool(null);
    window.history.pushState({ settingsPage: null }, '', '#home');
    setPage(null);
  };

  const onMessageSent = (message: string): void => {
    setSessionMessageCount((count) => count + 1);
    setSessionTitle((current) => current === '新对话' ? message.slice(0, 32) : current);
  };

  const inspectWorkbench = async (kind: WorkbenchInspectionKind): Promise<void> => {
    try {
      setWorkbenchInspection(await window.baoyin.workbench.inspect({ kind }));
      setError('');
    } catch (inspectError) {
      setError(inspectError instanceof Error ? inspectError.message : '工作区检查失败');
    }
  };

  const handleToolAction = (action: WorkbenchToolAction): void => {
    if (action === 'chat') {
      navigateWorkbench(null);
      return;
    }
    if (action === 'tasks' || action === 'terminal') {
      setActiveWorkbenchTool(null);
      setBottomPanelOpen(true);
      return;
    }
    setActiveWorkbenchTool(action);
    void inspectWorkbench(action);
  };

  const shareEnvironment = async (): Promise<string> => {
    const result = await window.baoyin.workbench.share();
    return `环境摘要已复制到剪贴板（${result.text.split('\n').length} 行）`;
  };

  const toggleMaximize = async (): Promise<void> => {
    try { setIsMaximized(await window.baoyin.app.toggleMaximize()); }
    catch (maximizeError) { setError(maximizeError instanceof Error ? maximizeError.message : '窗口大小切换失败'); }
  };

  const backToSettingsHome = (): void => {
    window.history.pushState({ settingsPage: 'settings' }, '', '#settings');
    setPage('settings');
  };

  const resetPage = (): void => {
    if (page === 'personality' && appState) {
      roleDirty.current = false;
      setRoleDraft(appState.role);
      roleRef.current = appState.role;
      return;
    }
    if (page === 'model') {
      onViewportChange(DEFAULT_MODEL_VIEWPORT);
      onSettingsChange({ live2dShowWatermark: DEFAULT_APP_SETTINGS.live2dShowWatermark });
      return;
    }
    if (page === 'voice') {
      onSettingsChange({ cosyVoiceBaseUrl: DEFAULT_APP_SETTINGS.cosyVoiceBaseUrl, cosyVoiceSpeaker: DEFAULT_APP_SETTINGS.cosyVoiceSpeaker, cosyVoiceMode: DEFAULT_APP_SETTINGS.cosyVoiceMode, activeVoiceProfileId: DEFAULT_APP_SETTINGS.activeVoiceProfileId, ttsRate: DEFAULT_APP_SETTINGS.ttsRate, ttsVolume: DEFAULT_APP_SETTINGS.ttsVolume });
      return;
    }
    if (page === 'behavior') {
      onSettingsChange({ alwaysOnTop: DEFAULT_APP_SETTINGS.alwaysOnTop, cursorTrackingEnabled: DEFAULT_APP_SETTINGS.cursorTrackingEnabled, cursorEyeWeight: DEFAULT_APP_SETTINGS.cursorEyeWeight, cursorHeadWeight: DEFAULT_APP_SETTINGS.cursorHeadWeight, cursorBodyWeight: DEFAULT_APP_SETTINGS.cursorBodyWeight, cursorSmoothing: DEFAULT_APP_SETTINGS.cursorSmoothing, cursorMaxStep: DEFAULT_APP_SETTINGS.cursorMaxStep, cursorRangeX: DEFAULT_APP_SETTINGS.cursorRangeX, cursorRangeY: DEFAULT_APP_SETTINGS.cursorRangeY, cursorIdleMotion: DEFAULT_APP_SETTINGS.cursorIdleMotion, petWindowOpacity: DEFAULT_APP_SETTINGS.petWindowOpacity, petHoverBorderOpacity: DEFAULT_APP_SETTINGS.petHoverBorderOpacity, petHoverShowDelayMs: DEFAULT_APP_SETTINGS.petHoverShowDelayMs, petHoverFadeMs: DEFAULT_APP_SETTINGS.petHoverFadeMs, petDisplayId: DEFAULT_APP_SETTINGS.petDisplayId, settingsShortcut: DEFAULT_APP_SETTINGS.settingsShortcut, themePreference: DEFAULT_APP_SETTINGS.themePreference });
      return;
    }
    if (page === 'service') {
      onSettingsChange({ apiBaseUrl: DEFAULT_APP_SETTINGS.apiBaseUrl, model: DEFAULT_APP_SETTINGS.model, temperature: DEFAULT_APP_SETTINGS.temperature, maxTokens: DEFAULT_APP_SETTINGS.maxTokens, systemPrompt: '' });
    }
  };

  const onViewportChange = (patch: Partial<ModelViewportSettings>): void => {
    const key = settings.live2dModelPath?.trim().replaceAll('\\', '/').toLocaleLowerCase();
    if (!key) return;
    const nextViewport = sanitizeModelViewport({ ...modelViewport, ...patch });
    onSettingsChange({ modelViewportByModel: { ...settings.modelViewportByModel, [key]: nextViewport } });
  };

  const inspectModel = async (path = settings.live2dModelPath ?? ''): Promise<void> => {
    if (!path.trim()) {
      setLive2dPreview(null);
      return;
    }
    try {
      setLive2dPreview(await window.baoyin.live2d.inspect(path));
    } catch (inspectError) {
      setError(inspectError instanceof Error ? inspectError.message : '外部模型检查失败');
    }
  };

  const chooseModel = async (kind: 'file' | 'directory'): Promise<void> => {
    const path = kind === 'file' ? await window.baoyin.live2d.chooseFile() : await window.baoyin.live2d.chooseDirectory();
    if (!path) return;
    try {
      const imported = await window.baoyin.live2d.import(path);
      onSettingsChange({ live2dModelPath: imported.record.entryPath }, false);
      setLive2dPreview(imported.state);
      setError('');
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : '外部模型导入失败');
    }
  };

  const switchModel = async (id: string): Promise<void> => {
    const record = appState?.live2dModels.find((candidate) => candidate.id === id);
    if (!record) return;
    await persistSettings({ ...settings, live2dModelPath: record.entryPath });
  };

  const removeModel = async (id: string): Promise<void> => {
    try {
      const next = await window.baoyin.live2d.remove({ id });
      settingsDirty.current = false;
      applyState(next);
      setError('');
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : '移除模型记录失败');
    }
  };

  const runRuntimeCommand = async (command: CubismRuntimeCommand): Promise<void> => {
    try {
      const result = await window.baoyin.debug.runtimeCommand(command);
      setRuntimeResult(result);
      setRuntimeCapabilities(result.capabilities);
    } catch (runtimeError) {
      setRuntimeResult(null);
      setError(runtimeError instanceof Error ? runtimeError.message : 'Cubism runtime 命令失败');
    }
  };

  const cancelAgentTask = async (taskId: string): Promise<void> => {
    try {
      await window.baoyin.agent.cancel(taskId);
      const task = await window.baoyin.agent.get(taskId);
      if (task) setAgentTasks((current) => [...(current ?? []).filter((item) => item.id !== task.id), task].sort((a, b) => b.updatedAt - a.updatedAt));
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : 'Agent 任务取消失败');
    }
  };

  useEffect(() => {
    if (page !== 'model' || !settings.live2dModelPath) return;
    void runRuntimeCommand({ type: 'capabilities' });
  }, [page, settings.live2dModelPath, runtimeReadyEpoch]);

  const cloneRole = (): void => {
    if (!role) return;
    onRoleChange(cloneRolePackage(role, `role.${Date.now()}`, `${role.displayName} 副本`));
  };

  const createBlankRole = (): void => {
    onRoleChange(createBlankRolePackage(`role.${crypto.randomUUID()}`));
  };

  const activateRole = async (id: string): Promise<void> => {
    try {
      const next = await window.baoyin.roles.activate({ id });
      roleDirty.current = false;
      applyState(next);
    } catch (activateError) {
      setError(activateError instanceof Error ? activateError.message : '角色切换失败');
    }
  };

  const deleteRole = async (): Promise<void> => {
    if (!role || role.id === 'baoyin.default') return;
    try {
      const next = await window.baoyin.roles.delete({ id: role.id });
      roleDirty.current = false;
      applyState(next);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : '角色删除失败');
    }
  };

  const importRole = async (): Promise<void> => {
    try {
      const next = await window.baoyin.roles.import();
      roleDirty.current = false;
      applyState(next);
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : '角色导入失败');
    }
  };

  const exportRole = async (): Promise<void> => {
    if (!role) return;
    try {
      await window.baoyin.roles.export({ id: role.id });
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : '角色导出失败');
    }
  };

  if (!appState || !roleDraft) return <div className="loading-card">正在唤醒 StarChat 工作台…</div>;

  const workbenchContent = page === null
      ? <AgentConsole key={conversationKey} state={appState} agentTasks={agentTasks ?? []} agentEvent={agentEvent} onModeChange={(mode) => onSettingsChange({ assistantMode: mode })} onNewConversation={startNewConversation} onMessageSent={onMessageSent} />
      : page === 'settings'
      ? <SettingsHome state={appState} presentation={presentationDraft} />
      : <SettingsDetailsV2 state={appState} page={page} conversationKey={conversationKey} onNewConversation={startNewConversation} onMessageSent={onMessageSent} settingsDraft={settings} roleDraft={roleDraft} presentationDraft={presentationDraft} live2dPreview={live2dPreview} debugMetrics={debugMetrics} runtimeCapabilities={runtimeCapabilities} runtimeResult={runtimeResult} displays={displays} error={error} modelViewport={modelViewport} agentTasks={agentTasks ?? []} agentEvent={agentEvent} onBack={backToSettingsHome} onResetPage={resetPage} onSettingsChange={onSettingsChange} onPresentationChange={onPresentationChange} onRoleChange={onRoleChange} onSaveRole={() => void saveRole()} onActivateRole={(id) => void activateRole(id)} onCreateBlankRole={createBlankRole} onCloneRole={cloneRole} onDeleteRole={() => void deleteRole()} onImportRole={() => void importRole()} onExportRole={() => void exportRole()} onChooseModel={(kind) => void chooseModel(kind)} onInspectModel={() => void inspectModel()} onSaveSettings={() => void persistSettings(settings)} onSwitchModel={(id) => void switchModel(id)} onRemoveModel={(id) => void removeModel(id)} onViewportChange={onViewportChange} onResetViewport={() => onViewportChange(DEFAULT_MODEL_VIEWPORT)} onCenterViewport={() => onViewportChange({ modelOffsetX: 0, modelOffsetY: 0 })} onFitViewport={() => window.baoyin.debug.command({ type: 'fit-frame' })} onSendPresentation={(event) => window.baoyin.presentation.emit(event)} onDebug={(command) => window.baoyin.debug.command(command)} onRuntimeCommand={(command) => void runRuntimeCommand(command)} apiKeyDraft={apiKeyDraft} onApiKeyChange={setApiKeyDraft} onSaveService={() => void persistSettings(settings)} onClearApiKey={() => void persistSettings(settings, true)} />;

    return <main className="app-shell settings-center-shell">
      <AgentWorkbench activePage={page} roleName={roleDraft.displayName} modelLabel={live2dPreview?.entryPath ?? appState.live2d.entryPath ?? '未配置外部模型'} bottomPanelOpen={bottomPanelOpen} agentAvailable={agentTasks !== null} agentTasks={agentTasks ?? []} onNavigate={navigateWorkbench} onToggleBottomPanel={() => setBottomPanelOpen((open) => !open)} onNewConversation={startNewConversation} sessionTitle={sessionTitle} sessionMessageCount={sessionMessageCount} workspaceLabel={pathLabel(workbenchInspection?.environment.gitRoot ?? workbenchInspection?.environment.workspaceRoot)} environment={workbenchInspection?.environment ?? null} inspection={workbenchInspection} activeTool={activeWorkbenchTool} onToolAction={handleToolAction} onRefreshInspection={() => activeWorkbenchTool && void inspectWorkbench(activeWorkbenchTool)} onShare={shareEnvironment} onCancelTask={(taskId) => void cancelAgentTask(taskId)} onMinimize={() => window.baoyin.app.minimize()} onClose={() => window.baoyin.app.hideSettings()} onMaximize={() => void toggleMaximize()} isMaximized={isMaximized}>{workbenchContent}</AgentWorkbench>
    </main>;
}

export default App;
