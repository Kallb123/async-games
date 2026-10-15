'use client'
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Color } from 'three';
import BoardZoom, { useBoardCentre, type BoardZoomFocus, type BoardZoomPivot } from '@/components/ui/BoardZoom';
import { useBoardView, type BoardView } from '@/components/ui/boardView';
import type RealmArenaBoard from '@/games/RealmArena/components/RealmArenaBoard';
import { TurnButtons, useBoardRotation } from '@/games/RealmArena/components/RealmArenaTurn';
import { Board3D, type FigureSpec, type Shading } from '@/games/RealmArena/three/board3d';
import { cssColour } from '@/games/RealmArena/three/cssColour';
import { azimuthOf, boardFrame, cameraBasis, frameRect, regionOnScreen, topOf, turnedPoint, type BoardLayout } from '@/games/RealmArena/three/iso3d';
import { loadSheets } from '@/games/RealmArena/three/terrain3d';
import { loadCharacterModels } from '@/games/RealmArena/three/characterModels';
import { isWarband } from '@/games/RealmArena/rules';
import { BOARD_ZOOM, endOf, facingOf } from '@/games/RealmArena/ui';
import { useBoardFocus } from '@/games/RealmArena/useBoardFocus';
import { PlaybackProvider, usePlaybackFrame } from '@/utils/hooks/usePlayback';

/** The same props as the isometric board: either draws the same battle, and a screen picks one. */
type RealmArenaBoard3DProps = React.ComponentProps<typeof RealmArenaBoard>;

/** Hands the board the playback's time, a frame at a time, inside the `PlaybackProvider` it reads. */
function PlaybackFrames({ board }: { board: Board3D | null }) {
    usePlaybackFrame(ms => board?.frame(ms));
    return null;
}

/**
 * The camera's hold on the board, from inside `BoardZoom`: it turns the camera
 * with the view, tells it where `BoardZoom` has put the view (`useBoardView`)
 * and gives it the way to follow a walker (`useBoardCentre`). It draws nothing.
 * A child of `BoardZoom`, so that its layout effects run before `BoardZoom`'s
 * own: the camera is turned before the `pivot` that lands with the turn tells
 * it where the view is after. The frame is laid out (`layout`, which the page
 * works out once, for `BoardZoom`'s viewBox too) after the turn, in the same
 * pass, so a turn notes the ground it was showing in the frame it is leaving.
 */
function BoardCamera({ board, rotation, glide, layout }: { board: Board3D | null; rotation: number; glide: boolean; layout: BoardLayout }) {
    const centre = useBoardCentre();
    const onView = useCallback((view: BoardView) => board?.setView(view), [board]);
    useLayoutEffect(() => board?.setRotation(rotation, glide), [board, rotation, glide]);
    useLayoutEffect(() => board?.setFrame(layout), [board, layout]);
    useLayoutEffect(() => board?.follow(centre), [board, centre]);
    useBoardView(onView);
    return null;
}

/**
 * The battlefield in 3D (docs/realm-arena-3d.md): an experiment, measured on
 * the rendering bench (`npm run ra-bench -- --renderers svg,three`) beside the
 * isometric board it would replace, and not yet on any screen a player sees.
 *
 * The same battle, drawn as geometry rather than sprites — the ground from the
 * tile art, the raised squares as solids, and every character as its own
 * model (art-masters/realmarena/characters) — under an orthographic camera at
 * the isometric board's angle that turns a quarter at a time, so it reads as
 * the board it replaces. A wall hides whoever is behind it by being in the
 * way, with no depth order to keep.
 *
 * What it shares with the isometric board is everything that decides what to
 * show and how it moves: the props, where the view goes (`boardFocus`), the
 * stored turn of the view, the playback clock (`PlaybackProvider`), the timings
 * an action plays by (ui.ts) — and `BoardZoom`, in its camera mode, which is
 * the camera. Its zoom steps and pill, its pinch and ctrl-wheel under the
 * fingers, its native scrolling and momentum, its focus glides and holds
 * (`onFocused`), its pivot on a quarter turn and its follow of a long walk are
 * the isometric board's, in the units of the board's frame (`boardFrame`: the
 * battlefield as the camera sees it, the same size at every turn). `Board3D`
 * hears only what part of that frame is in the pane (`useBoardView`) and sets
 * its camera to show it; the one press it takes for itself is a tap. What it
 * draws is `Board3D`'s, imperatively, outside React's renders.
 *
 * Not yet drawn: the muster's sealed squad and placing it, a lined-up action's
 * path, odds, cover and HP preview, the effect marks, AP pips and items, the
 * hit text, slashes and the caption, smoke, the centre's name, and the faint
 * figure a wall hides.
 */
