'use client'

import { GameMeta, ThemeAccent } from "@/utils/ui/games";

const ACCENT_VAR: Record<ThemeAccent, string> = {
    terracotta: "var(--ag-terracotta)",
    green: "var(--ag-green)",
    gold: "var(--ag-gold)",
    purple: "var(--ag-purple)",
};

// Named accents resolve to a theme token; anything else (e.g. a hex code)
// is treated as a raw CSS colour and passed through as-is.
export function accentVar(accent: GameMeta["accent"]) {
    return ACCENT_VAR[accent as ThemeAccent] ?? accent;
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
                background: accentVar(meta.accent),
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
