'use client'
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Color } from 'three';
import BoardZoom, { useBoardCentre, type BoardZoomFocus, type BoardZoomPivot } from '@/components/ui/BoardZoom';
import { useBoardView, type BoardView } from '@/components/ui/boardView';
import type RealmArenaBoard from '@/games/RealmArena/components/RealmArenaBoard';
import { CAPTION_INSET, PlaybackCaption, UnplacedMark } from '@/games/RealmArena/components/RealmArenaCaption';
import { TurnButtons, useBoardRotation } from '@/games/RealmArena/components/RealmArenaTurn';
import { Board3D, type FigureSpec, type Outline } from '@/games/RealmArena/three/board3d';
import { boardLook } from '@/games/RealmArena/three/canvasShapes';
import { cssColour } from '@/games/RealmArena/three/cssColour';
import { azimuthOf, boardFrame, cameraBasis, frameRect, regionOnScreen, topOf, turnedPoint, type BoardLayout } from '@/games/RealmArena/three/iso3d';
import { overlaid, type Shading, type ShadingLayer } from '@/games/RealmArena/three/shading3d';
import { loadSheets } from '@/games/RealmArena/three/terrain3d';
import { loadCharacterModels } from '@/games/RealmArena/three/characterModels';
import { CENTRE, isWarband, smokeSquares } from '@/games/RealmArena/rules';
import { areaRect, boardZoomFor, endOf, facingOf, ringOf, shadedSquares, type Ring, type ShadeKind } from '@/games/RealmArena/ui';
import { useBoardFocus } from '@/games/RealmArena/useBoardFocus';
import { squaresOfArea } from '@/utils/games/battlefield/terrain';
import { PlaybackProvider, usePlaybackFrame } from '@/utils/hooks/usePlayback';
import { usePrefersReducedMotion } from '@/utils/hooks/usePrefersReducedMotion';

/** The same props as the isometric board: either draws the same battle, and a screen picks one. */
type RealmArenaBoard3DProps = React.ComponentProps<typeof RealmArenaBoard>;

/** A layer that paints `shading` on each of `squares`. */
const inSet = (squares: ReadonlySet<number>, shading: Shading): ShadingLayer => square => squares.has(square) ? shading : null;

/** The token and strength each kind of ground shading is painted in, as the isometric board's CSS has it (`.ag-ra-fog` and the rest), and for one it outlines, the width of that stroke in the token's colour. A reach deepens by `REACH_STEP` for each AP it costs beyond the first. */
const SHADES: Readonly<Record<ShadeKind, { token: string; alpha: number; stroke?: number }>> = {
    fog: { token: '--ag-ink', alpha: 0.4 },
    smoke: { token: '--ag-ink-softer', alpha: 0.35 },
    reach: { token: '--ra-reach', alpha: 0.18 },
    range: { token: '--ra-range', alpha: 0.3 },
    blast: { token: '--ag-danger', alpha: 0.3, stroke: 0.5 },
    place: { token: '--ra-centre', alpha: 0.28, stroke: 0.4 },
};
const REACH_STEP = 0.12;

/** The stroke round each kind of area the board outlines, as the isometric board's CSS has it: `.ag-ra-deployment` (a zone), `.ag-ra-deployment--wave` (a zone the wave is due in), `.ag-ra-wave` (the breathing stroke over it) and `.ag-ra-centre`. Each is the stroke's strength, its width and its dash, none for a solid line. */
const STROKES = {
    zone: { alpha: 0.7, width: 0.6, dash: [2, 1.5] },
    waveDue: { alpha: 0.75, width: 1, dash: [2, 1.5] },
    wave: { alpha: 1, width: 1 },
    centre: { alpha: 1, width: 0.9, dash: [3, 1.5] },
} as const satisfies Record<string, Pick<Outline, 'alpha' | 'width' | 'dash'>>;

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
 * Everything the isometric board draws as a sprite or a label over its
 * figures is drawn here flat to the camera (three/billboards.ts), on that
 * board's own sizes and clock: each figure's marks, AP pips and item
 * (three/marks3d.ts) over its rings (three/rings3d.ts); its HP bar with its
 * chip and a lined-up action's change to it (three/bars3d.ts); a lined-up
 * action's path, odds and cover, and the centre's name (three/previews3d.ts);
 * and what an action did — hit text, slashes, bursts, missiles in flight —
 * with the smoke pot's cloud (three/fx3d.ts). What's shaded on the ground is
 * laid in the isometric board's order (three/shading3d.ts). The caption pill
 * and the review's unplaced "?" are the isometric board's own components
 * (RealmArenaCaption), over the frame outside the zoom. A figure downed fades
 * as it falls, one struck is knocked, cover blasted away fades off its
 * scorched ground, and a standing figure a wall hides is drawn again faintly
 * through it (three/figurePools.ts, three/figureCues.ts). With reduced motion
 * nobody walks, nothing flies, bursts, slashes or shakes the board, and the hit
 * text only appears and fades.
 */
