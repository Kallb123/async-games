import { GameDataModel, IGameData, IGameDataDocument, publicGameState } from "@/utils/mongodb/GameData";
import { IInvitationData, IInvitationDataDocument, InvitationModel, IInvitationRequest } from "@/utils/mongodb/InvitationData";
import { Model, Schema, models } from "mongoose";
import { v4 as uuidv4 } from 'uuid';
import type { uuidString } from "@/utils/apiModels/GameDataApi";
import { userIdListToNamesAndMap } from "@/utils/users/clerk";
import { BannedIsletGameType } from "@/utils/apiModels/GameLogic";
import { shuffle } from "@/utils/games/shuffle";
import { clonePlayerStates, mongoMap } from "@/utils/games/mongoMaps";
import { userToken } from "@/utils/games/history";
import { pluralize } from "@/utils/ui/text";
import {
    IBannedIsletGameDataResponse,
    IBannedIsletSpecificGameStateResponse,
} from "./apiModels";
import {
    ACTIONS_PER_TURN,
    BannedIsletCardId,
    BannedIsletDifficulty,
    BannedIsletPhase,
    BannedIsletRoleId,
    BannedIsletTileId,
    BannedIsletTreasureId,
    ROLE_IDS,
    STARTING_HAND_SIZE,
    TILES_FLOODED_AT_SETUP,
    TILE_IDS,
    TREASURE_DECK_CARDS,
    TREASURE_IDS,
    roleDef,
    startWaterLevelFor,
    tileName,
} from "./board";
import { IBannedIsletPosition, positionOfTile } from "./rules";

// ═══════════════════════════════════════════════════════════════════════════
//  BANNED ISLET
// ═══════════════════════════════════════════════════════════════════════════
//
// docs/games/banned-islet.md §21.6 PR 2: the game can be created and its
// opening island read back. §21.4 fixes the state and command surface this
// file persists, and §6 the setup it performs.

// ─── Invitation ─────────────────────────────────────────────────────────────

export interface BannedIsletInvitationRequest extends IInvitationRequest {
    difficulty: BannedIsletDifficulty;
}

export interface IBannedIsletInvitationData extends IInvitationData {
    difficulty: BannedIsletDifficulty;
}

export interface IBannedIsletInvitationDataDocument extends IBannedIsletInvitationData, IInvitationDataDocument {}

export interface IBannedIsletInvitationDataModel extends Model<IBannedIsletInvitationDataDocument> {}

var BannedIsletInvitationSchema = new Schema<IBannedIsletInvitationDataDocument>({
    difficulty: String,
}, { discriminatorKey: 'kind' });
BannedIsletInvitationSchema.methods.CreateGame = async function(
    invite: IBannedIsletInvitationData,
    userIdList: string[],
) {
    console.log('CreateGame: Banned Islet game');

    const gameType = new BannedIsletGameType();
    const difficulty = this.difficulty as BannedIsletDifficulty;

    // §6 step 7: the first player is dealt at random, which is the same thing
    // as drawing the whole running order at random.
    const turnOrder = shuffle(userIdList);
    const specificGameState = buildInitialBannedIsletState(turnOrder, difficulty);

    // The roles are public (§2) and are the first thing a team plans around
    // (§12), so the setup log names them rather than leaving players to read
    // them off the board.
    const roleLine = turnOrder
        .map(userId => `${userToken(userId)} the ${roleDef(specificGameState.players.get(userId)!.role).name}`)
        .join(', ');

    const gameData: IBannedIsletGameData = {
        gameId: uuidv4() as uuidString,
        gameType,
        userIdList,
        turnTimer: this.turnTimer,
        currentTurn: turnOrder[0],
        lastTurnTimestamp: new Date().toISOString(),
        timerWarningNotificationSent: false,
        missedTurnCounts: new Map(),
        gameState: {
            turnOrder,
            history: [
                { text: `Setup: running order is ${turnOrder.map(userToken).join(' → ')}` },
                { text: `Setup: ${difficulty} difficulty — the water meter starts at level ${specificGameState.waterLevel}` },
                { text: `Setup: ${roleLine}` },
                { text: `Setup: ${pluralize(specificGameState.floodDiscard.length, 'tile')} already flooded — ${specificGameState.floodDiscard.map(tileName).join(', ')}` },
                { text: `Setup: each player dealt ${pluralize(STARTING_HAND_SIZE, 'card')}` },
            ],
            commandHistory: [],
        },
        complete: false,
        winner: '',
        specificGameState,
        initialSpecificGameState: cloneBannedIsletState(specificGameState, turnOrder),
    };
    return gameData;
};
export var BannedIsletInvitationModel =
    models.BannedIsletInvitation ||
    InvitationModel.discriminator<IBannedIsletInvitationDataDocument, IBannedIsletInvitationDataModel>('BannedIsletInvitation', BannedIsletInvitationSchema);

