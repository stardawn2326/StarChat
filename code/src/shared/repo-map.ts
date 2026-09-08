export type RepoMapEntryKind = 'source' | 'test' | 'config' | 'manifest' | 'doc';

export interface RepoMapEntry {
  path: string;
  kind: RepoMapEntryKind;
  size: number;
}

export interface RepoMapLimits {
  maxDepth: number;
  maxEntries: number;
  timeoutMs: number;
}

export interface RepoMap {
  workspaceId: string;
  workspaceRoot: string;
  projectRoot: string;
  projectType: string;
  packageManager?: string;
  sourceRoots: string[];
  testRoots: string[];
  configFiles: string[];
  importantFiles: RepoMapEntry[];
  languageStats: Record<string, number>;
  generatedAt: number;
  partial?: boolean;
  unavailable?: boolean;
  warnings?: string[];
  limits?: RepoMapLimits;
}
