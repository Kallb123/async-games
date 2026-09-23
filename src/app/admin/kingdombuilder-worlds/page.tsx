'use client'

import AdminPage from '@/components/ui/AdminPage';
import AdminKingdomBuilderWorlds from '@/games/KingdomBuilder/components/AdminKingdomBuilderWorlds';

/**
 * Every Kingdom Builder world, with an end/delete control per row
 * (docs/admin-tools.md, GDD §9.1). The gate that matters is
 * `/api/admin/kingdombuilder-worlds`'s `requireAdmin`; `AdminPage` only
 * decides what to draw.
 */
export default function KingdomBuilderWorldsAdminPage() {
    return (
        <AdminPage title="Worlds" backHref="/admin" backLabel="Back to admin">
            <AdminKingdomBuilderWorlds />
        </AdminPage>
    );
}
