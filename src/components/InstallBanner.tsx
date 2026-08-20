'use client'
import { useState } from 'react';
import InstallOffer from '@/components/ui/InstallOffer';
import { useInstallPrompt } from '@/utils/hooks/useInstallPrompt';

const DISMISSED_KEY = 'ag-install-dismissed';

/**
 * Whether this browser has already been told no. Storage can throw (private
 * mode, blocked site data), and the worst case of guessing wrong is the banner
 * reappearing on the next visit — not worth failing over.
 */
function wasDismissed(): boolean {
    if (typeof window === 'undefined') {
        return true;
    }
    try {
        return window.localStorage.getItem(DISMISSED_KEY) === '1';
    } catch {
        return false;
    }
}

/**
 * A dismissible strip across the bottom offering to install the app. Mounted
 * once for the whole app by `Providers`, so it needs no wiring per screen.
 *
 * Dismissal is permanent for this browser — Settings keeps its own copy of the
 * offer for anyone who dismisses it and changes their mind.
 */
export default function InstallBanner() {
    const method = useInstallPrompt();
    const [dismissed, setDismissed] = useState(wasDismissed);

    // `method` is 'none' on the server and through hydration (see
    // `useInstallPrompt`), so nothing renders until the browser has said it can
    // install. That is what keeps the storage read above out of the hydration
    // comparison — the first client render matches the server's empty output.
    if (method === 'none' || dismissed) {
        return null;
    }

    const dismiss = () => {
        try {
            window.localStorage.setItem(DISMISSED_KEY, '1');
        } catch {
            // Storage blocked — it stays dismissed for this session only.
        }
        setDismissed(true);
    };

    return (
        <div className="ag-install-banner" role="region" aria-label="Install Async Games">
            <InstallOffer method={method} className="ag-install-banner-inner" onDismiss={dismiss} />
        </div>
    );
}
