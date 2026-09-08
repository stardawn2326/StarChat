import { useState } from 'react';
import type { CubismRuntimeCommand, DisplaySummary, CubismDebugCommand, PublicAppState } from '../../shared/ipc';
import type { CubismRuntimeCapabilities, CubismRuntimeMetrics, CubismRuntimeResult } from '../../shared/cubism';
import type { Live2DAdapterConfig, Live2DModelState } from '../../shared/live2d';
import type { PresentationEvent } from '../../shared/presentation';
import type { AgentEvent, AgentTask } from '../../shared/agent';
import type { SessionMessage } from '../../shared/session';
import { SEMANTIC_ACTIONS, SEMANTIC_EXPRESSIONS, ROLE_SCALE_KEYS, type RolePackage, type RoleScaleKey } from '../../shared/role-package';
import { isBuiltinRoleId } from '../../shared/default-role';
import { DEFAULT_APP_SETTINGS, type AppSettings, type ModelViewportSettings } from '../../shared/settings';
import { THEME_PREFERENCES, sanitizeThemePreference, type ThemePreference } from '../../shared/theme';
import { PRESENTATION_SLIDERS, type PresentationSettings } from '../../shared/presentation-contract';
import { SETTINGS_CARDS, type SettingsPageId } from './settings-schema';
import { CompanionChat } from './CompanionChat';
import { GlassSelect } from './GlassSelect';
import { classifyRuntimeAsset, type RuntimeAssetState } from './cubism-runtime-capability-state';
import { Live2DAdapterEditor } from './Live2DAdapterEditor';

const live2dStatusLabels: Record<Live2DModelState['status'], string> = {
  not_configured: '未配置', ready: '检查通过', ready_with_warnings: '通过，但有提醒', missing: '缺少文件', invalid: '入口无效', unreadable: '文件不可读'
};

const scaleLabels: Record<RoleScaleKey, string> = {
  tsundere: '傲娇', warmth: '温柔', patience: '耐心', initiative: '主动', teasing: '吐槽', assertiveness: '反驳', curiosity: '好奇', expressiveness: '情绪外露', intimacy: '亲密表达', replyLength: '回复长度', humor: '幽默', ditziness: '呆萌', relationshipGrowth: '关系成长速度', proactiveFrequency: '主动发话频率'
};

const themeLabels: Record<ThemePreference, string> = {
  system: '跟随 Windows 系统',
  light: '浅色晨星',
  dark: '深色星夜'
};

export function formatSemanticMappings(mappings: RolePackage['presentation']['semanticMappings']): string {
  return Object.entries(mappings).map(([intent, mapping]) => `${intent}=${mapping.expression ?? ''}/${mapping.action ?? ''}`).join('\n');
}

export function parseSemanticMappings(value: string): RolePackage['presentation']['semanticMappings'] {
  const mappings: RolePackage['presentation']['semanticMappings'] = {};
  for (const line of value.split('\n').map((item) => item.trim()).filter(Boolean)) {
    const [intent, raw = ''] = line.split('=', 2);
    const [expression, action] = raw.split('/', 2);
    if (!intent) continue;
    if (expression && !SEMANTIC_EXPRESSIONS.includes(expression as (typeof SEMANTIC_EXPRESSIONS)[number])) continue;
    if (action && !SEMANTIC_ACTIONS.includes(action as (typeof SEMANTIC_ACTIONS)[number])) continue;
    mappings[intent] = {
      ...(expression ? { expression: expression as (typeof SEMANTIC_EXPRESSIONS)[number] } : {}),
      ...(action ? { action: action as (typeof SEMANTIC_ACTIONS)[number] } : {})
    };
  }
  return mappings;
}

export function runtimeExpressionCommand(expressionId: string): CubismRuntimeCommand {
  return { type: 'play_expression', expressionId };
}

export function runtimeMotionCommand(group: string, index: number, priority: 'idle' | 'normal' | 'force' = 'normal'): CubismRuntimeCommand {
  return { type: 'play_motion', group, index, priority };
}

export interface SettingsDetailsV2Props {
  state: PublicAppState;
  page: SettingsPageId;
  settingsDraft: AppSettings;
  presentationDraft: PresentationSettings;
  roleDraft: RolePackage;
  live2dPreview: Live2DModelState | null;
  live2dAdapterDraft?: Live2DAdapterConfig | null;
  debugMetrics: CubismRuntimeMetrics | null;
  runtimeCapabilities: CubismRuntimeCapabilities | null;
  runtimeResult: CubismRuntimeResult | null;
  displays: DisplaySummary[];
  error: string;
  modelViewport: ModelViewportSettings;
  agentTasks?: readonly AgentTask[];
  agentEvent?: AgentEvent | null;
  onBack: () => void;
  conversationKey?: string;
  onNewConversation?: () => void;
  onMessageSent?: (message: string) => void;
  onRequestWorkspace?: () => void;
  initialMessages?: readonly SessionMessage[];
  sessionId?: string;
  workspaceAvailable?: boolean;
  onResetPage: () => void;
  onSettingsChange: (patch: Partial<AppSettings>, persist?: boolean) => void;
  onPresentationChange: (patch: Partial<PresentationSettings>, persist?: boolean) => void;
  onRoleChange: (role: RolePackage) => void;
  onSaveRole: () => void;
  onActivateRole: (id: string) => void;
  onCreateBlankRole: () => void;
  onCloneRole: () => void;
  onDeleteRole: () => void;
  onImportRole: () => void;
  onExportRole: () => void;
  onChooseModel: (kind: 'file' | 'directory') => void;
  onInspectModel: () => void;
  onSaveSettings: () => void;
  onAdapterChange?: (adapter: Live2DAdapterConfig) => void;
  onSwitchModel: (id: string) => void;
  onRemoveModel: (id: string) => void;
  onViewportChange: (patch: Partial<ModelViewportSettings>) => void;
  onResetViewport: () => void;
  onCenterViewport: () => void;
  onFitViewport: () => void;
  onSendPresentation: (event: PresentationEvent) => void;
  onDebug: (command: CubismDebugCommand) => void;
  onRuntimeCommand: (command: CubismRuntimeCommand) => void;
  apiKeyDraft: string;
  onApiKeyChange: (value: string) => void;
  onSaveService: () => void;
  onClearApiKey: () => void;
  onDeleteMemory?: (id: string) => void;
  onClearMemories?: () => void;
  onReviewMemory?: (id: string, action: 'confirm' | 'delete') => void;
  onReviewAllMemories?: (action: 'confirm' | 'delete') => void;
}

