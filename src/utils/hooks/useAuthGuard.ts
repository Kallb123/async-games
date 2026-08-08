'use client'
import { useEffect } from "react";
import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";

/**
 * Whether the viewer is signed in *and* unlocked — the "safe to fetch" signal,
 * with no side effects of its own. Use this in components that only need to
 * know; the screen they sit on owns the redirect via `useAuthGuard`.
 */
export function useIsAuthorised() {
    const { user, isLoaded } = useUser();
    return {
        user,
        isLoaded,
        isAuthorised: isLoaded && !!user && user.publicMetadata.unlocked === true,
    };
}

/**
 * `useIsAuthorised` plus the redirect: wait for Clerk to load, then send
 * anonymous visitors to `/login` and locked-out accounts to `/unlockaccess`.
 *
 * One per screen — every authenticated page mounts exactly one of these, and
 * the components on it use `useIsAuthorised` so a screen fires one redirect
 * effect rather than one per list.
 *
 * `allowSignedOut` drops only the `/login` redirect, for the one screen that
 * has something to show a visitor with no account — the home page, which
 * renders the public landing page instead of bouncing them. Locked-out
 * accounts still go to `/unlockaccess`.
 */
export function useAuthGuard({ allowSignedOut = false }: { allowSignedOut?: boolean } = {}) {
    const state = useIsAuthorised();
    const { user, isLoaded } = state;
    const router = useRouter();

    useEffect(() => {
        if (!isLoaded) {
            return;
        }
        if (!user) {
            if (!allowSignedOut) {
                router.push('/login');
            }
            return;
        }
        if (user.publicMetadata.unlocked !== true) {
            router.push('/unlockaccess');
        }
    }, [isLoaded, user, router, allowSignedOut]);

    return state;
}