// ─── Player / specific state (§21.4) ────────────────────────────────────────

export interface IBannedIsletPlayerState {
    // Public throughout, never redacted per viewer — §2's "shared table,
    // shared brain" pillar, the same call Outbreak makes.
    hand: BannedIsletCardId[];
    // A grid index, not a tile id (§21.4): movement, adjacency and swimming
    // are all spatial, and storing the tile would mean resolving the position
    // from it on every single legality check.
    position: number;
    role: BannedIsletRoleId;
    // Refills at the *start* of this player's own turn, not the end of the
    // previous one (§21.4) — what lets a plan cross from one player to the
    // next without stalling on an exhausted counter.
    pilotFlightUsed: boolean;
    actionsLeft: number;
}

export interface IBannedIsletSpecificGameState {
    difficulty: BannedIsletDifficulty;
    // 24 entries, indexed by GRID POSITION; `tile` names which of the 24 named
    // tiles was shuffled into that position at setup (§5.1).
    positions: IBannedIsletPosition[];
    waterLevel: number;
    treasures: Record<BannedIsletTreasureId, boolean>;
    treasureDeck: BannedIsletCardId[];  // top first — redacted to a count
    treasureDiscard: BannedIsletCardId[];  // public
    floodDeck: BannedIsletTileId[];     // top first — redacted to a count
    floodDiscard: BannedIsletTileId[];  // public, and the most-read thing on screen
    players: Map<string, IBannedIsletPlayerState>;
    phase: BannedIsletPhase;
}

function clonePlayerState(ps: IBannedIsletPlayerState): IBannedIsletPlayerState {
    return {
        hand: [...ps.hand],
        position: ps.position,
        role: ps.role,
        pilotFlightUsed: ps.pilotFlightUsed,
        actionsLeft: ps.actionsLeft,
    };
}

// Deep-clones a Banned Islet state into independent plain objects, rebuilding
// the player map in `userIdList` order (see clonePlayerStates) — the same call
// Outbreak's cloneOutbreakState makes, and for the same reason: the tile
// layout, both decks and the role deal are all randomised at creation and
// cannot be reconstructed later, so turn recap replays from a persisted
// snapshot instead (§21.4, "Recorded randomness").
export function cloneBannedIsletState(
    gs: IBannedIsletSpecificGameState,
    userIdList: string[],
): IBannedIsletSpecificGameState {
    return {
        difficulty: gs.difficulty,
        positions: gs.positions.map(p => ({ tile: p.tile, state: p.state })),
        waterLevel: gs.waterLevel,
        treasures: { ...gs.treasures },
        treasureDeck: [...gs.treasureDeck],
        treasureDiscard: [...gs.treasureDiscard],
        floodDeck: [...gs.floodDeck],
        floodDiscard: [...gs.floodDiscard],
        players: clonePlayerStates(gs.players, userIdList, clonePlayerState),
        phase: gs.phase,
    };
}

