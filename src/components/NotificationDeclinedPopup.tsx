'use client'
import InfoModal, { type InfoSection } from '@/components/ui/InfoModal';
import { acknowledgeNotificationDecline, useNotificationDeclined } from '@/utils/hooks/useNotificationPermission';
import { NOTIFICATION_MISS_LINE, notificationBlockerLine } from '@/utils/ui/notifications';

/**
 * The follow-up to a declined permission prompt: the player pressed Enable,
 * the browser asked, and they pressed Block.
 *
 * Nothing else in the app can catch that. The browser fires no event for a
 * refusal, so from the outside the only sign is an offer card that quietly
 * loses its button — which is why `requestNotificationPermission` records the
 * refusal and this, mounted once by `Providers`, is the one thing that reads
 * it. Mounted app-wide because the prompt can be triggered from the bottom
 * banner or from Settings, and the answer is worth explaining either way.
 *
 * Shown once per refusal, not once per browser: dismissing it clears the flag,
 * and only another request the player themselves started can set it again.
 */
export default function NotificationDeclinedPopup() {
    const declined = useNotificationDeclined();

    if (!declined) {
        return null;
    }

    // The same two things the footer says, given room to say them: what saying
    // no costs, and what to do if that wasn't the intention. Built here rather
    // than at module scope because `notificationBlockerLine` names either the
    // browser's site settings or Android's app settings, and which of those is
    // right is only known once this is rendering on the device.
    const sections: InfoSection[] = [
        { heading: "You won't hear about your turns", body: NOTIFICATION_MISS_LINE },
        { heading: 'If you change your mind', body: notificationBlockerLine('blocked') },
    ];

    return (
        <InfoModal
            title="Notifications are off"
            sections={sections}
            onClose={acknowledgeNotificationDecline}
        />
    );
}
