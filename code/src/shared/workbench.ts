export type WorkbenchInspectionKind = 'resources' | 'source';

export type WorkbenchGitStatus = 'clean' | 'changed' | 'detached' | 'unavailable';

export interface WorkbenchEnvironment {
  workspaceRoot: string;
  gitRoot: string | null;
  branch: string | null;
  head: string | null;
  gitStatus: WorkbenchGitStatus;
  changedFiles: number;
}

export interface WorkbenchResourceEntry {
  path: string;
  kind: 'file' | 'directory';
}

export interface WorkbenchSourceSnapshot {
  status: WorkbenchGitStatus;
  branch: string | null;
  head: string | null;
  changedFiles: string[];
  diffStat: string;
}

export interface WorkbenchInspection {
  kind: WorkbenchInspectionKind;
  environment: WorkbenchEnvironment;
  resources?: WorkbenchResourceEntry[];
  source?: WorkbenchSourceSnapshot;
}

export interface WorkbenchShareResult {
  ok: true;
  text: string;
}

export function workbenchGitStatusLabel(status: WorkbenchGitStatus): string {
  if (status === 'clean') return '工作树干净';
  if (status === 'changed') return '有未提交变更';
  if (status === 'detached') return '分离 HEAD';
  return 'Git 不可用';
}

export function workbenchSessionMeta(messageCount: number, active: boolean): string {
  if (active) return '进行中';
  if (messageCount <= 0) return '空会话';
  return `${messageCount} 条消息`;
}
