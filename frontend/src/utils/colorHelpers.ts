import { ThemeColors } from '../theme';

export function pctColor(pct: number, colors?: ThemeColors): string {
  if (pct >= 75) return colors?.present ?? '#16A34A';
  if (pct >= 50) return colors?.late ?? '#D97706';
  return colors?.absent ?? '#DC2626';
}
