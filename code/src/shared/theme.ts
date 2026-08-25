export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = Exclude<ThemePreference, 'system'>;

export const THEME_PREFERENCES = ['system', 'light', 'dark'] as const satisfies readonly ThemePreference[];
export const DEFAULT_THEME_PREFERENCE: ThemePreference = 'system';

export const THEME_TOKEN_KEYS = [
  '--theme-window-bg',
  '--theme-window-gradient',
  '--theme-window-glow',
  '--theme-overlay',
  '--theme-titlebar-surface',
  '--theme-titlebar-border',
  '--theme-text',
  '--theme-heading',
  '--theme-muted',
  '--theme-subtle',
  '--theme-surface',
  '--theme-surface-hover',
  '--theme-surface-selected',
  '--theme-surface-strong',
  '--theme-control-surface',
  '--theme-control-hover',
  '--theme-menu-surface',
  '--theme-menu-border',
  '--theme-border',
  '--theme-border-strong',
  '--theme-shadow',
  '--theme-accent',
  '--theme-accent-strong',
  '--theme-accent-soft',
  '--theme-focus',
  '--theme-danger',
  '--theme-danger-soft',
  '--theme-disabled',
  '--theme-scrollbar-thumb',
  '--theme-scrollbar-track'
] as const;

export type ThemeTokenKey = (typeof THEME_TOKEN_KEYS)[number];
export type ThemeTokenSet = Record<ThemeTokenKey, string>;

export const THEME_TOKENS: Record<ResolvedTheme, ThemeTokenSet> = {
  light: {
    '--theme-window-bg': '#eaf2f8',
    '--theme-window-gradient': 'radial-gradient(720px circle at 88% 4%, rgba(146, 204, 239, .42), transparent 62%), radial-gradient(620px circle at 4% 84%, rgba(190, 217, 239, .54), transparent 64%), linear-gradient(145deg, #f1f7fb, #dfeaf3 72%)',
    '--theme-window-glow': 'rgba(112, 177, 214, .18)',
    '--theme-overlay': 'rgba(54, 99, 129, .2)',
    '--theme-titlebar-surface': 'rgba(246, 251, 255, .82)',
    '--theme-titlebar-border': 'rgba(111, 163, 196, .34)',
    '--theme-text': '#20384d',
    '--theme-heading': '#15334d',
    '--theme-muted': '#5c7488',
    '--theme-subtle': '#7890a1',
    '--theme-surface': 'rgba(248, 252, 255, .66)',
    '--theme-surface-hover': 'rgba(255, 255, 255, .82)',
    '--theme-surface-selected': 'rgba(179, 222, 246, .52)',
    '--theme-surface-strong': 'rgba(250, 253, 255, .88)',
    '--theme-control-surface': 'rgba(250, 253, 255, .72)',
    '--theme-control-hover': 'rgba(255, 255, 255, .9)',
    '--theme-menu-surface': 'rgba(247, 252, 255, .98)',
    '--theme-menu-border': 'rgba(92, 151, 190, .44)',
    '--theme-border': 'rgba(105, 161, 198, .3)',
    '--theme-border-strong': 'rgba(80, 143, 186, .56)',
    '--theme-shadow': 'rgba(43, 91, 124, .2)',
    '--theme-accent': '#317ea8',
    '--theme-accent-strong': '#176487',
    '--theme-accent-soft': 'rgba(89, 172, 215, .2)',
    '--theme-focus': '#267ca7',
    '--theme-danger': '#b4495f',
    '--theme-danger-soft': 'rgba(190, 76, 99, .14)',
    '--theme-disabled': 'rgba(71, 98, 117, .38)',
    '--theme-scrollbar-thumb': 'rgba(74, 135, 171, .54)',
    '--theme-scrollbar-track': 'rgba(145, 184, 207, .2)'
  },
  dark: {
    '--theme-window-bg': '#060a13',
    '--theme-window-gradient': 'radial-gradient(680px circle at 88% 6%, rgba(124, 156, 196, .24), transparent 62%), radial-gradient(620px circle at 6% 82%, rgba(51, 81, 122, .28), transparent 64%), radial-gradient(420px circle at 52% 42%, rgba(228, 184, 99, .07), transparent 70%), #060a13',
    '--theme-window-glow': 'rgba(124, 156, 196, .12)',
    '--theme-overlay': 'rgba(1, 5, 14, .62)',
    '--theme-titlebar-surface': 'rgba(10, 18, 31, .72)',
    '--theme-titlebar-border': 'rgba(255, 255, 255, .11)',
    '--theme-text': '#f4f7fb',
    '--theme-heading': '#f7f9fc',
    '--theme-muted': 'rgba(232, 239, 248, .68)',
    '--theme-subtle': 'rgba(232, 239, 248, .42)',
    '--theme-surface': 'rgba(255, 255, 255, .065)',
    '--theme-surface-hover': 'rgba(255, 255, 255, .1)',
    '--theme-surface-selected': 'rgba(124, 156, 196, .2)',
    '--theme-surface-strong': 'rgba(255, 255, 255, .1)',
    '--theme-control-surface': 'rgba(255, 255, 255, .055)',
    '--theme-control-hover': 'rgba(255, 255, 255, .09)',
    '--theme-menu-surface': '#0b1322',
    '--theme-menu-border': 'rgba(255, 255, 255, .18)',
    '--theme-border': 'rgba(255, 255, 255, .14)',
    '--theme-border-strong': 'rgba(124, 156, 196, .52)',
    '--theme-shadow': 'rgba(3, 7, 18, .5)',
    '--theme-accent': '#7c9cc4',
    '--theme-accent-strong': '#b8cce2',
    '--theme-accent-soft': 'rgba(124, 156, 196, .2)',
    '--theme-focus': '#e4b863',
    '--theme-danger': '#ffd8dd',
    '--theme-danger-soft': 'rgba(120, 40, 54, .26)',
    '--theme-disabled': 'rgba(232, 239, 248, .38)',
    '--theme-scrollbar-thumb': 'rgba(124, 156, 196, .58)',
    '--theme-scrollbar-track': 'rgba(255, 255, 255, .08)'
  }
};

export function sanitizeThemePreference(value: unknown): ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system' ? value : DEFAULT_THEME_PREFERENCE;
}

export function resolveThemePreference(preference: unknown, systemDark: boolean): ResolvedTheme {
  const normalized = sanitizeThemePreference(preference);
  return normalized === 'system' ? (systemDark ? 'dark' : 'light') : normalized;
}

export function themeCssVariables(theme: ResolvedTheme): ThemeTokenSet {
  return { ...THEME_TOKENS[theme] };
}

interface ThemeDocumentLike {
  documentElement: { dataset: { [name: string]: string | undefined }; style: { setProperty(name: string, value: string): void } };
  body: { dataset: { [name: string]: string | undefined } };
}

export function applyThemeToDocument(documentLike: ThemeDocumentLike, preference: unknown, systemDark: boolean): ResolvedTheme {
  const normalized = sanitizeThemePreference(preference);
  const resolved = resolveThemePreference(normalized, systemDark);
  documentLike.documentElement.dataset.theme = resolved;
  documentLike.documentElement.dataset.themePreference = normalized;
  documentLike.body.dataset.theme = resolved;
  documentLike.body.dataset.themePreference = normalized;
  for (const [name, value] of Object.entries(themeCssVariables(resolved))) {
    documentLike.documentElement.style.setProperty(name, value);
  }
  return resolved;
}
