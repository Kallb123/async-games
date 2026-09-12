// Shared, isomorphic text for the two screens that narrate a Banned Islet
// flood phase: the end-of-turn reveal the acting player sees
// (BannedIsletEndTurnScreen) and the "since you were last here" away recap
// (recap.ts). Both describe the same flood log, so the phrasing lives here
// rather than being written twice and drifting apart — the same call
// Outbreak's narration.ts makes for its infect phase. Pure presentation:
// names and numbers only, no rules.
import { LOSING_WATER_LEVEL, tileName, type BannedIsletTileId } from "@/games/BannedIslet/board";
import type { IBannedIsletFloodLogEntry, IBannedIsletSwim } from "@/games/BannedIslet/rules";
import { pluralize } from "@/utils/ui/text";

/** "Kelp Stair", "Kelp Stair and Coral Steps", "Kelp Stair, Coral Steps and Bone Reach". */
export function tileList(tiles: readonly BannedIsletTileId[]): string {
    const names = tiles.map(tileName);
    if (names.length <= 1) return names.join("");
    if (names.length === 2) return `${names[0]} and ${names[1]}`;
    return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * §11's Waters Rise! as a title and a detail line: the meter climbing and what
 * the island now loses a turn, or the skull that ends the game. The rise that
 * reached LOSING_WATER_LEVEL has no flood rate — that is how it is told apart.
 */
export function watersRiseLines(entry: IBannedIsletFloodLogEntry): { title: string; detail: string } {
    if (entry.floodRateAfter === undefined) {
        return { title: `Waters Rise! The meter reached ${LOSING_WATER_LEVEL}`, detail: 'The sea wins.' };
    }
    return {
        title: `Waters Rise! The water meter climbs to level ${entry.waterLevelAfter}`,
        detail: `${pluralize(entry.shuffledBack ?? 0, 'flood card')} go back on top of the deck — the island now loses ${pluralize(entry.floodRateAfter, 'tile')} a turn.`,
    };
}

/**
 * §9.2's forced swim, which the app resolves on the player's behalf (§21.3) —
 * so it is never a silent pawn teleport in either screen. `tileAt` names the
 * tile at a grid position, which only the caller holding the island can do.
 */
export function swimLines(
    swim: IBannedIsletSwim,
    name: string,
    tileAt: (position: number) => string,
): { title: string; detail: string } {
    if (swim.to === null) {
        return {
            title: `${name} went into the water with nowhere to swim`,
            detail: 'Every tile around them was already gone.',
        };
    }
    return {
        title: `${name} swam to ${tileAt(swim.to)}`,
        detail: 'One Move on their own turn puts them back where they meant to be.',
    };
}
