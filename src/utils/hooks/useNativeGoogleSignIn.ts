'use client'

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSignIn } from '@clerk/nextjs/legacy';
import { completeTicketSignIn } from '@/utils/users/ticketSignIn';
import { hasNativePlugin, isNativeShell } from '@/utils/native';
import { returnPath } from '@/utils/ui/returnPath';
import { withTimeout } from '@/utils/withTimeout';

/**
 * Signing in with Google inside the native Android shell, without a browser.
 *
 * Clerk's own Google button can't work there, and no amount of navigation
 * plumbing makes it. Two separate things stop it:
 *
 * 1. Google refuses to serve its consent screen to an embedded WebView at all
 *    (`disallowed_useragent`) — its answer to the app that shows you a login
 *    form it can read.
 * 2. Handing that one hop to the phone's real browser instead doesn't help,
 *    because Clerk binds a sign-in attempt to the Client that created it. The
 *    attempt starts in the WebView's cookie jar and Google's callback lands in
 *    Chrome's, so Clerk sees a state naming a Client that isn't the one asking
 *    and rejects it. Starting the whole round trip in the browser fixes the
 *    mismatch but leaves the session in the browser, which is the half the app
 *    actually needed.
 *
 * So the app doesn't navigate anywhere. Android's Credential Manager shows the
 * account picker over the app — the accounts already on the phone, no browser,
 * no typing — and hands back a Google ID token.
 *
 * That token goes to our own server (`api/auth/googlenative`) rather than
 * straight to Clerk, and that detour is not a preference. Clerk's One Tap
 * strategy is the only native-token route clerk-js offers for Google (it has
 * `oauth_token_apple` and no Google equivalent), and it refuses a token minted
 * for an Android client: the audience is right, but `azp` names the Android
 * OAuth client rather than the web one, and Clerk answers
 * `authorization_invalid`. Credential Manager cannot mint a token without that
 * `azp`, so there is no client-side way round it. The route verifies the token
 * against Google's own keys and hands back a Clerk sign-in ticket, which is
 * redeemed here — the same `strategy: 'ticket'` round trip a guest's join
 * does. The session then lands in the WebView's own cookie jar, which is where
 * the rest of the app and the SSR middleware read it from.
 *
 * Microsoft needs none of this: it renders happily in a WebView, so its hop
 * stays in the WebView and is covered by `allowNavigation` in
 * `capacitor.config.ts`. There is no Microsoft equivalent of this hook to
 * write — Clerk's native-token strategies are Google and Apple only.
 */

/**
 * The *web* OAuth client ID from the Google Cloud project Clerk's Google
 * connection is configured with — not the Android one. That's not a mix-up:
 * Credential Manager wants the web client ID as its `serverClientId` so the ID
 * token it mints is audienced to the client Clerk verifies against. The
 * Android client (package name plus signing SHA-1) still has to exist in the
 * same project, but nothing here names it.
 *
 * Public because the WebView reads it: it identifies the client, it doesn't
 * authorise anything, and the secret half never leaves Clerk.
 */
const WEB_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID;

/**
 * How long the token has to become an active session before the button gives
 * up and says so.
 *
 * It needs one: the exchange is a round trip to our own server and then a
 * Clerk call, and Clerk's isomorphic wrapper queues calls on a promise that
 * settles when clerk-js finishes loading and *never* rejects or expires. This
 * button paints before clerk-js is ready by design (see `resolveStatus`), so
 * tapping it mid-load is the ordinary case — and in the shell there is no
 * address bar and no pull-to-refresh, so a hang is a force-quit. Generous,
 * because the phone has already shown a picker and the player has already
 * chosen: finishing slowly beats failing.
 */
const CLERK_EXCHANGE_TIMEOUT_MS = 30_000;

export type NativeGoogleStatus =
    /** A browser. Clerk's own button is the right one; show nothing. */
    | 'absent'
    /** The app, with no client ID configured: nothing to offer, and nothing to say. */
    | 'unavailable'
    /** The app, in a shell built before the plugin existed: offer an update. */
    | 'outdated'
    /** Ready to be tapped. */
    | 'ready'
    /** Picker open, or the token on its way to Clerk. */
    | 'busy';