export default function RealmArenaBoard3D({ field, fighters, fogGhosts = [], unseen, sides, sealed, owners, waveDue = false, showCentre = true, viewerId, colourFor, nameFor, selected, onSelect, placing, aiming, acting, refocus = 0, follow, home, odds, coverAt, overlay, playback, onPlayed, unplaced, clouds }: RealmArenaBoard3DProps) {
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
    // Nothing walks or flies with reduced motion: a character is simply where it ended up.
    const still = usePrefersReducedMotion();

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
    // What hangs round them: a ring each for who is chosen, a candidate, aimed at or a watcher a move would set off; and the AP of whoever's turn it is.
    useEffect(() => {
        if (!board) return;
        const rings = new Map<number, Ring>();
        for (const { id } of fighters) {
            const ring = ringOf(id, selected?.id, aiming);
            if (ring) rings.set(id, ring);
        }
        board.setMarking({ acting: acting ?? null, rings });
    }, [board, fighters, selected, aiming, acting]);
    // The viewer's sealed squad, drawn where each pick stands, with the one picked up ringed.
    useEffect(() => {
        board?.setSealed(sealed?.map(pick => ({ pick, facing: facingOf(field, pick) })) ?? [], placing?.selected ?? null);
    }, [board, field, sealed, placing?.selected]);

    // The smoke pot's clouds stand on their squares: the 3×3 round where each landed, thrown by someone the viewer can see or not.
    const smoke = useMemo(() => smokeSquares({ field, fighters, clouds }), [field, fighters, clouds]);
    useEffect(() => board?.setSmoke(smoke), [board, smoke]);

    // What's shaded on the ground, laid over one another in the order the isometric
    // board paints them: the zones and the centre (which it draws as polygons), then
    // what both boards shade a square at a time (`shadedSquares`). The edge of each
    // area it strokes is laid in the same order (`setOutlines`).
    useEffect(() => {
        const scope = frame.current;
        if (!board || !scope) return;
        const token = (name: string) => cssColour(scope, `var(${name})`);
        const zone = new Map<number, Shading>();
        const wave = new Map<number, Color>();
        const outlines: Outline[] = [], waveOutlines: Outline[] = [];
        field.deployments.forEach((squares, seat) => {
            const owner = owners[seat];
            const colour = owner ? cssColour(scope, colourFor(owner)) : token('--ag-ink-softer');
            for (const square of squares) zone.set(square, { colour, alpha: 0.16 });
            const due = waveDue && owner !== undefined && isWarband(owner);
            if (due) squares.forEach(square => wave.set(square, colour));
            // A zone drawn in parts is outlined part by part. One the wave is due in is stroked the heavier (`.ag-ra-deployment--wave`), and breathes over it (`.ag-ra-wave`).
            for (const area of field.deploymentAreas[seat]) {
                const part = new Set(squaresOfArea(field.width, area));
                outlines.push({ squares: part, colour, ...due ? STROKES.waveDue : STROKES.zone });
                if (due) waveOutlines.push({ squares: part, colour, ...STROKES.wave });
            }
        });
        const layers: ShadingLayer[] = [square => zone.get(square) ?? null];
        const centre = new Set(showCentre ? field.objectives[CENTRE] ?? [] : []);
        if (centre.size > 0) {
            const colour = token('--ra-centre');
            layers.push(inSet(centre, { colour, alpha: 0.18 }));
            outlines.push({ squares: centre, colour, ...STROKES.centre });
        }
        for (const shade of shadedSquares({ unseen, smoke, aiming, placing, sealed })) {
            const { token: name, alpha, stroke } = SHADES[shade.kind];
            const colour = token(name);
            layers.push(square => shade.has(square) ? { colour, alpha: shade.ap ? alpha + REACH_STEP * (shade.ap(square) - 1) : alpha } : null);
            if (stroke) outlines.push({ squares: new Set(Array.from(field.tiles.keys()).filter(shade.has)), colour, alpha: 1, width: stroke });
        }
        board.setShading(square => overlaid(layers, square), wave.size > 0 ? wave : null);
        board.setOutlines(outlines, waveOutlines);
    }, [board, field, smoke, owners, colourFor, waveDue, showCentre, aiming, unseen, placing, sealed]);

    // What an action lined up and the map show over the figures: the path, the
    // chance to hit, the cover, the centre's name; and the colours they, the marks and the bars wear.
    useEffect(() => {
        if (frame.current) board?.setLook(boardLook(frame.current));
    }, [board]);
    useEffect(() => {
        const centreSquares = showCentre ? field.objectives[CENTRE] ?? [] : [];
        board?.setPreviews({
            path: aiming?.path ?? null,
            odds: odds?.map(({ target, chance }) => ({ square: target.square, chance })) ?? [],
            coverAt: coverAt ?? null,
            centre: centreSquares.length > 0 ? areaRect(field, centreSquares) : null,
        });
    }, [board, field, showCentre, aiming?.path, odds, coverAt]);
    // What the lined-up action would do to each standing figure's HP, flashing at the end of its bar.
    useEffect(() => board?.setHpChange(aiming?.hpChange ?? null), [board, aiming?.hpChange]);

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
    // While an action plays, its caption floats over the foot of the frame, so the view frames the action clear of that strip.
    const focus: BoardZoomFocus | null = area && { rect: frameRect(here.frame, regionOnScreen(here.basis, area.area, top)), key: area.key, exact: area.exact, ...playback && { inset: CAPTION_INSET } };
    const onTapSquare = placing?.onTap ?? aiming?.onSquare;
    // While placing, a tap on a character of the squad — sealed, or a fighter — goes where a tap on its square does.
    useEffect(() => board?.listen({
        onFigure: id => {
            if (!placing) return id >= 0 ? onSelect(id) : undefined;
            const square = id < 0 ? sealed?.[-id - 1]?.square : fighters.find(fighter => fighter.id === id)?.square;
            if (square !== undefined) placing.onTap(square);
        },
        onSquare: square => onTapSquare?.(square),
    }), [board, onSelect, onTapSquare, placing, sealed, fighters]);
    useEffect(() => board?.play(playback ? { cues: playback.cues, before: playback.before, field: playback.field } : null, tracks, still), [board, playback, tracks, still]);

    return (
        <div ref={frame} className="ag-board-frame ag-realmarena-frame">
            <PlaybackProvider playKey={playback?.key ?? null} end={playback ? endOf(playback.cues) : 0} held={held} onEnd={onPlayed}>
                <BoardZoom camera {...boardZoomFor(here.frame.size.width)} viewBox={here.frame.size} focus={focus} onFocused={onFocused} pivot={pivot}>
                    <div ref={host} className="ag-ra-3d" role="img" aria-label={`The ${field.name}`} />
                    <BoardCamera board={board} rotation={rotation} glide={turned.turns > 0} layout={here} />
                </BoardZoom>
                <PlaybackFrames board={board} />
                <TurnButtons onTurn={turn} />
                {/* Over the foot of the frame, out of the zoom: while an action plays, what is happening in words; otherwise the targets, which want the same spot. */}
                {playback ? <PlaybackCaption key={playback.key} playback={playback} fighters={fighters} viewerId={viewerId} nameFor={nameFor} /> : overlay}
            </PlaybackProvider>
            <UnplacedMark unplaced={unplaced} />
        </div>
    );
}
