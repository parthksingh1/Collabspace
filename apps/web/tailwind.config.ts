import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './src/**/*.{ts,tsx}',
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Primary accent — a professional teal/cyan
        brand: {
          50: '#effcf9',
          100: '#d0f7ef',
          200: '#a4eedf',
          300: '#6fdfcc',
          400: '#3ec9b4',
          500: '#20af9c',
          600: '#158d7f',
          700: '#147168',
          800: '#155a54',
          900: '#164b46',
          950: '#062d2a',
        },
        // Neutral surface palette — warm grays
        surface: {
          0: '#ffffff',
          50: '#fafafa',
          100: '#f4f4f5',
          200: '#e4e4e7',
          300: '#d4d4d8',
          400: '#a1a1aa',
          500: '#71717a',
          600: '#52525b',
          700: '#3f3f46',
          // 750 and 850 fill the gaps that dark mode actually needs. Elevation
          // in a dark theme is expressed by getting *lighter*, and the jumps
          // 700->800->900 are too coarse for the three levels the UI uses
          // (page, card, raised control) — without these, a hover state and a
          // panel background end up the same colour.
          750: '#333338',
          800: '#27272a',
          850: '#1f1f22',
          900: '#18181b',
          950: '#09090b',
        },
        // Semantic colors
        success: { 50: '#f0fdf4', 500: '#22c55e', 700: '#15803d' },
        warning: { 50: '#fffbeb', 500: '#f59e0b', 700: '#b45309' },
        danger:  { 50: '#fef2f2', 500: '#ef4444', 700: '#b91c1c' },
        info:    { 50: '#eff6ff', 500: '#3b82f6', 700: '#1d4ed8' },
      },
      fontFamily: {
        // These must reference the CSS variables that next/font defines in
        // app/layout.tsx. They previously hardcoded 'Inter', which meant the
        // font Next.js was carefully self-hosting and preloading was never
        // actually used — the browser fell back to a locally installed Inter if
        // one existed, and to the system UI font otherwise. That also silently
        // disabled the `font-feature-settings` in globals.css, since those
        // stylistic sets only exist in the real Inter.
        sans: ['var(--font-sans)', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        mono: ['var(--font-mono)', 'SF Mono', 'Fira Code', 'monospace'],
        display: ['var(--font-sans)', '-apple-system', 'sans-serif'],
      },
      fontSize: {
        '2xs': ['0.65rem', { lineHeight: '0.9rem' }],
      },
      letterSpacing: {
        // Optical correction: large type needs negative tracking to avoid
        // looking loose, small type needs positive tracking to stay legible.
        // Applied to headings and labels in globals.css.
        display: '-0.022em',
        heading: '-0.015em',
        label: '0.01em',
      },
      borderRadius: {
        '4xl': '2rem',
      },
      boxShadow: {
        // Layered shadows. A single soft blur reads as flat and slightly muddy;
        // stacking a tight, near-opaque contact shadow under a wider ambient
        // one is what actually reads as depth. The `-hairline` variants add a
        // 1px inset highlight along the top edge, which simulates a lit surface
        // and is the detail that separates a merely clean UI from a crisp one.
        'soft':
          '0 1px 2px 0 rgb(16 24 40 / 0.05), 0 1px 3px 0 rgb(16 24 40 / 0.04)',
        'medium':
          '0 1px 2px 0 rgb(16 24 40 / 0.06), 0 4px 8px -2px rgb(16 24 40 / 0.07)',
        'elevated':
          '0 1px 2px 0 rgb(16 24 40 / 0.06), 0 8px 16px -4px rgb(16 24 40 / 0.08), 0 2px 6px -2px rgb(16 24 40 / 0.04)',
        'overlay':
          '0 1px 3px 0 rgb(16 24 40 / 0.08), 0 12px 24px -6px rgb(16 24 40 / 0.12), 0 24px 48px -12px rgb(16 24 40 / 0.10)',
        'glow': '0 0 0 1px rgb(32 175 156 / 0.10), 0 2px 12px -2px rgb(32 175 156 / 0.30)',
        'inner-soft': 'inset 0 1px 2px 0 rgb(16 24 40 / 0.05)',
        // Top-edge highlight, used on raised surfaces in both themes.
        'hairline': 'inset 0 1px 0 0 rgb(255 255 255 / 0.60)',
        'hairline-dark': 'inset 0 1px 0 0 rgb(255 255 255 / 0.06)',
        // Dark mode needs its own scale — black-on-dark shadows are invisible,
        // so depth there comes from a heavier ambient plus the hairline.
        'soft-dark': '0 1px 2px 0 rgb(0 0 0 / 0.40)',
        'medium-dark': '0 2px 4px 0 rgb(0 0 0 / 0.40), 0 6px 12px -3px rgb(0 0 0 / 0.35)',
        'overlay-dark': '0 8px 24px -4px rgb(0 0 0 / 0.55), 0 16px 40px -8px rgb(0 0 0 / 0.45)',
      },
      transitionTimingFunction: {
        // A single shared easing vocabulary. `swift` is the workhorse for
        // hovers and presses; `spring` overshoots slightly for entrances.
        swift: 'cubic-bezier(0.32, 0.72, 0, 1)',
        spring: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      animation: {
        'fade-in': 'fadeIn 0.15s ease-out',
        'slide-up': 'slideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-down': 'slideDown 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-in-right': 'slideInRight 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
        'scale-in': 'scaleIn 0.15s cubic-bezier(0.16, 1, 0.3, 1)',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
        'cursor-blink': 'cursorBlink 1s step-end infinite',
        'shimmer': 'shimmer 2s linear infinite',
      },
      keyframes: {
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        slideUp: { '0%': { transform: 'translateY(8px)', opacity: '0' }, '100%': { transform: 'translateY(0)', opacity: '1' } },
        slideDown: { '0%': { transform: 'translateY(-8px)', opacity: '0' }, '100%': { transform: 'translateY(0)', opacity: '1' } },
        slideInRight: { '0%': { transform: 'translateX(16px)', opacity: '0' }, '100%': { transform: 'translateX(0)', opacity: '1' } },
        scaleIn: { '0%': { transform: 'scale(0.97)', opacity: '0' }, '100%': { transform: 'scale(1)', opacity: '1' } },
        pulseSoft: { '0%, 100%': { opacity: '1' }, '50%': { opacity: '0.6' } },
        cursorBlink: { '0%, 100%': { opacity: '1' }, '50%': { opacity: '0' } },
        shimmer: { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
      },
      spacing: {
        '18': '4.5rem',
        '88': '22rem',
        '128': '32rem',
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [],
};

export default config;
