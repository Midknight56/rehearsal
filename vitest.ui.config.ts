import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// UI, import and replay unit tests. Environment is node; a *.tsx test file opts into jsdom with the
// first-line comment `// @vitest-environment jsdom` (checked on Vitest 5.0.5: the component tests under tests/ui run in jsdom this way).
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['tests/ui/**/*.test.{ts,tsx}', 'tests/imports/**/*.test.ts', 'tests/replay/**/*.test.ts'],
  },
});