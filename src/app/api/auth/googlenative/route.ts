import { clerkClient } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { readJsonBody } from '@/utils/api/requestBody';
import { clientIp, consumeRateLimit } from '@/utils/rateLimit';
import { availableUsernameFrom } from '@/utils/users/clerk';
import { verifyGoogleIdToken } from '@/utils/users/googleIdToken';
import { mintSignInToken } from '@/utils/users/signInTokens';

/**
 * Turning a Google ID token from the Android app into a Clerk session.
 *
 * The app signs in with Google natively, with no browser and no redirect
 * (`useNativeGoogleSignIn` explains why it has to). That leaves it holding a
 * Google ID token and needing a Clerk session, and Clerk's own One Tap
 * strategy won't bridge the two: a token Credential Manager mints for an
 * Android client carries `azp` naming that client, and Clerk refuses it —
 * `authorization_invalid`, with the audience perfectly correct. clerk-js has
 * no native-token strategy for Google either (it has one for Apple), so there
 * is nothing to switch to. This route is that bridge.
 *
 * It verifies the token itself (`googleIdToken.ts`), finds or creates the
 * Clerk user it names, and hands back a sign-in ticket the app redeems in the
 * WebView — the same `strategy: 'ticket'` round trip a guest's join already
 * does, so the session ends up in the WebView's own cookie jar where the SSR
 * middleware reads it from.
 *
 * **This endpoint mints credentials for unauthenticated callers**, which is
 * unusual here and is the whole reason to be careful with it. It is safe only
 * because the token is the authentication: nothing in the request body is
 * trusted except insofar as Google's signature vouches for it, and the ticket
 * is minted for the user that signature names and no other.
 */

// A token is the credential, so an attacker has nothing to iterate towards —
// they cannot forge Google's signature, and guessing is not a strategy that
// pays off at any rate. The limit is here to stop the endpoint being used to
// hammer Clerk's own user-creation API or Google's JWKS, and to bound the
// cost of someone replaying one captured token in a loop. Generous enough
// that a player fighting a flaky connection never meets it.
const SIGN_IN_LIMIT = 20;
const SIGN_IN_WINDOW_MS = 10 * 60 * 1000;

// Long enough for one round trip back into the WebView, and no longer: the
// app redeems it the instant it arrives. Same reasoning as a guest's join
// ticket (users/guest.ts), and the same number.
const TICKET_TTL_SECONDS = 60;

interface IGoogleNativeRequest {
    idToken: string;
}

/**
 * The Clerk user for a verified Google identity, creating one if this is the
 * first time we have seen them.
 *
 * Matching is by email address, which is the same rule Clerk's own OAuth
 * linking uses, and it rests entirely on `email_verified` having been checked
 * upstream: Google attesting the address is what makes "the account with this
 * address" and "the person holding this token" the same person. An address
 * Google has not vouched for never reaches here.
 *
 * A brand-new account is created the way the web's Google sign-in creates one
 * — no password, a username derived from their name — so a player who signs
 * up in the app and one who signs up on the site end up identical. Worth
 * knowing: this is the Backend API, so it does not pass through the sign-up
 * restrictions an instance can be configured with. There are none today, and
 * the app's own invite gate (`isUnlockedUser`) still applies either way, but
 * a restriction added later would not apply here without a change.
 */
async function findOrCreateUser(email: string, name: string | undefined): Promise<string> {
    const client = await clerkClient();

    const existing = await client.users.getUserList({ emailAddress: [email], limit: 2 });
    if (existing.data.length === 1) {
        return existing.data[0].id;
    }
    if (existing.data.length > 1) {
        // Clerk enforces one account per address, so this is not a state the
        // instance should be able to reach. Guessing which of them the player
        // meant is not a decision worth making with a credential.
        throw new Error(`More than one account holds ${email}`);
    }

    const created = await client.users.createUser({
        emailAddress: [email],
        username: await availableUsernameFrom(name ?? email.split('@')[0]),
        skipPasswordRequirement: true,
        publicMetadata: name ? { displayName: name } : {},
    });
    return created.id;
}

export async function POST(request: NextRequest) {
    console.log(`POST ${request.nextUrl.pathname}`);

    if (!(await consumeRateLimit('google-native', clientIp(request.headers), SIGN_IN_LIMIT, SIGN_IN_WINDOW_MS))) {
        return NextResponse.json({ error: 'Too many attempts. Please try again later.' }, { status: 429 });
    }

    const { idToken } = await readJsonBody<IGoogleNativeRequest>(request);
    if (typeof idToken !== 'string' || !idToken) {
        return NextResponse.json({ error: 'Google sign-in failed.' }, { status: 400 });
    }

    const identity = await verifyGoogleIdToken(idToken);
    if (!identity) {
        // Deliberately the same sentence a malformed body gets, and the same
        // one a genuine player would see. Which check a token failed is in
        // the logs, not in the response: an endpoint that narrates its
        // refusals is one somebody can iterate against.
        return NextResponse.json({ error: 'Google sign-in failed.' }, { status: 401 });
    }

    try {
        const userId = await findOrCreateUser(identity.email, identity.name);
        return NextResponse.json({ ticket: await mintSignInToken(userId, TICKET_TTL_SECONDS) });
    } catch (error) {
        // Clerk refusing the address, two accounts sharing one, no username
        // left after a hundred tries: all of them leave the player signed out
        // with email and password still working, and none of them is theirs
        // to act on.
        console.error('Could not sign in a verified Google identity', error);
        return NextResponse.json({ error: 'Google sign-in failed.' }, { status: 500 });
    }
}
