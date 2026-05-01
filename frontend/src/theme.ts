export interface ThemeColors {
  primary: string;
  primaryDark: string;
  primaryDeep: string;
  primaryLight: string;
  primarySurface: string;
  background: string;
  surface: string;
  surfaceAlt: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  textInverse: string;
  textPlaceholder: string;
  border: string;
  borderLight: string;
  danger: string;
  dangerDark: string;
  dangerLight: string;
  success: string;
  successDark: string;
  successLight: string;
  warning: string;
  warningDark: string;
  warningLight: string;
  present: string;
  presentLight: string;
  presentSurface: string;
  absent: string;
  absentLight: string;
  absentSurface: string;
  late: string;
  lateLight: string;
  lateSurface: string;
  excused: string;
  excusedLight: string;
  excusedSurface: string;
}

export const colors: ThemeColors = {
  // Primary — Indigo
  primary: '#4F46E5',
  primaryDark: '#4338CA',
  primaryDeep: '#312E81',
  primaryLight: '#E0E7FF',
  primarySurface: '#EEF2FF',

  // Neutrals
  background: '#F0F4FF',
  surface: '#FFFFFF',
  surfaceAlt: '#F8FAFC',

  // Text hierarchy
  text: '#0F172A',
  textSecondary: '#475569',
  textMuted: '#94A3B8',
  textInverse: '#FFFFFF',
  textPlaceholder: '#94A3B8',

  // Borders
  border: 'rgba(255,255,255,0.6)',
  borderLight: 'rgba(255,255,255,0.3)',

  // Semantic
  danger: '#EF4444',
  dangerDark: '#DC2626',
  dangerLight: '#FEE2E2',
  success: '#22C55E',
  successDark: '#16A34A',
  successLight: '#DCFCE7',
  warning: '#F59E0B',
  warningDark: '#D97706',
  warningLight: '#FEF3C7',

  // Attendance statuses
  present: '#16A34A',
  presentLight: '#DCFCE7',
  presentSurface: '#F0FDF4',
  absent: '#DC2626',
  absentLight: '#FEE2E2',
  absentSurface: '#FFF5F5',
  late: '#D97706',
  lateLight: '#FEF3C7',
  lateSurface: '#FFFBEB',
  excused: '#7C3AED',
  excusedLight: '#EDE9FE',
  excusedSurface: '#F5F3FF',
};

export const shadows = {
  xs: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  sm: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  md: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  lg: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 8,
  },
  primary: {
    shadowColor: '#4338CA',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  glass: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 4,
  },
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const borderRadius = {
  xs: 6,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  '3xl': 28,
  full: 9999,
} as const;

export const typography = {
  h1:      { fontSize: 26, fontWeight: '800' as const, letterSpacing: -0.5 },
  h2:      { fontSize: 20, fontWeight: '700' as const, letterSpacing: -0.3 },
  h3:      { fontSize: 17, fontWeight: '600' as const },
  body:    { fontSize: 15, fontWeight: '400' as const },
  bodyMed: { fontSize: 15, fontWeight: '600' as const },
  caption: { fontSize: 12, fontWeight: '500' as const },
  label:   { fontSize: 12, fontWeight: '600' as const, letterSpacing: 0.1 },
} as const;

// Backward-compatible theme object for files not yet migrated to NativeWind
export const theme = {
  colors,
  shadows,
  spacing,
  borderRadius,
  typography,
};
