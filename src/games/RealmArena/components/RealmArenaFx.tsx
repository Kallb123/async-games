'use client'
import React, { useLayoutEffect, useRef } from 'react';
import { ISO_HALF_HEIGHT, ISO_HALF_WIDTH, type Point } from '@/utils/ui/isometric';
import type { Square } from '@/utils/games/battlefield/terrain';
import { BURST_ART, EFFECT_ART, MISSILE_ART, SLASH_ART } from '@/games/RealmArena/art';
import { burstAt, flightAt, FLIGHT, HIT_LABEL_DROP, HIT_LANE_RISE, HIT_MARK_GAP, HIT_MARK_SIZE, HIT_VALUE_RISE, hitTextAt, SLASH_SIZE, slashAt, TUMBLE, type BattleCue, type BurstCue, type FlightCue, type FxPoints, type SlashCue, type TextCue } from '@/games/RealmArena/ui';
import { SpriteUse } from './RealmArenaTerrain';
import { scaleAbout, setAttributes, translation, usePlaybackRef } from '@/utils/hooks/usePlayback';
import { usePrefersReducedMotion } from '@/utils/hooks/usePrefersReducedMotion';

interface RealmArenaFxProps {
    /** The board's id, which its art is defined under. */
    id: string;
    cues: readonly BattleCue[];
    /** Where a cue on a square goes, at the square's height and the view's turn. */
    at: (square: Square) => FxPoints;
}

function HitText({ id, cue, over, still }: { id: string; cue: TextCue; over: Point; still: boolean }) {
    const { x } = over;
    const y = over.y - (cue.lane ?? 0) * HIT_LANE_RISE;
    const middle = y - HIT_VALUE_RISE;
    const rising = usePlaybackRef<SVGGElement>((group, ms) => {
        const frame = hitTextAt(cue, ms, still);
        setAttributes(group, { opacity: frame.opacity, transform: translation({ x: 0, y: frame.rise }) });
    });
    const popping = usePlaybackRef<SVGGElement>((group, ms) => {
        setAttributes(group, { transform: scaleAbout(x, middle, hitTextAt(cue, ms, still).scale) });
    });
    // The mark stands just past the end of the text as the font draws it, measured
    // once it's laid out, rather than from a guess at how wide its characters are.
    const value = useRef<SVGTextElement>(null);
    const mark = useRef<SVGGElement>(null);
    useLayoutEffect(() => {
        if (!value.current || !mark.current) return;
        setAttributes(mark.current, { transform: translation({ x: value.current.getComputedTextLength() / 2 + HIT_MARK_GAP + HIT_MARK_SIZE / 2, y: 0 }) });
    }, [cue.value, cue.mark]);
    return (
        <g ref={rising} className={`ag-ra-hit ag-ra-hit--${cue.tone}`}>
            <g ref={popping}>
                <text ref={value} className="ag-ra-hit-value" x={x} y={middle}>{cue.value}</text>
                {cue.label && <text className="ag-ra-hit-label" x={x} y={middle + HIT_LABEL_DROP}>{cue.label}</text>}
                {cue.mark && (
                    <g ref={mark}>
                        <SpriteUse className="ag-ra-figure-mark" id={id} sprite={EFFECT_ART[cue.mark]} x={x} y={middle} size={HIT_MARK_SIZE} />
                    </g>
                )}
            </g>
        </g>
    );
}

/** A burst over the square or the 3×3 it went off on, its foot along the area's front corner. */
function Burst({ id, cue, ground }: { id: string; cue: BurstCue; ground: Point }) {
    const across = 2 * cue.radius + 1;
    const sprite = BURST_ART[cue.burst];
    const width = across * 2 * ISO_HALF_WIDTH;
    const height = width * sprite.height / sprite.width;
    const middle = ground.y + across * ISO_HALF_HEIGHT - height / 2;
    const flaring = usePlaybackRef<SVGGElement>((group, ms) => {
        const frame = burstAt(cue, ms);
        setAttributes(group, { opacity: frame.opacity, transform: scaleAbout(ground.x, middle, frame.scale) });
    });
    return (
        <g ref={flaring} className={`ag-ra-burst ag-ra-burst--${cue.burst}`}>
            <SpriteUse className="ag-ra-burst-art" id={id} sprite={sprite} x={ground.x} y={middle} size={width} height={height} />
        </g>
    );
}

