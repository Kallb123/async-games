import { NextRequest, NextResponse } from 'next/server';
import { dbConnect } from '@/utils/mongodb/mongodb';
import { requireDevCaller } from '@/utils/api/devRequest';

/**
 * The shared body of the `/api/dev/*` wipes, so each route is only the
 * collections it clears. Being a dev deployment and being signed in are
 * `requireDevCaller`'s, shared with every other dev route.
 */
export function devWipeRoute(what: string, wipe: () => Promise<void>) {
    return async (request: NextRequest) => {
        console.log(`GET ${request.nextUrl.pathname}`);

        const caller = await requireDevCaller();
        if ('error' in caller) {
            return caller.error;
        }

        await dbConnect();
        console.log(`!!!---!!! Removing ${what}`);
        await wipe();

        return NextResponse.json({ success: true });
    };
}