export default function RealmArenaBoard3D({ field, fighters, fogGhosts = [], unseen, sides, sealed, owners, waveDue = false, showCentre = true, viewerId, colourFor, selected, onSelect, placing, aiming, acting, refocus = 0, follow, home, overlay, playback, onPlayed }: RealmArenaBoard3DProps) {
    const [board, setBoard] = useState<Board3D | null>(null);
    // Made when its box mounts and gone with it.
    const host = useCallback((element: HTMLDivElement | null) => {
        if (!element) return;
        const made = new Board3D(element);
        setBoard(made);
        return () => {
            made.dispose();
            setBoard(null);
        };
    }, []);
    const frame = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!board) return;
        let live = true;
        Promise.all([loadSheets(), loadCharacterModels()]).then(([sheets, models]) => { if (live) board.setArt({ sheets, models }); });
        return () => { live = false; };
    }, [board]);

    // The battlefield's tallest top: the camera's frame is laid out round it (below), and a tap on a tall square finds its way down from it.
    const top = useMemo(() => topOf(field), [field]);
    useEffect(() => board?.setField(field, top), [board, field, top]);

    // Each squad's characters wear its owner's colour; anyone else keeps the art's grey.
    const tintOf = useCallback((owner: string): Color | null => {
        const scope = frame.current;
        return scope && owners.includes(owner) ? cssColour(scope, colourFor(owner)) : null;
    }, [owners, colourFor]);
    useEffect(() => {
        if (!board) return;
        const figures: FigureSpec[] = fighters.map(fighter => ({ fighter, facing: facingOf(field, fighter), tint: tintOf(fighter.owner) }));
        board.setFigures(figures, fogGhosts.map(ghost => ({ ghost, facing: facingOf(field, ghost), tint: tintOf(ghost.owner) })));
    }, [board, field, fighters, fogGhosts, tintOf]);
    useEffect(() => {
        if (frame.current) board?.setSelected(selected?.id ?? null, cssColour(frame.current, 'var(--ag-on-dark)'));
    }, [board, selected]);

    // What's shaded on the ground, strongest first: a reach, a range, the fog, the zones, the centre.
    useEffect(() => {
        const scope = frame.current;
        if (!board || !scope) return;
        const token = (name: string) => cssColour(scope, `var(${name})`);
        const zone = new Map<number, Shading>();
        const wave = new Set<number>();
        field.deployments.forEach((squares, seat) => {
            const owner = owners[seat];
            const colour = owner ? cssColour(scope, colourFor(owner)) : token('--ag-ink-softer');
            for (const square of squares) zone.set(square, { colour, alpha: 0.16 });
            if (waveDue && owner !== undefined && isWarband(owner)) squares.forEach(square => wave.add(square));
        });
        const centre = new Set(showCentre ? field.objectives.centre ?? [] : []);
        const reach = aiming?.reach, range = aiming?.range;
        const [reachColour, rangeColour, fogColour, centreColour] = [token('--ra-reach'), token('--ra-range'), token('--ag-ink'), token('--ra-centre')];
        board.setShading(square => {
            const ap = reach?.get(square);
            if (ap !== undefined) return { colour: reachColour, alpha: 0.18 + 0.12 * (ap - 1) };
            if (range?.has(square)) return { colour: rangeColour, alpha: 0.3 };
            if (unseen?.has(square)) return { colour: fogColour, alpha: 0.4 };
            return zone.get(square) ?? (centre.has(square) ? { colour: centreColour, alpha: 0.18 } : null);
        }, wave.size > 0 ? wave : null);
    }, [board, field, owners, colourFor, waveDue, showCentre, aiming, unseen]);

    // The view glides round when the player turns it, and opens already turned.
    const [rotation, turn, turned] = useBoardRotation(viewerId);

    // The battlefield as the camera sees it, laid out as the isometric board's SVG is
    // (`boardFrame`): `BoardZoom`'s viewBox, the same size at every turn. Worked out
    // here once, and handed to the camera (`BoardCamera`) as well.
    const here = useMemo<BoardLayout>(() => {
        const basis = cameraBasis(azimuthOf(rotation));
        return { basis, frame: boardFrame(basis, field, top) };
    }, [field, top, rotation]);
    // Only the turn's own pivot needs the view it turned from, and only once.
    const pivot: BoardZoomPivot | null = turned.turns === 0 ? null : {
        key: String(turned.turns),
        at: point => {
            const basis = cameraBasis(azimuthOf(turned.from));
            return turnedPoint({ basis, frame: boardFrame(basis, field, top) }, here, point);
        },
    };

    // Where the view goes, and what plays waiting for it to get there, as the isometric board decides them.
    const { area, held, onFocused, tracks } = useBoardFocus({ field, fighters, sides, selected, acting, sealed, placing, follow, home, refocus, playing: !!playback });
    const focus: BoardZoomFocus | null = area && { rect: frameRect(here.frame, regionOnScreen(here.basis, area.area, top)), key: area.key, exact: area.exact };
    const onTapSquare = placing?.onTap ?? aiming?.onSquare;
    useEffect(() => board?.listen({ onFigure: onSelect, onSquare: square => onTapSquare?.(square) }), [board, onSelect, onTapSquare]);
    useEffect(() => board?.play(playback ? { cues: playback.cues, before: playback.before } : null, tracks), [board, playback, tracks]);

    return (
        <div ref={frame} className="ag-board-frame ag-realmarena-frame">
            <PlaybackProvider playKey={playback?.key ?? null} end={playback ? endOf(playback.cues) : 0} held={held} onEnd={onPlayed}>
                <BoardZoom camera zoomWidth={BOARD_ZOOM.zoomWidth} maxWidth={BOARD_ZOOM.maxWidth} viewBox={here.frame.size} focus={focus} onFocused={onFocused} pivot={pivot}>
                    <div ref={host} className="ag-ra-3d" role="img" aria-label={`The ${field.name}`} />
                    <BoardCamera board={board} rotation={rotation} glide={turned.turns > 0} layout={here} />
                </BoardZoom>
                <PlaybackFrames board={board} />
            </PlaybackProvider>
            <TurnButtons onTurn={turn} />
            {playback ? null : overlay}
        </div>
    );
}
