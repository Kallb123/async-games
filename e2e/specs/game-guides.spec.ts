import { test, expect, type Page } from '@playwright/test';
import { clearGames, clerkUserId, dismissGuideIfShown, gameGuideResponse, logBrowserErrors } from '../helpers';

// Proves the game-guide feature (src/utils/ui/gameGuides.ts) actually reaches
// every game it was wired into: get a live match on the board, open it from
// the ⋮ menu, and confirm the right guide's title shows up — then confirm
// dismissing it actually closes it. This is deliberately just the
// invite/accept plumbing from snakesandladders-turns.spec.ts (and, for
// Settlements & Cities, outbreak-guest-invite.spec.ts's guest-fills-a-seat
// plumbing too) plus the guide check, not a rules test — each game's own
// rules deserve their own spec.

// Runs before every attempt, retries included — a retry re-invites player two
// from scratch, and a stale invitation left behind by the attempt that just
// failed would otherwise sit alongside the new one, making a `.ag-list-row`
// lookup by game name match two rows instead of one.
test.beforeEach(async ({ request }) => {
  await clearGames(request);
});

test.afterAll(async ({ request }) => {
  await clearGames(request);
});

// Opens the game guide from the ⋮ menu on `page` and confirms it shows the
// right title, then closes it again. Shared by every game below — only how
// each one's board is reached differs; the guide check itself never does.
async function checkGuideFromMenu(page: Page, guideTitle: string): Promise<void> {
  // Dismiss it first if it auto-showed, so the on-demand path below is
  // exercised the same way whether or not this account has seen it already.
  await dismissGuideIfShown(page, guideTitle);

  const guideText = page.getByText(guideTitle);
  await page.getByRole('button', { name: 'Game options' }).click();
  await page.getByRole('menuitem', { name: 'Game guide' }).click();

  // Now it's definitely up, so the shared dismiss is guaranteed to fire —
  // which keeps the "Got it" label named in one place rather than two.
  await expect(guideText).toBeVisible();
  await dismissGuideIfShown(page, guideTitle);
}

// The games whose 2-player minimum this suite's two persistent test accounts
// can satisfy on their own. Settlements & Cities can't (see below), so it gets
// its own test rather than a slot in this list.
const TWO_PLAYER_GAMES = [
  { slug: 'dicecities', name: 'Dice Cities', guideTitle: 'How to play Dice Cities' },
  { slug: 'worlddomination', name: 'World Domination', guideTitle: 'How to play World Domination' },
  { slug: 'traintime', name: 'Train Time', guideTitle: 'How to play Train Time' },
  { slug: 'firesout', name: 'Fires Out!', guideTitle: 'How to play Fires Out!' },
];

for (const game of TWO_PLAYER_GAMES) {
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
    const guidesReady = gameGuideResponse(one);
    await one.goto(new URL(two.url()).pathname);
    await clerkUserId(one);
    await guidesReady;

    // Exact match: the guide modal's own title ("How to play <name>") also
    // contains the game's display name as a substring, so a plain getByText
    // for the topbar would ambiguously match both whenever the guide has
    // auto-opened underneath it.
    await expect(one.getByText(game.name, { exact: true })).toBeVisible();

    await checkGuideFromMenu(one, game.guideTitle);

    await oneContext.close();
    await twoContext.close();
  });
}

// Settlements & Cities' base ruleset seats 3+ (computePlayerBounds in
// expansions.ts) — the only expansions that natively support 2 players,
// Traders & Raiders and Explorers & Pirates, are still "Coming soon" and
// disabled in the setup form (SAC_EXPANSION_META), so there's no way to get
// a valid 2-player match, and this suite only has two persistent accounts.
// Reach 3 the way a real host with an odd-numbered table would: invite
// player two by name *and* open one more seat, then have a brand-new
// signed-out context claim that seat as a guest — the same account-less path
// outbreak-guest-invite.spec.ts proves end to end.
test('Settlements & Cities: game guide opens from the options menu and closes', async ({ browser }) => {
  test.setTimeout(90_000);

  const playerTwoUsername = process.env.E2E_PLAYER_TWO_USERNAME;
  if (!playerTwoUsername) {
    throw new Error('Missing E2E_PLAYER_TWO_USERNAME — set it to player two\'s Clerk username.');
  }

  const hostContext = await browser.newContext({ storageState: 'playwright/.auth/player-one.json' });
  const namedContext = await browser.newContext({ storageState: 'playwright/.auth/player-two.json' });
  const guestContext = await browser.newContext();
  const host = await hostContext.newPage();
  const named = await namedContext.newPage();
  const guest = await guestContext.newPage();

  logBrowserErrors(host, 'sac-host');
  logBrowserErrors(named, 'sac-named');
  logBrowserErrors(guest, 'sac-guest');

  // Host invites player two by name and opens one more seat — host + named
  // invitee + one code-holder is a legal 3-player base-game party.
  await host.goto('/newgame/settlementsandcities');
  const usernameInput = host.getByPlaceholder('Add by username or email');
  await usernameInput.fill(playerTwoUsername);
  await usernameInput.press('Enter');

  const seatSelect = host.locator('select.ag-select').filter({
    has: host.locator('option', { hasText: 'join by code' }),
  });
  await seatSelect.selectOption('1');
  await host.getByRole('button', { name: 'Send invites & get code' }).click();

  await host.waitForURL(/\/lobby\/.+/);
  // Default assertion timeout (5s) can be tight for the lobby's first
  // `/api/lobby/[id]` fetch on a CI runner already a few tests into the run —
  // give it the same headroom as the other network round trips in this suite.
  const codeEl = host.locator('.ag-joincode');
  await expect(codeEl).toHaveText(/^[A-HJ-NP-Z2-9]{4}$/, { timeout: 15_000 });
  const joinCode = (await codeEl.textContent())!.trim();

  // Player two accepts their named seat — this alone doesn't start the game
  // yet, since the open seat is still unclaimed.
  const inviteRow = named.locator('.ag-list-row', { hasText: 'Settlements & Cities' });
  await named.goto('/');
  await inviteRow.getByRole('button', { name: 'Accept' }).click();

  // A guest claims the last, open seat — the party is now full, so this is
  // what actually starts the game.
  await guest.goto(`/join?code=${joinCode}`);
  const nameInput = guest.locator('#guest-name');
  await expect(nameInput).toBeVisible();
  await guest.waitForFunction(
    () => (window as unknown as { Clerk?: { loaded?: boolean } }).Clerk?.loaded === true,
    undefined,
    { timeout: 15_000 }
  );
  await nameInput.fill('SettlerSam');
  await guest.getByRole('button', { name: 'Join game' }).click();
  await guest.getByRole('button', { name: 'Continue to lobby' }).click();
  await guest.waitForURL(/\/games\/settlementsandcities\/.+/);

  // The host's lobby notices the game started and carries them to the same
  // board, the way it does for any lobby.
  const guidesReady = gameGuideResponse(host);
  await host.waitForURL(/\/games\/settlementsandcities\/.+/, { timeout: 30_000 });
  await guidesReady;

  await expect(host.getByText('Settlements & Cities', { exact: true })).toBeVisible();
  await checkGuideFromMenu(host, 'How to play Settlements & Cities');

  await hostContext.close();
  await namedContext.close();
  await guestContext.close();
});
