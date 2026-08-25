import { GameMeta, ThemeAccent } from "@/utils/ui/games";

// The theme's colours, in the two forms the app has to hand them to a
// renderer. The browser resolves `ag-theme.css`'s custom properties itself,
// but anything drawing outside the DOM — the share card
// `/api/og/join/<code>` rasterises — has no stylesheet behind it and can't
// resolve an `oklch()` token, so it needs the sRGB value of the same colour.
// Both forms live here so they can't drift apart.
//
// `scripts/generate-icons.mjs` carries its own copy of these hexes, and is the
// one exception: it is a plain Node script that can't import TypeScript.

/** The dark colourway the share cards and the landing hero are painted on. */
export const SRGB = {
    brown: "#3a221a",
    brownLift: "#492a1f",
    cream: "#f7f0eb",
    inkSoft: "#c8b3a6",
} as const;

const ACCENT_VAR: Record<ThemeAccent, string> = {
    terracotta: "var(--ag-terracotta)",
    green: "var(--ag-green)",
    gold: "var(--ag-gold)",
    purple: "var(--ag-purple)",
};

const ACCENT_HEX: Record<ThemeAccent, string> = {
    terracotta: "#b74b21",
    green: "#4d9351",
    gold: "#b18827",
    purple: "#8f78ba",
};

// Named accents resolve to a theme token; anything else (e.g. a hex code)
// is treated as a raw CSS colour and passed through as-is.
export function accentVar(accent: GameMeta["accent"]) {
    return ACCENT_VAR[accent as ThemeAccent] ?? accent;
}

// The same accent as a plain sRGB colour, for a renderer with no stylesheet
// behind it. A bespoke accent is already a hex code, so it passes through.
export function accentHex(accent: GameMeta["accent"]) {
    return ACCENT_HEX[accent as ThemeAccent] ?? accent;
}
