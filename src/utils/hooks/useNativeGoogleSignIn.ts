'use client'

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useClerk } from '@clerk/nextjs';
import { SocialLogin } from '@capgo/capacitor-social-login';
import { hasNativePlugin, isNativeShell } from '@/utils/native';
import { returnPath } from '@/utils/ui/returnPath';

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
 * no typing — and hands back a Google ID token, which goes straight to Clerk
 * through the One Tap strategy. Clerk verifies it against the same Google
 * client the web flow uses and creates the session in the WebView's own cookie
 * jar, which is where the rest of the app (and the SSR middleware) reads it
 * from.
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

export type NativeGoogleStatus =
    /** Not the app, or the app with nothing configured: show nothing. */
    | 'absent'
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
    signIn: () => void;
}

/**
 * Handing the client ID to the plugin, once per app rather than once per
 * screen — it configures a native singleton, so a second call would be a
 * second round trip saying the same thing. Kept as the promise rather than a
 * boolean so a tap that lands mid-flight waits for it instead of racing it.
 */
let configured: Promise<void> | null = null;

function configure(): Promise<void> {
    if (!WEB_CLIENT_ID) {
        // Unreachable from a tap: `resolveStatus` answers `absent` with no
        // client ID, so no button is drawn to tap. Here so the caller doesn't
        // need a non-null assertion to say the same thing.
        return Promise.reject(new Error('NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID is unset'));
    }
    configured ??= SocialLogin.initialize({ google: { webClientId: WEB_CLIENT_ID } });
    return configured;
}

/**
 * What this shell can offer, answered once on mount. Async so the answer lands
 * in a microtask rather than synchronously inside the effect, which is what
 * `react-hooks/set-state-in-effect` asks for.
 *
 * Deliberately doesn't wait for `configure()`: the button's job is to be there
 * from the moment we know we're in the app, because the modifier class it
 * carries is also what hides Clerk's own Google button, and a screen that had
 * to wait for a bridge round trip first could paint Clerk's for a frame. The
 * tap awaits it instead, so a configure that failed surfaces as an error the
 * player can retry rather than as a button that silently never appeared.
 */
async function resolveStatus(): Promise<NativeGoogleStatus> {
    if (!hasNativePlugin('SocialLogin')) {
        return isNativeShell() ? 'outdated' : 'absent';
    }
    if (!WEB_CLIENT_ID) {
        // A deployment misconfiguration rather than a player's problem: say so
        // where a developer will see it, and show them nothing.
        console.error('NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID is unset — Google sign-in is off in the app');
        return 'absent';
    }
    void configure().catch(() => {
        // Reported at the tap, where someone is actually waiting on it.
    });
    return 'ready';
}

export function useNativeGoogleSignIn(): NativeGoogleSignInState {
    const clerk = useClerk();
    const router = useRouter();
    const [status, setStatus] = useState<NativeGoogleStatus>('absent');
    const [error, setError] = useState<string | null>(null);

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
        setStatus('busy');
        setError(null);
        void (async () => {
            try {
                await configure();
                const { result } = await SocialLogin.login({ provider: 'google', options: {} });
                // `offline` mode returns a server auth code and no token; the
                // plugin is initialised in `online` mode above, so this is the
                // narrowing rather than a case that happens.
                const idToken = 'idToken' in result ? result.idToken : null;
                if (!idToken) {
                    throw new Error('Google signed in but returned no ID token');
                }
                const signInOrUp = await clerk.authenticateWithGoogleOneTap({ token: idToken });
                const fallback = returnPath();
                // Finishes whichever of the two Clerk started — an existing
                // account signs in, a new one is created — and navigates. The
                // custom navigate keeps that inside the Next router rather than
                // reloading the whole site in the WebView.
                await clerk.handleGoogleOneTapCallback(
                    signInOrUp,
                    { signInFallbackRedirectUrl: fallback, signUpFallbackRedirectUrl: fallback },
                    async (to) => router.push(to),
                );
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
            }
        })();
    }, [clerk, router]);

    return { status, error, signIn };
}
