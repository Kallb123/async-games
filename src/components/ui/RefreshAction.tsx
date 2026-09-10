'use client'

/**
 * The "Refresh" link a `Section`/`ListSection` heading takes as its `action` —
 * an admin screen's manual alternative to the push-driven refetch everywhere
 * else, for data nothing pushes for. Shared so a second admin section doesn't
 * retype the same button.
 */
export default function RefreshAction({ onClick }: { onClick: () => void }) {
    return (
        <button type="button" className="ag-section-action" onClick={onClick}>Refresh</button>
    );
}
