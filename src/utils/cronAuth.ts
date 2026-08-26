import { NextRequest } from 'next/server';
import { timingSafeStringEqual } from '@/utils/secrets';

/** Shared gate for the `/api/cron/*` endpoints: callers (Vercel cron or an
 *  external scheduler) must present `Authorization: Bearer $CRON_SECRET`.
 *
 *  Fails closed when CRON_SECRET isn't set. It used to compare against the
 *  template literal directly, which with the variable unset comes out as the
 *  string "Bearer undefined" — a header anybody can send. A deployment that
 *  forgot the secret had its crons open to the internet rather than shut, and
 *  nothing about the app's behaviour would have told anyone. */
export function isAuthorisedCron(request: NextRequest): boolean {
    const secret = process.env.CRON_SECRET;
    if (!secret) {
        console.error('CRON_SECRET is not set in this environment; refusing every cron request');
        return false;
    }

    const authorization = request.headers.get('authorization');
    return !!authorization && timingSafeStringEqual(authorization, `Bearer ${secret}`);
}
