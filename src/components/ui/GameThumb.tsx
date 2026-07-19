'use client'

import { GameMeta } from "@/utils/ui/games";

const ACCENT_VAR: Record<GameMeta["accent"], string> = {
    terracotta: "var(--ag-terracotta)",
    green: "var(--ag-green)",
    gold: "var(--ag-gold)",
    purple: "var(--ag-purple)",
};

export function accentVar(accent: GameMeta["accent"]) {
    return ACCENT_VAR[accent];
}

interface GameThumbProps {
    meta: GameMeta;
    size?: number;
    radius?: number;
}

// A small square game icon: real art when available, otherwise a tinted glyph.
export default function GameThumb({ meta, size = 48, radius = 12 }: GameThumbProps) {
    if (meta.art) {
        return (
            <img
                src={meta.art}
                alt=""
                style={{ width: size, height: size, borderRadius: radius, objectFit: "cover", flex: "none" }}
            />
        );
    }
    return (
        <div
            style={{
                width: size,
                height: size,
                borderRadius: radius,
                flex: "none",
                background: ACCENT_VAR[meta.accent],
                color: "var(--ag-on-dark)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                font: `800 ${Math.round(size * 0.32)}px var(--ag-font)`,
            }}
        >
            {meta.glyph}
        </div>
    );
}
