export type SettingsPageId =
  | 'chat'
  | 'personality'
  | 'presentation'
  | 'live2d'
  | 'composition'
  | 'window'
  | 'service'
  | 'data'
  | 'debug';

import type { PresentationSettings } from '../../shared/presentation-contract';

export interface SettingsCardDefinition {
  id: SettingsPageId;
  title: string;
  icon: string;
  description: string;
  summary: (context: { roleName: string; modelPath: string | null; tracking: boolean; alwaysOnTop: boolean; presentation: PresentationSettings }) => string;
}

export const SETTINGS_CARDS: readonly SettingsCardDefinition[] = [
  { id: 'chat', title: '陪伴对话', icon: '◉', description: '在线对话、关系成长、记忆与语音表现', summary: () => '人格快照 · 关系记忆 · TTS口型' },
  { id: 'personality', title: '人格与角色', icon: '✦', description: '角色包、称呼、性格和关系成长', summary: ({ roleName }) => `当前：${roleName}` },
  { id: 'presentation', title: '实时表现', icon: '◌', description: '情绪、动作、优先级与光标注视', summary: ({ tracking, presentation }) => `${presentation.bodyFollowStrength > 0 ? '全身跟随' : '全身跟随关闭'} · ${presentation.physicsEnabled ? '物理已启用' : '物理已关闭'} · ${tracking ? '光标追踪' : '追踪暂停'}` },
  { id: 'live2d', title: 'Live2D 模型', icon: '◈', description: '只读导入、水印、表情动作与状态', summary: ({ modelPath }) => modelPath ? '外部模型已配置' : '尚未配置外部模型' },
  { id: 'composition', title: '模型构图', icon: '▣', description: '截取视口、缩放、偏移和恢复', summary: ({ modelPath }) => modelPath ? '按模型独立保存构图' : '选择模型后可调整' },
  { id: 'window', title: '窗口与交互', icon: '⌘', description: '窗口位置、置顶、锁定和点击穿透', summary: ({ alwaysOnTop }) => alwaysOnTop ? '置顶 · 普通状态点击穿透' : '普通状态点击穿透' },
  { id: 'service', title: '在线服务', icon: '⇄', description: 'OpenAI-compatible 地址、模型与密钥边界', summary: () => '密钥由主进程安全保存' },
  { id: 'data', title: '数据与安全', icon: '◇', description: '人格导入导出、敏感设置和重置', summary: () => '角色包不包含 API Key' },
  { id: 'debug', title: '调试与关于', icon: '⌁', description: 'Cubism 指标、语义调试和许可说明', summary: () => '仅桌宠持有唯一 Cubism runtime' }
];
