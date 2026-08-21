'use client'
import { useSyncExternalStore } from 'react';
import { pushSupported } from '@/utils/firebase/pushSupport';

/**
 * The browser's notification permission, plus `'unsupported'` for the browsers
 * that cannot receive push at all — folded in here so callers ask one question
 * ("can I offer this, and has it been answered?") instead of two.
 */
export type NotificationPermissionState = 'unsupported' | 'default' | 'granted' | 'denied';

// The browser fires no event when permission changes, so the store is nudged by
// hand from `requestNotificationPermission` — the only place in the app that
// can change it. Kept at module level so every consumer (the bottom banner, the
// settings screen, the token hook) re-reads on the same nudge; otherwise
// granting from the banner would leave the settings toggle stale until reload.
const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
    listeners.add(onChange);
    return () => {
        listeners.delete(onChange);
    };
}

function getSnapshot(): NotificationPermissionState {
    return pushSupported() ? Notification.permission : 'unsupported';
}

// The server cannot know any of this. Reporting 'unsupported' keeps the markup
// identical on both sides of hydration — callers render nothing until the first
// post-hydration snapshot, the same bargain `useInstallPrompt` makes.
const getServerSnapshot = (): NotificationPermissionState => 'unsupported';

/**
 * Asks the browser for notification permission. Call this only from a real user
 * gesture — an unprompted request is the pattern browsers penalise an origin
 * for, so the app has exactly two callers, both of them a button the user
 * pressed. Everything else reads `useNotificationPermission` and waits.
 */
export async function requestNotificationPermission(): Promise<void> {
    if (!pushSupported()) {
        return;
    }
    try {
        await Notification.requestPermission();
    } catch {
        // Older Safari rejects rather than resolving 'denied'. Either way the
        // notify below re-reads the real permission, so there is nothing to do.
    }
    listeners.forEach((listener) => listener());
}

/** This browser's notification permission, re-read whenever the app asks for it. */
export function useNotificationPermission(): NotificationPermissionState {
    return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
