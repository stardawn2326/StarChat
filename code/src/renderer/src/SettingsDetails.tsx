import type { DisplaySummary, CubismDebugCommand, PublicAppState } from '../../shared/ipc';
import type { CubismRuntimeMetrics } from '../../shared/cubism';
import type { Live2DModelState } from '../../shared/live2d';
import { SEMANTIC_ACTIONS, SEMANTIC_EXPRESSIONS, ROLE_SCALE_KEYS, type RolePackage, type RoleScaleKey } from '../../shared/role-package';
import type { PresentationEvent } from '../../shared/presentation';
import { DEFAULT_APP_SETTINGS, DEFAULT_MODEL_VIEWPORT, type AppSettings, type ModelViewportSettings } from '../../shared/settings';
import { SETTINGS_CARDS, type SettingsPageId } from './settings-schema';
import { PRESENTATION_SLIDERS, type PresentationSettings } from '../../shared/presentation-contract';
import { CompanionChat } from './CompanionChat';
import { useState } from 'react';

const live2dStatusLabels: Record<Live2DModelState['status'], string> = {
  not_configured: '未配置', ready: '只读检查通过', ready_with_warnings: '通过，但有警告', missing: '缺少文件', invalid: '入口无效', unreadable: '文件不可读'
};

const scaleLabels: Record<RoleScaleKey, string> = {
  tsundere: '傲娇', warmth: '温柔', patience: '耐心', initiative: '主动', teasing: '吐槽', assertiveness: '反驳', curiosity: '好奇', expressiveness: '情绪外露', intimacy: '亲密表达', replyLength: '回复长度', humor: '幽默', ditziness: '呆萌', relationshipGrowth: '关系成长速度', proactiveFrequency: '主动发话频率'
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

interface SettingsDetailsProps {
  state: PublicAppState;
  page: SettingsPageId;
  settingsDraft: AppSettings;
  presentationDraft: PresentationSettings;
  roleDraft: RolePackage;
  live2dPreview: Live2DModelState | null;
  debugMetrics: CubismRuntimeMetrics | null;
  displays: DisplaySummary[];
  error: string;
  modelViewport: ModelViewportSettings;
  onBack: () => void;
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
  onLicenseChange: (accepted: boolean) => void;
  licenseAccepted: boolean;
  onViewportChange: (patch: Partial<ModelViewportSettings>) => void;
  onResetViewport: () => void;
  onCenterViewport: () => void;
  onFitViewport: () => void;
  onSendPresentation: (event: PresentationEvent) => void;
  onDebug: (command: CubismDebugCommand) => void;
  apiKeyDraft: string;
  onApiKeyChange: (value: string) => void;
  onSaveService: () => void;
  onClearApiKey: () => void;
}

function RangeField({ label, value, min, max, step, unit = '', onChange, reset }: { label: string; value: number; min: number; max: number; step: number; unit?: string; onChange: (value: number) => void; reset?: () => void }): JSX.Element {
  const shown = Number.isInteger(step) ? String(Math.round(value)) : value.toFixed(step < 0.1 ? 2 : 1);
  return (
    <label className="range-control">
      <span>{label}</span><span className="range-value">{shown}{unit}</span>
      <input aria-label={label} type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
      <small className="range-hint">范围 {min}{unit} – {max}{unit}{reset ? <button type="button" className="inline-reset" onClick={reset}>重置</button> : null}</small>
    </label>
  );
}

function TextField({ label, value, onChange, rows = 2, placeholder }: { label: string; value: string; onChange: (value: string) => void; rows?: number; placeholder?: string }): JSX.Element {
  return <label className="text-field"><span>{label}</span><textarea rows={rows} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} /></label>;
}

function ToggleField({ label, checked, onChange, description }: { label: string; checked: boolean; onChange: (checked: boolean) => void; description?: string }): JSX.Element {
  return <label className="toggle-field"><span><strong>{label}</strong>{description ? <small>{description}</small> : null}</span><input type="checkbox" role="switch" checked={checked} onChange={(event) => onChange(event.target.checked)} /></label>;
}

