'use client'
import { ReactNode } from 'react';
import InstallOffer from '@/components/ui/InstallOffer';
import NotificationOffer from '@/components/ui/NotificationOffer';
import { useDismissibleBanner } from '@/utils/hooks/useDismissibleBanner';
import { useInstallPrompt } from '@/utils/hooks/useInstallPrompt';
import { useIsAuthorised } from '@/utils/hooks/useAuthGuard';
import { useNotificationPermission } from '@/utils/hooks/useNotificationPermission';

// Dismissal is permanent per browser. The install key predates this component
// and is kept as it was, so anyone who has already waved that banner away is
// not asked again.
const INSTALL_DISMISSED_KEY = 'ag-install-dismissed';
const NOTIFICATIONS_DISMISSED_KEY = 'ag-notifications-dismissed';

/**
 * The one dismissible strip across the bottom of the app. Mounted once for the
 * whole app by `Providers`, so it needs no wiring per screen.
 *
 * Two offers can qualify at the same time — install the app, turn on
 * notifications — and stacking both would be two dark cards nagging at once, so
 * this shows at most one. Install goes first, notifications keeps for the next
 * visit: on iOS, installing to the home screen is a precondition for web push
 * at all (`pushSupported`/`useNotificationPermission` report 'unsupported'
 * until then), so an install-first rule is the one order that's never
 * backwards there — and elsewhere, where push needs no install, showing
 * whichever one qualifies first costs nothing. One rule for every platform
 * rather than a special case for iOS.
 *
 * The notification offer is gated on being signed in, because it is only worth
 * anything to someone with games to be notified about, and because asking a
 * visitor who is still deciding whether to sign up is how an origin gets its
 * prompts blocked. Settings keeps its own copy of both offers for anyone who
 * dismisses them and changes their mind.
 */
export default function BottomBanner() {
    const { isAuthorised } = useIsAuthorised();
    const permission = useNotificationPermission();
    const installMethod = useInstallPrompt();
    const notifications = useDismissibleBanner(NOTIFICATIONS_DISMISSED_KEY);
    const install = useDismissibleBanner(INSTALL_DISMISSED_KEY);

    // `permission` and `installMethod` are both inert on the server and through
    // hydration (see their hooks), so nothing renders until the browser has
    // said what it supports. That is what keeps the storage reads in
    // `useDismissibleBanner` out of the hydration comparison — the first client
    // render matches the server's empty output.
    let label: string;
    let offer: ReactNode;
    if (installMethod !== 'none' && !install.dismissed) {
        label = 'Install Async Games';
        offer = <InstallOffer method={installMethod} className="ag-banner-inner" onDismiss={install.dismiss} />;
    } else if (isAuthorised && permission === 'default' && !notifications.dismissed) {
        label = 'Turn on notifications';
        offer = <NotificationOffer permission={permission} className="ag-banner-inner" onDismiss={notifications.dismiss} />;
    } else {
        return null;
    }

    return (
        <div className="ag-banner" role="region" aria-label={label}>
            {offer}
        </div>
    );
}
