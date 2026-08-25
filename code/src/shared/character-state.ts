import type { ActionName, ExpressionName } from './role-package';
import type { PresentationEvent, PresentationLayer } from './presentation';

export interface CharacterStateSnapshot {
  activeExpression: ExpressionName;
  activeAction: ActionName | null;
  expressionLayer: PresentationLayer;
  actionLayer: PresentationLayer | null;
}

const expressionPriority: Record<PresentationLayer, number> = {
  manual: 70,
  safety: 65,
  special_action: 60,
  dialogue_emotion: 50,
  reply_state: 40,
  cursor_gaze: 30,
  idle_action: 20,
  breathing_blink: 10
};

const actionPriority: Record<PresentationLayer, number> = {
  manual: 70,
  safety: 65,
  special_action: 60,
  dialogue_emotion: 50,
  reply_state: 40,
  cursor_gaze: 30,
  idle_action: 20,
  breathing_blink: 10
};

function defaultLayer(event: PresentationEvent): PresentationLayer {
  if (event.type === 'speech' || event.type === 'dialogue') return 'reply_state';
  if (event.layer) return event.layer;
  if (event.type === 'action') return 'special_action';
  return event.source === 'assistant' ? 'dialogue_emotion' : 'reply_state';
}

export class CharacterStateResolver {
  private readonly expressions = new Map<PresentationLayer, ExpressionName>();
  private readonly actions = new Map<PresentationLayer, ActionName>();

  constructor() {
    this.expressions.set('reply_state', 'neutral');
  }

  apply(event: PresentationEvent): void {
    if (event.type === 'speech' || event.type === 'dialogue') return;
    const layer = defaultLayer(event);
    if (event.type === 'control') {
      if (event.name === 'neutral') {
        this.expressions.clear();
        this.expressions.set('reply_state', 'neutral');
        this.actions.clear();
      } else if (event.name === 'stop_action') {
        this.actions.delete(layer);
      } else if (event.name === 'stop_expression') {
        this.expressions.delete(layer);
      }
      return;
    }
    if (event.type === 'expression') this.expressions.set(layer, event.name);
    else this.actions.set(layer, event.name);
  }

  finishAction(): void {
    const active = [...this.actions.entries()]
      .sort((a, b) => actionPriority[b[0]] - actionPriority[a[0]])[0];
    if (active) this.actions.delete(active[0]);
  }

  snapshot(): CharacterStateSnapshot {
    const expression = [...this.expressions.entries()]
      .sort((a, b) => expressionPriority[b[0]] - expressionPriority[a[0]])[0];
    const action = [...this.actions.entries()]
      .sort((a, b) => actionPriority[b[0]] - actionPriority[a[0]])[0];
    return {
      activeExpression: expression?.[1] ?? 'neutral',
      expressionLayer: expression?.[0] ?? 'reply_state',
      activeAction: action?.[1] ?? null,
      actionLayer: action?.[0] ?? null
    };
  }
}
