import React from 'react';

/** The crosshair that marks a count of targets in reach: on a unit's box, and on the board's list of targets. */
export default function RealmArenaCrosshair() {
    return (
        <svg className="ag-ra-crosshair" viewBox="0 0 16 16" aria-hidden="true">
            <circle cx="8" cy="8" r="5" />
            <path d="M8 1v4M8 11v4M1 8h4M11 8h4" />
        </svg>
    );
}
