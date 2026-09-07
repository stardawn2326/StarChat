export type AgentMode = 'auto' | 'companion' | 'agent';
export type AgentRoute = 'companion' | 'agent';
export type AgentTaskStatus =
  | 'queued'
  | 'running'
  | 'waiting_for_approval'
  | 'waiting_for_input'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'timed_out'
  | 'interrupted';

export const AGENT_MODE_OPTIONS: ReadonlyArray<{ value: AgentMode; label: string; description: string }> = [
  { value: 'auto', label: '自动判断', description: '普通对话陪伴；文件、项目、搜索、测试、构建和修改交给 Agent。' },
  { value: 'companion', label: '纯陪伴', description: '只进行角色对话，不调用后台工具。' },
  { value: 'agent', label: 'Agent', description: '明确作为后台任务执行，并在写入前请求许可。' }
];

export const AGENT_TASK_STATUSES: readonly AgentTaskStatus[] = [
  'queued', 'running', 'waiting_for_approval', 'waiting_for_input',
  'completed', 'failed', 'cancelled', 'timed_out', 'interrupted'
];

export function isAgentMode(value: unknown): value is AgentMode {
  return value === 'auto' || value === 'companion' || value === 'agent';
}

export function isAgentTaskStatus(value: unknown): value is AgentTaskStatus {
  return typeof value === 'string' && (AGENT_TASK_STATUSES as readonly string[]).includes(value);
}

export interface AgentRouteDecision {
  route: AgentRoute;
  method: 'forced' | 'deterministic' | 'classifier' | 'safe-fallback';
  ruleId?: string;
  explain: string;
}

export interface AgentStartRequest {
  message: string;
  mode?: AgentMode;
  sessionId?: string;
}

export function sanitizeAgentStartRequest(input: unknown): AgentStartRequest {
  if (!input || typeof input !== 'object') throw new Error('Agent 请求格式无效');
  const source = input as Partial<AgentStartRequest>;
  const message = typeof source.message === 'string' ? source.message.trim() : '';
  if (!message) throw new Error('Agent 消息不能为空');
  if (message.length > 20_000) throw new Error('Agent 消息过长');
  if (source.mode !== undefined && !isAgentMode(source.mode)) throw new Error('Agent 模式无效');
  const sessionId = typeof source.sessionId === 'string' ? source.sessionId.trim().slice(0, 100) : '';
  return { message, ...(source.mode ? { mode: source.mode } : {}), ...(sessionId ? { sessionId } : {}) };
}

export interface AgentStep {
  id: string;
  taskId: string;
  index: number;
  kind: 'route' | 'model' | 'tool' | 'approval' | 'input' | 'verification' | 'result';
  status: 'started' | 'completed' | 'waiting' | 'failed';
  summary: string;
  createdAt: number;
  finishedAt?: number;
  invocationId?: string;
}

export interface AgentChangePreview {
  files: string[];
  patch: string;
  additions: number;
  deletions: number;
}

export interface ToolInvocation {
  id: string;
  taskId: string;
  name: string;
  arguments: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'waiting_for_approval' | 'waiting_for_input' | 'cancelled';
  createdAt: number;
  finishedAt?: number;
  summary?: string;
}

export interface ApprovalRequest {
  id: string;
  taskId: string;
  invocationId: string;
  toolName: string;
  target: string;
  plan: string;
  preview?: AgentChangePreview;
  createdAt: number;
}

export interface InputRequest {
  id: string;
  taskId: string;
  invocationId: string;
  prompt: string;
  createdAt: number;
}

export interface AgentResult {
  summary: string;
  route: AgentRouteDecision;
  changedFiles?: string[];
  verification?: { script: string; ok: boolean; output?: string };
}

export interface AgentTask {
  id: string;
  sessionId: string;
  roleId: string;
  message: string;
  mode: AgentMode;
  route: AgentRouteDecision;
  status: AgentTaskStatus;
  createdAt: number;
  updatedAt: number;
  currentStep: number;
  resumedFromTaskId?: string;
  steps: AgentStep[];
  invocations?: ToolInvocation[];
  approval?: ApprovalRequest;
  input?: InputRequest;
  result?: AgentResult;
  error?: string;
}

export interface AgentToolDescriptor {
  name: string;
  description: string;
  schema: Record<string, unknown>;
}

export interface AgentToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface AgentModelMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCallId?: string;
  toolCalls?: AgentToolCall[];
}

export type AgentModelResponse =
  | { type: 'final'; content: string }
  | { type: 'tool_calls'; content?: string; calls: AgentToolCall[] };

export interface AgentEventBase {
  taskId: string;
  timestamp: number;
}

export type AgentEvent =
  | (AgentEventBase & { type: 'task'; task: AgentTask })
  | (AgentEventBase & { type: 'step'; step: AgentStep })
  | (AgentEventBase & { type: 'approval'; request: ApprovalRequest })
  | (AgentEventBase & { type: 'input'; request: InputRequest })
  | (AgentEventBase & { type: 'complete'; result: AgentResult })
  | (AgentEventBase & { type: 'error'; message: string });

export interface AgentStartResponse {
  taskId: string;
  route: AgentRouteDecision;
}
