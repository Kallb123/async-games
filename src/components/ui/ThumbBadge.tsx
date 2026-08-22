'use client'

import GameThumb from "@/components/ui/GameThumb";
import { GameMeta } from "@/utils/ui/games";

interface ThumbBadgeProps {
    meta: GameMeta;
    size?: number;
    radius?: number;
    /** Per-site overrides for the inset and ring (see `ag-thumb-badge`). */
    className?: string;
}

// A game icon riding the lower-right corner of whatever it sits on — an
// avatar, a result chip. The host only has to be a positioned box
// (`ag-avatar-stack`, `ag-result-chip`); the ring and clipping are this
// badge's, and the corner rounding follows the thumb inside it.
export default function ThumbBadge({ meta, size = 16, radius = 6, className }: ThumbBadgeProps) {
    return (
        <span className={`ag-thumb-badge${className ? ` ${className}` : ""}`} style={{ borderRadius: radius }}>
            <GameThumb meta={meta} size={size} radius={radius} />
        </span>
    );
}
