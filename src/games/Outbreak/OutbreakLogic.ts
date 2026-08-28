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
    EPIDEMIC_CARD_ID,
    EVENT_CARD_AIRLIFT,
    EVENT_CARD_FORECAST,
    EVENT_CARD_GOVERNMENT_GRANT,
    EVENT_CARD_ONE_QUIET_NIGHT,
    EVENT_CARD_RESILIENT_POPULATION,
    eventCardName,
    isCityCardId,
    isEventCardId,
    MAX_RESEARCH_STATIONS,
    OutbreakDiseaseColor,
} from "@/games/Outbreak/board";
import {
    ACTIONS_PER_TURN,
    CARDS_DRAWN_PER_TURN,
    CUBES_PER_COLOR,
    HAND_LIMIT,
    INFECTION_RATE_TRACK,
    IOutbreakChainResult,
    OutbreakMoveType,
    canDiscoverCure,
    cureCardsRequired,
    dispatcherCanControlOthers,
    getLegalMoves,
    infectionRateFor,
    IOutbreakInfectionLogEntry,
    isOutbreakCascadeLoss,
    isPlayerDeckEmptyLoss,
    isProtectedByQuarantine,
    medicAutoClearColors,
    opsExpertBuildsFree,
    placeCubeOrOutbreak,
    placeEpidemicCubesOrOutbreak,
    shareKnowledgeCardMatchRequired,
    stationCityIds,
    treatDiseaseRemovalCount,
} from "@/games/Outbreak/rules";
import { shuffle } from "@/utils/games/shuffle";

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

// Removes `count` cubes of `color` from `cityId`, restocks the supply, and
// runs the eradication check (§8.3) that both Treat Disease and the Medic's
// automatic clearing share — the one place that decrements a city's cubes.
function removeCubes(gs: IOutbreakSpecificGameState, cityId: number, color: OutbreakDiseaseColor, count: number): void {
    gs.cities[cityId].cubes[color] -= count;
    gs.cubesLeft[color] += count;
    if (gs.cures[color] === 'cured' && gs.cubesLeft[color] === CUBES_PER_COLOR) {
        gs.cures[color] = 'eradicated';
    }
}

// On entry: checks every colour cured at `ps`'s (new) city at once, since a
// single move can walk her into a city carrying more than one cured colour.
// Called from applyMove, applyDispatcherRelocate and applyOpsExpertFlight,
// whoever ends up moving her — rules.ts only decides *which* colours qualify
// (medicAutoClearColors).
function applyMedicAutoClearOnEntry(gs: IOutbreakSpecificGameState, ps: IOutbreakPlayerState): string | null {
    const colors = medicAutoClearColors(ps.role, gs.cities[ps.city].cubes, gs.cures);
    if (colors.length === 0) return null;
    for (const color of colors) removeCubes(gs, ps.city, color, gs.cities[ps.city].cubes[color]);
    return `the Medic automatically clears ${colors.map(c => DISEASE_COLOR_DEFS[c].name).join(', ')} from ${CITIES[ps.city].name}`;
}

// Appends applyMedicAutoClearOnEntry's note to `base`, if any — the common
// tail of every command that can move her pawn (applyMove,
// applyDispatcherRelocate, applyOpsExpertFlight).
function withMedicNote(gs: IOutbreakSpecificGameState, ps: IOutbreakPlayerState, base: string): string {
    const medicNote = applyMedicAutoClearOnEntry(gs, ps);
    return medicNote ? `${base} — ${medicNote}` : base;
}

// Stationary sweep: `color` just became cured (applyCure) or was just placed
// on the board while already cured (applyPlacementResult) — either way, any
// Medic already standing in a city holding it clears it on the spot.
function applyMedicAutoClearForColor(gs: IOutbreakSpecificGameState, color: OutbreakDiseaseColor): string[] {
    if (gs.cures[color] === 'none') return [];
    const notes: string[] = [];
    for (const ps of gs.players.values()) {
        if (medicAutoClearColors(ps.role, gs.cities[ps.city].cubes, gs.cures).includes(color)) {
            removeCubes(gs, ps.city, color, gs.cities[ps.city].cubes[color]);
            notes.push(`the Medic automatically clears ${DISEASE_COLOR_DEFS[color].name} from ${CITIES[ps.city].name}`);
        }
    }
    return notes;
}

// Quarantine Specialist (§11, §16): at most one player holds this role, so
// her current city (or null if nobody does) is all placeCubeOrOutbreak and
// placeEpidemicCubesOrOutbreak need to know. Returns the predicate directly,
// since both of resolveInfectPhase and resolveEpidemic want the same wrapping.
function quarantinePredicate(gs: IOutbreakSpecificGameState): (cityId: number) => boolean {
    let city: number | null = null;
    for (const ps of gs.players.values()) {
        if (ps.role === 'quarantineSpecialist') { city = ps.city; break; }
    }
    return cityId => isProtectedByQuarantine(city, cityId);
}