function RangeField({ label, value, min, max, step, unit = '', onChange, reset }: { label: string; value: number; min: number; max: number; step: number; unit?: string; onChange: (value: number) => void; reset?: () => void }): JSX.Element {
  const shown = Number.isInteger(step) ? String(Math.round(value)) : value.toFixed(step < 0.1 ? 2 : 1);
  return <label className="range-control"><span>{label}</span><span className="range-value">{shown}{unit}</span><input aria-label={label} type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} /><small className="range-hint">{reset ? <button type="button" className="inline-reset" onClick={reset}>恢复默认</button> : null}</small></label>;
}

function TextField({ label, value, onChange, rows = 2, placeholder, password = false }: { label: string; value: string; onChange: (value: string) => void; rows?: number; placeholder?: string; password?: boolean }): JSX.Element {
  return <label className="text-field"><span>{label}</span>{password ? <input type="password" value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} /> : <textarea rows={rows} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />}</label>;
}

function ToggleField({ label, checked, onChange, description, disabled = false }: { label: string; checked: boolean; onChange: (checked: boolean) => void; description?: string; disabled?: boolean }): JSX.Element {
  return <label className="toggle-field"><span><strong>{label}</strong>{description ? <small>{description}</small> : null}</span><input aria-label={label} type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} /></label>;
}

function DetailHeader({ page, onReset }: { page: SettingsPageId; onReset: () => void }): JSX.Element {
  const card = SETTINGS_CARDS.find((item) => item.id === page) ?? SETTINGS_CARDS[0];
  return <div className="detail-header"><div className="detail-heading"><span className="eyebrow">STARCHAT / SETTINGS</span><h1>{card.title}</h1><p>{card.description}</p></div><button type="button" className="secondary-button" onClick={onReset}>恢复本页默认</button></div>;
}

function PersonalityDetails(props: SettingsDetailsV2Props): JSX.Element {
  const role = props.roleDraft;
  const update = (patch: Partial<RolePackage>): void => props.onRoleChange({ ...role, ...patch });
  const updateIdentity = (key: keyof RolePackage['identity'], value: string): void => update({ identity: { ...role.identity, [key]: value } });
  const updatePersonality = (key: keyof RolePackage['personality'], value: string | string[] | RolePackage['personality']['scales']): void => update({ personality: { ...role.personality, [key]: value } });
  return <>
    <div className="detail-section role-management-section"><div className="section-heading"><div><span className="section-kicker">ROLE PACKAGE</span><h2>当前人格</h2></div><span className="section-status">关系 · {props.state.companion.stageLabel}</span></div><div className="form-grid"><label>选择角色<GlassSelect ariaLabel="选择角色" value={props.state.settings.activeRoleId} options={props.state.roles.map((item) => ({ value: item.id, label: item.displayName }))} onChange={props.onActivateRole} /></label><label>角色包名称<input value={role.displayName} onChange={(event) => update({ displayName: event.target.value })} /></label></div><div className="toolbar"><button className="primary-button" type="button" onClick={props.onSaveRole}>保存角色</button><button className="secondary-button" type="button" onClick={props.onCreateBlankRole}>新建人格</button><button className="secondary-button" type="button" onClick={props.onCloneRole}>复制当前</button><button className="secondary-button" type="button" onClick={props.onImportRole}>导入</button><button className="secondary-button" type="button" onClick={props.onExportRole}>导出</button><button className="secondary-button" type="button" onClick={props.onDeleteRole} disabled={isBuiltinRoleId(role.id)}>删除自定义</button></div></div>
    <div className="detail-section"><h2>身份与称呼</h2><div className="form-grid"><TextField label="名字" value={role.identity.name} rows={1} onChange={(value) => updateIdentity('name', value)} /><TextField label="对用户称呼" value={role.identity.address} rows={1} onChange={(value) => updateIdentity('address', value)} /></div><TextField label="身份" value={role.identity.identity} rows={1} onChange={(value) => updateIdentity('identity', value)} /><TextField label="背景" value={role.identity.background} rows={3} onChange={(value) => updateIdentity('background', value)} /></div>
    <div className="detail-section"><h2>人格与关系阶段</h2><TextField label="一句话摘要" value={role.personality.summary} onChange={(value) => updatePersonality('summary', value)} /><TextField label="核心性格" value={role.personality.core} onChange={(value) => updatePersonality('core', value)} /><div className="form-grid"><TextField label="说话方式" value={role.personality.speechStyle} onChange={(value) => updatePersonality('speechStyle', value)} /><TextField label="边界" value={role.personality.boundaries} onChange={(value) => updatePersonality('boundaries', value)} /></div><TextField label="关系阶段（每行一个阶段）" value={role.personality.relationshipStages.join('\n')} rows={4} onChange={(value) => updatePersonality('relationshipStages', value.split('\n').map((item) => item.trim()).filter(Boolean))} /><TextField label="系统提示词" value={role.personality.systemPrompt} rows={4} onChange={(value) => updatePersonality('systemPrompt', value)} /></div>
    <div className="detail-section"><h2>关系记忆与语义映射</h2><div className="metric-grid"><span>互动次数<strong>{props.state.companion.interactionCount}</strong></span><span>亲密度<strong>{props.state.companion.affinity}/100</strong></span><span>长期记忆<strong>{props.state.companion.memoryCount} 条</strong></span><span>当前阶段<strong>{props.state.companion.stageLabel}</strong></span></div><TextField label="语义映射（每行 intent=expression/action）" value={formatSemanticMappings(role.presentation.semanticMappings)} rows={5} onChange={(value) => update({ presentation: { ...role.presentation, semanticMappings: parseSemanticMappings(value) } })} /><p className="detail-note">关系阶段与记忆由应用按请求生成快照；角色包只保存人格与语义白名单。</p></div>
    <details className="advanced-settings"><summary>高级人格参数</summary><div className="advanced-settings-body"><div className="form-grid"><TextField label="喜欢" value={role.personality.likes} onChange={(value) => updatePersonality('likes', value)} /><TextField label="不喜欢" value={role.personality.dislikes} onChange={(value) => updatePersonality('dislikes', value)} /></div><TextField label="主动方式" value={role.personality.proactiveStyle} onChange={(value) => updatePersonality('proactiveStyle', value)} /><TextField label="情绪倾向" value={role.personality.emotionalTendency} onChange={(value) => updatePersonality('emotionalTendency', value)} /><div className="range-grid">{ROLE_SCALE_KEYS.map((key) => <RangeField key={key} label={scaleLabels[key]} value={role.personality.scales[key]} min={0} max={1} step={0.01} onChange={(value) => updatePersonality('scales', { ...role.personality.scales, [key]: value })} reset={() => updatePersonality('scales', { ...role.personality.scales, [key]: 0.5 })} />)}</div></div></details>
  </>;
}

