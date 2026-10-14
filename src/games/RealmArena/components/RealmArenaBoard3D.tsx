'use client'
import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { Color } from 'three';
import type RealmArenaBoard from '@/games/RealmArena/components/RealmArenaBoard';
import { TurnButtons, useBoardRotation } from '@/games/RealmArena/components/RealmArenaTurn';
import { Board3D, type FigureSpec, type Shading } from '@/games/RealmArena/three/board3d';
import { cssColour } from '@/games/RealmArena/three/cssColour';
import { loadSheets } from '@/games/RealmArena/three/terrain3d';
import { isWarband } from '@/games/RealmArena/rules';
import { endOf, facingOf } from '@/games/RealmArena/ui';
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
 * show: the props, where the view goes (`boardFocus`), the stored turn of the
 * view, the playback clock (`PlaybackProvider`) and the timings an action plays
 * by (ui.ts). What it draws is `Board3D`'s, imperatively, outside React's
 * renders.
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
        loadSheets().then(sheets => { if (live) board.setSheets(sheets); });
        return () => { live = false; };
    }, [board]);

    useEffect(() => board?.setField(field), [board, field]);

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

    const [rotation, turnBy] = useBoardRotation(viewerId);
    // The view glides round when the player turns it, and opens already turned.
    const turnedHere = useRef(false);
    const turn = (by: 1 | 3) => {
        turnedHere.current = true;
        turnBy(by);
    };
    useEffect(() => board?.setRotation(rotation, turnedHere.current), [board, rotation]);

    // Where the view goes, and what plays waiting for it to get there, as the isometric board decides them.
    const { area, held, onFocused, tracks } = useBoardFocus({ field, fighters, sides, selected, acting, sealed, placing, follow, home, refocus, playing: !!playback });
    useEffect(() => {
        if (area) board?.focus(area.area, area.key, area.exact);
    });
    const onTapSquare = placing?.onTap ?? aiming?.onSquare;
    useEffect(() => board?.listen({ onFocused, onFigure: onSelect, onSquare: square => onTapSquare?.(square) }), [board, onFocused, onSelect, onTapSquare]);
    useEffect(() => board?.play(playback ? { cues: playback.cues, before: playback.before } : null, tracks), [board, playback, tracks]);

    return (
        <div ref={frame} className="ag-board-frame ag-realmarena-frame">
            <PlaybackProvider playKey={playback?.key ?? null} end={playback ? endOf(playback.cues) : 0} held={held} onEnd={onPlayed}>
                <div ref={host} className="ag-ra-3d" role="img" aria-label={`The ${field.name}`} />
                <PlaybackFrames board={board} />
            </PlaybackProvider>
            <TurnButtons onTurn={turn} />
            {playback ? null : overlay}
        </div>
    );
}
