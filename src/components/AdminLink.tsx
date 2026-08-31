'use client'

import Link from 'next/link';
import { useUser } from '@clerk/nextjs';
import { isAdmin } from '@/utils/ui/players';

/**
 * The way into `/admin` (docs/admin-tools.md), in the Settings footer beside
 * `DevTools` — the same shape and the same idea: a self-gating link that isn't
 * there for anyone it isn't for. Hiding it is a courtesy, not the gate; the
 * routes behind it check for themselves.
 */
export default function AdminLink() {
    const { user } = useUser();

    if (!user || !isAdmin(user)) {
        return null;
    }

    return (
        <div className="ag-footer-action">
            <Link href="/admin" className="ag-link-muted">Admin tools</Link>
        </div>
    );
}
