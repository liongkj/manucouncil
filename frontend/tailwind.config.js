/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        council: {
          50: '#f0f5ff',
          100: '#e0ebff',
          200: '#b8d4fe',
          300: '#7cb4fc',
          400: '#4a94f8',
          500: '#2563eb',
          600: '#1d4ed8',
          700: '#1e3a8a',
          800: '#1e2d5a',
          900: '#172033',
        },
      },
    },
  },
  plugins: [],
}
