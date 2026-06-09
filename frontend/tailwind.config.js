/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#f3ecdd',
        cream: '#faf5ea',
        ink: '#211b14',
        mocha: '#4a3f33',
        sand: '#d8c9ac',
        accent: {
          DEFAULT: '#b8451f',
          soft: '#d2683f',
          deep: '#8a3015',
        },
        gold: '#c79a3e',
        vinyl: '#16120d',
      },
      fontFamily: {
        display: ['"Playfair Display"', 'Georgia', 'Cambria', 'serif'],
        serif: ['Georgia', 'Cambria', 'serif'],
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      boxShadow: {
        sleeve: '0 14px 34px -12px rgba(20, 14, 8, 0.55)',
        tile: '0 6px 18px -8px rgba(20, 14, 8, 0.45)',
      },
      backgroundImage: {
        grain:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.035'/%3E%3C/svg%3E\")",
      },
    },
  },
  plugins: [],
};