/** A strike's slash, wiped across the figure it lands on. */
function Slash({ id, cue, body }: { id: string; cue: SlashCue; body: Point }) {
    const wiping = usePlaybackRef<SVGGElement>((group, ms) => {
        const frame = slashAt(cue, ms);
        const offset = translation({ x: frame.dx, y: frame.dy });
        setAttributes(group, { opacity: frame.opacity, transform: `${offset ?? ''} ${scaleAbout(body.x, body.y, frame.scale)}` });
    });
    return (
        <g ref={wiping} className="ag-ra-slash">
            <SpriteUse className="ag-ra-slash-art" id={id} sprite={SLASH_ART} x={body.x} y={body.y} size={SLASH_SIZE} />
        </g>
    );
}

/** A missile where it is now: pointing the way it flies, its front on the point, or tumbling about its middle. Hidden before it's loosed and once it's gone. */
function Flight({ id, cue, at }: { id: string; cue: FlightCue; at: RealmArenaFxProps['at'] }) {
    const { size, tumbles } = FLIGHT[cue.missile];
    const flying = usePlaybackRef<SVGGElement>((group, ms) => {
        const now = flightAt(cue, at, ms);
        if (!now) return setAttributes(group, { visibility: 'hidden' });
        const turn = tumbles ? (ms - cue.start) * TUMBLE : now.heading;
        setAttributes(group, {
            visibility: 'visible',
            opacity: now.opacity,
            transform: `${translation(now.point) ?? ''} rotate(${turn}) scale(${now.scale})`,
        });
    });
    return (
        <g ref={flying} className="ag-ra-flight">
            <SpriteUse className="ag-ra-flight-art" id={id} sprite={MISSILE_ART[cue.missile]} x={tumbles ? 0 : -size / 2} y={0} size={size} />
        </g>
    );
}

/**
 * What an action did, played over the battlefield (docs/games/realm-arena.md
 * §26): hit text, bursts, slashes and the missiles in flight, drawn above the
 * figures. `battleCues` worked out when each part starts and how long it lasts.
 *
 * All of it moves on the playback's one clock (docs/isometric-animations.md
 * §4): each piece draws itself from the time `usePlaybackRef` hands it, by
 * setting its own SVG attributes through a ref — no render a frame, and nothing
 * keyframed in the stylesheet. So a pause is one flag on the clock, a skip lands
 * everything at once, and nothing drifts against the walkers the board draws on
 * the same clock. The pure functions of time — where a missile is, how far a
 * text has risen — are `ui.ts`'s.
 *
 * This is drawn in an overlay SVG the board stacks over its own, with the same
 * viewBox, inside the same zoom: it zooms, pans and turns with the board, but a
 * frame of it repaints only this, not the board's hundreds of sprites. A fall,
 * a scorch and a walk are the board's, which draws the figure and the ground, and
 * a wall has to hide them. With reduced motion the text appears where it
 * happened and fades; nothing flies, bursts or slashes. Nothing here can be
 * tapped, so the board goes on working underneath while it plays.
 *
 * Keyed by its playback, so the next one starts it over and cuts this one short.
 */
export default function RealmArenaFx({ id, cues, at }: RealmArenaFxProps) {
    const still = usePrefersReducedMotion();
    return (
        <g className="ag-ra-fx" aria-hidden="true">
            {cues.map((cue, index) => {
                switch (cue.kind) {
                    case 'text': return <HitText key={index} id={id} cue={cue} over={at(cue.square).head} still={still} />;
                    case 'burst': return still ? null : <Burst key={index} id={id} cue={cue} ground={at(cue.at).ground} />;
                    case 'slash': return still ? null : <Slash key={index} id={id} cue={cue} body={at(cue.square).body} />;
                    case 'flight': return still ? null : <Flight key={index} id={id} cue={cue} at={at} />;
                    default: return null;
                }
            })}
        </g>
    );
}