export interface NativeGoogleSignInState {
    status: NativeGoogleStatus;
    /** Something went wrong and the player should see it. Cancelling isn't one. */
    error: string | null;
    /**
     * TEMPORARY (see `describeFailure`): the technical detail behind `error`,
     * for a shell that can't be attached to a debugger. Remove with the
     * function that fills it.
     */
    detail: string | null;
    signIn: () => void;
}

type SocialLoginPlugin = (typeof import('@capgo/capacitor-social-login'))['SocialLogin'];

/* ------------------------------------------------------------------------ *
 * TEMPORARY DIAGNOSTIC — remove once Google sign-in is confirmed working.
 *
 * A release APK can't be attached to a debugger: `chrome://inspect` won't
 * list it (Capacitor only enables WebView debugging for a debuggable build)
 * and Capacitor's console-to-logcat forwarding is off in release too. So a
 * failure here is invisible without rebuilding the shell.
 *
 * It used to decode the token and print its claims, which is how we learned
 * that Clerk was refusing a perfectly good audience. That question is settled
 * and the decoding is gone with it — a line away from putting somebody's
 * Google subject and address on a screen that gets screenshotted. What's left
 * is the reason the exchange failed, which is all that's useful now.
 * ------------------------------------------------------------------------ */

function describeFailure(cause: unknown): string {
    const message = cause instanceof Error ? cause.message : String(cause);
    const code = (cause as { code?: string })?.code;
    return `cause: ${code ? `[${code}] ` : ''}${message}`;
}

/**
 * The configured plugin, fetched and handed its client ID once per app rather
 * than once per screen — it configures a native singleton, so a second call
 * would be a second round trip saying the same thing. Held as the promise
 * rather than a boolean so a tap that lands mid-flight waits for it instead of
 * racing it.
 */
let configured: Promise<SocialLoginPlugin> | null = null;

/**
 * The import is deliberately dynamic, and this is the only place it happens.
 * The plugin's entry module runs an OAuth-popup handler on import that reads
 * `localStorage` with no try/catch — which *throws* in a browser with site
 * data blocked, during module evaluation of the sign-in screen's chunk, where
 * nothing here could catch it. A player who has never opened the app would
 * lose /login and /signup entirely. Nothing is lost by waiting: the browser
 * and old-shell cases are decided by `hasNativePlugin`, which answers from the
 * native bridge's plugin headers rather than from this module, so neither ever
 * fetches a byte of it.
 */
function configure(): Promise<SocialLoginPlugin> {
    if (!WEB_CLIENT_ID) {
        // Unreachable from a tap: `resolveStatus` answers `unavailable` with no
        // client ID, so no button is drawn to tap. Here so the caller doesn't
        // need a non-null assertion to say the same thing.
        return Promise.reject(new Error('NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID is unset'));
    }
    configured ??= import('@capgo/capacitor-social-login')
        .then(async ({ SocialLogin }) => {
            await SocialLogin.initialize({ google: { webClientId: WEB_CLIENT_ID } });
            return SocialLogin;
        })
        .catch((error: unknown) => {
            // Memoise the success, never the failure. Android's credential
            // provider can be mid-update when the sign-in screen mounts and
            // fine a minute later, and the WebView is never reloaded — so a
            // cached rejection would make "Try again" a promise this code
            // couldn't keep for the rest of the app's life.
            configured = null;
            throw error;
        });
    return configured;
}

/**
 * What this shell can offer, answered once on mount. Async so the answer lands
 * in a microtask rather than synchronously inside the effect, which is what
 * `react-hooks/set-state-in-effect` asks for.
 *
 * **It must not await anything before answering `ready`**, and that is
 * load-bearing rather than tidiness. The status it returns is also what tells
 * `AuthCardStack` to hide Clerk's own Google button, and Clerk's card only
 * appears once clerk-js has been fetched — a whole network round trip away.
 * Answering within a few microtasks means the rule is in place before there is
 * anything to hide. Await `configure()` here — the obvious temptation — and
 * that becomes a bridge round trip, and Clerk's button, which in the app can
 * only produce an error, becomes briefly tappable.
 */
async function resolveStatus(): Promise<NativeGoogleStatus> {
    if (!isNativeShell()) {
        return 'absent';
    }
    if (!hasNativePlugin('SocialLogin')) {
        return 'outdated';
    }
    if (!WEB_CLIENT_ID) {
        // A deployment misconfiguration rather than a player's problem: say so
        // where a developer will see it, and show them nothing. Still a native
        // status, so Clerk's broken button stays hidden — a preview APK built
        // without the var is exactly where it would otherwise come back, and
        // `capacitor.config.ts` deliberately keeps Google off `allowNavigation`,
        // so tapping it would strand them in the system browser.
        console.error('NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID is unset — Google sign-in is off in the app');
        return 'unavailable';
    }
    void configure().catch(() => {
        // Reported at the tap, where someone is actually waiting on it.
    });
    return 'ready';
}

