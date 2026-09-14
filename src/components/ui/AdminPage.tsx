'use client'

import { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import BackLink from '@/components/ui/BackLink';
import ErrorScreen from '@/components/ui/ErrorScreen';
import { useAuthGuard } from '@/utils/hooks/useAuthGuard';
import { isAdmin } from '@/utils/ui/players';

interface AdminPageProps {
    /** The topbar wordmark for this admin screen. */
    title: string;
    /** Where the back arrow goes, and what it says. */
    backHref: string;
    backLabel: string;
    children: ReactNode;
}

/**
 * The shell every `/admin/*` screen wears (docs/admin-tools.md): the admin gate
 * and the topbar, in one place so a second admin page — the track editor is the
 * first — doesn't restate the guard.
 *
 * The gate here is only what the screen shows: `/api/admin/*` checks
 * `publicMetadata.admin` for itself on every request (`requireAdmin`), so
 * nothing here is load-bearing. A non-admin who types the URL gets the same
 * dead end a mistyped link gets, rather than a locked door telling them there
 * is something behind it. A screen with no API behind it at all (the track
 * editor) leans on this alone, and that is deliberate — it authors repo data
 * and persists nothing.
 */
export default function AdminPage({ title, backHref, backLabel, children }: AdminPageProps) {
    const pathName = usePathname();
    console.log(`GET ${pathName}`);
    const { user, isLoaded } = useAuthGuard();

    // Clerk hasn't answered yet: nothing to show, and no verdict to render — an
    // "admins only" flash before the user lands is a worse first paint than an
    // empty one.
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
                    <BackLink href={backHref} label={backLabel} />
                    <span className="ag-wordmark">{title}</span>
                </div>
            </div>

            {children}
        </main>
    );
}
