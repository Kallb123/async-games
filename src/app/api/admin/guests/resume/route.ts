import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/utils/api/adminRequest';
import { readJsonBody } from '@/utils/api/requestBody';
import { createResumeTicket, GUEST_RESUME_TICKET_TTL_SECONDS } from '@/utils/users/guest';
import { buildResumeHref } from '@/utils/users/resumeLink';
import { usersById } from '@/utils/users/clerk';
import { isGuest, readableName } from '@/utils/ui/players';
import { consumeRateLimit } from '@/utils/rateLimit';
import type { IAdminGuestResumeRequest, IAdminGuestResumeResponse } from '@/utils/users/adminGuests';

// A link minted here is a way into somebody's account, so the budget is small
// and per admin: a support conversation needs one or two, and a compromised
// admin session minting them in bulk is the thing worth slowing down.
const RESUME_MINT_LIMIT = 20;
const RESUME_MINT_WINDOW_MS = 60 * 60 * 1000;

/**
 * A replacement resume link for a guest who lost theirs (docs/admin-tools.md):
 * the same Clerk sign-in token the join route hands out at sign-up, re-minted
 * on request, for an admin to send back through whatever channel the guest
 * asked on.
 *
 * **Guests only.** The link is a credential — whoever holds it *is* that
 * account — and a guest is the one account for which that is the designed way
 * in: unclaimed, no password, no email of its own, and a link shown exactly
 * once at sign-up. A registered account has a password and a reset flow, so
 * minting one of these for it would be an impersonation tool rather than a
 * recovery one. The check below is what keeps the two apart, and the reason
 * this route reads the target from Clerk rather than trusting the id it was
 * handed.
 */
export async function POST(request: NextRequest) {
    console.log(`POST ${request.nextUrl.pathname}`);

    const caller = await requireAdmin();
    if ('error' in caller) {
        return caller.error;
    }

    if (!(await consumeRateLimit('admin-guest-resume', caller.admin.id, RESUME_MINT_LIMIT, RESUME_MINT_WINDOW_MS))) {
        return NextResponse.json({}, { status: 429, statusText: "Too many links minted — try again later." });
    }

    const { userId } = await readJsonBody<IAdminGuestResumeRequest>(request);
    if (typeof userId !== 'string' || !userId) {
        return NextResponse.json({}, { status: 400, statusText: "Missing user id" });
    }

    const [target] = await usersById([userId]);
    if (!target) {
        return NextResponse.json({}, { status: 404, statusText: "No such account" });
    }
    if (!isGuest(target)) {
        return NextResponse.json({}, { status: 400, statusText: "Not a guest account" });
    }

    const ticket = await createResumeTicket(target.id);
    // The audit trail. A route that hands out access to an account says so in
    // the log, with who asked: this is the one record that a link exists at
    // all, since nothing stores the ticket itself.
    console.log(`Admin ${caller.admin.id} minted a resume link for guest ${target.id}`);

    const response: IAdminGuestResumeResponse = {
        resumeUrl: `${request.nextUrl.origin}${buildResumeHref(ticket)}`,
        name: readableName(target),
        expiresAt: new Date(Date.now() + GUEST_RESUME_TICKET_TTL_SECONDS * 1000).toISOString(),
    };
    return NextResponse.json(response);
}
