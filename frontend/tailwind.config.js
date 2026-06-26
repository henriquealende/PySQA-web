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
    },
  },
  plugins: [],
}
