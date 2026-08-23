'use client'
import { useSyncExternalStore } from 'react';

// Persisted per browser, same reasoning as useDismissibleBanner: it only has
// to survive navigating off the board so the claim-account offer
// (docs/account-less-play.md step 16) can wait for it, and losing it to a
// blocked/cleared store just means asking a session later than ideal — not
// worth failing over.
const STORAGE_KEY = 'ag-guest-moved';

// The browser fires no event when this changes, so the store is nudged by
// hand from recordGuestMoved — the only place that sets it — the same shape
// useNotificationPermission's store uses so every mounted listener (the
// bottom banner) picks up the change without a page reload.
const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
    listeners.add(onChange);
    return () => {
        listeners.delete(onChange);
    };
}

function getSnapshot(): boolean {
    try {
        return window.localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
        return false;
    }
}

// The server can't know this either way; every consumer renders as "not yet"
// until the first post-hydration snapshot, same bargain useNotificationPermission
// and useInstallPrompt make.
const getServerSnapshot = (): boolean => false;

/**
 * Records that the signed-in guest has taken their first turn somewhere in
 * the app — the signal the claim-account offer waits for, so it never asks
 * before the guest has anything to lose. Called once, from useSubmitCommand's
 * success path, for every game a guest can play; idempotent, so calling it
 * again after the first turn costs nothing.
 */
export function recordGuestMoved(): void {
    try {
        if (window.localStorage.getItem(STORAGE_KEY) === '1') return;
        window.localStorage.setItem(STORAGE_KEY, '1');
    } catch {
        // Storage blocked — nothing to persist, but still nudge listeners so
        // the offer can appear for the rest of this tab's session.
    }
    listeners.forEach(listener => listener());
}

/** Whether the signed-in guest has taken a turn yet, this browser. */
export function useGuestMoved(): boolean {
    return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
