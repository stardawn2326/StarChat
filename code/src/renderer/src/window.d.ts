import type {
  ChatEvent,
  ConnectionTestRequest,
  ConnectionTestResult,
  CubismDebugCommand,
  CubismRuntimeMetrics,
  CubismRuntimeCommand,
  CubismRuntimeCommandRequest,
  CursorUpdate,
  DisplaySummary,
  PetDragPoint,
  PetResizeStart,
  PetInputMode,
  PresentationBridgeEvent,
  PublicAppState,
  RoleIdRequest,
  RoleSaveRequest,
  SaveSettingsRequest,
  SettingsPreviewDetail,
  StartChatRequest
} from '../../shared/ipc';
import type { Live2DModelState } from '../../shared/live2d';
import type { PresentationEvent } from '../../shared/presentation';

declare global {
  interface Window {
    baoyin: {
      app: {
        minimize(): void;
        close(): void;
        showSettings(): void;
        hideSettings(): void;
        toggleSettings(): void;
        showContextMenu(): void;
        runtimeReady(request?: { entryPath?: string | null }): void;
        runtimeCommandReady(): void;
        runtimeFailed(request: import('../../shared/ipc').Live2DRuntimeFailure): void;
        showPet(): void;
        togglePet(): void;
        toggleModelEdit(): void;
        onWindowFocusState(callback: (active: boolean) => void): () => void;
        onModelEditMode(callback: (enabled: boolean) => void): () => void;
        setInputMode(mode: PetInputMode): void;
        visibility(): Promise<{ role: 'pet' | 'settings'; petVisible: boolean; settingsVisible: boolean }>;
      };
      state: {
        get(): Promise<PublicAppState>;
        onChange(callback: (state: PublicAppState) => void): () => void;
      };
      settings: {
        save(request: SaveSettingsRequest): Promise<PublicAppState>;
        preview(detail: SettingsPreviewDetail): void;
        onPreview(callback: (detail: SettingsPreviewDetail) => void): () => void;
      };
      api: {
        testConnection(request: ConnectionTestRequest): Promise<ConnectionTestResult>;
      };
      roles: {
        save(request: RoleSaveRequest): Promise<PublicAppState>;
        activate(request: RoleIdRequest): Promise<PublicAppState>;
        delete(request: RoleIdRequest): Promise<PublicAppState>;
        import(): Promise<PublicAppState>;
        export(request: RoleIdRequest): Promise<string | null>;
      };
      debug: {
        command(command: CubismDebugCommand): void;
        onCommand(callback: (command: CubismDebugCommand) => void): () => void;
        runtimeCommand(command: CubismRuntimeCommand): Promise<import('../../shared/cubism').CubismRuntimeResult>;
        onRuntimeCommand(callback: (request: CubismRuntimeCommandRequest) => void): () => void;
        runtimeResult(requestId: string, result: import('../../shared/cubism').CubismRuntimeResult): void;
        onRuntimeReady(callback: (modelIdentity: string | null) => void): () => void;
        reportMetrics(request: { metrics: CubismRuntimeMetrics }): void;
        metrics(): Promise<CubismRuntimeMetrics | null>;
      };
      live2d: {
        inspect(path: string): Promise<Live2DModelState>;
        import(path: string): Promise<import('../../shared/ipc').Live2DModelImportResult>;
        remove(request: import('../../shared/ipc').Live2DModelIdRequest): Promise<PublicAppState>;
        chooseFile(): Promise<string | null>;
        chooseDirectory(): Promise<string | null>;
      };
      display: {
        list(): Promise<DisplaySummary[]>;
      };
      cursor: {
        onUpdate(callback: (update: CursorUpdate) => void): () => void;
      };
      presentation: {
        emit(event: PresentationEvent): void;
        onEvent(callback: (event: PresentationBridgeEvent) => void): () => void;
      };
      tts: {
        synthesize(text: string): Promise<string>;
        importVoice(request: { name: string; promptText: string }): Promise<PublicAppState>;
        activateVoice(id: string | null): Promise<PublicAppState>;
        deleteVoice(id: string): Promise<PublicAppState>;
        previewVoice(id: string, text: string): Promise<string>;
      };
      pet: {
        show(): void;
        center(): void;
        bounds(): Promise<{ x: number; y: number; width: number; height: number } | null>;
        onBoundsChange(callback: (bounds: { x: number; y: number; width: number; height: number }) => void): () => void;
        dragStart(point: PetDragPoint): void;
        dragMove(point: PetDragPoint): void;
        dragEnd(): void;
        pointerCancel(): void;
        resizeStart(request: PetResizeStart): void;
        resizeMove(point: PetDragPoint): void;
        resizeEnd(): void;
      };
      chat: {
        start(request: StartChatRequest): Promise<string>;
        cancel(requestId: string): Promise<void>;
        onEvent(callback: (event: ChatEvent) => void): () => void;
      };
    };
  }
}

export {};