function DetailHeader({ page, onBack, onReset }: { page: SettingsPageId; onBack: () => void; onReset: () => void }): JSX.Element {
  const card = SETTINGS_CARDS.find((item) => item.id === page) ?? SETTINGS_CARDS[0];
  return <div className="detail-header"><button type="button" className="back-button" onClick={onBack}>‹ 返回</button><div><span className="eyebrow">{card.icon} SETTINGS</span><h1>{card.title}</h1><p>{card.description}</p></div><button type="button" className="secondary-button" onClick={onReset}>恢复本页默认</button></div>;
}

function PersonalityDetails(props: SettingsDetailsProps): JSX.Element {
  const role = props.roleDraft;
  const update = (patch: Partial<RolePackage>): void => props.onRoleChange({ ...role, ...patch });
  const updateIdentity = (key: keyof RolePackage['identity'], value: string): void => update({ identity: { ...role.identity, [key]: value } });
  const updatePersonality = (key: keyof RolePackage['personality'], value: string | string[] | RolePackage['personality']['scales']): void => update({ personality: { ...role.personality, [key]: value } });
  const updateVisual = (key: keyof RolePackage['visual'], value: string | string[] | null): void => update({ visual: { ...role.visual, [key]: value } });
  return <>
    <div className="detail-section"><h2>角色包</h2><div className="form-grid"><label>当前角色<select value={props.state.settings.activeRoleId} onChange={(event) => props.onActivateRole(event.target.value)}>{props.state.roles.map((item) => <option key={item.id} value={item.id}>{item.displayName}</option>)}</select></label><label>角色包名称<input value={role.displayName} onChange={(event) => update({ displayName: event.target.value })} /></label></div><div className="role-create-actions"><button className="primary-button" type="button" onClick={props.onCreateBlankRole}>空白创建</button><button className="secondary-button" type="button" onClick={props.onCloneRole}>复制当前角色</button></div><div className="toolbar"><button className="secondary-button" type="button" onClick={props.onImportRole}>导入</button><button className="secondary-button" type="button" onClick={props.onExportRole}>导出</button><button className="secondary-button" type="button" onClick={props.onDeleteRole} disabled={role.id === 'baoyin.default'}>删除自定义角色</button><button className="primary-button" type="button" onClick={props.onSaveRole}>保存角色包</button></div></div>
    <div className="detail-section"><h2>身份与称呼</h2><div className="form-grid"><TextField label="名字" value={role.identity.name} rows={1} onChange={(value) => updateIdentity('name', value)} /><TextField label="对用户称呼" value={role.identity.address} rows={1} onChange={(value) => updateIdentity('address', value)} /></div><TextField label="身份" value={role.identity.identity} rows={1} onChange={(value) => updateIdentity('identity', value)} /><TextField label="背景" value={role.identity.background} rows={3} onChange={(value) => updateIdentity('background', value)} /></div>
    <div className="detail-section"><h2>人格文本</h2><TextField label="一句话摘要" value={role.personality.summary} onChange={(value) => updatePersonality('summary', value)} /><TextField label="核心性格（关系变化后仍保留）" value={role.personality.core} onChange={(value) => updatePersonality('core', value)} /><TextField label="说话方式" value={role.personality.speechStyle} onChange={(value) => updatePersonality('speechStyle', value)} /><div className="form-grid"><TextField label="喜欢" value={role.personality.likes} onChange={(value) => updatePersonality('likes', value)} /><TextField label="不喜欢" value={role.personality.dislikes} onChange={(value) => updatePersonality('dislikes', value)} /></div><TextField label="边界" value={role.personality.boundaries} onChange={(value) => updatePersonality('boundaries', value)} /><TextField label="主动方式" value={role.personality.proactiveStyle} onChange={(value) => updatePersonality('proactiveStyle', value)} /><TextField label="情绪倾向" value={role.personality.emotionalTendency} onChange={(value) => updatePersonality('emotionalTendency', value)} /><TextField label="关系阶段（每行一个阶段）" value={role.personality.relationshipStages.join('\n')} rows={4} onChange={(value) => updatePersonality('relationshipStages', value.split('\n').map((item) => item.trim()).filter(Boolean))} /><TextField label="系统提示词" value={role.personality.systemPrompt} rows={5} onChange={(value) => updatePersonality('systemPrompt', value)} /></div>
    <div className="detail-section"><h2>模型关联与语义映射</h2><TextField label="模型关联（外部路径或资源标识；留空表示未关联）" value={role.visual.modelAsset ?? ''} rows={1} onChange={(value) => updateVisual('modelAsset', value.trim() || null)} /><TextField label="视觉描述" value={role.visual.description} onChange={(value) => updateVisual('description', value)} /><TextField label="语义映射（每行 intent=expression/action）" value={formatSemanticMappings(role.presentation.semanticMappings)} rows={6} onChange={(value) => update({ presentation: { ...role.presentation, semanticMappings: parseSemanticMappings(value) } })} /><p className="runtime-capability-note">这里保存的是角色的语义意图映射，不代表 Cubism 已成功加载。真实可用表情与动作只读取当前 runtime 清单。</p></div>
    <div className="detail-section"><h2>连续性格参数</h2><div className="range-grid">{ROLE_SCALE_KEYS.map((key) => <RangeField key={key} label={scaleLabels[key]} value={role.personality.scales[key]} min={0} max={1} step={0.01} onChange={(value) => updatePersonality('scales', { ...role.personality.scales, [key]: value })} reset={() => updatePersonality('scales', { ...role.personality.scales, [key]: 0.5 })} />)}</div></div>
  </>;
}

