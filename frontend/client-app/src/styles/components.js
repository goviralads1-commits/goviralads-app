/**
 * GLOBAL DESIGN SYSTEM - COMPONENT STYLES
 * Reusable style objects for consistent UI components
 */

import { colors, typography, spacing, radius, shadows, transitions, gradients } from './tokens';

// ======================
// BUTTON STYLES
// ======================
export const buttonStyles = {
  // Base button
  base: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    fontFamily: typography.fontFamily.sans,
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    borderRadius: radius.button,
    border: 'none',
    cursor: 'pointer',
    transition: transitions.normal,
    whiteSpace: 'nowrap',
  },
  
  // Sizes
  sizes: {
    sm: {
      height: '36px',
      padding: `0 ${spacing[3]}`,
      fontSize: typography.fontSize.sm,
    },
    md: {
      height: '44px',
      padding: `0 ${spacing[4]}`,
      fontSize: typography.fontSize.md,
    },
    lg: {
      height: '52px',
      padding: `0 ${spacing[6]}`,
      fontSize: typography.fontSize.lg,
    },
    xl: {
      height: '56px',
      padding: `0 ${spacing[8]}`,
      fontSize: typography.fontSize.lg,
      fontWeight: typography.fontWeight.bold,
    },
  },
  
  // Variants
  variants: {
    primary: {
      background: gradients.primary,
      color: colors.text.inverse,
      boxShadow: shadows.button.primary,
    },
    accent: {
      background: gradients.accent,
      color: colors.text.inverse,
      boxShadow: shadows.button.accent,
    },
    secondary: {
      background: colors.neutral[100],
      color: colors.text.primary,
      border: `1px solid ${colors.border.default}`,
    },
    outline: {
      background: 'transparent',
      color: colors.primary[500],
      border: `2px solid ${colors.primary[500]}`,
    },
    ghost: {
      background: 'transparent',
      color: colors.text.secondary,
    },
    danger: {
      background: colors.error.main,
      color: colors.text.inverse,
      boxShadow: shadows.error,
    },
  },
  
  // States
  disabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
  
  // Full width
  fullWidth: {
    width: '100%',
  },
};

// ======================
// BADGE STYLES
// ======================
export const badgeStyles = {
  base: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: typography.fontFamily.sans,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    borderRadius: radius.badge,
    whiteSpace: 'nowrap',
  },
  
  sizes: {
    sm: {
      padding: `2px ${spacing[2]}`,
      fontSize: typography.fontSize.xs,
    },
    md: {
      padding: `${spacing[1]} ${spacing[3]}`,
      fontSize: typography.fontSize.sm,
    },
    lg: {
      padding: `${spacing[2]} ${spacing[4]}`,
      fontSize: typography.fontSize.md,
    },
  },
  
  variants: {
    primary: {
      background: colors.primary[100],
      color: colors.primary[700],
    },
    accent: {
      background: colors.accent[100],
      color: colors.accent[700],
    },
    success: {
      background: colors.success.light,
      color: colors.success.dark,
    },
    warning: {
      background: colors.warning.light,
      color: colors.warning.dark,
    },
    error: {
      background: colors.error.light,
      color: colors.error.dark,
    },
    info: {
      background: colors.info.light,
      color: colors.info.dark,
    },
    neutral: {
      background: colors.neutral[100],
      color: colors.neutral[600],
    },
  },
};

// ======================
// CARD STYLES
// ======================
export const cardStyles = {
  base: {
    background: colors.background.secondary,
    borderRadius: radius.card,
    border: `1px solid ${colors.border.light}`,
    boxShadow: shadows.card,
    overflow: 'hidden',
    transition: transitions.normal,
  },
  
  variants: {
    flat: {
      boxShadow: 'none',
      border: `1px solid ${colors.border.default}`,
    },
    elevated: {
      boxShadow: shadows.md,
      border: 'none',
    },
    interactive: {
      cursor: 'pointer',
      '&:hover': {
        boxShadow: shadows.cardHover,
        transform: 'translateY(-2px)',
      },
    },
    gradient: {
      background: gradients.card,
    },
  },
  
  padding: {
    none: { padding: 0 },
    sm: { padding: spacing.card.sm },
    md: { padding: spacing.card.md },
    lg: { padding: spacing.card.lg },
    xl: { padding: spacing.card.xl },
  },
};

// ======================
// INPUT STYLES
// ======================
export const inputStyles = {
  base: {
    width: '100%',
    height: '48px',
    padding: `0 ${spacing[4]}`,
    fontFamily: typography.fontFamily.sans,
    fontSize: typography.fontSize.base,
    color: colors.text.primary,
    background: colors.neutral[50],
    border: `2px solid ${colors.border.default}`,
    borderRadius: radius.input,
    outline: 'none',
    transition: transitions.normal,
    boxSizing: 'border-box',
  },
  
  focus: {
    borderColor: colors.primary[500],
    background: colors.background.secondary,
    boxShadow: `0 0 0 4px ${colors.primary[100]}`,
  },
  
  error: {
    borderColor: colors.error.main,
    boxShadow: `0 0 0 4px ${colors.error.light}`,
  },
  
  disabled: {
    background: colors.neutral[100],
    cursor: 'not-allowed',
    opacity: 0.6,
  },
  
  textarea: {
    height: 'auto',
    padding: spacing[4],
    minHeight: '120px',
    resize: 'vertical',
  },
};