/**
 * Whether a sign-in is already in flight — module-level, because the flow
 * outlives the screen that starts it. Clerk's card carries a "Sign up" link,
 * so tapping that mid-exchange remounts this hook on /signup with a fresh
 * state and a second account picker one tap away.
 */
let signingIn = false;

export function useNativeGoogleSignIn(): NativeGoogleSignInState {
    const { signIn: clerkSignIn, setActive } = useSignIn();
    const router = useRouter();
    const [status, setStatus] = useState<NativeGoogleStatus>('absent');
    const [error, setError] = useState<string | null>(null);
    // TEMPORARY, with `describeFailure`.
    const [detail, setDetail] = useState<string | null>(null);

    // Deliberately starts at `absent` and only ever moves in an effect, so the
    // server and the browser's first render agree: the server has no idea which
    // of the two skins it's rendering for, and guessing produces a hydration
    // mismatch on every sign-in screen. Same reason `useAppVersion` starts null.
    useEffect(() => {
        let cancelled = false;
        resolveStatus()
            .catch((statusError) => {
                // Nothing the player can act on, and email and password are
                // still right there, so this stays out of their way.
                console.error('Google sign-in is unavailable in this shell', statusError);
                return 'absent' as const;
            })
            .then((resolved) => { if (!cancelled) setStatus(resolved); });
        return () => { cancelled = true; };
    }, []);

    const signIn = useCallback(() => {
        if (signingIn) {
            return;
        }
        signingIn = true;
        setStatus('busy');
        setError(null);
        setDetail(null);
        void (async () => {
            // TEMPORARY, with `describeFailure`: `withTimeout` logs and
            // swallows, so the real reason is kept here to report on screen.
            let exchangeRefused: unknown = null;
            try {
                const SocialLogin = await configure();
                const { result } = await SocialLogin.login({ provider: 'google', options: {} });
                // `offline` mode returns a server auth code and no token; the
                // plugin is configured in `online` mode, so this is the
                // narrowing rather than a case that happens.
                const idToken = 'idToken' in result ? result.idToken : null;
                if (!idToken) {
                    throw new Error('Google signed in but returned no ID token');
                }

                // Our own server, not Clerk: see the note at the top of
                // this file for why Clerk won't take this token directly.
                // It answers with a sign-in ticket, which is redeemed the
                // same way a guest's join redeems theirs.
                const signedIn = await withTimeout(
                    async () => {
                        const response = await fetch('/api/auth/googlenative', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ idToken }),
                        });
                        if (!response.ok) {
                            exchangeRefused = new Error(`The server refused the Google token (${response.status})`);
                            throw exchangeRefused;
                        }
                        const { ticket } = await response.json() as { ticket?: string };
                        if (!ticket || !clerkSignIn || !setActive) {
                            exchangeRefused = new Error('No ticket to sign in with');
                            throw exchangeRefused;
                        }
                        return completeTicketSignIn(clerkSignIn, setActive, ticket);
                    },
                    CLERK_EXCHANGE_TIMEOUT_MS,
                    false,
                    'Signing in with the Google token',
                );
                if (!signedIn) {
                    throw exchangeRefused ?? new Error('Clerk did not finish the Google sign-in');
                }
                router.push(returnPath());
                // Left `busy` on purpose: the navigation is already under way,
                // and a button that springs back to life first invites a second
                // tap on a sign-in that has already happened.
            } catch (signInError) {
                setStatus('ready');
                if ((signInError as { code?: string })?.code === 'USER_CANCELLED') {
                    // Closing the account picker is a decision, not a failure.
                    return;
                }
                console.error('Google sign-in failed', signInError);
                setError('Google sign-in didn’t work. Try again, or use your email and password.');
                // TEMPORARY, with `describeFailure`.
                setDetail(describeFailure(signInError));
            } finally {
                signingIn = false;
            }
        })();
    }, [clerkSignIn, setActive, router]);

    return { status, error, detail, signIn };
}
