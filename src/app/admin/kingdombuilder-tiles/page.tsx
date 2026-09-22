'use client'

import AdminPage from '@/components/ui/AdminPage';
import KingdomBuilderTileMapper from '@/games/KingdomBuilder/components/KingdomBuilderTileMapper';

/**
 * The Kingdom Builder tileset mapper (docs/admin-tools.md, GDD §3.5.5): pick a
 * sheet's tile size, click squares onto registry entries, copy out the
 * finished `tileset.ts`. A build-time authoring aid, not a runtime feature —
 * nothing it produces is persisted server-side, so there is no `/api/admin`
 * route behind it and the gate is `AdminPage`'s client-only one, same as the
 * Race Cars track editor it's modelled on.
 */
export default function KingdomBuilderTileMapperPage() {
    return (
        <AdminPage title="Tile mapper" backHref="/admin" backLabel="Back to admin">
            <KingdomBuilderTileMapper />
        </AdminPage>
    );
}
