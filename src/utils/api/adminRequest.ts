import { NextResponse } from 'next/server';
import { User, currentUser } from '@clerk/nextjs/server';
import { isAdmin } from '@/utils/ui/players';

/**
 * The signed-in admin behind an `/api/admin/*` request, or the response to
 * answer it with.
 *
 * Callers do `if ('error' in caller) return caller.error;` and carry on — the
 * same shape `requireGameHost` uses, so a route's first three lines read the
 * same whichever gate it needs.
 */
export type AdminCaller =
    | { error: NextResponse }
    | { admin: User };

/**
 * Establishes that whoever is asking runs the app (docs/admin-tools.md):
 * signed in, resolvable, and carrying `publicMetadata.admin`.
 *
 * Every route under `/api/admin` opens with this. The screen's own `isAdmin`
 * check only decides whether to draw the link — it is not a gate, because
 * nothing stops anyone calling these endpoints directly.
 *
 * One deliberately vague 403 for all three failures: a stranger poking at
 * these paths learns whether they are an admin, which they know already, and
 * nothing else.
 */
export async function requireAdmin(): Promise<AdminCaller> {
    const admin = await currentUser();
    if (!admin || !isAdmin(admin)) {
        return { error: NextResponse.json({}, { status: 403, statusText: "Not an admin" }) };
    }
    return { admin };
}
