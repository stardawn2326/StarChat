import { copyFileSync, cpSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

const APP_OWNED_FILES = Object.freeze([
  'settings.json',
  'secrets.json',
  'live2d-adapter.json',
  'roles.json',
  'companion-state.json',
  'workbench-window-state.json',
  'voice-profiles.json',
  'agent-tasks.json',
  'live2d-models.json'
]);

const APP_OWNED_DIRECTORIES = Object.freeze(['voices']);

export function migrateLegacyStarChatData(currentUserData: string, legacyUserDataCandidates: readonly string[]): string[] {
  const current = resolve(currentUserData);
  const copied = new Set<string>();
  for (const candidate of legacyUserDataCandidates) {
    const legacy = resolve(candidate);
    if (legacy === current || !existsSync(legacy) || !statSync(legacy).isDirectory()) continue;
    mkdirSync(current, { recursive: true });
    for (const fileName of APP_OWNED_FILES) {
      const source = join(legacy, fileName);
      const destination = join(current, fileName);
      if (!existsSync(source) || existsSync(destination) || !statSync(source).isFile()) continue;
      copyFileSync(source, destination);
      copied.add(fileName);
    }
    for (const directoryName of APP_OWNED_DIRECTORIES) {
      const source = join(legacy, directoryName);
      const destination = join(current, directoryName);
      if (!existsSync(source) || existsSync(destination) || !statSync(source).isDirectory()) continue;
      cpSync(source, destination, { recursive: true, errorOnExist: true });
      copied.add(basename(destination));
    }
  }
  return [...copied];
}
