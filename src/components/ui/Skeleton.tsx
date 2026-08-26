import { CSSProperties } from "react";

type SkeletonProps = {
    width?: number | string;
    height?: number | string;
    radius?: number | string;
    className?: string;
    style?: CSSProperties;
};

/**
 * A single faded, gently pulsing placeholder block. Compose these to mirror
 * the shape of whatever content is still loading. Styling lives in
 * `ag-theme.css` (`.ag-skeleton`).
 */
export default function Skeleton({ width, height = 12, radius = 6, className, style }: SkeletonProps) {
    return (
        <span
            aria-hidden
            className={`ag-skeleton${className ? ` ${className}` : ""}`}
            style={{ width, height, borderRadius: radius, ...style }}
        />
    );
}

/** One placeholder row shaped like `.ag-list-row` (optional avatar + two text lines). */
export function SkeletonRow({ avatar = true }: { avatar?: boolean }) {
    return (
        <div className="ag-list-row" aria-hidden>
            {avatar
                ? <Skeleton width={36} height={36} radius="50%" style={{ flex: "none" }} />
                : <Skeleton width={8} height={8} radius="50%" style={{ flex: "none" }} />}
            <div className="ag-list-row-main">
                <Skeleton width="55%" height={12} />
                <Skeleton width="35%" height={10} style={{ marginTop: 6 }} />
            </div>
        </div>
    );
}

/** A grouped-list section of placeholder rows, with an optional placeholder heading. */
export function SkeletonList({ rows = 3, avatar = true, label = false }: { rows?: number; avatar?: boolean; label?: boolean }) {
    return (
        <div className="ag-section" aria-busy="true">
            {label && (
                <div className="ag-section-head">
                    <Skeleton width={120} height={13} />
                </div>
            )}
            <div className="ag-list">
                {Array.from({ length: rows }).map((_, i) => <SkeletonRow key={i} avatar={avatar} />)}
            </div>
        </div>
    );
}

/** One placeholder card shaped like a "your move" turn card on the homepage. */
export function SkeletonTurnCard() {
    return (
        <div className="ag-turn-card ag-skeleton-card">
            <div className="ag-turn-card-head">
                <Skeleton width={52} height={52} radius={12} style={{ flex: "none" }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                    <Skeleton width="60%" height={18} />
                    <Skeleton width="40%" height={12} style={{ marginTop: 8 }} />
                </div>
            </div>
            <Skeleton width="100%" height={44} radius={12} style={{ marginTop: 14 }} />
        </div>
    );
}

/** A placeholder row of "recent form" result chips, shaped like `.ag-result-chip`. */
export function SkeletonChips({ count = 10 }: { count?: number }) {
    return (
        <div className="ag-chips" aria-hidden>
            {Array.from({ length: count }).map((_, i) => <Skeleton key={i} width={26} height={26} radius="50%" />)}
        </div>
    );
}
