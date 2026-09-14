'use client'

import { usePathname } from 'next/navigation';
import RaceCarsTrackEditor from '@/components/admin/RaceCarsTrackEditor';
import BackLink from '@/components/ui/BackLink';
import ErrorScreen from '@/components/ui/ErrorScreen';
import { useAuthGuard } from '@/utils/hooks/useAuthGuard';
import { isAdmin } from '@/utils/ui/players';

/**
 * The Race Cars track editor (docs/admin-tools.md): place each tile onto a
 * circuit image, draw the corner merges, band the corners, and print a
 * `tracks/` file. It is a build-time authoring aid, not a runtime feature —
 * nothing it produces is persisted server-side, so there is no `/api/admin`
 * route behind it and the gate here is only what the screen shows.
 *
 * Same shape as `/admin`: Clerk not answered yet renders nothing, a non-admin
 * gets the same dead end a mistyped link gets.
 */
export default function RaceCarsTrackEditorPage() {
    const pathName = usePathname();
    console.log(`GET ${pathName}`);
    const { user, isLoaded } = useAuthGuard();

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
                    <BackLink href="/admin" label="Back to admin" />
                    <span className="ag-wordmark">Track editor</span>
                </div>
            </div>

            <RaceCarsTrackEditor />
        </main>
    );
}
