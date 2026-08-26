'use client'
import { ReactNode } from 'react';
import InstallOffer from '@/components/ui/InstallOffer';
import NotificationOffer from '@/components/ui/NotificationOffer';
import ClaimAccountOffer from '@/components/ui/ClaimAccountOffer';
import { useBannerHeight } from '@/utils/hooks/useBannerHeight';
import { useDismissibleBanner } from '@/utils/hooks/useDismissibleBanner';
import { useInstallPrompt } from '@/utils/hooks/useInstallPrompt';
import { useIsAuthorised } from '@/utils/hooks/useAuthGuard';
import { useNotificationPermission } from '@/utils/hooks/useNotificationPermission';
import { useGuestMoved } from '@/utils/hooks/useGuestMoved';
import { isGuest } from '@/utils/ui/players';

// Dismissal is permanent per browser. The install key predates this component
// and is kept as it was, so anyone who has already waved that banner away is
// not asked again.
const INSTALL_DISMISSED_KEY = 'ag-install-dismissed';
const NOTIFICATIONS_DISMISSED_KEY = 'ag-notifications-dismissed';
const CLAIM_DISMISSED_KEY = 'ag-claim-dismissed';

/**
 * The one dismissible strip across the bottom of the app. Mounted once for the
 * whole app by `Providers`, so it needs no wiring per screen.
 *
 * Three offers can qualify at the same time — install the app, turn on
 * notifications, a guest keeping their account — and stacking any of them
 * would be dark cards nagging at once, so this shows at most one. Install
 * goes first, notifications second: on iOS, installing to the home screen is
 * a precondition for web push at all (`pushSupported`/`useNotificationPermission`
 * report 'unsupported' until then), so an install-first rule is the one order
 * that's never backwards there — and elsewhere, where push needs no install,
 * showing whichever one qualifies first costs nothing. One rule for every
 * platform rather than a special case for iOS. Keeping the account comes
 * last: it only applies to a guest at all, and a guest is asked to install
 * and to turn on notifications the same as anyone else first.
 *
 * The notification offer is gated on being signed in, because it is only worth
 * anything to someone with games to be notified about, and because asking a
 * visitor who is still deciding whether to sign up is how an origin gets its
 * prompts blocked. Settings keeps its own copy of both offers for anyone who
 * dismisses them and changes their mind.
 *
 * Keeping the account is a guest-only offer (docs/account-less-play.md step
 * 16), and it waits for `useGuestMoved` — the guest's first turn — so it never
 * asks before there's anything to lose. Its own form lives on Settings, not
 * here: the banner only ever hands off to it.
 */
export default function BottomBanner() {
    const { user, isAuthorised } = useIsAuthorised();
    const permission = useNotificationPermission();
    const installMethod = useInstallPrompt();
    const guestMoved = useGuestMoved();
    const notifications = useDismissibleBanner(NOTIFICATIONS_DISMISSED_KEY);
    const install = useDismissibleBanner(INSTALL_DISMISSED_KEY);
    const claim = useDismissibleBanner(CLAIM_DISMISSED_KEY);
    const measure = useBannerHeight();

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
    } else if (user && isGuest(user) && guestMoved && !claim.dismissed) {
        label = 'Keep this account';
        offer = <ClaimAccountOffer className="ag-banner-inner" onDismiss={claim.dismiss} />;
    } else {
        return null;
    }

    return (
        <div className="ag-banner" ref={measure} role="region" aria-label={label}>
            {offer}
        </div>
    );
}