function PresentationAdvanced(props: SettingsDetailsV2Props): JSX.Element {
  const presentation = props.presentationDraft;
  const model = props.live2dPreview ?? props.state.live2d;
  const runtimeReady = Boolean(model.entryPath && props.runtimeCapabilities?.modelIdentity === model.entryPath);
  const physicsSupported = Boolean(model.physics);
  const focusParameterIds = ['ParamEyeBallX', 'ParamEyeBallY', 'ParamAngleX', 'ParamAngleY', 'ParamAngleZ', 'ParamBodyAngleX', 'ParamBodyAngleY', 'ParamBodyAngleZ'];
  const unsupportedFocusParameters = model.parameters.length > 0 ? focusParameterIds.filter((id) => !model.parameters.some((parameter) => parameter.id === id)) : [];
  return <details className="advanced-settings"><summary>高级表现设置</summary><div className="advanced-settings-body"><p className="detail-note">滑条变更会实时预览：{runtimeReady ? '已应用到当前 Cubism runtime。' : '等待当前模型 runtime ready 后应用。'}{physicsSupported ? '' : ' 当前模型未提供物理文件，物理开关不支持。'}{unsupportedFocusParameters.length > 0 ? ` 不支持原生参数：${unsupportedFocusParameters.join('、')}。` : ''}</p><ToggleField label="启用物理表现" checked={presentation.physicsEnabled} onChange={(value) => props.onPresentationChange({ physicsEnabled: value })} disabled={!physicsSupported} description={physicsSupported ? '关闭后跳过当前模型的物理更新。' : '不支持：当前模型没有 Physics3 文件。'} /><div className="range-grid">{PRESENTATION_SLIDERS.map((definition) => <RangeField key={definition.key} label={definition.label} value={presentation[definition.key]} min={definition.min} max={definition.max} step={definition.step} unit={definition.unit} onChange={(value) => props.onPresentationChange({ [definition.key]: value })} reset={() => props.onPresentationChange({ [definition.key]: definition.defaultValue })} />)}</div></div></details>;
}

