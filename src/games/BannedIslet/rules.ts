// Pure, isomorphic Banned Islet rules: what a pawn can do from where it
// stands, what a flood card does to a tile, where a drowning pawn surfaces,
// and the four ways the team loses — from docs/games/banned-islet.md §4.2,
// §8 and §9. No server-only imports, so the client's action picker can compute
// its hints straight from this module rather than re-deriving adjacency or
// capture eligibility a second time (see docs/new-game.md, "Isomorphic rules
// modules").
//
// §12's six roles each bend exactly one of these rules, and each is its own
// small pure predicate at the bottom of this file (§21.6 PR 7) rather than an
// `if (role === ...)` branch inside a command — so the server's `Execute` and
// the client's action picker ask the same question and can never disagree
// about what a Pilot may do.
//
// Everything here is a function of the island and a position, never of a saved
// document: the engine passes in `positions` and gets back a decision.
import {
    CARDS_TO_CAPTURE,
    ENGINEER_SHORE_UPS,
    LOSING_WATER_LEVEL,
    NAVIGATOR_STEPS,
    PIER_TILE,
    TREASURES,
    WATER_LEVEL_TRACK,
    diagonalNeighbours,
    isTreasureCard,
    orthogonalNeighbours,
    tileOrder,
    BannedIsletCardId,
    BannedIsletRoleId,
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

// ─── Movement and shoring (§8, §12) ─────────────────────────────────────────
// Both of §8's spatial actions take the acting pawn's role, because two of
// §12's six bend them: the Explorer counts the corners as adjacent (for moving
// *and* for shoring), and the Diver swims a whole run of ruined tiles in one
// action. Every other role gets the base rule back unchanged, which is why
// these are the plain names rather than a base pair plus a role-aware pair —
// one question with one answer, asked by `Execute` and by the action picker.

/**
 * What this role treats as next door. §5.1's island is orthogonal and the
 * Explorer is the single exception (§12) — the one place the two neighbour
 * sets in board.ts are added together, so nothing else has to know that
 * diagonals exist.
 */
function adjacentFor(position: number, role: BannedIsletRoleId): number[] {
    return role === 'explorer'
        ? [...orthogonalNeighbours(position), ...diagonalNeighbours(position)]
        : orthogonalNeighbours(position);
}

/** The standable tiles one ordinary step away, by this role's own geometry — what a Navigator sends a pawn along, one step at a time. */
function steppableFrom(island: BannedIsletIsland, position: number, role: BannedIsletRoleId): number[] {
    return adjacentFor(position, role).filter(p => isStandable(island, p));
}

/**
 * §12 Diver / §9.2: the land on the far side of a run of ruined tiles. Swims
 * *through* flooded and sunk positions and may stop on anything standable —
 * so a flooded tile is both a step along the way and a place to stop (§9.1
 * makes flooded standable), while dry land ends the swim rather than being
 * swum through.
 *
 * §12 says "to the nearest land", which this reads as *the land a run of
 * ruined tiles reaches* rather than only the single closest tile: the Diver is
 * "the only pawn a collapsing island cannot strand", and picking their landing
 * spot for them would take away the rescue the role is for. `resolveSwim`
 * still picks one when the sea does the choosing.
 */
function diverReach(island: BannedIsletIsland, from: number): number[] {
    const canStop = new Set<number>();
    const seen = new Set<number>([from]);
    let frontier = [from];
    while (frontier.length > 0) {
        const next: number[] = [];
        for (const position of frontier) {
            for (const neighbour of orthogonalNeighbours(position)) {
                if (seen.has(neighbour)) continue;
                seen.add(neighbour);
                const state = tileStateAt(island, neighbour);
                if (state === 'flooded' || state === 'sunk') next.push(neighbour);
                if (state === 'flooded' || state === 'dry') canStop.add(neighbour);
            }
        }
        frontier = next;
    }
    return [...canStop];
}

/** §8 Move: the tiles this pawn can reach for one action — adjacent and standable, plus the Diver's swim through anything ruined (§12). */
export function moveTargets(island: BannedIsletIsland, position: number, role: BannedIsletRoleId): number[] {
    const stepped = steppableFrom(island, position, role);
    const reach = role === 'diver' ? new Set([...stepped, ...diverReach(island, position)]) : new Set(stepped);
    reach.delete(position);
    return [...reach].sort((a, b) => a - b);
}

/**
 * §8 Shore Up: the flooded tiles this pawn can dry out — its own and its
 * neighbours', the Explorer's corners included (§12). A dry tile is not a
 * no-op but an illegal target (§16), which is why this lists rather than
 * shrugs, and a sunk one can never be dried (§9.1).
 *
 * The Engineer changes the *price* rather than the targets — see
 * `shoreUpsPerAction`.
 */
export function shoreUpTargets(island: BannedIsletIsland, position: number, role: BannedIsletRoleId): number[] {
    return [position, ...adjacentFor(position, role)]
        .filter(p => tileStateAt(island, p) === 'flooded')
        .sort((a, b) => a - b);
}

/** §12 Engineer: two flooded tiles for one action, and one for everybody else. "Up to" — drying a single tile is still a legal shore up for them. */
export function shoreUpsPerAction(role: BannedIsletRoleId): number {
    return role === 'engineer' ? ENGINEER_SHORE_UPS : 1;
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

// ─── The flood log (§21.4) ──────────────────────────────────────────────────
// What one end-of-turn resolution did to the island, card by card, built by
// BannedIsletEndTurn (and by BannedIsletDiscard, which finishes the same
// turn) and carried on its outcome — Outbreak's IOutbreakInfectionLogEntry
// exactly, and for the same two customers: the end-of-turn reveal the client
// draws and, later, the away-time recap. It lives here rather than beside the
// command because both the server that writes it and the screen that renders
// it read it, and this module is the isomorphic half.

/** One pawn caught by a sinking (§9.2) — `to` is null for the swim that had nowhere to go, which is the drowning loss of §4.2. */
export interface IBannedIsletSwim {
    userId: string;
    from: number;
    to: number | null;
}

export interface IBannedIsletFloodLogEntry {
    /**
     * `flood` — one flood card drawn in Phase 3.
     * `watersRise` — §11's three-step resolution, drawn in Phase 2.
     * `reshuffle` — the flood deck emptied mid-draw and the discard refilled
     *   it (§11), which is the endgame rather than an exception case.
     */
    kind: 'flood' | 'watersRise' | 'reshuffle';
    /** `flood`: the tile the card named. */
    tile?: BannedIsletTileId;
    /** `flood`: what the card did to it — §9.1's two transitions. */
    outcome?: BannedIsletTileState;
    /** `flood`: the pawns a sinking swept off the tile, in turn order (§9.2). */
    swims?: IBannedIsletSwim[];
    /** `watersRise`: the meter after the rise, and what the island now loses a turn. `floodRateAfter` is absent for the rise that reached the skull, which has no rate (§11). */
    waterLevelAfter?: number;
    floodRateAfter?: number;
    /** `watersRise` / `reshuffle`: how many flood cards went back onto the deck. */
    shuffledBack?: number;
}

/** §11: how many flood cards Phase 3 draws at this water level. Level 10 is the skull, not a rate (§4.2), so it reads as the deepest one. */
export function floodRateFor(waterLevel: number): number {
    const index = Math.min(Math.max(Math.trunc(waterLevel), 1), WATER_LEVEL_TRACK.length) - 1;
    return WATER_LEVEL_TRACK[index];
}

// ─── The forced discard (§10, §21.3) ────────────────────────────────────────

/**
 * Which cards a player who is *not there* lets go of, when the draw pushed
 * their hand over §10's limit and the turn-timer cron has to finish the turn
 * for them (`utils/games/turnTimeout.ts`). The second decision in this game the
 * app makes on a player's behalf, after `resolveSwim`, and held to the same
 * §21.3 standard: pure, total, and deliberate rather than incidental.
 *
 * "The first N in the array" is what this replaced, and it was wrong twice
 * over. It could discard the team's only Helicopter Lift — the card §4.1's win
 * is actually taken with — purely because of where it happened to sit; and the
 * array is not even ordered by age once any card has changed hands, since
 * `applyGiveCard` splices out of the middle and pushes onto the end.
 *
 * So the order it lets go in is:
 *
 *   1. §10's treasure cards before its specials. A spare treasure card is one
 *      of twenty; a Helicopter Lift is one of three and is the §4.1 win.
 *   2. among treasure cards, the treasure the player holds fewest of — so a
 *      lone card goes before one of the four that are nearly a capture (§8).
 *   3. then by card id, so a replay and a recap reach the same hand.
 */
export function forcedDiscard(hand: readonly BannedIsletCardId[], limit: number): BannedIsletCardId[] {
    const excess = hand.length - limit;
    if (excess <= 0) return [];
    return hand
        .map((card, index) => ({ card, index }))
        .sort((a, b) =>
            (isTreasureCard(a.card) ? 0 : 1) - (isTreasureCard(b.card) ? 0 : 1)
            || countCards(hand, a.card) - countCards(hand, b.card)
            || a.card.localeCompare(b.card)
            || a.index - b.index)
        .slice(0, excess)
        .map(entry => entry.card);
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
 * §9.2's candidates when the tile under a pawn sinks — every tile that role
 * could have *moved* to, since a swim is the same geometry without the action
 * cost, plus the Pilot's whole island.
 *
 * The Pilot is the one role whose swim is wider than their move: flying costs
 * an action and happens once a turn on their own turn (§12), but a tile going
 * out from under them is neither their choice nor their turn, so the fare is
 * waived rather than the ability being spent. That is exactly what §9.2 means
 * by "the Pilot may swim to any tile on the island".
 */
export function swimReach(island: BannedIsletIsland, from: number, role: BannedIsletRoleId): number[] {
    return role === 'pilot'
        ? pilotFlightTargets(island, from)
        : moveTargets(island, from, role);
}

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
 * see `isDrowningLoss`. §9.2's three role exceptions widen *which* tiles are
 * candidates (`swimReach`) without touching the preference between them, so a
 * Diver and a Messenger dropped off the same tile rank the same shortlist
 * differently sized.
 */
export function resolveSwim(island: BannedIsletIsland, from: number, role: BannedIsletRoleId): number | null {
    const candidates = swimReach(island, from, role);
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

// ─── Roles (§12, §21.6 PR 7) ────────────────────────────────────────────────
// The three abilities that are not a widening of a base rule above. The other
// three are, and live with the rule each of them bends: the Explorer's
// diagonals and the Diver's swim in `moveTargets` / `shoreUpTargets`, and the
// Engineer's second tile in `shoreUpsPerAction`. Every one of them is a
// predicate rather than a branch inside a command, which is what keeps
// `Execute` and the client's action picker asking the same question.

/**
 * §12 Pilot: whether the flight is there to be taken — the game's one
 * once-per-turn ability, and the only reason `pilotFlightUsed` is persisted.
 * Reset in `CheckEndTurn` alongside `actionsLeft`, so it refills at the start
 * of the Pilot's own turn rather than the end of somebody else's.
 */
export function pilotFlightAvailable(role: BannedIsletRoleId, pilotFlightUsed: boolean): boolean {
    return role === 'pilot' && !pilotFlightUsed;
}

/**
 * Where that flight can land: any surviving tile but the one already under the
 * pawn — "any tile on the island" (§12), which is what makes the Pilot the
 * answer to §5.1's severed island and the role the team plans around.
 *
 * Not gated on the role itself: `swimReach` reads it for a Pilot swept off a
 * tile, where the flight is free and unspent (§9.2), and the gate for the
 * *action* is `pilotFlightAvailable` above.
 */
export function pilotFlightTargets(island: BannedIsletIsland, position: number): number[] {
    return island
        .map((_, p) => p)
        .filter(p => p !== position && isStandable(island, p));
}

/** §12 Navigator: may spend an action on somebody else's pawn. Nobody else may touch another pawn at all. */
export function navigatorCanMoveOthers(role: BannedIsletRoleId): boolean {
    return role === 'navigator';
}

/**
 * §12 Navigator: where another player's pawn can be sent for one action — up
 * to `NAVIGATOR_STEPS` ordinary steps, each one legal on its own, so a two-step
 * route always has standable ground in the middle of it and never hops a hole.
 *
 * The steps use the **moved** pawn's geometry, not the Navigator's: an Explorer
 * sent by the Navigator still turns corners, because the diagonals are how that
 * pawn reads the island (§12) rather than something the Navigator does to it.
 * A Diver being sent does *not* get their swim, though — that is an action the
 * Diver spends, and the Navigator is spending their own.
 */
export function navigatorMoveTargets(island: BannedIsletIsland, from: number, movedRole: BannedIsletRoleId): number[] {
    const reached = new Set<number>();
    let frontier = [from];
    for (let step = 0; step < NAVIGATOR_STEPS; step++) {
        const next: number[] = [];
        for (const position of frontier) {
            for (const target of steppableFrom(island, position, movedRole)) {
                if (target === from || reached.has(target)) continue;
                reached.add(target);
                next.push(target);
            }
        }
        frontier = next;
    }
    return [...reached].sort((a, b) => a - b);
}

/** One pawn, as the two role rules that read the whole roster need it. */
export interface IBannedIsletPawn {
    userId: string;
    position: number;
}

/**
 * §8 Give a Treasure Card: who the sender can hand one to. Face to face by
 * default — the game's only transfer and deliberately a costly one — and
 * §12's Messenger is the exception that makes that rule matter, giving to
 * anybody anywhere and removing what §12 calls "the meet-in-person tax".
 *
 * Returns user ids rather than positions because this is the one action whose
 * target is a player instead of a tile.
 */
export function giveCardTargets(
    pawns: readonly IBannedIsletPawn[],
    senderId: string,
    role: BannedIsletRoleId,
): string[] {
    const sender = pawns.find(p => p.userId === senderId);
    if (!sender) return [];
    return pawns
        .filter(p => p.userId !== senderId && (role === 'messenger' || p.position === sender.position))
        .map(p => p.userId);
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

/** A player drowns: their tile sank and §9.2 leaves them nowhere to swim to — which for a Pilot or a Diver means the island itself has run out of land (§12). */
export function isDrowningLoss(island: BannedIsletIsland, position: number, role: BannedIsletRoleId): boolean {
    return resolveSwim(island, position, role) === null;
}

/** The sea wins: the meter has climbed to the skull (§11). */
export function isWaterLevelLoss(waterLevel: number): boolean {
    return waterLevel >= LOSING_WATER_LEVEL;
}

// ─── The win (§4.1) ─────────────────────────────────────────────────────────

/**
 * §4.1's first three conditions: all four treasures captured, Beacon Pier
 * still above water, and every pawn standing on it. The fourth — a Helicopter
 * Lift actually played — is what makes the win *an action taken rather than a
 * state reached*, which §4.1 calls the design's most memorable failure and
 * worth preserving; the card arrives in PR 8 (§21.6) and `CheckGameOver`
 * fires on these three alone until it does.
 *
 * `pawns` is every player's position, so a seat that has yet to reach the pier
 * holds the whole team on the island. An empty roster never escapes.
 */
export function isEscapeReady(
    island: BannedIsletIsland,
    captured: Record<BannedIsletTreasureId, boolean>,
    pawns: readonly number[],
): boolean {
    if (!TREASURES.every(t => captured[t.id])) return false;
    if (isPierLoss(island)) return false;
    const pier = pierPosition(island);
    return pawns.length > 0 && pawns.every(p => p === pier);
}
