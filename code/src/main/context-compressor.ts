import type { AgentFileChangeOperation, AgentModelMessage, AgentToolCall } from '../shared/agent';
import { isSensitiveWorkspacePath } from './agent-security';

export interface ToolLifecycleFact {
  toolCallId: string;
  toolName: string;
  state: 'requested' | 'completed' | 'failed' | 'rejected';
  changes: Array<{ path: string; operation: AgentFileChangeOperation }>;
}

export interface CompressedTaskContext {
  goal: string;
  repoSummary?: string;
  files: Array<{ path: string; summary: string }>;
  toolLifecycle: ToolLifecycleFact[];
  findings: string[];
  decisions: string[];
  pendingChanges: string[];
  verification: string[];
  constraints: string[];
}

export interface ContextCompressionOptions {
  messageThreshold?: number;
  toolOutputByteThreshold?: number;
  maxSummaryChars?: number;
}

export interface ContextCompressionInput {
  messages: AgentModelMessage[];
  repositoryContext?: string;
  constraints?: string[];
  previousContext?: CompressedTaskContext;
}

export interface ContextCompressionResult {
  compacted: boolean;
  messages: AgentModelMessage[];
  context: CompressedTaskContext;
}

export const DEFAULT_CONTEXT_COMPRESSION_OPTIONS: Readonly<{ messageThreshold: number; toolOutputByteThreshold: number; maxSummaryChars: number }> = Object.freeze({
  messageThreshold: 8,
  toolOutputByteThreshold: 24 * 1024,
  maxSummaryChars: 16_000
});

const MAX_GOAL_CHARS = 6_000;
const MAX_ITEM_CHARS = 2_000;
const MAX_FILES = 60;
const MAX_ITEMS_PER_SECTION = 40;
const MAX_CONSTRAINT_ITEMS = 20;
const MAX_TOOL_LIFECYCLE_ITEMS = 40;
const MAX_REPO_SUMMARY_CHARS = 6_000;
const TEXT_ENCODER = new TextEncoder();

function redact(value: string): string {
  return value
    .replace(/sk-[A-Za-z0-9_-]{12,}/gu, '[REDACTED_API_KEY]')
    .replace(/(bearer\s+)[^\s,;]+/giu, '$1[REDACTED]')
    .replace(/((?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|passwd|secret|private[_-]?key|authorization|token)\s*[:=]\s*)[^\s,;]+/giu, '$1[REDACTED]');
}

function boundedText(value: unknown, maximum = MAX_ITEM_CHARS): string {
  return typeof value === 'string' ? redact(value.trim()).slice(0, maximum) : '';
}

function safeRelativePath(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const candidate = value.trim().replaceAll('\\', '/');
  if (!candidate || candidate.startsWith('/') || candidate.startsWith('//') || /^[A-Za-z]:/u.test(candidate)) return null;
  if (candidate.split('/').some((part) => part === '..') || isSensitiveWorkspacePath(candidate)) return null;
  return candidate;
}

function addUnique(items: string[], value: string, maximum = MAX_ITEMS_PER_SECTION): void {
  const next = boundedText(value);
  if (next && !items.includes(next) && items.length < maximum) items.push(next);
}

