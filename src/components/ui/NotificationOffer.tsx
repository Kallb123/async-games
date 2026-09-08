'use client'
import OfferCard from '@/components/ui/OfferCard';
import { notificationBlockerLine } from '@/utils/ui/notifications';
import { NotificationPermissionState, requestNotificationPermission } from '@/utils/hooks/useNotificationPermission';

interface NotificationOfferProps {
    permission: NotificationPermissionState;
    className?: string;
    onDismiss?: () => void;
}

/**
 * The push pitch: what notifications are actually for, and the button that asks
 * the browser for permission. `OfferCard` supplies the surface.
 *
 * A browser that has already been told no cannot be re-asked from script, so
 * `denied` gets the instructions rather than a button that would do nothing.
 * Those instructions are `notificationBlockerLine('blocked')`, the same
 * sentence the notification footer and the declined-prompt popup show, because
 * the way out of a blocked browser is the same wherever it is described.
 */
export default function NotificationOffer({ permission, className, onDismiss }: NotificationOfferProps) {
    return (
        <OfferCard
            title="Turn on notifications"
            className={className}
            onDismiss={onDismiss}
            dismissLabel="Dismiss notification prompt"
            action={permission === 'default' && (
                <button type="button" className="ag-btn ag-btn--light" onClick={requestNotificationPermission}>
                    Enable
                </button>
            )}
        >
            {permission === 'denied'
                ? notificationBlockerLine('blocked')
                : 'Hear about it when a friend invites you to a game, and when it’s your turn to move.'}
        </OfferCard>
    );
}
