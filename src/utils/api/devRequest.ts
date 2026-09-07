import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { isDevDeployment } from '@/utils/devEnvironment';

/**
 * Either the signed-in caller of a `/api/dev/*` route, or the response to
 * answer them with. Callers do `if ('error' in caller) return caller.error;`
 * and carry on with `caller.userId` — the same shape `requireAdmin` uses, so a
 * route's first three lines read the same whichever gate it needs.
 */
export type DevCaller =
    | { userId: string }
    | { error: NextResponse };

/**
 * The gate every `/api/dev/*` route shares: this has to be a dev deployment,
 * and the caller has to be signed in.
 *
 * Off a dev deployment the routes answer 404 rather than doing anything, as
 * though they had never been deployed — see `isDevDeployment`.
 *
 * The database these act on is the dev one (docs/environments.md — Production
 * points at a different `MONGODB_URI`), so this was never a route to
 * production data, but a preview URL is still shareable, and the wipes are
 * GETs: a crawler that follows one wipes the dev database, and so does anyone
 * the link reaches. Being signed in is a low bar and the right one — it isn't
 * a permission, it's a pulse.
 */
export async function requireDevCaller(): Promise<DevCaller> {
    if (!isDevDeployment) {
        return { error: NextResponse.json({}, { status: 404, statusText: 'Not Found' }) };
    }

    const { userId } = await auth();
    if (!userId) {
        return { error: NextResponse.json({}, { status: 400, statusText: 'Not signed in' }) };
    }

    return { userId };
}
