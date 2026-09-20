import { createRemoteJWKSet, jwtVerify } from 'jose';

/**
 * Checking a Google ID token minted on a player's phone.
 *
 * The Android app signs in with Google without a browser: Credential Manager
 * hands it an ID token (`useNativeGoogleSignIn`) and the app posts that here
 * rather than to Clerk, because Clerk's One Tap strategy won't take it — a
 * token minted for an Android client carries `azp` naming that client, and
 * Clerk refuses it. Everything else about the token is ordinary, so this
 * verifies it the way any relying party would and the route above turns the
 * result into a Clerk session.
 *
 * This is the whole security boundary for that sign-in. Whatever comes back
 * from here is treated as proof of who the caller is, so every check below is
 * load-bearing and none of them has a fallback: a token that fails any of
 * them is not a lesser token, it is somebody else's.
 */

/** Google's signing keys. `jose` fetches them once and re-fetches on rotation. */
const GOOGLE_JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

/** Both spellings Google has used for `iss`, and still does. */
const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

/**
 * The audience every token we accept must carry: our own web OAuth client.
 *
 * Read from the same variable the app asks Credential Manager for
 * (`useNativeGoogleSignIn`), so the two cannot drift into a state where the
 * phone requests one audience and the server accepts another. It is a
 * `NEXT_PUBLIC_` name because the client genuinely needs it; reading it here
 * is still reading the server's own environment, not anything a caller sent.
 */
const WEB_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID;

/**
 * The Android OAuth client allowed to have asked for the token, if the
 * deployment names one.
 *
 * `aud` says the token was minted *for* our web client; `azp` says which
 * client asked. They differ here by design — that difference is the whole
 * reason Clerk refuses these tokens — but "differs" shouldn't mean
 * "anything". Any client registered in the same Google Cloud project can name
 * our web client as its `serverClientId` and get a token we would otherwise
 * accept, so naming the one client that should be doing it closes that down.
 *
 * Optional, and a deployment that leaves it unset still works: the audience
 * check alone already bounds tokens to clients inside our own project, which
 * is a set we control. Set it anyway — it costs one environment variable and
 * turns "some client of ours" into "the app".
 */
const ANDROID_CLIENT_ID = process.env.GOOGLE_ANDROID_CLIENT_ID;

export interface GoogleIdentity {
    /** Google's stable account id (`sub`). Never reused, never changes. */
    googleId: string;
    /** Lower-cased, and verified by Google — see `email_verified` below. */
    email: string;
    /** For naming a brand-new account. Absent on plenty of Google accounts. */
    name?: string;
}

/**
 * The identity a token proves, or `null` if it proves nothing.
 *
 * One return value for every kind of failure on purpose: the caller has
 * nothing useful to do with the difference, and an endpoint that explains
 * *why* a token was refused is an endpoint that helps someone iterate towards
 * one that isn't. The reason is logged instead.
 */
export async function verifyGoogleIdToken(idToken: string): Promise<GoogleIdentity | null> {
    if (!WEB_CLIENT_ID) {
        // The deployment has no idea which audience to accept, so it cannot
        // accept any. Fails closed, loudly, the same way the app's button
        // simply doesn't appear.
        console.error('NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID is unset — native Google sign-in cannot be verified');
        return null;
    }

    try {
        // Signature against Google's published keys, plus `iss`, `aud` and
        // the expiry, all checked by `jose` rather than by hand. `aud` is the
        // one that stops a token minted for somebody else's Google app being
        // replayed at us: without it, any Android app could hand us a valid
        // Google token and be believed.
        const { payload } = await jwtVerify(idToken, GOOGLE_JWKS, {
            issuer: GOOGLE_ISSUERS,
            audience: WEB_CLIENT_ID,
            // Google's clocks and ours are not the same clock.
            clockTolerance: '2 minutes',
        });

        const email = typeof payload.email === 'string' ? payload.email.toLowerCase() : null;
        if (!email) {
            console.error('Google ID token carried no email');
            return null;
        }

        // The claim the account lookup rests on. An address Google has not
        // attested is an address anyone could have typed into a Google
        // account, and matching a Clerk user on one would hand that user's
        // account to whoever typed it. Strictly `true`: absent, "true" and
        // anything else are all "Google is not vouching for this".
        if (payload.email_verified !== true) {
            console.error('Google ID token carried an unverified email');
            return null;
        }

        if (typeof payload.sub !== 'string' || !payload.sub) {
            console.error('Google ID token carried no subject');
            return null;
        }

        // Which client asked Google for this token. Absent on some tokens,
        // and equal to `aud` on one minted for the web client itself; both
        // are our own client asking, so both pass.
        const authorizedParty = typeof payload.azp === 'string' ? payload.azp : undefined;
        if (ANDROID_CLIENT_ID && authorizedParty && authorizedParty !== WEB_CLIENT_ID && authorizedParty !== ANDROID_CLIENT_ID) {
            console.error('Google ID token was requested by an unexpected client', authorizedParty);
            return null;
        }

        return {
            googleId: payload.sub,
            email,
            name: typeof payload.name === 'string' ? payload.name : undefined,
        };
    } catch (error) {
        // Bad signature, wrong audience, wrong issuer, expired, or not a JWT
        // at all. All of them mean the same thing to the caller.
        console.error('Google ID token failed verification', error);
        return null;
    }
}
