'use client'
import { useSyncExternalStore } from 'react';
import { pushSupported } from '@/utils/firebase/pushSupport';
import { checkNativePermission, requestNativePermission } from '@/utils/firebase/nativePush';
import { isNativeShell } from '@/utils/native';

/**
 * The browser's notification permission, plus two states of our own:
 * `'unsupported'` for the browsers that cannot receive push at all, and
 * `'checking'` for the moment before the answer is known — folded in here so
 * callers ask one question ("can I offer this, and has it been answered?")
 * instead of two.
 *
 * `'checking'` exists because the native shell cannot answer synchronously: the
 * permission is the OS's, and reading it is a round trip over the Capacitor
 * bridge. Everything renders nothing for it, which is also what the server
 * renders — so the app never flashes "notifications aren't supported" at a
 * device that is about to say it supports them.
 */
export type NotificationPermissionState = 'checking' | 'unsupported' | 'default' | 'granted' | 'denied';

// The browser fires no event when permission changes, so the store is nudged by
// hand from `requestNotificationPermission` — the only place in the app that
// can change it — and by the native read below. Kept at module level so every
// consumer (the bottom banner, the settings screen, the token hook) re-reads on
// the same nudge; otherwise granting from the banner would leave the settings
// toggle stale until reload.
const listeners = new Set<() => void>();

function notify() {
    listeners.forEach((listener) => listener());
}

// The native shell's answer, once it has arrived. `null` means "not asked yet",
// which is what makes the snapshot below 'checking' rather than a guess.
let nativePermission: NotificationPermissionState | null = null;
let nativeRead: Promise<void> | null = null;

// One read, however many components are mounted: the second subscriber joins
// the first one's round trip instead of starting another.
function readNativePermission(): Promise<void> {
    nativeRead ??= checkNativePermission()
        .then((permission) => { nativePermission = permission; })
        .catch((error) => {
            // The plugin is missing or the bridge is broken — either way this
            // build cannot receive push, and saying so beats spinning forever.
            console.error('Failed to read the native notification permission', error);
            nativePermission = 'unsupported';
        })
        .finally(() => {
            nativeRead = null;
            notify();
        });
    return nativeRead;
}

function subscribe(onChange: () => void) {
    listeners.add(onChange);
    // The store fetching its own value on first use is what keeps every caller
    // from having to know that one platform answers asynchronously.
    if (isNativeShell() && nativePermission === null) {
        readNativePermission();
    }
    return () => {
        listeners.delete(onChange);
    };
}

function getSnapshot(): NotificationPermissionState {
    if (isNativeShell()) {
        return nativePermission ?? 'checking';
    }
    return pushSupported() ? Notification.permission : 'unsupported';
}

// The server cannot know any of this. Reporting 'checking' keeps the markup
// identical on both sides of hydration — callers render nothing until the first
// post-hydration snapshot, the same bargain `useInstallPrompt` makes.
const getServerSnapshot = (): NotificationPermissionState => 'checking';

/**
 * Asks for notification permission. Call this only from a real user gesture —
 * an unprompted request is the pattern browsers penalise an origin for, so the
 * app has exactly two callers, both of them a button the user pressed.
 * Everything else reads `useNotificationPermission` and waits.
 */
export async function requestNotificationPermission(): Promise<void> {
    if (isNativeShell()) {
        try {
            nativePermission = await requestNativePermission();
        } catch (error) {
            console.error('Failed to request the native notification permission', error);
        }
        notify();
        return;
    }
    if (!pushSupported()) {
        return;
    }
    try {
        await Notification.requestPermission();
    } catch {
        // Older Safari rejects rather than resolving 'denied'. Either way the
        // notify below re-reads the real permission, so there is nothing to do.
    }
    notify();
}

/** This client's notification permission, re-read whenever the app asks for it. */
export function useNotificationPermission(): NotificationPermissionState {
    return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
