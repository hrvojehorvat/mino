import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // e2e specs share one real Postgres test DB and clean it in beforeEach;
    // running files in parallel causes cross-file cleanup races.
    fileParallelism: false,
  },
});
