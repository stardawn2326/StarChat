import type { CubismRuntimePriority } from './cubism';

export type CubismRuntimeCommand =
  | { type: 'capabilities' }
  | { type: 'play_expression'; expressionId: string }
  | { type: 'play_motion'; group: string; index: number; priority: CubismRuntimePriority }
  | { type: 'stop_expression' }
  | { type: 'stop_motion' }
  | { type: 'reset' };

export interface CubismRuntimeCommandRequest {
  requestId: string;
  command: CubismRuntimeCommand;
}

export interface CubismRuntimeCommandResult {
  requestId: string;
  result: import('./cubism').CubismRuntimeResult;
}

export function isSafeCubismRuntimeCommand(value: unknown): value is CubismRuntimeCommand {
  if (!value || typeof value !== 'object') return false;
  const command = value as Partial<CubismRuntimeCommand>;
  if (command.type === 'capabilities' || command.type === 'stop_expression' || command.type === 'stop_motion' || command.type === 'reset') {
    return true;
  }
  if (command.type === 'play_expression') {
    return typeof command.expressionId === 'string' && command.expressionId.trim().length > 0 && command.expressionId.length <= 256;
  }
  if (command.type !== 'play_motion') return false;
  const index = command.index;
  return typeof command.group === 'string'
    && command.group.trim().length > 0
    && command.group.length <= 256
    && typeof index === 'number'
    && Number.isInteger(index)
    && index >= 0
    && index <= 10000
    && (command.priority === 'idle' || command.priority === 'normal' || command.priority === 'force');
}
