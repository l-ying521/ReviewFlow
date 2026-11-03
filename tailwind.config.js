/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        night: {
          950: '#08080a',
          900: '#0d0d10',
          850: '#121216',
          800: '#17171c',
          700: '#232329',
          600: '#31313a',
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'PingFang SC',
          'Microsoft YaHei',
          'sans-serif',
        ],
        mono: ['JetBrains Mono', 'Consolas', 'monospace'],
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(139, 92, 246, 0.35), 0 8px 32px -8px rgba(139, 92, 246, 0.45)',
        panel: '0 1px 0 0 rgba(255, 255, 255, 0.04) inset, 0 24px 48px -24px rgba(0, 0, 0, 0.9)',
      },
      animation: {
        'fade-in': 'fade-in 0.35s ease-out both',
        'pulse-ring': 'pulse-ring 2s ease-out infinite',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'pulse-ring': {
          '0%': { boxShadow: '0 0 0 0 rgba(139, 92, 246, 0.45)' },
          '70%': { boxShadow: '0 0 0 12px rgba(139, 92, 246, 0)' },
          '100%': { boxShadow: '0 0 0 0 rgba(139, 92, 246, 0)' },
        },
      },
    },
  },
  plugins: [],
}
