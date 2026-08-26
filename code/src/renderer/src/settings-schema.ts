export type SettingsPageId =
  | 'chat'
  | 'personality'
  | 'model'
  | 'voice'
  | 'service'
  | 'behavior';

/** The workbench keeps the complete settings catalog behind one lower-left entry. */
export type WorkbenchPage = SettingsPageId | 'settings' | null;

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

export interface WorkbenchNavigationItem {
  id: WorkbenchPage;
  label: string;
  description: string;
  icon: string;
  group: 'space' | 'settings';
}

export const WORKBENCH_NAVIGATION_ITEMS: readonly WorkbenchNavigationItem[] = [
  { id: null, label: '工作台总览', description: 'StarChat Agent', icon: '⌂', group: 'space' },
  ...SETTINGS_CARDS.map((card) => ({ id: card.id, label: card.title, description: card.description, icon: card.icon, group: 'settings' as const }))
];

export type WorkbenchCapabilityId = 'model' | 'voice' | 'resources' | 'tasks' | 'verification' | 'source' | 'chat' | 'terminal' | 'browser' | 'git-write';
export type WorkbenchCapabilityState = 'available' | 'limited' | 'disabled';
export type WorkbenchCapabilityTarget = Exclude<WorkbenchPage, null> | 'bottom';

export interface WorkbenchCapabilitySnapshot {
  id: WorkbenchCapabilityId;
  label: string;
  icon: string;
  description: string;
  state: WorkbenchCapabilityState;
  statusLabel: string;
  target?: WorkbenchCapabilityTarget;
}

export interface WorkbenchCapabilityContext {
  agentAvailable: boolean;
  activeTaskCount: number;
  hasModel: boolean;
  modelLabel?: string;
}

export function getWorkbenchCapabilities(context: WorkbenchCapabilityContext): readonly WorkbenchCapabilitySnapshot[] {
  const agentState: WorkbenchCapabilityState = context.agentAvailable ? 'available' : 'limited';
  const agentStatus = context.agentAvailable ? '已接入' : '等待 Agent';
  return [
    {
      id: 'model',
      label: '角色视觉',
      icon: '◌',
      description: context.hasModel ? context.modelLabel ?? 'Live2D runtime 已配置' : '尚未配置外部模型',
      state: context.hasModel ? 'available' : 'limited',
      statusLabel: context.hasModel ? '已配置' : '未配置',
      target: 'model'
    },
    {
      id: 'voice',
      label: '语音表现',
      icon: '♫',
      description: 'CosyVoice 预设、自定义音色与播放',
      state: 'available',
      statusLabel: '已接入',
      target: 'voice'
    },
    {
      id: 'resources',
      label: '工作区资源',
      icon: '▱',
      description: '文件与源码只读 · 列目录、读取文本、受控搜索',
      state: agentState,
      statusLabel: agentStatus
    },
    {
      id: 'tasks',
      label: '任务管理',
      icon: '◇',
      description: context.activeTaskCount > 0 ? `${context.activeTaskCount} 个活动任务 · 可在底栏查看` : '暂无活动任务 · 可在底栏查看',
      state: agentState,
      statusLabel: context.agentAvailable ? `${context.activeTaskCount} 个活动任务` : agentStatus,
      target: 'bottom'
    },
    {
      id: 'verification',
      label: '受控验证',
      icon: '✓',
      description: '仅允许 test、typecheck、build、verify:live2d 白名单',
      state: agentState,
      statusLabel: agentStatus
    },
    {
      id: 'source',
      label: '源码状态',
      icon: '⌘',
      description: 'Git status / diff 只读，不提供写入入口',
      state: agentState,
      statusLabel: agentStatus
    },
    {
      id: 'chat',
      label: '侧边对话',
      icon: '◉',
      description: '通过左侧陪伴对话入口使用现有安全路由',
      state: 'available',
      statusLabel: '已接入',
      target: 'chat'
    },
    {
      id: 'terminal',
      label: '任意终端',
      icon: '›_',
      description: '安全策略未启用 Shell 或任意命令执行',
      state: 'disabled',
      statusLabel: '未启用'
    },
    {
      id: 'browser',
      label: '浏览器',
      icon: '◎',
      description: '安全策略未启用浏览器控制或网页操作',
      state: 'disabled',
      statusLabel: '未启用'
    },
    {
      id: 'git-write',
      label: 'Git 写入',
      icon: '↯',
      description: '未启用 commit、push 或其他 Git 写操作',
      state: 'disabled',
      statusLabel: '未启用'
    }
  ];
}