function PresentationDetails(props: SettingsDetailsProps): JSX.Element {
  const settings = props.settingsDraft;
  const presentation = props.presentationDraft;
  return <>
    <div className="detail-section"><h2>优先级</h2><p className="detail-note">人工/安全 ＞ 特殊动作 ＞ 对话情绪 ＞ 回复状态 ＞ 光标注视 ＞ 空闲动作 ＞ 呼吸眨眼。动作结束后恢复当前情绪。LLM 只能输出白名单语义。</p><ol className="priority-list"><li>人工 / 安全</li><li>特殊动作</li><li>对话情绪</li><li>回复状态</li><li>光标注视</li><li>空闲动作</li><li>呼吸 / 眨眼</li></ol></div>
    <div className="detail-section"><h2>全身跟随与物理意图</h2><p className="detail-note">这些值只描述实时表现意图，供整合会话映射到 runtime；设置中心不会直接操作 Cubism 参数、模型缩放或窗口偏移。</p><ToggleField label="启用物理表现" checked={presentation.physicsEnabled} onChange={(value) => props.onPresentationChange({ physicsEnabled: value })} description="关闭后由整合会话跳过物理表现层。" /><div className="range-grid">{PRESENTATION_SLIDERS.map((definition) => <RangeField key={definition.key} label={definition.label} value={presentation[definition.key]} min={definition.min} max={definition.max} step={definition.step} unit={definition.unit} onChange={(value) => props.onPresentationChange({ [definition.key]: value })} reset={() => props.onPresentationChange({ [definition.key]: definition.defaultValue })} />)}</div></div>
    <div className="detail-section"><h2>全局光标注视</h2><ToggleField label="持续追踪光标" checked={settings.cursorTrackingEnabled} onChange={(value) => props.onSettingsChange({ cursorTrackingEnabled: value })} description="静止时仍看向光标，只叠加轻微微动。" /><div className="range-grid"><RangeField label="眼睛强度" value={settings.cursorEyeWeight} min={0} max={1} step={0.01} onChange={(value) => props.onSettingsChange({ cursorEyeWeight: value })} reset={() => props.onSettingsChange({ cursorEyeWeight: 1 })} /><RangeField label="头部强度" value={settings.cursorHeadWeight} min={0} max={1} step={0.01} onChange={(value) => props.onSettingsChange({ cursorHeadWeight: value })} reset={() => props.onSettingsChange({ cursorHeadWeight: 0.35 })} /><RangeField label="身体强度" value={settings.cursorBodyWeight} min={0} max={1} step={0.01} onChange={(value) => props.onSettingsChange({ cursorBodyWeight: value })} reset={() => props.onSettingsChange({ cursorBodyWeight: 0.08 })} /><RangeField label="平滑度" value={settings.cursorSmoothing} min={0.02} max={1} step={0.01} onChange={(value) => props.onSettingsChange({ cursorSmoothing: value })} reset={() => props.onSettingsChange({ cursorSmoothing: 0.22 })} /><RangeField label="最大速度" value={settings.cursorMaxStep} min={0.005} max={0.4} step={0.005} onChange={(value) => props.onSettingsChange({ cursorMaxStep: value })} reset={() => props.onSettingsChange({ cursorMaxStep: 0.08 })} /><RangeField label="水平范围" value={settings.cursorRangeX} min={0.1} max={1} step={0.01} onChange={(value) => props.onSettingsChange({ cursorRangeX: value })} reset={() => props.onSettingsChange({ cursorRangeX: 1 })} /><RangeField label="垂直范围" value={settings.cursorRangeY} min={0.1} max={1} step={0.01} onChange={(value) => props.onSettingsChange({ cursorRangeY: value })} reset={() => props.onSettingsChange({ cursorRangeY: 1 })} /><RangeField label="静止微动" value={settings.cursorIdleMotion} min={0} max={0.15} step={0.005} onChange={(value) => props.onSettingsChange({ cursorIdleMotion: value })} reset={() => props.onSettingsChange({ cursorIdleMotion: 0.035 })} /></div></div>
    <div className="detail-section"><h2>人工语义试演</h2><div className="debug-button-grid">{SEMANTIC_EXPRESSIONS.map((name) => <button key={name} className="secondary-button" type="button" onClick={() => props.onSendPresentation({ type: 'expression', name, source: 'system', layer: 'manual' })}>{name}</button>)}{SEMANTIC_ACTIONS.map((name) => <button key={name} className="secondary-button" type="button" onClick={() => props.onSendPresentation({ type: 'action', name, source: 'system', layer: 'manual' })}>{name}</button>)}</div><div className="toolbar"><button className="secondary-button" type="button" onClick={() => props.onSendPresentation({ type: 'control', name: 'neutral', source: 'system', layer: 'manual' })}>恢复当前情绪</button><button className="secondary-button" type="button" onClick={() => props.onSendPresentation({ type: 'control', name: 'stop_action', source: 'system', layer: 'manual' })}>停止动作</button></div></div>
  </>;
}

