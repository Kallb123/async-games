import { auth } from '@clerk/nextjs/server';
import { NextRequest } from 'next/server';
import { dbConnect } from '@/utils/mongodb/mongodb';
import { buildDashboard } from '@/utils/dashboard';
import { ServerTiming, timedJson } from '@/utils/api/serverTiming';

export async function GET(request: NextRequest) {
    console.log(`GET ${request.nextUrl.pathname}`);
    const timing = new ServerTiming();
    const { userId } = await timing.time('auth', auth);
    if (!userId) return timedJson({}, timing, { status: 401, statusText: 'Not signed in' });
    timing.noteInstance();
    await timing.time('mongo_connect', dbConnect);
    const dashboard = await buildDashboard(userId, (name, work) => timing.time(name, work));
    return timedJson({ success: true, ...dashboard }, timing);
}
