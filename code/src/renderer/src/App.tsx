import { useEffect, useMemo, useRef, useState } from 'react';
import type { CubismDebugCommand, PublicAppState } from '../../shared/ipc';
import type { CubismRuntimeMetrics } from '../../shared/cubism';
import type { Live2DModelState } from '../../shared/live2d';
import type { PresentationEvent } from '../../shared/presentation';
import { cloneRolePackage, createBlankRolePackage, type RolePackage } from '../../shared/role-package';
import { DEFAULT_APP_SETTINGS, DEFAULT_MODEL_VIEWPORT, modelViewportForPath, sanitizeModelViewport, type AppSettings, type ModelViewportSettings } from '../../shared/settings';
import { SettingsDetails } from './SettingsDetails';
import { SettingsHome } from './SettingsHome';
import type { SettingsPageId } from './settings-schema';
import { emitSettingsPreview, isWindowIntent } from './settings-preview';
import { DEFAULT_PRESENTATION_SETTINGS, sanitizePresentationSettings, type PresentationSettings } from '../../shared/presentation-contract';
import { syncPetBoundsIntoSettings } from './settings-state';

function sameBounds(a: AppSettings['petBounds'], b: AppSettings['petBounds']): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function App(): JSX.Element {
  const [appState, setAppState] = useState<PublicAppState | null>(null);
  const [settingsDraft, setSettingsDraft] = useState<AppSettings | null>(null);
  const [roleDraft, setRoleDraft] = useState<RolePackage | null>(null);
  const [live2dPreview, setLive2dPreview] = useState<Live2DModelState | null>(null);
  const [debugMetrics, setDebugMetrics] = useState<CubismRuntimeMetrics | null>(null);
  const [displays, setDisplays] = useState<Awaited<ReturnType<typeof window.baoyin.display.list>>>([]);
  const [page, setPage] = useState<SettingsPageId | null>(null);
  const [error, setError] = useState('');
  const [licenseAccepted, setLicenseAccepted] = useState(false);
  const [apiKeyDraft, setApiKeyDraft] = useState('');
  const [presentationDraft, setPresentationDraft] = useState<PresentationSettings>(DEFAULT_PRESENTATION_SETTINGS);
  const settingsDirty = useRef(false);
  const roleDirty = useRef(false);
  const settingsTimer = useRef<number | null>(null);
  const presentationTimer = useRef<number | null>(null);
  const stateRef = useRef<PublicAppState | null>(null);
  const settingsRef = useRef<AppSettings | null>(null);
  const roleRef = useRef<RolePackage | null>(null);
  const presentationRef = useRef<PresentationSettings>(presentationDraft);

  const applyState = (next: PublicAppState): void => {
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
    const popstate = (): void => setPage(null);
    window.addEventListener('popstate', popstate);
    window.history.replaceState({ settingsPage: null }, '', '#home');
    return () => {
      delete document.body.dataset.window;
      unsubscribe();
      unsubscribeBounds();
      window.removeEventListener('popstate', popstate);
      if (settingsTimer.current) window.clearTimeout(settingsTimer.current);
      if (presentationTimer.current) window.clearTimeout(presentationTimer.current);
    };
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
  settingsRef.current = settingsDraft;
  roleRef.current = roleDraft;
  const modelViewport = useMemo(() => modelViewportForPath(settings, settings.live2dModelPath), [settings]);

  const persistSettings = async (next: AppSettings, clearApiKey = false): Promise<void> => {
    try {
      const saved = await window.baoyin.settings.save({ settings: next, apiKey: apiKeyDraft.trim() || undefined, clearApiKey, licenseAccepted });
      settingsDirty.current = false;
      settingsRef.current = saved.settings;
      setSettingsDraft(saved.settings);
      applyState(saved);
      setApiKeyDraft('');
      setLicenseAccepted(false);
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
    const next = { ...settings, ...patch };
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

  const openPage = (nextPage: SettingsPageId): void => {
    window.history.pushState({ settingsPage: nextPage }, '', `#${nextPage}`);
    setPage(nextPage);
  };

  const resetPage = (): void => {
    if (page === 'personality' && appState) {
      roleDirty.current = false;
      setRoleDraft(appState.role);
      roleRef.current = appState.role;
      return;
    }
    if (page === 'composition') {
      onViewportChange(DEFAULT_MODEL_VIEWPORT);
      return;
    }
    if (page === 'presentation') {
      onSettingsChange({ cursorTrackingEnabled: true, cursorEyeWeight: 1, cursorHeadWeight: 0.35, cursorBodyWeight: DEFAULT_APP_SETTINGS.cursorBodyWeight, cursorSmoothing: 0.22, cursorMaxStep: 0.08, cursorRangeX: 1, cursorRangeY: 1, cursorIdleMotion: DEFAULT_APP_SETTINGS.cursorIdleMotion });
      onPresentationChange(DEFAULT_PRESENTATION_SETTINGS);
      return;
    }
    if (page === 'window') {
      onSettingsChange({ alwaysOnTop: true, petLocked: false, petInteractionMode: false, petWindowOpacity: 1, petHoverBorderOpacity: 0.8, petHoverShowDelayMs: 80, petHoverFadeMs: 420 });
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
    onSettingsChange({ live2dModelPath: path }, false);
    setLicenseAccepted(false);
    await inspectModel(path);
  };

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

  if (!appState || !roleDraft) return <div className="loading-card">正在唤醒白音配置中心…</div>;

  return <main className="app-shell settings-center-shell">
    <header className="titlebar"><div className="drag-region"><span className="status-dot" /><span>白音 AI 助手 · 配置中心</span></div><div className="window-actions"><button aria-label="显示桌宠" type="button" onClick={() => window.baoyin.app.showPet()}>⌂</button><button aria-label="最小化" type="button" onClick={() => window.baoyin.app.minimize()}>－</button><button aria-label="隐藏设置" type="button" onClick={() => window.baoyin.app.hideSettings()}>×</button></div></header>
    {page ? <SettingsDetails state={appState} page={page} settingsDraft={settings} roleDraft={roleDraft} presentationDraft={presentationDraft} live2dPreview={live2dPreview} debugMetrics={debugMetrics} displays={displays} error={error} modelViewport={modelViewport} onBack={() => window.history.back()} onResetPage={resetPage} onSettingsChange={onSettingsChange} onPresentationChange={onPresentationChange} onRoleChange={onRoleChange} onSaveRole={() => void saveRole()} onActivateRole={(id) => void activateRole(id)} onCreateBlankRole={createBlankRole} onCloneRole={cloneRole} onDeleteRole={() => void deleteRole()} onImportRole={() => void importRole()} onExportRole={() => void exportRole()} onChooseModel={(kind) => void chooseModel(kind)} onInspectModel={() => void inspectModel()} onSaveSettings={() => void persistSettings(settings)} onLicenseChange={setLicenseAccepted} licenseAccepted={licenseAccepted} onViewportChange={onViewportChange} onResetViewport={() => onViewportChange(DEFAULT_MODEL_VIEWPORT)} onCenterViewport={() => onViewportChange({ modelOffsetX: 0, modelOffsetY: 0 })} onFitViewport={() => onViewportChange({ modelOffsetX: 0, modelOffsetY: 0, modelScale: 0.92 })} onSendPresentation={(event) => window.baoyin.presentation.emit(event)} onDebug={(command) => window.baoyin.debug.command(command)} apiKeyDraft={apiKeyDraft} onApiKeyChange={setApiKeyDraft} onSaveService={() => void persistSettings(settings)} onClearApiKey={() => void persistSettings(settings, true)} /> : <SettingsHome state={appState} presentation={presentationDraft} onOpen={openPage} />}
  </main>;
}

export default App;