function Live2DDetails(props: SettingsDetailsProps): JSX.Element {
  const model = props.live2dPreview ?? props.state.live2d;
  return <>
    <div className="detail-section"><h2>只读导入</h2><div className="path-row"><input value={props.settingsDraft.live2dModelPath ?? ''} placeholder="D:\\BaiduNetdiskDownload\\miku\\miku\\miku.model3.json" onChange={(event) => props.onSettingsChange({ live2dModelPath: event.target.value || null }, false)} /><button className="secondary-button" type="button" onClick={() => props.onChooseModel('file')}>选文件</button><button className="secondary-button" type="button" onClick={() => props.onChooseModel('directory')}>选目录</button></div><div className="status-callout"><strong>{live2dStatusLabels[model.status]}</strong><span>{model.message}</span><button className="secondary-button" type="button" onClick={props.onInspectModel} disabled={!props.settingsDraft.live2dModelPath}>检查</button></div><div className="tag-list"><span>表情 {model.expressions.length}</span><span>动作 {model.motions.length}</span><span>参数 {model.parameters.length}</span></div>{model.issues.length > 0 ? <p className="warning-text">{model.issues[0]}</p> : null}<button className="primary-button" type="button" onClick={props.onSaveSettings}>保存模型设置</button></div>
    <div className="detail-section"><h2>水印与许可</h2><ToggleField label="显示模型水印" checked={props.settingsDraft.live2dShowWatermark} onChange={(value) => props.onSettingsChange({ live2dShowWatermark: value })} description="只调用模型自带 exp3 / 表情开关，不编辑、遮挡或重打包模型。" />{model.license?.artCredit || model.license?.modelCredit ? <p className="license-note">人物绘制：{model.license.artCredit ?? '未记录'}；人物建模：{model.license.modelCredit ?? '未记录'}。公开展示、直播或导出视频请保留署名并遵守非商用限制。</p> : null}<label className="checkbox-label"><input type="checkbox" checked={props.licenseAccepted} onChange={(event) => props.onLicenseChange(event.target.checked)} />我确认拥有该外部模型的本机使用许可，并接受只读引用。</label></div>
    <div className="detail-section"><h2>runtime 实际清单</h2><p className="detail-note">以下名称来自只读模型检查结果，仅表示资源被发现；设置中心不据此宣称 Cubism 已成功播放。整合会话需再接 PetWindow runtime 的已加载能力清单。</p><div className="tag-list">{model.expressions.map((asset) => <span key={`expression-${asset.absolutePath}`}>表情 · {asset.fileName}</span>)}{model.motions.map((asset) => <span key={`motion-${asset.absolutePath}`}>动作 · {asset.fileName}</span>)}</div>{model.expressions.length === 0 && model.motions.length === 0 ? <p className="runtime-capability-note">当前没有可列出的真实模型表情或动作资源。</p> : null}<div className="toolbar"><button className="secondary-button" type="button" onClick={() => props.onDebug({ type: 'control', name: 'neutral' })}>neutral</button><button className="secondary-button" type="button" onClick={() => props.onDebug({ type: 'control', name: 'stop_expression' })}>stop expression</button><button className="secondary-button" type="button" onClick={() => props.onDebug({ type: 'control', name: 'stop_action' })}>stop action</button></div></div>
  </>;
}

