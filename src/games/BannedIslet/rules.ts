// Pure, isomorphic Banned Islet rules: what a pawn can do from where it
// stands, what a flood card does to a tile, where a drowning pawn surfaces,
// and the four ways the team loses — from docs/games/banned-islet.md §4.2,
// §8 and §9. No server-only imports, so the client's action picker can compute
// its hints straight from this module rather than re-deriving adjacency or
// capture eligibility a second time (see docs/new-game.md, "Isomorphic rules
// modules").
//
// These are the **base** rules only. Every one of §12's six roles bends
// exactly one of them, and each arrives here as its own small pure predicate
// in PR 7 (§21.6) — deliberately after the rules they bend are stable, rather
// than woven through them now.
//
// Everything here is a function of the island and a position, never of a saved
// document: the engine passes in `positions` and gets back a decision.
import {
    CARDS_TO_CAPTURE,
    LOSING_WATER_LEVEL,
    PIER_TILE,
    TREASURES,
    WATER_LEVEL_TRACK,
    orthogonalNeighbours,
    tileOrder,
    BannedIsletCardId,
    BannedIsletTileId,
    BannedIsletTileState,
    BannedIsletTreasureId,
} from "./board";

/** One grid position of §21.4's `positions` array: which tile was shuffled into it, and what state that tile is in. */
export interface IBannedIsletPosition {
    tile: BannedIsletTileId;
    state: BannedIsletTileState;
}

/** The whole island — 24 entries, indexed by grid position, holes included. */
export type BannedIsletIsland = readonly IBannedIsletPosition[];

// ─── Reading the island ─────────────────────────────────────────────────────

/** Where a tile is. A sunk tile keeps its position (§5.1: it leaves a hole), so every tile is always somewhere; `-1` only for an island that doesn't hold it. */
export function positionOfTile(island: BannedIsletIsland, tile: BannedIsletTileId): number {
    return island.findIndex(p => p.tile === tile);
}

export function pierPosition(island: BannedIsletIsland): number {
    return positionOfTile(island, PIER_TILE);
}

export function tileStateAt(island: BannedIsletIsland, position: number): BannedIsletTileState | null {
    return island[position]?.state ?? null;
}

/** Whether a pawn can be on this position at all — dry and flooded both count, a hole doesn't (§9.1). */
export function isStandable(island: BannedIsletIsland, position: number): boolean {
    const state = tileStateAt(island, position);
    return state === 'dry' || state === 'flooded';
}

// ─── Movement and shoring (§8) ──────────────────────────────────────────────

/** §8 Move: the tiles a pawn can step onto for one action — orthogonally adjacent, and not a hole. */
export function legalMoves(island: BannedIsletIsland, position: number): number[] {
    return orthogonalNeighbours(position).filter(p => isStandable(island, p));
}

/** §8 Shore Up: the flooded tiles a pawn can dry out — its own and its neighbours'. A dry tile is not a no-op but an illegal target (§16), which is why this lists rather than shrugs. */
export function legalShoreUps(island: BannedIsletIsland, position: number): number[] {
    return [position, ...orthogonalNeighbours(position)]
        .filter(p => tileStateAt(island, p) === 'flooded')
        .sort((a, b) => a - b);
}

// ─── Capturing (§8) ─────────────────────────────────────────────────────────

/** The treasure this position's tile belongs to, if any. */
export function treasureAt(island: BannedIsletIsland, position: number): BannedIsletTreasureId | null {
    const tile = island[position]?.tile;
    if (!tile) return null;
    return TREASURES.find(t => t.tiles.includes(tile))?.id ?? null;
}

export function countCards(hand: readonly BannedIsletCardId[], card: BannedIsletCardId): number {
    return hand.filter(c => c === card).length;
}

/**
 * §8 Capture a Treasure: four matching cards, standing on either of that
 * treasure's tiles, and the treasure still out there. Returns the treasure the
 * action would claim, or `null` if it isn't available — the one question the
 * action picker and `Execute` both ask.
 */
export function capturableTreasureAt(
    island: BannedIsletIsland,
    position: number,
    hand: readonly BannedIsletCardId[],
    captured: Record<BannedIsletTreasureId, boolean>,
): BannedIsletTreasureId | null {
    const treasure = treasureAt(island, position);
    if (!treasure || captured[treasure]) return null;
    return countCards(hand, treasure) >= CARDS_TO_CAPTURE ? treasure : null;
}

// ─── Flooding (§9.1, §11) ───────────────────────────────────────────────────

export interface IBannedIsletFloodResult {
    /** The island after the card resolved — a new array; the one passed in is untouched. */
    island: IBannedIsletPosition[];
    position: number;
    from: BannedIsletTileState;
    to: BannedIsletTileState;
    /** Whether this card took the tile off the board for good. */
    sank: boolean;
    /**
     * §9.1: a sunk tile's flood card is **removed from the game** rather than
     * discarded, which is why the late game floods the same survivors over and
     * over. Easy to miss and mechanically vital, so the transition returns it
     * rather than leaving each caller to remember.
     */
    cardLeavesGame: boolean;
}

