import type { AgentTaskStatus } from './agent';
import type { AgentTaskMetrics } from './agent-metrics';
import type { RepoMapEntry } from './repo-map';

export type TaskContextStatus = 'running' | 'waiting-approval' | 'waiting-input' | 'interrupted' | 'completed' | 'failed';
export type TaskPlanStatus = 'pending' | 'in-progress' | 'completed' | 'blocked';
export type TaskFindingType = 'project' | 'file' | 'test' | 'risk' | 'decision';
export type PendingChangeOperation = 'create' | 'update' | 'delete';
export type VerificationResult = 'passed' | 'failed' | 'skipped' | 'waiting';

export interface TaskPlanItem {
  id: string;
  text: string;
  status: TaskPlanStatus;
}

export interface FileReadRecord {
  path: string;
  readAt: number;
  hash?: string;
}

export interface TaskFinding {
  id: string;
  type: TaskFindingType;
  summary: string;
  sourcePath?: string;
  createdAt: number;
}

export interface PendingChange {
  id: string;
  operation: PendingChangeOperation;
  path: string;
  summary: string;
  contentHash?: string;
  createdAt: number;
}

export interface VerificationRecord {
  id: string;
  type: string;
  command: string;
  result: VerificationResult;
  exitCode?: number | null;
  summary: string;
  createdAt: number;
}

export interface TaskContextFailure {
  summary: string;
  createdAt: number;
}

export interface TaskContextApproval {
  summary: string;
  createdAt: number;
}

/**
 * A persisted, path-relative repository projection.
 * Runtime RepoMap keeps absolute roots; TaskContext must not persist them.
 */
export interface TaskRepoSummary {
  projectType: string;
  packageManager?: string;
  projectRootRelative?: string;
  sourceRoots: string[];
  testRoots: string[];
  configFiles: string[];
  importantFiles: RepoMapEntry[];
  languageStats: Record<string, number>;
  partial?: boolean;
  unavailable?: boolean;
  warnings?: string[];
}

export interface TaskContext {
  taskId: string;
  workspaceId: string;
  userRequest: string;
  plan: TaskPlanItem[];
  filesRead: FileReadRecord[];
  findings: TaskFinding[];
  pendingChanges: PendingChange[];
  verification: VerificationRecord[];
  metrics: AgentTaskMetrics;
  status: TaskContextStatus;
  createdAt: number;
  updatedAt: number;
  repoMap?: TaskRepoSummary;
  latestFailure?: TaskContextFailure;
  pendingApproval?: TaskContextApproval;
  userConstraints?: string[];
}

export function taskContextStatusFromAgentStatus(status: AgentTaskStatus): TaskContextStatus {
  switch (status) {
    case 'waiting_for_approval': return 'waiting-approval';
    case 'waiting_for_input': return 'waiting-input';
    case 'interrupted': return 'interrupted';
    case 'completed': return 'completed';
    case 'failed':
    case 'timed_out':
    case 'cancelled': return 'failed';
    default: return 'running';
  }
}