function CompositionDetails(props: SettingsDetailsProps): JSX.Element {
  const view = props.modelViewport;
  return <div className="detail-section"><h2>模型截取视口</h2><p className="detail-note">PetWindow 的模型缩放、X/Y 偏移与截取面积独立存储；窗口 resize 只改裁切视口，不重算模型构图。</p><div className="range-grid"><RangeField label="模型缩放" value={view.modelScale} min={0.55} max={2.4} step={0.01} onChange={(value) => props.onViewportChange({ modelScale: value })} reset={() => props.onViewportChange({ modelScale: DEFAULT_MODEL_VIEWPORT.modelScale })} /><RangeField label="模型 X 偏移" value={view.modelOffsetX} min={-240} max={240} step={1} unit=" px" onChange={(value) => props.onViewportChange({ modelOffsetX: value })} reset={() => props.onViewportChange({ modelOffsetX: 0 })} /><RangeField label="模型 Y 偏移" value={view.modelOffsetY} min={-300} max={300} step={1} unit=" px" onChange={(value) => props.onViewportChange({ modelOffsetY: value })} reset={() => props.onViewportChange({ modelOffsetY: 0 })} /><RangeField label="模型透明度" value={view.modelOpacity} min={0.1} max={1} step={0.01} onChange={(value) => props.onViewportChange({ modelOpacity: value })} reset={() => props.onViewportChange({ modelOpacity: 1 })} /><RangeField label="截取宽度" value={view.clipWidth} min={0.2} max={1} step={0.01} onChange={(value) => props.onViewportChange({ clipWidth: value })} reset={() => props.onViewportChange({ clipWidth: 1 })} /><RangeField label="截取高度" value={view.clipHeight} min={0.2} max={1} step={0.01} onChange={(value) => props.onViewportChange({ clipHeight: value })} reset={() => props.onViewportChange({ clipHeight: 1 })} /></div><div className="toolbar"><button className="secondary-button" type="button" onClick={props.onCenterViewport}>模型居中</button><button className="secondary-button" type="button" onClick={props.onFitViewport}>适应高度</button><button className="secondary-button" type="button" onClick={props.onResetViewport}>恢复默认</button><button className="primary-button" type="button" onClick={() => window.baoyin.app.toggleModelEdit()}>打开桌面调整模式</button></div></div>;
}

