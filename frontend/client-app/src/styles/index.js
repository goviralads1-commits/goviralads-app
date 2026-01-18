/**
 * DESIGN SYSTEM INDEX
 * Central export for all design system tokens and components
 */

export * from './tokens';
export * from './components';
export { default as theme } from './tokens';
export { default as componentStyles } from './components';

// ======================
// STYLE UTILITIES
// ======================

/**
 * Merge style objects safely
 */
export const mergeStyles = (...styles) => {
  return styles.reduce((acc, style) => {
    if (!style) return acc;
    return { ...acc, ...style };
  }, {});
};

/**
 * Create responsive style based on breakpoint
 */
export const responsive = (mobile, desktop) => ({
  ...mobile,
  '@media (min-width: 768px)': desktop,
});

/**
 * Generate grid template columns
 */
export const grid = (columns, gap = '16px') => ({
  display: 'grid',
  gridTemplateColumns: `repeat(${columns}, 1fr)`,
  gap,
});

/**
 * Center content using flexbox
 */
export const center = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

/**
 * Create flex row
 */
export const row = (gap = '12px', align = 'center') => ({
  display: 'flex',
  alignItems: align,
  gap,
});

/**
 * Create flex column
 */
export const column = (gap = '12px') => ({
  display: 'flex',
  flexDirection: 'column',
  gap,
});

/**
 * Truncate text with ellipsis
 */
export const truncate = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

/**
 * Line clamp for multiline truncation
 */
export const lineClamp = (lines) => ({
  display: '-webkit-box',
  WebkitLineClamp: lines,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
});

/**
 * Absolute fill
 */
export const absoluteFill = {
  position: 'absolute',
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
};

/**
 * Hide scrollbar
 */
export const hideScrollbar = {
  scrollbarWidth: 'none',
  msOverflowStyle: 'none',
  '&::-webkit-scrollbar': {
    display: 'none',
  },
};

/**
 * Aspect ratio box
 */
export const aspectRatio = (ratio = '1/1') => ({
  aspectRatio: ratio,
});

/**
 * Create hover effect
 */
export const hoverLift = {
  transition: 'all 0.2s ease',
  '&:hover': {
    transform: 'translateY(-2px)',
    boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
  },
};
