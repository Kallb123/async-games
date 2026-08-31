'use client'
import { useCallback, useSyncExternalStore } from 'react';

// The one place in the app that touches `localStorage`. Every access is
// wrapped, because storage throws in private mode and with site data blocked,
// and nothing kept here is worth failing a render over.

// What we asked the browser to remember, whether or not it agreed. A blocked
// store means nothing survives the page — but the write still has to take
// effect now: Outbreak's role welcome is closed by storing its flag and
// nothing else, so a write that quietly vanished would leave a popup that
// can't be shut.
const session = new Map<string, string>();

// The browser fires no event for a write this tab made itself, so the store is
// nudged by hand from `writeStoredValue` — the same flat listener set
// `useNotificationPermission` and `useInstallPrompt` use, so every mounted
// reader picks a change up without a page reload, including a write from
// outside React (`recordGuestMoved`). A reader on some other key re-reads the
// same string it had, so `useSyncExternalStore` drops that one without a
// re-render; there is nothing here worth a set per key.
const listeners = new Set<() => void>();

function subscribe(onChange: () => void): () => void {
    listeners.add(onChange);
    return () => {
        listeners.delete(onChange);
    };
}

/**
 * What this browser has stored under `storageKey` — or null if it has nothing,
 * or we're on the server. Safe to call outside React.
 */
export function readStoredValue(storageKey: string): string | null {
    try {
        const stored = window.localStorage.getItem(storageKey);
        if (stored !== null) return stored;
    } catch {
        // Storage refused to answer — this session's own writes are all we have.
    }
    return session.get(storageKey) ?? null;
}

/**
 * Stores `value` for this browser and tells every mounted `useStoredValue`.
 * Safe to call outside React — `recordGuestMoved` does.
 */
export function writeStoredValue(storageKey: string, value: string): void {
    session.set(storageKey, value);
    try {
        window.localStorage.setItem(storageKey, value);
    } catch {
        // Storage blocked — the value takes effect now and holds until the page
        // goes, which is the whole of what a dismissal needs to do.
    }
    listeners.forEach(listener => listener());
}

// The server can't know what a browser has stored, so it renders as "nothing
// yet" — and so does the hydration pass, which means the server's output and
// the first client render agree, and nothing kept here can cause a hydration
// mismatch. Same bargain `useNotificationPermission` and `useInstallPrompt`
// make. React only asks for this snapshot on those two renders: a component
// that first mounts afterwards reads the real value straight away.
const getServerSnapshot = (): string | null => null;

/**
 * One remembered string per browser: what is stored under `storageKey`, and a
 * setter that stores a new one and re-renders every reader.
 *
 * Through hydration the value reads as null whatever is stored (see above), so
 * anything that would show on "nothing stored yet" must belong to a caller
 * that renders nothing until then — one waiting on a browser-only signal of
 * its own, or one that mounts when client-fetched data arrives.
 */
export function useStoredValue(storageKey: string): [string | null, (value: string) => void] {
    const value = useSyncExternalStore(
        subscribe,
        useCallback(() => readStoredValue(storageKey), [storageKey]),
        getServerSnapshot,
    );
    const store = useCallback((next: string) => writeStoredValue(storageKey, next), [storageKey]);

    return [value, store];
}
