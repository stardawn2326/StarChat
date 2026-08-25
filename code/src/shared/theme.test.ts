import { describe, expect, it } from 'vitest';
import {
  DEFAULT_THEME_PREFERENCE,
  THEME_PREFERENCES,
  THEME_TOKEN_KEYS,
  THEME_TOKENS,
  applyThemeToDocument,
  resolveThemePreference,
  sanitizeThemePreference,
  themeCssVariables,
  type ThemePreference
} from './theme';

describe('theme contract', () => {
  it('uses follow-system as the default and rejects unknown preferences', () => {
    expect(DEFAULT_THEME_PREFERENCE).toBe('system');
    expect(THEME_PREFERENCES).toEqual(['system', 'light', 'dark']);
    expect(sanitizeThemePreference(undefined)).toBe('system');
    expect(sanitizeThemePreference('unknown')).toBe('system');
    expect(sanitizeThemePreference('light')).toBe('light');
    expect(sanitizeThemePreference('dark')).toBe('dark');
  });

  it('resolves system preference from the current OS appearance', () => {
    expect(resolveThemePreference('system', false)).toBe('light');
    expect(resolveThemePreference('system', true)).toBe('dark');
    expect(resolveThemePreference('light', true)).toBe('light');
    expect(resolveThemePreference('dark', false)).toBe('dark');
  });

  it('keeps every light and dark token complete and serializable', () => {
    expect(Object.keys(THEME_TOKENS.light)).toEqual(THEME_TOKEN_KEYS);
    expect(Object.keys(THEME_TOKENS.dark)).toEqual(THEME_TOKEN_KEYS);
    expect(Object.keys(themeCssVariables('light'))).toEqual(THEME_TOKEN_KEYS);
    expect(Object.keys(themeCssVariables('dark'))).toEqual(THEME_TOKEN_KEYS);
    for (const key of THEME_TOKEN_KEYS) {
      expect(THEME_TOKENS.light[key]).toMatch(/^.+$/);
      expect(THEME_TOKENS.dark[key]).toMatch(/^.+$/);
    }
  });

  it('applies the resolved theme to both document roots without touching pet transparency', () => {
    const root = { dataset: {} as Record<string, string>, style: { setProperty: () => undefined } };
    const body = { dataset: {} as Record<string, string> };
    const documentLike = { documentElement: root, body };
    const resolved = applyThemeToDocument(documentLike, 'system' satisfies ThemePreference, true);
    expect(resolved).toBe('dark');
    expect(root.dataset.theme).toBe('dark');
    expect(root.dataset.themePreference).toBe('system');
    expect(body.dataset.theme).toBe('dark');
    expect(body.dataset.window).toBeUndefined();
  });
});
