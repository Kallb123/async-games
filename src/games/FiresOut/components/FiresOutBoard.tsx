'use client'
import React from 'react';
import { DISPLAY_COLS, DISPLAY_ROWS, edgeBetween, isInteriorSpace, spaceAtDisplayCell, spaceName } from '@/games/FiresOut/board';
import type { IFiresOutEdgeResponse, IFiresOutFirefighterResponse, IFiresOutSpaceResponse } from '@/games/FiresOut/apiModels';
import { playerColour, playerColourForId } from '@/utils/ui/playerColours';

// The 6×8 interior grid inside its exterior perimeter, rendered as the one
// (ROWS + 2) × (COLS + 2) display grid board.ts lays the two out on — every
// cell the same size, so board.png (the whole board, tracks and all — see
// .ag-fo-grid in ag-theme.css) lines up behind it cell for cell. Walls are
// cell borders and doors are gaps in them (fires-out-gdd.md §17.6 step 5):
// the art is decoration, so this still reads wall/door state straight off
// `edges` rather than drawing over the picture of it.

/**
 * The name and the colour one figure is shown by — on the board here, and on
 * the scoreboard pills the game screen builds from the same call.
 *
 * A crew board takes both from the figure's *owner*, which is the colour and
 * the name every other surface already uses for that player: the log, the
 * recap, the scoreboard's seat order. §1's solitaire crew (§17.6 step 12) has
 * one owner for every figure, so doing that there would paint the whole crew
 * a single colour and label all six of them "You" — §17.2 gap 3's index into
 * `firefighters` is the only thing that tells one from another, so it is what
 * names and colours them. `playerColour` has exactly six colours and
 * MAX_SOLO_CREW is six, so a solo crew never wraps.
 *
 * `viewerId` is optional because a board tooltip wants the player's real name
 * where a scoreboard pill wants "You".
 */
export function figureIdentity(
    index: number,
    ff: Pick<IFiresOutFirefighterResponse, 'ownerId' | 'username'>,
    userIdList: string[],
    viewerId?: string,
): { name: string; colour: string } {
    if (userIdList.length === 1) {
        return { name: `Firefighter ${index + 1}`, colour: playerColour(index) };
    }
    return {
        name: ff.ownerId === viewerId ? 'You' : ff.username,
        colour: playerColourForId(ff.ownerId, userIdList),
    };
}

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
    // Keyed by figure index, not by owner: a solitaire crew stacks several of
    // one player's figures on a space (they all start on START_SPACE), and the
    // index is what tells them apart — for the pawn's own React key as much as
    // for which one of them is up.
    const pawnsBySpace = new Map<number, number[]>();
    firefighters.forEach((ff, index) => pawnsBySpace.set(ff.space, [...(pawnsBySpace.get(ff.space) ?? []), index]));

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
                            {pawns.map(index => {
                                const { name, colour } = figureIdentity(index, firefighters[index], userIdList);
                                return (
                                    <span
                                        key={index}
                                        className={`ag-fo-pawn${index === activeFirefighter ? ' ag-fo-pawn--active' : ''}`}
                                        style={{ background: colour }}
                                        title={name}
                                    />
                                );
                            })}
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
