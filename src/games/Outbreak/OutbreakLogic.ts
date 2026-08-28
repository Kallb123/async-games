import type { IGameData } from "@/utils/mongodb/GameData";
import type { uuidString } from "@/utils/apiModels/GameDataApi";
import type { ICommandOutcome, IGameCommand, IGameType } from "@/utils/apiModels/gameCommand";
import { serializable } from "@/utils/apiModels/Serialisable";
import { v4 as uuidv4, NIL as NIL_UUID } from 'uuid';
import type { IOutbreakGameData, IOutbreakPlayerState, IOutbreakSpecificGameState } from "@/games/Outbreak/OutbreakModels";
import {
    CITIES,
    DISEASE_COLORS,
    DISEASE_COLOR_DEFS,
    MAX_RESEARCH_STATIONS,
    OutbreakDiseaseColor,
} from "@/games/Outbreak/board";
import {
    ACTIONS_PER_TURN,
    CUBES_PER_COLOR,
    OutbreakMoveType,
    canDiscoverCure,
    cureCardsRequired,
    getLegalMoves,
} from "@/games/Outbreak/rules";

// ═══════════════════════════════════════════════════════════════════════════
//  OUTBREAK
// ═══════════════════════════════════════════════════════════════════════════
//
// docs/games/outbreak-gdd.md §21.6 step 4: the action phase. One parameterised
// OutbreakAction covers all eight action kinds of §8 plus the pass-to-forfeit
// escape hatch, following §21.4's "four command classes, not fifteen" — the
// same shape as OutbreakEndTurn (§21.6 step 6) and OutbreakPlayEvent (step
// 10) will take. There is deliberately no draw or infect phase yet: nothing
// in this file can place a cube or empty a deck, so the game is winnable (cure
// all four diseases) and unloseable (none of §4.2's three defeat conditions
// can fire) until OutbreakEndTurn lands.

const INVALID: ICommandOutcome = { validMove: false, turnOver: false };

function playerState(gs: IOutbreakSpecificGameState, userId: string): IOutbreakPlayerState | undefined {
    return gs.players.get(userId);
}

function stationCities(gs: IOutbreakSpecificGameState): number[] {
    const ids: number[] = [];
    gs.cities.forEach((c, id) => { if (c.station) ids.push(id); });
    return ids;
}

const MOVE_VERB: Record<OutbreakMoveType, string> = {
    drive: 'drove',
    directFlight: 'flew direct',
    charterFlight: 'chartered a flight',
    shuttleFlight: 'took a shuttle',
};

// Drive/Ferry, Direct Flight, Charter Flight and Shuttle Flight (§8.1) all
// reduce to "is this among the legal moves rules.ts already computes for the
// client's action picker" — reusing getLegalMoves rather than re-deriving
// adjacency, hand and research-station eligibility a second time here.
function applyMove(
    gs: IOutbreakSpecificGameState,
    ps: IOutbreakPlayerState,
    moveType: OutbreakMoveType,
    destination: number,
): string | null {
    const legal = getLegalMoves({ currentCity: ps.city, hand: ps.hand, researchStations: stationCities(gs) });
    const move = legal.find(m => m.type === moveType && m.destination === destination);
    if (!move) return null;

    const fromName = CITIES[ps.city].name;
    if (move.discardCityId !== undefined) {
        ps.hand.splice(ps.hand.indexOf(move.discardCityId), 1);
        gs.playerDiscard.push(move.discardCityId);
    }
    ps.city = destination;

    return `${MOVE_VERB[moveType]} from ${fromName} to ${CITIES[destination].name}`;
}

// Build a Research Station (§8.2): discard the card matching the current
// city; relocate an existing station when all six are already placed.
function applyBuildStation(gs: IOutbreakSpecificGameState, ps: IOutbreakPlayerState, relocateFrom: number | null): string | null {
    const cityId = ps.city;
    if (gs.cities[cityId].station) return null;
    const cardIdx = ps.hand.indexOf(cityId);
    if (cardIdx === -1) return null;

    if (stationCities(gs).length >= MAX_RESEARCH_STATIONS) {
        if (relocateFrom === null || relocateFrom === cityId || !gs.cities[relocateFrom]?.station) return null;
        gs.cities[relocateFrom].station = false;
    }

    ps.hand.splice(cardIdx, 1);
    gs.playerDiscard.push(cityId);
    gs.cities[cityId].station = true;

    return relocateFrom !== null
        ? `built a research station in ${CITIES[cityId].name}, relocated from ${CITIES[relocateFrom].name}`
        : `built a research station in ${CITIES[cityId].name}`;
}

