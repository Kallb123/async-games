import { expect, type APIRequestContext, type Locator, type Page } from '@playwright/test';

// Helpers shared by the specs — game-agnostic bits that would otherwise be
// copy-pasted into each one. Anything about a particular game's board (roll
// buttons, recap screens) stays local to that game's spec.

// The teardown every spec runs: the dev-only wipe routes (src/app/api/dev/*,
// 404 unless VERCEL_ENV/NODE_ENV says this is a dev deployment) that clear the
// live game and any GameResult it produced, so the dedicated e2e database
// doesn't accumulate a game per run. Any signed-in request can call them (see
// wipeRoute.ts); a guest-only spec has none, so the host's request drives it.
export async function clearGames(request: APIRequestContext): Promise<void> {
  await request.get('/api/dev/clearlive');
  await request.get('/api/dev/clearresults');
}

// The Clerk user id the page is signed in as. Clerk's JS hydrates
// asynchronously after the page itself has loaded, so this polls for
// `window.Clerk.user.id` rather than reading it once — a page that just
// navigated hasn't necessarily had time to hydrate yet, and reading too
// early would misreport a slower page as signed in as nobody.
export async function clerkUserId(page: Page): Promise<string | undefined> {
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

// The recap's dismiss button, scoped to its own CTA class rather than text:
// it has no server round trip of its own, and a bare text match can't tell it
// apart from the real live action (e.g. both "Roll the die" and a recap CTA
// worded the same way).
function recapCta(page: Page): Locator {
  return page.locator('button.ag-recap-cta');
}

// Waits for the page's own "since you were last here" request to come back and
// reports whether it said there is a recap to dismiss.
//
// A game screen fires this request and its game-data request independently on
// load, and *either* can win: useTurnRecap.ts renders nothing while the recap
// is still loading, so a board whose data lands first is painted, interactive,
// and then replaced by the recap screen the moment the slower request answers.
// Deciding from the screen alone is therefore a race — see waitForRecapAnswer's
// caller — so this asks the network instead of guessing from the DOM.
//
// 401s are skipped rather than believed: fetchWithSessionRetry.ts retries one
// transient 401 (Clerk's session cookie refreshing after a reload), so the
// first response can be a 401 that a real answer follows a second later.
// Resolves false if no answer arrives at all, leaving the caller to fall back
// to reading the screen.
async function waitForRecapAnswer(page: Page): Promise<boolean> {
  const response = await page
    .waitForResponse(
      (res) => new URL(res.url()).pathname.endsWith('/recap') && res.status() !== 401,
      { timeout: 15_000 },
    )
    .catch(() => null);
  if (!response?.ok()) {
    return false;
  }
  return await response.json().then((body) => body?.hasRecap === true).catch(() => false);
}

// Dismisses the "since you were last here" recap screen if it's showing,
// reading the screen rather than the network. `liveButton` is the locator for
// the board's real live action — whichever one proves the board (rather than
// the recap) is what's showing.
//
// The last resort, for when the recap request gave no answer at all: a visible
// `liveButton` only proves the recap isn't showing *yet*, so this can't tell a
// game with no recap apart from one whose recap is still in flight.
async function dismissRecapFromScreen(page: Page, liveButton: Locator): Promise<void> {
  const cta = recapCta(page);
  await Promise.race([
    cta.waitFor({ state: 'visible' }),
    liveButton.waitFor({ state: 'visible' }),
  ]).catch(() => {});
  if (await cta.isVisible().catch(() => false)) {
    await cta.click();
  }
}

// page.reload() is a full page load just like a fresh navigation — Clerk has
// to boot its client SDK again from nothing, and it can land on the recap
// screen instead of the board. Whoever is waiting for the turn to come back
// gets reloaded mid-test to pick it up, so both need handling every time.
//
// The recap is settled before returning, not merely "not showing yet": the
// board painting first doesn't mean there is no recap, only that its request
// hasn't answered. A test that read the screen at that moment carried on with
// an undismissed recap still in flight, which then landed on top of whatever
// the test did next — a click that worked, followed by a result screen that
// was never rendered because the recap had replaced the board underneath it.
export async function reloadAndSettle(page: Page, liveButton: Locator): Promise<void> {
  const recapAnswer = waitForRecapAnswer(page);
  await page.reload();
  await clerkUserId(page);
  if (await recapAnswer) {
    // There is one, so wait for its CTA rather than racing the board: the
    // recap screen renders a tick after the response, and by then the board
    // may already have been visible for a second.
    await recapCta(page).click();
  } else {
    // No recap, or no answer at all — fall back to reading the screen.
    await dismissRecapFromScreen(page, liveButton);
  }
  await liveButton.waitFor({ state: 'visible' });
}

// The board's auto-show game guide depends on an async `/api/gameguides` fetch
// (useGameGuide) that fires on mount. Without waiting for it, a still-in-
// flight request can resolve moments after a test has decided the guide isn't
// up, popping it open right as the next click lands and jamming every
// following interaction behind its modal backdrop (a Bootstrap modal's
// backdrop blocks clicks on whatever's underneath, even though that content
// is still Playwright-"visible"). Callers set this up around whatever
// navigation mounts the board — a hard nav or a client-side route change
// alike — so it's already listening before the request can fire.
export function gameGuideResponse(page: Page) {
  return page.waitForResponse((res) => res.url().includes('/api/gameguides'), { timeout: 30_000 }).catch(() => {});
}

// Closes the guide if it auto-showed. Auto-show is a once-per-account flag
// (useGameGuide) and these specs reuse real Clerk accounts across runs, so an
// account may or may not already have a given game marked "seen" — every spec
// that touches the board of a game with a guide has to cope with both. Pair it
// with `gameGuideResponse` above, or the fetch can still be in flight here.
export async function dismissGuideIfShown(page: Page, guideTitle: string): Promise<void> {
  const guideText = page.getByText(guideTitle);
  // `gameGuideResponse` resolves when the response reaches Playwright, which
  // is a tick or two before useGameGuide's `.then` and React's render put the
  // modal on screen — so give it that beat rather than reading the screen the
  // instant the fetch lands. A caller that has already awaited something else
  // in between loses nothing by it; one that hasn't would otherwise decide
  // "no guide" just before it opens.
  await guideText.waitFor({ state: 'visible', timeout: 2_000 }).catch(() => {});
  if (await guideText.isVisible().catch(() => false)) {
    await page.getByRole('button', { name: 'Got it' }).click();
    await expect(guideText).not.toBeVisible();
  }
}

// Prints a page's console.error output and uncaught exceptions to this
// process's own stdout (Playwright's reporter doesn't forward these), tagged
// so a failure can tell which of the players it came from.
export function logBrowserErrors(page: Page, label: string): void {
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      console.log(`[${label} console.error] ${msg.text()}`);
    }
  });
  page.on('pageerror', (err) => {
    console.log(`[${label} pageerror] ${err.message}`);
  });
}
