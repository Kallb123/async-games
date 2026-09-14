'use client'

import Link from 'next/link';
import AdminGuestRecovery from '@/components/AdminGuestRecovery';
import AdminUserAnalytics from '@/components/AdminUserAnalytics';
import AdminPage from '@/components/ui/AdminPage';
import Section from '@/components/ui/Section';

/**
 * Support tooling for whoever runs the app (docs/admin-tools.md): recovering a
 * guest account whose resume link is gone, a look at what platforms players are
 * on, and the way into the game tools. The admin gate and topbar live in
 * `AdminPage`, shared with the track editor.
 */
export default function Admin() {
    return (
        <AdminPage title="Admin" backHref="/settings" backLabel="Back to settings">
            <AdminGuestRecovery />
            <AdminUserAnalytics />

            <Section label="Game tools">
                <Link href="/admin/racecars" className="ag-btn ag-btn--light ag-btn--block">
                    Race Cars track editor
                </Link>
            </Section>
        </AdminPage>
    );
}
