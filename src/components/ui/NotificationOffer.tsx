'use client'
import OfferCard from '@/components/ui/OfferCard';
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
                ? 'Notifications are blocked for this site. Allow them in your browser’s site settings to hear about invites and turns.'
                : 'Hear about it when a friend invites you to a game, and when it’s your turn to move.'}
        </OfferCard>
    );
}
