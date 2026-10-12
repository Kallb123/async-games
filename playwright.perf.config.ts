import { defineConfig } from '@playwright/test';
import base from './playwright.config';

// The repeatable performance traces (docs/loading-performance-plan.md, Phase 0
// item 5): the same build, Clerk and database as the e2e smoke tests, but on a
// throttled phone and kept out of `npx playwright test`. Timings off a CI
// runner are too noisy to gate a commit on, so nothing here asserts a number;
// it fails only when a journey can't be completed. Run it with
// `npm run perf:journeys`; it writes its report to perf-report/ and its traces
// to test-results/perf/.
export default defineConfig({
  ...base,
  testMatch: /perf\/.*\.perf\.ts$/,
  outputDir: 'test-results/perf',
  retries: 0,
  reporter: 'list',
  use: { ...base.use, trace: 'off', screenshot: 'off' },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    { name: 'perf', dependencies: ['setup'] },
  ],
});
