import { describe, expect, it } from 'vitest';
import { routeTurn } from './agent-router';

describe('white-tone turn router', () => {
  it('never sends ordinary companionship to tools in auto mode', async () => {
    const decision = await routeTurn({ mode: 'auto', message: '今天心情有点低落，陪我聊聊吧' });
    expect(decision.route).toBe('companion');
    expect(decision.explain).toMatch(/陪伴|闲聊/);
    expect(decision.method).toBe('deterministic');
    await expect(routeTurn({ mode: 'auto', message: '我今天写代码写累了，陪我聊聊梦想吧' })).resolves.toMatchObject({ route: 'companion', method: 'deterministic' });
  });

  it('routes explicit workspace and verification work to Agent', async () => {
    for (const message of ['读取 src/main/index.ts', '搜索项目里的 TODO', '运行测试并修复失败', '测试项目']) {
      const decision = await routeTurn({ mode: 'auto', message });
      expect(decision.route, message).toBe('agent');
      expect(decision.method).toBe('deterministic');
    }
  });

  it('honors explicit mode even when the text looks like the other route', async () => {
    await expect(routeTurn({ mode: 'companion', message: '请修改项目文件' })).resolves.toMatchObject({ route: 'companion', method: 'forced' });
    await expect(routeTurn({ mode: 'agent', message: '你今天好吗' })).resolves.toMatchObject({ route: 'agent', method: 'forced' });
  });

  it('uses the classifier only for ambiguity and fails safe when it fails or returns nonsense', async () => {
    const classifier = async (): Promise<'agent' | 'companion'> => 'agent';
    await expect(routeTurn({ mode: 'auto', message: '帮我处理一下', classifyAmbiguous: classifier })).resolves.toMatchObject({ route: 'agent', method: 'classifier' });
    await expect(routeTurn({ mode: 'auto', message: '帮我处理一下', classifyAmbiguous: async () => { throw new Error('offline'); } })).resolves.toMatchObject({ route: 'companion', method: 'safe-fallback' });
    await expect(routeTurn({ mode: 'auto', message: '帮我处理一下', classifyAmbiguous: async () => 'unknown' as never })).resolves.toMatchObject({ route: 'companion', method: 'safe-fallback' });
  });
});
