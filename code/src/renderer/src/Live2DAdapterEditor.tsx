import type { CubismRuntimeCapabilities, CubismParameterPatch, CubismRuntimeResult } from '../../shared/cubism';
import { LIVE2D_PARAMETER_SEMANTICS, type Live2DAdapterConfig, type Live2DModelState, type Live2DParameterSemantic } from '../../shared/live2d';
import { clearAllOverrides, clearParameterOverride, clearSemanticOverride, setParameterOverride, setSemanticOverride } from '../../shared/live2d-adapter-overrides';
import { evaluateLive2DCompatibility } from '../../shared/live2d-compatibility';
import { buildRuntimeLive2DCapabilityReport, buildStaticLive2DCapabilityReport, type CapabilityEvidenceState, type Live2DCapabilityEvidence } from '../../shared/live2d-capability-report';
import type { CubismRuntimeCommand } from '../../shared/ipc';

const parameterLabels: Record<Live2DParameterSemantic, string> = {
  head_x: '头部 X', head_y: '头部 Y', head_z: '头部 Z', body_x: '身体 X', body_y: '身体 Y', body_z: '身体 Z',
  eye_open_l: '左眼开合', eye_open_r: '右眼开合', gaze_x: '视线 X', gaze_y: '视线 Y', mouth_open: '嘴巴开合', mouth_form: '嘴形', breath: '呼吸', hair_front: '前发', hair_side: '侧发', hair_back: '后发'
};

interface Live2DAdapterEditorProps {
  adapter: Live2DAdapterConfig;
  baselineAdapter?: Live2DAdapterConfig | null;
  model: Pick<Live2DModelState, 'entryPath' | 'parameters' | 'expressions' | 'motions' | 'physics' | 'files'>;
  runtimeCapabilities: CubismRuntimeCapabilities | null;
  runtimeResult: CubismRuntimeResult | null;
  onChange: (adapter: Live2DAdapterConfig) => void;
  onDebug?: (patch: CubismParameterPatch) => void;
  onRuntimeCommand?: (command: CubismRuntimeCommand) => void;
}

function sameFile(left: string, right: string): boolean {
  return left.replaceAll('\\', '/').split('/').at(-1)?.toLocaleLowerCase() === right.replaceAll('\\', '/').split('/').at(-1)?.toLocaleLowerCase();
}

export const capabilityStateLabel = (state: CapabilityEvidenceState): string => ({ detected: '已检测', verified: '已验证', failed: '失败', not_tested: '未测试' })[state];

function CapabilityEvidenceList({ title, evidence }: { title: string; evidence: Live2DCapabilityEvidence[] }): JSX.Element {
  return <div className="capability-evidence-group"><div className="capability-evidence-title">{title}</div><div className="capability-evidence-grid">{evidence.map((item) => <div className={`capability-evidence capability-${item.state}`} key={item.id} role={item.state === 'failed' ? 'alert' : undefined}><span><strong>{item.label}</strong><small>{item.detail}</small></span><em>{capabilityStateLabel(item.state)}</em></div>)}</div></div>;
}

