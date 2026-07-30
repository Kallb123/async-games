'use client'

import Image from "next/image";
import { GameMeta, ThemeAccent } from "@/utils/ui/games";

// Every game icon in /public/art is a square PNG of this size. next/image needs
// the real intrinsic dimensions to pick a sensible optimised copy.
export const GAME_ART_SIZE = 128;

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

// Flat-top hexagon, used instead of the border-radius rounding for games
// whose theme calls for a hex badge.
const HEXAGON_CLIP_PATH = "polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)";

// A small square game icon: real art when available, otherwise a tinted glyph.
export default function GameThumb({ meta, size = 48, radius = 12 }: GameThumbProps) {
    const isHexagon = meta.shape === "hexagon";
    const shapeStyle = isHexagon ? { clipPath: HEXAGON_CLIP_PATH } : { borderRadius: radius };

    if (meta.art) {
        return (
            <Image
                src={meta.art}
                alt=""
                width={size}
                height={size}
                style={{ width: size, height: size, ...shapeStyle, objectFit: "cover", flex: "none" }}
            />
        );
    }
    return (
        <div
            style={{
                width: size,
                height: size,
                ...shapeStyle,
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
