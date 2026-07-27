import React from 'react';

interface StatProps {
    value: React.ReactNode;
    label: React.ReactNode;
}

/** One metric tile (a big number + a small label), e.g. "185 / score". Wraps
 * the .ag-stat-num/.ag-stat-label classes already used on the profile page,
 * so any screen needing a row of stats reuses the same markup. Wrap a row of
 * these in .ag-stat-row. */
export default function Stat({ value, label }: StatProps) {
    return (
        <div className="ag-stat">
            <div className="ag-stat-num">{value}</div>
            <div className="ag-stat-label">{label}</div>
        </div>
    );
}
