/**
 * GLOBAL DESIGN SYSTEM TOKENS
 * Unified design language for the entire application
 * All pages MUST use these tokens for consistency
 */

// ======================
// COLOR PALETTE
// ======================
export const colors = {
  // Primary Brand Colors
  primary: {
    50: '#f0f9ff',
    100: '#e0f2fe',
    200: '#bae6fd',
    300: '#7dd3fc',
    400: '#38bdf8',
    500: '#22c55e', // Main brand green
    600: '#16a34a',
    700: '#15803d',
    800: '#166534',
    900: '#14532d',
  },
  
  // Accent / Indigo (for highlights)
  accent: {
    50: '#eef2ff',
    100: '#e0e7ff',
    200: '#c7d2fe',
    300: '#a5b4fc',
    400: '#818cf8',
    500: '#6366f1',
    600: '#4f46e5',
    700: '#4338ca',
    800: '#3730a3',
    900: '#312e81',
  },
  
  // Neutral / Gray Scale
  neutral: {
    0: '#ffffff',
    50: '#f8fafc',
    100: '#f1f5f9',
    200: '#e2e8f0',
    300: '#cbd5e1',
    400: '#94a3b8',
    500: '#64748b',
    600: '#475569',
    700: '#334155',
    800: '#1e293b',
    900: '#0f172a',
  },
  
  // Semantic Colors
  success: {
    light: '#dcfce7',
    main: '#22c55e',
    dark: '#16a34a',
  },
  warning: {
    light: '#fef3c7',
    main: '#f59e0b',
    dark: '#d97706',
  },
  error: {
    light: '#fee2e2',
    main: '#ef4444',
    dark: '#dc2626',
  },
  info: {
    light: '#dbeafe',
    main: '#3b82f6',
    dark: '#2563eb',
  },
  
  // Background
  background: {
    primary: '#f8fafc',
    secondary: '#ffffff',
    tertiary: '#f1f5f9',
  },
  
  // Text
  text: {
    primary: '#0f172a',
    secondary: '#64748b',
    tertiary: '#94a3b8',
    inverse: '#ffffff',
  },
  
  // Border
  border: {
    light: '#f1f5f9',
    default: '#e2e8f0',
    dark: '#cbd5e1',
  },
};

// ======================
// TYPOGRAPHY
// ======================
export const typography = {
  fontFamily: {
    sans: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    mono: "'SF Mono', 'Monaco', 'Inconsolata', 'Fira Mono', monospace",
  },
  
  fontSize: {
    xs: '11px',
    sm: '12px',
    md: '14px',
    base: '15px',
    lg: '16px',
    xl: '18px',
    '2xl': '20px',
    '3xl': '24px',
    '4xl': '28px',
    '5xl': '32px',
  },
  
  fontWeight: {
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
    extrabold: 800,
  },
  
  lineHeight: {
    tight: 1.2,
    normal: 1.5,
    relaxed: 1.7,
  },
  
  letterSpacing: {
    tight: '-0.025em',
    normal: '0',
    wide: '0.025em',
  },
};

// ======================
// SPACING
// ======================
export const spacing = {
  0: '0',
  1: '4px',
  2: '8px',
  3: '12px',
  4: '16px',
  5: '20px',
  6: '24px',
  8: '32px',
  10: '40px',
  12: '48px',
  16: '64px',
  20: '80px',
  
  // Page padding
  page: {
    x: '16px',
    y: '20px',
  },
  
  // Section gaps
  section: '24px',
  
  // Card padding
  card: {
    sm: '12px',
    md: '16px',
    lg: '20px',
    xl: '24px',
  },
};

// ======================
// BORDER RADIUS
// ======================
export const radius = {
  none: '0',
  sm: '6px',
  md: '8px',
  lg: '12px',
  xl: '16px',
  '2xl': '20px',
  '3xl': '24px',
  full: '9999px',
  
  // Component-specific
  button: '12px',
  card: '16px',
  modal: '24px',
  badge: '8px',
  input: '12px',
  avatar: '14px',
};

// ======================
// SHADOWS
// ======================
export const shadows = {
  none: 'none',
  xs: '0 1px 2px rgba(0, 0, 0, 0.04)',
  sm: '0 1px 3px rgba(0, 0, 0, 0.06)',
  md: '0 4px 12px rgba(0, 0, 0, 0.08)',
  lg: '0 8px 24px rgba(0, 0, 0, 0.1)',
  xl: '0 12px 32px rgba(0, 0, 0, 0.12)',
  
  // Colored shadows
  primary: '0 4px 16px rgba(34, 197, 94, 0.25)',
  accent: '0 4px 16px rgba(99, 102, 241, 0.25)',
  error: '0 4px 16px rgba(239, 68, 68, 0.25)',
  
  // Card shadows
  card: '0 1px 3px rgba(0, 0, 0, 0.06), 0 4px 12px rgba(0, 0, 0, 0.04)',
  cardHover: '0 4px 16px rgba(0, 0, 0, 0.1)',
  
  // Modal shadow
  modal: '0 10px 40px rgba(0, 0, 0, 0.15)',
  
  // Button shadows
  button: {
    primary: '0 4px 12px rgba(34, 197, 94, 0.3)',
    accent: '0 4px 12px rgba(99, 102, 241, 0.3)',
  },
};

// ======================
// TRANSITIONS
// ======================
export const transitions = {
  fast: 'all 0.15s ease',
  normal: 'all 0.2s ease',
  slow: 'all 0.3s ease',
  spring: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
};

// ======================
// Z-INDEX LAYERS
// ======================
export const zIndex = {
  base: 0,
  dropdown: 10,
  sticky: 20,
  fixed: 30,
  overlay: 40,
  modal: 50,
  popover: 60,
  toast: 100,
};

// ======================
// BREAKPOINTS
// ======================
export const breakpoints = {
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
};

// ======================
// GRADIENTS
// ======================
export const gradients = {
  primary: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
  accent: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
  hero: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  card: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
  overlay: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.6) 100%)',
};

// ======================
// COMPONENT STYLES
// ======================
export const components = {
  // Page Container
  page: {
    maxWidth: '960px',
    margin: '0 auto',
    padding: `${spacing.page.y} ${spacing.page.x}`,
    paddingBottom: '100px', // For bottom nav
  },
  
  // Header
  header: {
    height: '64px',
    background: colors.background.secondary,
    borderBottom: `1px solid ${colors.border.light}`,
  },
  
  // Bottom Nav
  bottomNav: {
    height: '60px',
    safeAreaPadding: 'env(safe-area-inset-bottom)',
    background: 'rgba(255, 255, 255, 0.98)',
    backdropFilter: 'blur(20px)',
  },
  
  // Cards
  card: {
    background: colors.background.secondary,
    border: `1px solid ${colors.border.light}`,
    borderRadius: radius.card,
    boxShadow: shadows.card,
  },
  
  // Inputs
  input: {
    height: '48px',
    padding: '0 16px',
    fontSize: typography.fontSize.base,
    border: `2px solid ${colors.border.default}`,
    borderRadius: radius.input,
    background: colors.neutral[50],
    focusBorder: colors.primary[500],
  },
  
  // Modal
  modal: {
    background: colors.background.secondary,
    borderRadius: radius.modal,
    boxShadow: shadows.modal,
  },
};

// Export all as default theme
const theme = {
  colors,
  typography,
  spacing,
  radius,
  shadows,
  transitions,
  zIndex,
  breakpoints,
  gradients,
  components,
};

export default theme;
