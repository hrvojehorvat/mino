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
    env: {
      // Each spec's beforeEach spins up a full Nest app, registering a live
      // MlService cron. Since the sweep is wall-clock-aligned
      // (*/30 * * * * *), it can otherwise fire mid-test and race a test's
      // own direct MLResult writes (see ml.service.ts's sweepPending).
      // On-demand compute (GET /batches/:id) is unaffected and still
      // exercised by this suite.
      DISABLE_ML_SWEEP: 'true',
    },
  },
});