function parseArguments(call: AgentToolCall): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(call.arguments || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function addFile(context: CompressedTaskContext, path: unknown, summary: string): void {
  const safePath = safeRelativePath(path);
  if (!safePath || context.files.some((file) => file.path === safePath) || context.files.length >= MAX_FILES) return;
  context.files.push({ path: safePath, summary: boundedText(summary, 500) || '工具访问的文件' });
}

function addChange(changes: Array<{ path: string; operation: AgentFileChangeOperation }>, path: unknown, operation: AgentFileChangeOperation): void {
  const safePath = safeRelativePath(path);
  if (!safePath || changes.some((change) => change.path === safePath && change.operation === operation)) return;
  changes.push({ path: safePath, operation });
}

function changesForCall(call: AgentToolCall, args: Record<string, unknown>): Array<{ path: string; operation: AgentFileChangeOperation }> {
  const changes: Array<{ path: string; operation: AgentFileChangeOperation }> = [];
  if (call.name === 'apply_file_changes' && Array.isArray(args.changes)) {
    for (const item of args.changes) {
      if (!item || typeof item !== 'object') continue;
      const change = item as { path?: unknown; type?: unknown };
      const operation = change.type === 'create' || change.type === 'delete' || change.type === 'update' ? change.type : 'update';
      addChange(changes, change.path, operation);
    }
    return changes;
  }
  if (call.name === 'apply_patch' && typeof args.patch === 'string') {
    for (const line of args.patch.split(/\r?\n/u)) {
      const match = /^\*\*\* (?:Update|Add|Delete) File:\s*(.+)$/u.exec(line);
      if (!match) continue;
      const operation = line.startsWith('*** Add File:') ? 'create' : line.startsWith('*** Delete File:') ? 'delete' : 'update';
      addChange(changes, match[1], operation);
    }
  }
  return changes;
}

function recordToolCall(context: CompressedTaskContext, call: AgentToolCall): void {
  const args = parseArguments(call);
  if (!args) {
    addUnique(context.findings, `${call.name}: 工具参数不是有效 JSON`);
    return;
  }
  addFile(context, args.path, `${call.name} 访问路径`);
  for (const change of changesForCall(call, args)) addFile(context, change.path, `${call.name} ${change.operation}`);
  if (call.name === 'run_verification' && typeof args.script === 'string') addUnique(context.verification, `${args.script}: requested`);
}

function recordToolResult(context: CompressedTaskContext, message: AgentModelMessage): void {
  if (message.role !== 'tool') return;
  const content = boundedText(message.content, 4_000);
  if (!content) return;
  let parsed: Record<string, unknown> | null = null;
  try {
    const value: unknown = JSON.parse(message.content);
    if (value && typeof value === 'object' && !Array.isArray(value)) parsed = value as Record<string, unknown>;
  } catch {
    // Tool output is intentionally not copied into the compressed context.
  }
  if (typeof parsed?.userInput === 'string') {
    addUnique(context.constraints, `User clarification: ${boundedText(parsed.userInput, MAX_ITEM_CHARS)}`, MAX_CONSTRAINT_ITEMS);
    return;
  }
  if (content.startsWith('用户拒绝了这次精确计划')) {
    addUnique(context.decisions, content);
  } else if (content.startsWith('工具执行错误：')) {
    addUnique(context.findings, content, MAX_ITEMS_PER_SECTION);
  }
  if (parsed) {
    const result = parsed as { script?: unknown; ok?: unknown; output?: unknown };
    if (typeof result.script === 'string' && typeof result.ok === 'boolean') {
      addUnique(context.verification, `${result.script}: ${result.ok ? 'passed' : 'failed'}${typeof result.output === 'string' ? `; ${boundedText(result.output, 1_500)}` : ''}`);
    }
  }
}

function lifecycleState(message: AgentModelMessage | undefined): ToolLifecycleFact['state'] {
  if (!message) return 'requested';
  const content = boundedText(message.content, 4_000);
  if (content.startsWith('用户拒绝了这次精确计划')) return 'rejected';
  if (content.startsWith('工具执行错误：')) return 'failed';
  return 'completed';
}

function recordWriteLifecycle(context: CompressedTaskContext, call: AgentToolCall, result: AgentModelMessage | undefined): void {
  const args = parseArguments(call);
  if (!args) return;
  const changes = changesForCall(call, args);
  if (changes.length === 0) return;
  const state = lifecycleState(result);
  context.toolLifecycle.push({ toolCallId: call.id, toolName: call.name, state, changes });
  for (const change of changes) {
    if (state === 'requested') addUnique(context.pendingChanges, `${change.operation}: ${change.path}`);
    if (state === 'completed') addUnique(context.decisions, `applied ${change.operation}: ${change.path}`);
    if (state === 'failed') addUnique(context.findings, `failed ${change.operation}: ${change.path}${result ? `; ${boundedText(result.content, 1_500)}` : ''}`);
    if (state === 'rejected') addUnique(context.decisions, `user rejected ${change.operation}: ${change.path}`);
  }
}

function mergeRecentItems(previous: readonly string[], current: readonly string[], maximum: number, priority: (value: string) => boolean = () => false): string[] {
  const merged: string[] = [];
  for (const value of [...previous, ...current]) {
    const next = boundedText(value);
    if (!next) continue;
    const existing = merged.indexOf(next);
    if (existing >= 0) merged.splice(existing, 1);
    merged.push(next);
  }
  if (merged.length <= maximum) return merged;
  const prioritized = merged.filter(priority);
  const ordinary = merged.filter((value) => !priority(value));
  const selectedPrioritized = prioritized.slice(-maximum);
  const remaining = Math.max(0, maximum - selectedPrioritized.length);
  return [...selectedPrioritized, ...ordinary.slice(-remaining)];
}

function mergeFiles(previous: CompressedTaskContext | undefined, current: CompressedTaskContext): Array<{ path: string; summary: string }> {
  const files = new Map<string, { path: string; summary: string }>();
  for (const file of [...(previous?.files ?? []), ...current.files]) {
    const path = safeRelativePath(file.path);
    if (!path) continue;
    files.set(path, { path, summary: boundedText(file.summary, 500) || '工具访问的文件' });
  }
  return [...files.values()].slice(-MAX_FILES);
}

function mergeLifecycle(previous: readonly ToolLifecycleFact[], current: readonly ToolLifecycleFact[]): ToolLifecycleFact[] {
  const facts = new Map<string, ToolLifecycleFact>();
  for (const fact of [...previous, ...current]) {
    if (!fact || typeof fact.toolCallId !== 'string' || typeof fact.toolName !== 'string') continue;
    const changes = fact.changes
      .map((change) => {
        const path = safeRelativePath(change.path);
        if (!path || !['create', 'update', 'delete'].includes(change.operation)) return null;
        return { path, operation: change.operation };
      })
      .filter((change): change is { path: string; operation: AgentFileChangeOperation } => Boolean(change));
    const next: ToolLifecycleFact = { toolCallId: fact.toolCallId, toolName: boundedText(fact.toolName, 100), state: fact.state, changes };
    const existing = facts.get(next.toolCallId);
    if (!existing || existing.state === 'requested' || next.state !== 'requested') facts.set(next.toolCallId, next);
  }
  const values = [...facts.values()];
  if (values.length <= MAX_TOOL_LIFECYCLE_ITEMS) return values;
  const requested = values.filter((fact) => fact.state === 'requested');
  const remaining = Math.max(0, MAX_TOOL_LIFECYCLE_ITEMS - requested.length);
  const recent = values.filter((fact) => fact.state !== 'requested').slice(-remaining);
  return [...requested.slice(-MAX_TOOL_LIFECYCLE_ITEMS), ...recent].slice(-MAX_TOOL_LIFECYCLE_ITEMS);
}

function pendingFromLifecycle(facts: readonly ToolLifecycleFact[]): string[] {
  const pending: string[] = [];
  for (const fact of facts) {
    if (fact.state !== 'requested') continue;
    for (const change of fact.changes) addUnique(pending, `${change.operation}: ${change.path}`);
  }
  return pending;
}

export function mergeCompressedTaskContext(previous: CompressedTaskContext | undefined, current: CompressedTaskContext): CompressedTaskContext {
  const toolLifecycle = mergeLifecycle(previous?.toolLifecycle ?? [], current.toolLifecycle);
  const repoSummary = current.repoSummary || previous?.repoSummary;
  const goal = boundedText(previous?.goal || current.goal, MAX_GOAL_CHARS);
  return {
    goal,
    ...(repoSummary ? { repoSummary: boundedText(repoSummary, MAX_REPO_SUMMARY_CHARS) } : {}),
    files: mergeFiles(previous, current),
    toolLifecycle,
    findings: mergeRecentItems(previous?.findings ?? [], current.findings, MAX_ITEMS_PER_SECTION, (value) => /工具执行错误|failed|失败|error|错误|timeout|超时/iu.test(value)),
    decisions: mergeRecentItems(previous?.decisions ?? [], current.decisions, MAX_ITEMS_PER_SECTION),
    pendingChanges: pendingFromLifecycle(toolLifecycle),
    verification: mergeRecentItems(previous?.verification ?? [], current.verification, MAX_ITEMS_PER_SECTION, (value) => /failed|失败|error|错误|timeout|超时/iu.test(value)),
    constraints: mergeRecentItems(previous?.constraints ?? [], current.constraints, MAX_CONSTRAINT_ITEMS)
  };
}

export function buildCompressedTaskContext(input: ContextCompressionInput): CompressedTaskContext {
  const firstUser = input.messages.find((message) => message.role === 'user' && !message.toolCallId);
  const context: CompressedTaskContext = {
    goal: boundedText(firstUser?.content, MAX_GOAL_CHARS),
    ...(input.repositoryContext ? { repoSummary: boundedText(input.repositoryContext, MAX_REPO_SUMMARY_CHARS) } : {}),
    files: [],
    toolLifecycle: [],
    findings: [],
    decisions: [],
    pendingChanges: [],
    verification: [],
    constraints: []
  };
  for (const constraint of input.constraints ?? []) addUnique(context.constraints, constraint, MAX_CONSTRAINT_ITEMS);
  const calls = new Map<string, AgentToolCall>();
  const results = new Map<string, AgentModelMessage>();
  for (const message of input.messages) {
    if (message.role === 'assistant') {
      for (const call of message.toolCalls ?? []) {
        recordToolCall(context, call);
        calls.set(call.id, call);
      }
    }
    recordToolResult(context, message);
    if (message.role === 'tool' && message.toolCallId) results.set(message.toolCallId, message);
  }
  for (const call of calls.values()) {
    if (call.name === 'apply_patch' || call.name === 'apply_file_changes') recordWriteLifecycle(context, call, results.get(call.id));
  }
  return mergeCompressedTaskContext(input.previousContext, context);
}

function section(lines: string[], title: string, values: readonly string[]): void {
  if (values.length === 0) return;
  lines.push(`${title}:`, ...values.slice(0, MAX_ITEMS_PER_SECTION).map((value) => `- ${value}`));
}

export function formatCompressedTaskContext(context: CompressedTaskContext, maximum = DEFAULT_CONTEXT_COMPRESSION_OPTIONS.maxSummaryChars): string {
  const lines = ['[受控任务上下文摘要]', `Goal: ${boundedText(context.goal, MAX_GOAL_CHARS) || '未提供'}`];
  if (context.repoSummary) lines.push('Repository:', boundedText(context.repoSummary, MAX_REPO_SUMMARY_CHARS));
  section(lines, 'Constraints', context.constraints);
  section(lines, 'Files', context.files.map((file) => `${file.path} — ${file.summary}`));
  section(lines, 'Tool lifecycle', context.toolLifecycle.map((fact) => `${fact.toolCallId} ${fact.toolName}: ${fact.state}${fact.changes.length > 0 ? `; ${fact.changes.map((change) => `${change.operation}: ${change.path}`).join(', ')}` : ''}`));
  section(lines, 'Findings and errors', context.findings);
  section(lines, 'Decisions', context.decisions);
  section(lines, 'Pending changes', context.pendingChanges);
  section(lines, 'Verification', context.verification);
  let output = lines.join('\n');
  if (output.length > maximum) output = `${output.slice(0, Math.max(0, maximum - 32))}\n[摘要达到长度上限]`;
  return output;
}

function toolOutputBytes(messages: readonly AgentModelMessage[]): number {
  return messages.filter((message) => message.role === 'tool').reduce((total, message) => total + TEXT_ENCODER.encode(message.content).byteLength, 0);
}

function boundedThreshold(value: number | undefined, fallback: number, maximum: number): number {
  return Math.max(1, Math.min(maximum, Math.floor(value ?? fallback)));
}

export function compressMessages(input: ContextCompressionInput, options: ContextCompressionOptions = {}): ContextCompressionResult {
  const context = buildCompressedTaskContext(input);
  const messageThreshold = boundedThreshold(options.messageThreshold, DEFAULT_CONTEXT_COMPRESSION_OPTIONS.messageThreshold, 64);
  const outputThreshold = boundedThreshold(options.toolOutputByteThreshold, DEFAULT_CONTEXT_COMPRESSION_OPTIONS.toolOutputByteThreshold, 512 * 1024);
  const maxSummaryChars = boundedThreshold(options.maxSummaryChars, DEFAULT_CONTEXT_COMPRESSION_OPTIONS.maxSummaryChars, 64 * 1024);
  const shouldCompact = input.messages.length >= messageThreshold || toolOutputBytes(input.messages) >= outputThreshold;
  if (!shouldCompact) return { compacted: false, messages: input.messages.map((message) => ({ ...message })), context };

  const baseSystem = input.messages.find((message) => message.role === 'system');
  const initialUser = input.messages.find((message) => message.role === 'user' && !message.toolCallId);
  const messages: AgentModelMessage[] = [
    baseSystem ? { ...baseSystem } : { role: 'system', content: '你是 StarChat 的后台 Agent。' },
    { role: 'system', content: formatCompressedTaskContext(context, maxSummaryChars) },
    ...(initialUser ? [{ ...initialUser, content: boundedText(initialUser.content, MAX_GOAL_CHARS) }] : [])
  ];
  return { compacted: true, messages, context };
}
