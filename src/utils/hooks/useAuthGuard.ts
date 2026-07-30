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
 * One per screen. Several screens still inline this same three-check block —
 * they should move over to this hook rather than keeping their own copy.
 */
export function useAuthGuard() {
    const state = useIsAuthorised();
    const { user, isLoaded } = state;
    const router = useRouter();

    useEffect(() => {
        if (!isLoaded) {
            return;
        }
        if (!user) {
            router.push('/login');
            return;
        }
        if (user.publicMetadata.unlocked !== true) {
            router.push('/unlockaccess');
        }
    }, [isLoaded, user, router]);

    return state;
}
