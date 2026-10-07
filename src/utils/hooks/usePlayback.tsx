'use client'
import React, { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { PlaybackClock } from '@/utils/ui/playbackClock';
import type { Point } from '@/utils/ui/isometric';

// One frame loop for everything a playback moves (docs/isometric-animations.md
// §4.1–§4.3): a board mounts a `PlaybackProvider` round what it draws, and
// whatever moves while an action plays asks it for the time with
// `usePlaybackFrame` — to set its own SVG attributes through a ref, a frame at
// a time, with no React render — or with `usePlaybackValue`, for something
// that changes now and then (a figure turning to its next step) and is worth
// one render when it does. One loop, one clock: a hold pauses all of it, and
// the board hears once that it has played.

/** What reads as the time outside a playback: the end of one, so whatever asks is drawn as it is once it's over. */
const NOT_PLAYING = Number.POSITIVE_INFINITY;

/**
 * A playback's frame loop: its clock, and whatever draws from it. Each frame it
 * reads the clock and hands the time to everything subscribed, until the clock
 * gets to its end, when it draws that once more and says so.
 */
class PlaybackLoop {
    private readonly clock: PlaybackClock;
    private readonly draws = new Set<(ms: number) => void>();
    private frame = 0;
    private told = false;

    constructor(end: number) {
        this.clock = new PlaybackClock(end);
    }

    ms(): number {
        return this.clock.ms;
    }

    subscribe(draw: (ms: number) => void): () => void {
        this.draws.add(draw);
        return () => this.draws.delete(draw);
    }

    /** Runs the clock from where it stands, and `ended` once it's over — once only, however often it is stopped and started. */
    start(ended: () => void): void {
        this.clock.resume();
        const tick = () => {
            const ms = this.clock.ms;
            this.draws.forEach(draw => draw(ms));
            if (!this.clock.ended) {
                this.frame = requestAnimationFrame(tick);
                return;
            }
            if (!this.told) {
                this.told = true;
                ended();
            }
        };
        this.frame = requestAnimationFrame(tick);
    }

    /** Stands it still where it is. */
    stop(): void {
        cancelAnimationFrame(this.frame);
        this.clock.pause();
    }
}

const PlaybackContext = createContext<PlaybackLoop | null>(null);

interface PlaybackProviderProps {
    /** Which playback it is: a new one starts a new clock from nothing; null for none. */
    playKey: string | null;
    /** How long it lasts, in milliseconds. */
    end: number;
    /** Waiting for the view to get there: the clock stands still until let go. */
    held: boolean;
    /** It has played to its end: told once a playback, with its key. */
    onEnd?: (key: string) => void;
    children: React.ReactNode;
}

/**
 * The clock and frame loop of whatever a board is playing, for everything
 * under it. Not keyed by the playback — that would remake the whole board for
 * each one — so a new `playKey` makes a new clock in place.
 */
export function PlaybackProvider({ playKey, end, held, onEnd, children }: PlaybackProviderProps) {
    const loop = useMemo(() => playKey === null ? null : new PlaybackLoop(end), [playKey, end]);
    const onEndRef = useRef(onEnd);
    useEffect(() => {
        onEndRef.current = onEnd;
    });
    useEffect(() => {
        if (!loop || playKey === null || held) return;
        loop.start(() => onEndRef.current?.(playKey));
        return () => loop.stop();
    }, [loop, playKey, held]);
    return <PlaybackContext.Provider value={loop}>{children}</PlaybackContext.Provider>;
}

/**
 * Calls `draw` with the playback's time every frame it runs, and once as it
 * mounts and on every render, so it is drawn right before the first paint and
 * while held. `draw` sets attributes on its own elements through refs
 * (`usePlaybackRef`, `setAttributes`). Outside a playback it is never called.
 */
export function usePlaybackFrame(draw: (ms: number) => void): void {
    const loop = useContext(PlaybackContext);
    const latest = useRef(draw);
    useLayoutEffect(() => {
        latest.current = draw;
        if (loop) draw(loop.ms());
    });
    useLayoutEffect(() => loop?.subscribe(ms => latest.current(ms)), [loop]);
}

/**
 * What `read` makes of the playback's time, rendered again only when that
 * changes — a number, a string, a flag, compared as they are — rather than every
 * frame. Outside a playback, what it makes of the end.
 */
export function usePlaybackValue<T>(read: (ms: number) => T): T {
    const loop = useContext(PlaybackContext);
    const [value, setValue] = useState(() => read(loop ? loop.ms() : NOT_PLAYING));
    usePlaybackFrame(ms => {
        const next = read(ms);
        setValue(current => Object.is(current, next) ? current : next);
    });
    return loop ? value : read(NOT_PLAYING);
}

/**
 * A ref to an element the playback moves, and the way it is drawn: `draw` is
 * called with the element and the playback's time as `usePlaybackFrame` does,
 * and not at all while the ref is null. It sets the element's attributes
 * (`setAttributes`) — and never ones React also renders as props, which a
 * render would put back — so an element is either drawn this way or given its
 * attributes as props, not both.
 */
export function usePlaybackRef<E extends Element>(draw: (element: E, ms: number) => void): React.RefObject<E | null> {
    const ref = useRef<E>(null);
    usePlaybackFrame(ms => {
        if (ref.current) draw(ref.current, ms);
    });
    return ref;
}

/** Sets the attributes of an element a frame draws, or takes one off for null; a number is written as its text. */
export function setAttributes(element: Element, attributes: Record<string, string | number | null>): void {
    for (const [name, value] of Object.entries(attributes)) {
        if (value === null) element.removeAttribute(name);
        else element.setAttribute(name, String(value));
    }
}

/** A `translate` by the point's `x` and `y` board units, or null for none: what a frame sets a moving group's `transform` to. */
export function translation({ x, y }: Point): string | null {
    return x === 0 && y === 0 ? null : `translate(${x} ${y})`;
}

/** A `scale` about the point (`x`, `y`) rather than about the origin, as a transform. */
export function scaleAbout(x: number, y: number, scale: number): string {
    return `translate(${x} ${y}) scale(${scale}) translate(${-x} ${-y})`;
}
