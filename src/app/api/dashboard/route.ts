import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { dbConnect } from '@/utils/mongodb/mongodb';
import { buildDashboard } from '@/utils/dashboard';

/**
 * The whole home screen in one read — turn lists, both invite lists and the
 * finished games. See `buildDashboard` for why they are served together rather
 * than as the five endpoints they used to be.
 */
export async function GET(request: NextRequest) {
    console.log(`GET ${request.nextUrl.pathname}`);

    const { userId } = await auth();
    if (!userId) {
        // 401 (not 400) so a backgrounded tab whose Clerk cookie is still
        // refreshing retries instead of rendering an empty dashboard — see
        // fetchWithSessionRetry.
        console.warn(`GET ${request.nextUrl.pathname} 401: no authenticated user`);
        return NextResponse.json({}, { status: 401, statusText: "Not signed in" });
    }

    await dbConnect();

    return NextResponse.json({ success: true, ...await buildDashboard(userId) });
}