// Drive/Ferry, Direct Flight, Charter Flight and Shuttle Flight (§8.1) all
// reduce to "is this among the legal moves rules.ts already computes for the
// client's action picker" — reusing getLegalMoves rather than re-deriving
// adjacency, hand and research-station eligibility a second time here.
//
// `actingPs` and `movingPs` differ only for the Dispatcher (§11): she pays
// with her own actions and hand while another player's pawn is the one that
// actually moves — legality (adjacency, the destination card, the station
// network) is computed against the *mover's* city, but any discard comes out
// of the *actor's* hand.
function applyMove(
    gs: IOutbreakSpecificGameState,
    actingPs: IOutbreakPlayerState,
    movingPs: IOutbreakPlayerState,
    moveType: OutbreakMoveType,
    destination: number,
): string | null {
    const legal = getLegalMoves({ currentCity: movingPs.city, hand: actingPs.hand, researchStations: stationCityIds(gs.cities) });
    const move = legal.find(m => m.type === moveType && m.destination === destination);
    if (!move) return null;

    const fromName = CITIES[movingPs.city].name;
    if (move.discardCityId !== undefined) {
        actingPs.hand.splice(actingPs.hand.indexOf(move.discardCityId), 1);
        gs.playerDiscard.push(move.discardCityId);
    }
    movingPs.city = destination;
    movingPs.timesTravelled += 1;

    const verb = actingPs === movingPs ? MOVE_VERB[moveType] : `dispatched a teammate's pawn (${MOVE_VERB[moveType]})`;
    return withMedicNote(gs, movingPs, `${verb} from ${fromName} to ${CITIES[destination].name}`);
}

// Dispatcher (§11), second half: move any pawn — including her own — to a
// city already occupied by another pawn. No card, no adjacency requirement;
// just 1 action.
function applyDispatcherRelocate(
    gs: IOutbreakSpecificGameState,
    ps: IOutbreakPlayerState,
    targetUserId: string | null,
    destination: number,
): string | null {
    if (!dispatcherCanControlOthers(ps.role)) return null;
    if (!targetUserId) return null;
    const target = gs.players.get(targetUserId);
    if (!target || destination === target.city) return null;
    const occupied = [...gs.players.values()].some(p => p !== target && p.city === destination);
    if (!occupied) return null;

    const fromName = CITIES[target.city].name;
    target.city = destination;
    target.timesTravelled += 1;
    return withMedicNote(gs, target, `dispatched a teammate's pawn from ${fromName} to ${CITIES[destination].name}`);
}

// Operations Expert (§11), second half: once per turn, fly from a research
// station to any city by discarding any city card — Charter Flight without
// the "must match your current city" constraint, and without needing the
// destination to be a station too.
function applyOpsExpertFlight(
    gs: IOutbreakSpecificGameState,
    ps: IOutbreakPlayerState,
    destination: number,
    cardId: number | null,
): string | null {
    if (ps.role !== 'opsExpert') return null;
    if (ps.opsExpertFlightUsed) return null;
    if (!gs.cities[ps.city].station) return null;
    if (cardId === null || destination === ps.city || !ps.hand.includes(cardId)) return null;

    ps.hand.splice(ps.hand.indexOf(cardId), 1);
    gs.playerDiscard.push(cardId);
    const fromName = CITIES[ps.city].name;
    ps.city = destination;
    ps.opsExpertFlightUsed = true;
    ps.timesTravelled += 1;

    return withMedicNote(gs, ps, `flew from the research station in ${fromName} to ${CITIES[destination].name}`);
}

// Places a research station at `cityId`, honouring the shared 6-station cap
// and relocation rule (§5, §8.2) — the one piece Build a Research Station and
// Government Grant (§12) actually share; they differ only in cost (a
// discarded card vs free) and in whether the target must be the acting
// player's own city. Returns false, mutating nothing, when the cap requires
// relocating and `relocateFrom` doesn't name a real, distinct, currently
// stationed city.
function placeStation(gs: IOutbreakSpecificGameState, cityId: number, relocateFrom: number | null): boolean {
    if (stationCityIds(gs.cities).length >= MAX_RESEARCH_STATIONS) {
        if (relocateFrom === null || relocateFrom === cityId || !gs.cities[relocateFrom]?.station) return false;
        gs.cities[relocateFrom].station = false;
    }
    gs.cities[cityId].station = true;
    return true;
}

// Build a Research Station (§8.2, §11 Operations Expert): discard the card
// matching the current city; relocate an existing station when all six are
// already placed. The Operations Expert waives the discard entirely.
function applyBuildStation(gs: IOutbreakSpecificGameState, ps: IOutbreakPlayerState, relocateFrom: number | null): string | null {
    const cityId = ps.city;
    if (gs.cities[cityId].station) return null;
    const free = opsExpertBuildsFree(ps.role);
    const cardIdx = ps.hand.indexOf(cityId);
    if (!free && cardIdx === -1) return null;
    if (!placeStation(gs, cityId, relocateFrom)) return null;

    if (!free) {
        ps.hand.splice(cardIdx, 1);
        gs.playerDiscard.push(cityId);
    }

    const suffix = free ? ' for free' : '';
    return relocateFrom !== null
        ? `built a research station in ${CITIES[cityId].name}${suffix}, relocated from ${CITIES[relocateFrom].name}`
        : `built a research station in ${CITIES[cityId].name}${suffix}`;
}

// Treat Disease (§8.2, §11 Medic): remove 1 cube of a colour present in the
// current city, or — once that disease is cured, or for the Medic always —
// all of them in one action. Eradication (§8.3) follows immediately if that
// empties the board.
function applyTreatDisease(gs: IOutbreakSpecificGameState, ps: IOutbreakPlayerState, color: OutbreakDiseaseColor | null): string | null {
    if (!color) return null;
    const city = gs.cities[ps.city];
    const present = city.cubes[color];
    if (present <= 0) return null;

    const cured = gs.cures[color] !== 'none';
    const removed = treatDiseaseRemovalCount(cured, present, ps.role);
    removeCubes(gs, ps.city, color, removed);
    ps.cubesTreated += removed;

    const colorName = DISEASE_COLOR_DEFS[color].name;
    if (cured) return `cleared the last of ${colorName} from ${CITIES[ps.city].name}`;
    return removed > 1
        ? `cleared all ${removed} ${colorName} cubes from ${CITIES[ps.city].name}`
        : `treated a ${colorName} cube in ${CITIES[ps.city].name}`;
}