// ======================
// LOADER STYLES
// ======================
export const loaderStyles = {
  skeleton: {
    background: colors.neutral[200],
    borderRadius: radius.md,
    animation: 'shimmer 1.5s infinite',
  },
  
  spinner: {
    border: `3px solid ${colors.neutral[200]}`,
    borderTopColor: colors.primary[500],
    borderRadius: radius.full,
    animation: 'spin 0.8s linear infinite',
  },
  
  sizes: {
    sm: { width: '16px', height: '16px' },
    md: { width: '24px', height: '24px' },
    lg: { width: '32px', height: '32px' },
    xl: { width: '48px', height: '48px' },
  },
};

// ======================
// TOAST STYLES
// ======================
export const toastStyles = {
  base: {
    position: 'fixed',
    top: '80px',
    left: '50%',
    transform: 'translateX(-50%)',
    padding: `${spacing[3]} ${spacing[6]}`,
    borderRadius: radius.xl,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
    boxShadow: shadows.xl,
    zIndex: 1000,
  },
  
  variants: {
    success: {
      background: colors.success.main,
      color: colors.text.inverse,
    },
    error: {
      background: colors.error.main,
      color: colors.text.inverse,
    },
    warning: {
      background: colors.warning.main,
      color: colors.text.primary,
    },
    info: {
      background: colors.info.main,
      color: colors.text.inverse,
    },
  },
};

// ======================
// MODAL STYLES
// ======================
export const modalStyles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing[4],
    zIndex: 1000,
  },
  
  container: {
    background: colors.background.secondary,
    borderRadius: radius.modal,
    boxShadow: shadows.modal,
    width: '100%',
    maxWidth: '560px',
    maxHeight: '90vh',
    overflow: 'hidden',
  },
  
  header: {
    padding: spacing[5],
    borderBottom: `1px solid ${colors.border.light}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  
  body: {
    padding: spacing[5],
    overflowY: 'auto',
    maxHeight: 'calc(90vh - 160px)',
  },
  
  footer: {
    padding: spacing[5],
    borderTop: `1px solid ${colors.border.light}`,
    display: 'flex',
    justifyContent: 'flex-end',
    gap: spacing[3],
  },
  
  closeButton: {
    width: '44px',
    height: '44px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: colors.neutral[100],
    border: 'none',
    borderRadius: radius.lg,
    cursor: 'pointer',
    fontSize: typography.fontSize.xl,
    color: colors.text.secondary,
    transition: transitions.fast,
  },
};

// ======================
// EMPTY STATE STYLES
// ======================
export const emptyStateStyles = {
  container: {
    padding: `${spacing[10]} ${spacing[6]}`,
    textAlign: 'center',
    background: colors.background.secondary,
    borderRadius: radius.card,
    border: `1px solid ${colors.border.light}`,
  },
  
  icon: {
    width: '80px',
    height: '80px',
    borderRadius: radius.full,
    background: colors.neutral[100],
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto',
    marginBottom: spacing[5],
    fontSize: '36px',
  },
  
  title: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
    marginBottom: spacing[2],
  },
  
  description: {
    fontSize: typography.fontSize.base,
    color: colors.text.secondary,
    marginBottom: spacing[6],
  },
};

// ======================
// LIST ITEM STYLES
// ======================
export const listItemStyles = {
  base: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing[3],
    padding: spacing[4],
    background: colors.background.secondary,
    borderRadius: radius.card,
    border: `1px solid ${colors.border.light}`,
    cursor: 'pointer',
    transition: transitions.normal,
  },
  
  hover: {
    background: colors.neutral[50],
    borderColor: colors.border.default,
  },
  
  icon: {
    width: '48px',
    height: '48px',
    borderRadius: radius.lg,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  
  content: {
    flex: 1,
    minWidth: 0,
  },
  
  title: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.primary,
    margin: 0,
  },
  
  subtitle: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    margin: 0,
  },
};

// ======================
// AVATAR STYLES
// ======================
export const avatarStyles = {
  base: {
    borderRadius: radius.avatar,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: typography.fontWeight.bold,
    color: colors.text.inverse,
    background: gradients.primary,
    overflow: 'hidden',
  },
  
  sizes: {
    xs: { width: '24px', height: '24px', fontSize: typography.fontSize.xs },
    sm: { width: '32px', height: '32px', fontSize: typography.fontSize.sm },
    md: { width: '40px', height: '40px', fontSize: typography.fontSize.md },
    lg: { width: '48px', height: '48px', fontSize: typography.fontSize.lg },
    xl: { width: '64px', height: '64px', fontSize: typography.fontSize.xl },
    '2xl': { width: '80px', height: '80px', fontSize: typography.fontSize['2xl'] },
  },
  
  image: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
};

// ======================
// CSS ANIMATIONS
// ======================
export const cssAnimations = `
  @keyframes shimmer {
    0% { opacity: 1; }
    50% { opacity: 0.5; }
    100% { opacity: 1; }
  }
  
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
  
  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  
  @keyframes slideUp {
    from { transform: translateY(20px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
  }
  
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
`;

// Export all
export default {
  buttonStyles,
  badgeStyles,
  cardStyles,
  inputStyles,
  loaderStyles,
  toastStyles,
  modalStyles,
  emptyStateStyles,
  listItemStyles,
  avatarStyles,
  cssAnimations,
};
