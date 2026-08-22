import React from 'react';

interface StatProps {
    value: React.ReactNode;
    label: React.ReactNode;
    /** Makes the tile a button — for a stat that opens the detail behind it. */
    onClick?: () => void;
    /** Whether that detail is currently open. */
    pressed?: boolean;
}

/** One metric tile (a big number + a small label), e.g. "185 / score". Wraps
 * the .ag-stat-num/.ag-stat-label classes already used on the profile page,
 * so any screen needing a row of stats reuses the same markup. Wrap a row of
 * these in .ag-stat-row. */
export default function Stat({ value, label, onClick, pressed }: StatProps) {
    const body = (
        <>
            <div className="ag-stat-num">{value}</div>
            <div className="ag-stat-label">{label}</div>
        </>
    );
    if (!onClick) return <div className="ag-stat">{body}</div>;
    return (
        <button type="button" className="ag-stat ag-stat--button" aria-pressed={pressed} onClick={onClick}>
            {body}
        </button>
    );
}
