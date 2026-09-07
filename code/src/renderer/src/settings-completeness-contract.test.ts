import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = import.meta.dirname;
const schema = readFileSync(resolve(root, 'settings-schema.ts'), 'utf8');
const details = readFileSync(resolve(root, 'SettingsDetailsV2.tsx'), 'utf8');

describe('complete settings information architecture', () => {
  it('exposes the complete desktop and Agent settings taxonomy', () => {
    for (const id of ['general', 'appearance', 'shortcuts', 'personality', 'model', 'voice', 'service', 'agent', 'permissions', 'terminal', 'browser', 'git']) {
      expect(schema).toContain(`'${id}'`);
    }
  });

  it('renders real status pages for Agent tools instead of fake switches', () => {
    for (const component of ['GeneralDetails', 'AppearanceDetails', 'ShortcutsDetails', 'AgentDetails', 'PermissionsDetails', 'TerminalDetails', 'BrowserDetails', 'GitDetails']) {
      expect(details).toContain(`function ${component}`);
    }
    expect(details).toContain('data-settings-capability-status');
    expect(details).not.toContain('假开关');
  });
});
