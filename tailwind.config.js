/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: '#0c0c0e',
          panel: '#141417',
          card: '#1b1b1f',
          hover: '#26262b',
          chip: '#2c2c32'
        },
        line: '#2a2a30',
        ink: {
          DEFAULT: '#f3f3f5',
          muted: '#9b9ba4',
          faint: '#62626b'
        },
        accent: {
          DEFAULT: '#8ee8f5',
          hover: '#a9eef8',
          ink: '#0b1a1d',
          soft: 'rgba(142, 232, 245, 0.12)'
        }
      },
      borderRadius: {
        card: '0.375rem' // rounded-md
      },
      fontFamily: {
        sans: ['"Inter Variable"', '"Segoe UI"', 'system-ui', 'sans-serif']
      },
      boxShadow: {
        glow: '0 0 24px rgba(142, 232, 245, 0.35)'
      }
    }
  },
  plugins: []
}
