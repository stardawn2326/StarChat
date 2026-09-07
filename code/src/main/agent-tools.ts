import { spawn } from 'node:child_process';
import type { AgentTool } from './agent-runtime';
import { WorkspaceGuard } from './agent-security';

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

const VERIFICATION_SCRIPTS = new Set(['test', 'typecheck', 'build', 'verify:live2d']);

export function runVerification(
  root: string,
  script: string,
  signal: AbortSignal,
  executor: (command: string, args: string[], cwd: string, signal: AbortSignal) => Promise<{ code: number; output: string }> = spawnVerification
): Promise<VerificationResult> {
  if (!VERIFICATION_SCRIPTS.has(script)) throw new Error(`不允许运行脚本：${script}`);
  return executor(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', ['run', script], root, signal).then((result) => ({ script, ok: result.code === 0, output: cappedOutput(result.output) }));
}

function spawnVerification(command: string, args: string[], cwd: string, signal: AbortSignal): Promise<{ code: number; output: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, shell: false, windowsHide: true, signal });
    let output = '';
    child.stdout?.on('data', (chunk: Buffer) => { output += chunk.toString('utf8'); });
    child.stderr?.on('data', (chunk: Buffer) => { output += chunk.toString('utf8'); });
    child.once('error', reject);
    child.once('close', (code) => resolve({ code: code ?? 1, output }));
  });
}

function gitReadOnly(root: string, args: string[], signal: AbortSignal): Promise<string> {
  if (args.some((arg) => !['status', '--short', 'diff', '--stat', '--name-only'].includes(arg))) throw new Error('Git 工具参数不在只读白名单');
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, { cwd: root, shell: false, windowsHide: true, signal });
    let output = '';
    child.stdout?.on('data', (chunk: Buffer) => { output += chunk.toString('utf8'); });
    child.stderr?.on('data', (chunk: Buffer) => { output += chunk.toString('utf8'); });
    child.once('error', reject);
    child.once('close', (code) => code === 0 ? resolve(cappedOutput(output)) : reject(new Error(cappedOutput(output) || `Git 只读检查失败（${code ?? 1}）`)));
  });
}

export function createAgentTools(guard: WorkspaceGuard, executeVerification?: typeof runVerification): AgentTool[] {
  return [
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
      name: 'apply_patch', description: '预览并在用户批准精确计划后应用受控补丁。', schema: { type: 'object', required: ['patch'], properties: { patch: { type: 'string', maxLength: 512000 } }, additionalProperties: false },
      requiresApproval: true,
      approval: (input) => {
        const patch = stringArg(record(input).patch, 'patch', 512 * 1024);
        const preview = guard.previewPatch(patch);
        return {
          target: preview.files.join(', '),
          plan: preview.summary,
          preview: { files: preview.files, patch, ...patchLineCounts(patch) }
        };
      },
      run: async (input) => guard.previewPatch(stringArg(record(input).patch, 'patch', 512 * 1024)),
      runApproved: async (input) => { const patch = stringArg(record(input).patch, 'patch', 512 * 1024); return guard.applyApprovedPatch(patch, patch); }
    } as AgentTool & { runApproved: (input: unknown, context: import('./agent-runtime').AgentToolContext) => Promise<unknown> },
    {
      name: 'run_verification', description: '运行白名单中的项目测试、类型检查或构建脚本。', schema: { type: 'object', required: ['script'], properties: { script: { type: 'string', enum: [...VERIFICATION_SCRIPTS] } }, additionalProperties: false },
      run: async (input, context) => { const script = stringArg(record(input).script, 'script', 80); return (executeVerification ?? runVerification)(guard.root, script, context.signal); }
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
}
