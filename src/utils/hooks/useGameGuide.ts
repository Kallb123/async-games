'use client'
import { useCallback, useEffect, useState } from 'react';

/**
 * Drives a game's guide popup: fetches which games' guides this account has
 * already been auto-shown (once, on mount), derives whether it should be open
 * automatically for a game not yet in that list, and exposes `openGuide` for
 * the game-options menu's on-demand "Game guide" row.
 *
 * `open` is computed on every render rather than set from an effect — `seen`
 * stays `null` until the fetch resolves, so a game we haven't heard back
 * about yet never flashes the guide open and then closed, and there is no
 * "call setState from an effect" cascade to worry about.
 *
 * `loaded` (`seen !== null`) is exposed so a screen with its own first-visit
 * popup — Outbreak's role welcome — can wait for it before deciding whether
 * to show *itself*, rather than flashing open and being yanked shut a moment
 * later when this guide's auto-show turns out to be pending. You need to know
 * the game before your role in it, so the game guide always goes first: hold
 * the role welcome back for as long as `!loaded || open` says this one either
 * hasn't answered yet or has the floor.
 *
 * Dismissing only marks the guide seen the first time — reopening it from the
 * menu afterwards is just a look, not a fresh "first visit" to record.
 */
export function useGameGuide(gameUrl: string) {
    const [manualOpen, setManualOpen] = useState(false);
    const [autoShowDismissed, setAutoShowDismissed] = useState(false);
    const [seen, setSeen] = useState<string[] | null>(null);

    useEffect(() => {
        let cancelled = false;
        fetch('/api/gameguides')
            .then(response => response.json())
            .then(data => {
                if (!cancelled && data && Array.isArray(data.seen)) {
                    setSeen(data.seen);
                }
            })
            .catch(error => console.error('Failed to load game guide progress', error));
        return () => { cancelled = true; };
    }, []);

    const loaded = seen !== null;
    const alreadySeen = seen?.includes(gameUrl) ?? true;
    const autoShow = loaded && !alreadySeen && !autoShowDismissed;
    const open = manualOpen || autoShow;

    const markSeen = useCallback(() => {
        if (alreadySeen) return;
        setSeen(prev => (prev ?? []).includes(gameUrl) ? prev : [...(prev ?? []), gameUrl]);
        fetch('/api/gameguides', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ game: gameUrl }),
        }).catch(error => console.error('Failed to save game guide progress', error));
    }, [alreadySeen, gameUrl]);

    const openGuide = useCallback(() => setManualOpen(true), []);
    const closeGuide = useCallback(() => {
        setManualOpen(false);
        setAutoShowDismissed(true);
        markSeen();
    }, [markSeen]);

    return { open, loaded, openGuide, closeGuide };
}
