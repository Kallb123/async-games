'use client'
import React from 'react';
import BoardZoom from '@/components/ui/BoardZoom';
import MapLabelLayer, { type MapLabelSpec } from '@/components/ui/MapLabelLayer';
import type { Rect } from '@/utils/ui/mapLabels';
import { playerColourForId } from '@/utils/ui/playerColours';
import type { IRaceCarsPlayerStateResponse, IRaceCarsSpecificGameStateResponse } from '@/games/RaceCars/apiModels';
import { cornerAt, spaceKey, trackById, type RaceCarsGeometry, type RaceCarsTrack } from '@/games/RaceCars/board';

// One lozenge per space, sized so the 214 of them tile into the road itself —
// which is why this board draws no separate tarmac ribbon under them. Tuned to
// the placeholder loop's row and lane pitch; §23.6's generated geometry keeps
// the same spacing, so the art slides in underneath without resizing these.
const SPACE_LENGTH = 23;
const SPACE_WIDTH = 20;

// §19.1's car: one silhouette — a single path — filled with the driver's
// `playerColourForId` and turned to the heading of the space it stands on.
// Rear wing, body, four wheels, pointing along increasing rows at heading 0.
// Not an emoji, and the reasons are §19.1's: an emoji arrives with its own
// colours baked in and ignores `fill`, and there are not six vehicle emoji
// whose colour is stable across platforms to seat a six-car grid.
const CAR_PATH = [
    'M-12 -6 h3.4 v12 h-3.4 Z',
    'M-9 -3.1 C -4.5 -4, 1.5 -3.6, 5.5 -2.8 L 11.5 0 L 5.5 2.8 C 1.5 3.6, -4.5 4, -9 3.1 Z',
    'M-8.6 -8 h5.2 v3.6 h-5.2 Z',
    'M-8.6 4.4 h5.2 v3.6 h-5.2 Z',
    'M3 -7.4 h4.6 v3.2 h-4.6 Z',
    'M3 4.2 h4.6 v3.2 h-4.6 Z',
].join(' ');
const CAR_LENGTH = 26;
const CAR_WIDTH = 16;

// §19's corner-stop pips: "● ○" is one banked of the two this corner owes,
// drawn on the corner beside the car that banked them rather than as a tint of
// its tarmac, so the count survives greyscale and a colour-blind reader.
const PIP_RADIUS = 3;
const PIP_PITCH = PIP_RADIUS * 2 + 2;
const PIP_DROP = CAR_WIDTH / 2 + PIP_RADIUS + 3;

const CORNER_LABEL_FONT_SIZE = 13;

/** The geometry Map §23.4 asks for: built once per track, never a `.find()` per space. */
const GEOMETRY_BY_TRACK = new Map<string, Map<string, RaceCarsGeometry>>();

function geometryFor(track: RaceCarsTrack): Map<string, RaceCarsGeometry> {
    const cached = GEOMETRY_BY_TRACK.get(track.id);
    if (cached) return cached;
    const built = new Map(track.geometry.map(space => [spaceKey(space.row, space.lane), space]));
    GEOMETRY_BY_TRACK.set(track.id, built);
    return built;
}

function centredRect(x: number, y: number, width: number, height: number): Rect {
    return { x: x - width / 2, y: y - height / 2, width, height };
}

/** The side of the board a corner's name should lean towards — away from the middle. */
function labelDir(x: number, y: number, track: RaceCarsTrack): MapLabelSpec['dir'] {
    const dx = x - track.art.viewBox.width / 2;
    const dy = y - track.art.viewBox.height / 2;
    if (Math.abs(dx) > Math.abs(dy)) return dx < 0 ? 'w' : 'e';
    return dy < 0 ? 'n' : 's';
}

interface RaceCarsBoardProps {
    gs: IRaceCarsSpecificGameStateResponse;
    /** Player seats in join order — the key `playerColourForId` colours a car by. */
    userIdList: string[];
    /** Spaces this move may finish on, as `spaceKey`s — the tappable ones. */
    validSpaces: Set<string>;
    onSpaceClick?: (row: number, lane: number) => void;
    boardTag?: string | null;
}

/**
 * The circuit: one surface, zoomable, with every space on it (§19.2). There is
 * deliberately no second cropped copy of it for a phone — Outbreak, World
 * Domination and Settlements & Cities all solve "board too big for a column"
 * with `BoardZoom` inside `ag-board-frame` and none of them has needed one.
 * If a playtest proves 78 rows still can't be tapped, §19.2's answer is a
 * `window` prop narrowing *this* component's viewBox, and it is not built
 * until a playtest asks for it.
 *
 * The spaces are SVG over the art rather than drawn by it (§23.6), so a space's
 * position and its drawing can never drift apart. They are plain `<rect>`s and
 * not `ClickableMapNode`s on purpose (§23.1): a space's legal/illegal state is
 * one class, where the shared node would ring each lozenge with a circle and
 * hang a `<title>` off all 214 of them.
 */
