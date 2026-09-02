'use client'
import React from 'react';
import { COLS, edgeBetween, exteriorBottomSpace, exteriorTopSpace, ROWS, spaceIndex } from '@/games/FiresOut/board';
import type { IFiresOutEdgeResponse, IFiresOutFirefighterResponse, IFiresOutSpaceResponse } from '@/games/FiresOut/apiModels';
import { playerColourForId } from '@/utils/ui/playerColours';

// The 6×8 interior grid plus its exterior parking track, rendered as one 8×8
// CSS grid — board.ts's own row/column convention (row = the d6, column =
// the d8), with the exterior track as the grid's first and last row. Walls
// are cell borders and doors are gaps in them (fires-out-gdd.md §17.6 step
// 5): board.png sits behind the grid as decoration only (see .ag-fo-grid in
// ag-theme.css), so this still reads wall/door state straight off `edges`
// rather than drawing over the picture of it.
const DISPLAY_ROWS = ROWS + 2;

function edgeBorder(edge: IFiresOutEdgeResponse | undefined): string {
    if (!edge || edge.kind === 'open') return 'none';
    if (edge.kind === 'wall') {
        if (edge.damage >= 2) return 'none'; // destroyed — passable, nothing left to draw
        return edge.damage === 1 ? '3px dashed var(--fo-wall-cracked)' : '3px solid var(--fo-wall)';
    }
    return edge.doorOpen ? '3px dashed var(--fo-door-open)' : '4px solid var(--fo-door)';
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
        const isTopTrack = displayRow === 0;
        const isBottomTrack = displayRow === DISPLAY_ROWS - 1;
        const boardRow = displayRow - 1; // meaningless for the two track rows

        for (let col = 0; col < COLS; col++) {
            const space = isTopTrack ? exteriorTopSpace(col) : isBottomTrack ? exteriorBottomSpace(col) : spaceIndex(boardRow, col);
            const state = spaces[space];
            const isValid = validSpaces.has(space);
            const pawns = pawnsBySpace.get(space) ?? [];

            const style: React.CSSProperties = {};
            if (!isTopTrack && !isBottomTrack) {
                // Interior cell: its own right/bottom edges come from the
                // wall/door graph; the grid's outer left/right flank is a
                // permanent wall board.ts never models (only the top/bottom
                // rows connect to the exterior track — see EXTERIOR_TOP_START's
                // comment in board.ts).
                style.borderRightWidth = 0;
                style.borderBottomWidth = 0;
                if (col === COLS - 1) style.borderRight = '3px solid var(--fo-wall)';
                else style.borderRight = edgeBorder(edges[edgeBetween(space, spaceIndex(boardRow, col + 1))!]);
                if (boardRow < ROWS - 1) style.borderBottom = edgeBorder(edges[edgeBetween(space, spaceIndex(boardRow + 1, col))!]);
                if (col === 0) style.borderLeft = '3px solid var(--fo-wall)';
            }

            cells.push(
                <button
                    key={space}
                    type="button"
                    className={[
                        'ag-fo-cell',
                        isTopTrack || isBottomTrack ? 'ag-fo-cell--exterior' : '',
                        isValid ? 'ag-fo-cell--valid' : '',
                    ].filter(Boolean).join(' ')}
                    style={style}
                    disabled={!isValid}
                    onClick={isValid && onSpaceClick ? () => onSpaceClick(space) : undefined}
                    title={`Space ${space}`}
                >
                    {state.threat !== 'none' && (
                        <span
                            key={`threat-${state.threat}`}
                            className={`ag-fo-token ag-fo-token--${state.threat}`}
                            aria-hidden="true"
                            title={state.threat === 'fire' ? 'Fire' : 'Smoke'}
                        >
                            {state.threat === 'fire' ? '🔥' : '💨'}
                        </span>
                    )}
                    {state.poi && (
                        <span
                            key={`poi-${state.poi.revealed}`}
                            className={`ag-fo-badge ag-fo-badge--poi${state.poi.revealed ? ' ag-fo-badge--victim' : ''}`}
                            aria-hidden="true"
                            title={state.poi.revealed ? 'Victim' : 'Possible victim'}
                        >
                            {state.poi.revealed ? '🧍' : '❓'}
                        </span>
                    )}
                    {(state.hazmat || state.hotspot) && (
                        <span className="ag-fo-badge ag-fo-badge--hazard" aria-hidden="true" title={state.hazmat ? 'Hazmat' : 'Hot spot'}>
                            {state.hazmat ? '☣️' : '♨️'}
                        </span>
                    )}
                    {(space === engine || space === ambulance) && (
                        <span className="ag-fo-badge ag-fo-badge--vehicle" aria-hidden="true" title={space === engine ? 'Engine' : 'Ambulance'}>
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
