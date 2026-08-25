import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { dbConnect } from '@/utils/mongodb/mongodb';
import { isDevDeployment } from '@/utils/devEnvironment';

/**
 * The shared body of the `/api/dev/*` wipes, so each route is only the
 * collections it clears. Off a dev deployment they answer 404 rather than
 * touching the database, as though they had never been deployed — see
 * `isDevDeployment`.
 */
export function devWipeRoute(what: string, wipe: () => Promise<void>) {
    return async (request: NextRequest) => {
        console.log(`GET ${request.nextUrl.pathname}`);

        if (!isDevDeployment) {
            return NextResponse.json({}, { status: 404, statusText: 'Not Found' });
        }

        // Signed in, on top of being a dev deployment. The database these
        // wipe is the dev one (docs/environments.md — Production points at a
        // different `MONGODB_URI`), so this was never a route to production
        // data, but a preview URL is still shareable and these are GETs: a
        // crawler that follows one wipes the dev database, and so does anyone
        // the link reaches. Being signed in is a low bar and the right one —
        // it isn't a permission, it's a pulse.
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({}, { status: 400, statusText: 'Not signed in' });
        }

        await dbConnect();
        console.log(`!!!---!!! Removing ${what}`);
        await wipe();

        return NextResponse.json({ success: true });
    };
}
