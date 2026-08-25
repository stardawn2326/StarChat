import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const directory = dirname(fileURLToPath(import.meta.url));
const component = readFileSync(resolve(directory, 'SettingsDetailsV2.tsx'), 'utf8');
const stylesheet = readFileSync(resolve(directory, 'settings-center.css'), 'utf8');

describe('role selector overlay contract', () => {
  it('hides the role action bar while the role selector is expanded', () => {
    expect(component).toContain('className="detail-section role-management-section"');
    const ruleStart = stylesheet.indexOf('body[data-window="settings"] .role-management-section:has(.glass-select.is-open) .toolbar');
    expect(ruleStart).toBeGreaterThanOrEqual(0);
    const rule = stylesheet.slice(ruleStart, stylesheet.indexOf('}', ruleStart) + 1);
    expect(rule).toContain('visibility: hidden');
    expect(rule).toContain('pointer-events: none');
  });

  it('uses an opaque menu surface so the action bar cannot show through it', () => {
    const ruleStart = stylesheet.indexOf('body[data-window="settings"] .glass-select-menu {');
    expect(ruleStart).toBeGreaterThanOrEqual(0);
    const rule = stylesheet.slice(ruleStart, stylesheet.indexOf('}', ruleStart) + 1);
    expect(rule).toContain('background: #0b1322;');
    expect(rule).not.toContain('background: rgba(');
  });
});
