'use client'
import { useStoredValue } from '@/utils/hooks/useStoredValue';

/**
 * A banner the user can wave away for good, remembered per browser.
 *
 * `useStoredValue` owns the storage access, including swallowing the throw:
 * the worst case of guessing wrong is the banner reappearing on the next
 * visit, which is not worth failing over. It also reads as "not dismissed"
 * until the first post-hydration render, so a caller must not show a banner
 * before a browser-only signal of its own has settled — `BottomBanner` waits
 * on the install and notification hooks, and `OutbreakRoleIntro` on the game's
 * own data.
 *
 * Shared by the offers in `BottomBanner` and by Outbreak's role welcome: each
 * passes its own key, and all of them get the same "dismissed stays dismissed"
 * behaviour.
 */
export function useDismissibleBanner(storageKey: string) {
    const [stored, store] = useStoredValue(storageKey);

    return {
        dismissed: stored === '1',
        dismiss: () => store('1'),
    };
}
