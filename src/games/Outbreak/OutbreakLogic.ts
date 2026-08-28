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
    CARDS_DRAWN_PER_TURN,
    CUBES_PER_COLOR,
    HAND_LIMIT,
    OutbreakMoveType,
    canDiscoverCure,
    cureCardsRequired,
    getLegalMoves,
    infectionRateFor,
    isOutbreakCascadeLoss,
    isPlayerDeckEmptyLoss,
    placeCubeOrOutbreak,
    stationCityIds,
} from "@/games/Outbreak/rules";

// ═══════════════════════════════════════════════════════════════════════════
//  OUTBREAK
// ═══════════════════════════════════════════════════════════════════════════
//
// docs/games/outbreak-gdd.md §21.6 step 4 added the action phase: one
// parameterised OutbreakAction covering all eight action kinds of §8 plus the
// pass-to-forfeit escape hatch, following §21.4's "four command classes, not
// fifteen". Step 6 (this file, now) adds OutbreakEndTurn and OutbreakDiscard —
// the draw and infect phases — which is what makes the game loseable: none of
// §4.2's three defeat conditions could fire before this, since nothing could
// place a cube or empty a deck. OutbreakAction therefore never ends a turn
// itself any more (§21.4: "the fourth action returns turnOver: false"); only
// OutbreakEndTurn (and, when the draw pushes a hand over the limit,
// OutbreakDiscard) can — and OutbreakEndTurn is the *only* command that
// touches a deck, which is the invariant step 13's crew planner is built on.

const INVALID: ICommandOutcome = { validMove: false, turnOver: false };

function playerState(gs: IOutbreakSpecificGameState, userId: string): IOutbreakPlayerState | undefined {
    return gs.players.get(userId);
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
    const legal = getLegalMoves({ currentCity: ps.city, hand: ps.hand, researchStations: stationCityIds(gs.cities) });
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

    if (stationCityIds(gs.cities).length >= MAX_RESEARCH_STATIONS) {
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
        // Every §4.2 loss (an empty player deck on a draw, a colour's supply
        // running out mid-outbreak, the outbreak marker reaching the
        // threshold) can only be detected mid-resolution, inside
        // OutbreakEndTurn.Execute — so it already mutates
        // complete/winner/endReason/currentTurn directly there (see
        // endInTeamLoss), the same thing this method does for a win, below.
        // This is just the pass-through so the command route, which calls
        // CheckGameOver after every command uniformly, notices.
        if (outbreakData.complete) return true;

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

        // Never ends the turn itself, even on the fourth action (§21.4): only
        // OutbreakEndTurn (and, past the hand limit, OutbreakDiscard) may —
        // folding the draw/infect phases in here would make it impossible for
        // step 13's crew planner to cross from one player's actions to the
        // next without firing the deck.
        return { validMove: true, turnOver: false };
    }

    Undo(gameData: IGameData): void {
        gameData.gameState.commandHistory.pop();
    }
}

// ─── The draw and infect phases (§7 Phase 2-3, §9-10, §21.6 step 6) ────────

// Ends the game in a shared defeat (§4.2), the moment one of the three loss
// conditions is detected — mirroring what CheckGameOver already does for a
// win (OutbreakGameType.CheckGameOver, above), since a loss can only be
// noticed here, mid-resolution, rather than re-derived afterwards from state.
function endInTeamLoss(outbreakData: IOutbreakGameData, reason: string): void {
    outbreakData.complete = true;
    outbreakData.winner = '';
    outbreakData.endReason = 'teamloss';
    outbreakData.currentTurn = '';
    outbreakData.gameState.history.unshift(`The team loses — ${reason}.`);
}

// Phase 3 (§10): draw infection cards equal to the current rate (fixed at 2
// until epidemics land in §21.6 step 8), placing 1 cube per card and
// resolving outbreaks and chains. Stops the instant a §4.2 loss condition
// fires (cube exhaustion or the outbreak marker reaching 8) rather than
// finishing the remaining draws (§16). Returns early — before placing
// anything — if the game already ended in the draw/discard step above it.
function resolveInfectPhase(outbreakData: IOutbreakGameData): void {
    if (outbreakData.complete) return;
    const gs = outbreakData.specificGameState;
    const rate = infectionRateFor(gs.infectionRateIndex);

    for (let i = 0; i < rate; i++) {
        // Nothing recycles the infection discard into the deck until
        // Intensify lands (§21.6 step 8) — a long enough game could in
        // principle run it dry. Rather than invent unrecorded randomness to
        // paper over that, the infect phase simply has fewer cards to draw
        // that turn.
        if (gs.infectionDeck.length === 0) break;

        const cityId = gs.infectionDeck.shift()!;
        const color = CITIES[cityId].color;
        gs.infectionDiscard.push(cityId);

        // §8.3/§16: an eradicated disease's cards are drawn and discarded
        // with no effect — nothing is placed and it can't outbreak.
        if (gs.cures[color] === 'eradicated') continue;

        const cubes = gs.cities.map(c => c.cubes);
        const result = placeCubeOrOutbreak(cubes, cityId, color, new Set(), gs.cubesLeft);
        gs.cities.forEach((c, id) => { c.cubes = result.cubes[id]; });
        if (result.cubesLeft) gs.cubesLeft = result.cubesLeft;
        gs.outbreaks += result.outbreaks;

        outbreakData.gameState.history.unshift(
            result.outbreaks > 0
                ? `outbreak in ${CITIES[cityId].name}! It spreads to ${result.outbrokenCities.map(id => CITIES[id].name).join(', ')}`
                : `infected ${CITIES[cityId].name} with ${DISEASE_COLOR_DEFS[color].name}`,
        );

        if (result.cubeExhausted) {
            endInTeamLoss(outbreakData, `no ${DISEASE_COLOR_DEFS[color].name} cubes remain in supply`);
            return;
        }
        if (isOutbreakCascadeLoss(gs.outbreaks)) {
            endInTeamLoss(outbreakData, `the outbreak marker reached ${gs.outbreaks}`);
            return;
        }
    }
}