function WindowDetails(props: SettingsDetailsProps): JSX.Element {
  const settings = props.settingsDraft;
  const bounds = settings.petBounds ?? { x: 0, y: 0, width: 640, height: 720 };
  const setBounds = (patch: Partial<typeof bounds>): void => props.onSettingsChange({ petBounds: { ...bounds, ...patch } });
  return <>
    <div className="detail-section"><h2>窗口尺寸与位置</h2><div className="range-grid"><RangeField label="宽度" value={bounds.width} min={240} max={1200} step={1} unit=" px" onChange={(value) => setBounds({ width: value })} reset={() => setBounds({ width: 640 })} /><RangeField label="高度" value={bounds.height} min={240} max={1200} step={1} unit=" px" onChange={(value) => setBounds({ height: value })} reset={() => setBounds({ height: 720 })} /><RangeField label="X 位置" value={bounds.x} min={-3000} max={5000} step={1} unit=" px" onChange={(value) => setBounds({ x: value })} /><RangeField label="Y 位置" value={bounds.y} min={-2000} max={3000} step={1} unit=" px" onChange={(value) => setBounds({ y: value })} /></div><div className="toolbar"><button className="secondary-button" type="button" onClick={() => window.baoyin.pet.center()}>当前显示器回中</button><span className="detail-note">显示器：{props.displays.find((display) => display.id === settings.petDisplayId)?.label ?? '主显示器'}</span></div></div>
    <div className="detail-section"><h2>桌面交互</h2><ToggleField label="窗口置顶" checked={settings.alwaysOnTop} onChange={(value) => props.onSettingsChange({ alwaysOnTop: value })} /><ToggleField label="锁定位置" checked={settings.petLocked} onChange={(value) => props.onSettingsChange({ petLocked: value })} description="锁定后完全点击穿透，可从托盘或本页解除。" /><ToggleField label="交互模式" checked={settings.petInteractionMode} onChange={(value) => props.onSettingsChange({ petInteractionMode: value })} description="显式模式才允许拖动原生窗口；普通悬停不长期吞掉点击。" /><div className="form-grid"><label>显示器<select value={settings.petDisplayId ?? ''} onChange={(event) => props.onSettingsChange({ petDisplayId: event.target.value ? Number(event.target.value) : null })}><option value="">主显示器</option>{props.displays.map((display) => <option key={display.id} value={display.id}>{display.label}</option>)}</select></label><label>设置快捷键<input value={settings.settingsShortcut} onChange={(event) => props.onSettingsChange({ settingsShortcut: event.target.value })} /></label></div><div className="range-grid"><RangeField label="窗口透明度" value={settings.petWindowOpacity} min={0.25} max={1} step={0.01} onChange={(value) => props.onSettingsChange({ petWindowOpacity: value })} reset={() => props.onSettingsChange({ petWindowOpacity: 1 })} /><RangeField label="悬停边框透明度" value={settings.petHoverBorderOpacity} min={0} max={1} step={0.01} onChange={(value) => props.onSettingsChange({ petHoverBorderOpacity: value })} reset={() => props.onSettingsChange({ petHoverBorderOpacity: 0.8 })} /><RangeField label="显示延迟" value={settings.petHoverShowDelayMs} min={0} max={2000} step={10} unit=" ms" onChange={(value) => props.onSettingsChange({ petHoverShowDelayMs: value })} reset={() => props.onSettingsChange({ petHoverShowDelayMs: 80 })} /><RangeField label="淡出时间" value={settings.petHoverFadeMs} min={100} max={4000} step={10} unit=" ms" onChange={(value) => props.onSettingsChange({ petHoverFadeMs: value })} reset={() => props.onSettingsChange({ petHoverFadeMs: 420 })} /></div></div>
  </>;
}

