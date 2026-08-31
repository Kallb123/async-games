'use client'
import { useStoredValue } from '@/utils/hooks/useStoredValue';

/**
 * A banner the user can wave away for good, remembered per browser by
 * `useStoredValue`, which owns the storage access and its swallowed throw —
 * including making a dismissal stick for the session when the store refuses
 * to keep it.
 *
 * Shared by the offers in `BottomBanner` and by Outbreak's role welcome: each
 * passes its own key, and all of them get the same "dismissed stays dismissed"
 * behaviour without a second copy of the plumbing.
 */
export function useDismissibleBanner(storageKey: string) {
    const [stored, store] = useStoredValue(storageKey);

    return {
        dismissed: stored === '1',
        dismiss: () => store('1'),
    };
}
