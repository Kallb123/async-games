import { auth, clerkClient } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { dbConnect } from '@/utils/mongodb/mongodb';
import { GameResultModel } from '@/utils/mongodb/GameResultData';
import { isGuestPlaceholderEmail } from '@/utils/users/guest';

interface IClaimRequest {
    email: string;
    password: string;
}

// The first Clerk error worth showing, in the guest's own words — falls back
// to something generic for whatever isn't a Clerk-shaped rejection (a network
// error, say). Duck-typed rather than importing @clerk/backend's error class
// just to narrow this: the Backend API's error responses all carry `errors`
// in this shape, and that's the only part read here.
function clerkErrorMessage(error: unknown, fallback: string): string {
    const errors = (error as { errors?: { longMessage?: string; message?: string }[] } | null)?.errors;
    const first = errors?.[0];
    return first?.longMessage || first?.message || fallback;
}

// Claiming a guest account (docs/account-less-play.md step 16): after their
// first turn, a guest can add the email and password that make the Clerk
// user they already are keepable. The id never changes, so every game,
// result and turn history they're in carries over with no migration — the
// only writes are Clerk's (the real email in, the guest placeholder out, the
// password, and dropping publicMetadata.guest) and one indexed $pull on
// GameResult.unclaimedPlayerIds so their finished games start counting.
export async function POST(request: NextRequest) {
    console.log(`POST ${request.nextUrl.pathname}`);

    const { userId } = await auth();
    if (!userId) {
        return NextResponse.json({ error: "You're not signed in." }, { status: 400 });
    }

    const { email, password }: IClaimRequest = await request.json();
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
        await client.users.updateUser(userId, { password });
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