function ModelDetails(props: SettingsDetailsV2Props): JSX.Element {
  const model = props.live2dPreview ?? props.state.live2d;
  const currentPath = props.settingsDraft.live2dModelPath;
  const capabilities = props.runtimeCapabilities?.modelIdentity === model.entryPath ? props.runtimeCapabilities : null;
  const runtimeSnapshot = { ready: Boolean(capabilities), capabilities, result: props.runtimeResult };
  const runtimeStatus = capabilities
    ? `运行时已连接 · ${capabilities.expressions.length} 表情 · ${capabilities.motions.length} 动作`
    : props.runtimeResult?.ok === false
      ? `运行时未连接 · ${props.runtimeResult.message}`
      : '运行时正在连接，能力清单将在当前模型 ready 后更新';
  const assetStateLabel = (state: RuntimeAssetState): string => ({ waiting: '等待 runtime', available: '可预览', runtime_failed: '资源存在但加载失败', not_provided: '模型未提供' })[state];
  const sameFile = (left: string, right: string): boolean => left.replaceAll('\\', '/').split('/').at(-1)?.toLocaleLowerCase() === right.replaceAll('\\', '/').split('/').at(-1)?.toLocaleLowerCase();
  const expressionTag = (asset: typeof model.expressions[number]): JSX.Element => {
    const state = classifyRuntimeAsset(asset.fileName, runtimeSnapshot, model.entryPath);
    const capability = capabilities?.expressions.find((item) => sameFile(item.fileName, asset.fileName));
    return <button className="secondary-button runtime-tag" type="button" key={`expression-${asset.absolutePath}`} disabled={state !== 'available' || !capability} title={asset.error ?? assetStateLabel(state)} onClick={() => capability && props.onRuntimeCommand(runtimeExpressionCommand(capability.id))}>表情 · {asset.fileName}<small>{assetStateLabel(state)}</small></button>;
  };
  const motionTag = (asset: typeof model.motions[number]): JSX.Element => {
    const state = classifyRuntimeAsset(asset.fileName, runtimeSnapshot, model.entryPath);
    const capability = capabilities?.motions.find((item) => sameFile(item.fileName, asset.fileName));
    const priority = capability?.group === capabilities?.idleGroup ? 'idle' : 'normal';
    return <button className="secondary-button runtime-tag" type="button" key={`motion-${asset.absolutePath}`} disabled={state !== 'available' || !capability} title={asset.error ?? assetStateLabel(state)} onClick={() => capability && props.onRuntimeCommand(runtimeMotionCommand(capability.group, capability.index, priority))}>动作 · {asset.fileName}<small>{assetStateLabel(state)}</small></button>;
  };
  const executionStatus = props.runtimeResult?.status;
  return <>
    <div className="detail-section"><div className="section-heading"><div><span className="section-kicker">LIVE2D MODEL</span><h2>导入与切换</h2></div><span className={`status-pill status-${model.status}`}>{live2dStatusLabels[model.status]}</span></div><p className="detail-note">模型源文件保持外部只读引用，不复制到项目，也不打包进 EXE。ZIP 只解压到用户数据缓存，并保留原始来源路径。</p><div className="path-row"><input aria-label="Live2D 模型路径" value={props.settingsDraft.live2dModelPath ?? ''} placeholder="选择 .model3.json、模型目录或 ZIP" onChange={(event) => props.onSettingsChange({ live2dModelPath: event.target.value || null }, false)} /><button className="secondary-button" type="button" onClick={() => props.onChooseModel('file')}>选文件 / ZIP</button><button className="secondary-button" type="button" onClick={() => props.onChooseModel('directory')}>选目录</button></div><div className="status-callout"><strong>{model.message}</strong><span>{model.entryPath ?? '尚未选择模型'}</span><button className="secondary-button" type="button" onClick={props.onInspectModel} disabled={!props.settingsDraft.live2dModelPath}>重新检查</button></div><div className="tag-list"><span>表情 {model.expressions.length}</span><span>动作 {model.motions.length}</span><span>参数 {model.parameters.length}</span></div>{model.issues.length > 0 ? <p className="warning-text">{model.issues[0]}</p> : null}<div className="toolbar"><button className="primary-button" type="button" onClick={props.onSaveSettings}>保存并切换</button><button className="secondary-button" type="button" onClick={props.onFitViewport}>一键适配模型</button><button className="secondary-button" type="button" onClick={props.onCenterViewport}>一键恢复位置</button></div></div>
    <div className="detail-section"><div className="section-heading"><div><span className="section-kicker">MODEL REGISTRY</span><h2>最近模型</h2></div><span className="section-status">{props.state.live2dModels.length} 个记录</span></div>{props.state.live2dModels.length === 0 ? <p className="detail-note">导入后会保留模型记录；外部目录和源 ZIP 不会被应用复制或改写。</p> : <div className="voice-list">{props.state.live2dModels.map((record) => { const current = currentPath === record.entryPath; return <div key={record.id} className="status-callout"><strong>{record.displayName}{current ? ' · 当前' : ''}</strong><span>{record.sourceKind.toUpperCase()} · {record.sourcePath} · {live2dStatusLabels[record.lastStatus]}</span><button className="secondary-button" type="button" disabled={current || record.lastStatus === 'invalid'} onClick={() => props.onSwitchModel(record.id)}>{current ? '当前模型' : '切换'}</button><button className="secondary-button" type="button" onClick={() => { if (window.confirm(`移除“${record.displayName}”的模型记录？外部源文件不会被删除。`)) props.onRemoveModel(record.id); }}>移除记录</button></div>; })}</div>}</div>
    <div className="detail-section"><h2>模型显示</h2><ToggleField label="显示模型水印" checked={props.settingsDraft.live2dShowWatermark} onChange={(value) => props.onSettingsChange({ live2dShowWatermark: value })} description="只调用模型自带的显示设置，不编辑模型文件。" />{model.license?.artCredit || model.license?.modelCredit ? <p className="license-note">人物绘制：{model.license.artCredit ?? '未记录'}；人物建模：{model.license.modelCredit ?? '未记录'}。公开展示时请按来源说明保留署名。</p> : null}</div>
    <details className="advanced-settings"><summary>运行清单与调试</summary><div className="advanced-settings-body"><p className="detail-note">静态资源 {model.expressions.length} 表情 · {model.motions.length} 动作；{runtimeStatus}。</p><div className="tag-list">{model.expressions.map(expressionTag)}{model.motions.map(motionTag)}</div><div className="toolbar"><button className="secondary-button" type="button" onClick={() => props.onRuntimeCommand({ type: 'reset' })}>恢复中性</button><button className="secondary-button" type="button" onClick={() => props.onRuntimeCommand({ type: 'stop_expression' })}>停止表情</button><button className="secondary-button" type="button" onClick={() => props.onRuntimeCommand({ type: 'stop_motion' })}>停止动作</button></div><p className="detail-note" role="status">{executionStatus ? `当前执行：表情 ${executionStatus.activeExpression ?? '无'} · 动作 ${executionStatus.activeMotion ? `${executionStatus.activeMotion.group}[${executionStatus.activeMotion.index}] / ${executionStatus.activeMotion.priority}` : '无'}` : runtimeStatus}</p>{props.runtimeResult && !props.runtimeResult.ok ? <p className="warning-text" role="alert">{props.runtimeResult.phase} · {props.runtimeResult.code}：{props.runtimeResult.message}</p> : null}</div></details>{props.live2dAdapterDraft && props.onAdapterChange ? <div className="detail-section"><Live2DAdapterEditor adapter={props.live2dAdapterDraft} baselineAdapter={model.autoAdapter ?? model.adapter} model={model} runtimeCapabilities={capabilities} runtimeResult={props.runtimeResult} onChange={props.onAdapterChange} onDebug={(patch) => props.onDebug({ type: 'parameter', patch })} onRuntimeCommand={props.onRuntimeCommand} /></div> : null}<PresentationAdvanced {...props} />
  </>;
}

