// The whole security boundary for the Android app's Google sign-in: whatever
// this says is true is what the route mints a credential against. Every test
// here is a token that must NOT be believed, plus the one that must.
//
// Real RS256 keys, generated per run, so the signature check is exercised
// rather than stubbed — a test that mocks `jwtVerify` proves only that the
// mock was called.

import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { SignJWT, exportJWK, generateKeyPair, type CryptoKey } from "jose";

const AUDIENCE = '1234-web.apps.googleusercontent.com';
const ANDROID_CLIENT = '1234-android.apps.googleusercontent.com';

let privateKey: CryptoKey;
let publicJwk: Record<string, unknown>;

/** A token as Google would mint it, with whatever we need to break overridden. */
async function googleToken(claims: Record<string, unknown> = {}, options: { key?: CryptoKey } = {}) {
    const { iss, aud, exp, ...rest } = {
        iss: 'https://accounts.google.com',
        aud: AUDIENCE,
        // Credential Manager's tokens name the Android client here. This is
        // the claim Clerk rejects and we deliberately do not care about.
        azp: ANDROID_CLIENT,
        sub: 'google-subject-1',
        email: 'Player@Example.com',
        email_verified: true,
        name: 'A Player',
        exp: Math.floor(Date.now() / 1000) + 600,
        ...claims,
    } as Record<string, unknown>;

    return new SignJWT(rest)
        .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
        .setIssuer(iss as string)
        .setAudience(aud as string)
        .setIssuedAt()
        .setExpirationTime(exp as number)
        .sign(options.key ?? privateKey);
}

/** Loads the module with the client ID set and Google's keys stubbed to ours. */
async function verify(token: string, { clientId = AUDIENCE }: { clientId?: string } = {}) {
    vi.resetModules();
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID', clientId);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
        JSON.stringify({ keys: [{ ...publicJwk, kid: 'test-key', alg: 'RS256', use: 'sig' }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
    )));
    const { verifyGoogleIdToken } = await import("./googleIdToken");
    return verifyGoogleIdToken(token);
}

beforeAll(async () => {
    const pair = await generateKeyPair('RS256', { extractable: true });
    privateKey = pair.privateKey;
    publicJwk = await exportJWK(pair.publicKey) as Record<string, unknown>;
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
});

describe("verifyGoogleIdToken", () => {
    it("accepts a token Credential Manager would mint, azp and all", async () => {
        // The point of the whole route: `azp` names the Android client, which
        // is exactly what Clerk refuses and what we must not.
        await expect(verify(await googleToken())).resolves.toEqual({
            googleId: 'google-subject-1',
            email: 'player@example.com', // lower-cased, so lookups can't miss on case
            name: 'A Player',
        });
    });

    it("refuses a token minted for somebody else's Google app", async () => {
        // Without the audience check, any Android app could hand us a
        // perfectly valid Google token and be believed as its user.
        await expect(verify(await googleToken({ aud: 'someone-else.apps.googleusercontent.com' }))).resolves.toBeNull();
    });

    it("refuses a token signed by a key that isn't Google's", async () => {
        const attacker = await generateKeyPair('RS256', { extractable: true });
        const forged = await googleToken({}, { key: attacker.privateKey });
        await expect(verify(forged)).resolves.toBeNull();
    });

    it("refuses an unverified email, however it's spelled", async () => {
        // The claim the account lookup rests on: an address Google hasn't
        // attested is one anyone could have typed into a Google account, and
        // matching a Clerk user on it would hand over that user's account.
        await expect(verify(await googleToken({ email_verified: false }))).resolves.toBeNull();
        await expect(verify(await googleToken({ email_verified: 'true' }))).resolves.toBeNull();
        await expect(verify(await googleToken({ email_verified: undefined }))).resolves.toBeNull();
    });

    it("refuses a token from the wrong issuer", async () => {
        await expect(verify(await googleToken({ iss: 'https://accounts.evil.example' }))).resolves.toBeNull();
    });

    it("accepts Google's other spelling of its own issuer", async () => {
        await expect(verify(await googleToken({ iss: 'accounts.google.com' }))).resolves.not.toBeNull();
    });

    it("refuses an expired token", async () => {
        // Well past the two-minute clock tolerance.
        await expect(verify(await googleToken({ exp: Math.floor(Date.now() / 1000) - 3600 }))).resolves.toBeNull();
    });

    it("refuses a token with no email or no subject", async () => {
        await expect(verify(await googleToken({ email: undefined }))).resolves.toBeNull();
        await expect(verify(await googleToken({ sub: undefined }))).resolves.toBeNull();
    });

    it("refuses anything that isn't a token at all", async () => {
        await expect(verify('')).resolves.toBeNull();
        await expect(verify('not.a.jwt')).resolves.toBeNull();
    });

    it("fails closed when the deployment has no client ID to check against", async () => {
        // Nothing to compare the audience to means no audience check, so the
        // only safe answer is no.
        await expect(verify(await googleToken(), { clientId: '' })).resolves.toBeNull();
    });
});
