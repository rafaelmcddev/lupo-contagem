import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontSize: {
        base: ['1.125rem', '1.75rem'],
        lg: ['1.375rem', '2rem'],
        xl: ['1.75rem', '2.25rem'],
        '2xl': ['2.25rem', '2.5rem'],
        '3xl': ['3rem', '1.1'],
        '4xl': ['4rem', '1.05'],
      },
      colors: {
        ink: '#0a0a0a',
        paper: '#ffffff',
        accent: '#0f62fe',
      },
    },
  },
  plugins: [],
};
export default config;
