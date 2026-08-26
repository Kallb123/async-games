'use client'

import { CSSProperties } from "react";
import { ROW_THUMB_RADIUS, ROW_THUMB_SIZE } from "@/components/ui/GameThumb";

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

/**
 * What a placeholder row leads with, matching the real rows it stands in for:
 * a person's `Avatar`, a `GameThumb`, the small status dot a turn list uses,
 * or nothing at all for a row that is all text.
 */
export type SkeletonRowIcon = "avatar" | "thumb" | "dot" | "none";

const ROW_ICON: Record<SkeletonRowIcon, { size: number; radius: number | string } | null> = {
    avatar: { size: 36, radius: "50%" },
    thumb: { size: ROW_THUMB_SIZE, radius: ROW_THUMB_RADIUS },
    dot: { size: 8, radius: "50%" },
    none: null,
};

/** One placeholder row shaped like `.ag-list-row` (a leading icon + two text lines). */
export function SkeletonRow({ icon = "avatar" }: { icon?: SkeletonRowIcon }) {
    const box = ROW_ICON[icon];
    return (
        <div className="ag-list-row" aria-hidden>
            {box && <Skeleton width={box.size} height={box.size} radius={box.radius} style={{ flex: "none" }} />}
            <div className="ag-list-row-main">
                <Skeleton width="55%" height={12} />
                <Skeleton width="35%" height={10} style={{ marginTop: 6 }} />
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
