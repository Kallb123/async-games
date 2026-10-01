'use client'

import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import { useToast } from './ToastContext';
import type { IAchievementUnlock } from '@/app/api/achievements/recent/route';
import { ACHIEVEMENT_FEED_EVENTS } from '@/utils/hooks/usePushEvents';
import { useIsAuthorised } from '@/utils/hooks/useAuthGuard';
import { useRefreshableData } from '@/utils/hooks/useRefreshableData';
import { readStoredValue, writeStoredValue } from '@/utils/hooks/useStoredValue';
import { celebrate, parseCelebrated, type OfferedUnlock } from '@/utils/ui/achievements';

/** Where this browser remembers what it has already celebrated. */
const CELEBRATED_KEY = 'ag-achievements-celebrated';

/**
 * The most toasts one batch puts up; the rest are counted in one more. A new
 * device after a busy week would otherwise stack a column of them over the board.
 */
const MAX_TOASTS = 3;

interface AchievementToasterValue {
    /** Hand the toaster unlocks this screen already knows about. It decides what's new. */
    offer: (unlocks: readonly OfferedUnlock[]) => void;
}

const AchievementToasterContext = createContext<AchievementToasterValue>({ offer: () => { } });

/** The toaster's `offer`, for a screen that already holds some unlocks (the board, the results page). */
export const useAchievementToaster = () => useContext(AchievementToasterContext);

/**
 * The one toaster for the whole app (docs/achievements.md §7.3): an unlock is
 * celebrated with the app's toast — "🏆 Achievement unlocked · ⛏️ Mine Baron" —
 * on whatever screen the player is on. Mounted once, in `Providers`, the way
 * `NotificationDeclinedPopup` is, rather than once per screen, so there is one
 * memory of what has been shown and no two screens disagree about it.
 *
 * One memory, three feeds. The toaster alone decides what's new; whichever
 * screen already knows about an unlock hands it over:
 *
 * - **Its own feed, for every screen**: `GET /api/achievements/recent`, on app
 *   load, on a return to the tab, and on the pushes that mean something may have
 *   just been unlocked (`ACHIEVEMENT_FEED_EVENTS`).
 * - **The board**, through `offer`, with each game response's `unlockedHere`.
 *   That is what makes it prompt in the game, including for the mover, whom no
 *   push reaches.
 * - **The results page**, through `offer`, with the viewer's own rows, so a
 *   just-finished game celebrates what its ending unlocked before any push lands.
 *
 * Each unlock is toasted once per browser and player while it is younger than
 * a week (`celebrate`), and a batch puts up at most `MAX_TOASTS`. What's been celebrated is kept through `useStoredValue`'s
 * store, read and written in the same call, so two feeds handing over the same
 * unlock at once still toast it once.
 *
 * A signed-out visitor gets nothing: the feed only fetches for a signed-in,
 * unlocked player, and nobody else has anything to offer.
 */
export default function AchievementToaster({ children }: { children: ReactNode }) {
    const { showToast } = useToast();
    // `showToast` is a new function on every render of the provider; `offer`
    // mustn't be, or every screen that offers would offer again each time.
    const showToastRef = useRef(showToast);
    useEffect(() => {
        showToastRef.current = showToast;
    });

    // Whose unlocks these are: a screen only ever offers the viewer's own.
    const { user } = useIsAuthorised();
    const viewerId = user?.id;

    const offer = useCallback((unlocks: readonly OfferedUnlock[]) => {
        if (!viewerId) return;
        const { fresh, celebrated } = celebrate(viewerId, unlocks, parseCelebrated(readStoredValue(CELEBRATED_KEY)), Date.now());
        if (fresh.length === 0) return;
        writeStoredValue(CELEBRATED_KEY, JSON.stringify(celebrated));
        for (const { achievement } of fresh.slice(0, MAX_TOASTS)) {
            showToastRef.current(`${achievement.icon} ${achievement.title}`, 'success', '🏆 Achievement unlocked');
        }
        if (fresh.length > MAX_TOASTS) {
            showToastRef.current(`And ${fresh.length - MAX_TOASTS} more — see them on your profile.`, 'success', '🏆 Achievements unlocked');
        }
    }, [viewerId]);

    // A secondary read: it rides along on every screen, and its first answer is
    // never what the screen was waiting to show.
    const { data } = useRefreshableData<{ unlocks: IAchievementUnlock[] }>(
        '/api/achievements/recent',
        ACHIEVEMENT_FEED_EVENTS,
        { secondary: true },
    );
    useEffect(() => {
        if (data?.unlocks) offer(data.unlocks);
    }, [data, offer]);

    const value = useMemo(() => ({ offer }), [offer]);
    return <AchievementToasterContext.Provider value={value}>{children}</AchievementToasterContext.Provider>;
}
