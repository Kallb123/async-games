// Deterministic avatar colouring so a given person keeps the same badge hue
// across the whole app.

const PALETTE: { bg: string; fg: string }[] = [
    { bg: "oklch(0.85 0.06 65)", fg: "oklch(0.4 0.07 60)" },   // sand
    { bg: "oklch(0.8 0.06 300)", fg: "oklch(0.4 0.08 300)" },  // violet
    { bg: "oklch(0.85 0.05 200)", fg: "oklch(0.4 0.06 200)" }, // teal
    { bg: "oklch(0.82 0.07 145)", fg: "oklch(0.38 0.08 145)" },// green
    { bg: "oklch(0.85 0.07 25)", fg: "oklch(0.42 0.1 30)" },   // rose
    { bg: "oklch(0.86 0.07 95)", fg: "oklch(0.42 0.08 90)" },  // gold
];

function hash(seed: string): number {
    let h = 0;
    for (let i = 0; i < seed.length; i++) {
        h = (h << 5) - h + seed.charCodeAt(i);
        h |= 0;
    }
    return Math.abs(h);
}

export function avatarColor(seed: string | null | undefined): { bg: string; fg: string } {
    if (!seed) return { bg: "oklch(0.88 0.02 60)", fg: "oklch(0.5 0.03 60)" };
    return PALETTE[hash(seed) % PALETTE.length];
}

export function initials(name: string | null | undefined): string {
    if (!name) return "?";
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "?";
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}
