import { test, expect } from '@playwright/test';
import { clearGames, clerkUserId, logBrowserErrors } from '../helpers';

// Proves the game-guide feature (src/utils/ui/gameGuides.ts) actually reaches
// the four games it was just wired into: get a live match on the board, open
// it from the ⋮ menu, and confirm the right guide's title shows up — then
// confirm dismissing it actually closes it. This is deliberately just the
// invite/accept plumbing from snakesandladders-turns.spec.ts plus the guide
// check, not a rules test — each game's own rules deserve their own spec.
//
// One parameterised test rather than four near-identical files: only the
// slug, display name and expected guide title change between games.
const GAMES = [
  { slug: 'dicecities', name: 'Dice Cities', guideTitle: 'How to play Dice Cities' },
  { slug: 'settlementsandcities', name: 'Settlements & Cities', guideTitle: 'How to play Settlements & Cities' },
  { slug: 'worlddomination', name: 'World Domination', guideTitle: 'How to play World Domination' },
  { slug: 'traintime', name: 'Train Time', guideTitle: 'How to play Train Time' },
];

test.afterAll(async ({ request }) => {
  await clearGames(request);
});

for (const game of GAMES) {
  test(`${game.name}: game guide opens from the options menu and closes`, async ({ browser }) => {
    test.setTimeout(60_000);

    const playerTwoUsername = process.env.E2E_PLAYER_TWO_USERNAME;
    if (!playerTwoUsername) {
      throw new Error('Missing E2E_PLAYER_TWO_USERNAME — set it to player two\'s Clerk username.');
    }

    const oneContext = await browser.newContext({ storageState: 'playwright/.auth/player-one.json' });
    const twoContext = await browser.newContext({ storageState: 'playwright/.auth/player-two.json' });
    const one = await oneContext.newPage();
    const two = await twoContext.newPage();

    logBrowserErrors(one, `${game.slug}-player-one`);
    logBrowserErrors(two, `${game.slug}-player-two`);

    // Player one sets up the match and invites player two by username.
    await one.goto(`/newgame/${game.slug}`);
    const usernameInput = one.getByPlaceholder('Add by username or email');
    await usernameInput.fill(playerTwoUsername);
    await usernameInput.press('Enter');
    await one.getByRole('button', { name: 'Send invites & start' }).click();
    await one.waitForURL('/');

    // Player two accepts. They're the only invitee, so accepting starts the
    // game immediately and lands them on its board.
    const inviteRow = two.locator('.ag-list-row', { hasText: game.name });
    await two.goto('/');
    await inviteRow.getByRole('button', { name: 'Accept' }).click();
    await two.waitForURL(new RegExp(`/games/${game.slug}/.+`));

    // Player one follows the same game directly, the way a push notification
    // link would take them there — a hard navigation, so wait for Clerk to
    // finish booting before touching the page.
    await one.goto(new URL(two.url()).pathname);
    await clerkUserId(one);

    await expect(one.getByText(game.name)).toBeVisible();

    // Auto-show is a once-per-account flag (useGameGuide) on real Clerk
    // accounts these tests reuse across runs, so this account may or may not
    // already have it marked "seen" — dismiss it first if it's up, so the
    // on-demand path below is exercised the same way either way.
    const guideText = one.getByText(game.guideTitle);
    if (await guideText.isVisible().catch(() => false)) {
      await one.getByRole('button', { name: 'Got it' }).click();
      await expect(guideText).not.toBeVisible();
    }

    await one.getByRole('button', { name: 'Game options' }).click();
    await one.getByRole('menuitem', { name: 'Game guide' }).click();

    await expect(guideText).toBeVisible();
    await one.getByRole('button', { name: 'Got it' }).click();
    await expect(guideText).not.toBeVisible();

    await oneContext.close();
    await twoContext.close();
  });
}
