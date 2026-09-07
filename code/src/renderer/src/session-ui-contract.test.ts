import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');
const source = (path: string): string => readFileSync(resolve(root, path), 'utf8');

describe('persistent workspace and session UI contract', () => {
  it('exposes structured workspace and session operations through preload and main IPC', () => {
    const preload = source('preload/index.ts');
    const main = source('main/index.ts');
    for (const operation of ['snapshot', 'chooseWorkspace', 'selectWorkspace', 'create', 'select', 'rename', 'delete']) {
      expect(preload).toContain(`${operation}:`);
    }
    for (const channel of ['sessions:snapshot', 'sessions:choose-workspace', 'sessions:select-workspace', 'sessions:create', 'sessions:select', 'sessions:rename', 'sessions:delete']) {
      expect(main).toContain(`'${channel}'`);
    }
  });

  it('renders real workspace/session collections and keeps rename/delete keyboard operable', () => {
    const workbench = source('renderer/src/AgentWorkbench.tsx');
    expect(workbench).toContain('workspaces.map');
    expect(workbench).toContain('sessions.filter');
    expect(workbench).toContain('label="重命名会话"');
    expect(workbench).toContain('label="删除会话"');
    expect(workbench).toContain('onChooseWorkspace');
  });

  it('hydrates conversation messages from the selected session and blocks sending without a workspace', () => {
    const app = source('renderer/src/App.tsx');
    const chat = source('renderer/src/CompanionChat.tsx');
    expect(app).toContain('window.starchat.sessions.snapshot()');
    expect(app).toContain('task.sessionId === activeSession?.id');
    expect(chat).toContain('initialMessages');
    expect(chat).toContain('sessionId');
    expect(chat).toContain('workspaceAvailable');
    expect(chat).toContain('请先选择工作区');
  });
});
