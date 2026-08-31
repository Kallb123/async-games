'use client'
import { readStoredValue, useStoredValue, writeStoredValue } from '@/utils/hooks/useStoredValue';

// Persisted per browser by useStoredValue, which owns the swallowed storage
// access. It only has to survive navigating off the board so the
// claim-account offer (docs/account-less-play.md step 16) can wait for it, and
// losing it to a blocked/cleared store just means asking a session later than
// ideal — not worth failing over.
const STORAGE_KEY = 'ag-guest-moved';

/**
 * Records that the signed-in guest has taken their first turn somewhere in
 * the app — the signal the claim-account offer waits for, so it never asks
 * before the guest has anything to lose. Called once, from useSubmitCommand's
 * success path, for every game a guest can play; idempotent, so calling it
 * again after the first turn costs nothing.
 */
export function recordGuestMoved(): void {
    if (readStoredValue(STORAGE_KEY) === '1') return;
    // Writing nudges every mounted useGuestMoved (the bottom banner), so the
    // offer can appear without a page reload — even if the store refused the
    // write and the flag lasts only as long as this page.
    writeStoredValue(STORAGE_KEY, '1');
}

/** Whether the signed-in guest has taken a turn yet, this browser. */
export function useGuestMoved(): boolean {
    const [moved] = useStoredValue(STORAGE_KEY);

    return moved === '1';
}
