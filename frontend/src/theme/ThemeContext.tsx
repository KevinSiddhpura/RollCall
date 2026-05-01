import { createContext, useContext, ReactNode } from 'react';
import { colors, shadows, spacing, borderRadius, typography, ThemeColors } from '../theme';

interface ThemeContextType {
  colors: ThemeColors;
  shadows: typeof shadows;
}

const ThemeContext = createContext<ThemeContextType | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <ThemeContext.Provider value={{ colors, shadows }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextType {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}

export { spacing, borderRadius, typography };