// Treat Disease (§8.2): remove 1 cube of a colour present in the current
// city, or — once that disease is cured — all of them in one action.
// Eradication (§8.3) follows immediately if that empties the board.
function applyTreatDisease(gs: IOutbreakSpecificGameState, ps: IOutbreakPlayerState, color: OutbreakDiseaseColor | null): string | null {
    if (!color) return null;
    const city = gs.cities[ps.city];
    const present = city.cubes[color];
    if (present <= 0) return null;

    const cured = gs.cures[color] !== 'none';
    const removed = cured ? present : 1;
    city.cubes[color] -= removed;
    gs.cubesLeft[color] += removed;
    if (gs.cures[color] === 'cured' && gs.cubesLeft[color] === CUBES_PER_COLOR) {
        gs.cures[color] = 'eradicated';
    }

    const colorName = DISEASE_COLOR_DEFS[color].name;
    return cured
        ? `cleared the last of ${colorName} from ${CITIES[ps.city].name}`
        : `treated a ${colorName} cube in ${CITIES[ps.city].name}`;
}

// Share Knowledge (§8.2): both players must be in the same city, and the card
// that moves must match it. Only the acting player's action is spent — the
// card may travel either direction between them.
function applyShareKnowledge(
    gs: IOutbreakSpecificGameState,
    senderId: string,
    ps: IOutbreakPlayerState,
    targetUserId: string | null,
    direction: 'give' | 'take' | null,
): string | null {
    if (!targetUserId || !direction || targetUserId === senderId) return null;
    const target = gs.players.get(targetUserId);
    if (!target || target.city !== ps.city) return null;

    const cardId = ps.city;
    const cityName = CITIES[cardId].name;

    if (direction === 'give') {
        const idx = ps.hand.indexOf(cardId);
        if (idx === -1) return null;
        ps.hand.splice(idx, 1);
        target.hand.push(cardId);
        return `shared the ${cityName} card with a teammate`;
    }

    const idx = target.hand.indexOf(cardId);
    if (idx === -1) return null;
    target.hand.splice(idx, 1);
    ps.hand.push(cardId);
    return `took the ${cityName} card from a teammate`;
}

// Discover a Cure (§8.2): at a research station, discard exactly
// cureCardsRequired() cards of one colour. Eradication (§8.3) follows
// immediately if that colour already has zero cubes on the board.
function applyCure(gs: IOutbreakSpecificGameState, ps: IOutbreakPlayerState, color: OutbreakDiseaseColor | null, cardIds: number[]): string | null {
    if (!color || gs.cures[color] !== 'none') return null;

    const chosen = [...new Set(cardIds)];
    const required = cureCardsRequired();
    if (chosen.length !== required) return null;
    if (!chosen.every(id => CITIES[id]?.color === color && ps.hand.includes(id))) return null;
    if (!canDiscoverCure({ atResearchStation: gs.cities[ps.city].station, handColorCount: chosen.length })) return null;

    for (const id of chosen) ps.hand.splice(ps.hand.indexOf(id), 1);
    gs.playerDiscard.push(...chosen);
    gs.cures[color] = gs.cubesLeft[color] === CUBES_PER_COLOR ? 'eradicated' : 'cured';

    return `discovered the cure for ${DISEASE_COLOR_DEFS[color].name} disease`;
}

// ─── Game type ──────────────────────────────────────────────────────────────

@serializable
export class OutbreakGameType implements IGameType {
    gameId: uuidString = uuidv4() as uuidString;
    gameType: string = "Outbreak";
    friendlyName: string = "Outbreak";
    icon: string = "";
    url: string = "outbreak";
    readonly className: string = "OutbreakGameType";

