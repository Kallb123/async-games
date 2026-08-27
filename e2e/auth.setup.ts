import { test as setup } from '@playwright/test';
import { clerk } from '@clerk/testing/playwright';

// Signs each standing test user in once and saves their session, so specs
// start already authenticated instead of driving Clerk's UI every time.
// The users themselves are provisioned by hand in the Clerk dev instance
// (docs/environments.md) — password auth, no email verification needed
// there — and named here only by the env vars carrying their credentials.
const USERS = [
  {
    email: process.env.E2E_PLAYER_ONE_EMAIL,
    password: process.env.E2E_PLAYER_ONE_PASSWORD,
    storageState: 'playwright/.auth/player-one.json',
  },
  {
    email: process.env.E2E_PLAYER_TWO_EMAIL,
    password: process.env.E2E_PLAYER_TWO_PASSWORD,
    storageState: 'playwright/.auth/player-two.json',
  },
] as const;

for (const user of USERS) {
  setup(`authenticate ${user.storageState}`, async ({ page }) => {
    if (!user.email || !user.password) {
      throw new Error(
        `Missing E2E credentials for ${user.storageState} — set the corresponding *_EMAIL/*_PASSWORD env vars.`
      );
    }

    // clerk.signIn needs a prior navigation to a page that loads Clerk, but
    // not one behind useAuthGuard — "/" renders the public Landing page for
    // a signed-out visitor (src/components/Dashboard.tsx).
    await page.goto('/');
    await clerk.signIn({
      page,
      signInParams: { strategy: 'password', identifier: user.email, password: user.password },
    });

    // A freshly signed-in Clerk user isn't `publicMetadata.unlocked` yet —
    // useAuthGuard (src/utils/hooks/useAuthGuard.ts) sends anyone who isn't
    // to /unlockaccess before they can reach any other authenticated screen,
    // same as a real signup would hit. Unlock through the real endpoint
    // rather than presetting the Clerk user's metadata by hand, so this
    // keeps working however the gate itself changes.
    if (process.env.ACCESS_PASSWORD) {
      const unlock = await page.request.post('/api/unlock', {
        data: { password: process.env.ACCESS_PASSWORD },
      });
      if (!unlock.ok()) {
        throw new Error(`Failed to unlock ${user.storageState}: ${unlock.status()} ${await unlock.text()}`);
      }
    }

    await page.goto('/');
    await page.context().storageState({ path: user.storageState });
  });
}
