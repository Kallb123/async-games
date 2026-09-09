'use client'
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useNotificationHealth } from '@/utils/hooks/useNotificationHealth';
import { NOTIFICATION_MISS_LINE, notificationBlockerLine } from '@/utils/ui/notifications';
import { isGameScreen } from '@/utils/ui/games';

/**
 * The standing warning that this device is not going to be told it's the
 * player's turn. Mounted once inside the app column by the root layout, so
 * every screen carries it without opting in.
 *
 * A footer rather than another bottom banner: the banner makes one dismissible
 * *offer* at a time, and this is neither dismissible nor an offer — turn alerts
 * are how an async game reaches a player at all, so a device that can't get one
 * has a broken app and should keep saying so until it's fixed. It sits at the
 * foot of the page for the same reason: quiet, below the content, in the way of
 * nothing. The two can be on screen together while permission has simply never
 * been asked for, which is the point — the banner is the button, this is what
 * happens if it is never pressed, and the banner goes away for good the moment
 * it is waved off.
 *
 * Two screens don't get it. The in-game screens (`isGameScreen`) are a player
 * looking at the one game they already know it's their turn in, and Settings
 * already says all of this at length — with the switches, the device list and
 * the retry button, which is where this footer's own link sends everyone else.
 */
export default function NotificationFooter() {
    const pathname = usePathname();

    // Before `NotificationFooterNotice` and so before `useNotificationHealth`,
    // which registers this device for push as a side effect. The game screens
    // deliberately don't do that today, and a footer they never render is no
    // reason to start.
    if (isGameScreen(pathname) || pathname === '/settings') {
        return null;
    }

    return <NotificationFooterNotice />;
}

function NotificationFooterNotice() {
    const blocker = useNotificationHealth();

    if (!blocker) {
        return null;
    }

    return (
        <div className="ag-footer">
            <div className="ag-callout ag-stack ag-footer-notice" role="status">
                <div className="ag-footer-notice-title">Turn alerts can’t reach this device</div>
                <div>{NOTIFICATION_MISS_LINE}</div>
                <div>{notificationBlockerLine(blocker)}</div>
                {/* Not prefetched: this sits on every screen, and Settings
                    is a heavy authenticated page nobody on most of those
                    screens is about to open. */}
                <Link href="/settings" prefetch={false}>Notification settings</Link>
            </div>
        </div>
    );
}
