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

// The Clerk user id the page is signed in as. Clerk's JS hydrates
// asynchronously after the page itself has loaded, so this polls for
// `window.Clerk.user.id` rather than reading it once — a page that just
// navigated hasn't necessarily had time to hydrate yet, and reading too
// early would misreport a slower page as signed in as nobody.
async function clerkUserId(page: Page): Promise<string | undefined> {
  try {
    const handle = await page.waitForFunction(
      () => (window as unknown as { Clerk?: { user?: { id?: string } } }).Clerk?.user?.id,
      undefined,
      { timeout: 15_000 }
    );
    return (await handle.jsonValue()) as string | undefined;
  } catch {
    return undefined;
  }
}

// page.reload() is a full page load just like a fresh navigation — Clerk has
// to boot its client SDK again from nothing. The first version of this test
// only waited for that after the very first hard navigation and hit "Unable
// to send command whilst not logged in" on a *later* reload instead: whoever
// is waiting for the turn to come back gets reloaded mid-test to pick up the
// opponent's move, and needs the same wait every time, not just once.
async function reloadAndSettle(page: Page): Promise<void> {
  await page.reload();
  await clerkUserId(page);
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

// Clicks the roll button and confirms the server actually accepted the move,
// rather than clicking and silently waiting on a result screen that never
// comes: useSubmitCommand swallows a non-2xx /api/game/command response (it
// just resyncs via getGameData()), so a rejected roll would otherwise show up
// as this test hanging on the next step with no clue why. Also races a
// `requestfailed` listener against the response: the app's own client-side
// fetch aborts after 30s (COMMAND_TIMEOUT_MS in useSubmitCommand.ts) with no
// response ever arriving, which a bare waitForResponse can't tell apart from
// "still working" until this whole test's own timeout gives up on it.
async function roll(page: Page): Promise<void> {
  const button = rollButton(page);
  // hasRolled/currentTurn were confirmed correct server-side right before the
  // second roll and it still silently did nothing — no request, no error.
  // The only other silent no-op in useSubmitCommand is its in-flight guard
  // (`if (inFlightRef.current) return;`), which the button's own pending/
  // disabled state (ActionButton's `ag-btn--pending` class, ag-btn's
  // `disabled`) would reflect. Logged here, at the actual click boundary,
  // rather than guessed at again.
  const [isDisabled, className] = await Promise.all([button.isDisabled(), button.getAttribute('class')]);
  console.log(`[diagnostic] roll button before click: disabled=${isDisabled} class=${className}`);

  const commandResponse = page.waitForResponse((res) => res.url().includes('/api/game/command'), { timeout: 60_000 });
  const requestFailed = new Promise<never>((_, reject) => {
    page.on('requestfailed', (req) => {
      if (req.url().includes('/api/game/command')) {
        reject(new Error(`Roll command request failed: ${req.failure()?.errorText ?? 'unknown error'}`));
      }
    });
  });
  await button.click();
  const response = await Promise.race([commandResponse, requestFailed]);
  if (!response.ok()) {
    throw new Error(`Roll command rejected: ${response.status()} ${await response.text()}`);
  }
}

// Prints a page's console.error output and uncaught exceptions to this
// process's own stdout (Playwright's reporter doesn't forward these), tagged
// so a failure can tell which of the two players it came from.
function logBrowserErrors(page: Page, label: string): void {
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      console.log(`[${label} console.error] ${msg.text()}`);
    }
  });
  page.on('pageerror', (err) => {
    console.log(`[${label} pageerror] ${err.message}`);
  });
}

