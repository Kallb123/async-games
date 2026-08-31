'use client'
import { useCallback, useSyncExternalStore } from 'react';

// The one place in the app that touches `localStorage`.
//
// Every access is wrapped, because storage throws in private mode and with site
// data blocked, and nothing kept here is worth failing a render over: the worst
// case of a read coming back empty is a dismissed banner reappearing, or an
// offer being asked for a session later than ideal. This try/catch used to be
// written twice (the banner and the guest-moved flag) and was about to be
// written a third time for the chat read-marker.

// The browser fires no event for a write this tab made itself, so the store is
// nudged by hand from `writeStoredValue` — the same shape
// `useNotificationPermission`'s store uses, so every mounted reader picks a
// change up without a page reload, including a write from outside React
// (`recordGuestMoved`).
const listeners = new Map<string, Set<() => void>>();

function subscribe(storageKey: string, onChange: () => void): () => void {
    let forKey = listeners.get(storageKey);
    if (!forKey) {
        forKey = new Set();
        listeners.set(storageKey, forKey);
    }
    forKey.add(onChange);
    return () => {
        forKey.delete(onChange);
        if (forKey.size === 0) {
            listeners.delete(storageKey);
        }
    };
}

/**
 * What this browser has stored under `storageKey` — or null if it has nothing,
 * or storage refused to answer, or we're on the server. Safe to call outside
 * React.
 */
export function readStoredValue(storageKey: string): string | null {
    try {
        return window.localStorage.getItem(storageKey);
    } catch {
        return null;
    }
}

/**
 * Stores `value` for this browser and tells every mounted `useStoredValue` on
 * that key. Safe to call outside React — `recordGuestMoved` does.
 */
export function writeStoredValue(storageKey: string, value: string): void {
    try {
        window.localStorage.setItem(storageKey, value);
    } catch {
        // Storage blocked — nothing persists, but the listeners are still
        // nudged, so this tab behaves as if it had for the rest of the session.
    }
    listeners.get(storageKey)?.forEach(listener => listener());
}

// The server can't know what a browser has stored, so it renders as "nothing
// yet" — and so does the hydration pass, which means the server's output and
// the first client render agree and nothing kept here can cause a hydration
// mismatch. Same bargain `useNotificationPermission` and `useInstallPrompt`
// make.
const getServerSnapshot = (): string | null => null;

/**
 * One remembered string per browser: what is stored under `storageKey`, and a
 * setter that stores a new one and re-renders every reader of that key.
 *
 * The value is null until the first post-hydration render (see above), so a
 * caller that would show something on "nothing stored" should either wait for a
 * browser-only signal of its own — `BottomBanner` waits on the install and
 * notification permission hooks — or accept one frame of "not yet".
 */
export function useStoredValue(storageKey: string): [string | null, (value: string) => void] {
    const value = useSyncExternalStore(
        useCallback((onChange: () => void) => subscribe(storageKey, onChange), [storageKey]),
        useCallback(() => readStoredValue(storageKey), [storageKey]),
        getServerSnapshot,
    );
    const store = useCallback((next: string) => writeStoredValue(storageKey, next), [storageKey]);
    return [value, store];
}
