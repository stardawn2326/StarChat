import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { migrateLegacyStarChatData } from './brand-migration';

const roots: string[] = [];

function temporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'starchat-brand-migration-'));
  roots.push(root);
  return root;
}

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe('StarChat legacy product data migration', () => {
  it('copies only app-owned data and never copies an external Live2D model', () => {
    const root = temporaryRoot();
    const legacy = join(root, '白音 AI 助手');
    const current = join(root, 'StarChat');
    const externalModel = join(root, 'external-model');
    mkdirSync(join(legacy, 'voices'), { recursive: true });
    mkdirSync(externalModel, { recursive: true });
    writeFileSync(join(legacy, 'settings.json'), JSON.stringify({ live2dModelPath: join(externalModel, 'model3.json') }), 'utf8');
    writeFileSync(join(legacy, 'secrets.json'), JSON.stringify({ apiKey: 'preserved-locally' }), 'utf8');
    writeFileSync(join(legacy, 'voices', 'voice.wav'), 'voice', 'utf8');
    writeFileSync(join(externalModel, 'model3.json'), 'external', 'utf8');

    const copied = migrateLegacyStarChatData(current, [legacy]);

    expect(copied).toContain('settings.json');
    expect(copied).toContain('secrets.json');
    expect(copied).toContain('voices');
    expect(readFileSync(join(current, 'settings.json'), 'utf8')).toContain('external-model');
    expect(existsSync(join(current, 'external-model'))).toBe(false);
    expect(readFileSync(join(externalModel, 'model3.json'), 'utf8')).toBe('external');
  });

  it('does not overwrite current StarChat data', () => {
    const root = temporaryRoot();
    const legacy = join(root, '白音AI助手');
    const current = join(root, 'StarChat');
    mkdirSync(legacy, { recursive: true });
    mkdirSync(current, { recursive: true });
    writeFileSync(join(legacy, 'settings.json'), '{"source":"legacy"}', 'utf8');
    writeFileSync(join(current, 'settings.json'), '{"source":"current"}', 'utf8');

    expect(migrateLegacyStarChatData(current, [legacy])).not.toContain('settings.json');
    expect(readFileSync(join(current, 'settings.json'), 'utf8')).toBe('{"source":"current"}');
  });
});
