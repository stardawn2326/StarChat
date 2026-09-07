export type SettingsPageId =
  | 'general'
  | 'appearance'
  | 'shortcuts'
  | 'chat'
  | 'personality'
  | 'model'
  | 'voice'
  | 'service'
  | 'behavior'
  | 'agent'
  | 'permissions'
  | 'terminal'
  | 'browser'
  | 'git';

/** The workbench keeps the complete settings catalog behind one lower-left entry. */
export type WorkbenchPage = SettingsPageId | 'settings' | null;

import type { PresentationSettings } from '../../shared/presentation-contract';
import type { WorkspaceTrustState } from '../../shared/session';

export interface SettingsCardDefinition {
  id: SettingsPageId;
  title: string;
  icon: string;
  description: string;
  group?: 'personal' | 'character' | 'agent' | 'integration';
  summary: (context: { roleName: string; modelPath: string | null; tracking: boolean; alwaysOnTop: boolean; presentation: PresentationSettings }) => string;
}

export const SETTINGS_CARDS: readonly SettingsCardDefinition[] = [
  { id: 'general', title: '常规', icon: '⌘', group: 'personal', description: '应用、桌宠窗口和默认行为', summary: ({ alwaysOnTop }) => alwaysOnTop ? '桌宠始终置顶' : '普通窗口' },
  { id: 'appearance', title: '外观', icon: '☼', group: 'personal', description: '主题、透明度和界面表现', summary: () => '浅色、深色或跟随系统' },
  { id: 'shortcuts', title: '键盘快捷键', icon: '⌨', group: 'personal', description: '工作台与桌宠快捷键', summary: () => '本地全局快捷键' },
  { id: 'chat', title: '陪伴对话', icon: '◉', group: 'character', description: '和当前角色对话，查看关系成长与记忆状态', summary: () => '实时对话 · 关系记忆 · 语音回应' },
  { id: 'personality', title: '人格与记忆', icon: '✦', group: 'character', description: '角色包、称呼、性格和关系阶段', summary: ({ roleName }) => `当前角色：${roleName}` },
  { id: 'model', title: 'Live2D 模型', icon: '◈', group: 'character', description: '导入、切换和适配外部 Live2D 模型', summary: ({ modelPath }) => modelPath ? '模型已配置 · 可一键适配' : '尚未配置外部模型' },
  { id: 'voice', title: '语音', icon: '◌', group: 'character', description: 'CosyVoice 预设、自定义音色与播放', summary: () => 'CosyVoice · 自定义音色' },
  { id: 'service', title: '模型与服务', icon: '⇄', group: 'agent', description: '对话 API、模型、密钥和连接状态', summary: () => '密钥隔离 · 可测试连接' },
  { id: 'agent', title: 'Agent', icon: '◇', group: 'agent', description: '任务模式、状态和工具闭环', summary: () => '任务、步骤、审批与结果' },
  { id: 'permissions', title: '权限', icon: '✓', group: 'agent', description: '工作区边界、写入审批与隐私', summary: () => '最小权限 · 写入前审批' },
  { id: 'terminal', title: '终端', icon: '›_', group: 'integration', description: '受控真实命令与验证脚本', summary: () => 'Git 只读 · 项目验证' },
  { id: 'browser', title: '浏览器', icon: '◎', group: 'integration', description: '安全打开 http/https 网页', summary: () => '系统浏览器隔离' },
  { id: 'git', title: 'Git', icon: '⌘', group: 'integration', description: '状态、差异与已暂存提交', summary: () => '已暂存提交 · 需工作区信任' },
  { id: 'behavior', title: '高级行为', icon: '⌘', group: 'personal', description: '桌宠交互、光标跟随与闲置活动', summary: ({ tracking }) => tracking ? '光标跟随已开启' : '光标跟随已关闭' }
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
  workspaceTrust?: WorkspaceTrustState;
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
      description: '真实子进程 · Git 只读与项目验证白名单',
      state: 'available',
      statusLabel: '受控可用',
      target: 'terminal'
    },
    {
      id: 'browser',
      label: '浏览器',
      icon: '◎',
      description: '仅 http/https · 使用系统浏览器隔离打开',
      state: 'available',
      statusLabel: '受控可用',
      target: 'browser'
    },
    {
      id: 'git-write',
      label: 'Git 写入',
      icon: '↯',
      description: context.workspaceTrust === 'trusted-execution'
        ? '仅提交用户已暂存的变更；提交可能执行 Git Hooks，不自动暂存、不自动推送'
        : '需 trusted-execution；只提交用户已暂存的变更，不自动暂存、不自动推送',
      state: context.workspaceTrust === 'trusted-execution' ? 'available' : 'limited',
      statusLabel: context.workspaceTrust === 'trusted-execution' ? '可提交已暂存内容' : '需信任'
    }
  ];
}
