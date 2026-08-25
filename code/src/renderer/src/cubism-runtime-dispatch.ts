import type { CubismRuntimeController, CubismRuntimeResult, CubismRuntimePhase } from '../../shared/cubism';
import type { CubismRuntimeCommand } from '../../shared/cubism-runtime-command';

export function runtimeCommandPhase(command: CubismRuntimeCommand): CubismRuntimePhase {
  switch (command.type) {
    case 'capabilities': return 'capabilities';
    case 'play_expression': return 'expression';
    case 'play_motion': return 'motion';
    case 'stop_expression': return 'stop_expression';
    case 'stop_motion': return 'stop_motion';
    case 'reset': return 'reset';
  }
}

export async function dispatchCubismRuntimeCommand(
  controller: CubismRuntimeController | null,
  command: CubismRuntimeCommand,
  expectedModelIdentity: string | null
): Promise<CubismRuntimeResult> {
  const actualIdentity = controller?.getRuntimeStatus().modelIdentity ?? null;
  const capabilities = controller?.getCapabilities() ?? { modelIdentity: expectedModelIdentity, expressions: [], motions: [], idleGroup: null };
  const status = controller?.getRuntimeStatus() ?? { modelIdentity: expectedModelIdentity, activeExpression: null, activeMotion: null };
  if (!controller || actualIdentity !== expectedModelIdentity) {
    return {
      ok: false,
      phase: runtimeCommandPhase(command),
      code: 'not_ready',
      message: '桌宠 Cubism runtime 尚未初始化或正在切换模型。',
      status,
      capabilities
    };
  }
  try {
    if (command.type === 'capabilities') {
      return { ok: true, phase: 'capabilities', message: '已刷新当前模型的 Cubism 表情与动作能力。', status: controller.getRuntimeStatus(), capabilities: controller.getCapabilities() };
    }
    if (command.type === 'play_expression') return controller.playExpression(command.expressionId);
    if (command.type === 'play_motion') return controller.playMotion(command.group, command.index, command.priority);
    if (command.type === 'stop_expression') return controller.stopExpression();
    if (command.type === 'stop_motion') return controller.stopMotion();
    return controller.reset();
  } catch (error) {
    return {
      ok: false,
      phase: runtimeCommandPhase(command),
      code: 'runtime_error',
      message: error instanceof Error ? error.message : String(error),
      status: controller.getRuntimeStatus(),
      capabilities: controller.getCapabilities()
    };
  }
}