// Share Knowledge (§8.2, §11 Researcher): both players must be in the same
// city, and the card that moves must match it — unless it's leaving the
// Researcher's own hand (given by her, or taken from her), in which case any
// city card she holds qualifies. Only the acting player's action is spent —
// the card may travel either direction between them. `cardId` defaults to
// the shared city's own card, i.e. exactly the base rule, when omitted.
function applyShareKnowledge(
    gs: IOutbreakSpecificGameState,
    senderId: string,
    ps: IOutbreakPlayerState,
    targetUserId: string | null,
    direction: 'give' | 'take' | null,
    cardId: number | null,
): string | null {
    if (!targetUserId || !direction || targetUserId === senderId) return null;
    const target = gs.players.get(targetUserId);
    if (!target || target.city !== ps.city) return null;

    const giver = direction === 'give' ? ps : target;
    const receiver = direction === 'give' ? target : ps;
    const chosenCardId = cardId ?? ps.city;
    // §11: even the Researcher's exemption only reaches "any city card" —
    // event and epidemic card ids are never a valid Share Knowledge payload.
    if (!isCityCardId(chosenCardId)) return null;
    if (shareKnowledgeCardMatchRequired(giver.role) && chosenCardId !== ps.city) return null;

    const idx = giver.hand.indexOf(chosenCardId);
    if (idx === -1) return null;
    giver.hand.splice(idx, 1);
    receiver.hand.push(chosenCardId);

    const cityName = CITIES[chosenCardId].name;
    return direction === 'give'
        ? `shared the ${cityName} card with a teammate`
        : `took the ${cityName} card from a teammate`;
}

