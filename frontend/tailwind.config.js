/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        dark:    '#0f1923',
        surface: '#151f2b',
        panel:   '#1c2a38',
        border:  '#2b3c50',
        teal:    '#50b89e',
        orange:  '#ed693b',
        amber:   '#ffa94d',
        muted:   '#8ab4c9',
      },
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
      keyframes: {
        'glow-ring': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(80,184,158,0.55)', borderColor: 'rgba(80,184,158,0.9)' },
          '50%':      { boxShadow: '0 0 0 10px rgba(80,184,158,0)',  borderColor: 'rgba(80,184,158,0.45)' },
        },
        'bob-up': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%':      { transform: 'translateY(-5px)' },
        },
      },
      animation: {
        'glow-ring': 'glow-ring 2s ease-in-out infinite',
        'bob-up':    'bob-up 1.6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
