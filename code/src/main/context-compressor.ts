import type { AgentModelMessage, AgentToolCall } from '../shared/agent';
import { isSensitiveWorkspacePath } from './agent-security';

export interface CompressedTaskContext {
  goal: string;
  repoSummary?: string;
  files: Array<{ path: string; summary: string }>;
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

function changePaths(call: AgentToolCall, args: Record<string, unknown>, context: CompressedTaskContext): void {
  if (call.name === 'apply_file_changes' && Array.isArray(args.changes)) {
    for (const item of args.changes) {
      if (!item || typeof item !== 'object') continue;
      const change = item as { path?: unknown; type?: unknown };
      const path = safeRelativePath(change.path);
      if (!path) continue;
      const operation = change.type === 'create' || change.type === 'delete' || change.type === 'update' ? change.type : 'update';
      addFile(context, path, `${call.name} ${operation}`);
      addUnique(context.pendingChanges, `${operation}: ${path}`);
    }
    return;
  }
  if (call.name === 'apply_patch' && typeof args.patch === 'string') {
    for (const line of args.patch.split(/\r?\n/u)) {
      const match = /^\*\*\* (?:Update|Add|Delete) File:\s*(.+)$/u.exec(line);
      if (!match) continue;
      const path = safeRelativePath(match[1]);
      if (!path) continue;
      const operation = line.startsWith('*** Add File:') ? 'create' : line.startsWith('*** Delete File:') ? 'delete' : 'update';
      addFile(context, path, `${call.name} ${operation}`);
      addUnique(context.pendingChanges, `${operation}: ${path}`);
    }
  }
}

function recordToolCall(context: CompressedTaskContext, call: AgentToolCall): void {
  const args = parseArguments(call);
  if (!args) {
    addUnique(context.findings, `${call.name}: 工具参数不是有效 JSON`);
    return;
  }
  addFile(context, args.path, `${call.name} 访问路径`);
  changePaths(call, args, context);
  if (call.name === 'run_verification' && typeof args.script === 'string') addUnique(context.verification, `${args.script}: requested`);
}

function recordToolResult(context: CompressedTaskContext, message: AgentModelMessage): void {
  if (message.role !== 'tool') return;
  const content = boundedText(message.content, 4_000);
  if (!content) return;
  if (/^工具执行错误：|失败|错误|超时|拒绝|不可/u.test(content)) {
    addUnique(context.findings, content, MAX_ITEMS_PER_SECTION);
  }
  if (content.includes('用户拒绝')) addUnique(context.decisions, content);
  try {
    const parsed: unknown = JSON.parse(message.content);
    if (parsed && typeof parsed === 'object') {
      const result = parsed as { script?: unknown; ok?: unknown; output?: unknown };
      if (typeof result.script === 'string' && typeof result.ok === 'boolean') {
        addUnique(context.verification, `${result.script}: ${result.ok ? 'passed' : 'failed'}${typeof result.output === 'string' ? `; ${boundedText(result.output, 1_500)}` : ''}`);
      }
    }
  } catch {
    // Tool output is intentionally not copied into the compressed context.
  }
}

export function buildCompressedTaskContext(input: ContextCompressionInput): CompressedTaskContext {
  const firstUser = input.messages.find((message) => message.role === 'user' && !message.toolCallId);
  const context: CompressedTaskContext = {
    goal: boundedText(firstUser?.content, MAX_GOAL_CHARS),
    ...(input.repositoryContext ? { repoSummary: boundedText(input.repositoryContext, MAX_REPO_SUMMARY_CHARS) } : {}),
    files: [],
    findings: [],
    decisions: [],
    pendingChanges: [],
    verification: [],
    constraints: []
  };
  for (const constraint of input.constraints ?? []) addUnique(context.constraints, constraint);
  for (const message of input.messages) {
    if (message.role === 'assistant') {
      for (const call of message.toolCalls ?? []) recordToolCall(context, call);
    }
    recordToolResult(context, message);
  }
  return context;
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