/**
 * The opening island of §6, every shuffle of it recorded into the state it
 * returns so replay is deterministic from day one:
 *
 * 1. the 24 named tiles shuffled into the 24 grid positions, dry side up —
 *    which is where the game's replay value lives (§5.1: Beacon Pier may be
 *    dead centre or hanging off a corner);
 * 2. the flood deck shuffled and its top six flipped, flooding those tiles and
 *    leaving their cards in the flood discard;
 * 3. the four treasures uncaptured;
 * 4. one role each, dealt at random, each pawn on that role's own start tile —
 *    flooded or not, since a flooded tile is standable (§9.1);
 * 5. two cards each from the treasure deck **with the three Waters Rise! cards
 *    set aside**, shuffled back in afterwards, so nobody starts the game
 *    already drowning;
 * 6. the water meter on the difficulty's start level (§13).
 */
export function buildInitialBannedIsletState(
    turnOrder: string[],
    difficulty: BannedIsletDifficulty,
): IBannedIsletSpecificGameState {
    // Step 1. The grid is fixed and the tiles are not: position i holds
    // whichever tile the shuffle dealt into it.
    const positions: IBannedIsletPosition[] = shuffle([...TILE_IDS]).map(tile => ({ tile, state: 'dry' as const }));

    // Step 2. One flood card per tile; the top six flood their tiles and go to
    // the discard, where they are already the team's first forecast (§14.2).
    const floodDeck = shuffle([...TILE_IDS]);
    const floodDiscard = floodDeck.splice(0, TILES_FLOODED_AT_SETUP);
    for (const tile of floodDiscard) {
        positions[positionOfTile(positions, tile)].state = 'flooded';
    }

    // Step 5. Deal from the deck with the Waters Rise! cards held out, then
    // shuffle them back in — §6 step 5's variance control, and the same
    // instinct as Outbreak's pile-built deck.
    const dealable = shuffle(TREASURE_DECK_CARDS.filter(card => card !== 'watersRise'));
    const watersRise = TREASURE_DECK_CARDS.filter(card => card === 'watersRise');

    // Step 4. One role card at random per player. Six roles against a
    // four-seat cap, so the spares simply stay in the box.
    const roles = shuffle([...ROLE_IDS]);
    const players = new Map<string, IBannedIsletPlayerState>();
    turnOrder.forEach((userId, seat) => {
        const role = roles[seat];
        players.set(userId, {
            hand: dealable.splice(0, STARTING_HAND_SIZE),
            position: positionOfTile(positions, roleDef(role).startTile),
            role,
            pilotFlightUsed: false,
            actionsLeft: ACTIONS_PER_TURN,
        });
    });

    return {
        difficulty,
        positions,
        waterLevel: startWaterLevelFor(difficulty),
        treasures: Object.fromEntries(TREASURE_IDS.map(id => [id, false])) as Record<BannedIsletTreasureId, boolean>,
        treasureDeck: shuffle([...dealable, ...watersRise]),
        treasureDiscard: [],
        floodDeck,
        floodDiscard,
        players,
        phase: 'actions',
    };
}

// Rebuilds the starting state for turn recap: everything above is randomised
// at creation, so — like Outbreak, World Domination and Train Time — replay
// clones the persisted snapshot rather than re-deriving it. Rebuilds the
// player map in `gameState.turnOrder` order, the order it was dealt in.
export function buildInitialBannedIsletStateFromGameData(gameData: IBannedIsletGameData): IBannedIsletSpecificGameState {
    return cloneBannedIsletState(gameData.initialSpecificGameState, gameData.gameState.turnOrder);
}

// ─── Game data interfaces ───────────────────────────────────────────────────

export interface IBannedIsletGameData extends IGameData {
    specificGameState: IBannedIsletSpecificGameState;
    // Immutable copy of the starting (post-deal) state, persisted at creation
    // so turn recap can replay from it — see cloneBannedIsletState above.
    initialSpecificGameState: IBannedIsletSpecificGameState;
}

export interface IBannedIsletGameDataDocument extends IBannedIsletGameData, IGameDataDocument {}

export interface IBannedIsletGameDataModel extends Model<IBannedIsletGameDataDocument> {}