function ServiceDetails(props: SettingsDetailsProps): JSX.Element {
  const settings = props.settingsDraft;
  const [voiceName, setVoiceName] = useState('白音自定义音色');
  const [promptText, setPromptText] = useState('');
  const [voiceStatus, setVoiceStatus] = useState('');
  const play = async (promise: Promise<string>): Promise<void> => {
    try {
      setVoiceStatus('正在生成试听…');
      const source = await promise;
      const audio = new Audio(source); audio.volume = settings.ttsVolume; audio.playbackRate = settings.ttsRate;
      await audio.play(); setVoiceStatus('试听已开始播放');
    } catch (error) { setVoiceStatus(error instanceof Error ? error.message : String(error)); }
  };
  const importVoice = async (): Promise<void> => {
    try {
      setVoiceStatus('');
      await window.baoyin.tts.importVoice({ name: voiceName, promptText });
      setPromptText(''); setVoiceStatus('音色已导入并设为当前音色');
    } catch (error) { setVoiceStatus(error instanceof Error ? error.message : String(error)); }
  };
  const activateVoice = async (id: string | null): Promise<void> => {
    try { await window.baoyin.tts.activateVoice(id); setVoiceStatus(id ? '已切换自定义音色' : '已切换内置 SFT 预设'); }
    catch (error) { setVoiceStatus(error instanceof Error ? error.message : String(error)); }
  };
  const deleteVoice = async (id: string, name: string): Promise<void> => {
    if (!window.confirm(`删除音色“${name}”的应用内副本？原始 WAV 不受影响。`)) return;
    try { await window.baoyin.tts.deleteVoice(id); setVoiceStatus('音色副本已删除'); }
    catch (error) { setVoiceStatus(error instanceof Error ? error.message : String(error)); }
  };
  return <>
    <div className="detail-section"><h2>OpenAI-compatible 对话服务</h2><label>接口地址<input value={settings.apiBaseUrl} onChange={(event) => props.onSettingsChange({ apiBaseUrl: event.target.value })} /></label><label>模型<input value={settings.model} onChange={(event) => props.onSettingsChange({ model: event.target.value })} /></label><div className="range-grid"><RangeField label="温度" value={settings.temperature} min={0} max={2} step={0.01} onChange={(value) => props.onSettingsChange({ temperature: value })} reset={() => props.onSettingsChange({ temperature: 0.7 })} /><RangeField label="最大 tokens" value={settings.maxTokens} min={64} max={8192} step={1} onChange={(value) => props.onSettingsChange({ maxTokens: value })} reset={() => props.onSettingsChange({ maxTokens: 800 })} /></div><TextField label="追加系统提示词" value={settings.systemPrompt} rows={5} onChange={(value) => props.onSettingsChange({ systemPrompt: value })} /><label>新增 API Key<input type="password" value={props.apiKeyDraft} onChange={(event) => props.onApiKeyChange(event.target.value)} placeholder={props.state.hasApiKey ? '已保存，留空表示不变' : '不会进入人格包'} /></label><div className="toolbar"><button className="primary-button" type="button" onClick={props.onSaveService}>保存在线服务</button><button className="secondary-button" type="button" disabled={!props.state.hasApiKey} onClick={props.onClearApiKey}>清除密钥</button></div></div>
    <div className="detail-section"><h2>语音提供器</h2><p className="detail-note">CosyVoice 是唯一语音引擎，不调用 Windows 系统语音。预设 SFT 与 CosyVoice2 自定义音色按需切换，同一时间只运行一个服务。</p><label>CosyVoice 地址<input value={settings.cosyVoiceBaseUrl} onChange={(event) => props.onSettingsChange({ cosyVoiceBaseUrl: event.target.value })} /></label><div className="form-grid"><label>当前模式<input readOnly value={props.state.settings.cosyVoiceMode === 'sft' ? '内置 SFT 预设' : 'CosyVoice2 自定义音色'} /></label>{props.state.settings.cosyVoiceMode === 'sft' ? <label>SFT 说话人<input value={settings.cosyVoiceSpeaker} onChange={(event) => props.onSettingsChange({ cosyVoiceSpeaker: event.target.value })} /></label> : <label>当前自定义音色<select value={props.state.settings.activeVoiceProfileId ?? ''} onChange={(event) => void activateVoice(event.target.value)}>{props.state.voices.map((voice) => <option key={voice.id} value={voice.id}>{voice.name}</option>)}</select></label>}</div><button className="secondary-button" type="button" disabled={props.state.settings.cosyVoiceMode === 'sft'} onClick={() => void activateVoice(null)}>使用内置 SFT 预设</button><div className="range-grid"><RangeField label="语速" value={settings.ttsRate} min={0.5} max={2} step={0.01} onChange={(value) => props.onSettingsChange({ ttsRate: value })} reset={() => props.onSettingsChange({ ttsRate: 1 })} /><RangeField label="音量" value={settings.ttsVolume} min={0} max={1} step={0.01} onChange={(value) => props.onSettingsChange({ ttsVolume: value })} reset={() => props.onSettingsChange({ ttsVolume: 1 })} /></div></div>
    <div className="detail-section"><h2>自定义音色库</h2><p className="detail-note">准备 3–30 秒清晰 WAV，并逐字填写音频实际内容。应用只复制参考音频到本机用户数据目录，不修改原文件，也不把音频打进 EXE。</p><div className="form-grid"><label>音色名称<input value={voiceName} onChange={(event) => setVoiceName(event.target.value)} /></label><label>参考音频对应文本<input value={promptText} onChange={(event) => setPromptText(event.target.value)} placeholder="必须与 WAV 中的说话内容一致" /></label></div><button className="primary-button" type="button" onClick={() => void importVoice()}>选择 WAV 并导入</button><div className="role-create-actions">{props.state.voices.map((voice) => <div key={voice.id} className="status-callout"><strong>{voice.name}</strong><span>{voice.sourceFileName} · {voice.durationSeconds.toFixed(1)} 秒</span><button className="secondary-button" type="button" onClick={() => void activateVoice(voice.id)}>使用</button><button className="secondary-button" type="button" onClick={() => void play(window.baoyin.tts.previewVoice(voice.id, '你好，我是白音。'))}>试听</button><button className="secondary-button" type="button" onClick={() => void deleteVoice(voice.id, voice.name)}>删除</button></div>)}</div>{props.state.voices.length === 0 ? <p className="runtime-capability-note">尚未导入自定义音色。当前仍可使用原有 SFT 预设。</p> : null}{voiceStatus ? <p className="security-note">{voiceStatus}</p> : null}<p className="security-note">自定义音色使用官方 /inference_zero_shot；请只导入本人声音或已获明确许可的声音。</p></div>
  </>;
}

