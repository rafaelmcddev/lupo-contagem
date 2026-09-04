import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { TEST_DATABASE_URL } from './tests/testDbUrl';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setupMatchers.ts'],
    env: { DATABASE_URL: TEST_DATABASE_URL },
    globalSetup: ['./tests/globalSetup.ts'],
  },
});
