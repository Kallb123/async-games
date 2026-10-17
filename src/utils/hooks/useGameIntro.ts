'use client'
import { useCallback, useEffect } from 'react';
import { hasTutorial } from '@/utils/ui/gameTutorials';
import { fetchWithSessionRetry, REQUEST_TIMEOUT_MS } from './fetchWithSessionRetry';
import { useIsAuthorised, useSessionRefresh } from './useAuthGuard';
import { useResettingState } from './useResettingState';
import { readStoredValue, useStoredValue } from './useStoredValue';

/** What `useGameIntro` hands back — the shape `GameShell`'s `intro` prop
 *  takes, so it can drive the 📖/🎓 rows and whichever popup has the floor
 *  from the object the page already has, rather than fetching a second copy
 *  of it. */
export interface GameIntro {
    /** True while the game's tutorial should be showing — auto-shown once
     *  per account, or opened on demand from the game-options menu's "Take
     *  the tutorial" row. Always false for a game with no tutorial. */
    tutorialOpen: boolean;
    /** True while the game's guide should be showing. Never both at once —
     *  the tutorial wins, for a game that has one. */
    guideOpen: boolean;
    loaded: boolean;
    startTutorial: () => void;
    openGuide: () => void;
    /** Closes whichever of the two is open. */
    close: () => void;
}

type IntroKind = 'guide' | 'tutorial';
interface SeenLists {
    seen: string[];
    seenTutorials: string[];
}

async function saveProgress(game: string, kind: IntroKind): Promise<void> {
    try {
        const response = await fetch('/api/gameguides', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ game, kind }),
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
            // A player may leave the board immediately after dismissing the tour.
            keepalive: true,
        });
        if (!response.ok) throw new Error(`Saving ${kind} progress failed (${response.status})`);
    } catch (error) {
        // The browser's dismissal still holds. The next visit retries this
        // write if the account hasn't received it yet.
        console.error('Failed to save game intro progress', error);
    }
}

/**
 * Shows a game's tutorial (or its guide if it has no tutorial) once per
 * account. Dismissals are also remembered per account/game in this browser,
 * so a failed save or stale read cannot bring a completed tour back. A later
 * visit reconciles that dismissal with the account's progress.
 *
 * Neither welcome auto-opens until a successful read confirms it is unseen.
 * Failed reads settle `loaded` so role welcomes can proceed, and both entries
 * remain available from the game-options menu regardless of network health.
 */
export function useGameIntro(gameUrl: string): GameIntro {
    const { user, isAuthorised } = useIsAuthorised();
    // Identity is known before the session token is confirmed. Menu choices
    // belong to that account immediately; only network work waits for readiness.
    const userId = user?.id;
    const refreshSession = useSessionRefresh();
    const [mode, setMode] = useResettingState<IntroKind | 'closed' | null>(null, `${userId}:${gameUrl}`);
    // undefined = waiting; null = failed. Progress belongs only to this user.
    const [seen, setSeen] = useResettingState<SeenLists | null | undefined>(undefined, userId ?? '');
    const guideKey = `game-intro:guide:${userId}:${gameUrl}`;
    const tutorialKey = `game-intro:tutorial:${userId}:${gameUrl}`;
    const [storedGuide, storeGuide] = useStoredValue(guideKey);
    const [storedTutorial, storeTutorial] = useStoredValue(tutorialKey);

    useEffect(() => {
        if (!userId || !isAuthorised) return;
        let cancelled = false;
        async function load() {
            try {
                const response = await fetchWithSessionRetry('/api/gameguides', () => cancelled, refreshSession);
                if (!response?.ok) throw new Error('Failed to load game intro progress');
                const data = await response.json();
                if (!Array.isArray(data?.seen) || !Array.isArray(data?.seenTutorials)) {
                    throw new Error('Invalid game intro progress');
                }
                if (cancelled) return;
                setSeen(data);
                for (const entry of [
                    { kind: 'guide' as const, key: guideKey, list: data.seen, store: storeGuide },
                    { kind: 'tutorial' as const, key: tutorialKey, list: data.seenTutorials, store: storeTutorial },
                ]) {
                    if (cancelled) return;
                    if (entry.list.includes(gameUrl)) entry.store('1');
                    // Read at response time: a manual tour can be dismissed
                    // while this GET is still out. Never undo that dismissal.
                    else if (readStoredValue(entry.key) === '1') await saveProgress(gameUrl, entry.kind);
                }
            } catch (error) {
                if (!cancelled) {
                    console.error('Failed to load game intro progress', error);
                    setSeen(null);
                }
            }
        }
        void load();
        return () => { cancelled = true; };
    }, [userId, isAuthorised, gameUrl, refreshSession, guideKey, tutorialKey, storeGuide, storeTutorial, setSeen]);

    const loaded = !!userId && isAuthorised && seen !== undefined;
    const gameHasTutorial = hasTutorial(gameUrl);
    const autoShowTutorial = isAuthorised && !!seen && gameHasTutorial && !seen.seenTutorials.includes(gameUrl) && storedTutorial !== '1';
    const autoShowGuide = isAuthorised && !!seen && !gameHasTutorial && !seen.seen.includes(gameUrl) && storedGuide !== '1';
    const tutorialOpen = !!userId && gameHasTutorial && (mode === 'tutorial' || (mode === null && autoShowTutorial));
    const guideOpen = !!userId && !tutorialOpen && (mode === 'guide' || (mode === null && autoShowGuide));

    const startTutorial = useCallback(() => setMode('tutorial'), [setMode]);
    const openGuide = useCallback(() => setMode('guide'), [setMode]);
    const close = useCallback(() => {
        if (tutorialOpen) {
            storeTutorial('1');
            if (isAuthorised && !seen?.seenTutorials.includes(gameUrl)) void saveProgress(gameUrl, 'tutorial');
        } else if (guideOpen) {
            storeGuide('1');
            if (isAuthorised && !seen?.seen.includes(gameUrl)) void saveProgress(gameUrl, 'guide');
        }
        setMode('closed');
    }, [tutorialOpen, guideOpen, storeTutorial, storeGuide, seen, gameUrl, setMode, isAuthorised]);

    return { tutorialOpen, guideOpen, loaded, startTutorial, openGuide, close };
}