export default function RaceCarsBoard({ gs, userIdList, validSpaces, onSpaceClick, boardTag = null }: RaceCarsBoardProps) {
    const track = trackById(gs.trackId);
    const geometry = geometryFor(track);
    const { width, height } = track.art.viewBox;

    // Cars, with everything drawn beside them worked out once: used to draw
    // them, and to tell the label layer what the corner names must keep off.
    const cars = userIdList.flatMap(userId => {
        const ps: IRaceCarsPlayerStateResponse | undefined = gs.playerStates[userId];
        const at = ps && geometry.get(spaceKey(ps.row, ps.lane));
        if (!ps || !at) return [];
        const corner = cornerAt(track, ps.row);
        return [{
            userId,
            ps,
            at,
            colour: playerColourForId(userId, userIdList),
            pips: corner ? { banked: Math.min(ps.cornerStops, corner.stops), owed: corner.stops } : null,
        }];
    });

    const obstacles: Rect[] = cars.flatMap(car => [
        centredRect(car.at.x, car.at.y, CAR_LENGTH, CAR_WIDTH),
        ...(car.pips ? [centredRect(car.at.x, car.at.y + PIP_DROP, car.pips.owed * PIP_PITCH, PIP_RADIUS * 2)] : []),
    ]);

    const cornerLabels: MapLabelSpec[] = track.corners.flatMap(corner => {
        const middle = geometry.get(spaceKey(Math.round((corner.from + corner.to) / 2), 1));
        if (!middle) return [];
        return [{
            key: corner.id,
            x: middle.x,
            y: middle.y,
            text: corner.name,
            dir: labelDir(middle.x, middle.y, track),
            radius: SPACE_LENGTH,
        }];
    });

    const startLine = geometry.get(spaceKey(0, 1));

    return (
        <div className="ag-board-frame ag-racecars-frame">
            {boardTag && <div className="ag-board-tag">{boardTag}</div>}
            <BoardZoom zoomWidth="240%">
                <svg viewBox={`0 0 ${width} ${height}`}>
                    {/* The circuit render of §23.6 — tarmac, kerbs, run-off and
                        the painted corner boundaries. It lands in PR 9; until
                        the file exists nothing is drawn here and the space
                        layer below is the board. */}
                    <image
                        href={track.art.href}
                        x={0} y={0} width={width} height={height}
                        preserveAspectRatio="xMidYMid slice"
                    />

                    {track.geometry.map(space => {
                        const key = spaceKey(space.row, space.lane);
                        const isValid = validSpaces.has(key);
                        const corner = cornerAt(track, space.row);
                        const className = [
                            'ag-rc-space',
                            corner ? 'ag-rc-space--corner' : '',
                            space.row === 0 ? 'ag-rc-space--line' : '',
                            isValid ? 'ag-rc-space--valid' : '',
                        ].filter(Boolean).join(' ');
                        const choose = isValid && onSpaceClick ? () => onSpaceClick(space.row, space.lane) : undefined;
                        return (
                            <rect
                                key={key}
                                className={className}
                                x={space.x - SPACE_LENGTH / 2}
                                y={space.y - SPACE_WIDTH / 2}
                                width={SPACE_LENGTH}
                                height={SPACE_WIDTH}
                                rx={4}
                                transform={`rotate(${space.heading} ${space.x} ${space.y})`}
                                onClick={choose}
                                role={choose ? 'button' : undefined}
                                tabIndex={choose ? 0 : undefined}
                                onKeyDown={choose ? event => { if (event.key === 'Enter') choose(); } : undefined}
                            >
                                {/* Only on the handful of spaces a move may
                                    finish on — §23.1's objection to a title per
                                    space is 214 of them, not three. */}
                                {choose && <title>{`Row ${space.row}, lane ${space.lane}`}</title>}
                            </rect>
                        );
                    })}

                    {startLine && (
                        <text
                            className="ag-rc-startflag"
                            x={startLine.x} y={startLine.y}
                            textAnchor="middle" dominantBaseline="central"
                        >
                            🏁
                        </text>
                    )}

                    {cars.map(({ userId, ps, at, colour, pips }) => (
                        <g key={userId}>
                            <path
                                className="ag-rc-car"
                                d={CAR_PATH}
                                fill={colour}
                                transform={`translate(${at.x} ${at.y}) rotate(${at.heading})`}
                            />
                            {/* The race number rides on the car but not with it:
                                drawn outside the rotation so a car heading back
                                down the circuit doesn't print its number upside
                                down. Haloed rather than tinted, so it reads on
                                all six of the palette's colours. */}
                            <text className="ag-rc-number" x={at.x} y={at.y} textAnchor="middle" dominantBaseline="central">
                                {ps.raceNumber}
                            </text>
                            {pips && Array.from({ length: pips.owed }, (_unused, index) => (
                                <circle
                                    key={index}
                                    className={`ag-rc-pip${index < pips.banked ? ' ag-rc-pip--banked' : ''}`}
                                    cx={at.x + (index - (pips.owed - 1) / 2) * PIP_PITCH}
                                    cy={at.y + PIP_DROP}
                                    r={PIP_RADIUS}
                                />
                            ))}
                        </g>
                    ))}

                    {/* The corner names last, and through the shared layer
                        rather than one bare MapLabel each (§23.1): it lays all
                        three out in one pass so none lands on a car or on the
                        pips beside it, both of which move every turn. */}
                    <MapLabelLayer
                        labels={cornerLabels}
                        obstacles={obstacles}
                        width={width} height={height}
                        offset={SPACE_LENGTH + 8}
                        fontSize={CORNER_LABEL_FONT_SIZE}
                        fontWeight={800}
                    />
                </svg>
            </BoardZoom>
        </div>
    );
}