function VoiceDetails(props: SettingsDetailsV2Props): JSX.Element {
  const settings = props.settingsDraft;
  const activeRoleName = props.state.role.identity.name;
  const [voiceName, setVoiceName] = useState('StarChat 自定义音色');
  const [promptText, setPromptText] = useState('');
  const [voiceStatus, setVoiceStatus] = useState('');
  const play = async (promise: Promise<string>): Promise<void> => { try { setVoiceStatus('正在生成试听…'); const source = await promise; const audio = new Audio(source); audio.volume = settings.ttsVolume; audio.playbackRate = settings.ttsRate; await audio.play(); setVoiceStatus('试听已开始播放'); } catch (error) { setVoiceStatus(error instanceof Error ? error.message : String(error)); } };
  const importVoice = async (): Promise<void> => { try { await window.starchat.tts.importVoice({ name: voiceName, promptText }); setPromptText(''); setVoiceStatus('音色已导入并设为当前音色'); } catch (error) { setVoiceStatus(error instanceof Error ? error.message : String(error)); } };
  const activateVoice = async (id: string | null): Promise<void> => { try { await window.starchat.tts.activateVoice(id); setVoiceStatus(id ? '已切换自定义音色' : '已切换内置 SFT 预设'); } catch (error) { setVoiceStatus(error instanceof Error ? error.message : String(error)); } };
  const deleteVoice = async (id: string, name: string): Promise<void> => { if (!window.confirm(`删除音色“${name}”的应用内副本？原始 WAV 不受影响。`)) return; try { await window.starchat.tts.deleteVoice(id); setVoiceStatus('音色副本已删除'); } catch (error) { setVoiceStatus(error instanceof Error ? error.message : String(error)); } };
  return <>
    <div className="detail-section"><div className="section-heading"><div><span className="section-kicker">COSYVOICE</span><h2>当前语音</h2></div><span className="section-status">{settings.cosyVoiceMode === 'sft' ? '内置 SFT' : '自定义音色'}</span></div><label>CosyVoice 地址<input value={settings.cosyVoiceBaseUrl} onChange={(event) => props.onSettingsChange({ cosyVoiceBaseUrl: event.target.value })} /></label><div className="form-grid"><label>当前模式<input readOnly value={settings.cosyVoiceMode === 'sft' ? '内置 SFT 预设' : 'CosyVoice2 自定义音色'} /></label>{settings.cosyVoiceMode === 'sft' ? <label>SFT 说话人<input value={settings.cosyVoiceSpeaker} onChange={(event) => props.onSettingsChange({ cosyVoiceSpeaker: event.target.value })} /></label> : <label>当前自定义音色<GlassSelect ariaLabel="当前自定义音色" value={settings.activeVoiceProfileId ?? ''} options={props.state.voices.map((voice) => ({ value: voice.id, label: voice.name }))} onChange={(value) => void activateVoice(value)} placeholder="尚未导入音色" disabled={props.state.voices.length === 0} /></label>}</div><div className="toolbar"><button className="secondary-button" type="button" disabled={settings.cosyVoiceMode === 'sft'} onClick={() => void activateVoice(null)}>使用内置 SFT</button><button className="secondary-button" type="button" onClick={() => void play(window.starchat.tts.synthesize(`你好，我是${activeRoleName}。`))}>试听当前声音</button></div></div>
    <div className="detail-section"><h2>自定义音色库</h2><p className="detail-note">准备 3–30 秒清晰 WAV，并逐字填写音频内容。应用只复制参考音频到用户数据目录。</p><div className="form-grid"><label>音色名称<input value={voiceName} onChange={(event) => setVoiceName(event.target.value)} /></label><label>参考音频文本<input value={promptText} onChange={(event) => setPromptText(event.target.value)} placeholder="必须与 WAV 中的说话内容一致" /></label></div><button className="primary-button" type="button" onClick={() => void importVoice()}>选择 WAV 并导入</button><div className="voice-list">{props.state.voices.map((voice) => <div key={voice.id} className="status-callout"><strong>{voice.name}</strong><span>{voice.sourceFileName} · {voice.durationSeconds.toFixed(1)} 秒</span><button className="secondary-button" type="button" onClick={() => void activateVoice(voice.id)}>使用</button><button className="secondary-button" type="button" onClick={() => void play(window.starchat.tts.previewVoice(voice.id, `你好，我是${activeRoleName}。`))}>试听</button><button className="secondary-button" type="button" onClick={() => void deleteVoice(voice.id, voice.name)}>删除</button></div>)}</div>{props.state.voices.length === 0 ? <p className="detail-note">尚未导入自定义音色，当前使用内置 SFT 预设。</p> : null}{voiceStatus ? <p className="security-note" role="status">{voiceStatus}</p> : null}</div>
    <details className="advanced-settings"><summary>播放设置</summary><div className="advanced-settings-body"><div className="range-grid"><RangeField label="语速" value={settings.ttsRate} min={0.5} max={2} step={0.01} onChange={(value) => props.onSettingsChange({ ttsRate: value })} reset={() => props.onSettingsChange({ ttsRate: 1 })} /><RangeField label="音量" value={settings.ttsVolume} min={0} max={1} step={0.01} onChange={(value) => props.onSettingsChange({ ttsVolume: value })} reset={() => props.onSettingsChange({ ttsVolume: 1 })} /></div></div></details>
  </>;
}

function ServiceDetails(props: SettingsDetailsV2Props): JSX.Element {
  const settings = props.settingsDraft;
  const [connectionStatus, setConnectionStatus] = useState('');
  const testConnection = async (): Promise<void> => { try { setConnectionStatus('正在测试连接…'); const result = await window.starchat.api.testConnection({ apiBaseUrl: settings.apiBaseUrl, model: settings.model, apiKey: props.apiKeyDraft.trim() || undefined }); setConnectionStatus(result.message); } catch (error) { setConnectionStatus(error instanceof Error ? error.message : '连接测试失败'); } };
  return <>
    <div className="detail-section"><div className="section-heading"><div><span className="section-kicker">OPENAI COMPATIBLE</span><h2>对话服务</h2></div><span className={`status-pill ${props.state.hasApiKey ? 'status-ready' : 'status-muted'}`}>{props.state.hasApiKey ? '密钥已保存' : '未设置密钥'}</span></div><label>接口地址<input value={settings.apiBaseUrl} onChange={(event) => props.onSettingsChange({ apiBaseUrl: event.target.value })} /></label><label>模型<input value={settings.model} onChange={(event) => props.onSettingsChange({ model: event.target.value })} /></label><TextField label="API Key（安全输入）" value={props.apiKeyDraft} password placeholder={props.state.hasApiKey ? '已保存，留空表示不变' : '不会进入人格包'} onChange={props.onApiKeyChange} /><div className="toolbar"><button className="primary-button" type="button" onClick={props.onSaveService}>保存在线服务</button><button className="secondary-button" type="button" onClick={() => void testConnection()}>测试连接</button><button className="secondary-button" type="button" disabled={!props.state.hasApiKey} onClick={props.onClearApiKey}>清除密钥</button></div>{connectionStatus ? <p className="security-note" role="status">{connectionStatus}</p> : null}</div>
    <details className="advanced-settings"><summary>高级设置</summary><div className="advanced-settings-body"><div className="range-grid"><RangeField label="温度" value={settings.temperature} min={0} max={2} step={0.01} onChange={(value) => props.onSettingsChange({ temperature: value })} reset={() => props.onSettingsChange({ temperature: DEFAULT_APP_SETTINGS.temperature })} /><RangeField label="最大 tokens" value={settings.maxTokens} min={64} max={8192} step={1} onChange={(value) => props.onSettingsChange({ maxTokens: value })} reset={() => props.onSettingsChange({ maxTokens: DEFAULT_APP_SETTINGS.maxTokens })} /></div><TextField label="追加系统提示词" value={settings.systemPrompt} rows={5} onChange={(value) => props.onSettingsChange({ systemPrompt: value })} /></div></details>
  </>;
}

function CapabilityStatus({ title, status, description }: { title: string; status: string; description: string }): JSX.Element {
  return <div className="settings-capability-row" data-settings-capability-status><span><strong>{title}</strong><small>{description}</small></span><em>{status}</em></div>;
}

