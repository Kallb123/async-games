import { test, expect } from '@playwright/test';
import { clearGames, clerkUserId, logBrowserErrors } from '../helpers';

// The account-less guest path (docs/account-less-play.md): a host opens a
// join-by-code lobby, and a *signed-out* stranger claims the open seat as a
// guest — typing a display name, never signing up. Snakes & Ladders proves the
// named-invitee path (snakesandladders-turns.spec.ts); this proves the one
// nobody has an account for, end to end: the host creates the lobby, the guest
// joins in a fresh session with no auth at all, the last seat filling starts
// the game, and — the whole point of a guest name (§5/§14) — the name they
// typed is what shows up in the game, not the throwaway account Clerk minted
// for them behind it.
//
// Outbreak is a two-to-four-player co-op, so a host plus one guest is a legal
// party and the game starts the moment the guest sits down. It needs no
// per-game setup beyond who's playing, which keeps this about the invite/guest
// flow rather than a particular game's rules.

// The name the guest types at the join screen. Distinctive so it can't be
// confused with page chrome, and nothing like the `guest_<uuid>` username or
// `…@guests.asyncgames.com` email the mint hands the account underneath — which
// is exactly what must never reach the board.
const GUEST_NAME = 'PandemicPat';

// The dev wipe routes need a signed-in request, so give the top-level `request`
// fixture the host's session, purely for the teardown (same as solitaire-smoke).
// This touches only the fixtures the framework hands out; the guest below is a
// hand-built `browser.newContext()` with no session of its own, so it stays the
// signed-out stranger the test is about regardless of this.
test.use({ storageState: 'playwright/.auth/player-one.json' });

test.afterAll(async ({ request }) => {
  await clearGames(request);
});

test('host opens a lobby, a guest joins by code, and the guest name shows in game', async ({ browser }) => {
  // Two contexts, several full page loads and a guest mint through Clerk add up
  // to more than Playwright's default 30s timeout.
  test.setTimeout(90_000);

  // The host is a standing signed-in test user; the guest is a brand-new
  // context with no stored session at all — the whole point is that they never
  // signed in.
  const hostContext = await browser.newContext({ storageState: 'playwright/.auth/player-one.json' });
  const guestContext = await browser.newContext();
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();

  logBrowserErrors(host, 'host');
  logBrowserErrors(guest, 'guest');

  try {
    // Host creates an Outbreak lobby with one open seat and nobody named — a
    // pure join-by-code party.
    await host.goto('/newgame/outbreak');
    await clerkUserId(host);
    const seatSelect = host.locator('select.ag-select').filter({
      has: host.locator('option', { hasText: 'join by code' }),
    });
    await seatSelect.selectOption('1');
    await host.getByRole('button', { name: 'Create lobby & get code' }).click();

    // Lands on the lobby screen; read the join code the card shows once the
    // invitation has loaded (it renders "····" until then).
    await host.waitForURL(/\/lobby\/.+/);
    const codeEl = host.locator('.ag-joincode');
    await expect(codeEl).toHaveText(/^[A-HJ-NP-Z2-9]{4}$/);
    const joinCode = (await codeEl.textContent())!.trim();

    // The guest opens the shared link — code already in the box — and, with no
    // account, gets the signed-out guest form. They type a name over the
    // random one it pre-fills and claim the seat.
    await guest.goto(`/join?code=${joinCode}`);
    const nameInput = guest.locator('#guest-name');
    await expect(nameInput).toBeVisible();
    await nameInput.fill(GUEST_NAME);
    await guest.getByRole('button', { name: 'Join game' }).click();

    // Claiming the last seat starts the game, but a brand-new guest is first
    // offered their resume link (§2/§15) — the one screen before the board.
    await guest.getByRole('button', { name: 'Continue to lobby' }).click();

    // The guest is carried straight onto the Outbreak board — the game started
    // the moment their seat filled the party.
    await guest.waitForURL(/\/games\/outbreak\/.+/);
    await expect(guest.getByText('Outbreak')).toBeVisible();

    // The host's lobby notices the game started (its invitation is gone) and
    // sends them to the same board, the way it does for any lobby.
    await host.waitForURL(/\/games\/outbreak\/.+/, { timeout: 30_000 });
    await expect(host.getByText('Outbreak')).toBeVisible();

    // The whole point: the name the guest typed is what everyone sees. On the
    // host's board the guest is another player, so their chosen name is on it
    // (the scoreboard, their hand) — while the throwaway account underneath
    // never is.
    await expect(host.getByText(GUEST_NAME).first()).toBeVisible();
    await expect(host.locator('body')).not.toContainText('guests.asyncgames.com');
    await expect(host.locator('body')).not.toContainText('guest_');
  } finally {
    await hostContext.close();
    await guestContext.close();
  }
});
