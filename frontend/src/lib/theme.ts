/**
 * Theme Constants
 *
 * Centralized theme tokens for consistency across the app.
 * Dark mode is PRIMARY, light mode is secondary.
 */

// Color tokens
export const theme = {
  colors: {
    // Primary accent (cyan)
    primary: {
      DEFAULT: 'cyan-500',
      hover: 'cyan-400',
      light: 'cyan-600', // For light mode contrast
      glow: 'rgba(6, 182, 212, 0.3)',
      glowStrong: 'rgba(6, 182, 212, 0.5)',
    },
    // Secondary accent (blue)
    secondary: {
      DEFAULT: 'blue-500',
      hover: 'blue-400',
    },
    // Backgrounds
    bg: {
      dark: 'slate-900',
      light: 'white',
    },
    surface: {
      dark: 'slate-800',
      light: 'slate-50',
    },
    surfaceHover: {
      dark: 'slate-700',
      light: 'slate-100',
    },
    surfaceActive: {
      dark: 'slate-600',
      light: 'slate-200',
    },
    // Borders
    border: {
      dark: 'slate-700',
      light: 'slate-200',
    },
    borderHover: {
      dark: 'slate-600',
      light: 'slate-300',
    },
    // Text
    text: {
      primary: { dark: 'white', light: 'slate-900' },
      secondary: { dark: 'slate-300', light: 'slate-600' },
      muted: { dark: 'slate-400', light: 'slate-500' },
      placeholder: { dark: 'slate-500', light: 'slate-400' },
    },
    // Status
    success: 'emerald-500',
    successBg: { dark: 'emerald-500/20', light: 'emerald-50' },
    error: 'red-500',
    errorBg: { dark: 'red-500/20', light: 'red-50' },
    warning: 'amber-500',
    warningBg: { dark: 'amber-500/20', light: 'amber-50' },
  },
} as const

/**
 * Common class patterns for easy reuse
 * Use these to ensure consistent theming across components
 */
export const themeClasses = {
  // ============================================
  // Backgrounds
  // ============================================
  pageBg: 'bg-white dark:bg-slate-900',
  cardBg: 'bg-slate-50 dark:bg-slate-800/60',
  cardBgSolid: 'bg-slate-100 dark:bg-slate-800',
  cardBgHover: 'hover:bg-slate-100 dark:hover:bg-slate-700/60',
  surfaceBg: 'bg-slate-100 dark:bg-slate-800/40',
  inputBg: 'bg-white dark:bg-slate-800/60',

  // ============================================
  // Borders
  // ============================================
  border: 'border-slate-200 dark:border-slate-700',
  borderSubtle: 'border-slate-100 dark:border-slate-800',
  borderHover: 'hover:border-slate-300 dark:hover:border-slate-600',
  borderFocus: 'focus:border-cyan-500 dark:focus:border-cyan-400',
  borderAccent: 'border-cyan-500 dark:border-cyan-400',
  borderAccentSubtle: 'border-cyan-500/30 dark:border-cyan-400/30',

  // ============================================
  // Text
  // ============================================
  textPrimary: 'text-slate-900 dark:text-white',
  textSecondary: 'text-slate-600 dark:text-slate-300',
  textMuted: 'text-slate-500 dark:text-slate-400',
  textPlaceholder: 'placeholder-slate-400 dark:placeholder-slate-500',
  textAccent: 'text-cyan-600 dark:text-cyan-400',

  // ============================================
  // Interactive States
  // ============================================
  focusRing: 'focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-slate-900',
  focusRingInset: 'focus:outline-none focus:ring-2 focus:ring-inset focus:ring-cyan-500',
  hoverBgSubtle: 'hover:bg-slate-50 dark:hover:bg-slate-800',
  activeBg: 'active:bg-slate-100 dark:active:bg-slate-700',

  // ============================================
  // Buttons
  // ============================================
  buttonPrimary: 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:from-cyan-400 hover:to-blue-500 shadow-lg shadow-cyan-500/25 dark:shadow-cyan-500/20',
  buttonSecondary: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700',
  buttonGhost: 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800',
  buttonOutline: 'border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800',

  // ============================================
  // Cards & Containers
  // ============================================
  card: 'bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl',
  cardHoverable: 'bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl hover:border-cyan-500/50 dark:hover:border-cyan-400/50 hover:shadow-lg hover:shadow-cyan-500/10 transition-all duration-200',
  cardSelected: 'bg-cyan-50 dark:bg-cyan-500/10 border-cyan-500 dark:border-cyan-400',

  // ============================================
  // Status
  // ============================================
  successBg: 'bg-emerald-50 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400',
  errorBg: 'bg-red-50 dark:bg-red-500/20 text-red-700 dark:text-red-400',
  warningBg: 'bg-amber-50 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400',

  // ============================================
  // Shadows
  // ============================================
  shadowSm: 'shadow-sm shadow-slate-900/5 dark:shadow-black/20',
  shadowMd: 'shadow-md shadow-slate-900/10 dark:shadow-black/30',
  shadowGlow: 'shadow-lg shadow-cyan-500/20 dark:shadow-cyan-500/30',
  shadowGlowLg: 'shadow-xl shadow-cyan-500/25 dark:shadow-cyan-500/40',

  // ============================================
  // Dividers
  // ============================================
  divider: 'border-t border-slate-200 dark:border-slate-700',
  dividerSubtle: 'border-t border-slate-100 dark:border-slate-800',
} as const

/**
 * Get theme-aware gradient for primary button
 */
export const primaryGradient = 'bg-gradient-to-r from-cyan-500 to-blue-600'

/**
 * Glow effect for accent elements
 */
export const glowEffect = {
  cyan: 'shadow-[0_0_20px_rgba(6,182,212,0.3)] dark:shadow-[0_0_20px_rgba(6,182,212,0.4)]',
  cyanLg: 'shadow-[0_0_40px_rgba(6,182,212,0.4)] dark:shadow-[0_0_40px_rgba(6,182,212,0.5)]',
}
