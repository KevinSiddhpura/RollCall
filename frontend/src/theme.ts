export const theme = {
  colors: {
    // Primary — Deep Blue
    primary: '#2563EB',
    primaryDark: '#1D4ED8',
    primaryDeep: '#1E3A8A',
    primaryLight: '#DBEAFE',
    primarySurface: '#EFF6FF',

    // Neutrals
    background: '#F1F5F9',
    surface: '#FFFFFF',
    surfaceAlt: '#F8FAFC',

    // Text hierarchy
    text: '#0F172A',
    textSecondary: '#475569',
    textMuted: '#94A3B8',
    textInverse: '#FFFFFF',
    textPlaceholder: '#CBD5E1',

    // Borders
    border: '#E2E8F0',
    borderLight: '#F1F5F9',

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
  },

  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
  },

  borderRadius: {
    xs: 6,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 28,
    full: 9999,
  },

  shadows: {
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
      shadowColor: '#1D4ED8',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 12,
      elevation: 8,
    },
  },
};
