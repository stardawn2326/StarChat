import type { CubismRuntimeCapabilities, CubismRuntimeResult } from './cubism';
import type { Live2DModelState } from './live2d';

export type CapabilityEvidenceState = 'detected' | 'verified' | 'failed' | 'not_tested';

export interface Live2DCapabilityEvidence {
  id: string;
  label: string;
  state: CapabilityEvidenceState;
  detail: string;
}

export interface Live2DCapabilityReport {
  evidence: Live2DCapabilityEvidence[];
}

function evidence(id: string, label: string, state: CapabilityEvidenceState, detail: string): Live2DCapabilityEvidence {
  return { id, label, state, detail };
}

function hasReadableFile(model: Pick<Live2DModelState, 'files'>, kind: Live2DModelState['files'][number]['kind']): boolean {
  return model.files.some((file) => file.kind === kind && file.exists && file.readable);
}

export function buildStaticLive2DCapabilityReport(model: Pick<Live2DModelState, 'entryPath' | 'files' | 'expressions' | 'motions' | 'parameters' | 'physics'>): Live2DCapabilityReport {
  return {
    evidence: [
      evidence('cubism-model', 'Cubism 模型', model.entryPath ? 'detected' : 'not_tested', model.entryPath ? '已发现 .model3.json 入口。' : '尚未选择模型入口。'),
      evidence('textures', '纹理', hasReadableFile(model, 'texture') ? 'detected' : 'not_tested', hasReadableFile(model, 'texture') ? '已发现可读取纹理文件。' : '未发现可读取纹理文件。'),
      evidence('physics', 'Physics', model.physics ? 'detected' : 'not_tested', model.physics ? '已解析物理设置。' : '模型未提供或尚未解析 Physics。'),
      evidence('cdi', 'CDI / 参数描述', hasReadableFile(model, 'display_info') ? 'detected' : model.parameters.length > 0 ? 'detected' : 'not_tested', hasReadableFile(model, 'display_info') ? '已发现 display info。' : model.parameters.length > 0 ? '已从模型入口发现参数，未单独提供 CDI。' : '未发现 CDI 或参数描述。'),
      evidence('expressions', 'Expressions', model.expressions.length > 0 ? 'detected' : 'not_tested', model.expressions.length > 0 ? `静态发现 ${model.expressions.length} 个表情文件。` : '未发现表情文件。'),
      evidence('motions', 'Motions', model.motions.length > 0 ? 'detected' : 'not_tested', model.motions.length > 0 ? `静态发现 ${model.motions.length} 个动作文件。` : '未发现动作文件。'),
      evidence('parameters', 'Parameters', model.parameters.length > 0 ? 'detected' : 'not_tested', model.parameters.length > 0 ? `静态发现 ${model.parameters.length} 个参数。` : '未发现参数。')
    ]
  };
}

export function buildRuntimeLive2DCapabilityReport(
  staticReport: Live2DCapabilityReport,
  capabilities: CubismRuntimeCapabilities | null,
  result: CubismRuntimeResult | null,
  expectedModelIdentity: string | null
): Live2DCapabilityReport {
  const modelMismatch = Boolean(expectedModelIdentity && capabilities && capabilities.modelIdentity !== expectedModelIdentity);
  const runtimeReady = Boolean(capabilities && !modelMismatch);
  const expressionFailure = result?.ok === false && result.phase === 'expression';
  const motionFailure = result?.ok === false && result.phase === 'motion';
  const parametersVerified = Boolean(runtimeReady && capabilities?.manifest?.parameters);
  const expressionCount = capabilities?.expressions.length ?? 0;
  const motionCount = capabilities?.motions.length ?? 0;
  const runtimeEvidence = [
    evidence('runtime-expressions', 'Runtime Expressions', expressionFailure ? 'failed' : runtimeReady && expressionCount > 0 ? 'verified' : 'not_tested', expressionFailure ? result.message : runtimeReady ? `已通过 runtime 枚举 ${expressionCount} 个表情。` : modelMismatch ? '当前 runtime 与所选模型不一致。' : '尚未执行表情 runtime 验证。'),
    evidence('runtime-motions', 'Runtime Motions', motionFailure ? 'failed' : runtimeReady && motionCount > 0 ? 'verified' : 'not_tested', motionFailure ? result.message : runtimeReady ? `已通过 runtime 枚举 ${motionCount} 个动作。` : modelMismatch ? '当前 runtime 与所选模型不一致。' : '尚未执行动作 runtime 验证。'),
    evidence('runtime-parameters', 'Runtime Parameters', parametersVerified ? 'verified' : 'not_tested', parametersVerified ? '已取得 runtime 参数能力清单。' : '尚未取得 runtime 参数能力清单。'),
    evidence('runtime-lipsync', 'Runtime Lip-sync', 'not_tested', '需要麦克风输入和实际语音链路验证。')
  ];
  return { evidence: [...staticReport.evidence, ...runtimeEvidence] };
}
