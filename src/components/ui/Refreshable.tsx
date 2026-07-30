'use client'

interface RefreshableProps {
    /** True while a background refetch is in flight (`useRefreshableData`). */
    isRefreshing: boolean;
    /** Class of the container this stands in for — usually `ag-list` or `ag-stack`. */
    className?: string;
    children: React.ReactNode;
}

/**
 * Wraps content that is already on screen while it is being refreshed. It *is*
 * the container (no extra element), it just adds the `ag-refreshing` shimmer
 * and `aria-busy` while a refetch runs — so rows stay in place instead of being
 * replaced by a skeleton that resizes the page under the reader.
 */
export default function Refreshable({ isRefreshing, className, children }: RefreshableProps) {
    return (
        <div
            className={`${className ?? ""}${isRefreshing ? " ag-refreshing" : ""}`.trim()}
            aria-busy={isRefreshing || undefined}
        >
            {children}
        </div>
    );
}
