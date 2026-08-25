import type { RolePackage } from './role-package';
import type { AppSettings } from './settings';
import type { Live2DModelRecord, Live2DModelState } from './live2d';
import type { PresentationEvent } from './presentation';
import type { CubismParameterPatch, CubismRuntimeMetrics } from './cubism';
import type { PresentationSettings } from './presentation-contract';
import type { CompanionSummary } from './companion';
import type { VoiceProfile } from './voice-profile';
import type { AgentEvent, AgentMode, AgentStartResponse, AgentTask } from './agent';

export interface PublicAppState {
  settings: AppSettings;
  hasApiKey: boolean;
  role: RolePackage;
  roles: RolePackage[];
  live2d: Live2DModelState;
  live2dModels: Live2DModelRecord[];
  companion: CompanionSummary;
  voices: VoiceProfile[];
}

export interface SaveSettingsRequest {
  settings: Partial<AppSettings>;
  apiKey?: string;
  clearApiKey?: boolean;
}

export interface ConnectionTestRequest {
  apiBaseUrl: string;
  model: string;
  apiKey?: string;
}

export interface ConnectionTestResult {
  ok: boolean;
  message: string;
}

export interface TtsSynthesizeRequest {
  text: string;
}

export type SettingsPreviewDetail =
  | { domain: 'window'; patch: Partial<Pick<AppSettings, 'petBounds' | 'petWindowOpacity' | 'petHoverBorderOpacity' | 'petHoverShowDelayMs' | 'petHoverFadeMs'>> }
  | { domain: 'settings'; patch: Partial<AppSettings> }
  | { domain: 'presentation'; patch: Partial<PresentationSettings> };

export interface RoleSaveRequest {
  role: RolePackage;
}

export interface RoleIdRequest {
  id: string;
}

export type CubismDebugCommand =
  | { type: 'parameter'; patch: CubismParameterPatch }
  | { type: 'reset' }
  | { type: 'fit-frame' }
  | { type: 'control'; name: 'neutral' | 'stop_expression' | 'stop_action' };

export interface CubismDebugMetricRequest {
  metrics: CubismRuntimeMetrics;
}

export type { CubismRuntimeCommand, CubismRuntimeCommandRequest, CubismRuntimeCommandResult } from './cubism-runtime-command';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface StartChatRequest {
  message: string;
  history: ChatMessage[];
  mode?: AgentMode;
}

export interface AgentApproveRequest {
  taskId: string;
  requestId: string;
  approved: boolean;
}

export interface AgentRespondRequest {
  taskId: string;
  requestId: string;
  value: string;
}

export type { AgentEvent, AgentMode, AgentStartResponse, AgentTask };

export interface Live2DInspectRequest {
  path: string;
}

export interface Live2DModelIdRequest {
  id: string;
}

export interface Live2DModelImportResult {
  record: Live2DModelRecord;
  state: Live2DModelState;
  models: Live2DModelRecord[];
}

export interface Live2DRuntimeFailure {
  entryPath: string | null;
  stage: 'load' | 'initialize' | 'render';
  message: string;
}

export interface DisplaySummary {
  id: number;
  label: string;
  bounds: { x: number; y: number; width: number; height: number };
  workArea: { x: number; y: number; width: number; height: number };
}

export type PetInputMode = 'interactive' | 'passthrough';

export interface PetDragPoint {
  screenX: number;
  screenY: number;
}
export interface PetResizeStart extends PetDragPoint {
  edge: import('./window-contract').PetResizeEdge;
}

export interface CursorUpdate {
  screenX: number;
  screenY: number;
  localX: number;
  localY: number;
  windowWidth: number;
  windowHeight: number;
  insideWindow: boolean;
  moving: boolean;
  timestamp: number;
}

export type PresentationBridgeEvent = PresentationEvent;

export type ChatEvent =
  | { type: 'delta'; requestId: string; delta: string }
  | { type: 'complete'; requestId: string; response: string; companion: CompanionSummary }
  | { type: 'error'; requestId: string; message: string };
