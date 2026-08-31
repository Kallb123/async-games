'use client'

import { useState } from 'react';
import ActionButton from '@/components/ui/ActionButton';
import { useToast } from '@/components/ToastContext';
import { REQUEST_TIMEOUT_MS } from '@/utils/hooks/fetchWithSessionRetry';

interface TestResult {
    /** Devices the push actually reached. */
    sent?: number;
    /** Devices registered to this account at all. */
    registered?: number;
    /** The channel a test rides on is switched off. */
    muted?: boolean;
}

// What to say about each outcome. Every one of them names the fix, because a
// test that only says "it didn't work" is a slower way of learning nothing.
function describe({ sent, registered, muted }: TestResult): { message: string; ok: boolean } {
    if (!registered) {
        return {
            ok: false,
            message: "No device is registered yet, so there was nothing to send to. Open Async Games on the device you're expecting notifications on.",
        };
    }
    if (muted) {
        return { ok: false, message: "Your turn notifications are switched off, so nothing was sent. Turn them on above and try again." };
    }
    if (!sent) {
        return { ok: false, message: "The test couldn't be sent just now. Please try again in a moment." };
    }
    return {
        ok: true,
        message: `Test sent to ${sent} device${sent === 1 ? '' : 's'} — it should arrive within a few seconds.`,
    };
}

/**
 * Sends a push to your own devices and reports what became of it.
 *
 * The one thing on the settings screen that tests the whole path end to end —
 * preferences, device registration, FCM, the service worker, the tray — rather
 * than the app's opinion of it. `/api/notificationtest` can only ever reach the
 * caller's own devices, so unlike the dev bench's version there is nothing here
 * that needs hiding off a dev deployment.
 */
export default function NotificationTestButton() {
    const { showToast } = useToast();
    const [sending, setSending] = useState(false);

    const sendTest = async () => {
        if (sending) return;
        setSending(true);
        try {
            // Timed out rather than left open: this button disables itself
            // while a send is in flight, so a request that never settles would
            // leave it dead until the player reloaded the page.
            const response = await fetch('/api/notificationtest', {
                method: 'POST',
                signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
            });
            if (!response.ok) {
                throw new Error(`Failed to send the test notification (${response.status})`);
            }
            const { message, ok } = describe(await response.json());
            showToast(message, ok ? 'success' : 'danger');
        } catch (error) {
            console.error(error);
            showToast("The test couldn't be sent just now. Please try again in a moment.", 'danger');
        } finally {
            setSending(false);
        }
    };

    return (
        <ActionButton
            className="ag-btn ag-btn--light"
            pending={sending}
            pendingLabel="Sending…"
            onClick={sendTest}
        >
            Send a test notification
        </ActionButton>
    );
}
