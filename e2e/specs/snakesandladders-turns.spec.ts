import { test, expect, type Page } from '@playwright/test';

// The multiplayer follow-up to solitaire-smoke.spec.ts: prove the two-player
// path solitaire can't reach — inviting a named player, that player accepting
// and starting the game, and each side taking a turn against the other's live
// state — end to end. Snakes & Ladders needs only a dice roll per turn, no
// game-specific setup beyond who's playing, which keeps this close to a pure
// invite/turn-taking test rather than one about a particular game's rules.
//
// Player two is invited by their Clerk *username* (usersByUsername, not
// email — see readGameSetupRequest), so this needs one more secret than
// e2e/auth.setup.ts's sign-in credentials: E2E_PLAYER_TWO_USERNAME.

test.afterAll(async ({ request }) => {
  // Same dev-only wipe routes as solitaire-smoke.spec.ts — see its comment.
  await request.get('/api/dev/clearlive');
  await request.get('/api/dev/clearresults');
});

function rollButton(page: Page) {
  return page.getByRole('button', { name: /Roll the die/ });
}

// Turn order is decided by a roll-off (SnakesAndLaddersModels.ts), so either
// player can go first. Whichever page shows the roll button first is "up".
async function findCurrentPlayer(pageA: Page, pageB: Page): Promise<{ current: Page; waiting: Page }> {
  await Promise.race([
    rollButton(pageA).waitFor({ state: 'visible' }),
    rollButton(pageB).waitFor({ state: 'visible' }),
  ]);
  return (await rollButton(pageA).isVisible())
    ? { current: pageA, waiting: pageB }
    : { current: pageB, waiting: pageA };
}

test('invite a player, start a game, and take a turn each', async ({ browser }) => {
  const playerTwoUsername = process.env.E2E_PLAYER_TWO_USERNAME;
  if (!playerTwoUsername) {
    throw new Error('Missing E2E_PLAYER_TWO_USERNAME — set it to player two\'s Clerk username.');
  }

  const oneContext = await browser.newContext({ storageState: 'playwright/.auth/player-one.json' });
  const twoContext = await browser.newContext({ storageState: 'playwright/.auth/player-two.json' });
  const one = await oneContext.newPage();
  const two = await twoContext.newPage();

  // Player one sets up Snakes & Ladders and invites player two by username.
  await one.goto('/newgame/snakesandladders');
  const usernameInput = one.getByPlaceholder('Add by username or email');
  await usernameInput.fill(playerTwoUsername);
  await usernameInput.press('Enter');
  await one.getByRole('button', { name: 'Send invites & start' }).click();
  await one.waitForURL('/');

  // Player two accepts the invite. They're the only invitee, so accepting
  // starts the game immediately and lands them on its board.
  const inviteRow = two.locator('.ag-list-row', { hasText: 'Snakes' });
  await two.goto('/');
  await inviteRow.getByRole('button', { name: 'Accept' }).click();
  await two.waitForURL(/\/games\/snakesandladders\/.+/);

  // Player one follows the same game directly, the way a push notification
  // link would take them there.
  await one.goto(new URL(two.url()).pathname);

  await expect(one.getByText('Snakes & Ladders')).toBeVisible();
  await expect(two.getByText('Snakes & Ladders')).toBeVisible();

  // Whoever won the roll-off takes the first turn.
  const { current: first, waiting: second } = await findCurrentPlayer(one, two);
  await expect(rollButton(second)).not.toBeVisible();

  await rollButton(first).click();
  await first.getByRole('button', { name: /End turn/ }).click();

  // The turn passed to the other player.
  await second.reload();
  await expect(rollButton(second)).toBeVisible();
  await expect(rollButton(first)).not.toBeVisible();

  await rollButton(second).click();
  await second.getByRole('button', { name: /End turn/ }).click();

  // ...and back again — both players have now each taken a live turn.
  await first.reload();
  await expect(rollButton(first)).toBeVisible();

  await oneContext.close();
  await twoContext.close();
});
