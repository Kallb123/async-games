import { NextRequest, NextResponse } from 'next/server';
import { dbConnect } from '@/utils/mongodb/mongodb';
import { requireAdmin } from '@/utils/api/adminRequest';
import { listGuestAccounts } from '@/utils/users/adminGuests';
import { consumeRateLimit } from '@/utils/rateLimit';

// Longest search term worth honouring — anything past this is a paste, not a
// name, and the walk below shouldn't be doing substring work on it.
const MAX_SEARCH_LENGTH = 60;

// Every call walks the whole Clerk instance (see listGuestAccounts), so this
// is capped per admin rather than left to whatever a stuck refresh loop or a
// typed-out search box asks for: it protects the Clerk rate limit the rest of
// the app shares, not the admin from themselves. Generous enough to search,
// re-search and refresh for as long as a support conversation takes.
const ADMIN_GUESTS_LIMIT = 60;
const ADMIN_GUESTS_WINDOW_MS = 10 * 60 * 1000;

/**
 * The unclaimed guest accounts, for the guest-recovery screen
 * (docs/admin-tools.md). Read-only: it hands back who exists and which tables
 * they are sitting at, so an admin can identify the guest who wrote in before
 * minting them a link.
 */
export async function GET(request: NextRequest) {
    console.log(`GET ${request.nextUrl.pathname}`);

    const caller = await requireAdmin();
    if ('error' in caller) {
        return caller.error;
    }

    if (!(await consumeRateLimit('admin-guests', caller.admin.id, ADMIN_GUESTS_LIMIT, ADMIN_GUESTS_WINDOW_MS))) {
        return NextResponse.json({}, { status: 429, statusText: "Too many requests — try again shortly." });
    }

    await dbConnect();

    const search = (request.nextUrl.searchParams.get('q') ?? '').slice(0, MAX_SEARCH_LENGTH);
    return NextResponse.json(await listGuestAccounts(search));
}
