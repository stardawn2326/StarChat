import { useEffect, useMemo, useRef, useState } from 'react';
import type { CubismDebugCommand, CubismRuntimeCommand, PublicAppState } from '../../shared/ipc';
import type { AgentEvent, AgentTask } from '../../shared/agent';
import type { CubismRuntimeCapabilities, CubismRuntimeMetrics, CubismRuntimeResult } from '../../shared/cubism';
import type { Live2DModelState } from '../../shared/live2d';
import type { PresentationEvent } from '../../shared/presentation';
import { cloneRolePackage, createBlankRolePackage, type RolePackage } from '../../shared/role-package';
import { isBuiltinRoleId } from '../../shared/default-role';
import { DEFAULT_APP_SETTINGS, DEFAULT_MODEL_VIEWPORT, modelViewportForPath, sanitizeModelViewport, type AppSettings, type ModelViewportSettings } from '../../shared/settings';
import { SettingsDetailsV2 } from './SettingsDetailsV2';
import { SettingsHome } from './SettingsHome';
import type { SettingsPageId } from './settings-schema';
import { emitSettingsPreview, isWindowIntent } from './settings-preview';
import { DEFAULT_PRESENTATION_SETTINGS, sanitizePresentationSettings, type PresentationSettings } from '../../shared/presentation-contract';
import { applyThemeToDocument, nextThemePreference, type ResolvedTheme } from '../../shared/theme';
import { syncPetBoundsIntoSettings } from './settings-state';
import { AgentWorkbench, type WorkbenchPage } from './AgentWorkbench';
import type { WorkbenchDiffPreview, WorkbenchFilePreview, WorkbenchInspection, WorkbenchInspectionKind, WorkbenchVerificationResult, WorkbenchVerificationScript } from '../../shared/workbench';
import type { ActiveWorkbenchTool, WorkbenchToolAction } from './AgentWorkbench';
import { AgentConsole } from './AgentConsole';
import { readWorkbenchLayoutState, writeWorkbenchLayoutPatch } from './workbench-layout';
import type { SessionSnapshot } from '../../shared/session';

