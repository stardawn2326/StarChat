import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { MemoryService } from './memory-service';
import { MemoryStore } from './memory-store';

function createMemoryTestService(enabled: boolean | (() => boolean) = true) {
  const directory = mkdtempSync(join(tmpdir(), 'starchat-memory-'));
  const store = new MemoryStore(join(directory, 'memory.json'));
  let now = 1_700_000_000_000;
  const service = new MemoryService({ store, enabled, now: () => now });
  return { directory, store, service, advance: (amount: number) => { now += amount; } };
}

describe('companion memory service', () => {
  it('persists explicit safe profile facts and periodic conversation summaries', () => {
    const { directory, store, service } = createMemoryTestService();
    const messages = Array.from({ length: 20 }, (_, index) => ({
      role: index % 2 === 0 ? 'user' as const : 'assistant' as const,
      content: index === 0 ? '我喜欢简洁的深色界面。' : `消息 ${index}`
    }));

    const summary = service.recordConversation('role-a', 'session-a', messages);

    expect(summary?.messageCount).toBe(20);
    expect(store.listProfile('role-a')).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'preference', content: '我喜欢简洁的深色界面' })
    ]));
    const reloaded = new MemoryStore(join(directory, 'memory.json'));
    expect(reloaded.getSummary('session-a')).toMatchObject({ messageCount: 20 });
  });

  it('rejects sensitive facts and low-importance episodes', () => {
    const { service } = createMemoryTestService();
    expect(() => service.rememberProfile({ roleId: 'role-a', kind: 'identity', content: '我的 API key 是 sk-123456789012345' })).toThrow(/敏感/);
    expect(service.rememberEpisode({ roleId: 'role-a', sessionId: 'session-a', content: '普通闲聊', importance: 0.4 })).toBeNull();
    expect(service.rememberEpisode({ roleId: 'role-a', sessionId: 'session-a', content: '完成了重要发布', importance: 0.9 })).toMatchObject({ importance: 0.9 });
  });

  it('returns structured retrieval bounded to three through eight items', () => {
    const { store, service } = createMemoryTestService();
    for (let index = 0; index < 10; index += 1) {
      store.saveProfile({ roleId: 'role-a', kind: 'project', content: `我的项目进度 ${index}`, confidence: 0.8, source: 'manual', createdAt: index + 1, updatedAt: index + 1 });
    }
    const result = service.retrieve({ roleId: 'role-a', query: '项目', limit: 99 });
    expect(result.items).toHaveLength(8);
    expect(result.profile).toHaveLength(8);
  });

  it('does not retrieve or write memories when disabled', () => {
    const { store, service } = createMemoryTestService(false);
    expect(service.contextFor({ roleId: 'role-a', query: '项目' })).toContain('已关闭');
    expect(service.recordConversation('role-a', 'session-a', [{ role: 'user', content: '我喜欢测试' }, { role: 'assistant', content: '记住了' }])).toBeNull();
    expect(store.snapshot().profile).toHaveLength(0);
  });
});
