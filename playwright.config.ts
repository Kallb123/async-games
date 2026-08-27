import { defineConfig, devices } from '@playwright/test';

// End-to-end smoke tests, run against a real build with a real (dev-instance)
// Clerk and a dedicated `asyncgames-e2e` Mongo database — see
// docs/environments.md. Kept separate from vitest (`npm test`), which covers
// the game engine and route handlers in isolation; this covers the paths
// that only exist once auth, Mongo and the client are wired together.
export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  // The signed-in users are shared, persistent Clerk accounts (see
  // e2e/auth.setup.ts) rather than one-per-test — running specs one at a
  // time avoids two specs racing on the same account's dashboard/games.
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['html', { open: 'never' }], ['list']] : 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
    },
  ],
  webServer: {
    // A production build, not `next dev`: closer to what actually ships, and
    // `next dev`'s overlay/HMR client gets in the way of Playwright's own
    // waiting. VERCEL_ENV=preview keeps `isDevDeployment` (src/utils/devEnvironment.ts)
    // true against that build, which is what gates the /api/dev/* wipe routes
    // e2e/global-setup.ts and e2e/auth.setup.ts rely on for cleanup.
    command: 'npm run build && npm run start',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      VERCEL_ENV: 'preview',
      NEXT_PUBLIC_VERCEL_ENV: 'preview',
    },
  },
});