function sameBounds(a: AppSettings['petBounds'], b: AppSettings['petBounds']): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function useThemePreference(preference: AppSettings['themePreference']): ResolvedTheme {
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>('light');
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = (): void => {
      setResolvedTheme(applyThemeToDocument(document, preference, media.matches));
    };
    apply();
    const onSystemThemeChange = (): void => {
      if (preference === 'system') apply();
    };
    media.addEventListener('change', onSystemThemeChange);
    return () => media.removeEventListener('change', onSystemThemeChange);
  }, [preference]);
  return resolvedTheme;
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
  const [displays, setDisplays] = useState<Awaited<ReturnType<typeof window.starchat.display.list>>>([]);
  const [page, setPage] = useState<WorkbenchPage>(null);
  const [bottomPanelOpen, setBottomPanelOpen] = useState(() => readWorkbenchLayoutState().bottomPanelOpen);
  const [conversationKey, setConversationKey] = useState(() => `conversation.${crypto.randomUUID()}`);
  const [sessionTitle, setSessionTitle] = useState('新对话');
  const [sessionMessageCount, setSessionMessageCount] = useState(0);
  const [sessionSnapshot, setSessionSnapshot] = useState<SessionSnapshot>({ workspaces: [], sessions: [], activeWorkspaceId: null, activeSessionId: null });
  const [workbenchInspection, setWorkbenchInspection] = useState<WorkbenchInspection | null>(null);
  const [activeWorkbenchTool, setActiveWorkbenchTool] = useState<ActiveWorkbenchTool | null>(null);
  const [filePreview, setFilePreview] = useState<WorkbenchFilePreview | null>(null);
  const [diffPreview, setDiffPreview] = useState<WorkbenchDiffPreview | null>(null);
  const [verification, setVerification] = useState<WorkbenchVerificationResult | null>(null);
  const [toolBusy, setToolBusy] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [workbenchCharacterVisible, setWorkbenchCharacterVisible] = useState(true);
  const [error, setError] = useState('');
  const [apiKeyDraft, setApiKeyDraft] = useState('');
  const [presentationDraft, setPresentationDraft] = useState<PresentationSettings>(DEFAULT_PRESENTATION_SETTINGS);
  const [agentTasks, setAgentTasks] = useState<AgentTask[] | null>(null);
  const [agentEvent, setAgentEvent] = useState<AgentEvent | null>(null);
  const settingsDirty = useRef(false);
  const roleDirty = useRef(false);
  const settingsTimer = useRef<number | null>(null);
  const presentationTimer = useRef<number | null>(null);
  const maximizeRequestRef = useRef(false);
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
    void Promise.all([window.starchat.state.get(), window.starchat.display.list(), window.starchat.sessions.snapshot()]).then(([next, displayList, sessions]) => {
      applyState(next);
      setDisplays(displayList);
      setSessionSnapshot(sessions);
    }).catch((loadError: unknown) => setError(loadError instanceof Error ? loadError.message : '设置初始化失败'));
    const unsubscribe = window.starchat.state.onChange(applyState);
    const unsubscribeBounds = window.starchat.pet.onBoundsChange((bounds) => {
      if (settingsDirty.current) return;
      const current = settingsRef.current ?? settingsDraft;
      if (!current || sameBounds(current.petBounds, bounds)) return;
      const next = syncPetBoundsIntoSettings(current, bounds);
      settingsRef.current = next;
      setSettingsDraft(next);
      setAppState((previous) => previous ? { ...previous, settings: syncPetBoundsIntoSettings(previous.settings, bounds) } : previous);
    });
    const unsubscribePreview = window.starchat.settings.onPreview((detail) => {
      if (detail.domain !== 'settings' || !detail.patch.modelViewportByModel) return;
      const current = settingsRef.current;
      if (!current) return;
      const next = { ...current, modelViewportByModel: detail.patch.modelViewportByModel };
      settingsRef.current = next;
      setSettingsDraft(next);
    });
    const unsubscribeRuntimeReady = window.starchat.debug.onRuntimeReady((modelIdentity) => {
      const currentIdentity = stateRef.current?.live2d.entryPath;
      if (modelIdentity && currentIdentity && modelIdentity !== currentIdentity) return;
      setRuntimeReadyEpoch((epoch) => epoch + 1);
    });
    void window.starchat.app.isMaximized().then(setIsMaximized).catch(() => undefined);
    const unsubscribeMaximized = window.starchat.app.onMaximizedChanged(setIsMaximized);
    const unsubscribeWorkbenchCharacterVisibility = window.starchat.app.onWorkbenchCharacterVisibilityChanged(setWorkbenchCharacterVisible);
    const unsubscribeSessions = window.starchat.sessions.onChange(setSessionSnapshot);
    void window.starchat.workbench.inspect({ kind: 'source' }).then(setWorkbenchInspection).catch(() => undefined);
    const popstate = (): void => {
      const route = window.location.hash.slice(1);
      const settingsPageIds: readonly SettingsPageId[] = ['general', 'appearance', 'shortcuts', 'chat', 'personality', 'model', 'voice', 'service', 'behavior', 'agent', 'permissions', 'terminal', 'browser', 'git'];
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
      unsubscribeWorkbenchCharacterVisibility();
      unsubscribeSessions();
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
    void window.starchat.agent.list().then((tasks) => {
      if (!disposed) setAgentTasks([...tasks].sort((a, b) => b.updatedAt - a.updatedAt));
    }).catch(() => {
      if (!disposed) setAgentTasks(null);
    });
    const unsubscribe = window.starchat.agent.onEvent((event) => {
      setAgentEvent(event);
      if (event.type === 'task') {
        mergeTask(event.task);
        return;
      }
      void window.starchat.agent.get(event.taskId).then((task) => { if (task) mergeTask(task); }).catch(() => undefined);
    });
    return () => { disposed = true; unsubscribe(); };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void window.starchat.debug.metrics().then(setDebugMetrics).catch(() => undefined);
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
  const resolvedTheme = useThemePreference(settings.themePreference);
  settingsRef.current = settingsDraft;
  roleRef.current = roleDraft;
  const modelViewport = useMemo(() => modelViewportForPath(settings, settings.live2dModelPath), [settings]);
  const activeWorkspace = sessionSnapshot.workspaces.find((workspace) => workspace.id === sessionSnapshot.activeWorkspaceId) ?? null;
  const activeSession = sessionSnapshot.sessions.find((session) => session.id === sessionSnapshot.activeSessionId) ?? null;
  const workspaceAvailable = Boolean(activeWorkspace && activeSession?.contextType === 'workspace');
  const visibleAgentTasks = (agentTasks ?? []).filter((task) => task.sessionId === activeSession?.id);
  const activeAgentEvent = agentEvent && visibleAgentTasks.some((task) => task.id === agentEvent.taskId) ? agentEvent : null;

  useEffect(() => {
    setConversationKey(`conversation.${activeSession?.id ?? 'no-workspace'}`);
    setAgentEvent(null);
  }, [activeSession?.id]);

  useEffect(() => {
    setSessionTitle(activeSession?.title ?? '新对话');
    setSessionMessageCount(activeSession?.messages.length ?? 0);
  }, [activeSession?.title, activeSession?.messages.length]);

  useEffect(() => {
    setActiveWorkbenchTool(null);
    setWorkbenchInspection(null);
    setFilePreview(null);
    setDiffPreview(null);
    setVerification(null);
  }, [activeSession?.id]);

  useEffect(() => {
    if (!activeSession) {
      setWorkbenchInspection(null);
      return;
    }
    void window.starchat.workbench.inspect({ kind: 'source' }).then(setWorkbenchInspection).catch(() => setWorkbenchInspection(null));
  }, [activeSession?.id]);

  const persistSettings = async (next: AppSettings, clearApiKey = false): Promise<void> => {
    try {
      const saved = await window.starchat.settings.save({ settings: next, apiKey: apiKeyDraft.trim() || undefined, clearApiKey });
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
      const saved = await window.starchat.roles.save({ role });
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

  const applySessionSelection = (next: SessionSnapshot): void => {
    setSessionSnapshot(next);
    setAgentEvent(null);
    setActiveWorkbenchTool(null);
    window.history.pushState({ settingsPage: null }, '', '#home');
    setPage(null);
  };

  const startNewConversation = async (): Promise<void> => {
    try {
      applySessionSelection(activeWorkspace
        ? await window.starchat.sessions.create(activeWorkspace.id)
        : await window.starchat.sessions.createPersonal());
    }
    catch (reason) { setError(reason instanceof Error ? reason.message : '新建会话失败'); }
  };

  const onMessageSent = (message: string): void => {
    setSessionMessageCount((count) => count + 1);
    setSessionTitle((current) => current === '新对话' ? message.slice(0, 32) : current);
  };

  const chooseWorkspace = async (): Promise<void> => {
    try { applySessionSelection(await window.starchat.sessions.chooseWorkspace()); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '选择工作区失败'); }
  };

  const selectWorkspace = async (workspaceId: string): Promise<void> => {
    try { applySessionSelection(await window.starchat.sessions.selectWorkspace(workspaceId)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '切换工作区失败'); }
  };

  const setWorkspaceTrust = async (trust: import('../../shared/session').WorkspaceTrustState): Promise<void> => {
    if (!activeWorkspace) return;
    try { setSessionSnapshot(await window.starchat.sessions.setTrust({ workspaceId: activeWorkspace.id, trust })); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '工作区信任设置失败'); }
  };

  const selectSession = async (sessionId: string): Promise<void> => {
    try { applySessionSelection(await window.starchat.sessions.select(sessionId)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '切换会话失败'); }
  };

  const renameSession = async (sessionId: string): Promise<void> => {
    const current = sessionSnapshot.sessions.find((session) => session.id === sessionId);
    const title = window.prompt('重命名会话', current?.title ?? '新对话');
    if (title === null) return;
    try { setSessionSnapshot(await window.starchat.sessions.rename({ sessionId, title })); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '重命名会话失败'); }
  };

  const deleteSession = async (sessionId: string): Promise<void> => {
    if ((agentTasks ?? []).some((task) => task.sessionId === sessionId && ['queued', 'running', 'waiting_for_approval', 'waiting_for_input'].includes(task.status))) {
      setError('当前会话仍有活动任务，请先停止任务再删除。');
      return;
    }
    if (!window.confirm('删除该会话及其消息记录？此操作不可撤销。')) return;
    try { applySessionSelection(await window.starchat.sessions.delete(sessionId)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '删除会话失败'); }
  };

  const inspectWorkbench = async (kind: WorkbenchInspectionKind, path = ''): Promise<void> => {
    setToolBusy(true);
    try {
      setWorkbenchInspection(await window.starchat.workbench.inspect({ kind, path }));
      setError('');
    } catch (inspectError) {
      setError(inspectError instanceof Error ? inspectError.message : '工作区检查失败');
    } finally {
      setToolBusy(false);
    }
  };

  const handleToolAction = (action: WorkbenchToolAction): void => {
    if (action === 'chat') {
      setActiveWorkbenchTool(null);
      navigateWorkbench(null);
      return;
    }
    if (activeWorkbenchTool === action) {
      setActiveWorkbenchTool(null);
      return;
    }
    setActiveWorkbenchTool(action);
    setFilePreview(null);
    setDiffPreview(null);
    if (action === 'resources' || action === 'source') void inspectWorkbench(action);
  };

  const previewFile = async (path: string): Promise<void> => {
    setToolBusy(true);
    try { setFilePreview(await window.starchat.workbench.previewFile({ path })); setError(''); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '文件预览失败'); }
    finally { setToolBusy(false); }
  };

  const previewDiff = async (path: string): Promise<void> => {
    setToolBusy(true);
    try { setDiffPreview(await window.starchat.workbench.diff({ path })); setError(''); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '读取差异失败'); }
    finally { setToolBusy(false); }
  };

  const verifyWorkbench = async (script: WorkbenchVerificationScript): Promise<void> => {
    setToolBusy(true);
    setVerification(null);
    try { setVerification(await window.starchat.workbench.verify({ script })); setError(''); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '受控验证失败'); }
    finally { setToolBusy(false); }
  };

  const refreshActiveTool = async (): Promise<void> => {
    if (activeWorkbenchTool === 'resources') return inspectWorkbench('resources', workbenchInspection?.resourcePath ?? '');
    if (activeWorkbenchTool === 'source') return inspectWorkbench('source');
    if (activeWorkbenchTool === 'tasks') {
      try { setAgentTasks((await window.starchat.agent.list()).sort((a, b) => b.updatedAt - a.updatedAt)); }
      catch (reason) { setError(reason instanceof Error ? reason.message : '刷新任务失败'); }
    }
  };

  const shareEnvironment = async (): Promise<string> => {
    const result = await window.starchat.workbench.share();
    return `环境摘要已复制到剪贴板（${result.text.split('\n').length} 行）`;
  };

  const toggleMaximize = async (): Promise<void> => {
    if (maximizeRequestRef.current) return;
    maximizeRequestRef.current = true;
    const requested = !isMaximized;
    setIsMaximized(requested);
    try {
      setIsMaximized(await window.starchat.app.toggleMaximize(requested));
    } catch (maximizeError) {
      setError(maximizeError instanceof Error ? maximizeError.message : '窗口大小切换失败');
      void window.starchat.app.isMaximized().then(setIsMaximized).catch(() => undefined);
    } finally {
      maximizeRequestRef.current = false;
    }
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
      setLive2dPreview(await window.starchat.live2d.inspect(path));
    } catch (inspectError) {
      setError(inspectError instanceof Error ? inspectError.message : '外部模型检查失败');
    }
  };

  const chooseModel = async (kind: 'file' | 'directory'): Promise<void> => {
    const path = kind === 'file' ? await window.starchat.live2d.chooseFile() : await window.starchat.live2d.chooseDirectory();
    if (!path) return;
    try {
      const imported = await window.starchat.live2d.import(path);
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
      const next = await window.starchat.live2d.remove({ id });
      settingsDirty.current = false;
      applyState(next);
      setError('');
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : '移除模型记录失败');
    }
  };

  const runRuntimeCommand = async (command: CubismRuntimeCommand): Promise<void> => {
    try {
      const result = await window.starchat.debug.runtimeCommand(command);
      setRuntimeResult(result);
      setRuntimeCapabilities(result.capabilities);
    } catch (runtimeError) {
      setRuntimeResult(null);
      setError(runtimeError instanceof Error ? runtimeError.message : 'Cubism runtime 命令失败');
    }
  };

  const cancelAgentTask = async (taskId: string): Promise<void> => {
    try {
      await window.starchat.agent.cancel(taskId);
      const task = await window.starchat.agent.get(taskId);
      if (task) setAgentTasks((current) => [...(current ?? []).filter((item) => item.id !== task.id), task].sort((a, b) => b.updatedAt - a.updatedAt));
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : 'Agent 任务取消失败');
    }
  };

  const approveAgentTask = async (task: AgentTask, approved: boolean): Promise<void> => {
    if (!task.approval) return;
    try {
      await window.starchat.agent.approve({ taskId: task.id, requestId: task.approval.id, approved });
      const next = await window.starchat.agent.get(task.id);
      if (next) setAgentTasks((current) => [...(current ?? []).filter((item) => item.id !== next.id), next].sort((a, b) => b.updatedAt - a.updatedAt));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Agent 审批失败');
    }
  };

  const retryAgentTask = async (task: AgentTask): Promise<void> => {
    try {
      const started = await window.starchat.agent.retry(task.id);
      const next = await window.starchat.agent.get(started.taskId);
      if (next) setAgentTasks((current) => [...(current ?? []).filter((item) => item.id !== next.id), next].sort((a, b) => b.updatedAt - a.updatedAt));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Agent 任务重新执行失败');
    }
  };

  const respondAgentTask = async (task: AgentTask): Promise<void> => {
    if (!task.input) return;
    const value = window.prompt(task.input.prompt, '');
    if (value === null || !value.trim()) return;
    try {
      await window.starchat.agent.respond({ taskId: task.id, requestId: task.input.id, value: value.trim() });
      const next = await window.starchat.agent.get(task.id);
      if (next) setAgentTasks((current) => [...(current ?? []).filter((item) => item.id !== next.id), next].sort((a, b) => b.updatedAt - a.updatedAt));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '提交补充信息失败');
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
      const next = await window.starchat.roles.activate({ id });
      roleDirty.current = false;
      applyState(next);
    } catch (activateError) {
      setError(activateError instanceof Error ? activateError.message : '角色切换失败');
    }
  };

  const deleteRole = async (): Promise<void> => {
    if (!role || isBuiltinRoleId(role.id)) return;
    try {
      const next = await window.starchat.roles.delete({ id: role.id });
      roleDirty.current = false;
      applyState(next);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : '角色删除失败');
    }
  };

  const deleteMemory = async (id: string): Promise<void> => {
    try {
      const next = await window.starchat.memory.delete(id);
      applyState(next);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : '记忆删除失败');
    }
  };

  const clearMemories = async (): Promise<void> => {
    try {
      const next = await window.starchat.memory.clear();
      applyState(next);
    } catch (clearError) {
      setError(clearError instanceof Error ? clearError.message : '长期记忆清理失败');
    }
  };

  const importRole = async (): Promise<void> => {
    try {
      const next = await window.starchat.roles.import();
      roleDirty.current = false;
      applyState(next);
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : '角色导入失败');
    }
  };

  const exportRole = async (): Promise<void> => {
    if (!role) return;
    try {
      await window.starchat.roles.export({ id: role.id });
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : '角色导出失败');
    }
  };

  if (!appState || !roleDraft) return <div className="loading-card">正在唤醒 StarChat 工作台…</div>;

  const workbenchContent = page === null
      ? <AgentConsole key={conversationKey} state={appState} agentTasks={visibleAgentTasks} agentEvent={activeAgentEvent} onModeChange={(mode) => onSettingsChange({ assistantMode: mode })} onNewConversation={() => void startNewConversation()} onMessageSent={onMessageSent} onRequestWorkspace={() => void chooseWorkspace()} onShowPet={() => { setWorkbenchCharacterVisible(false); window.starchat.app.showPet(); }} characterVisible={workbenchCharacterVisible} initialMessages={activeSession?.messages ?? []} sessionId={activeSession?.id ?? ''} workspaceAvailable={workspaceAvailable} />
      : page === 'settings'
      ? <SettingsHome state={appState} presentation={presentationDraft} />
      : <SettingsDetailsV2 state={appState} page={page} conversationKey={conversationKey} onNewConversation={() => void startNewConversation()} onMessageSent={onMessageSent} onRequestWorkspace={() => void chooseWorkspace()} initialMessages={activeSession?.messages ?? []} sessionId={activeSession?.id ?? ''} workspaceAvailable={workspaceAvailable} settingsDraft={settings} roleDraft={roleDraft} presentationDraft={presentationDraft} live2dPreview={live2dPreview} debugMetrics={debugMetrics} runtimeCapabilities={runtimeCapabilities} runtimeResult={runtimeResult} displays={displays} error={error} modelViewport={modelViewport} agentTasks={visibleAgentTasks} agentEvent={activeAgentEvent} onBack={backToSettingsHome} onResetPage={resetPage} onSettingsChange={onSettingsChange} onPresentationChange={onPresentationChange} onRoleChange={onRoleChange} onSaveRole={() => void saveRole()} onActivateRole={(id) => void activateRole(id)} onCreateBlankRole={createBlankRole} onCloneRole={cloneRole} onDeleteRole={() => void deleteRole()} onImportRole={() => void importRole()} onExportRole={() => void exportRole()} onChooseModel={(kind) => void chooseModel(kind)} onInspectModel={() => void inspectModel()} onSaveSettings={() => void persistSettings(settings)} onSwitchModel={(id) => void switchModel(id)} onRemoveModel={(id) => void removeModel(id)} onViewportChange={onViewportChange} onResetViewport={() => onViewportChange(DEFAULT_MODEL_VIEWPORT)} onCenterViewport={() => onViewportChange({ modelOffsetX: 0, modelOffsetY: 0 })} onFitViewport={() => window.starchat.debug.command({ type: 'fit-frame' })} onSendPresentation={(event) => window.starchat.presentation.emit(event)} onDebug={(command) => window.starchat.debug.command(command)} onRuntimeCommand={(command) => void runRuntimeCommand(command)} apiKeyDraft={apiKeyDraft} onApiKeyChange={setApiKeyDraft} onSaveService={() => void persistSettings(settings)} onClearApiKey={() => void persistSettings(settings, true)} onDeleteMemory={(id) => void deleteMemory(id)} onClearMemories={() => void clearMemories()} />;

     return <main className="app-shell settings-center-shell">
       <AgentWorkbench
         activePage={page}
         roleName={roleDraft.displayName}
         modelLabel={live2dPreview?.entryPath ?? appState.live2d.entryPath ?? '未配置外部模型'}
         theme={resolvedTheme}
         onToggleTheme={() => onSettingsChange({ themePreference: nextThemePreference(resolvedTheme) })}
         bottomPanelOpen={bottomPanelOpen}
         agentAvailable={agentTasks !== null}
         agentTasks={visibleAgentTasks}
         onNavigate={navigateWorkbench}
         onToggleBottomPanel={() => setBottomPanelOpen((open) => !open)}
         onNewConversation={() => void startNewConversation()}
         sessionTitle={sessionTitle}
         sessionMessageCount={sessionMessageCount}
         workspaceLabel={activeWorkspace?.label ?? (activeSession?.contextType === 'personal' ? '个人空间' : pathLabel(workbenchInspection?.environment.gitRoot ?? workbenchInspection?.environment.workspaceRoot))}
         workspaces={sessionSnapshot.workspaces}
         sessions={sessionSnapshot.sessions}
         activeWorkspaceId={sessionSnapshot.activeWorkspaceId}
         activeSessionId={sessionSnapshot.activeSessionId}
         onChooseWorkspace={() => void chooseWorkspace()}
         onSelectWorkspace={(id) => void selectWorkspace(id)}
         onSelectSession={(id) => void selectSession(id)}
         onRenameSession={(id) => void renameSession(id)}
         onDeleteSession={(id) => void deleteSession(id)}
         workspaceTrust={activeWorkspace?.trust}
         onSetWorkspaceTrust={(trust) => void setWorkspaceTrust(trust)}
         environment={workbenchInspection?.environment ?? null}
         inspection={workbenchInspection}
         activeTool={activeWorkbenchTool}
         filePreview={filePreview}
         diffPreview={diffPreview}
         verification={verification}
         toolBusy={toolBusy}
         onToolAction={handleToolAction}
         onRefreshInspection={() => void refreshActiveTool()}
         onOpenResource={(path) => void inspectWorkbench('resources', path)}
         onPreviewFile={(path) => void previewFile(path)}
         onPreviewDiff={(path) => void previewDiff(path)}
         onVerify={(script) => void verifyWorkbench(script)}
         onApproveTask={(task, approved) => void approveAgentTask(task, approved)}
         onRetryTask={(task) => void retryAgentTask(task)}
         onRespondTask={(task) => void respondAgentTask(task)}
         onShare={shareEnvironment}
         onCancelTask={(taskId) => void cancelAgentTask(taskId)}
         onMinimize={() => window.starchat.app.minimize()}
         onClose={() => window.starchat.app.hideSettings()}
         onMaximize={() => void toggleMaximize()}
         isMaximized={isMaximized}
       >{workbenchContent}</AgentWorkbench>
    </main>;
}

export default App;
