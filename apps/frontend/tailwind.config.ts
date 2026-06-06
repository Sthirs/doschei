import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{vue,ts}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f4f7ff',
          100: '#e7eeff',
          500: '#4f6cf7',
          600: '#3b57db',
          900: '#111936',
        },
      },
      boxShadow: {
        glow: '0 20px 60px -20px rgba(79, 108, 247, 0.45)',
      },
    },
  },
  plugins: [],
} satisfies Config;
