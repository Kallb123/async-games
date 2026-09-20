import { clerkClient } from '@clerk/nextjs/server';
import type { User } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { readJsonBody } from '@/utils/api/requestBody';
import { clientIp, consumeRateLimit } from '@/utils/rateLimit';
import { availableUsernameFrom } from '@/utils/users/clerk';
import { isValidDisplayName } from '@/utils/users/displayName';
import { verifyGoogleIdToken, type GoogleIdentity } from '@/utils/users/googleIdToken';
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
// pays off at any rate. The per-IP limit is here to stop the endpoint being
// used to hammer Clerk's user-creation API or Google's JWKS. It is deliberately
// loose because the audience for this route is phones behind carrier CGNAT,
// where one egress address is thousands of players; the tight limit is the
// per-identity one below, which only exists once a token has proved who it is.
const SIGN_IN_IP_LIMIT = 120;
const SIGN_IN_IP_WINDOW_MS = 10 * 60 * 1000;

// What one Google account may do, checked after its token is verified — so it
// bounds a captured token being replayed into an endless stream of tickets,
// which is the one thing a stolen token is good for. Google's own tokens last
// about an hour; the ticket lasts a minute; this is what stops the gap between
// those two numbers being unlimited.
const SIGN_IN_IDENTITY_LIMIT = 10;
const SIGN_IN_IDENTITY_WINDOW_MS = 10 * 60 * 1000;

// Long enough for one round trip back into the WebView, and no longer: the
// app redeems it the instant it arrives. Same reasoning as a guest's join
// ticket (users/guest.ts), and the same number.
const TICKET_TTL_SECONDS = 60;

interface IGoogleNativeRequest {
    idToken: string;
}

/**
 * Whether a Clerk account's claim on an address is one somebody actually
 * proved — and so whether signing in as them on Google's say-so is sound.
 *
 * This is the hinge of the whole route, because "verified" in Clerk means two
 * different things. An address the account holder proved by answering a code
 * is evidence. An address written through the Backend API with
 * `verified: true` is not evidence of anything: nobody touched the inbox, the
 * server simply asserted it. This app has a route that does exactly that
 * (`api/user/claim`, where a guest names the email they want and there is no
 * inbox to prove yet), and Clerk stamps `strategy: 'admin'` on both that write
 * and `guest.ts`'s placeholder.
 *
 * Without this check the two compose into an account takeover: claim a guest
 * account onto someone else's Gmail with a password of your choosing, wait for
 * them to tap Google in the app, and the route hands them a ticket into *your*
 * account — where you can read everything they then do and act as them.
 * Matching only proved addresses closes it from this side.
 */
function provedTheirAddress(user: User, email: string): boolean {
    const address = user.emailAddresses.find(entry => entry.emailAddress.toLowerCase() === email);
    return address?.verification?.status === 'verified' && address.verification.strategy !== 'admin';
}

/** Where a linked Google account's `sub` is recorded. Never shown to anyone. */
function recordedGoogleId(user: User): string | undefined {
    const recorded = user.privateMetadata?.googleId;
    return typeof recorded === 'string' ? recorded : undefined;
}

/**
 * The Clerk user for a verified Google identity, creating one if this is the
 * first time we have seen them.
 *
 * Matching is by email address, which is the rule Clerk's own OAuth linking
 * uses, and it holds up from both directions: Google attests the address
 * (`email_verified`, checked upstream), and `provedTheirAddress` requires the
 * Clerk account to have done the same. Either half missing and the match is
 * somebody's word rather than evidence.
 *
 * Google's `sub` is the durable identity — an email address is not, since a
 * Workspace address is reassigned when its owner leaves — so it is recorded on
 * first link and required to match afterwards. That turns a reassigned address
 * into a refusal rather than a handover of the previous holder's account.
 *
 * A brand-new account is created the way the web's Google sign-in creates one
 * — no password, a username derived from their name — so a player who signs
 * up in the app and one who signs up on the site end up identical. Worth
 * knowing: this is the Backend API, so it does not pass through the sign-up
 * restrictions an instance can be configured with. There are none today, and
 * the app's own invite gate (`isUnlockedUser`) still applies either way, but a
 * restriction added later would not apply here without a change — it would
 * fail silently, which is the part worth remembering.
 */
async function findOrCreateUser(identity: GoogleIdentity): Promise<string> {
    const client = await clerkClient();
    const { email, googleId, name } = identity;

    const existing = await client.users.getUserList({ emailAddress: [email], limit: 2 });
    if (existing.data.length > 1) {
        // Clerk enforces one account per address, so this is not a state the
        // instance should be able to reach. Guessing which of them the player
        // meant is not a decision worth making with a credential.
        throw new Error(`More than one account holds ${email}`);
    }

    if (existing.data.length === 1) {
        const user = existing.data[0];
        if (!provedTheirAddress(user, email)) {
            throw new Error(`${email} is held by an account that never proved it`);
        }
        const recorded = recordedGoogleId(user);
        if (recorded && recorded !== googleId) {
            // The address moved to a different Google account. Signing this
            // one in would hand them the previous holder's games.
            throw new Error(`${email} now belongs to a different Google account`);
        }
        if (!recorded) {
            await client.users.updateUserMetadata(user.id, { privateMetadata: { googleId } });
        }
        return user.id;
    }

    // Google attests the address, never the profile name — its holder edits
    // that freely — so it goes through the same validator every other writer
    // of this field uses. An unusable one degrades to no display name rather
    // than to a refused sign-in; they keep their username either way.
    const displayName = name && isValidDisplayName(name) ? name : undefined;
    const created = await client.users.createUser({
        emailAddress: [email],
        // Never the email's local part: that would make a handle out of
        // something the player never chose, shown to opponents and findable
        // by username, from an address they gave to Google and not to us.
        username: await availableUsernameFrom(displayName ?? 'player'),
        skipPasswordRequirement: true,
        publicMetadata: displayName ? { displayName } : {},
        privateMetadata: { googleId },
    });
    return created.id;
}

export async function POST(request: NextRequest) {
    console.log(`POST ${request.nextUrl.pathname}`);

    if (!(await consumeRateLimit('google-native-ip', clientIp(request.headers), SIGN_IN_IP_LIMIT, SIGN_IN_IP_WINDOW_MS))) {
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

    if (!(await consumeRateLimit('google-native-id', identity.googleId, SIGN_IN_IDENTITY_LIMIT, SIGN_IN_IDENTITY_WINDOW_MS))) {
        return NextResponse.json({ error: 'Too many attempts. Please try again later.' }, { status: 429 });
    }

    try {
        const userId = await findOrCreateUser(identity);
        return NextResponse.json({ ticket: await mintSignInToken(userId, TICKET_TTL_SECONDS) });
    } catch (error) {
        // An address held by an account that never proved it, a Google account
        // that isn't the one linked, two accounts sharing an address, Clerk
        // refusing the write: all of them leave the player signed out with
        // email and password still working, all of them are logged with the
        // reason, and none of them says which to the caller.
        console.error('Could not sign in a verified Google identity', error);
        return NextResponse.json({ error: 'Google sign-in failed.' }, { status: 500 });
    }
}