// Discover a Cure (§8.2, §11 Scientist): at a research station, discard
// exactly cureCardsRequired() cards of one colour — 4 rather than 5 for the
// Scientist. Eradication (§8.3) follows immediately if that colour already
// has zero cubes on the board. A Medic already standing in a city holding
// this colour clears it on the spot (§11, §16) — the same sweep a later
// infect-phase placement of an already-cured colour triggers.
function applyCure(gs: IOutbreakSpecificGameState, ps: IOutbreakPlayerState, color: OutbreakDiseaseColor | null, cardIds: number[]): string | null {
    if (!color || gs.cures[color] !== 'none') return null;

    const isScientist = ps.role === 'scientist';
    const chosen = [...new Set(cardIds)];
    const required = cureCardsRequired(isScientist);
    if (chosen.length !== required) return null;
    if (!chosen.every(id => CITIES[id]?.color === color && ps.hand.includes(id))) return null;
    if (!canDiscoverCure({ atResearchStation: gs.cities[ps.city].station, handColorCount: chosen.length, isScientist })) return null;

    for (const id of chosen) ps.hand.splice(ps.hand.indexOf(id), 1);
    gs.playerDiscard.push(...chosen);
    gs.cures[color] = gs.cubesLeft[color] === CUBES_PER_COLOR ? 'eradicated' : 'cured';

    let historyLine = `discovered the cure for ${DISEASE_COLOR_DEFS[color].name} disease`;
    const medicNotes = applyMedicAutoClearForColor(gs, color);
    if (medicNotes.length > 0) historyLine += ` — ${medicNotes.join('; ')}`;
    return historyLine;
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
        // not the end of the previous one — see IOutbreakPlayerState. Her
        // once-per-turn Operations Expert flight (§11) resets the same way.
        const nextPs = playerState(outbreakData.specificGameState, next);
        if (nextPs) {
            nextPs.actionsLeft = ACTIONS_PER_TURN;
            nextPs.opsExpertFlightUsed = false;
        }
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

export type OutbreakActionKind =
    | OutbreakMoveType
    | 'buildStation'
    | 'treatDisease'
    | 'shareKnowledge'
    | 'cure'
    | 'pass'
    // Dispatcher (§11): move any pawn to a city already occupied by another.
    | 'dispatcherRelocate'
    // Operations Expert (§11): the once-per-turn station-to-anywhere flight.
    | 'opsExpertFlight';

@serializable
export class OutbreakAction implements IGameCommand {
    id: uuidString = uuidv4() as uuidString;
    timestamp: string = new Date().toISOString();
    gameId: uuidString = NIL_UUID as uuidString;
    senderId: string = 'Unknown';
    senderUsername: string = 'Unknown';
    kind: OutbreakActionKind = 'pass';
    /** Movement kinds / dispatcherRelocate: the city to move to. */
    destination: number = -1;
    /** buildStation: which existing station to relocate, once all six are placed. */
    relocateFrom: number | null = null;
    /** treatDisease / cure: which disease colour. */
    color: OutbreakDiseaseColor | null = null;
    /**
     * shareKnowledge: the other player the city card moves to/from.
     * Movement kinds: a Dispatcher (§11) may set this to move that player's
     * pawn instead of her own, discarding from her own hand.
     * dispatcherRelocate: the player whose pawn is relocated.
     */
    targetUserId: string | null = null;
    /** shareKnowledge: 'give' moves the card from the sender to the target; 'take' the reverse. */
    direction: 'give' | 'take' | null = null;
    /**
     * shareKnowledge: which card moves — omit for the shared city's own card
     * (the base rule); a Researcher (§11) may name any card in the hand it
     * leaves. opsExpertFlight: the city card discarded to make the flight.
     */
    cardId: number | null = null;
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
            case 'shuttleFlight': {
                // Dispatcher (§11): targetUserId, if set, names whose pawn
                // moves — the sender still pays with her own actions and hand.
                const movingPs = this.targetUserId ? playerState(gs, this.targetUserId) : ps;
                if (!movingPs || (movingPs !== ps && !dispatcherCanControlOthers(ps.role))) {
                    historyLine = null;
                } else {
                    historyLine = applyMove(gs, ps, movingPs, this.kind, this.destination);
                }
                break;
            }
            case 'dispatcherRelocate':
                historyLine = applyDispatcherRelocate(gs, ps, this.targetUserId, this.destination);
                break;
            case 'opsExpertFlight':
                historyLine = applyOpsExpertFlight(gs, ps, this.destination, this.cardId);
                break;
            case 'buildStation':
                historyLine = applyBuildStation(gs, ps, this.relocateFrom);
                break;
            case 'treatDisease':
                historyLine = applyTreatDisease(gs, ps, this.color);
                break;
            case 'shareKnowledge':
                historyLine = applyShareKnowledge(gs, this.senderId, ps, this.targetUserId, this.direction, this.cardId);
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

// Writes a resolved cube placement back onto game state — cities, cubesLeft,
// the outbreak counter — logs the outcome, and ends the game in the matching
// §4.2 loss if this placement triggered one (cube exhaustion or the outbreak
// marker reaching its threshold). Shared by the ordinary infect phase and an
// epidemic's own Infect step (§9.1 step 2), which differ only in how the card
// is drawn and how many cubes `result` placed — the write-back and the two
// loss checks are otherwise identical, so drift between them stays impossible
// rather than merely unlikely. Returns true when a loss ended the game, so
// the caller stops resolving further draws.
function applyPlacementResult(
    outbreakData: IOutbreakGameData,
    color: OutbreakDiseaseColor,
    result: IOutbreakChainResult,
    describeInfected: () => string,
    describeOutbreak: (spreadToNames: string) => string,
): boolean {
    const gs = outbreakData.specificGameState;
    gs.cities.forEach((c, id) => { c.cubes = result.cubes[id]; });
    if (result.cubesLeft) gs.cubesLeft = result.cubesLeft;
    gs.outbreaks += result.outbreaks;

    outbreakData.gameState.history.unshift(
        result.outbreaks > 0
            ? describeOutbreak(result.outbrokenCities.map(id => CITIES[id].name).join(', '))
            : describeInfected(),
    );

    // Medic (§11, §16): this placement may have just put `color` — already
    // cured, but not yet eradicated — into a city she's already standing in.
    for (const note of applyMedicAutoClearForColor(gs, color)) {
        outbreakData.gameState.history.unshift(note);
    }

    if (result.cubeExhausted) {
        endInTeamLoss(outbreakData, `no ${DISEASE_COLOR_DEFS[color].name} cubes remain in supply`);
        return true;
    }
    if (isOutbreakCascadeLoss(gs.outbreaks)) {
        endInTeamLoss(outbreakData, `the outbreak marker reached ${gs.outbreaks}`);
        return true;
    }
    return false;
}

// Phase 3 (§10): draw infection cards equal to the current rate, placing 1
// cube per card and resolving outbreaks and chains. Stops the instant a
// §4.2 loss condition fires rather than finishing the remaining draws
// (§16). Returns early — before placing anything — if the game already
// ended in the draw/discard step above it.
//
// Returns the per-card log this phase produced (§21.6 step 12) — one entry
// per card drawn, or a single 'quietNight' entry if the phase was skipped —
// so the caller can hand it to the end-of-turn screen and the away recap.
// Every caller that can finish the draw phase runs this the same way
// (OutbreakEndTurn directly; OutbreakDiscard/OutbreakPlayEvent via
// maybeFinishDrawPhase), so there's exactly one place that builds it.
function resolveInfectPhase(outbreakData: IOutbreakGameData): IOutbreakInfectionLogEntry[] {
    if (outbreakData.complete) return [];
    const gs = outbreakData.specificGameState;
    const log: IOutbreakInfectionLogEntry[] = [];

    // One Quiet Night (§12): consumes itself the moment it would otherwise
    // take effect, skipping this Infect Cities phase entirely rather than
    // reducing the rate or protecting individual cities.
    if (gs.oneQuietNightActive) {
        gs.oneQuietNightActive = false;
        outbreakData.gameState.history.unshift('One Quiet Night — the Infect Cities phase is skipped');
        log.push({ kind: 'quietNight' });
        return log;
    }

    const rate = infectionRateFor(gs.infectionRateIndex);
    // Quarantine Specialist (§11, §16): computed once — nobody moves mid-phase.
    const isProtected = quarantinePredicate(gs);

    for (let i = 0; i < rate; i++) {
        // Intensify (§9.1 step 3) recycles the infection discard back onto
        // the deck each time an epidemic is drawn, but a long enough run
        // between epidemics could still exhaust it. Rather than invent
        // unrecorded randomness to paper over that, the infect phase simply
        // has fewer cards to draw that turn.
        if (gs.infectionDeck.length === 0) break;

        const cityId = gs.infectionDeck.shift()!;
        const color = CITIES[cityId].color;
        gs.infectionDiscard.push(cityId);

        // §8.3/§16: an eradicated disease's cards are drawn and discarded
        // with no effect — nothing is placed and it can't outbreak.
        if (gs.cures[color] === 'eradicated') {
            log.push({ kind: 'infect', cityId, color, outcome: 'eradicated' });
            continue;
        }

        const contained = isProtected(cityId);
        const cubes = gs.cities.map(c => c.cubes);
        const result = placeCubeOrOutbreak(cubes, cityId, color, new Set(), gs.cubesLeft, isProtected);
        log.push({
            kind: 'infect',
            cityId,
            color,
            outcome: result.outbreaks > 0 ? 'outbreak' : contained ? 'contained' : 'placed',
            spreadTo: result.outbreaks > 0 ? result.outbrokenCities : undefined,
        });
        const gameEnded = applyPlacementResult(
            outbreakData, color, result,
            () => contained
                ? `${DISEASE_COLOR_DEFS[color].name} infection in ${CITIES[cityId].name} is contained by the Quarantine Specialist`
                : `infected ${CITIES[cityId].name} with ${DISEASE_COLOR_DEFS[color].name}`,
            spreadToNames => `outbreak in ${CITIES[cityId].name}! It spreads to ${spreadToNames}`,
        );
        if (gameEnded) return log;
    }
    return log;
}

// Resolves one epidemic card fully and immediately (§9.1) — Increase, then
// Infect, then Intensify — before the draw loop that found it moves on. A
// §4.2 loss discovered during Infect (outbreak cascade or cube exhaustion)
// ends the epidemic there; per §16 the outbreak marker can reach 8
// mid-epidemic, and Intensify never runs once the team has already lost.
//
// `recordedOrder` reuses a previously recorded Intensify shuffle when
// replaying a command that already ran once live; omitted, a fresh shuffle
// is rolled and returned so the caller can record it — this is the only
// mid-game randomness anywhere in Outbreak (see
// OutbreakEndTurn.recordedIntensifyOrders). `order` comes back null when the
// epidemic ended in a loss before reaching Intensify, so the caller has
// nothing to record; `entry` is always returned, so an epidemic that ends
// the game still shows up in the log that got the team there.
function resolveEpidemic(
    outbreakData: IOutbreakGameData,
    recordedOrder: number[] | undefined,
): { order: number[] | null; entry: IOutbreakInfectionLogEntry } {
    const gs = outbreakData.specificGameState;

    // 1 — INCREASE: advance the infection rate track one space (§9.1 step 1).
    gs.infectionRateIndex = Math.min(gs.infectionRateIndex + 1, INFECTION_RATE_TRACK.length - 1);
    outbreakData.gameState.history.unshift(`Epidemic! The infection rate rises to ${infectionRateFor(gs.infectionRateIndex)}`);
    const entry: IOutbreakInfectionLogEntry = { kind: 'epidemic', rateAfter: infectionRateFor(gs.infectionRateIndex) };

    // 2 — INFECT: draw the *bottom* infection card, placing 3 cubes on the
    // named city in one shot — or triggering an outbreak if it's already
    // sitting at the 3-cube cap (§9.1 step 2). Guarded the same way
    // resolveInfectPhase's ordinary draw is: the deck and discard pile
    // between them always hold every infection card between them, so this
    // can only run dry between epidemics if a future difficulty/board
    // change makes a pile larger than the deck can support — not reachable
    // with today's DIFFICULTIES, but a card that can't be drawn should skip
    // Infect, not crash the command.
    if (gs.infectionDeck.length > 0) {
        const cityId = gs.infectionDeck.pop()!;
        const color = CITIES[cityId].color;
        gs.infectionDiscard.push(cityId);
        entry.cityId = cityId;
        entry.color = color;

        if (gs.cures[color] === 'eradicated') {
            entry.outcome = 'eradicated';
            outbreakData.gameState.history.unshift(`Epidemic draws ${CITIES[cityId].name}, already eradicated`);
        } else {
            // Quarantine Specialist (§11, §16): her protection covers an
            // epidemic's Infect step exactly as it does ordinary infection.
            const isProtected = quarantinePredicate(gs);
            const contained = isProtected(cityId);
            const cubes = gs.cities.map(c => c.cubes);
            const result = placeEpidemicCubesOrOutbreak(cubes, cityId, color, gs.cubesLeft, isProtected);
            entry.outcome = result.outbreaks > 0 ? 'outbreak' : contained ? 'contained' : 'placed';
            if (result.outbreaks > 0) entry.spreadTo = result.outbrokenCities;
            const gameEnded = applyPlacementResult(
                outbreakData, color, result,
                () => contained
                    ? `Epidemic draws ${CITIES[cityId].name}, contained by the Quarantine Specialist`
                    : `Epidemic infects ${CITIES[cityId].name} with 3 cubes of ${DISEASE_COLOR_DEFS[color].name}`,
                spreadToNames => `Epidemic saturates ${CITIES[cityId].name} — it outbreaks and spreads to ${spreadToNames}`,
            );
            if (gameEnded) return { order: null, entry };
        }
    }

    // 3 — INTENSIFY (§9.1 step 3, §14.2): shuffle the infection discard pile
    // and place it on top of the deck — the ratchet that makes every city
    // infected so far an immediate re-infection candidate.
    const order = recordedOrder ?? shuffle(gs.infectionDiscard);
    gs.infectionDeck = [...order, ...gs.infectionDeck];
    gs.infectionDiscard = [];
    outbreakData.gameState.history.unshift(`Epidemic! The infection discard pile is reshuffled onto the deck`);

    return { order, entry };
}

// ─── OutbreakEndTurn ────────────────────────────────────────────────────────

@serializable
export class OutbreakEndTurn implements IGameCommand {
    id: uuidString = uuidv4() as uuidString;
    timestamp: string = new Date().toISOString();
    gameId: uuidString = NIL_UUID as uuidString;
    senderId: string = 'Unknown';
    senderUsername: string = 'Unknown';
    // Recorded Intensify shuffle(s) (§9.1 step 3) — the only mid-game
    // randomness in Outbreak. One entry per epidemic resolved by a single
    // Execute call, in the order they were resolved: §16 allows both cards
    // drawn in a single draw phase to be epidemics, resolved one fully
    // before the other begins, each with its own Intensify. Left unset until
    // the first live run, then reused on replay so recap and the crew
    // planner reproduce the identical reshuffle rather than rolling a new one.
    recordedIntensifyOrders?: number[][];
    // The infection log this Execute call produced (§21.6 step 6, step 12):
    // one entry per epidemic's own Infect step plus one per ordinary Phase 3
    // draw, in the order they resolved. Always recomputed fresh — there's no
    // randomness in it to preserve across a replay, unlike
    // recordedIntensifyOrders above — and read directly by the end-of-turn
    // screen (via the command route's response) and by recap.ts.
    infectionLog?: IOutbreakInfectionLogEntry[];
    readonly className = 'OutbreakEndTurn';

    myString() { return `Outbreak EndTurn`; }

    async Execute(gameData: IGameData): Promise<ICommandOutcome> {
        const outbreakData = gameData as IOutbreakGameData;
        const gs = outbreakData.specificGameState;

        const ps = playerState(gs, this.senderId);
        if (!ps) return INVALID;
        if (gs.phase !== 'actions') return INVALID;
        if (ps.actionsLeft > 0) return INVALID;

        const infectionLog: IOutbreakInfectionLogEntry[] = [];
        this.infectionLog = infectionLog;

        // Phase 2 (§7, §9): draw two, losing immediately if the deck can't
        // supply one. An epidemic card is resolved fully and immediately
        // instead of joining the hand (§9.1) — if both cards drawn this turn
        // are epidemics, the first is resolved completely before the second
        // is even drawn (§16).
        let cardsDrawn = 0;
        let intensifyIndex = 0;
        for (let i = 0; i < CARDS_DRAWN_PER_TURN; i++) {
            if (isPlayerDeckEmptyLoss(gs.playerDeck.length)) {
                endInTeamLoss(outbreakData, `${this.senderUsername} had to draw with the player deck empty`);
                return { validMove: true, turnOver: true };
            }

            const cardId = gs.playerDeck.shift()!;
            if (cardId === EPIDEMIC_CARD_ID) {
                const { order, entry } = resolveEpidemic(outbreakData, this.recordedIntensifyOrders?.[intensifyIndex]);
                infectionLog.push(entry);
                gs.playerDiscard.push(cardId);
                if (order) {
                    (this.recordedIntensifyOrders ??= [])[intensifyIndex] = order;
                    intensifyIndex++;
                }
                if (outbreakData.complete) return { validMove: true, turnOver: true };
            } else {
                ps.hand.push(cardId);
                cardsDrawn++;
            }
        }
        if (cardsDrawn > 0) {
            outbreakData.gameState.history.unshift(`${this.senderUsername} drew ${cardsDrawn} card${cardsDrawn === 1 ? '' : 's'}`);
        }

        // Hand limit (§9, §16): over it, the turn pauses for OutbreakDiscard
        // rather than infecting yet — the discard step comes before Phase 3.
        if (ps.hand.length > HAND_LIMIT) {
            gs.phase = 'discard';
            outbreakData.gameState.history.unshift(`${this.senderUsername} must discard down to ${HAND_LIMIT} cards`);
            return { validMove: true, turnOver: false };
        }

        infectionLog.push(...resolveInfectPhase(outbreakData));
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
    // Set only when this discard was the one that finished the draw phase —
    // see OutbreakEndTurn.infectionLog.
    infectionLog?: IOutbreakInfectionLogEntry[];
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

        outbreakData.gameState.history.unshift(
            `${this.senderUsername} discarded ${chosen.length} card${chosen.length === 1 ? '' : 's'} down to the hand limit`,
        );

        // The check above already guarantees the hand is exactly at the
        // limit, so this always finishes the draw phase — sharing the same
        // helper OutbreakPlayEvent uses when an event card played to duck the
        // limit does the same job (see maybeFinishDrawPhase).
        const { turnOver, infectionLog } = maybeFinishDrawPhase(outbreakData, ps);
        this.infectionLog = infectionLog;
        return { validMove: true, turnOver };
    }

    Undo(gameData: IGameData): void {
        gameData.gameState.commandHistory.pop();
    }
}

// ─── Event cards (§12, §21.6 step 10) ──────────────────────────────────────
//
// OutbreakPlayEvent covers the five one-shot cards of §12, the Contingency
// Planner's retrieval (§11), and Forecast's second (ordering) step — one
// parameterised command rather than five-plus, following §21.4's "four
// command classes, not fifteen". §21.3: played only on your own turn — the
// command route already rejects anything from a user who isn't currentTurn,
// so nothing here re-checks that — at any point in the action phase, or
// during the player's own draw phase to duck the hand limit; never
// mid-resolution of another card, which is why phase 'forecast' rejects the
// ordinary 'play'/'retrieve' kinds and accepts only 'forecastOrder'.

// After a hand shrinks below/at HAND_LIMIT while phase is 'discard' — an
// event card played to duck the limit (§21.3), or OutbreakDiscard's own
// discard — the draw phase is done: back to 'actions', then Phase 3 runs.
// Shared so the two paths that can finish it can't drift apart.
function maybeFinishDrawPhase(
    outbreakData: IOutbreakGameData,
    ps: IOutbreakPlayerState,
): { turnOver: boolean; infectionLog: IOutbreakInfectionLogEntry[] } {
    const gs = outbreakData.specificGameState;
    if (gs.phase !== 'discard' || ps.hand.length > HAND_LIMIT) return { turnOver: false, infectionLog: [] };
    gs.phase = 'actions';
    const infectionLog = resolveInfectPhase(outbreakData);
    return { turnOver: true, infectionLog };
}

// True while an event card may be played outright (the 'play' kind) — the
// action phase, or the player's own draw phase catching up from a hand-limit
// overflow (§21.3). Excludes 'forecast': nothing else may be played while a
// Forecast's ordering step is still pending.
function eventPlayableInPhase(phase: IOutbreakSpecificGameState['phase']): boolean {
    return phase === 'actions' || phase === 'discard';
}

// Removes `cardId` from wherever the acting player is holding it — her hand,
// or the Contingency Planner's stored slot (§11) — and discards it, unless it
// came from storage: "when played, it is removed from the game permanently"
// rather than rejoining a discard pile a second retrieval could reach.
// Callers must already have confirmed the card is held one way or the other.
function spendEventCard(gs: IOutbreakSpecificGameState, ps: IOutbreakPlayerState, cardId: number): void {
    const handIdx = ps.hand.indexOf(cardId);
    if (handIdx !== -1) {
        ps.hand.splice(handIdx, 1);
        gs.playerDiscard.push(cardId);
        return;
    }
    ps.contingencyCard = null;
}

// Airlift (§12): move any one pawn to any city. §21.3 deviation: no consent
// required — there's nobody to ask in real time with turns hours or days
// apart, and co-op means no adversarial use.
function applyAirlift(gs: IOutbreakSpecificGameState, targetUserId: string | null, destination: number | null): string | null {
    if (!targetUserId || destination === null || !CITIES[destination]) return null;
    const target = gs.players.get(targetUserId);
    if (!target || destination === target.city) return null;

    const fromName = CITIES[target.city].name;
    target.city = destination;
    target.timesTravelled += 1;
    return withMedicNote(gs, target, `played Airlift, moving a teammate from ${fromName} to ${CITIES[destination].name}`);
}

// Government Grant (§12): a free research station anywhere, subject to the
// same 6-station cap and relocation rule every station placement obeys (§5,
// §8.2) — Build a Research Station without the discard or the "must be your
// current city" constraint.
function applyGovernmentGrant(gs: IOutbreakSpecificGameState, destination: number | null, relocateFrom: number | null): string | null {
    if (destination === null || !gs.cities[destination] || gs.cities[destination].station) return null;
    if (!placeStation(gs, destination, relocateFrom)) return null;

    return relocateFrom !== null
        ? `played Government Grant, building a research station in ${CITIES[destination].name}, relocated from ${CITIES[relocateFrom].name}`
        : `played Government Grant, building a research station in ${CITIES[destination].name}`;
}

// One Quiet Night (§12): the *next* Infect Cities phase is skipped entirely.
// Recorded as a flag rather than applied immediately, since Phase 3 hasn't
// happened yet — consumed the next time resolveInfectPhase runs, above.
function applyOneQuietNight(gs: IOutbreakSpecificGameState): string {
    gs.oneQuietNightActive = true;
    return 'played One Quiet Night — the next Infect Cities phase will be skipped';
}

// Resilient Population (§12, §14.2): delete one card from the infection
// discard pile permanently — best played immediately before an Intensify
// step, to remove a hotspot from the ratchet for good.
function applyResilientPopulation(gs: IOutbreakSpecificGameState, infectionCardId: number | null): string | null {
    if (infectionCardId === null) return null;
    const idx = gs.infectionDiscard.indexOf(infectionCardId);
    if (idx === -1) return null;

    gs.infectionDiscard.splice(idx, 1);
    return `played Resilient Population, permanently removing ${CITIES[infectionCardId].name} from the infection discard pile`;
}

// Forecast (§12), step 1: draw the top 6 infection cards face-up and pause
// for their new order, resolved by a second OutbreakPlayEvent — kind
// 'forecastOrder', gated on `phase === 'forecast'` (§21.4). The phase to
// resume (whichever of 'actions'/'discard' this was played from) is recorded
// so the second step can finish a hand-limit duck exactly the way
// OutbreakDiscard would (maybeFinishDrawPhase) — recorded here, before this
// function moves the phase to 'forecast' itself.
function applyForecast(gs: IOutbreakSpecificGameState): string {
    const drawn = gs.infectionDeck.splice(0, Math.min(6, gs.infectionDeck.length));
    gs.forecastCards = drawn;
    gs.forecastResumePhase = gs.phase;
    gs.phase = 'forecast';
    return `played Forecast, drawing the top ${drawn.length} infection card${drawn.length === 1 ? '' : 's'} to rearrange`;
}

// Forecast, step 2: `order` must be the same 6 (or fewer, if the deck ran
// short) cards drawn in step 1, in whatever sequence the player chose —
// returned face-down on top of the infection deck.
function isSamePermutation(a: number[], b: number[]): boolean {
    if (a.length !== b.length) return false;
    const sortedA = [...a].sort((x, y) => x - y);
    const sortedB = [...b].sort((x, y) => x - y);
    return sortedA.every((v, i) => v === sortedB[i]);
}

function applyForecastOrder(outbreakData: IOutbreakGameData, order: number[]): string | null {
    const gs = outbreakData.specificGameState;
    if (!isSamePermutation(order, gs.forecastCards)) return null;

    gs.infectionDeck = [...order, ...gs.infectionDeck];
    gs.forecastCards = [];
    gs.phase = gs.forecastResumePhase ?? 'actions';
    gs.forecastResumePhase = null;
    return `rearranged the top ${order.length} infection card${order.length === 1 ? '' : 's'}`;
}

// Contingency Planner (§11, §21.6 step 10): as an action, retrieve any
// discarded event card and store it on her role card — held outside the hand
// limit (IOutbreakPlayerState.contingencyCard), one at a time, until played
// (spendEventCard then removes it from the game for good rather than
// returning it to the discard pile).
function applyRetrieve(gs: IOutbreakSpecificGameState, ps: IOutbreakPlayerState, cardId: number | null): string | null {
    if (ps.role !== 'contingencyPlanner') return null;
    if (ps.contingencyCard !== null) return null;
    if (cardId === null || !isEventCardId(cardId)) return null;

    const idx = gs.playerDiscard.indexOf(cardId);
    if (idx === -1) return null;

    gs.playerDiscard.splice(idx, 1);
    ps.contingencyCard = cardId;
    return `retrieved ${eventCardName(cardId)} from the discard pile`;
}

// The 'play' kind: dispatches to the one card named by `cmd.cardId`, then —
// only once its effect actually applied — spends it. Validating before
// spending matters: an invalid destination/target must leave the card in
// hand rather than burning it on a no-op.
function applyPlayEvent(outbreakData: IOutbreakGameData, ps: IOutbreakPlayerState, cmd: OutbreakPlayEvent): string | null {
    const gs = outbreakData.specificGameState;
    if (cmd.cardId === null || !isEventCardId(cmd.cardId)) return null;
    if (!ps.hand.includes(cmd.cardId) && ps.contingencyCard !== cmd.cardId) return null;

    let historyLine: string | null;
    switch (cmd.cardId) {
        case EVENT_CARD_AIRLIFT:
            historyLine = applyAirlift(gs, cmd.targetUserId, cmd.destination);
            break;
        case EVENT_CARD_GOVERNMENT_GRANT:
            historyLine = applyGovernmentGrant(gs, cmd.destination, cmd.relocateFrom);
            break;
        case EVENT_CARD_ONE_QUIET_NIGHT:
            historyLine = applyOneQuietNight(gs);
            break;
        case EVENT_CARD_FORECAST:
            historyLine = applyForecast(gs);
            break;
        case EVENT_CARD_RESILIENT_POPULATION:
            historyLine = applyResilientPopulation(gs, cmd.infectionCardId);
            break;
        default:
            historyLine = null;
    }
    if (historyLine === null) return null;

    spendEventCard(gs, ps, cmd.cardId);
    return historyLine;
}

export type OutbreakEventKind =
    | 'play'
    | 'retrieve'
    | 'forecastOrder';

@serializable
export class OutbreakPlayEvent implements IGameCommand {
    id: uuidString = uuidv4() as uuidString;
    timestamp: string = new Date().toISOString();
    gameId: uuidString = NIL_UUID as uuidString;
    senderId: string = 'Unknown';
    senderUsername: string = 'Unknown';
    kind: OutbreakEventKind = 'play';
    /** play: the event card to play, from hand or the Contingency Planner's stored card. retrieve: the discarded event card to retrieve. */
    cardId: number | null = null;
    /** Airlift / Government Grant: destination city. */
    destination: number | null = null;
    /** Government Grant: which existing station to relocate, once all six are placed. */
    relocateFrom: number | null = null;
    /** Airlift: whose pawn moves. */
    targetUserId: string | null = null;
    /** Resilient Population: infection-discard city id to remove from the game. */
    infectionCardId: number | null = null;
    /** forecastOrder: the reordered infection city ids drawn by Forecast, top card first. */
    cardIds: number[] = [];
    // Set only when this command was the one that finished the draw phase —
    // see OutbreakEndTurn.infectionLog.
    infectionLog?: IOutbreakInfectionLogEntry[];
    readonly className = 'OutbreakPlayEvent';

    myString() { return `Outbreak PlayEvent kind=${this.kind} cardId=${this.cardId}`; }

    async Execute(gameData: IGameData): Promise<ICommandOutcome> {
        const outbreakData = gameData as IOutbreakGameData;
        const gs = outbreakData.specificGameState;
        const ps = playerState(gs, this.senderId);
        if (!ps) return INVALID;

        if (this.kind === 'forecastOrder') {
            if (gs.phase !== 'forecast') return INVALID;
            const historyLine = applyForecastOrder(outbreakData, this.cardIds);
            if (historyLine === null) return INVALID;
            outbreakData.gameState.history.unshift(`${this.senderUsername} ${historyLine}`);
            const { turnOver, infectionLog } = maybeFinishDrawPhase(outbreakData, ps);
            this.infectionLog = infectionLog;
            return { validMove: true, turnOver };
        }

        if (this.kind === 'retrieve') {
            if (gs.phase !== 'actions' || ps.actionsLeft <= 0) return INVALID;
            const historyLine = applyRetrieve(gs, ps, this.cardId);
            if (historyLine === null) return INVALID;
            ps.actionsLeft -= 1;
            outbreakData.gameState.history.unshift(`${this.senderUsername} ${historyLine}`);
            return { validMove: true, turnOver: false };
        }

        // 'play': free of action cost either way (§12) — only ever ends the
        // turn by finishing a hand-limit duck, never by spending an action.
        if (!eventPlayableInPhase(gs.phase)) return INVALID;
        const historyLine = applyPlayEvent(outbreakData, ps, this);
        if (historyLine === null) return INVALID;
        outbreakData.gameState.history.unshift(`${this.senderUsername} ${historyLine}`);
        const { turnOver, infectionLog } = maybeFinishDrawPhase(outbreakData, ps);
        this.infectionLog = infectionLog;
        return { validMove: true, turnOver };
    }

    Undo(gameData: IGameData): void {
        gameData.gameState.commandHistory.pop();
    }
}
