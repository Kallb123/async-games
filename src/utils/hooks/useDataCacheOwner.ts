'use client'
import { useEffect } from "react";
import { setDataCacheOwner } from "./dataCache";
import { useIsAuthorised } from "./useAuthGuard";

/**
 * Keeps the tab's data cache (`dataCache.ts`) belonging to whoever is signed in
 * and allowed to use the app — and to no one the moment that stops being true.
 *
 * The cache holds viewer-specific bodies (a board with the viewer's hand), so
 * it is emptied whenever the signed-in player changes: signing out, another
 * account signing in on the same tab, and an account being locked all make
 * `isAuthorised` false or the id different, and `setDataCacheOwner` drops
 * everything held. Mount it once, in `Providers`, where every screen sits
 * beneath it; a screen reading the cache names its player on every call
 * regardless, so a body can't reach the wrong one even in the render before
 * this effect runs.
 */
export function useDataCacheOwner(): void {
    const { user, isAuthorised } = useIsAuthorised();
    const ownerId = isAuthorised ? user?.id ?? null : null;
    useEffect(() => {
        setDataCacheOwner(ownerId);
    }, [ownerId]);
}
