/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'system-ui', 'sans-serif'],
      },
      colors: {
        brand: {
          bg: '#0B1929',
          surface: '#1A1F2E',
          accent: '#2563EB',
          cyan: '#06B6D4',
          text: '#F8FAFC',
          muted: '#94A3B8',
          border: '#1E3A5F',
        },
      },
    },
  },
  plugins: [],
}
