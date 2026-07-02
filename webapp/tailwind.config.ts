import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        vw: {
          purple: '#7C3AED',
          'purple-mid': '#8B5CF6',
          'purple-light': '#EDE9FE',
          'purple-dark': '#5B21B6',
          lime: '#84CC16',
          'lime-dark': '#65A30D',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

export default config
