import React from 'react';

/**
 * The small spinner + verb badge that names what's happening to an object a
 * command is acting on — a market card being built, a row being bought. Pair it
 * with the `ag-pending-skin` class on that object's own container, which draws
 * the marching-ant outline around it.
 */
export default function PendingTag({ label }: { label: string }) {
    return (
        <span className="ag-pending-tag">
            <span className="ag-spinner ag-spinner--sm ag-spinner--accent" />
            {label}
        </span>
    );
}
