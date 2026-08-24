import type { RolePackage } from './role-package';
import type { AppSettings } from './settings';
import type { Live2DModelState } from './live2d';
import type { PresentationEvent } from './presentation';
import type { CubismParameterPatch, CubismRuntimeMetrics } from './cubism';
import type { PresentationSettings } from './presentation-contract';
import type { CompanionSummary } from './companion';
import type { VoiceProfile } from './voice-profile';

export interface PublicAppState {
  settings: AppSettings;
  hasApiKey: boolean;
  role: RolePackage;
  roles: RolePackage[];
  live2d: Live2DModelState;
  companion: CompanionSummary;
  voices: VoiceProfile[];
}

export interface SaveSettingsRequest {
  settings: Partial<AppSettings>;
  apiKey?: string;
  clearApiKey?: boolean;
  /** 新模型入口或模型切换时必须由用户确认已获得资源使用许可。 */
  licenseAccepted?: boolean;
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

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface StartChatRequest {
  message: string;
  history: ChatMessage[];
}

export interface Live2DInspectRequest {
  path: string;
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
