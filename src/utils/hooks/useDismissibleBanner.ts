'use client'
import { useState } from 'react';

/**
 * A banner the user can wave away for good, remembered per browser.
 *
 * Storage can throw (private mode, blocked site data), and the worst case of
 * guessing wrong is the banner reappearing on the next visit — not worth
 * failing over, so every access is swallowed.
 *
 * Shared by the offers in `BottomBanner`: each passes its own key, and both get
 * the same "dismissed stays dismissed" behaviour without a second copy of the
 * try/catch.
 */
export function useDismissibleBanner(storageKey: string) {
    const [dismissed, setDismissed] = useState(() => {
        if (typeof window === 'undefined') {
            return true;
        }
        try {
            return window.localStorage.getItem(storageKey) === '1';
        } catch {
            return false;
        }
    });

    const dismiss = () => {
        try {
            window.localStorage.setItem(storageKey, '1');
        } catch {
            // Storage blocked — it stays dismissed for this session only.
        }
        setDismissed(true);
    };

    return { dismissed, dismiss };
}
