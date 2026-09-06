import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      fontSize: {
        sm: ['0.875rem', '1.25rem'],
        base: ['1rem', '1.5rem'],
        lg: ['1.125rem', '1.75rem'],
        xl: ['1.375rem', '1.75rem'],
        '2xl': ['1.75rem', '2.1rem'],
        '3xl': ['2.25rem', '1.15'],
        '4xl': ['2.75rem', '1.1'],
      },
      colors: {
        ink: '#1A1D22',
        paper: '#FFFFFF',
        canvas: '#F4F4F2',
        accent: {
          DEFAULT: '#0E6E64',
          dark: '#0A5750',
          light: '#E4F1EF',
        },
        warning: {
          DEFAULT: '#B7791F',
          light: '#FBF0DC',
        },
        danger: {
          DEFAULT: '#B3261E',
          light: '#FBE9E8',
        },
        success: {
          DEFAULT: '#1E7A4C',
          light: '#E4F3EA',
        },
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.125rem',
      },
    },
  },
  plugins: [],
};
export default config;
