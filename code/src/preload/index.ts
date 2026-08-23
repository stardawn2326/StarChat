import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type {
  ChatEvent,
  CubismDebugCommand,
  CubismDebugMetricRequest,
  CursorUpdate,
  DisplaySummary,
  PublicAppState,
  PetDragPoint,
  PetInputMode,
  PresentationBridgeEvent,
  RoleIdRequest,
  RoleSaveRequest,
  SaveSettingsRequest,
  SettingsPreviewDetail,
  StartChatRequest
} from '../shared/ipc';
import type { Live2DModelState } from '../shared/live2d';
import type { PresentationEvent } from '../shared/presentation';
import type { WindowBounds } from '../shared/window-contract';

const bridge = {
  app: {
    minimize: (): void => ipcRenderer.send('window:minimize'),
    close: (): void => ipcRenderer.send('window:close'),
    showSettings: (): void => ipcRenderer.send('settings:show'),
    hideSettings: (): void => ipcRenderer.send('settings:hide'),
    toggleSettings: (): void => ipcRenderer.send('settings:toggle'),
    showContextMenu: (): void => ipcRenderer.send('pet:context-menu'),
    showPet: (): void => ipcRenderer.send('pet:show'),
    toggleModelEdit: (): void => ipcRenderer.send('pet:toggle-model-edit'),
    onModelEditMode: (callback: (enabled: boolean) => void): (() => void) => {
      const listener = (_event: IpcRendererEvent, enabled: boolean): void => callback(enabled === true);
      ipcRenderer.on('pet:model-edit-mode', listener);
      return () => ipcRenderer.removeListener('pet:model-edit-mode', listener);
    },
    setInputMode: (mode: PetInputMode): void => ipcRenderer.send('pet:set-input-mode', mode),
    visibility: (): Promise<{ role: 'pet' | 'settings'; petVisible: boolean; settingsVisible: boolean }> =>
      ipcRenderer.invoke('window:visibility')
  },
  state: {
    get: (): Promise<PublicAppState> => ipcRenderer.invoke('state:get'),
    onChange: (callback: (state: PublicAppState) => void): (() => void) => {
      const listener = (_event: IpcRendererEvent, payload: PublicAppState): void => callback(payload);
      ipcRenderer.on('state:changed', listener);
      return () => ipcRenderer.removeListener('state:changed', listener);
    }
  },
  settings: {
    save: (request: SaveSettingsRequest): Promise<PublicAppState> => {
      const bounds = request?.settings?.petBounds;
      if (bounds) {
        // Settings UI persistence is debounced in the renderer. Preview the
        // four window sliders immediately through the bounded main-process
        // channel; this does not write settings storage.
        ipcRenderer.send('pet:preview-bounds', bounds);
      }
      return ipcRenderer.invoke('settings:save', request);
    },
    preview: (detail: SettingsPreviewDetail): void => ipcRenderer.send('baoyin:settings-preview', detail),
    onPreview: (callback: (detail: SettingsPreviewDetail) => void): (() => void) => {
      const listener = (_event: IpcRendererEvent, detail: SettingsPreviewDetail): void => callback(detail);
      ipcRenderer.on('baoyin:settings-preview', listener);
      return () => ipcRenderer.removeListener('baoyin:settings-preview', listener);
    }
  },
  roles: {
    save: (request: RoleSaveRequest): Promise<PublicAppState> => ipcRenderer.invoke('roles:save', request),
    activate: (request: RoleIdRequest): Promise<PublicAppState> => ipcRenderer.invoke('roles:activate', request),
    delete: (request: RoleIdRequest): Promise<PublicAppState> => ipcRenderer.invoke('roles:delete', request),
    import: (): Promise<PublicAppState> => ipcRenderer.invoke('roles:import'),
    export: (request: RoleIdRequest): Promise<string | null> => ipcRenderer.invoke('roles:export', request)
  },
  debug: {
    command: (command: CubismDebugCommand): void => ipcRenderer.send('cubism:debug-command', command),
    onCommand: (callback: (command: CubismDebugCommand) => void): (() => void) => {
      const listener = (_event: IpcRendererEvent, command: CubismDebugCommand): void => callback(command);
      ipcRenderer.on('cubism:debug-command', listener);
      return () => ipcRenderer.removeListener('cubism:debug-command', listener);
    },
    reportMetrics: (request: CubismDebugMetricRequest): void => ipcRenderer.send('cubism:metrics', request),
    metrics: (): Promise<import('../shared/cubism').CubismRuntimeMetrics | null> => ipcRenderer.invoke('cubism:metrics')
  },
  live2d: {
    inspect: (path: string): Promise<Live2DModelState> =>
      ipcRenderer.invoke('live2d:inspect', { path }),
    chooseFile: (): Promise<string | null> => ipcRenderer.invoke('live2d:choose-file'),
    chooseDirectory: (): Promise<string | null> => ipcRenderer.invoke('live2d:choose-directory')
  },
  display: {
    list: (): Promise<DisplaySummary[]> => ipcRenderer.invoke('display:list')
  },
  cursor: {
    onUpdate: (callback: (update: CursorUpdate) => void): (() => void) => {
      const listener = (_event: IpcRendererEvent, payload: CursorUpdate): void => callback(payload);
      ipcRenderer.on('cursor:update', listener);
      return () => ipcRenderer.removeListener('cursor:update', listener);
    }
  },
  presentation: {
    emit: (event: PresentationEvent): void => ipcRenderer.send('presentation:emit', event),
    onEvent: (callback: (event: PresentationBridgeEvent) => void): (() => void) => {
      const listener = (_event: IpcRendererEvent, payload: PresentationBridgeEvent): void => callback(payload);
      ipcRenderer.on('presentation:event', listener);
      return () => ipcRenderer.removeListener('presentation:event', listener);
    }
  },
  tts: {
    synthesize: (text: string): Promise<string> => ipcRenderer.invoke('tts:synthesize', { text }),
    importVoice: (request: { name: string; promptText: string }): Promise<PublicAppState> => ipcRenderer.invoke('voices:import', request),
    activateVoice: (id: string | null): Promise<PublicAppState> => ipcRenderer.invoke('voices:activate', { id }),
    deleteVoice: (id: string): Promise<PublicAppState> => ipcRenderer.invoke('voices:delete', { id }),
    previewVoice: (id: string, text: string): Promise<string> => ipcRenderer.invoke('voices:preview', { id, text })
  },
  pet: {
    show: (): void => ipcRenderer.send('pet:show'),
    center: (): void => ipcRenderer.send('pet:center'),
    bounds: (): Promise<WindowBounds | null> => ipcRenderer.invoke('pet:bounds'),
    previewBounds: (bounds: WindowBounds): void => ipcRenderer.send('pet:preview-bounds', bounds),
    onBoundsChange: (callback: (bounds: WindowBounds) => void): (() => void) => {
      const listener = (_event: IpcRendererEvent, bounds: WindowBounds): void => callback(bounds);
      ipcRenderer.on('pet:bounds-changed', listener);
      return () => ipcRenderer.removeListener('pet:bounds-changed', listener);
    },
    dragStart: (point: PetDragPoint): void => ipcRenderer.send('pet:drag-start', point),
    dragMove: (point: PetDragPoint): void => ipcRenderer.send('pet:drag-move', point),
    dragEnd: (): void => ipcRenderer.send('pet:drag-end')
  },
  chat: {
    start: (request: StartChatRequest): Promise<string> => ipcRenderer.invoke('chat:start', request),
    cancel: (requestId: string): Promise<void> => ipcRenderer.invoke('chat:cancel', requestId),
    onEvent: (callback: (event: ChatEvent) => void): (() => void) => {
      const listener = (_event: IpcRendererEvent, payload: ChatEvent): void => callback(payload);
      ipcRenderer.on('chat:event', listener);
      return () => ipcRenderer.removeListener('chat:event', listener);
    }
  }
};

function previewBoundsFromWindowSlider(target: EventTarget | null): void {
  if (!(target instanceof HTMLInputElement) || target.type !== 'range' || document.body.dataset.window !== 'settings') {
    return;
  }
  const section = target.closest('.detail-section');
  const heading = section?.querySelector('h2')?.textContent?.trim();
  if (!section || heading !== '窗口尺寸与位置') {
    return;
  }
  const ranges = Array.from(section.querySelectorAll<HTMLInputElement>('input[type="range"]'));
  if (ranges.length < 4) {
    return;
  }
  const values = ranges.slice(0, 4).map((input) => Number(input.value));
  if (!values.every(Number.isFinite)) {
    return;
  }
  ipcRenderer.send('pet:preview-bounds', {
    width: values[0],
    height: values[1],
    x: values[2],
    y: values[3]
  });
}

window.addEventListener('input', (event) => previewBoundsFromWindowSlider(event.target), true);

contextBridge.exposeInMainWorld('baoyin', bridge);

export type BaoyinBridge = typeof bridge;