    CheckEndTurn(gameData: IGameData, commandOutcome: ICommandOutcome): void {
        if (!commandOutcome.turnOver) return;
        const outbreakData = gameData as IOutbreakGameData;
        const order = outbreakData.gameState.turnOrder;
        const next = order[(order.indexOf(outbreakData.currentTurn) + 1) % order.length];
        outbreakData.currentTurn = next;

        // actionsLeft refills at the *start* of the new current player's turn,
        // not the end of the previous one — see IOutbreakPlayerState.
        const nextPs = playerState(outbreakData.specificGameState, next);
        if (nextPs) nextPs.actionsLeft = ACTIONS_PER_TURN;
    }

    CheckGameOver(gameData: IGameData): boolean {
        const outbreakData = gameData as IOutbreakGameData;
        const gs = outbreakData.specificGameState;
        if (!DISEASE_COLORS.every(color => gs.cures[color] !== 'none')) return false;

        // §4.1: curing all four wins immediately, whatever cubes remain on the
        // board — a co-op result, so no single id can be the winner (§21.6
        // step 1's finishGame handles 'teamwin'/'teamloss' as one shared
        // ending for the whole roster).
        outbreakData.complete = true;
        outbreakData.winner = '';
        outbreakData.endReason = 'teamwin';
        outbreakData.currentTurn = '';
        outbreakData.gameState.history.unshift('All four diseases are cured — the team wins!');
        return true;
    }
}

// ─── OutbreakAction ─────────────────────────────────────────────────────────

export type OutbreakActionKind = OutbreakMoveType | 'buildStation' | 'treatDisease' | 'shareKnowledge' | 'cure' | 'pass';

@serializable
export class OutbreakAction implements IGameCommand {
    id: uuidString = uuidv4() as uuidString;
    timestamp: string = new Date().toISOString();
    gameId: uuidString = NIL_UUID as uuidString;
    senderId: string = 'Unknown';
    senderUsername: string = 'Unknown';
    kind: OutbreakActionKind = 'pass';
    /** Movement kinds: the city to move to. */
    destination: number = -1;
    /** buildStation: which existing station to relocate, once all six are placed. */
    relocateFrom: number | null = null;
    /** treatDisease / cure: which disease colour. */
    color: OutbreakDiseaseColor | null = null;
    /** shareKnowledge: the other player the city card moves to/from. */
    targetUserId: string | null = null;
    /** shareKnowledge: 'give' moves the card from the sender to the target; 'take' the reverse. */
    direction: 'give' | 'take' | null = null;
    /** cure: exactly cureCardsRequired() city-card ids of `color`, discarded to pay for it. */
    cardIds: number[] = [];
    readonly className = 'OutbreakAction';

    myString() { return `Outbreak Action kind=${this.kind} destination=${this.destination} color=${this.color}`; }

    async Execute(gameData: IGameData): Promise<ICommandOutcome> {
        const outbreakData = gameData as IOutbreakGameData;
        const gs = outbreakData.specificGameState;

        const ps = playerState(gs, this.senderId);
        if (!ps) return INVALID;
        if (gs.phase !== 'actions') return INVALID;
        if (ps.actionsLeft <= 0) return INVALID;

        let historyLine: string | null;
        switch (this.kind) {
            case 'drive':
            case 'directFlight':
            case 'charterFlight':
            case 'shuttleFlight':
                historyLine = applyMove(gs, ps, this.kind, this.destination);
                break;
            case 'buildStation':
                historyLine = applyBuildStation(gs, ps, this.relocateFrom);
                break;
            case 'treatDisease':
                historyLine = applyTreatDisease(gs, ps, this.color);
                break;
            case 'shareKnowledge':
                historyLine = applyShareKnowledge(gs, this.senderId, ps, this.targetUserId, this.direction);
                break;
            case 'cure':
                historyLine = applyCure(gs, ps, this.color, this.cardIds);
                break;
            case 'pass':
                historyLine = 'forfeited an action';
                break;
            default:
                historyLine = null;
        }
        if (historyLine === null) return INVALID;

        ps.actionsLeft -= 1;
        outbreakData.gameState.history.unshift(`${this.senderUsername} ${historyLine}`);

        return { validMove: true, turnOver: ps.actionsLeft <= 0 };
    }

    Undo(gameData: IGameData): void {
        gameData.gameState.commandHistory.pop();
    }
}