function GeneralDetails(props: SettingsDetailsV2Props): JSX.Element {
  const settings = props.settingsDraft;
  const memories = props.state.memories ?? [];
  const pendingMemories = memories.filter((memory) => memory.reviewState === 'needs-review');
  const activeMemories = memories.filter((memory) => memory.reviewState !== 'needs-review');
  return <>
    <div className="detail-section"><div className="section-heading"><div><span className="section-kicker">GENERAL</span><h2>应用与桌宠</h2></div><span className="section-status">本地配置</span></div><ToggleField label="始终置顶" checked={settings.alwaysOnTop} onChange={(value) => props.onSettingsChange({ alwaysOnTop: value })} description="只影响透明桌宠窗口。" /><ToggleField label="光标跟随" checked={settings.cursorTrackingEnabled} onChange={(value) => props.onSettingsChange({ cursorTrackingEnabled: value })} description="使用当前 Live2D runtime 已实现的平滑跟随。" /><ToggleField label="长期记忆" checked={settings.longTermMemoryEnabled} onChange={(value) => props.onSettingsChange({ longTermMemoryEnabled: value })} description="只保存安全、明确的用户事实；敏感信息会被拒绝。" /><div className="quick-actions"><button className="secondary-button" type="button" onClick={() => window.starchat.app.togglePet()}>显示 / 隐藏桌宠</button><button className="secondary-button" type="button" onClick={() => window.starchat.pet.center()}>恢复桌宠位置</button></div></div>
    <div className="detail-section"><div className="section-heading"><div><span className="section-kicker">MEMORY</span><h2>已保存的用户记忆</h2></div><span className="section-status">{settings.longTermMemoryEnabled ? `${activeMemories.length} 条有效 · ${pendingMemories.length} 条待确认` : '已关闭'}</span></div><p className="detail-note">仅保存明确表达的安全事实；API Key、密码、Token、私钥和证件信息会被拒绝。待确认记忆不会进入提示词召回。</p>{pendingMemories.length > 0 ? <div className="memory-review-panel" role="status"><div className="section-heading"><div><span className="section-kicker">REVIEW REQUIRED</span><h3>旧版本待确认记忆</h3></div><span className="status-pill status-warning">待确认</span></div><p className="detail-note">这些资料来自旧版存储，确认后才会重新参与个人对话召回。</p><div className="voice-list">{pendingMemories.map((memory) => <div className="status-callout" key={memory.id}><strong>{memory.content}</strong><span>{memory.kind} · 旧版本 · 置信度 {Math.round(memory.confidence * 100)}%</span><div className="toolbar"><button className="secondary-button" type="button" onClick={() => props.onReviewMemory?.(memory.id, 'confirm')}>确认保留</button><button className="secondary-button" type="button" onClick={() => props.onReviewMemory?.(memory.id, 'delete')}>删除</button></div></div>)}</div><div className="toolbar"><button className="secondary-button" type="button" onClick={() => props.onReviewAllMemories?.('confirm')}>全部确认</button><button className="secondary-button" type="button" onClick={() => { if (window.confirm('清除全部待确认记忆？此操作不可撤销。')) props.onReviewAllMemories?.('delete'); }}>全部清除</button></div></div> : null}{memories.length === 0 ? <p className="detail-note">暂无可管理的资料记忆。</p> : activeMemories.length > 0 ? <div className="voice-list">{activeMemories.map((memory) => <div className="status-callout" key={memory.id}><strong>{memory.content}</strong><span>{memory.kind} · 置信度 {Math.round(memory.confidence * 100)}%</span><button className="secondary-button" type="button" onClick={() => props.onDeleteMemory?.(memory.id)}>删除</button></div>)}</div> : null}<div className="toolbar"><button className="secondary-button" type="button" disabled={memories.length === 0} onClick={() => { if (window.confirm('清空当前角色的全部长期记忆？此操作不可撤销。')) props.onClearMemories?.(); }}>清空长期记忆</button></div></div>
    <div className="detail-section"><h2>默认工作方式</h2><CapabilityStatus title="工作台会话" status="已启用" description="项目工作区、会话和 Agent 任务按本地状态持久化。" /><CapabilityStatus title="外部模型资源" status="只读" description="Live2D 源文件保持外部引用，不复制、不修改。" /></div>
  </>;
}

function AppearanceDetails(props: SettingsDetailsV2Props): JSX.Element {
  const settings = props.settingsDraft;
  return <>
    <div className="detail-section"><div className="section-heading"><div><span className="section-kicker">APPEARANCE</span><h2>主题与材质</h2></div><span className="section-status">即时预览</span></div><label>主题外观<GlassSelect ariaLabel="主题外观" value={settings.themePreference} options={THEME_PREFERENCES.map((value) => ({ value, label: themeLabels[value] }))} onChange={(value) => props.onSettingsChange({ themePreference: sanitizeThemePreference(value) })} /><small className="field-hint">工作台和设置中心共用浅色、深色材质令牌。</small></label></div>
    <div className="detail-section"><h2>桌宠窗口材质</h2><div className="range-grid"><RangeField label="窗口透明度" value={settings.petWindowOpacity} min={0.25} max={1} step={0.01} onChange={(value) => props.onSettingsChange({ petWindowOpacity: value })} reset={() => props.onSettingsChange({ petWindowOpacity: DEFAULT_APP_SETTINGS.petWindowOpacity })} /><RangeField label="悬停边框透明度" value={settings.petHoverBorderOpacity} min={0} max={1} step={0.01} onChange={(value) => props.onSettingsChange({ petHoverBorderOpacity: value })} reset={() => props.onSettingsChange({ petHoverBorderOpacity: DEFAULT_APP_SETTINGS.petHoverBorderOpacity })} /></div></div>
  </>;
}

function ShortcutsDetails(props: SettingsDetailsV2Props): JSX.Element {
  return <div className="detail-section"><div className="section-heading"><div><span className="section-kicker">KEYBOARD</span><h2>键盘快捷键</h2></div><span className="section-status">Windows 全局</span></div><label>显示工作台<input value={props.settingsDraft.settingsShortcut} onChange={(event) => props.onSettingsChange({ settingsShortcut: event.target.value })} /></label><label>桌宠互动<input readOnly value="Ctrl + Alt + I" /><small className="field-hint">内置安全快捷键，避免与模型操作产生冲突。</small></label></div>;
}

