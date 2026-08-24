'use client'
import React, { useState } from 'react';

interface BoardZoomProps {
    /** Width the board is stretched to while zoomed in, e.g. '260%'. */
    zoomWidth: string;
    /** The board <svg>. */
    children: React.ReactNode;
}

/**
 * Zoom toggle + scroll pane for a board that's wider than the app column.
 * Fitted to the column the map is readable but the tap targets are tiny, so
 * this pins a pill in the corner of the frame that blows the board up and lets
 * the player pan around it instead. Render it inside an `.ag-board-frame`.
 */
export default function BoardZoom({ zoomWidth, children }: BoardZoomProps) {
    const [zoomed, setZoomed] = useState(false);

    return (
        <>
            <button
                type="button"
                className="ag-board-tag ag-board-tag--action"
                aria-pressed={zoomed}
                onClick={() => setZoomed(z => !z)}
            >
                {zoomed ? '➖ Fit map' : '➕ Zoom in'}
            </button>
            <div
                className="ag-board-scroll"
                style={{ '--ag-board-zoom': zoomed ? zoomWidth : '100%' } as React.CSSProperties}
            >
                {children}
            </div>
        </>
    );
}
