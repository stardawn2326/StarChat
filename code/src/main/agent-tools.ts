import type { AgentTool, AgentToolContext } from './agent-runtime';
import { WorkspaceGuard } from './agent-security';
import { runGitReadOnly } from './git-runner';
import { verificationCommand, isVerificationScript } from './project-detector';
import { runControlledProcess } from './process-runner';
import { WORKSPACE_SEARCH_MODES, WorkspaceSearch, type WorkspaceSearchMode } from './workspace-search';
import { ChangeSetManager } from './change-set';

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('工具参数必须是对象');
  return value as Record<string, unknown>;
}

function stringArg(value: unknown, name: string, max = 2000): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > max) throw new Error(`${name} 参数无效`);
  return value;
}

function cappedOutput(value: string): string {
  return value.slice(0, 32 * 1024);
}

function patchLineCounts(patch: string): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;
  for (const line of patch.split(/\r?\n/u)) {
    if (line.startsWith('+') && !line.startsWith('+++')) additions += 1;
    if (line.startsWith('-') && !line.startsWith('---')) deletions += 1;
  }
  return { additions, deletions };
}

export interface VerificationResult {
  script: string;
  ok: boolean;
  output: string;
}

const VERIFICATION_SCRIPTS = ['test', 'typecheck', 'build', 'verify:live2d'] as const;