export function Live2DAdapterEditor({ adapter, baselineAdapter, model, runtimeCapabilities, runtimeResult, onChange, onDebug, onRuntimeCommand }: Live2DAdapterEditorProps): JSX.Element {
  const automaticAdapter = baselineAdapter ?? adapter;
  const updateSemantic = (name: string, sourceFile: string): void => {
    onChange(sourceFile ? setSemanticOverride(adapter, automaticAdapter, name, sourceFile) : clearSemanticOverride(adapter, automaticAdapter, name));
  };

  const updateParameter = (semantic: Live2DParameterSemantic, targetId: string): void => {
    onChange(targetId ? setParameterOverride(adapter, automaticAdapter, semantic, targetId) : clearParameterOverride(adapter, automaticAdapter, semantic));
  };

  const expressionFiles = model.expressions.map((asset) => asset.fileName);
  const motionFiles = model.motions.map((asset) => asset.fileName);
  const parameters = Object.entries(adapter.parameterBindings) as [Live2DParameterSemantic, Live2DAdapterConfig['parameterBindings'][Live2DParameterSemantic]][];
  const availableParameters = parameters.filter(([, binding]) => binding.available).length;
  const compatibility = evaluateLive2DCompatibility({ ...model, entryPath: adapter.sourceEntryPath, adapter });
  const staticReport = buildStaticLive2DCapabilityReport({ ...model, entryPath: model.entryPath ?? adapter.sourceEntryPath });
  const runtimeReport = buildRuntimeLive2DCapabilityReport(staticReport, runtimeCapabilities, runtimeResult, adapter.sourceEntryPath);
  const testRoute = (routeName: string): void => {
    const route = adapter.semanticMappings[routeName];
    if (!route?.sourceFile || !runtimeCapabilities || !onRuntimeCommand) return;
    const expression = runtimeCapabilities.expressions.find((item) => sameFile(item.fileName, route.sourceFile!));
    if (expression) onRuntimeCommand({ type: 'play_expression', expressionId: expression.id });
    const motion = runtimeCapabilities.motions.find((item) => sameFile(item.fileName, route.sourceFile!));
    if (motion) onRuntimeCommand({ type: 'play_motion', group: motion.group, index: motion.index, priority: motion.group === runtimeCapabilities.idleGroup ? 'idle' : 'normal' });
  };

  return <div className="live2d-adapter-editor" data-live2d-adapter-editor>
    <div className="section-heading"><div><span className="section-kicker">ADAPTER EDITOR</span><h3>能力与手动覆盖</h3></div><span className="section-status">参数 {availableParameters}/{parameters.length}<button type="button" className="secondary-button" onClick={() => onChange(clearAllOverrides(automaticAdapter))} disabled={!adapter.overrides}>恢复全部自动</button></span></div>
    <p className="detail-note">自动检测结果保留在当前模型适配器中；手动覆盖写入用户数据，并只对当前模型入口生效。</p>
    <div className="settings-capability-row"><span><strong>Capability Report</strong><small>静态资源与 runtime 验证分开记录；不会把“文件存在”误报为“运行成功”。</small></span><em>{availableParameters > 0 ? '参数可用' : '需映射'}</em></div>
    <CapabilityEvidenceList title="静态检测" evidence={staticReport.evidence} />
    <CapabilityEvidenceList title="Runtime 验证" evidence={runtimeReport.evidence.filter((item) => item.id.startsWith('runtime-'))} />
    <div className="tag-list">{compatibility.cases.map((item) => <span key={item.id} title={item.detail}>{item.supported ? '通过' : '提醒'} · {item.label}</span>)}</div>
    <div className="live2d-adapter-grid">
      {Object.entries(adapter.semanticMappings).filter(([, route]) => route.category === 'expression' || route.category === 'action').slice(0, 16).map(([name, route]) => {
        const files = route.category === 'action' ? motionFiles : expressionFiles;
        return <label className="text-field" key={name}><span>{name}<small>{route.category === 'action' ? '动作' : '表情'} · {route.supported ? '已映射' : '未映射'}</small></span><select value={route.sourceFile ?? ''} onChange={(event) => updateSemantic(name, event.target.value)}><option value="">恢复自动检测</option>{files.map((file) => <option value={file} key={file}>{file}</option>)}</select><button type="button" className="secondary-button" disabled={!route.sourceFile} onClick={() => testRoute(name)}>测试</button></label>;
      })}
    </div>
    <div className="live2d-parameter-grid">
      {parameters.map(([semantic, binding]) => <label className="text-field" key={semantic}><span>{parameterLabels[semantic]}<small>{binding.targetId}</small></span><select value={adapter.overrides?.parameterBindings?.[semantic] ?? ''} onChange={(event) => updateParameter(semantic, event.target.value)}><option value="">恢复自动检测</option><option value={binding.targetId}>{binding.targetId}</option>{model.parameters.filter((parameter) => parameter.id !== binding.targetId).map((parameter) => <option value={parameter.id} key={`${semantic}-${parameter.id}`}>{parameter.name} · {parameter.id}</option>)}</select>{onDebug ? <input type="range" min={binding.recommendedRange.min} max={binding.recommendedRange.max} step="0.01" defaultValue={binding.recommendedRange.default} aria-label={`${parameterLabels[semantic]}预览`} onChange={(event) => onDebug({ id: binding.targetId, value: Number(event.target.value) })} /> : null}</label>)}
    </div>
  </div>;
}
