import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Keep Git/process-heavy tests deterministic on Windows CI runners.
    pool: 'threads',
    minWorkers: 1,
    maxWorkers: 1
  }
});
