// The Android app's Google sign-in, on the server side. This route mints a
// sign-in ticket for an unauthenticated caller — a ticket *is* the account —
// so what it refuses matters more than what it allows, and the refusals are
// what most of this file is.
//
// The token itself is somebody else's problem: `googleIdToken.test.ts` signs
// real RS256 tokens to prove the verification. Here it is stubbed, so these
// tests are about what the route does with an identity once it has one.

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@clerk/nextjs/server', async () => (await import('@/utils/testing/apiRoute')).clerkStub());
vi.mock('next/server', async () => (await import('@/utils/testing/afterStub')).nextServerStub());
vi.mock('@/utils/mongodb/mongodb', async () => (await import('@/utils/testing/apiRoute')).mongodbStub());
vi.mock('@/utils/rateLimit', async () => (await import('@/utils/testing/apiRoute')).rateLimitStub());

// `vi.hoisted`, because `vi.mock` is lifted above the const it would
// otherwise close over.
const { verifyGoogleIdToken } = vi.hoisted(() => ({ verifyGoogleIdToken: vi.fn() }));
vi.mock('@/utils/users/googleIdToken', () => ({ verifyGoogleIdToken }));

import type { EmailAddress } from '@clerk/nextjs/server';
import { POST } from './route';
import {
    createdUsers,
    jsonPost,
    metadataWrites,
    mintedSignInTokens,
    resetApiRouteStubs,
    stubClerkUsers,
} from '@/utils/testing/apiRoute';

const GOOGLE_ID = 'google-sub-victim';
const EMAIL = 'victim@gmail.com';

/** An identity as `verifyGoogleIdToken` would return it. */
function identity(overrides: Record<string, unknown> = {}) {
    return { googleId: GOOGLE_ID, email: EMAIL, name: 'A Player', ...overrides };
}

/**
 * A Clerk email address, with only the fields the route reads — its own id and
 * link list are noise here, so the shape is cast rather than filled in.
 */
function address(emailAddress: string, status: string, strategy: string) {
    return { emailAddress, verification: { status, strategy } } as unknown as EmailAddress;
}

/** One the account holder actually proved, by answering a code. */
function provedAddress(emailAddress: string) {
    return address(emailAddress, 'verified', 'from_email_code');
}

/**
 * An address written straight through the Backend API with `verified: true`.
 * `api/user/claim` does exactly this — a guest names the email they want and
 * there is no inbox to prove yet — and Clerk stamps `admin` on it.
 */
function assertedAddress(emailAddress: string) {
    return address(emailAddress, 'verified', 'admin');
}

function post(body: unknown = { idToken: 'a-token' }) {
    return POST(jsonPost('/api/auth/googlenative', body));
}

beforeEach(async () => {
    await resetApiRouteStubs();
    verifyGoogleIdToken.mockReset();
    verifyGoogleIdToken.mockResolvedValue(identity());
});

describe('POST /api/auth/googlenative', () => {
    it('signs in the account that proved this address', async () => {
        stubClerkUsers({ id: 'user_victim', username: 'victim', emailAddresses: [provedAddress(EMAIL)] });

        const response = await post();

        expect(response.status).toBe(200);
        expect(mintedSignInTokens).toEqual([{ userId: 'user_victim', expiresInSeconds: 60 }]);
    });

    it('refuses an account that never proved the address — the claim-route takeover', async () => {
        // The attack this check exists for, end to end: an attacker takes a
        // guest account (any lobby's join code gets them one), claims it onto
        // the victim's Gmail with a password of their choosing — `api/user/claim`
        // writes that address `verified: true` with no inbox touched — and then
        // waits. Without this refusal the victim taps Google in the app, Google
        // vouches for the address honestly, and the route hands them a ticket
        // into the *attacker's* account, where everything they do is readable
        // and the attacker can act as them.
        stubClerkUsers({ id: 'user_attacker', username: 'attacker', emailAddresses: [assertedAddress(EMAIL)] });

        const response = await post();

        expect(response.status).toBe(500);
        expect(mintedSignInTokens).toEqual([]);
    });

    it('refuses an address whose verification never completed', async () => {
        stubClerkUsers({
            id: 'user_someone',
            username: 'someone',
            emailAddresses: [address(EMAIL, 'unverified', 'from_email_code')],
        });

        expect((await post()).status).toBe(500);
        expect(mintedSignInTokens).toEqual([]);
    });

    it('refuses when the address has moved to a different Google account', async () => {
        // A Workspace address outlives its owner: it is reassigned when they
        // leave. `sub` is the durable identity, so a mismatch is a refusal
        // rather than a handover of the previous holder's games.
        stubClerkUsers({
            id: 'user_former',
            username: 'former',
            emailAddresses: [provedAddress(EMAIL)],
            privateMetadata: { googleId: 'google-sub-someone-else' },
        });

        expect((await post()).status).toBe(500);
        expect(mintedSignInTokens).toEqual([]);
    });

    it('records the Google subject the first time it links an account', async () => {
        stubClerkUsers({ id: 'user_victim', username: 'victim', emailAddresses: [provedAddress(EMAIL)] });

        await post();

        expect(metadataWrites).toEqual([{ userId: 'user_victim', privateMetadata: { googleId: GOOGLE_ID } }]);
    });

    it('creates an account for a Google identity it has never seen', async () => {
        const response = await post();

        expect(response.status).toBe(200);
        expect(createdUsers).toHaveLength(1);
        expect(createdUsers[0]).toMatchObject({
            emailAddress: [EMAIL],
            publicMetadata: { displayName: 'A Player' },
            privateMetadata: { googleId: GOOGLE_ID },
        });
        expect(mintedSignInTokens).toHaveLength(1);
    });

    it('never makes a public handle out of the email address', async () => {
        // Google attests the address; the player never chose it as a name, and
        // a handle is shown to opponents and findable by username.
        verifyGoogleIdToken.mockResolvedValue(identity({ name: undefined, email: 'john.smith@employer.com' }));

        await post();

        expect(createdUsers[0].username).not.toContain('john');
        expect(createdUsers[0].username).toBe('player');
    });

    it('drops a Google profile name the app would not accept from anyone else', async () => {
        // Google attests the address, never the profile name — its holder
        // edits that freely. `Dave (@dave)` is the exact shape the app mints
        // to tell two Daves apart, so a name that forges it must not stand.
        verifyGoogleIdToken.mockResolvedValue(identity({ name: 'Dave (@dave)' }));

        await post();

        expect(createdUsers[0].publicMetadata).toEqual({});
        // Still signed in — an unusable name is not a reason to refuse them.
        expect(mintedSignInTokens).toHaveLength(1);
    });

    it('refuses a token that did not verify, without saying why', async () => {
        verifyGoogleIdToken.mockResolvedValue(null);

        const response = await post();

        expect(response.status).toBe(401);
        expect(await response.json()).toEqual({ error: 'Google sign-in failed.' });
        expect(mintedSignInTokens).toEqual([]);
    });

    it('refuses a body with no token', async () => {
        expect((await post({})).status).toBe(400);
        expect((await post({ idToken: 42 })).status).toBe(400);
        expect(verifyGoogleIdToken).not.toHaveBeenCalled();
    });

    it('refuses rather than guessing when two accounts share the address', async () => {
        stubClerkUsers(
            { id: 'user_one', username: 'one', emailAddresses: [provedAddress(EMAIL)] },
            { id: 'user_two', username: 'two', emailAddresses: [provedAddress(EMAIL)] },
        );

        expect((await post()).status).toBe(500);
        expect(mintedSignInTokens).toEqual([]);
    });
});
