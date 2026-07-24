// Fisher-Yates shuffle. Shared by every game that randomises a deck or a
// starting layout (Settlements & Cities' terrain/number/harbour pools and dev
// card deck, Risk's territory deal and Risk card deck) — reuse this rather
// than re-declaring the same loop per game.
export function shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}
