'use client'

import RaceCarsTrackEditor from '@/games/RaceCars/components/RaceCarsTrackEditor';
import AdminPage from '@/components/ui/AdminPage';

/**
 * The Race Cars track editor (docs/admin-tools.md): place each tile onto a
 * circuit image, draw the corner merges, band the corners, and print a
 * `tracks/` file. A build-time authoring aid, not a runtime feature — nothing
 * it produces is persisted server-side, so there is no `/api/admin` route
 * behind it and the gate is `AdminPage`'s client-only one.
 */
export default function RaceCarsTrackEditorPage() {
    return (
        <AdminPage title="Track editor" backHref="/admin" backLabel="Back to admin">
            <RaceCarsTrackEditor />
        </AdminPage>
    );
}
