import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/utils/api/adminRequest';
import { buildDeviceAnalytics } from '@/utils/users/adminAnalytics';
import { consumeRateLimit } from '@/utils/rateLimit';

// Every call walks the whole Clerk instance (see buildDeviceAnalytics), same
// as the guest list — capped per admin for the same reason: it protects the
// Clerk rate limit the rest of the app shares, not the admin from themselves.
const ADMIN_ANALYTICS_LIMIT = 30;
const ADMIN_ANALYTICS_WINDOW_MS = 10 * 60 * 1000;

/**
 * A snapshot of registered push devices across every account — desktop vs
 * mobile, OS, browser (docs/admin-tools.md). Read-only, and generated fresh
 * on every request rather than cached: this screen is looked at rarely
 * enough that isn't worth keeping a second copy of the data in sync for.
 */
export async function GET(request: NextRequest) {
    console.log(`GET ${request.nextUrl.pathname}`);

    const caller = await requireAdmin();
    if ('error' in caller) {
        return caller.error;
    }

    if (!(await consumeRateLimit('admin-analytics', caller.admin.id, ADMIN_ANALYTICS_LIMIT, ADMIN_ANALYTICS_WINDOW_MS))) {
        return NextResponse.json({}, { status: 429, statusText: "Too many requests — try again shortly." });
    }

    return NextResponse.json(await buildDeviceAnalytics());
}
