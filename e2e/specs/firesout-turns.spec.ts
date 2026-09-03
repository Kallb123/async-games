import { test, expect, type Page } from '@playwright/test';
import { clearGames, clerkUserId, dismissGuideIfShown, gameGuideResponse, logBrowserErrors, reloadAndSettle } from '../helpers';

// fires-out-gdd.md §17.6 step 11: prove the game is actually playable end to
// end, now that meta.available is true — inviting a named player, each side
// taking a live turn, and the turn-recap machinery (useTurnNavigation +
// useTurnRecap, wired this step) surfacing for real. Mirrors
// snakesandladders-turns.spec.ts's invite/turn-taking shape; the game-specific
// part is dismissing the Advance Fire payoff screen (§17.6 step 7) every
// endTurn, and the "Review actions" control that only Fires Out among the
// invite-flow specs has from the very first turn (recapAvailable is true from
// creation — see FiresOutModels.ts's initialSpecificGameState snapshot).

test.beforeEach(async ({ request }) => {
  await clearGames(request);
});

test.afterAll(async ({ request }) => {
  await clearGames(request);
});

function endTurnButton(page: Page) {
  return page.getByRole('button', { name: /End turn/ });
}

// Turn order is drawn at random at setup (FiresOutModels.ts's CreateGame), so
// either player can go first.
async function findCurrentPlayer(pageA: Page, pageB: Page): Promise<{ current: Page; waiting: Page }> {
  await Promise.race([
    pageA.getByText('Your turn').waitFor({ state: 'visible' }),
    pageB.getByText('Your turn').waitFor({ state: 'visible' }),
  ]);
  return (await pageA.getByText('Your turn').isVisible())
    ? { current: pageA, waiting: pageB }
    : { current: pageB, waiting: pageA };
}

// Ends the active firefighter's turn (banking whatever AP is left — no board
// action is needed to make endTurn legal) and dismisses the Advance Fire
// payoff screen it always triggers (§17.6 step 7): the dice tumble for ~1s
// before the "Continue" button enables, so this waits for the roll to settle
// rather than racing it.
async function endTurn(page: Page): Promise<void> {
  const commandResponse = page.waitForResponse((res) => res.url().includes('/api/game/command'), { timeout: 60_000 });
  await endTurnButton(page).click();
  const response = await commandResponse;
  if (!response.ok()) {
    throw new Error(`End turn command rejected: ${response.status()} ${await response.text()}`);
  }

  const continueButton = page.getByRole('button', { name: 'Continue' });
  await expect(continueButton).toBeEnabled({ timeout: 5_000 });
  await continueButton.click();
}

test('invite a player, start a game, and take a turn each', async ({ browser }) => {
  test.setTimeout(90_000);

  const playerTwoUsername = process.env.E2E_PLAYER_TWO_USERNAME;
  if (!playerTwoUsername) {
    throw new Error('Missing E2E_PLAYER_TWO_USERNAME — set it to player two\'s Clerk username.');
  }

  const oneContext = await browser.newContext({ storageState: 'playwright/.auth/player-one.json' });
  const twoContext = await browser.newContext({ storageState: 'playwright/.auth/player-two.json' });
  const one = await oneContext.newPage();
  const two = await twoContext.newPage();

  logBrowserErrors(one, 'player-one');
  logBrowserErrors(two, 'player-two');

  await Promise.all([one.goto('/'), two.goto('/')]);
  const [oneId, twoId] = await Promise.all([clerkUserId(one), clerkUserId(two)]);
  if (!oneId || !twoId || oneId === twoId) {
    throw new Error(
      `Expected two distinct signed-in players; got player-one=${oneId ?? 'unknown'} and player-two=${twoId ?? 'unknown'}. ` +
      'Check that E2E_PLAYER_TWO_EMAIL/PASSWORD and E2E_PLAYER_TWO_USERNAME really name a second Clerk account, distinct from player one.'
    );
  }

  // Player one sets up Fires Out (the Family game — the form's own default)
  // and invites player two by username.
  await one.goto('/newgame/firesout');
  const usernameInput = one.getByPlaceholder('Add by username or email');
  await usernameInput.fill(playerTwoUsername);
  await usernameInput.press('Enter');
  await one.getByRole('button', { name: 'Send invites & start' }).click();
  await one.waitForURL('/');

  // Player two accepts. They're the only invitee, so accepting starts the
  // game immediately and lands them on its board.
  const inviteRow = two.locator('.ag-list-row', { hasText: 'Fires Out' });
  await two.goto('/');
  const twoGuideReady = gameGuideResponse(two);
  await inviteRow.getByRole('button', { name: 'Accept' }).click();
  await two.waitForURL(/\/games\/firesout\/.+/);

  // Player one follows the same game directly, the way a push notification
  // link would take them there — a hard navigation, so wait for Clerk to boot.
  const oneGuideReady = gameGuideResponse(one);
  await one.goto(new URL(two.url()).pathname);
  await clerkUserId(one);

  // Both players are on this board for the first time, so the how-to-play
  // guide auto-shows (useGameGuide) until each account has seen it once —
  // and its modal backdrop would swallow every board click below. Settle the
  // fetch that decides, then close it if it opened.
  await Promise.all([oneGuideReady, twoGuideReady]);
  await dismissGuideIfShown(one, 'How to play Fires Out!');
  await dismissGuideIfShown(two, 'How to play Fires Out!');

  // Exact match: the guide's own title contains the game's name, so a plain
  // getByText would match both whenever the guide is on screen.
  await expect(one.getByText('Fires Out!', { exact: true })).toBeVisible();
  await expect(two.getByText('Fires Out!', { exact: true })).toBeVisible();

  // recapAvailable is true from creation (the initial-state snapshot is
  // written by CreateGame, not earned by playing) — "Review actions" should
  // already be offered before anyone has taken a turn.
  await expect(one.getByRole('button', { name: /Review actions/ })).toBeVisible();
  await expect(two.getByRole('button', { name: /Review actions/ })).toBeVisible();

  // Whoever won the running-order draw takes the first turn.
  const { current: first, waiting: second } = await findCurrentPlayer(one, two);
  await expect(endTurnButton(second)).toBeDisabled();

  await endTurn(first);

  // The turn passed to the other player — a fresh load may land them on the
  // "since you were last here" recap first (the fire the first player's
  // endTurn triggered), which needs dismissing before the board underneath is
  // usable.
  await reloadAndSettle(second, endTurnButton(second));
  await expect(second.getByText('Your turn')).toBeVisible();
  await expect(endTurnButton(first)).toBeDisabled();

  await endTurn(second);

  // ...and back again — both players have now each taken a live turn, and the
  // fire has advanced twice.
  await reloadAndSettle(first, endTurnButton(first));
  await expect(first.getByText('Your turn')).toBeVisible();

  await oneContext.close();
  await twoContext.close();
});
