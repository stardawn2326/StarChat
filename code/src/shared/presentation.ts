import type { ActionName, ExpressionName } from './role-package';

export type PresentationLayer =
  | 'manual'
  | 'safety'
  | 'special_action'
  | 'dialogue_emotion'
  | 'reply_state'
  | 'cursor_gaze'
  | 'idle_action'
  | 'breathing_blink';

export type PresentationControlName = 'stop_action' | 'stop_expression' | 'neutral';
export type DialoguePhase = 'start' | 'listening' | 'replying' | 'end';

export type PresentationEvent =
  | { type: 'expression'; name: ExpressionName; source: 'system' | 'assistant'; layer?: PresentationLayer }
  | { type: 'action'; name: ActionName; source: 'system' | 'assistant'; layer?: PresentationLayer }
  | {
      type: 'speech';
      speaking: boolean;
      source: 'assistant';
      mouthOpen?: number;
      mouthForm?: number;
      timestamp?: number;
    }
  | { type: 'dialogue'; phase: DialoguePhase; source: 'system'; timestamp?: number }
  | { type: 'control'; name: PresentationControlName; source: 'system'; layer: 'manual' | 'safety' };

export class PresentationBus {
  private readonly listeners = new Set<(event: PresentationEvent) => void>();

  subscribe(listener: (event: PresentationEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(event: PresentationEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}

export const presentationBus = new PresentationBus();
