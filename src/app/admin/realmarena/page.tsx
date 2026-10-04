'use client'

import AdminPage from '@/components/ui/AdminPage';
import { RealmArenaStatsSheet } from '@/games/RealmArena/components/RealmArenaStats';

/**
 * Realm Arena's balance sheet (docs/admin-tools.md): every character's and
 * every item's numbers at once — HP, movement, sight and cost, and each
 * weapon, ability, option and item's AP, damage, range, odds and cooldown —
 * read from the same data the rules do. Read-only and built from repo data,
 * so there is no `/api/admin` route behind it and the gate is `AdminPage`'s.
 */
export default function RealmArenaStatsPage() {
    return (
        <AdminPage title="Realm Arena stats" backHref="/admin" backLabel="Back to admin">
            <RealmArenaStatsSheet />
        </AdminPage>
    );
}
