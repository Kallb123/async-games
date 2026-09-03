'use client'
import React from 'react';
import { DISPLAY_COLS, DISPLAY_ROWS, edgeBetween, isInteriorSpace, spaceAtDisplayCell, spaceName } from '@/games/FiresOut/board';
import type { IFiresOutEdgeResponse, IFiresOutFirefighterResponse, IFiresOutSpaceResponse } from '@/games/FiresOut/apiModels';
import { playerColourForId } from '@/utils/ui/playerColours';

// The 6×8 interior grid inside its exterior perimeter, rendered as the one
// (ROWS + 2) × (COLS + 2) display grid board.ts lays the two out on — every
// cell the same size, so board.png (the whole board, tracks and all — see
// .ag-fo-grid in ag-theme.css) lines up behind it cell for cell. Walls are
// cell borders and doors are gaps in them (fires-out-gdd.md §17.6 step 5):
// the art is decoration, so this still reads wall/door state straight off
// `edges` rather than drawing over the picture of it.

function edgeBorder(edge: IFiresOutEdgeResponse | undefined): string {
    if (!edge || edge.kind === 'open') return 'none';
    if (edge.kind === 'wall') {
        if (edge.damage >= 2) return 'none'; // destroyed — passable, nothing left to draw
        return edge.damage === 1 ? '3px dashed var(--fo-wall-cracked)' : '3px solid var(--fo-wall)';
    }
    return edge.doorOpen ? '3px dashed var(--fo-door-open)' : '4px solid var(--fo-door)';
}

/** The building's outer shell — a wall in every sense except that the edge graph doesn't model it, since it's never choppable and never a door. */
const SHELL_WALL = '3px solid var(--fo-wall)';

/** The border between an interior cell and the display cell next to it: the wall/door graph's, or the outer shell where the next cell is outdoors. */
function borderTowards(edges: IFiresOutEdgeResponse[], space: number, neighbour: number): string {
    if (!isInteriorSpace(neighbour)) return SHELL_WALL;
    return edgeBorder(edges[edgeBetween(space, neighbour)!]);
}

interface FiresOutBoardProps {
    spaces: IFiresOutSpaceResponse[];
    edges: IFiresOutEdgeResponse[];
    firefighters: IFiresOutFirefighterResponse[];
    userIdList: string[];
    activeFirefighter: number;
    /** Spaces the pending action (if any) can legally target — the tappable ones. */
    validSpaces: Set<number>;
    onSpaceClick?: (space: number) => void;
    /** §12, §17.6 step 9: current parking spots — omitted in the Family game, which sets vehicles aside. */
    engine?: number;
    ambulance?: number;
}

export default function FiresOutBoard({ spaces, edges, firefighters, userIdList, activeFirefighter, validSpaces, onSpaceClick, engine, ambulance }: FiresOutBoardProps) {
    const pawnsBySpace = new Map<number, IFiresOutFirefighterResponse[]>();
    firefighters.forEach(ff => pawnsBySpace.set(ff.space, [...(pawnsBySpace.get(ff.space) ?? []), ff]));
    const activeOwnerId = firefighters[activeFirefighter]?.ownerId;

    const cells: React.ReactNode[] = [];
    for (let displayRow = 0; displayRow < DISPLAY_ROWS; displayRow++) {
        for (let displayCol = 0; displayCol < DISPLAY_COLS; displayCol++) {
            const space = spaceAtDisplayCell(displayRow, displayCol);
            const interior = isInteriorSpace(space);
            const state = spaces[space];
            const isValid = validSpaces.has(space);
            const pawns = pawnsBySpace.get(space) ?? [];

            const style: React.CSSProperties = {};
            if (interior) {
                // Each interior cell draws its own right and bottom edge, and
                // the cell before it draws the shared one — except along the
                // building's outer shell, where there is no cell before it.
                // Interior cells are inset by a whole cell of perimeter, so
                // every one of these four neighbours is on the display grid.
                style.borderRightWidth = 0;
                style.borderBottomWidth = 0;
                style.borderRight = borderTowards(edges, space, spaceAtDisplayCell(displayRow, displayCol + 1));
                style.borderBottom = borderTowards(edges, space, spaceAtDisplayCell(displayRow + 1, displayCol));
                if (!isInteriorSpace(spaceAtDisplayCell(displayRow, displayCol - 1))) style.borderLeft = SHELL_WALL;
                if (!isInteriorSpace(spaceAtDisplayCell(displayRow - 1, displayCol))) style.borderTop = SHELL_WALL;
            }

            cells.push(
                <button
                    key={space}
                    type="button"
                    className={[
                        'ag-fo-cell',
                        interior ? '' : 'ag-fo-cell--exterior',
                        isValid ? 'ag-fo-cell--valid' : '',
                    ].filter(Boolean).join(' ')}
                    style={style}
                    disabled={!isValid}
                    onClick={isValid && onSpaceClick ? () => onSpaceClick(space) : undefined}
                    title={spaceName(space)}
                >
                    {state.threat !== 'none' && (
                        <span
                            key={`threat-${state.threat}`}
                            className={`ag-fo-marker ag-fo-token ag-fo-token--${state.threat}`}
                            aria-hidden="true"
                            title={state.threat === 'fire' ? 'Fire' : 'Smoke'}
                        >
                            {state.threat === 'fire' ? '🔥' : '💨'}
                        </span>
                    )}
                    {state.poi && (
                        <span
                            key={`poi-${state.poi.revealed}`}
                            className={`ag-fo-marker ag-fo-badge ag-fo-badge--poi${state.poi.revealed ? ' ag-fo-badge--victim' : ''}`}
                            aria-hidden="true"
                            title={state.poi.revealed ? 'Victim' : 'Possible victim'}
                        >
                            {state.poi.revealed ? '🧍' : '❓'}
                        </span>
                    )}
                    {(state.hazmat || state.hotspot) && (
                        <span className="ag-fo-marker ag-fo-badge ag-fo-badge--hazard" aria-hidden="true" title={state.hazmat ? 'Hazmat' : 'Hot spot'}>
                            {state.hazmat ? '☣️' : '♨️'}
                        </span>
                    )}
                    {(space === engine || space === ambulance) && (
                        <span className="ag-fo-marker ag-fo-badge ag-fo-badge--vehicle" aria-hidden="true" title={space === engine ? 'Engine' : 'Ambulance'}>
                            {space === engine ? '🚒' : '🚑'}
                        </span>
                    )}
                    {pawns.length > 0 && (
                        <span className="ag-fo-pawns">
                            {pawns.map(ff => (
                                <span
                                    key={ff.ownerId}
                                    className={`ag-fo-pawn${ff.ownerId === activeOwnerId ? ' ag-fo-pawn--active' : ''}`}
                                    style={{ background: playerColourForId(ff.ownerId, userIdList) }}
                                    title={ff.username}
                                />
                            ))}
                        </span>
                    )}
                </button>,
            );
        }
    }

    return (
        <div className="ag-board-frame ag-firesout-frame">
            <div className="ag-fo-grid">{cells}</div>
        </div>
    );
}