function AgentDetails(props: SettingsDetailsV2Props): JSX.Element {
  const tasks = props.agentTasks ?? [];
  const active = tasks.filter((task) => ['queued', 'running', 'waiting_for_approval', 'waiting_for_input'].includes(task.status)).length;
  return <><div className="detail-section"><div className="section-heading"><div><span className="section-kicker">AGENT RUNTIME</span><h2>Agent 工作流</h2></div><span className="section-status">{active} 个活动任务</span></div><CapabilityStatus title="任务生命周期" status="已接入" description="规划、步骤、工具调用、审批、补充信息、取消、重试和结果。" /><CapabilityStatus title="会话隔离" status="已接入" description="每个项目会话保存独立消息与 Agent 任务上下文。" /><CapabilityStatus title="语义角色表现" status="已接入" description="Agent 只发送语义意图，由现有 Live2D 适配层决定表情和动作。" /></div><div className="detail-section"><h2>当前任务</h2>{tasks.slice(0, 6).map((task) => <CapabilityStatus key={task.id} title={task.message} status={task.status} description={task.route.explain} />)}{tasks.length === 0 ? <p className="detail-note">当前会话暂无 Agent 任务。</p> : null}</div></>;
}

function PermissionsDetails(_props: SettingsDetailsV2Props): JSX.Element {
  return <div className="detail-section"><div className="section-heading"><div><span className="section-kicker">PERMISSIONS</span><h2>权限边界</h2></div><span className="section-status">最小权限</span></div><CapabilityStatus title="工作区读取" status="授权目录内" description="路径经过真实路径解析，阻止越界与敏感文件读取。" /><CapabilityStatus title="文件写入" status="每次审批" description="仅在展示精确补丁、目标文件和增删行数后允许写入。" /><CapabilityStatus title="终端" status="白名单" description="只运行 Git 只读命令和项目声明的验证脚本。" /><CapabilityStatus title="浏览器" status="系统隔离" description="仅打开 http/https，不读取 Cookie、密码或网页内容。" /><CapabilityStatus title="Git 写入" status="需 trusted-execution" description="仅提交已暂存变更；提交可能执行 Git Hooks；不自动暂存、不自动推送。" /></div>;
}

function TerminalDetails(_props: SettingsDetailsV2Props): JSX.Element {
  return <div className="detail-section"><div className="section-heading"><div><span className="section-kicker">CONTROLLED TERMINAL</span><h2>受控终端</h2></div><span className="status-pill status-ready">可用</span></div><p className="detail-note">终端运行真实子进程，但命令必须匹配固定白名单。请从工作台右侧“终端”打开。</p><CapabilityStatus title="Git 只读" status="可用" description="git status --short、git diff --stat、git diff --name-only" /><CapabilityStatus title="项目验证" status="可用" description="test、typecheck、build、verify:live2d" /><CapabilityStatus title="任意 Shell" status="关闭" description="不接受 PowerShell、cmd、重定向、管道或脚本注入。" /></div>;
}

function BrowserDetails(_props: SettingsDetailsV2Props): JSX.Element {
  return <div className="detail-section"><div className="section-heading"><div><span className="section-kicker">SAFE BROWSER</span><h2>浏览器</h2></div><span className="status-pill status-ready">可用</span></div><p className="detail-note">工作台会验证地址并交给 Windows 默认浏览器打开。StarChat 不嵌入登录会话，也不执行页面自动化。</p><CapabilityStatus title="HTTP / HTTPS" status="允许" description="自动补全 https://，拒绝 file、javascript 和其他协议。" /><CapabilityStatus title="网页数据访问" status="无权限" description="不读取页面内容、Cookie、表单或账号信息。" /></div>;
}

function GitDetails(_props: SettingsDetailsV2Props): JSX.Element {
  return <div className="detail-section"><div className="section-heading"><div><span className="section-kicker">SOURCE CONTROL</span><h2>Git</h2></div><span className="section-status">工作区限定</span></div><CapabilityStatus title="状态与差异" status="可用" description="读取当前分支、HEAD、变更列表、diff 摘要和单文件 diff。" /><CapabilityStatus title="提交" status="trusted-execution" description="仅提交你已经暂存的变更；提交可能触发 Git Hooks，提交前显示确认。" /><CapabilityStatus title="暂存与远程" status="关闭" description="StarChat 不运行 git add，也不执行 push、pull、fetch 或远程凭据操作。" /></div>;
}

