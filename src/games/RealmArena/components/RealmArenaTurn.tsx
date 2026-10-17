'use client'
import React, { useState } from 'react';
import { useStoredValue } from '@/utils/hooks/useStoredValue';
import type { IsoRotation } from '@/utils/ui/isometric';

/** The view turned a quarter at a time, and how it got there: what a board keeps its place across (`BoardZoom`'s `pivot`). */
export interface Turned {
    /** The turn it was at before the latest. */
    from: IsoRotation;
    /** How many times it's been turned here, so each turn is its own pivot. */
    turns: number;
}

/**
 * The viewer's own turn of the battlefield (`IsoRotation`), as this browser
 * remembers it, the way to turn it a quarter either way, and how it has been
 * turned since this board opened (`Turned`): every way of drawing the board
 * shares it, so a player keeps their turn whichever draws.
 */
export function useBoardRotation(viewerId: string): [IsoRotation, (by: 1 | 3) => void, Turned] {
    const [stored, store] = useStoredValue(`realmarena-board-rotation-${viewerId}`);
    const rotation = stored === '1' || stored === '2' || stored === '3' ? Number(stored) as IsoRotation : 0;
    const [turned, setTurned] = useState<Turned>({ from: rotation, turns: 0 });
    const turnBy = (by: 1 | 3) => {
        setTurned(({ turns }) => ({ from: rotation, turns: turns + 1 }));
        store(String((rotation + by) % 4));
    };
    return [rotation, turnBy, turned];
}

/** The buttons that turn the battlefield's view a quarter either way, in the frame's top corner opposite the zoom pill. */
export function TurnButtons({ onTurn }: { onTurn: (by: 1 | 3) => void }) {
    return (
        <div className="ag-board-tag ag-ra-turn" role="group" aria-label="Turn the view">
            <button type="button" onClick={() => onTurn(3)} aria-label="Turn the view anticlockwise" title="Turn anticlockwise">↺</button>
            <button type="button" onClick={() => onTurn(1)} aria-label="Turn the view clockwise" title="Turn clockwise">↻</button>
        </div>
    );
}
