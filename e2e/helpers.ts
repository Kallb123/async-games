import { type APIRequestContext, type Page } from '@playwright/test';

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