function DataDetails(props: SettingsDetailsProps): JSX.Element {
  return <div className="detail-section"><h2>数据与安全</h2><p className="detail-note">角色包只包含人格和语义白名单，不包含 API Key；外部 Miku 模型继续保持 D 盘只读引用，不进入项目或 EXE。</p><div className="toolbar"><button className="secondary-button" type="button" onClick={props.onImportRole}>导入角色包</button><button className="secondary-button" type="button" onClick={props.onExportRole}>导出当前角色</button><button className="secondary-button" type="button" onClick={props.onResetPage}>恢复普通设置默认</button></div><p className="security-note">恢复默认不会删除角色包、密钥或外部模型文件。</p></div>;
}

function ChatDetails(props: SettingsDetailsProps): JSX.Element {
  return <div className="detail-section"><h2>与{props.state.role.displayName}对话</h2><CompanionChat state={props.state} /></div>;
}

function DebugDetails(props: SettingsDetailsProps): JSX.Element {
  return <><div className="detail-section"><h2>运行状态</h2><div className="metric-grid"><span>模型状态<strong>{props.state.live2d.status}</strong></span><span>模型入口<strong>{props.state.live2d.entryPath ?? '未配置'}</strong></span><span>唯一 runtime<strong>PetWindow 持有</strong></span><span>指标<strong>{props.debugMetrics ? `${props.debugMetrics.fps.toFixed(1)} FPS / ${props.debugMetrics.frameCount} 帧` : '等待指标'}</strong></span></div><pre className="metric-json">{props.debugMetrics ? JSON.stringify(props.debugMetrics, null, 2) : '尚未收到 Cubism 指标。打开 PetWindow 后会自动上报。'}</pre></div><div className="detail-section"><h2>许可与关于</h2><p className="license-note">当前外部 Miku 仅允许本机只读引用。水印开关只调用模型自带 exp3/表情设置；公开展示、直播、导出视频或分发时，请保留人物绘制与建模署名并遵守非商用限制。</p><p className="detail-note">Project-008 · 白音 AI 助手 0.2.1。窗口、模型构图、追踪和控制桥均通过主进程受限 IPC 协调。</p></div></>;
}

export function SettingsDetails(props: SettingsDetailsProps): JSX.Element {
  const card = SETTINGS_CARDS.find((item) => item.id === props.page);
  return <section className="settings-details" aria-label={`${card?.title ?? ''}详情`}><DetailHeader page={props.page} onBack={props.onBack} onReset={props.onResetPage} />{props.error ? <p className="error-banner">{props.error}</p> : null}{props.page === 'chat' ? <ChatDetails {...props} /> : null}{props.page === 'personality' ? <PersonalityDetails {...props} /> : null}{props.page === 'presentation' ? <PresentationDetails {...props} /> : null}{props.page === 'live2d' ? <Live2DDetails {...props} /> : null}{props.page === 'composition' ? <CompositionDetails {...props} /> : null}{props.page === 'window' ? <WindowDetails {...props} /> : null}{props.page === 'service' ? <ServiceDetails {...props} /> : null}{props.page === 'data' ? <DataDetails {...props} /> : null}{props.page === 'debug' ? <DebugDetails {...props} /> : null}</section>;
}
