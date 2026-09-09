export type ChangeSetState =
  | 'draft'
  | 'waiting-approval'
  | 'approved'
  | 'applied'
  | 'rejected'
  | 'invalidated';

export interface ChangeSetEntry {
  path: string;
  operation: 'create' | 'update' | 'delete';
  beforeHash: string | null;
  afterHash: string | null;
  diffHash: string;
  additions: number;
  deletions: number;
}

export interface ChangeSet {
  id: string;
  taskId: string;
  workspaceId: string;
  invocationId: string;
  entries: ChangeSetEntry[];
  state: ChangeSetState;
  createdAt: number;
  updatedAt: number;
}

export const MAX_CHANGESET_ENTRIES = 50;
export const MAX_CHANGESET_PATH_CHARS = 2_000;
export const MAX_CHANGESET_PATCH_BYTES = 512 * 1024;
