/**
 * @module context/ThemeContext
 * @description Global dark/light theme provider. Persists preference in localStorage
 * and applies a `data-theme` attribute to <html> so CSS variables in index.html
 * automatically switch palette. Components call `useTheme()` for token access.
 */
import React, { createContext, useContext, useEffect, useState } from 'react';

export type Theme = 'dark' | 'light';

export interface ThemeTokens {
  bgPrimary: string;
  bgSecondary: string;
  bgTertiary: string;
  bgHover: string;
  border: string;
  borderSubtle: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  accent: string;
  accentMuted: string;
  success: string;
  successMuted: string;
  warning: string;
  warningMuted: string;
  danger: string;
  dangerMuted: string;
}

const dark: ThemeTokens = {
  bgPrimary:    '#0d1117',
  bgSecondary:  '#161b22',
  bgTertiary:   '#21262d',
  bgHover:      '#1c2128',
  border:       '#30363d',
  borderSubtle: '#21262d',
  textPrimary:  '#e6edf3',
  textSecondary:'#8b949e',
  textMuted:    '#6e7681',
  accent:       '#58a6ff',
  accentMuted:  '#1f6feb33',
  success:      '#3fb950',
  successMuted: '#23863633',
  warning:      '#d29922',
  warningMuted: '#9a700022',
  danger:       '#f85149',
  dangerMuted:  '#da363333',
};

const light: ThemeTokens = {
  bgPrimary:    '#f0f2f5',    // soft neutral page canvas
  bgSecondary:  '#ffffff',    // card / panel surface
  bgTertiary:   '#f6f8fa',    // row items — barely-there tint on white (not cold gray)
  bgHover:      '#eef2ff',    // light-blue hover tint
  border:       '#d0d7de',    // standard visible border
  borderSubtle: '#e8ecf0',    // hairline dividers
  textPrimary:  '#24292f',    // readable near-black (not harsh pure #000)
  textSecondary:'#57606a',    // softer secondary
  textMuted:    '#8c959f',    // muted helper / labels
  accent:       '#0969da',    // GitHub blue
  accentMuted:  '#dbeafe',    // solid light-blue tint (replaces near-invisible #color18)
  success:      '#1a7f37',    // GitHub green
  successMuted: '#dcfce7',    // solid light-green tint
  warning:      '#9a6700',    // amber
  warningMuted: '#fef3c7',    // solid light-yellow tint
  danger:       '#cf222e',    // GitHub red
  dangerMuted:  '#fee2e2',    // solid light-red tint
};

interface ThemeContextValue {
  theme: Theme;
  tokens: ThemeTokens;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'dark',
  tokens: dark,
  toggle: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    return (localStorage.getItem('nexus-theme') as Theme) ?? 'dark';
  });

  const tokens = theme === 'dark' ? dark : light;

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    // Also update body background immediately to prevent flash
    document.body.style.background = tokens.bgPrimary;
    document.body.style.color = tokens.textPrimary;
    localStorage.setItem('nexus-theme', theme);
  }, [theme, tokens]);

  const toggle = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));

  return (
    <ThemeContext.Provider value={{ theme, tokens, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
