import { NextRequest, NextResponse } from 'next/server';
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

        await dbConnect();
        console.log(`!!!---!!! Removing ${what}`);
        await wipe();

        return NextResponse.json({ success: true });
    };
}