// ─── Mongoose schema ─────────────────────────────────────────────────────────

function makeBannedIsletStateSchemaDef() {
    return {
        difficulty: String,
        positions: [{ tile: String, state: String }],
        waterLevel: Number,
        treasures: { emberCrown: Boolean, stormIdol: Boolean, tideChalice: Boolean, rootStone: Boolean },
        treasureDeck: [String],
        treasureDiscard: [String],
        floodDeck: [String],
        floodDiscard: [String],
        players: {
            type: Schema.Types.Map,
            of: {
                hand: [String],
                position: Number,
                role: String,
                pilotFlightUsed: { type: Boolean, default: false },
                actionsLeft: Number,
            },
        },
        phase: String,
    };
}

var BannedIsletGameDataSchema = new Schema<IBannedIsletGameDataDocument>(
    {
        specificGameState: makeBannedIsletStateSchemaDef(),
        initialSpecificGameState: makeBannedIsletStateSchemaDef(),
    },
    { discriminatorKey: 'kind' },
);

BannedIsletGameDataSchema.methods.CreateDataResponse = async function(viewerId: string | null): Promise<IBannedIsletGameDataResponse> {
    console.log('CreateDataResponse: Banned Islet game');

    const doc: IBannedIsletGameData = this as IBannedIsletGameData;
    const { usernameList, userIdNameMap } = await userIdListToNamesAndMap(doc.userIdList);

    return {
        gameType: doc.gameType,
        usernameList,
        userIdList: doc.userIdList,
        turnTimer: doc.turnTimer,
        currentTurn: doc.currentTurn,
        gameState: publicGameState(doc.gameState, userIdNameMap),
        complete: doc.complete,
        winner: doc.winner,
        endReason: doc.endReason,
        // Which of §4.2's four losses it was — 'teamloss' alone doesn't say.
        endDetail: doc.endDetail,
        forfeitedBy: doc.forfeitedBy,
        specificGameState: gameStateToModel(doc.specificGameState, userIdNameMap, viewerId),
        recapAvailable: !!doc.initialSpecificGameState,
    };
};

// `_viewerId` is unused: §2 makes every hand public, so — unlike World
// Domination's cards or Train Time's tickets — nothing here is redacted per
// viewer. What *is* redacted is redacted from everybody: both deck orders go
// over the wire as counts, because which tile drowns next is the one thing the
// whole design is about not knowing (§21.4). Both discards stay public, and
// must be rendered rather than hidden — reading the flood discard is the skill
// §14.2 rewards. Kept in the signature to match the shared
// CreateDataResponse contract (see GameData.ts).
export function gameStateToModel(
    gs: IBannedIsletSpecificGameState,
    userIdNameMap: { [key: string]: string },
    _viewerId: string | null,
): IBannedIsletSpecificGameStateResponse {
    const playerStates: IBannedIsletSpecificGameStateResponse['playerStates'] = {};
    for (const [userId, ps] of mongoMap(gs.players)) {
        playerStates[userId] = {
            userId,
            username: userIdNameMap[userId] ?? userId,
            hand: [...ps.hand],
            position: ps.position,
            role: ps.role,
            actionsLeft: ps.actionsLeft,
            pilotFlightUsed: ps.pilotFlightUsed,
        };
    }

    return {
        difficulty: gs.difficulty,
        positions: gs.positions.map(p => ({ tile: p.tile, state: p.state })),
        waterLevel: gs.waterLevel,
        treasures: { ...gs.treasures },
        treasureDeckCount: gs.treasureDeck.length,
        treasureDiscard: [...gs.treasureDiscard],
        floodDeckCount: gs.floodDeck.length,
        floodDiscard: [...gs.floodDiscard],
        playerStates,
        phase: gs.phase,
    };
}

export var BannedIsletGameDataModel =
    models.BannedIsletGameData ||
    GameDataModel.discriminator<IBannedIsletGameDataDocument, IBannedIsletGameDataModel>('BannedIsletGameData', BannedIsletGameDataSchema);
