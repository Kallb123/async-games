// Shared test fixtures for Banned Islet domain state — the island builder and
// the handful of named grid positions every test wants to talk about, plus a
// deterministic specificGameState to hang a command off. Same reasoning as
// Fires Out's testFixtures.ts: rules.test.ts wrote the island builder first
// and BannedIsletLogic.test.ts needs the same one, and a second copy is the
// signal to extract the first (AGENTS.md).
//
// Test-only. Nothing under src/app imports this.

import {
    ACTIONS_PER_TURN,
    TILE_IDS,
    TREASURE_IDS,
    positionAt,
    BannedIsletCardId,
    BannedIsletRoleId,
    BannedIsletTileId,
    BannedIsletTileState,
    BannedIsletTreasureId,
} from "./board";
import type { IBannedIsletPosition } from "./rules";
import type { IBannedIsletPlayerState, IBannedIsletSpecificGameState } from "./BannedIsletModels";

// The diamond, by (row, col), so a test can say where it means rather than
// counting positions: the top tip is (0,2)/(0,3) and the widest rows are 2
// and 3. `MIDDLE` is the one position with four dry neighbours to lose.
export const TOP_TIP = positionAt(0, 2)!;          // 0
export const TOP_TIP_EAST = positionAt(0, 3)!;     // 1
export const NORTH_WEST = positionAt(1, 1)!;       // 2
export const NORTH_OF_MIDDLE = positionAt(1, 2)!;  // 3
export const NORTH_EAST = positionAt(1, 3)!;       // 4
export const WEST_OF_MIDDLE = positionAt(2, 1)!;   // 7
export const MIDDLE = positionAt(2, 2)!;           // 8
export const EAST_OF_MIDDLE = positionAt(2, 3)!;   // 9
export const FAR_EAST = positionAt(2, 4)!;         // 10
export const SOUTH_OF_MIDDLE = positionAt(3, 2)!;  // 14

export const NOTHING_CAPTURED: Record<BannedIsletTreasureId, boolean> = {
    emberCrown: false, stormIdol: false, tideChalice: false, rootStone: false,
};

export interface IIslandOptions {
    /** Swap named tiles into the positions that matter to the test; the other 24 fall where they fall. */
    tiles?: Record<number, BannedIsletTileId>;
    flooded?: number[];
    sunk?: number[];
}

/** A whole dry island, with the listed tiles shuffled into the listed positions and the listed positions in the listed states. */
export function island(options: IIslandOptions = {}): IBannedIsletPosition[] {
    const positions: IBannedIsletPosition[] = TILE_IDS.map(tile => ({ tile, state: 'dry' as BannedIsletTileState }));
    for (const [position, tile] of Object.entries(options.tiles ?? {})) {
        const to = Number(position);
        const from = positions.findIndex(p => p.tile === tile);
        [positions[from].tile, positions[to].tile] = [positions[to].tile, positions[from].tile];
    }
    options.flooded?.forEach(p => { positions[p].state = 'flooded'; });
    options.sunk?.forEach(p => { positions[p].state = 'sunk'; });
    return positions;
}

export interface IPlayerOptions {
    hand?: BannedIsletCardId[];
    position?: number;
    role?: BannedIsletRoleId;
    actionsLeft?: number;
}

/**
 * A deterministic opening state: the island `options` describes, both decks
 * empty, nothing captured, and one pawn per entry in `players` — keyed by user
 * id, so a test names its own seats. buildInitialBannedIsletState's shuffles
 * are real RNG and aren't needed to exercise the action phase in isolation, and
 * the empty decks are deliberate: until PR 5 nothing draws from them.
 */
export function baseState(
    players: Record<string, IPlayerOptions>,
    options: IIslandOptions = {},
): IBannedIsletSpecificGameState {
    const positions = island(options);
    const playerStates = new Map<string, IBannedIsletPlayerState>();
    for (const [userId, player] of Object.entries(players)) {
        playerStates.set(userId, {
            hand: [...(player.hand ?? [])],
            position: player.position ?? MIDDLE,
            role: player.role ?? 'pilot',
            pilotFlightUsed: false,
            actionsLeft: player.actionsLeft ?? ACTIONS_PER_TURN,
        });
    }

    return {
        difficulty: 'normal',
        positions,
        waterLevel: 2,
        treasures: Object.fromEntries(TREASURE_IDS.map(id => [id, false])) as Record<BannedIsletTreasureId, boolean>,
        treasureDeck: [],
        treasureDiscard: [],
        floodDeck: [],
        floodDiscard: [],
        players: playerStates,
        phase: 'actions',
    };
}
