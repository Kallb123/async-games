'use client'
import { useIsAuthorised } from './useAuthGuard';
import { useNotificationPermission } from './useNotificationPermission';
import useFcmToken from './useFcmToken';
import { notificationBlocker, type NotificationBlocker } from '@/utils/ui/notifications';

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
 * All this hook does is read the live values; `notificationBlocker` is the
 * decision, kept pure so it can be tested without a browser.
 */
export function useNotificationHealth(): NotificationBlocker | null {
    const { isAuthorised } = useIsAuthorised();
    const permission = useNotificationPermission();
    const { registration } = useFcmToken();

    return notificationBlocker(isAuthorised, permission, registration);
}