function BehaviorDetails(props: SettingsDetailsV2Props): JSX.Element {
  const settings = props.settingsDraft;
  const idleEnabled = settings.cursorIdleMotion > 0;
  const selectedDisplay = props.displays.find((display) => display.id === settings.petDisplayId);
  return <>
    <div className="detail-section"><div className="section-heading"><div><span className="section-kicker">DESKTOP BEHAVIOR</span><h2>桌宠状态</h2></div><span className="section-status">{settings.petLocked ? '已锁定' : '可交互'}</span></div><div className="quick-actions"><button className="secondary-button" type="button" onClick={() => window.starchat.app.togglePet()}>显示 / 隐藏桌宠</button><button className="secondary-button" type="button" onClick={() => window.starchat.pet.center()}>恢复位置</button></div><ToggleField label="始终置顶" checked={settings.alwaysOnTop} onChange={(value) => props.onSettingsChange({ alwaysOnTop: value })} /><ToggleField label="光标跟随" checked={settings.cursorTrackingEnabled} onChange={(value) => props.onSettingsChange({ cursorTrackingEnabled: value })} description="静止后平滑释放，不影响呼吸和动作。" /><ToggleField label="闲置活动" checked={idleEnabled} onChange={(value) => props.onSettingsChange({ cursorIdleMotion: value ? DEFAULT_APP_SETTINGS.cursorIdleMotion : 0 })} description="关闭后停止光标闲置微动。" /></div>
    <div className="detail-section"><h2>应用行为</h2><div className="form-grid"><label>显示器<GlassSelect ariaLabel="显示器" value={settings.petDisplayId == null ? '' : String(settings.petDisplayId)} options={[{ value: '', label: '主显示器' }, ...props.displays.map((display) => ({ value: String(display.id), label: display.label }))]} onChange={(value) => props.onSettingsChange({ petDisplayId: value ? Number(value) : null })} /><small className="field-hint">当前：{selectedDisplay?.label ?? '主显示器'}</small></label><label>设置快捷键<input value={settings.settingsShortcut} onChange={(event) => props.onSettingsChange({ settingsShortcut: event.target.value })} /></label><label>主题外观<GlassSelect ariaLabel="主题外观" value={settings.themePreference} options={THEME_PREFERENCES.map((value) => ({ value, label: themeLabels[value] }))} onChange={(value) => props.onSettingsChange({ themePreference: sanitizeThemePreference(value) })} /><small className="field-hint">设置窗口即时切换；跟随系统会响应 Windows 外观变化。</small></label></div></div>
    <div className="detail-section"><div className="section-heading"><div><span className="section-kicker">PET WINDOW</span><h2>桌宠窗口</h2></div><span className="section-status">实时预览</span></div><p className="detail-note">这些设置只影响透明桌宠窗口的显示层与悬停提示，不会改动模型源文件或模型视口。</p><div className="range-grid"><RangeField label="窗口透明度" value={settings.petWindowOpacity} min={0.25} max={1} step={0.01} onChange={(value) => props.onSettingsChange({ petWindowOpacity: value })} reset={() => props.onSettingsChange({ petWindowOpacity: DEFAULT_APP_SETTINGS.petWindowOpacity })} /><RangeField label="悬停边框透明度" value={settings.petHoverBorderOpacity} min={0} max={1} step={0.01} onChange={(value) => props.onSettingsChange({ petHoverBorderOpacity: value })} reset={() => props.onSettingsChange({ petHoverBorderOpacity: DEFAULT_APP_SETTINGS.petHoverBorderOpacity })} /><RangeField label="悬停显示延迟" value={settings.petHoverShowDelayMs} min={0} max={2000} step={10} unit=" ms" onChange={(value) => props.onSettingsChange({ petHoverShowDelayMs: value })} reset={() => props.onSettingsChange({ petHoverShowDelayMs: DEFAULT_APP_SETTINGS.petHoverShowDelayMs })} /><RangeField label="悬停淡出时长" value={settings.petHoverFadeMs} min={100} max={4000} step={10} unit=" ms" onChange={(value) => props.onSettingsChange({ petHoverFadeMs: value })} reset={() => props.onSettingsChange({ petHoverFadeMs: DEFAULT_APP_SETTINGS.petHoverFadeMs })} /></div></div>
    <details className="advanced-settings"><summary>高级跟随设置</summary><div className="advanced-settings-body"><div className="range-grid"><RangeField label="眼睛强度" value={settings.cursorEyeWeight} min={0} max={1} step={0.01} onChange={(value) => props.onSettingsChange({ cursorEyeWeight: value })} reset={() => props.onSettingsChange({ cursorEyeWeight: 1 })} /><RangeField label="头部强度" value={settings.cursorHeadWeight} min={0} max={1} step={0.01} onChange={(value) => props.onSettingsChange({ cursorHeadWeight: value })} reset={() => props.onSettingsChange({ cursorHeadWeight: 0.35 })} /><RangeField label="身体强度" value={settings.cursorBodyWeight} min={0} max={1} step={0.01} onChange={(value) => props.onSettingsChange({ cursorBodyWeight: value })} reset={() => props.onSettingsChange({ cursorBodyWeight: DEFAULT_APP_SETTINGS.cursorBodyWeight })} /><RangeField label="跟随平滑度" value={settings.cursorSmoothing} min={0.02} max={1} step={0.01} onChange={(value) => props.onSettingsChange({ cursorSmoothing: value })} reset={() => props.onSettingsChange({ cursorSmoothing: 0.22 })} /><RangeField label="跟随最大步长" value={settings.cursorMaxStep} min={0.005} max={0.4} step={0.005} onChange={(value) => props.onSettingsChange({ cursorMaxStep: value })} reset={() => props.onSettingsChange({ cursorMaxStep: DEFAULT_APP_SETTINGS.cursorMaxStep })} /><RangeField label="水平跟随范围" value={settings.cursorRangeX} min={0.1} max={1} step={0.01} onChange={(value) => props.onSettingsChange({ cursorRangeX: value })} reset={() => props.onSettingsChange({ cursorRangeX: DEFAULT_APP_SETTINGS.cursorRangeX })} /><RangeField label="垂直跟随范围" value={settings.cursorRangeY} min={0.1} max={1} step={0.01} onChange={(value) => props.onSettingsChange({ cursorRangeY: value })} reset={() => props.onSettingsChange({ cursorRangeY: DEFAULT_APP_SETTINGS.cursorRangeY })} /></div></div></details>
  </>;
}

function ChatDetails(props: SettingsDetailsV2Props): JSX.Element {
  return <div className="detail-section"><div className="section-heading"><div><span className="section-kicker">COMPANIONSHIP</span><h2>和 {props.state.role.displayName} 对话</h2></div><span className="section-status">记忆 {props.state.companion.memoryCount} 条</span></div><CompanionChat key={props.conversationKey} state={props.state} agentTasks={props.agentTasks ?? []} agentEvent={props.agentEvent ?? null} onModeChange={(mode) => props.onSettingsChange({ assistantMode: mode })} onNewConversation={props.onNewConversation} onMessageSent={props.onMessageSent} onRequestWorkspace={props.onRequestWorkspace} initialMessages={props.initialMessages} sessionId={props.sessionId} workspaceAvailable={props.workspaceAvailable} /></div>;
}

export function SettingsDetailsV2(props: SettingsDetailsV2Props): JSX.Element {
  const card = SETTINGS_CARDS.find((item) => item.id === props.page);
  return <section className="settings-details" aria-label={`${card?.title ?? ''}详情`} data-settings-detail><DetailHeader page={props.page} onReset={props.onResetPage} />{props.error ? <p className="error-banner" role="alert">{props.error}</p> : null}{props.page === 'general' ? <GeneralDetails {...props} /> : null}{props.page === 'appearance' ? <AppearanceDetails {...props} /> : null}{props.page === 'shortcuts' ? <ShortcutsDetails {...props} /> : null}{props.page === 'chat' ? <ChatDetails {...props} /> : null}{props.page === 'personality' ? <PersonalityDetails {...props} /> : null}{props.page === 'model' ? <ModelDetails {...props} /> : null}{props.page === 'voice' ? <VoiceDetails {...props} /> : null}{props.page === 'service' ? <ServiceDetails {...props} /> : null}{props.page === 'agent' ? <AgentDetails {...props} /> : null}{props.page === 'permissions' ? <PermissionsDetails {...props} /> : null}{props.page === 'terminal' ? <TerminalDetails {...props} /> : null}{props.page === 'browser' ? <BrowserDetails {...props} /> : null}{props.page === 'git' ? <GitDetails {...props} /> : null}{props.page === 'behavior' ? <BehaviorDetails {...props} /> : null}</section>;
}
