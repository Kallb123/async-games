'use client'
import { useCallback, useEffect, useState } from 'react';
import { hasTutorial } from '@/utils/ui/gameTutorials';

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

/**
 * Drives a game's two "first visit" welcomes — its guide and, if it has one,
 * its interactive tutorial (see docs/game-tutorials.md §7) — from one fetch
 * of which games' guides and tutorials this account has already been
 * auto-shown.
 *
 * A game with a tutorial never auto-shows its guide: the tutorial is the
 * better welcome, so it takes the auto-show slot and the guide keeps only
 * its on-demand row. A game with no tutorial keeps today's behaviour
 * exactly — its guide auto-shows on the account's first match of it. Because
 * the two "seen" lists are separate, a player who already saw the guide
 * still gets the tutorial once when it ships: the tutorial is new and
 * better, and one tour is a fair thing to spend an existing player's
 * attention on.
 *
 * `open` is computed on every render rather than set from an effect — both
 * seen lists stay `null` until the fetch resolves, so neither popup flashes
 * open and then closed before we've heard back, and there is no
 * "call setState from an effect" cascade to worry about.
 *
 * `loaded` (`seenLists !== null`) is exposed so a screen with its own
 * first-visit popup — Outbreak's role welcome — can wait for it before
 * deciding whether to show *itself*, rather than flashing open and being
 * yanked shut a moment later when this intro's auto-show turns out to be
 * pending. You need to know the game (and, now, its tour) before your role
 * in it, so the game intro always goes first: hold the role welcome back for
 * as long as `!loaded || tutorialOpen || guideOpen` says this one either
 * hasn't answered yet or has the floor.
 *
 * Dismissing either popup only marks its list seen the first time —
 * reopening one from the menu afterwards is just a look, not a fresh "first
 * visit" to record. (`markSeen` below already no-ops once a game is in its
 * list, so a manual open-then-close never needs its own bookkeeping.)
 */
export function useGameIntro(gameUrl: string): GameIntro {
    const [manualGuideOpen, setManualGuideOpen] = useState(false);
    const [manualTutorialOpen, setManualTutorialOpen] = useState(false);
    const [guideAutoDismissed, setGuideAutoDismissed] = useState(false);
    const [tutorialAutoDismissed, setTutorialAutoDismissed] = useState(false);
    const [seen, setSeen] = useState<string[] | null>(null);
    const [seenTutorials, setSeenTutorials] = useState<string[] | null>(null);

    useEffect(() => {
        let cancelled = false;
        fetch('/api/gameguides')
            .then(response => response.json())
            .then(data => {
                if (cancelled) return;
                // Default a missing/malformed field to [] rather than leaving
                // it at null: `loaded` waits on *both* fields, so a response
                // missing just one of them (a stale cache during a rolling
                // deploy, say) would otherwise block `loaded` — and the
                // popups it gates — forever, with nothing to retry it.
                setSeen(Array.isArray(data?.seen) ? data.seen : []);
                setSeenTutorials(Array.isArray(data?.seenTutorials) ? data.seenTutorials : []);
            })
            .catch(error => console.error('Failed to load game guide progress', error));
        return () => { cancelled = true; };
    }, []);

    const loaded = seen !== null && seenTutorials !== null;
    const alreadySeenGuide = seen?.includes(gameUrl) ?? true;
    const alreadySeenTutorial = seenTutorials?.includes(gameUrl) ?? true;

    // It asks the registry itself rather than taking a flag, so a page can't
    // disagree with it — see docs/game-tutorials.md §7.
    const gameHasTutorial = hasTutorial(gameUrl);

    const autoShowTutorial = loaded && gameHasTutorial && !alreadySeenTutorial && !tutorialAutoDismissed;
    const autoShowGuide = loaded && !gameHasTutorial && !alreadySeenGuide && !guideAutoDismissed;

    const tutorialOpen = manualTutorialOpen || autoShowTutorial;
    // Never both: the tutorial wins over a guide that would otherwise also
    // want the floor (a game can offer both, opened on demand, but not both
    // auto-shown at once).
    const guideOpen = !tutorialOpen && (manualGuideOpen || autoShowGuide);

    const markGuideSeen = useCallback(() => {
        if (alreadySeenGuide) return;
        setSeen(prev => (prev ?? []).includes(gameUrl) ? prev : [...(prev ?? []), gameUrl]);
        fetch('/api/gameguides', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ game: gameUrl, kind: 'guide' }),
        }).catch(error => console.error('Failed to save game guide progress', error));
    }, [alreadySeenGuide, gameUrl]);

    const markTutorialSeen = useCallback(() => {
        if (alreadySeenTutorial) return;
        setSeenTutorials(prev => (prev ?? []).includes(gameUrl) ? prev : [...(prev ?? []), gameUrl]);
        fetch('/api/gameguides', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ game: gameUrl, kind: 'tutorial' }),
        }).catch(error => console.error('Failed to save game tutorial progress', error));
    }, [alreadySeenTutorial, gameUrl]);

    const startTutorial = useCallback(() => setManualTutorialOpen(true), []);
    const openGuide = useCallback(() => setManualGuideOpen(true), []);
    const close = useCallback(() => {
        if (tutorialOpen) {
            setManualTutorialOpen(false);
            setTutorialAutoDismissed(true);
            markTutorialSeen();
        } else if (guideOpen) {
            setManualGuideOpen(false);
            setGuideAutoDismissed(true);
            markGuideSeen();
        }
    }, [tutorialOpen, guideOpen, markTutorialSeen, markGuideSeen]);

    return { tutorialOpen, guideOpen, loaded, startTutorial, openGuide, close };
}