export function runVerification(
  root: string,
  script: string,
  signal: AbortSignal,
  executor: (command: string, args: string[], cwd: string, signal: AbortSignal) => Promise<{ code: number; output: string }> = spawnVerification
): Promise<VerificationResult> {
  if (!isVerificationScript(script)) throw new Error(`不允许运行脚本：${script}`);
  const command = executor === spawnVerification
    ? verificationCommand(root, script)
    : { command: process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', args: ['run', script], cwd: root };
  return executor(command.command, command.args, command.cwd, signal).then((result) => ({ script, ok: result.code === 0, output: cappedOutput(result.output) }));
}

function spawnVerification(command: string, args: string[], cwd: string, signal: AbortSignal): Promise<{ code: number; output: string }> {
  return runControlledProcess({ command, args, cwd, signal, timeoutMs: 5 * 60_000, maxOutputBytes: 128 * 1024, allowedCommands: [command] }).then((result) => ({ code: result.code, output: result.output }));
}

function gitReadOnly(root: string, args: string[], signal: AbortSignal): Promise<string> {
  return runGitReadOnly(root, args, signal).then((result) => {
    if (result.code !== 0) throw new Error(cappedOutput(result.output) || `Git 只读检查失败（${result.code}）`);
    return cappedOutput(result.output);
  });
}

export interface AgentToolOptions {
  beforeVerification?: (script: string) => void;
  beforeWrite?: (toolName: string, context: AgentToolContext) => void;
  changeSetManager?: ChangeSetManager;
  workspaceId?: string;
  allowWrite?: boolean;
  allowExecution?: boolean;
}

export function createAgentTools(guard: WorkspaceGuard, executeVerification: typeof runVerification = runVerification, options: AgentToolOptions = {}): AgentTool[] {
  const workspaceSearch = new WorkspaceSearch(guard);
  const readTools: AgentTool[] = [
    {
      name: 'list_directory', description: '列出授权工作区内的目录项。', schema: { type: 'object', properties: { path: { type: 'string' } }, additionalProperties: false },
      run: async (input) => guard.listDirectory(typeof input === 'object' && input ? (input as { path?: unknown }).path as string ?? '' : '')
    },
    {
      name: 'read_file', description: '读取授权工作区内受限大小的 UTF-8 文本文件。', schema: { type: 'object', required: ['path'], properties: { path: { type: 'string' } }, additionalProperties: false },
      run: async (input) => guard.readText(stringArg(record(input).path, 'path'))
    },
    {
      name: 'search_text', description: '在授权工作区内受控搜索文本。', schema: { type: 'object', required: ['query'], properties: { query: { type: 'string' }, path: { type: 'string' } }, additionalProperties: false },
      run: async (input) => { const args = record(input); return guard.searchText(stringArg(args.query, 'query', 500), typeof args.path === 'string' ? args.path : ''); }
    },
    {
      name: 'workspace_search', description: '在授权工作区内执行受限的文件名、文本或轻量符号搜索；不会调用 Shell。',
      schema: {
        type: 'object', required: ['mode', 'query'],
        properties: {
          mode: { type: 'string', enum: [...WORKSPACE_SEARCH_MODES] },
          query: { type: 'string', maxLength: 500 },
          path: { type: 'string', maxLength: 1024 },
          maxResults: { type: 'integer', minimum: 1, maximum: 200 },
          maxEntries: { type: 'integer', minimum: 1, maximum: 5000 },
          timeoutMs: { type: 'integer', minimum: 1, maximum: 10000 },
          maxDepth: { type: 'integer', minimum: 0, maximum: 16 }
        },
        additionalProperties: false
      },
      run: async (input) => {
        const args = record(input);
        const mode = args.mode;
        if (typeof mode !== 'string' || !WORKSPACE_SEARCH_MODES.includes(mode as WorkspaceSearchMode)) throw new Error('工作区搜索模式无效');
        return workspaceSearch.search({
          mode: mode as WorkspaceSearchMode,
          query: stringArg(args.query, 'query', 500),
          ...(typeof args.path === 'string' ? { path: args.path } : {}),
          ...(typeof args.maxResults === 'number' ? { maxResults: args.maxResults } : {}),
          ...(typeof args.maxEntries === 'number' ? { maxEntries: args.maxEntries } : {}),
          ...(typeof args.timeoutMs === 'number' ? { timeoutMs: args.timeoutMs } : {}),
          ...(typeof args.maxDepth === 'number' ? { maxDepth: args.maxDepth } : {})
        });
      }
    },
    {
      name: 'git_status', description: '只读查看当前授权工作区 Git 状态。', schema: { type: 'object', additionalProperties: false },
      run: async (_input, context) => gitReadOnly(guard.root, ['status', '--short'], context.signal)
    },
    {
      name: 'git_diff', description: '只读查看当前授权工作区 Git 差异摘要。', schema: { type: 'object', additionalProperties: false },
      run: async (_input, context) => gitReadOnly(guard.root, ['diff', '--stat', '--name-only'], context.signal)
    },
    {
      name: 'request_user_approval', description: '为当前精确计划请求用户批准。', schema: { type: 'object', required: ['target', 'plan'], properties: { target: { type: 'string' }, plan: { type: 'string' } }, additionalProperties: false },
      requiresApproval: true,
      approval: (input) => { const args = record(input); return { target: stringArg(args.target, 'target'), plan: stringArg(args.plan, 'plan', 20_000) }; },
      run: async () => ({ approved: true })
    },
    {
      name: 'request_user_input', description: '暂停后台任务并请求用户补充信息。', schema: { type: 'object', required: ['prompt'], properties: { prompt: { type: 'string' } }, additionalProperties: false },
      requestsInput: true,
      inputPrompt: (input) => stringArg(record(input).prompt, 'prompt', 10_000),
      run: async (input) => ({ userInput: input })
    }
  ];

  const writeTools: AgentTool[] = [
    {
      name: 'apply_patch', description: '预览并在用户批准精确计划后应用受控补丁。', schema: { type: 'object', required: ['patch'], properties: { patch: { type: 'string', maxLength: 512000 } }, additionalProperties: false },
      requiresApproval: true,
      approval: (input, context) => {
        const patch = stringArg(record(input).patch, 'patch', 512 * 1024);
        const created = context && options.changeSetManager
          ? options.changeSetManager.createPatch(guard, { taskId: context.taskId, workspaceId: options.workspaceId ?? guard.root, invocationId: context.invocationId }, patch)
          : null;
        const preview = created?.preview ?? guard.previewPatch(patch);
        if (context) {
          try {
            options.beforeWrite?.('apply_patch', context);
          } catch (error) {
            if (created) options.changeSetManager?.invalidate(created.changeSet.id);
            throw error;
          }
        }
        return {
          target: preview.files.join(', '),
          plan: preview.summary,
          preview: { ...preview, files: preview.files, patch, ...patchLineCounts(patch) }
        };
      },
      run: async (input) => guard.previewPatch(stringArg(record(input).patch, 'patch', 512 * 1024)),
      runApproved: async (input, context) => {
        const patch = stringArg(record(input).patch, 'patch', 512 * 1024);
        return options.changeSetManager
          ? options.changeSetManager.applyPatch(guard, { taskId: context.taskId, workspaceId: options.workspaceId ?? guard.root, invocationId: context.invocationId }, patch)
          : guard.applyApprovedPatch(patch, patch);
      }
    } as AgentTool & { runApproved: (input: unknown, context: import('./agent-runtime').AgentToolContext) => Promise<unknown> },
    {
      name: 'apply_file_changes', description: '预览创建、更新或删除文件的精确计划，并在用户批准后应用。', schema: { type: 'object', required: ['changes'], properties: { changes: { type: 'array', maxItems: 50, items: { type: 'object' } } }, additionalProperties: false },
      requiresApproval: true,
      approval: (input, context) => {
        const changes = record(input).changes;
        const created = context && options.changeSetManager
          ? options.changeSetManager.createFileChanges(guard, { taskId: context.taskId, workspaceId: options.workspaceId ?? guard.root, invocationId: context.invocationId }, changes)
          : null;
        const preview = created?.preview ?? guard.previewFileChanges(changes);
        if (context) {
          try {
            options.beforeWrite?.('apply_file_changes', context);
          } catch (error) {
            if (created) options.changeSetManager?.invalidate(created.changeSet.id);
            throw error;
          }
        }
        return { target: preview.files.join(', '), plan: preview.summary, preview };
      },
      run: async (input) => guard.previewFileChanges(record(input).changes),
      runApproved: async (input, context) => {
        const changes = record(input).changes;
        const plan = JSON.stringify(changes);
        return options.changeSetManager
          ? options.changeSetManager.applyFileChanges(guard, { taskId: context.taskId, workspaceId: options.workspaceId ?? guard.root, invocationId: context.invocationId }, changes)
          : guard.applyApprovedFileChanges(plan, plan);
      }
    } as AgentTool & { runApproved: (input: unknown, context: import('./agent-runtime').AgentToolContext) => Promise<unknown> }
  ];

  const executionTools: AgentTool[] = [
    {
      name: 'run_verification', description: '运行白名单中的项目测试、类型检查或构建脚本。', schema: { type: 'object', required: ['script'], properties: { script: { type: 'string', enum: [...VERIFICATION_SCRIPTS] } }, additionalProperties: false },
      run: async (input, context) => { const script = stringArg(record(input).script, 'script', 80); options.beforeVerification?.(script); return executeVerification(guard.root, script, context.signal); }
    }
  ];

  return [
    ...readTools,
    ...(options.allowWrite === false ? [] : writeTools),
    ...(options.allowExecution === false ? [] : executionTools)
  ];
}
