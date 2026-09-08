import { expect, type Page } from '@playwright/test';

// Page helpers shared by the two Fires Out specs — the crew game
// (firesout-turns.spec.ts) and the solitaire one (firesout-solo.spec.ts).
// Ending a turn is the same three-step dance in both (submit, wait for the
// Advance Fire payoff screen to settle, dismiss it), and §17.6 step 7 means
// every game of Fires Out does it once per figure's turn, so it lives here
// rather than in a copy per spec.

export function endTurnButton(page: Page) {
  return page.getByRole('button', { name: /End turn/ });
}

/**
 * Ends the active firefighter's turn (banking whatever AP is left — no board
 * action is needed to make endTurn legal) and dismisses the Advance Fire
 * payoff screen it always triggers (fires-out-gdd.md §17.6 step 7): the dice
 * tumble for ~1s before the "Continue" button enables, so this waits for the
 * roll to settle rather than racing it.
 */
export async function endTurn(page: Page): Promise<void> {
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
