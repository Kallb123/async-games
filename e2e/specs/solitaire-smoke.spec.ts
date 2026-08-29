import { test, expect } from '@playwright/test';
import { clearGames } from '../helpers';

// The first, deliberately small E2E spec: prove the pipeline Vitest can't
// reach (Clerk session → middleware → API route → Mongo → client render)
// works end to end. Solitaire is solo, so this needs only one signed-in
// player and no lobby/invite flow — that's a separate spec once this is
// green in CI (see the E2E testing plan in docs/environments.md).
test.use({ storageState: 'playwright/.auth/player-one.json' });

test.afterAll(async ({ request }) => {
  await clearGames(request);
});

test('sign in, deal a solitaire game, and draw a card', async ({ page }) => {
  await page.goto('/newgame/solitaire');

  await page.getByRole('button', { name: 'Deal a new game' }).click();
  await page.waitForURL(/\/games\/solitaire\/.+/);

  await expect(page.getByText('Solitaire')).toBeVisible();
  const drawButton = page.getByRole('button', { name: 'Draw' });
  await expect(drawButton).toBeVisible();

  await drawButton.click();
  await expect(page.getByText(/failed/i)).not.toBeVisible();
});
