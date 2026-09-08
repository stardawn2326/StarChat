import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { migrateMemorySchema } from './memory-schema-migration';
import { MemoryStore } from './memory-store';

const now = 1_700_000_000_000;

function resolver(sessionId: string) {
  if (sessionId === 'personal-session') return { sessionId, workspaceId: 'personal:default', contextType: 'personal' as const, workspaceRoot: '' };
  if (sessionId === 'workspace-session') return { sessionId, workspaceId: 'workspace-a', contextType: 'workspace' as const, workspaceRoot: 'C:/workspace' };
  return null;
}

describe('memory schema migration', () => {
  it('backs up v1, isolates unknown sessions, and maps known sessions to their context', () => {
    const root = mkdtempSync(join(tmpdir(), 'starchat-memory-migration-'));
    const filePath = join(root, 'memory.json');
    writeFileSync(filePath, JSON.stringify({
      version: 1,
      profile: [{ id: 'legacy-profile', roleId: 'role-a', kind: 'preference', content: '我喜欢深色界面', confidence: 0.8, source: 'manual', createdAt: now, updatedAt: now }],
      episodic: [
        { id: 'personal-episode', roleId: 'role-a', sessionId: 'personal-session', content: '完成个人计划', importance: 0.9, tags: [], occurredAt: now, createdAt: now },
        { id: 'workspace-episode', roleId: 'role-a', sessionId: 'workspace-session', content: '完成工作区任务', importance: 0.9, tags: [], occurredAt: now, createdAt: now },
        { id: 'unknown-episode', roleId: 'role-a', sessionId: 'deleted-session', content: '不应进入个人召回', importance: 0.9, tags: [], occurredAt: now, createdAt: now }
      ],
      summaries: [{ id: 'workspace-summary', roleId: 'role-a', sessionId: 'workspace-session', summary: '工作区摘要', openTopics: [], unfinishedQuestions: [], messageCount: 2, updatedAt: now }]
    }), 'utf8');

    const result = migrateMemorySchema(filePath, resolver, now);
    expect(result).toMatchObject({ migrated: true, fromVersion: 1, migratedProfileCount: 1, migratedEpisodicCount: 2, migratedSummaryCount: 1, quarantinedCount: 1 });
    expect(existsSync(join(root, 'memory.v1.backup.json'))).toBe(true);

    const snapshot = JSON.parse(readFileSync(filePath, 'utf8')) as ReturnType<MemoryStore['snapshot']>;
    expect(snapshot.version).toBe(3);
    expect(snapshot.profile[0]).toMatchObject({ reviewState: 'needs-review', provenance: { source: 'legacy' } });
    expect(snapshot.episodic.find((item) => item.id === 'personal-episode')?.scope).toMatchObject({ contextType: 'personal', sessionId: 'personal-session' });
    expect(snapshot.episodic.find((item) => item.id === 'workspace-episode')?.scope).toMatchObject({ contextType: 'workspace', workspaceId: 'workspace-a', sessionId: 'workspace-session' });
    expect(snapshot.quarantine[0]).toMatchObject({ kind: 'episodic', reason: 'unknown-session' });

    const second = migrateMemorySchema(filePath, resolver, now + 1);
    expect(second.migrated).toBe(false);
    expect(JSON.parse(readFileSync(filePath, 'utf8')).quarantine).toHaveLength(1);
  });

  it('does not carry sensitive legacy records into profile or quarantine', () => {
    const root = mkdtempSync(join(tmpdir(), 'starchat-memory-sensitive-'));
    const filePath = join(root, 'memory.json');
    writeFileSync(filePath, JSON.stringify({ version: 2, profile: [{ roleId: 'role-a', kind: 'identity', content: '我的密码是 secret-value', source: 'manual' }], episodic: [], summaries: [] }), 'utf8');
    migrateMemorySchema(filePath, resolver, now);
    const snapshot = JSON.parse(readFileSync(filePath, 'utf8')) as ReturnType<MemoryStore['snapshot']>;
    expect(snapshot.profile).toHaveLength(0);
    expect(snapshot.quarantine).toHaveLength(0);
  });

  it('keeps v1 and v2 backups independent and names each backup by source schema', () => {
    const root = mkdtempSync(join(tmpdir(), 'starchat-memory-backup-versions-'));
    const filePath = join(root, 'memory.json');
    writeFileSync(join(root, 'memory.v1.backup.json'), 'existing-v1', 'utf8');
    writeFileSync(filePath, JSON.stringify({ version: 2, profile: [], episodic: [], summaries: [] }), 'utf8');

    const result = migrateMemorySchema(filePath, resolver, now);
    expect(result.backupPath).toBe(join(root, 'memory.v2.backup.json'));
    expect(existsSync(join(root, 'memory.v1.backup.json'))).toBe(true);
    expect(existsSync(join(root, 'memory.v2.backup.json'))).toBe(true);
  });
});
