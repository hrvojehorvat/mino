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
      // Vite loads the base .env underneath .env.test regardless of mode, so
      // apps/api/.env's real Modal LLM_SERVICE_URL would otherwise leak into
      // these tests instead of the stub server batches-explain.e2e-spec.ts
      // starts on port 5002. Pin it back to that stub explicitly.
      LLM_SERVICE_URL: 'http://localhost:5002',
    },
  },
});
