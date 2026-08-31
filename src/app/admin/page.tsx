'use client'

import { usePathname } from 'next/navigation';
import AdminGuestRecovery from '@/components/AdminGuestRecovery';
import BackLink from '@/components/ui/BackLink';
import ErrorScreen from '@/components/ui/ErrorScreen';
import { useAuthGuard } from '@/utils/hooks/useAuthGuard';
import { isAdmin } from '@/utils/ui/players';

/**
 * Support tooling for whoever runs the app (docs/admin-tools.md) — today one
 * job, recovering a guest account whose resume link is gone.
 *
 * The gate here is only what the screen shows: `/api/admin/*` checks
 * `publicMetadata.admin` for itself on every request (`requireAdmin`), so
 * nothing here is load-bearing. A non-admin who types the URL gets the same
 * dead end a mistyped link gets, rather than a locked door telling them there
 * is something behind it.
 */
export default function Admin() {
    const pathName = usePathname();
    console.log(`GET ${pathName}`);
    const { user, isLoaded } = useAuthGuard();

    // Clerk hasn't answered yet: nothing to show, and no verdict to render —
    // an "admins only" flash before the user lands is a worse first paint than
    // an empty one.
    if (!isLoaded || !user) {
        return null;
    }

    if (!isAdmin(user)) {
        return (
            <ErrorScreen
                title="There's nothing here"
                message="That link doesn't go anywhere for this account."
            />
        );
    }

    return (
        <main>
            <div className="ag-topbar">
                <div className="ag-topbar-title">
                    <BackLink href="/settings" label="Back to settings" />
                    <span className="ag-wordmark">Admin</span>
                </div>
            </div>

            <AdminGuestRecovery />
        </main>
    );
}
