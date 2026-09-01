// Deterministic avatar colouring so a given person keeps the same badge hue
// across the whole app.

import { hashString } from './hash';

const PALETTE: { bg: string; fg: string }[] = [
    { bg: "oklch(0.85 0.06 65)", fg: "oklch(0.4 0.07 60)" },   // sand
    { bg: "oklch(0.8 0.06 300)", fg: "oklch(0.4 0.08 300)" },  // violet
    { bg: "oklch(0.85 0.05 200)", fg: "oklch(0.4 0.06 200)" }, // teal
    { bg: "oklch(0.82 0.07 145)", fg: "oklch(0.38 0.08 145)" },// green
    { bg: "oklch(0.85 0.07 25)", fg: "oklch(0.42 0.1 30)" },   // rose
    { bg: "oklch(0.86 0.07 95)", fg: "oklch(0.42 0.08 90)" },  // gold
];

export function avatarColor(seed: string | null | undefined): { bg: string; fg: string } {
    if (!seed) return { bg: "oklch(0.88 0.02 60)", fg: "oklch(0.5 0.03 60)" };
    return PALETTE[Math.abs(hashString(seed)) % PALETTE.length];
}

// The letters for someone's badge — empty when we have no name to work from,
// which is the signal for `Avatar` to draw the silhouette instead. A name we
// haven't loaded yet is nobody in particular, and a letter from a placeholder
// like "there" or "You" reads as a real person's initial.
export function initials(name: string | null | undefined): string {
    if (!name) return "";
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "";
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

// The picture to show for a user, or null when they have never set one.
// Clerk hands every user an `imageUrl` — but for a user who has never set a
// picture that URL is a generated placeholder, and our own initials badge is
// the better default there, so only a real picture (an SSO avatar today,
// uploads/unlockables later) counts. Takes the shape shared by Clerk's
// server `User` and client `UserResource`, so both sides use this one rule.
export function profileImageUrl(
    user: { hasImage?: boolean | null; imageUrl?: string | null } | null | undefined
): string | null {
    return user?.hasImage && user.imageUrl ? user.imageUrl : null;
}