test('invite a player, start a game, and take a turn each', async ({ browser }) => {
  // Two browser contexts, several full page loads and a round trip through
  // Mongo on every step add up to more than Playwright's default 30s test
  // timeout, which solitaire-smoke.spec.ts's single-page, single-request path
  // never has to worry about.
  test.setTimeout(90_000);

  const playerTwoUsername = process.env.E2E_PLAYER_TWO_USERNAME;
  if (!playerTwoUsername) {
    throw new Error('Missing E2E_PLAYER_TWO_USERNAME — set it to player two\'s Clerk username.');
  }

  const oneContext = await browser.newContext({ storageState: 'playwright/.auth/player-one.json' });
  const twoContext = await browser.newContext({ storageState: 'playwright/.auth/player-two.json' });
  const one = await oneContext.newPage();
  const two = await twoContext.newPage();

  // The last run showed no network activity at all for the roll click within
  // 60s — no response, no requestfailed — which points at the click never
  // reaching handleRoll's fetch in the first place, not a slow server. A
  // client-side exception there would do exactly that (and print to the
  // console) with nothing visible in the UI. Surfaced into this test's own
  // stdout, since Playwright doesn't forward page console/errors by default.
  logBrowserErrors(one, 'player-one');
  logBrowserErrors(two, 'player-two');

  // Fail fast, with a clear reason, rather than a confusing hang later: this
  // whole spec only makes sense played against two distinct accounts, and a
  // shared currentTurn would otherwise make both players' boards agree
  // they're each up, indistinguishably from a genuine one-current-player bug.
  await Promise.all([one.goto('/'), two.goto('/')]);
  const [oneId, twoId] = await Promise.all([clerkUserId(one), clerkUserId(two)]);
  if (!oneId || !twoId || oneId === twoId) {
    throw new Error(
      `Expected two distinct signed-in players; got player-one=${oneId ?? 'unknown'} and player-two=${twoId ?? 'unknown'}. ` +
      'Check that E2E_PLAYER_TWO_EMAIL/PASSWORD and E2E_PLAYER_TWO_USERNAME really name a second Clerk account, distinct from player one.'
    );
  }

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
  // link would take them there. Unlike player two's arrival just above (a
  // client-side route push from an already-hydrated app), this is a hard
  // navigation — a full page load that has to boot Clerk's client SDK from
  // scratch. A real person wouldn't act within milliseconds of that, but
  // Playwright does: the last two runs both hit "Unable to send command
  // whilst not logged in" clicking Roll here, so wait for Clerk to actually
  // finish loading before touching the page at all.
  await one.goto(new URL(two.url()).pathname);
  await clerkUserId(one);

  await expect(one.getByText('Snakes & Ladders')).toBeVisible();
  await expect(two.getByText('Snakes & Ladders')).toBeVisible();

  // Ground truth from the server itself, logged before trusting the UI any
  // further: the last run had both players' roll buttons stably visible at
  // once (14 straight polls over 5s), which — since currentTurn is a single
  // shared field — should be impossible for two genuinely distinct accounts
  // unless something server-side is actually wrong, not just a client race.
  const gameApiPath = `/api/game/${new URL(two.url()).pathname.split('/').pop()}`;
  const [oneView, twoView] = await Promise.all([
    one.request.get(gameApiPath).then((r) => r.json()),
    two.request.get(gameApiPath).then((r) => r.json()),
  ]);
  console.log(`[diagnostic] player-one (${oneId}) sees currentTurn=${oneView?.gameData?.currentTurn}`);
  console.log(`[diagnostic] player-two (${twoId}) sees currentTurn=${twoView?.gameData?.currentTurn}`);

  // Whoever won the roll-off takes the first turn.
  const { current: first, waiting: second } = await findCurrentPlayer(one, two);
  await expect(rollButton(second)).not.toBeVisible();

  await roll(first);
  await first.getByRole('button', { name: /End turn/ }).click();

  // The turn passed to the other player.
  await reloadAndSettle(second);
  await expect(rollButton(second)).toBeVisible();
  await expect(rollButton(first)).not.toBeVisible();

  // The second roll has hung silently twice now (no response, no
  // requestfailed, no console error) — the click DOM-wise succeeds but
  // nothing happens, which is exactly what SnakesAndLaddersPlayerActions'
  // own `if (!hasRolled) onRoll?.()` guard would do if hasRolled were
  // unexpectedly already true. Ground truth before the click, not after.
  const secondView = await second.request.get(gameApiPath).then((r) => r.json());
  console.log(`[diagnostic] before second roll: hasRolled=${secondView?.gameData?.specificGameState?.hasRolled} currentTurn=${secondView?.gameData?.currentTurn}`);

  await roll(second);
  await second.getByRole('button', { name: /End turn/ }).click();

  // ...and back again — both players have now each taken a live turn.
  await reloadAndSettle(first);
  await expect(rollButton(first)).toBeVisible();

  await oneContext.close();
  await twoContext.close();
});
