import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
    '../../packages/ui/src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#fef3e2',
          100: '#fde7c0',
          200: '#fbd08d',
          300: '#f8b452',
          400: '#f69c27',
          500: '#e8850f',
          600: '#cc690b',
          700: '#a64f0d',
          800: '#863f12',
          900: '#6d3513',
        },
        // Warm, friendly green — pairs with the orange "primary" palette for
        // a children's-platform feel (success states, badges, accents).
        secondary: {
          50: '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          300: '#86efac',
          400: '#4ade80',
          500: '#22c55e',
          600: '#16a34a',
          700: '#15803d',
          800: '#166534',
          900: '#14532d',
        },
      },
      fontFamily: {
        arabic: ['var(--font-ibm-plex-arabic)', '"Noto Naskh Arabic"', 'serif'],
        sans: ['var(--font-inter)', 'var(--font-ibm-plex-arabic)', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
