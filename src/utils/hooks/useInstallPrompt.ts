'use client'
import { useSyncExternalStore } from 'react';

/**
 * Chrome's install event, which lets a site offer its own install button
 * instead of leaving the user to find the browser menu. Not in TypeScript's DOM
 * lib, so the shape we rely on is declared here.
 */
interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
}

/** How — or whether — this browser can install the app. */
export type InstallMethod =
    /** The browser offered an install dialog; `promptInstall` opens it. */
    | 'prompt'
    /** iOS, where the only route is the user doing it from the Share sheet. */
    | 'manual'
    /** Already installed, or a browser that cannot install at all. */
    | 'none';

// The captured event, held at module level rather than per-component.
// `beforeinstallprompt` fires once per page load and fires early, so a
// component that mounts later — Settings, reached by client-side navigation —
// would never see it if each consumer attached its own listener. One listener
// catches it for the whole app and every consumer reads the result.
let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

function notify() {
    listeners.forEach((listener) => listener());
}

if (typeof window !== 'undefined') {
    window.addEventListener('beforeinstallprompt', (event) => {
        // Suppresses Chrome's own mini-infobar; our banner replaces it.
        event.preventDefault();
        deferredPrompt = event as BeforeInstallPromptEvent;
        notify();
    });
    window.addEventListener('appinstalled', () => {
        deferredPrompt = null;
        notify();
    });
}

/** Whether the app is running as an installed app rather than in a browser tab. */
function isStandalone(): boolean {
    return window.matchMedia('(display-mode: standalone)').matches
        // iOS predates `display-mode` and reports it on `navigator` instead.
        || (window.navigator as { standalone?: boolean }).standalone === true;
}

/**
 * iOS has no install prompt at all — Share → Add to Home Screen is the only
 * route, so those users get instructions rather than a button. iPadOS Safari
 * reports itself as a Mac, which is what the touch-point check is for: without
 * it an iPad looks like a desktop and would be offered nothing.
 */
function isIos(): boolean {
    return /iPad|iPhone|iPod/.test(navigator.userAgent)
        || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function subscribe(onChange: () => void) {
    listeners.add(onChange);
    // Installing from the browser menu flips display-mode without firing
    // `appinstalled` in every browser, so the media query is watched too.
    const media = window.matchMedia('(display-mode: standalone)');
    media.addEventListener('change', onChange);
    return () => {
        listeners.delete(onChange);
        media.removeEventListener('change', onChange);
    };
}

function getMethod(): InstallMethod {
    if (isStandalone()) {
        return 'none';
    }
    if (deferredPrompt) {
        return 'prompt';
    }
    return isIos() ? 'manual' : 'none';
}

// The server cannot know any of this, and nothing is installable until the
// browser says so. Reporting 'none' keeps the markup identical on both sides of
// hydration — callers render nothing until the first post-hydration snapshot.
const getServerMethod = (): InstallMethod => 'none';

/**
 * Opens the browser's install dialog. A no-op unless `useInstallPrompt`
 * reports `'prompt'`.
 */
export async function promptInstall(): Promise<void> {
    const event = deferredPrompt;
    if (!event) {
        return;
    }
    // A prompt event is single-use, and clearing it before awaiting means a
    // double tap can't call `prompt()` twice — which the browser rejects.
    // Declining doesn't lose anything: Chrome fires a fresh event next visit.
    deferredPrompt = null;
    notify();
    await event.prompt();
}

/**
 * Whether this browser can install the app, and how. Shared by the bottom
 * `InstallBanner` and the Settings screen so the two always agree on what to
 * offer; the banner layers its own "dismissed" state on top.
 */
export function useInstallPrompt(): InstallMethod {
    return useSyncExternalStore(subscribe, getMethod, getServerMethod);
}
