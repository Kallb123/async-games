import { NextRequest } from 'next/server';

/** Shared gate for the `/api/cron/*` endpoints: callers (Vercel cron or an
 *  external scheduler) must present `Authorization: Bearer $CRON_SECRET`. */
export function isAuthorisedCron(request: NextRequest): boolean {
    return request.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`;
}
