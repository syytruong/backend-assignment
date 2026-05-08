import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['tests/**/*.test.ts'],
    env: {
      NODE_ENV: 'test',
      DATABASE_PATH: ':memory:',
    },
    // Tests share a process; run them sequentially so the in-memory DB
    // singleton doesn't bleed state across files.
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
  },
});