// ─── OutbreakEndTurn ────────────────────────────────────────────────────────

@serializable
export class OutbreakEndTurn implements IGameCommand {
    id: uuidString = uuidv4() as uuidString;
    timestamp: string = new Date().toISOString();
    gameId: uuidString = NIL_UUID as uuidString;
    senderId: string = 'Unknown';
    senderUsername: string = 'Unknown';
    readonly className = 'OutbreakEndTurn';

    myString() { return `Outbreak EndTurn`; }

    async Execute(gameData: IGameData): Promise<ICommandOutcome> {
        const outbreakData = gameData as IOutbreakGameData;
        const gs = outbreakData.specificGameState;

        const ps = playerState(gs, this.senderId);
        if (!ps) return INVALID;
        if (gs.phase !== 'actions') return INVALID;
        if (ps.actionsLeft > 0) return INVALID;

        // Phase 2 (§7, §9): draw two, losing immediately if the deck can't
        // supply one.
        for (let i = 0; i < CARDS_DRAWN_PER_TURN; i++) {
            if (isPlayerDeckEmptyLoss(gs.playerDeck.length)) {
                endInTeamLoss(outbreakData, `${this.senderUsername} had to draw with the player deck empty`);
                return { validMove: true, turnOver: true };
            }
            ps.hand.push(gs.playerDeck.shift()!);
        }
        outbreakData.gameState.history.unshift(`${this.senderUsername} drew 2 cards`);

        // Hand limit (§9, §16): over it, the turn pauses for OutbreakDiscard
        // rather than infecting yet — the discard step comes before Phase 3.
        if (ps.hand.length > HAND_LIMIT) {
            gs.phase = 'discard';
            outbreakData.gameState.history.unshift(`${this.senderUsername} must discard down to ${HAND_LIMIT} cards`);
            return { validMove: true, turnOver: false };
        }

        resolveInfectPhase(outbreakData);
        return { validMove: true, turnOver: true };
    }

    Undo(gameData: IGameData): void {
        gameData.gameState.commandHistory.pop();
    }
}

// ─── OutbreakDiscard ────────────────────────────────────────────────────────

@serializable
export class OutbreakDiscard implements IGameCommand {
    id: uuidString = uuidv4() as uuidString;
    timestamp: string = new Date().toISOString();
    gameId: uuidString = NIL_UUID as uuidString;
    senderId: string = 'Unknown';
    senderUsername: string = 'Unknown';
    /** City-card ids to discard, down to HAND_LIMIT. */
    cardIds: number[] = [];
    readonly className = 'OutbreakDiscard';

    myString() { return `Outbreak Discard cardIds=${this.cardIds.join(',')}`; }

    async Execute(gameData: IGameData): Promise<ICommandOutcome> {
        const outbreakData = gameData as IOutbreakGameData;
        const gs = outbreakData.specificGameState;

        const ps = playerState(gs, this.senderId);
        if (!ps) return INVALID;
        if (gs.phase !== 'discard') return INVALID;

        const chosen = [...new Set(this.cardIds)];
        if (chosen.length === 0) return INVALID;
        if (!chosen.every(id => ps.hand.includes(id))) return INVALID;
        // Must reach the limit, but no further than it — the same short-of
        // or past-it rejection OutbreakAction's cure applies to its own count.
        if (ps.hand.length - chosen.length !== HAND_LIMIT) return INVALID;

        for (const id of chosen) ps.hand.splice(ps.hand.indexOf(id), 1);
        gs.playerDiscard.push(...chosen);
        gs.phase = 'actions';

        outbreakData.gameState.history.unshift(
            `${this.senderUsername} discarded ${chosen.length} card${chosen.length === 1 ? '' : 's'} down to the hand limit`,
        );

        resolveInfectPhase(outbreakData);
        return { validMove: true, turnOver: true };
    }

    Undo(gameData: IGameData): void {
        gameData.gameState.commandHistory.pop();
    }
}
