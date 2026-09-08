import { test, expect } from '@playwright/test';
import { clearGames, dismissGuideIfShown, gameGuideResponse, logBrowserErrors } from '../helpers';
import { endTurn, endTurnButton } from '../firesout';

// fires-out-gdd.md §1's solitaire play, §17.6 step 12. Two things here only
// exist end to end and so can't be reached from vitest:
//
//  * the invitation with nobody in it. A solo game still goes through the
//    invite/accept engine (docs/new-game.md's solo gotcha) — the setup screen
//    creates an invitation with `userIdList: []` and immediately accepts it,
//    which is the one call where "has everyone accepted?" is vacuously true.
//    Nothing short of the real routes proves that deals a game.
//  * the turn never leaving the player. §17.4 makes `turnOver` true only when
//    the next figure has a different owner, so a solo board hands the turn
//    from figure to figure and stays "Your turn" throughout.
//
// Solitaire's own smoke spec is the shape this follows: one signed-in player,
// no invite flow, no second browser context.
test.use({ storageState: 'playwright/.auth/player-one.json' });

test.beforeEach(async ({ request }) => {
  await clearGames(request);
});

test.afterAll(async ({ request }) => {
  await clearGames(request);
});

test('start a solo Fires Out game and take two of the crew’s turns', async ({ page }) => {
  test.setTimeout(90_000);
  logBrowserErrors(page, 'player-one');

  await page.goto('/newgame/firesout');

  // Solo is the second of the two modes on the same form.
  await page.getByRole('button', { name: 'Play solo, running the whole crew' }).click();

  // The mode-dependent half of the screen: there is nobody to invite, so the
  // invite list and the open-seats picker are gone and a crew-size picker
  // stands in their place. The turn timer stays — a solo board the cron can
  // reach is step 12's own decision, and the timeout adapter declines such a
  // turn rather than forcing a fire nobody chose.
  await expect(page.getByPlaceholder('Add by username or email')).toHaveCount(0);
  const crewSelect = page.locator('select').filter({ hasText: '3 firefighters' });
  await crewSelect.selectOption('3');

  const guideReady = gameGuideResponse(page);
  await page.getByRole('button', { name: 'Start the shift' }).click();
  await page.waitForURL(/\/games\/firesout\/.+/);

  // The how-to-play guide auto-shows the first time an account opens a Fires
  // Out board, and its backdrop would swallow every click below.
  await guideReady;
  await dismissGuideIfShown(page, 'How to play Fires Out!');

  // Three figures, one seat: the crew is named per figure rather than per
  // player, since naming them by owner would label all three of them "You".
  await expect(page.getByText('Firefighter 1')).toBeVisible();
  await expect(page.getByText('Firefighter 3')).toBeVisible();
  await expect(page.getByText('Firefighter 4')).toHaveCount(0);
  await expect(page.getByText('Your turn')).toBeVisible();
  await expect(endTurnButton(page)).toBeEnabled();

  // Ending a figure's turn advances the fire and passes the turn to the next
  // figure — still the same player's, so the board stays playable rather than
  // going read-only waiting for somebody else.
  await endTurn(page);
  await expect(page.locator('.ag-score-pill--active')).toContainText('Firefighter 2');
  await expect(page.getByText('Your turn')).toBeVisible();
  await expect(endTurnButton(page)).toBeEnabled();

  await endTurn(page);
  await expect(page.locator('.ag-score-pill--active')).toContainText('Firefighter 3');
  await expect(page.getByText('Your turn')).toBeVisible();
});
