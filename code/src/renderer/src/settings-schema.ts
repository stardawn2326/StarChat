export type SettingsPageId =
  | 'chat'
  | 'personality'
  | 'model'
  | 'voice'
  | 'service'
  | 'behavior';

import type { PresentationSettings } from '../../shared/presentation-contract';

export interface SettingsCardDefinition {
  id: SettingsPageId;
  title: string;
  icon: string;
  description: string;
  summary: (context: { roleName: string; modelPath: string | null; tracking: boolean; alwaysOnTop: boolean; presentation: PresentationSettings }) => string;
}

export const SETTINGS_CARDS: readonly SettingsCardDefinition[] = [
  { id: 'chat', title: '陪伴对话', icon: '◉', description: '和白音对话，查看关系成长与记忆状态', summary: () => '实时对话 · 关系记忆 · 语音回应' },
  { id: 'personality', title: '人格与记忆', icon: '✦', description: '角色包、称呼、性格和关系阶段', summary: ({ roleName }) => `当前角色：${roleName}` },
  { id: 'model', title: '角色模型', icon: '◈', description: '导入、切换和适配外部 Live2D 模型', summary: ({ modelPath }) => modelPath ? '模型已配置 · 可一键适配' : '尚未配置外部模型' },
  { id: 'voice', title: '语音', icon: '◌', description: 'CosyVoice 预设、自定义音色与播放', summary: () => 'CosyVoice · 自定义音色' },
  { id: 'service', title: '服务与连接', icon: '⇄', description: '对话 API、模型、密钥和连接状态', summary: () => '密钥隔离 · 可测试连接' },
  { id: 'behavior', title: '应用行为', icon: '⌘', description: '桌宠显示、交互、光标跟随与闲置活动', summary: ({ tracking, alwaysOnTop }) => `${alwaysOnTop ? '始终置顶' : '普通窗口'} · ${tracking ? '光标跟随' : '跟随关闭'}` }
];
