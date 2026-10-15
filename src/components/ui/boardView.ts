'use client'
import { createContext, useContext, useLayoutEffect } from 'react';
import { drawnView, viewRegion } from '@/utils/ui/boardZoom';
import type { Rect } from '@/utils/ui/mapLabels';

/**
 * The part of the board in the pane right now, in the child's own `viewBox`
 * units (`viewRegion`): the view a camera draws (`BoardZoom`'s camera mode).
 */
export type BoardView = Rect;

type BoardViewListener = (view: BoardView) => void;

/** How far the view may move, in pixels, and not be told: well under what a canvas can show. */
const UNSEEN_PX = 0.05;

/**
 * Camera mode's view of the board, and who is told of it. A camera board
 * isn't transformed as it's pinched or glided, so the view is worked out from
 * where it's drawn — the pane's scroll and the board's laid-out size, or the
 * offset and scale a pinch, a glide or a follow is drawing between frames
 * (`drawn`, set by `draw`) — and told to the listener when it changes. No state
 * and no render: the listener is a function a board draws from. There is one
 * camera to a pane, so one listener.
 */
export class ViewFeed {
    private listener: BoardViewListener | null = null;
    private last: BoardView | null = null;
    /** What is being drawn between frames, while a gesture, a glide or a follow is. */
    private drawn: { offset: { x: number; y: number }; scale: number } | null = null;
    private bound: { pane: HTMLDivElement; content: HTMLDivElement; viewBox: { width: number; height: number } } | null = null;

    /** Where it reads the view from, set once there is a pane, and whenever the board's size changes. */
    bind(pane: HTMLDivElement, content: HTMLDivElement, viewBox: { width: number; height: number } | undefined) {
        this.bound = viewBox ? { pane, content, viewBox } : null;
    }

    /** Told the view at once if there is one, and on every change after. */
    subscribe = (listener: BoardViewListener): (() => void) => {
        this.listener = listener;
        if (this.last) listener(this.last);
        return () => { if (this.listener === listener) this.listener = null; };
    };

    /**
     * The board drawn `offset` into the pane at `scale` times its laid-out size
     * (as a transform would draw it): from here the pane's scroll is no longer
     * what to read, until `drop`.
     */
    draw(offset: { x: number; y: number }, scale: number) {
        this.drawn = { offset, scale };
        this.sync();
    }

    /** The view is the pane's again; whoever released it says where it landed (`sync`). */
    drop() {
        this.drawn = null;
    }

    /** The pane scrolled or was resized: told, unless a gesture, a glide or a follow has the view, in which case the pane is not where the board is drawn, and its next frame is told. */
    moved() {
        if (!this.drawn) this.sync();
    }

    /** Works the view out afresh and tells whoever it has changed for. */
    sync() {
        const bound = this.bound;
        if (!bound) return;
        const { pane, content, viewBox } = bound;
        const paneSize = { x: pane.clientWidth, y: pane.clientHeight };
        if (paneSize.x === 0 || paneSize.y === 0) return;
        // The board's size as laid out, to the fraction of a pixel: a camera places by the sub-pixel.
        const box = content.getBoundingClientRect();
        const laid = { x: box.width, y: box.height };
        const shown = this.drawn ? drawnView(laid, this.drawn.offset, this.drawn.scale) : { scroll: { x: pane.scrollLeft, y: pane.scrollTop }, content: laid };
        const view = viewRegion(shown, paneSize, viewBox);
        // A change too small to see isn't one: the glide's first frame is where the pane was, to the rounding of its size. Held against what was last told, so a slow drift still adds up.
        const last = this.last;
        const pixel = view.width / paneSize.x;
        if (last && [view.x - last.x, view.y - last.y, view.width - last.width, view.height - last.height].every(change => Math.abs(change) < pixel * UNSEEN_PX)) return;
        this.last = view;
        this.listener?.(view);
    }
}

export const BoardViewContext = createContext<ViewFeed | null>(null);

/**
 * What a camera-mode board draws from: calls `listener` with the part of the
 * board in the pane (`BoardView`, in viewBox units) as it is when this
 * subscribes and every time it changes — the pane scrolled, the pill or a
 * pinch zooming, a focus gliding, a follow keeping a point in the middle. It
 * is the view the player's gestures and the board's own focus arrive as, each
 * frame: nothing here renders, so `listener` draws from a ref and a canvas, as
 * `usePlaybackFrame`'s does. Pass one that is stable; a new one is told the
 * current view again, which is how a camera made after the pane learns where it
 * is. Called in the child's layout effect, so it hears of a `pivot` that lands
 * in the same commit. Nothing outside camera mode.
 */
export function useBoardView(listener: BoardViewListener): void {
    const feed = useContext(BoardViewContext);
    useLayoutEffect(() => feed?.subscribe(listener), [feed, listener]);
}
