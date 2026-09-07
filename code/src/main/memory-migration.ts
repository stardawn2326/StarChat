import type { ProfileMemoryKind } from '../shared/memory';
import { MemoryStore } from './memory-store';
import { SettingsStore } from './settings-store';

function legacyKind(content: string): ProfileMemoryKind {
  if (/^我(?:叫|的名字是)/u.test(content)) return 'name';
  if (/^我的(?:朋友|家人|同事|伴侣)/u.test(content)) return 'person';
  if (/^我(?:喜欢|偏好|爱)/u.test(content)) return 'preference';
  if (/^我(?:习惯|通常|一般会)/u.test(content)) return 'habit';
  if (/^我的(?:项目|工作|计划|目标)/u.test(content)) return 'project';
  if (/^我(?:不喜欢|讨厌|不希望|不要)/u.test(content)) return 'boundary';
  return 'identity';
}

export function migrateLegacyCompanionMemories(settingsStore: SettingsStore, memoryStore: MemoryStore): number {
  if (!settingsStore.readSettings().longTermMemoryEnabled) return 0;
  let migrated = 0;
  for (const role of settingsStore.readRolePackages()) {
    const state = settingsStore.readCompanionState(role.id);
    if (state.memories.length === 0) continue;
    for (const memory of state.memories) {
      try {
        memoryStore.saveProfile({
          id: `migrated-${role.id}-${memory.id}`,
          roleId: role.id,
          kind: legacyKind(memory.content),
          content: memory.content,
          confidence: 0.7,
          source: 'manual',
          createdAt: memory.createdAt,
          updatedAt: memory.createdAt
        });
        migrated += 1;
      } catch {
        // Sensitive or malformed legacy memories are deliberately discarded.
      }
    }
    settingsStore.saveCompanionState({ ...state, memories: [] });
  }
  return migrated;
}
