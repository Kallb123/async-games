// A small, fast string hash (DJB2, folded into a signed 32-bit int). Not for
// anything cryptographic — just a stable, evenly-spread number from a seed,
// for picking a deterministic avatar colour (`avatarColor`) or a stable
// Android notification id from a push's tag (`nativePush.ts`'s
// `showForegroundNotification`).
export function hashString(seed: string): number {
    let h = 0;
    for (let i = 0; i < seed.length; i++) {
        h = (h << 5) - h + seed.charCodeAt(i);
        h |= 0;
    }
    return h;
}
