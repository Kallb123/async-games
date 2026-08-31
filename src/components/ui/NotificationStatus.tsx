'use client'

import type { PushRegistrationState } from '@/utils/hooks/useFcmToken';

interface NotificationStatusProps {
    registration: PushRegistrationState;
    onRetry: () => void;
}

// Why a device that is allowed to show notifications still isn't going to get
// any. Two different failures, because they need two different retries: one is
// the phone refusing to issue a push token (Play Services, a blocked push
// service, a service worker that never started), the other is us failing to
// store the token it did issue.
const FAILURES: Partial<Record<PushRegistrationState, string>> = {
    'no-token': "Notifications are allowed on this device, but it couldn't register for them — so nothing will arrive here yet.",
    'not-saved': "This device registered for notifications, but we couldn't save it to your account — so nothing will arrive here yet.",
};

/**
 * Whether *this* device will actually receive a push, said out loud.
 *
 * The rest of the Notifications section reads the browser permission, which
 * only covers whether notifications may be *shown*. Being registered is a
 * separate thing that can fail on its own (see `PushRegistrationState`), and it
 * used to fail into a console log — leaving a screen that said notifications
 * were on to a player who would never get one. The channel toggles above are
 * about what we send; this is about whether it can land.
 *
 * Renders nothing until there is something to say, so a device that registered
 * on the first attempt is not congratulated at length for it.
 */
export default function NotificationStatus({ registration, onRetry }: NotificationStatusProps) {
    const failure = FAILURES[registration];

    if (failure) {
        return (
            <div className="ag-callout ag-stack">
                <div>{failure}</div>
                {/* A plain button rather than `ActionButton`: pressing it puts
                    the whole callout into the "Registering…" line below on the
                    same tick, so there is no in-flight state for this button
                    itself to show. */}
                <button type="button" className="ag-btn ag-btn--light" onClick={onRetry}>
                    Try again
                </button>
            </div>
        );
    }

    if (registration === 'registering') {
        return <p className="ag-hint">Registering this device for notifications…</p>;
    }

    if (registration === 'registered') {
        return <p className="ag-hint">This device is registered, so notifications can reach it. Each device registers itself separately — see Your devices below.</p>;
    }

    return null;
}