/**
 * §9.1's dry → flooded → sunk transition, for one flood card naming one tile.
 * Total: a card for a tile that has already sunk can't exist (its card left the
 * game), but if one ever turns up it changes nothing and leaves the game again.
 */
export function applyFloodCard(island: BannedIsletIsland, tile: BannedIsletTileId): IBannedIsletFloodResult {
    const position = positionOfTile(island, tile);
    const from = position >= 0 ? island[position].state : 'sunk';
    const to: BannedIsletTileState = from === 'dry' ? 'flooded' : 'sunk';
    const next = island.map(p => ({ ...p }));
    if (position >= 0) next[position].state = to;
    return { island: next, position, from, to, sank: from === 'flooded', cardLeavesGame: to === 'sunk' };
}

/** §11: how many flood cards Phase 3 draws at this water level. Level 10 is the skull, not a rate (§4.2), so it reads as the deepest one. */
export function floodRateFor(waterLevel: number): number {
    const index = Math.min(Math.max(Math.trunc(waterLevel), 1), WATER_LEVEL_TRACK.length) - 1;
    return WATER_LEVEL_TRACK[index];
}

// ─── Routes (§5.1, §21.3) ───────────────────────────────────────────────────

/**
 * Steps from one position to another over surviving tiles, or `null` if the
 * island no longer connects them — the sunk tile that severs the board (§5.1)
 * expressed as a number. Read by `resolveSwim`'s tie-break below.
 */
export function routeDistance(island: BannedIsletIsland, from: number, to: number): number | null {
    if (!isStandable(island, from) || !isStandable(island, to)) return null;
    if (from === to) return 0;
    const seen = new Set<number>([from]);
    let frontier = [from];
    let distance = 0;
    while (frontier.length > 0) {
        distance++;
        const next: number[] = [];
        for (const position of frontier) {
            for (const neighbour of orthogonalNeighbours(position)) {
                if (seen.has(neighbour) || !isStandable(island, neighbour)) continue;
                if (neighbour === to) return distance;
                seen.add(neighbour);
                next.push(neighbour);
            }
        }
        frontier = next;
    }
    return null;
}

// ─── Swimming (§9.2, §21.3) ─────────────────────────────────────────────────

/**
 * Where a pawn ends up when the tile under it sinks — §21.3's deviation, and
 * the one place the app decides something a player would have decided. Pure
 * and total, so it can run inside the sinking player's own `Execute` rather
 * than stalling the game on an absent swimmer:
 *
 *   1. a dry tile beats a flooded one,
 *   2. then the shortest surviving route to Beacon Pier — the tie-break chosen
 *      to make the one Move it costs to undo a rare need,
 *   3. then the lowest tile id (§5.2's printed order), so the swim is
 *      reproducible on replay rather than dependent on array order.
 *
 * `null` means there is nowhere to go, which is the drowning loss of §4.2 —
 * see `isDrowningLoss`. §9.2's three role exceptions widen the candidates
 * without touching that preference, and arrive with the rest of the roles in
 * PR 7.
 */
export function resolveSwim(island: BannedIsletIsland, from: number): number | null {
    const candidates = orthogonalNeighbours(from).filter(p => isStandable(island, p));
    if (candidates.length === 0) return null;

    const pier = pierPosition(island);
    const ranked = candidates.map(position => ({
        position,
        dry: island[position].state === 'dry' ? 0 : 1,
        toPier: routeDistance(island, position, pier) ?? Number.POSITIVE_INFINITY,
        tile: tileOrder(island[position].tile),
    }));
    ranked.sort((a, b) => a.dry - b.dry || a.toPier - b.toPier || a.tile - b.tile);
    return ranked[0].position;
}

// ─── The four losses (§4.2) ─────────────────────────────────────────────────

/** Beacon Pier sinks: the escape point is gone and nothing else matters (§16 — it fires even if the whole team was standing on it). */
export function isPierLoss(island: BannedIsletIsland): boolean {
    return tileStateAt(island, pierPosition(island)) === 'sunk';
}

/** Treasures whose tiles have both sunk while they were still out there — each one of them ends the game (§4.2). */
export function lostTreasures(
    island: BannedIsletIsland,
    captured: Record<BannedIsletTreasureId, boolean>,
): BannedIsletTreasureId[] {
    return TREASURES
        .filter(t => !captured[t.id] && t.tiles.every(tile => tileStateAt(island, positionOfTile(island, tile)) === 'sunk'))
        .map(t => t.id);
}

export function isTreasureLoss(island: BannedIsletIsland, captured: Record<BannedIsletTreasureId, boolean>): boolean {
    return lostTreasures(island, captured).length > 0;
}

/** A player drowns: their tile sank and §9.2 leaves them nowhere to swim to. */
export function isDrowningLoss(island: BannedIsletIsland, position: number): boolean {
    return resolveSwim(island, position) === null;
}

/** The sea wins: the meter has climbed to the skull (§11). */
export function isWaterLevelLoss(waterLevel: number): boolean {
    return waterLevel >= LOSING_WATER_LEVEL;
}
