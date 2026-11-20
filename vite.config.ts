import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  worker: { format: 'es' },
  test: {
    environment: 'node',
    include: ['tests/model/**/*.test.ts', 'tests/comparison/**/*.test.ts', 'tests/kiro/**/*.test.ts'],
  },
});
