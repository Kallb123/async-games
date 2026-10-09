'use client'
import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { useAuth, useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { withTimeout } from "@/utils/withTimeout";

type ClerkUser = NonNullable<ReturnType<typeof useUser>["user"]>;

/**
 * Whether an account may use the app: unlocked, or a guest
 * (`publicMetadata.guest === true`, docs/account-less-play.md §5/§12), who is
 * let in the moment they exist — the unlock gate is for the real account that
 * vouches for them, not for the guest.
 */
function isUnlocked(user: ClerkUser): boolean {
    return user.publicMetadata.unlocked === true || user.publicMetadata.guest === true;
}

// Whether this page load has confirmed that the session cookie the API reads is
// current. Clerk's middleware only runs on the API (src/middleware.ts), so a
// page load no longer gets its expired session token renewed before the page
// arrives: Clerk's script renews it once it starts. Until then the cookie can
// still be the one that expired while the app sat idle, and a request sent in
// that window — a GET, or a POST from a button tapped the moment it appears —
// is answered as signed out. So the first signed-in render asks Clerk for the
// token once (`getToken()` hands back the cached one if it is still good, and
// renews it and writes the cookie if not) and nothing counts as authorised until
// that has answered. Page-wide rather than per component: one ask per page load.
let sessionConfirmed = false;
let confirming = false;
const sessionListeners = new Set<() => void>();

function confirmSession(getToken: () => Promise<unknown>) {
    if (sessionConfirmed || confirming) return;
    confirming = true;
    // Bounded like every other renewal: a Clerk that never answers holds the
    // app back for SESSION_REFRESH_TIMEOUT_MS, then the 401 retries take over.
    void withTimeout(getToken, SESSION_REFRESH_TIMEOUT_MS, null, 'Confirming the session token').then(() => {
        sessionConfirmed = true;
        sessionListeners.forEach(listener => listener());
    });
}

function subscribeToSession(listener: () => void) {
    sessionListeners.add(listener);
    return () => { sessionListeners.delete(listener); };
}

/**
 * Whether the viewer is signed in *and* unlocked, with a session token the API
 * will accept — the "safe to fetch" signal, with no side effects of its own.
 * Use this in components that only need to know; the screen they sit on owns
 * the redirect via `useAuthGuard`.
 */
export function useIsAuthorised() {
    const { user, isLoaded } = useUser();
    const { getToken } = useAuth();
    const signedIn = isLoaded && !!user;
    const confirmed = useSyncExternalStore(subscribeToSession, () => sessionConfirmed, () => false);
    useEffect(() => {
        if (signedIn) confirmSession(getToken);
    }, [signedIn, getToken]);
    return {
        user,
        isLoaded,
        isAuthorised: signedIn && confirmed && isUnlocked(user),
    };
}

/**
 * How long the renewal gets before the retry goes ahead without it. Short,
 * deliberately: this sits in front of a request that is itself being retried on
 * a deadline, and a Clerk that accepts the connection and then never answers
 * would otherwise hang the whole ladder — the `await` never settles, the fetch
 * hook's `finally` never runs, and the screen waits for ever on a repair that
 * is never coming. Every `fetch` in `fetchWithSessionRetry` is bounded for that
 * exact reason; `withTimeout` is how everything that isn't a `fetch` gets the
 * same treatment.
 */
const SESSION_REFRESH_TIMEOUT_MS = 5000;

/**
 * Asks Clerk for a fresh session token, so that the cookie the API reads is the
 * current one. Hand it to `fetchWithSessionRetry`, which calls it before
 * retrying a 401.
 *
 * A tab that has been sitting idle — backgrounded on a phone, open behind
 * something else all afternoon — comes back with a session token that expired
 * while nothing was running to renew it, and every request 401s until something
 * asks for a new one. `getToken({ skipCache: true })` is that ask; Clerk writes
 * the renewed cookie itself.
 *
 * The returned function is stable for the life of the component, because Clerk
 * rebuilds `getToken` as the session changes and `useRefreshableData` re-runs
 * its fetch whenever the identity of what it fetches with changes — a fresh
 * function per render there would be a fetch per render.
 */
export function useSessionRefresh(): () => Promise<void> {
    const { getToken } = useAuth();
    // Kept current after each render rather than during it: writing a ref while
    // rendering is a side effect (react-hooks/refs), and this is only ever read
    // from inside a request that is already in flight.
    const getTokenRef = useRef(getToken);
    useEffect(() => {
        getTokenRef.current = getToken;
    });

    // Clerk unreachable, a session it won't renew, a call that never answers:
    // `withTimeout` turns all three into "no new token", and the caller retries
    // regardless — this is the part of the attempt that can be skipped.
    return useCallback(async () => {
        await withTimeout(
            () => getTokenRef.current({ skipCache: true }),
            SESSION_REFRESH_TIMEOUT_MS,
            null,
            'Renewing the session token',
        );
    }, []);
}

/**
 * `useIsAuthorised` plus the redirect: wait for Clerk to load, then send
 * anonymous visitors to `/login` — carrying the screen they were after, so
 * signing in returns them to it — and locked-out accounts to `/unlockaccess`.
 *
 * One per screen — every authenticated page mounts exactly one of these, and
 * the components on it use `useIsAuthorised` so a screen fires one redirect
 * effect rather than one per list.
 *
 * `allowSignedOut` drops only the `/login` redirect, for a screen that has
 * something to show a visitor with no account: the home page, which renders
 * the public landing page instead of bouncing them, and /join, whose guest
 * variant (docs/account-less-play.md §14) is that visitor's whole way in.
 * Locked-out accounts still go to `/unlockaccess`.
 */
export function useAuthGuard({ allowSignedOut = false }: { allowSignedOut?: boolean } = {}) {
    const state = useIsAuthorised();
    const { user, isLoaded } = state;
    const router = useRouter();
    const reportedAuth = useRef(false);

    useEffect(() => {
        if (isLoaded && !reportedAuth.current) {
            reportedAuth.current = true;
            window.__agPerformanceMark?.('auth_ready');
        }
    }, [isLoaded]);

    useEffect(() => {
        if (!isLoaded) {
            return;
        }
        if (!user) {
            if (!allowSignedOut) {
                // Carry where they were through Clerk, so someone who followed
                // a join link comes back to it — code still in the box — rather
                // than to an empty home page having done everything right.
                // `<SignIn>` already honours `redirect_url` from the query.
                // The one thing on /login that isn't Clerk's — the native
                // shell's Google button — reads it back through `returnPath`
                // (`utils/ui/returnPath.ts`), which also bounds it to a path
                // on this site before following it.
                //
                // Read from `window.location` rather than `useSearchParams()`:
                // every authenticated screen mounts this guard, and pulling
                // that hook in here would make each of them a Suspense-boundary
                // question at build time for no gain.
                const returnTo = `${window.location.pathname}${window.location.search}`;
                router.push(`/login?redirect_url=${encodeURIComponent(returnTo)}`);
            }
            return;
        }
        // The account, not the session: `isAuthorised` is also false for the
        // moment the session token is being confirmed, which is no reason to
        // send anyone anywhere.
        if (!isUnlocked(user)) {
            router.push('/unlockaccess');
        }
    }, [isLoaded, user, router, allowSignedOut]);

    return state;
}
