'use client'

import AdminPage from '@/components/ui/AdminPage';
import RealmArenaRendererLab from '@/games/RealmArena/components/RealmArenaRendererLab';

/**
 * Realm Arena's renderer lab (docs/admin-tools.md, docs/realm-arena-3d.md §4):
 * the rendering bench's battles and scenarios on whatever device opens it, the
 * isometric board beside the 3D one. Built from repo data with no server
 * behind it, so the gate is `AdminPage`'s.
 */
export default function RealmArenaRendererPage() {
    return (
        <AdminPage title="Realm Arena renderer lab" backHref="/admin" backLabel="Back to admin">
            <RealmArenaRendererLab />
        </AdminPage>
    );
}
