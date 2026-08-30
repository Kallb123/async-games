import { auth, clerkClient } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { dbConnect } from '@/utils/mongodb/mongodb';
import { GameResultModel } from '@/utils/mongodb/GameResultData';
import { isGuestPlaceholderEmail } from '@/utils/users/guest';
import { availableUsernameFrom } from '@/utils/users/clerk';
import { readableName } from '@/utils/ui/players';
import { clerkErrorMessage } from '@/utils/users/clerkErrors';
import { clientIp, consumeRateLimit } from '@/utils/rateLimit';
import { readJsonBody } from '@/utils/api/requestBody';

// Claiming takes an email and a password and writes both to a Clerk account,
// so it is a credential endpoint on an unauthenticated-ish principal (a guest
// nobody vouched for). Enough attempts for a guest to fix a rejected password
// a few times over, not enough to hammer Clerk's own rate limits or walk a
// list of emails to find which are already registered.
const CLAIM_LIMIT = 10;
const CLAIM_WINDOW_MS = 60 * 60 * 1000;

interface IClaimRequest {
    email: string;
    password: string;
}

// Claiming a guest account (docs/account-less-play.md step 16): after their
// first turn, a guest can add the email and password that make the Clerk
// user they already are keepable. The id never changes, so every game,
// result and turn history they're in carries over with no migration — the
// only writes are Clerk's (the real email in, the guest placeholder out, the
// password, a real username derived from their display name, and dropping
// publicMetadata.guest) and one indexed $pull on GameResult.unclaimedPlayerIds
// so their finished games start counting.
export async function POST(request: NextRequest) {
    console.log(`POST ${request.nextUrl.pathname}`);

    const { userId } = await auth();
    if (!userId) {
        return NextResponse.json({ error: "You're not signed in." }, { status: 400 });
    }

    if (!(await consumeRateLimit('user-claim', clientIp(request.headers), CLAIM_LIMIT, CLAIM_WINDOW_MS))) {
        return NextResponse.json({ error: 'Too many attempts. Please try again later.' }, { status: 429 });
    }

    const { email, password } = await readJsonBody<IClaimRequest>(request);
    if (typeof email !== 'string' || !email.trim() || typeof password !== 'string' || !password) {
        return NextResponse.json({ error: 'Enter an email and a password.' }, { status: 400 });
    }

    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    if (user.publicMetadata.guest !== true) {
        return NextResponse.json({ error: 'This account is already saved.' }, { status: 400 });
    }

    // The account-creation placeholder (guest.ts) — never delivered to, and
    // not something a claim should leave sitting on the account as a second,
    // verified-but-undeliverable address once a real one exists.
    const placeholderEmail = user.emailAddresses.find(address => isGuestPlaceholderEmail(address.emailAddress));

    try {
        // A guest's Clerk username is the meaningless account id createGuest()
        // minted, so they're unfindable by usersByUsername and silently dropped
        // from invite pickers. Claiming is the moment they become a real,
        // invitable account, so mint them a real handle from the display name
        // they've been playing under and set it in the same updateUser pass as
        // the password. Derived before any write below, so a failed lookup
        // leaves nothing half-claimed behind.
        //
        // Through readableName rather than off a field: a guest has no handle,
        // so this is their chosen name — wherever it is stored, including the
        // `firstName` a guest minted before display names still keeps it in.
        const username = await availableUsernameFrom(readableName(user, ''));

        // Marked verified here the same way guest.ts's own placeholder is:
        // there is no inbox to prove ownership of on this account yet, and
        // `primary: true` moves primary status off the placeholder in the
        // same call, before it's deleted below — never a moment with no
        // primary address, and never a moment with two.
        await client.emailAddresses.createEmailAddress({
            userId,
            emailAddress: email.trim(),
            verified: true,
            primary: true,
        });
        if (placeholderEmail) {
            await client.emailAddresses.deleteEmailAddress(placeholderEmail.id);
        }
        await client.users.updateUser(userId, { password, username });
    } catch (error) {
        console.error('Failed to claim guest account', error);
        return NextResponse.json(
            { error: clerkErrorMessage(error, "Couldn't save that email and password. Please try again.") },
            { status: 400 },
        );
    }

    // Null unsets a metadata key on Clerk's merge rather than leaving it
    // false — a guest is `guest === true` or absent, never `guest === false`,
    // so every existing `publicMetadata.guest === true` check stays correct
    // with no second value to also check for.
    await client.users.updateUserMetadata(userId, { publicMetadata: { guest: null } });

    await dbConnect();
    // A game counts once every player is a registered account
    // (docs/account-less-play.md §8) — one indexed update, no recomputation,
    // nothing to backfill.
    await GameResultModel.updateMany(
        { unclaimedPlayerIds: userId },
        { $pull: { unclaimedPlayerIds: userId } },
    ).exec();

    return NextResponse.json({ success: true });
}
