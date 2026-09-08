'use client'
import { useIsAuthorised } from './useAuthGuard';
import { useNotificationPermission } from './useNotificationPermission';
import useFcmToken from './useFcmToken';
import type { NotificationBlocker } from '@/utils/ui/notifications';

/**
 * Whether this device is actually going to be told it's the player's turn, and
 * if not, which of the three preconditions is missing — `null` when there is
 * nothing to warn about.
 *
 * The three (see `PushRegistrationState`) are asked in two places: permission
 * lives in `useNotificationPermission`, registration in `useFcmToken`. Neither
 * is the whole answer on its own — a granted permission whose token never
 * landed is a screen that looks fine and a player who never hears from us — so
 * anything that wants to say "notifications aren't working" asks here rather
 * than picking one of the two and hoping.
 *
 * Gated on being signed in, like the bottom banner's offer: someone with no
 * account has no turns to miss, and telling a visitor the app can't notify
 * them is a warning about a problem they don't have yet.
 */
export function useNotificationHealth(): NotificationBlocker | null {
    const { isAuthorised } = useIsAuthorised();
    const permission = useNotificationPermission();
    const { registration } = useFcmToken();

    if (!isAuthorised) {
        return null;
    }

    switch (permission) {
        // Nothing known yet — the native shell answers over the Capacitor
        // bridge, and this is also what the server renders, so saying anything
        // here would flash a warning at a device that is about to say it's fine.
        case 'checking':
            return null;
        case 'unsupported':
            return 'unsupported';
        case 'default':
            return 'unasked';
        case 'denied':
            return 'blocked';
        case 'granted':
            // 'registering' is not a failure yet, and 'idle' can't happen with
            // permission granted and the viewer authorised.
            return registration === 'no-token' || registration === 'not-saved' ? 'unregistered' : null;
    }
}
