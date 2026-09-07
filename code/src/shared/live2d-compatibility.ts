import type { Live2DModelState } from './live2d';

export interface Live2DCompatibilityCase {
  id: 'standard-parameters' | 'nonstandard-expressions' | 'limited-motions' | 'missing-cdi' | 'missing-physics' | 'zip-import';
  label: string;
  supported: boolean;
  detail: string;
}

export interface Live2DCompatibilityReport {
  supported: boolean;
  cases: Live2DCompatibilityCase[];
}

export function evaluateLive2DCompatibility(state: Pick<Live2DModelState, 'entryPath' | 'parameters' | 'expressions' | 'motions' | 'physics' | 'adapter'>, sourceKind: 'folder' | 'file' | 'zip' = 'folder'): Live2DCompatibilityReport {
  const standardParameterCount = ['ParamAngleX', 'ParamAngleY', 'ParamEyeBallX', 'ParamMouthOpenY'].filter((id) => state.parameters.some((parameter) => parameter.id === id)).length;
  const hasNonstandardExpression = state.expressions.some((asset) => !/(?:happy|smile|angry|sad|surprised|neutral|exp)/iu.test(asset.fileName));
  const cases: Live2DCompatibilityCase[] = [
    { id: 'standard-parameters', label: '标准参数模型', supported: standardParameterCount >= 2, detail: `${standardParameterCount}/4 个常用参数可直接识别` },
    { id: 'nonstandard-expressions', label: '非标准 Expression 名', supported: state.expressions.length > 0, detail: state.expressions.length > 0 ? '可通过适配器手动覆盖' : '没有可用表情资源' },
    { id: 'limited-motions', label: '少量 Motion Group', supported: state.motions.length > 0, detail: state.motions.length > 0 ? `${state.motions.length} 个动作资源` : '将使用安全回退动作' },
    { id: 'missing-cdi', label: '无 CDI', supported: Boolean(state.adapter), detail: state.adapter ? '使用参数别名和运行时能力清单' : '等待模型适配器' },
    { id: 'missing-physics', label: '无 Physics', supported: true, detail: state.physics ? '已检测 Physics3' : '物理表现会自动禁用，不影响基础渲染' },
    { id: 'zip-import', label: 'ZIP Import', supported: sourceKind === 'zip' || Boolean(state.entryPath), detail: sourceKind === 'zip' ? '已通过安全 ZIP 解压限制' : '目录/入口文件可直接加载' }
  ];
  return { supported: state.entryPath !== null && cases.every((item) => item.id === 'missing-physics' || item.supported), cases };
}
