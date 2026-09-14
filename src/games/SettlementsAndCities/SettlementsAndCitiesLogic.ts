import type { ISettlementsAndCitiesGameData } from "@/games/SettlementsAndCities/SettlementsAndCitiesModels";
import type { SAC_Resource, SAC_DevCard, ISACPlayerState, ISACRollChange } from "@/games/SettlementsAndCities/board";
import { BOARD_TOPOLOGY, NO_RESOURCES, SAC_RESOURCES, TERRAIN_TO_RESOURCE, calculateLongestRoad, calculateVisibleVP, isValidSettlementVertex, isValidRoadEdge, isValidSetupRoadEdge } from "@/games/SettlementsAndCities/board";
import { sacRollSentence } from "@/games/SettlementsAndCities/ui";
import type { IGameData } from "@/utils/mongodb/GameData";
import type { uuidString } from "@/utils/apiModels/GameDataApi";
import type { ICommandOutcome, IGameCommand, IGameType } from "@/utils/apiModels/gameCommand";
import { serializable } from "@/utils/apiModels/Serialisable";
import { DiceRoll } from "@/utils/games/DiceRoll";
import { v4 as uuidv4, NIL as NIL_UUID } from 'uuid';
import { playerHistory, userToken } from "@/utils/games/history";
import { randomFloat, randomInt } from "@/utils/games/random";

// ═══════════════════════════════════════════════════════════════════════════════
//  SETTLEMENTS AND CITIES
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Helper: randomly discard half of a player's cards ───────────────────────
// Records the raw randomFloat() draws a command consumes the first time it runs
// so an identical sequence can be replayed later (turn recap). Construct with a
// previously recorded log to replay it, or with nothing to record fresh. Used
// for the SAC discard shuffle, whose number of draws varies per roll. The log
// is persisted as part of the command in commandHistory (Schema.Types.Mixed).
export class SACRandomLog {
    private draws: number[];
    private cursor = 0;
    readonly replaying: boolean;

    constructor(recorded?: number[]) {
        this.replaying = Array.isArray(recorded);
        this.draws = recorded ? [...recorded] : [];
    }

    // Next raw draw in [0, 1). Falls back to a fresh draw if a replay log runs
    // short (defensive — should never happen for a faithfully recorded log).
    next(): number {
        if (this.replaying) {
            return this.draws[this.cursor++] ?? randomFloat();
        }
        const value = randomFloat();
        this.draws.push(value);
        return value;
    }

    get log(): number[] {
        return this.draws;
    }
}

// Discards half a hand over the limit, and reports how many cards went — the
// count is public (hand size always is) and the roll's payout records it, where
// *which* cards went stays hidden.
function sacDiscardHalf(ps: ISACPlayerState, rng: SACRandomLog): number {
    const total = sacTotalResources(ps);
    if (total <= 7) return 0;
    let toDiscard = Math.floor(total / 2);
    const pool: SAC_Resource[] = [];
    for (const r of SAC_RESOURCES) {
        for (let i = 0; i < ps.resources[r]; i++) pool.push(r);
    }
    // Fisher-Yates shuffle the pool then take first `toDiscard`
    for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(rng.next() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    for (let i = 0; i < toDiscard; i++) {
        ps.resources[pool[i]]--;
    }
    return toDiscard;
}

function sacTotalResources(ps: ISACPlayerState): number {
    return ps.resources.lumber + ps.resources.wool + ps.resources.grain +
           ps.resources.brick + ps.resources.ore;
}

// ─── Helper: update longest road / largest army ───────────────────────────────
function sacUpdateLongestRoad(sacData: ISettlementsAndCitiesGameData): void {
    const gs = sacData.specificGameState;
    let maxLen = 0;
    let maxPlayer: string | null = null;
    for (const [userId] of gs.playerStates) {
        const len = calculateLongestRoad(userId, gs.vertices, gs.edges);
        if (len > maxLen) { maxLen = len; maxPlayer = userId; }
    }
    if (maxLen >= 5) {
        if (gs.longestRoadOwner === null) {
            if (maxPlayer) gs.longestRoadOwner = maxPlayer;
        } else {
            const currentLen = calculateLongestRoad(gs.longestRoadOwner, gs.vertices, gs.edges);
            if (maxLen > currentLen && maxPlayer && maxPlayer !== gs.longestRoadOwner) {
                gs.longestRoadOwner = maxPlayer;
            }
        }
    }
}

function sacUpdateLargestArmy(sacData: ISettlementsAndCitiesGameData): void {
    const gs = sacData.specificGameState;
    let maxKnights = 0;
    let maxPlayer: string | null = null;
    for (const [userId, ps] of gs.playerStates) {
        if (ps.knightsPlayed > maxKnights) { maxKnights = ps.knightsPlayed; maxPlayer = userId; }
    }
    if (maxKnights >= 3) {
        if (gs.largestArmyOwner === null) {
            if (maxPlayer) gs.largestArmyOwner = maxPlayer;
        } else {
            const currentKnights = gs.playerStates.get(gs.largestArmyOwner)?.knightsPlayed ?? 0;
            if (maxKnights > currentKnights && maxPlayer && maxPlayer !== gs.largestArmyOwner) {
                gs.largestArmyOwner = maxPlayer;
            }
        }
    }
}

// ─── Helper: advance setup turn ──────────────────────────────────────────────
function sacAdvanceSetup(sacData: ISettlementsAndCitiesGameData): void {
    const gs = sacData.specificGameState;
    const N = sacData.gameState.turnOrder.length;
    gs.setupStep++;
    if (gs.setupStep >= 2 * N) {
        // Setup complete – start main game
        gs.phase = 'main';
        gs.setupStep = 0;
        sacData.currentTurn = sacData.gameState.turnOrder[0];
    } else {
        const s = gs.setupStep;
        const idx = s < N ? s : 2 * N - 1 - s;
        sacData.currentTurn = sacData.gameState.turnOrder[idx];
    }
}

// ─── 5–6 Player Extension: Special Build Phase (design doc §8.5) ────────────────

// True while it's a player's regular main turn (they are the active player and
// have rolled) OR their between-turns special-build turn. The build/trade
// commands share this gate so a special-build player can act without rolling.
function sacCanBuildOrTrade(gs: ISettlementsAndCitiesGameData['specificGameState']): boolean {
    if (gs.phase !== 'main') return false;
    if (gs.pendingRobber) return false;
    if (gs.specialBuildActive) return true;
    return gs.hasRolled;
}

// True when the active player may play a development card right now. Catan's
// rule is one dev card per turn, playable at any point during your own main
// turn — before *or* after the roll — so (unlike build/trade) we deliberately
// do NOT require hasRolled. Blocked while a robber move or free-road placement
// is still outstanding, during another player's Special Build, and once a dev
// card has already been played this turn. Cards bought this turn live in
// newDevCards (not yet playable) and are handled by the per-command hand check.
function sacCanPlayDevCard(gs: ISettlementsAndCitiesGameData['specificGameState']): boolean {
    if (gs.phase !== 'main') return false;
    if (gs.specialBuildActive) return false;
    if (gs.pendingRobber) return false;
    if (gs.pendingRoadBuilding > 0) return false;
    if (gs.playedDevCard) return false;
    return true;
}

// ─── Auto-end a turn with nothing left to decide ───────────────────────────

// The trade ratio the bank gives `userId` for `resource`, from the harbours
// they hold a settlement/city on. Mirrors the client's own copy of this in
// SettlementsAndCitiesActions.tsx (SACMaritimeTrade.Execute has its own too),
// so what the auto-end check below counts as "tradeable" is exactly what a
// live SACMaritimeTrade would accept.
function sacTradeRatio(gs: ISettlementsAndCitiesGameData['specificGameState'], userId: string, resource: SAC_Resource): number {
    let ratio = 4;
    for (const harbor of gs.harbors) {
        const hasAccess = harbor.vertices.some(vid => {
            const v = gs.vertices[vid];
            return v.owner === userId && v.building !== null;
        });
        if (!hasAccess) continue;
        if (harbor.type === '3to1' && ratio > 3) ratio = 3;
        if (harbor.type === resource) { ratio = 2; break; }
    }
    return ratio;
}

// True once `userId` (the active player) has something they could still
// spend this turn: an affordable settlement/road/city with a piece left to
// place, a dev card they can afford (and the deck isn't empty), a resource
// they hold enough of to trade with the bank at their own rate, or a dev card
// in hand they're allowed to play.
function sacHasAnyAction(gs: ISettlementsAndCitiesGameData['specificGameState'], userId: string, ps: ISACPlayerState): boolean {
    if (ps.remainingSettlements > 0 && ps.resources.brick >= 1 && ps.resources.lumber >= 1 && ps.resources.wool >= 1 && ps.resources.grain >= 1) return true;
    if (ps.remainingRoads > 0 && ps.resources.brick >= 1 && ps.resources.lumber >= 1) return true;
    if (ps.remainingCities > 0 && ps.resources.grain >= 2 && ps.resources.ore >= 3) return true;
    if (gs.devCardDeck.length > 0 && ps.resources.wool >= 1 && ps.resources.grain >= 1 && ps.resources.ore >= 1) return true;
    if (SAC_RESOURCES.some(r => ps.resources[r] >= sacTradeRatio(gs, userId, r))) return true;
    if (sacCanPlayDevCard(gs)) {
        const playable: SAC_DevCard[] = ['knight', 'roadBuilding', 'yearOfPlenty', 'monopoly'];
        if (playable.some(k => ps.devCards[k] > 0)) return true;
    }
    return false;
}

// The outcome every command above returns on success: a valid move that
// doesn't end the turn, unless `userId` is left with nothing above true to
// do — in the same spirit as Dice Cities' settleRoll/noActionsAvailable, a
// player with nothing left to build, buy or trade shouldn't have to tap "End
// turn" for no reason. Called at the tail of every command that can leave a
// player in ordinary free play (post-roll main turn, or a Special Build
// turn): one still mid-sequence (a pending robber move, free roads yet to
// place) never auto-ends, since the check only fires once
// `hasRolled`/`specialBuildActive` holds and both of those have cleared.
function sacFinishTurn(sacData: ISettlementsAndCitiesGameData, userId: string): ICommandOutcome {
    const outcome: ICommandOutcome = { validMove: true, turnOver: false };
    const gs = sacData.specificGameState;
    if (gs.phase !== 'main' || gs.pendingRobber || gs.pendingRoadBuilding > 0) return outcome;
    if (!gs.specialBuildActive && !gs.hasRolled) return outcome;
    const ps = gs.playerStates.get(userId);
    if (!ps || sacHasAnyAction(gs, userId, ps)) return outcome;
    outcome.turnOver = true;
    // Flagged only for an ordinary main turn — a Special Build player running
    // dry closes their own slot (sacAdvanceSpecialBuild), which never touches
    // the dice display, so there's nothing here for it to mark.
    if (!gs.specialBuildActive) gs.lastRollAutoEnded = true;
    sacData.gameState.history.unshift(playerHistory(
        userId,
        gs.specialBuildActive
            ? `had nothing left to build or trade, so their special build ended automatically`
            : `had nothing left to build, buy or trade, so their turn ended automatically`,
    ));
    return outcome;
}

// Ends a regular main turn: reset per-turn flags, promote freshly-bought dev
// cards to playable, and pass the dice to the next seat in turn order. When
// `lastRollAutoEnded` is set the turn ended on its own rather than a player
// tapping "End turn", so the roll that caused it is left in place — cleared,
// like the flag itself, only once the next roll lands and overwrites both.
function sacAdvanceMainTurn(sacData: ISettlementsAndCitiesGameData): void {
    const gs = sacData.specificGameState;
    gs.hasRolled = false;
    if (!gs.lastRollAutoEnded) {
        gs.lastRoll = null;
        gs.lastRollDie1 = null;
        gs.lastRollDie2 = null;
        gs.lastRollChanges = [];
    }
    gs.pendingRobber = false;
    gs.pendingRoadBuilding = 0;
    gs.playedDevCard = false;
    // Promote newDevCards to playable devCards
    for (const [, ps] of gs.playerStates) {
        const keys: SAC_DevCard[] = ['knight', 'victoryPoint', 'roadBuilding', 'yearOfPlenty', 'monopoly'];
        for (const k of keys) {
            ps.devCards[k] += ps.newDevCards[k];
            ps.newDevCards[k] = 0;
        }
    }
    const order = sacData.gameState.turnOrder;
    const currentIndex = order.findIndex(t => t === sacData.currentTurn);
    sacData.currentTurn = order[(currentIndex + 1) % order.length];
}

// Opens the Special Build Phase after the active player ends their main turn:
// every *other* player, in turn order starting after the active player, gets one
// build-and-trade turn before the dice pass on. Returns false (no phase opened)
// when there are no other players to offer it to.
function sacStartSpecialBuild(sacData: ISettlementsAndCitiesGameData): boolean {
    const gs = sacData.specificGameState;
    const order = sacData.gameState.turnOrder;
    const activeIndex = order.findIndex(t => t === sacData.currentTurn);
    const queue: string[] = [];
    for (let i = 1; i < order.length; i++) {
        queue.push(order[(activeIndex + i) % order.length]);
    }
    if (queue.length === 0) return false;

    gs.specialBuildActive = true;
    gs.specialBuildQueue = queue;
    gs.specialBuildMainPlayer = sacData.currentTurn;
    sacData.currentTurn = queue[0];
    sacData.gameState.history.unshift({ text: 'Special Build Phase — other players may build & trade with the bank' });
    return true;
}

// Advances the Special Build Phase after a player finishes their special-build
// turn: hand off to the next queued player, or close the phase and pass the dice
// on from the seat that opened it.
function sacAdvanceSpecialBuild(sacData: ISettlementsAndCitiesGameData): void {
    const gs = sacData.specificGameState;
    gs.specialBuildQueue.shift();
    if (gs.specialBuildQueue.length > 0) {
        sacData.currentTurn = gs.specialBuildQueue[0];
        return;
    }
    // Phase over — resume the regular rotation from the player who opened it.
    gs.specialBuildActive = false;
    sacData.currentTurn = gs.specialBuildMainPlayer ?? sacData.currentTurn;
    gs.specialBuildMainPlayer = null;
    sacAdvanceMainTurn(sacData);
}

// ─── Game type ────────────────────────────────────────────────────────────────

@serializable
export class SettlementsAndCitiesGameType implements IGameType {
    gameId: uuidString = uuidv4() as uuidString;
    gameType: string = "SettlementsAndCities";
    friendlyName: string = "Settlements and Cities";
    icon: string = "";
    url: string = "settlementsandcities";
    readonly className: string = "SettlementsAndCitiesGameType";

    CheckEndTurn(gameData: IGameData, commandOutcome: ICommandOutcome): void {
        const sacData = gameData as ISettlementsAndCitiesGameData;
        const gs = sacData.specificGameState;
        if (!commandOutcome.turnOver) return;

        if (gs.phase === 'setup') {
            sacAdvanceSetup(sacData);
            return;
        }

        // A player finishing their between-turns special build hands off to the
        // next queued player (or closes the phase and passes the dice on).
        if (gs.specialBuildActive) {
            sacAdvanceSpecialBuild(sacData);
            return;
        }

        // The active player just ended their main turn. With the 5–6 Player
        // Extension, open a Special Build Phase for everyone else before the dice
        // move on; otherwise pass the dice straight to the next seat.
        if (gs.expansions?.fiveSixPlayerExtension && sacStartSpecialBuild(sacData)) {
            return;
        }
        sacAdvanceMainTurn(sacData);
    }

    CheckGameOver(gameData: IGameData): boolean {
        const sacData = gameData as ISettlementsAndCitiesGameData;
        const gs = sacData.specificGameState;
        if (gs.phase !== 'main') return false;
        // The VP target varies with the active expansions (base 10; higher for
        // Knights & Commerce / Seas & Sailors — see design doc §8).
        const victoryTarget = gs.victoryTarget ?? 10;
        for (const [userId, ps] of gs.playerStates) {
            // Hidden Victory Point cards count toward the win the moment they'd
            // reach the target (they're auto-revealed). A VP card bought this
            // turn sits in newDevCards, so for the player whose turn it is we
            // include those too — buying your final VP wins immediately.
            let victoryPointCards = ps.devCards.victoryPoint;
            if (userId === sacData.currentTurn) victoryPointCards += ps.newDevCards.victoryPoint;
            const vp = calculateVisibleVP(userId, gs.vertices, gs.longestRoadOwner, gs.largestArmyOwner)
                + victoryPointCards;
            if (vp >= victoryTarget) {
                sacData.complete = true;
                sacData.winner = userId;
                sacData.currentTurn = '';
                return true;
            }
        }
        return false;
    }
}

// ─── Setup commands ───────────────────────────────────────────────────────────

@serializable
export class SACPlaceSettlementSetup implements IGameCommand {
    id: uuidString = uuidv4() as uuidString;
    timestamp: string = new Date().toISOString();
    gameId: uuidString = NIL_UUID as uuidString;
    senderId: string = 'Unknown';
    senderUsername: string = 'Unknown';
    vertexId: number = 0;
    readonly className = 'SACPlaceSettlementSetup';

    myString() { return 'placed a settlement (setup)'; }

    async Execute(gameData: IGameData): Promise<ICommandOutcome> {
        const sacData = gameData as ISettlementsAndCitiesGameData;
        const gs = sacData.specificGameState;

        if (gs.phase !== 'setup' || gs.pendingRoadSetup) return { validMove: false, turnOver: false };
        if (!isValidSettlementVertex(this.vertexId, gs.vertices)) return { validMove: false, turnOver: false };

        gs.vertices[this.vertexId].building = 'settlement';
        gs.vertices[this.vertexId].owner = this.senderId;

        const ps = gs.playerStates.get(this.senderId);
        if (ps) {
            ps.remainingSettlements--;
            // Give starting resources for the second round of placements
            const N = sacData.gameState.turnOrder.length;
            if (gs.setupStep >= N) {
                for (const hexId of BOARD_TOPOLOGY.vertexHexes[this.vertexId]) {
                    const hex = gs.hexes[hexId];
                    if (hex.numberToken !== null) {
                        const resource = TERRAIN_TO_RESOURCE[hex.terrain];
                        if (resource) {
                            ps.resources[resource]++;
                            ps.resourcesGathered++;
                        }
                    }
                }
            }
        }

        gs.pendingRoadSetup = true;
        gs.lastSetupSettlementVertex = this.vertexId;

        sacData.gameState.history.unshift(playerHistory(this.senderId, `placed a settlement (setup)`));
        return { validMove: true, turnOver: false };
    }

    Undo(gameData: IGameData): void {
        gameData.gameState.commandHistory.pop();
    }
}

@serializable
export class SACPlaceRoadSetup implements IGameCommand {
    id: uuidString = uuidv4() as uuidString;
    timestamp: string = new Date().toISOString();
    gameId: uuidString = NIL_UUID as uuidString;
    senderId: string = 'Unknown';
    senderUsername: string = 'Unknown';
    edgeId: number = 0;
    readonly className = 'SACPlaceRoadSetup';

    myString() { return 'placed a road (setup)'; }

    async Execute(gameData: IGameData): Promise<ICommandOutcome> {
        const sacData = gameData as ISettlementsAndCitiesGameData;
        const gs = sacData.specificGameState;

        if (gs.phase !== 'setup' || !gs.pendingRoadSetup) return { validMove: false, turnOver: false };
        if (gs.lastSetupSettlementVertex === null) return { validMove: false, turnOver: false };
        if (!isValidSetupRoadEdge(this.edgeId, gs.lastSetupSettlementVertex, gs.edges)) {
            return { validMove: false, turnOver: false };
        }

        gs.edges[this.edgeId].hasRoad = true;
        gs.edges[this.edgeId].owner = this.senderId;

        const ps = gs.playerStates.get(this.senderId);
        if (ps) ps.remainingRoads--;

        gs.pendingRoadSetup = false;
        gs.lastSetupSettlementVertex = null;

        sacData.gameState.history.unshift(playerHistory(this.senderId, `placed a road (setup)`));
        return { validMove: true, turnOver: true };
    }

    Undo(gameData: IGameData): void {
        gameData.gameState.commandHistory.pop();
    }
}

// ─── Play Knight (before or after the roll) ───────────────────────────────────

@serializable
export class SACPlayKnight implements IGameCommand {
    id: uuidString = uuidv4() as uuidString;
    timestamp: string = new Date().toISOString();
    gameId: uuidString = NIL_UUID as uuidString;
    senderId: string = 'Unknown';
    senderUsername: string = 'Unknown';
    readonly className = 'SACPlayKnight';

    myString() { return 'played a Knight card'; }

    async Execute(gameData: IGameData): Promise<ICommandOutcome> {
        const sacData = gameData as ISettlementsAndCitiesGameData;
        const gs = sacData.specificGameState;

        // Knights may be played before or after rolling (one dev card per turn).
        if (!sacCanPlayDevCard(gs)) return { validMove: false, turnOver: false };

        const ps = gs.playerStates.get(this.senderId);
        if (!ps || ps.devCards.knight < 1) return { validMove: false, turnOver: false };

        ps.devCards.knight--;
        ps.knightsPlayed++;
        ps.robberUses++;
        gs.playedDevCard = true;
        gs.pendingRobber = true;

        sacUpdateLargestArmy(sacData);

        sacData.gameState.history.unshift(playerHistory(this.senderId, `played a Knight card`));
        return { validMove: true, turnOver: false };
    }

    Undo(gameData: IGameData): void {
        gameData.gameState.commandHistory.pop();
    }
}

// ─── Roll dice ────────────────────────────────────────────────────────────────

@serializable
export class SACRollDice implements IGameCommand {
    id: uuidString = uuidv4() as uuidString;
    timestamp: string = new Date().toISOString();
    gameId: uuidString = NIL_UUID as uuidString;
    senderId: string = 'Unknown';
    senderUsername: string = 'Unknown';
    readonly className = 'SACRollDice';
    // Recorded RNG outcomes, populated on first execution so the command can be
    // deterministically replayed (turn recap). Persisted in commandHistory.
    recordedRoll1?: number;
    recordedRoll2?: number;
    // Raw draws consumed by the discard shuffle when a 7 is rolled (variable
    // length — one shuffle per player holding >7 cards).
    recordedDiscards?: number[];
    // What this roll paid out. The state keeps only the *latest* roll's payout
    // (`gs.lastRollChanges`), and myString() — which titles this step of a match
    // review — is handed no state at all, so the payout rides on the command
    // too. Dice Cities' `moneyChanges` is the same field for the same reason.
    // Set by Execute below, so a value a client sends is overwritten before
    // anything reads it; a review replays Execute, so a roll played before this
    // field existed gets its payout recomputed rather than losing it.
    rollChanges?: ISACRollChange[];

    myString() {
        // A roll replayed from history always has its dice recorded; the
        // unrecorded case is a command that has not been executed yet. The
        // command route strips `recorded…` fields off an incoming body before
        // it logs this line, so a live request can't have a forged payout
        // printed either — it is this method's only untrusted caller.
        if (this.recordedRoll1 === undefined || this.recordedRoll2 === undefined) return 'rolled the dice';
        const roll = this.recordedRoll1 + this.recordedRoll2;
        // Without a payout there is nothing to name, and "nobody collected" would
        // be a claim rather than a reading — a rolled-but-unexecuted command, or
        // one read straight out of commandHistory from before this field, says
        // only the number.
        if (!this.rollChanges) return `rolled a ${roll}`;
        return sacRollSentence(roll, this.rollChanges, userToken);
    }

    async Execute(gameData: IGameData): Promise<ICommandOutcome> {
        const sacData = gameData as ISettlementsAndCitiesGameData;
        const gs = sacData.specificGameState;

        if (gs.phase !== 'main') return { validMove: false, turnOver: false };
        if (gs.specialBuildActive) return { validMove: false, turnOver: false };
        if (gs.hasRolled) return { validMove: false, turnOver: false };
        if (gs.pendingRobber) return { validMove: false, turnOver: false };
        // Finish placing any free roads from a pre-roll Road Building card first.
        if (gs.pendingRoadBuilding > 0) return { validMove: false, turnOver: false };

        // Reuse recorded dice when replaying; otherwise roll fresh and record.
        const die1 = this.recordedRoll1 ?? DiceRoll(6);
        const die2 = this.recordedRoll2 ?? DiceRoll(6);
        this.recordedRoll1 = die1;
        this.recordedRoll2 = die2;
        const roll = die1 + die2;
        gs.lastRoll = roll;
        gs.lastRollDie1 = die1;
        gs.lastRollDie2 = die2;
        // This roll's own outcome decides whether the note belongs — never the
        // stale flag from whatever ended the previous turn.
        gs.lastRollAutoEnded = false;

        // What this roll moved, per player, built up as it resolves and then
        // parked on the state: the board screen, the turn recap and the history
        // line below all read the same payout rather than three of them guessing
        // at it from hand sizes, and a Knight moving the robber later in the same
        // turn can't rewrite what the dice already paid.
        const changes = new Map<string, ISACRollChange>();
        const changeFor = (userId: string): ISACRollChange => {
            let change = changes.get(userId);
            if (!change) {
                change = { userId, gained: { ...NO_RESOURCES }, discarded: 0 };
                changes.set(userId, change);
            }
            return change;
        };

        if (roll === 7) {
            const rollerPs = gs.playerStates.get(this.senderId);
            if (rollerPs) rollerPs.robberUses++;
            // Discard phase: auto-discard for all players with >7 cards. The
            // shuffle draws are recorded so replay discards the same cards. The
            // playerStates iteration order is stable (userIdList order), so the
            // recorded draws line up with the same players on replay.
            const rng = new SACRandomLog(this.recordedDiscards);
            for (const [userId, ps] of gs.playerStates) {
                const discarded = sacDiscardHalf(ps, rng);
                if (discarded > 0) changeFor(userId).discarded = discarded;
            }
            this.recordedDiscards = rng.log;
            gs.pendingRobber = true;
        } else {
            // Distribute resources
            for (const [hexId, hex] of gs.hexes.entries()) {
                if (hex.numberToken !== roll) continue;
                if (hexId === gs.robberHexIndex) continue;
                const resource = TERRAIN_TO_RESOURCE[hex.terrain];
                if (!resource) continue;

                for (const vertexId of BOARD_TOPOLOGY.hexVertices[hexId]) {
                    const vertex = gs.vertices[vertexId];
                    if (!vertex.owner) continue;
                    const ps = gs.playerStates.get(vertex.owner);
                    if (!ps) continue;
                    const amount = vertex.building === 'city' ? 2 : 1;
                    ps.resources[resource] += amount;
                    ps.resourcesGathered += amount;
                    changeFor(vertex.owner).gained[resource] += amount;
                }
            }
        }

        // Turn order, not the order the hexes happened to pay out in, so the
        // payout reads down the table the same way the scoreboard does.
        gs.lastRollChanges = [...gs.playerStates.keys()]
            .map(userId => changes.get(userId))
            .filter((change): change is ISACRollChange => change !== undefined);

        // The same payout on the command, so a match review of this roll still
        // has it once the state has moved on to the next one.
        this.rollChanges = gs.lastRollChanges;

        sacData.gameState.history.unshift(playerHistory(
            this.senderId,
            sacRollSentence(roll, gs.lastRollChanges, userToken),
        ));

        gs.hasRolled = true;
        return sacFinishTurn(sacData, this.senderId);
    }

    Undo(gameData: IGameData): void {
        gameData.gameState.commandHistory.pop();
    }
}

// ─── Move robber ──────────────────────────────────────────────────────────────

@serializable
export class SACMoveRobber implements IGameCommand {
    id: uuidString = uuidv4() as uuidString;
    timestamp: string = new Date().toISOString();
    gameId: uuidString = NIL_UUID as uuidString;
    senderId: string = 'Unknown';
    senderUsername: string = 'Unknown';
    hexId: number = 0;
    stealFromUserId: string | null = null;
    readonly className = 'SACMoveRobber';
    // Index into the victim's (deterministically reconstructed) resource pool of
    // the stolen resource. Recorded on first execution so replay steals the same
    // resource. Persisted in commandHistory.
    recordedStealIndex?: number;

    myString() {
        // The history line's words, plus the victim it leaves out: who was robbed
        // is public — the recap names them to the whole table — while *which*
        // resource was taken stays hidden either way. The victim is tokenised the
        // way a history line names a player, for the replay engine to resolve
        // (see userToken / resolveTokens).
        return this.stealFromUserId
            ? `moved the robber and stole a resource from ${userToken(this.stealFromUserId)}`
            : 'moved the robber';
    }

    async Execute(gameData: IGameData): Promise<ICommandOutcome> {
        const sacData = gameData as ISettlementsAndCitiesGameData;
        const gs = sacData.specificGameState;

        if (!gs.pendingRobber) return { validMove: false, turnOver: false };
        if (this.hexId === gs.robberHexIndex) return { validMove: false, turnOver: false };
        if (this.hexId < 0 || this.hexId >= gs.hexes.length) return { validMove: false, turnOver: false };

        // Determine eligible players (have settlement/city adjacent, have resources, not self)
        const adjacentUserIds = new Set<string>();
        for (const vertexId of BOARD_TOPOLOGY.hexVertices[this.hexId]) {
            const v = gs.vertices[vertexId];
            if (v.owner && v.owner !== this.senderId && v.building) {
                const tps = gs.playerStates.get(v.owner);
                if (tps && sacTotalResources(tps) > 0) adjacentUserIds.add(v.owner);
            }
        }

        if (this.stealFromUserId !== null) {
            if (!adjacentUserIds.has(this.stealFromUserId)) return { validMove: false, turnOver: false };
            // Steal one random resource
            const victim = gs.playerStates.get(this.stealFromUserId)!;
            const pool: SAC_Resource[] = [];
            for (const r of SAC_RESOURCES) {
                for (let i = 0; i < victim.resources[r]; i++) pool.push(r);
            }
            if (pool.length > 0) {
                const stealIndex = this.recordedStealIndex ?? randomInt(pool.length);
                this.recordedStealIndex = stealIndex;
                const stolen = pool[stealIndex];
                victim.resources[stolen]--;
                const thief = gs.playerStates.get(this.senderId);
                if (thief) {
                    thief.resources[stolen]++;
                    thief.resourcesGathered++;
                }
                sacData.gameState.history.unshift(playerHistory(this.senderId, `moved the robber and stole a resource`));
            }
        } else if (adjacentUserIds.size > 0) {
            // Must specify someone to steal from
            return { validMove: false, turnOver: false };
        } else {
            sacData.gameState.history.unshift(playerHistory(this.senderId, `moved the robber`));
        }

        gs.robberHexIndex = this.hexId;
        gs.pendingRobber = false;
        return sacFinishTurn(sacData, this.senderId);
    }

    Undo(gameData: IGameData): void {
        gameData.gameState.commandHistory.pop();
    }
}

// ─── Build road ───────────────────────────────────────────────────────────────

@serializable
export class SACBuildRoad implements IGameCommand {
    id: uuidString = uuidv4() as uuidString;
    timestamp: string = new Date().toISOString();
    gameId: uuidString = NIL_UUID as uuidString;
    senderId: string = 'Unknown';
    senderUsername: string = 'Unknown';
    edgeId: number = 0;
    readonly className = 'SACBuildRoad';

    myString() { return 'built a road'; }

    async Execute(gameData: IGameData): Promise<ICommandOutcome> {
        const sacData = gameData as ISettlementsAndCitiesGameData;
        const gs = sacData.specificGameState;

        if (gs.phase !== 'main') return { validMove: false, turnOver: false };
        if (gs.pendingRobber) return { validMove: false, turnOver: false };

        // Free roads come from a Road Building card (main turn only); a special-
        // build player pays normally and never has pending free roads.
        const isFreeRoad = !gs.specialBuildActive && gs.pendingRoadBuilding > 0;
        if (!isFreeRoad && !sacCanBuildOrTrade(gs)) return { validMove: false, turnOver: false };

        if (!isValidRoadEdge(this.edgeId, this.senderId, gs.vertices, gs.edges)) {
            return { validMove: false, turnOver: false };
        }

        const ps = gs.playerStates.get(this.senderId);
        if (!ps) return { validMove: false, turnOver: false };
        if (ps.remainingRoads <= 0) return { validMove: false, turnOver: false };

        if (!isFreeRoad) {
            if (ps.resources.brick < 1 || ps.resources.lumber < 1) return { validMove: false, turnOver: false };
            ps.resources.brick--;
            ps.resources.lumber--;
        } else {
            gs.pendingRoadBuilding--;
        }

        gs.edges[this.edgeId].hasRoad = true;
        gs.edges[this.edgeId].owner = this.senderId;
        ps.remainingRoads--;

        sacUpdateLongestRoad(sacData);
        sacData.gameState.history.unshift(playerHistory(this.senderId, `built a road`));
        return sacFinishTurn(sacData, this.senderId);
    }

    Undo(gameData: IGameData): void {
        gameData.gameState.commandHistory.pop();
    }
}

// ─── Build settlement ─────────────────────────────────────────────────────────

@serializable
export class SACBuildSettlement implements IGameCommand {
    id: uuidString = uuidv4() as uuidString;
    timestamp: string = new Date().toISOString();
    gameId: uuidString = NIL_UUID as uuidString;
    senderId: string = 'Unknown';
    senderUsername: string = 'Unknown';
    vertexId: number = 0;
    readonly className = 'SACBuildSettlement';

    myString() { return 'built a settlement'; }

    async Execute(gameData: IGameData): Promise<ICommandOutcome> {
        const sacData = gameData as ISettlementsAndCitiesGameData;
        const gs = sacData.specificGameState;

        if (!sacCanBuildOrTrade(gs)) return { validMove: false, turnOver: false };

        if (!isValidSettlementVertex(this.vertexId, gs.vertices)) return { validMove: false, turnOver: false };

        // Must be connected by own road
        const connectedByRoad = BOARD_TOPOLOGY.vertexEdges[this.vertexId].some(
            eid => gs.edges[eid].hasRoad && gs.edges[eid].owner === this.senderId
        );
        if (!connectedByRoad) return { validMove: false, turnOver: false };

        const ps = gs.playerStates.get(this.senderId);
        if (!ps) return { validMove: false, turnOver: false };
        if (ps.remainingSettlements <= 0) return { validMove: false, turnOver: false };
        if (ps.resources.brick < 1 || ps.resources.lumber < 1 ||
            ps.resources.wool < 1 || ps.resources.grain < 1) {
            return { validMove: false, turnOver: false };
        }

        ps.resources.brick--;
        ps.resources.lumber--;
        ps.resources.wool--;
        ps.resources.grain--;
        ps.remainingSettlements--;

        gs.vertices[this.vertexId].building = 'settlement';
        gs.vertices[this.vertexId].owner = this.senderId;

        sacData.gameState.history.unshift(playerHistory(this.senderId, `built a settlement`));
        return sacFinishTurn(sacData, this.senderId);
    }

    Undo(gameData: IGameData): void {
        gameData.gameState.commandHistory.pop();
    }
}

// ─── Build city ───────────────────────────────────────────────────────────────

@serializable
export class SACBuildCity implements IGameCommand {
    id: uuidString = uuidv4() as uuidString;
    timestamp: string = new Date().toISOString();
    gameId: uuidString = NIL_UUID as uuidString;
    senderId: string = 'Unknown';
    senderUsername: string = 'Unknown';
    vertexId: number = 0;
    readonly className = 'SACBuildCity';

    myString() { return 'built a city'; }

    async Execute(gameData: IGameData): Promise<ICommandOutcome> {
        const sacData = gameData as ISettlementsAndCitiesGameData;
        const gs = sacData.specificGameState;

        if (!sacCanBuildOrTrade(gs)) return { validMove: false, turnOver: false };

        const vertex = gs.vertices[this.vertexId];
        if (vertex.building !== 'settlement' || vertex.owner !== this.senderId) {
            return { validMove: false, turnOver: false };
        }

        const ps = gs.playerStates.get(this.senderId);
        if (!ps) return { validMove: false, turnOver: false };
        if (ps.remainingCities <= 0) return { validMove: false, turnOver: false };
        if (ps.resources.grain < 2 || ps.resources.ore < 3) return { validMove: false, turnOver: false };

        ps.resources.grain -= 2;
        ps.resources.ore -= 3;
        ps.remainingCities--;
        ps.remainingSettlements++;

        gs.vertices[this.vertexId].building = 'city';

        sacData.gameState.history.unshift(playerHistory(this.senderId, `built a city`));
        return sacFinishTurn(sacData, this.senderId);
    }

    Undo(gameData: IGameData): void {
        gameData.gameState.commandHistory.pop();
    }
}

// ─── Buy dev card ─────────────────────────────────────────────────────────────

@serializable
export class SACBuyDevCard implements IGameCommand {
    id: uuidString = uuidv4() as uuidString;
    timestamp: string = new Date().toISOString();
    gameId: uuidString = NIL_UUID as uuidString;
    senderId: string = 'Unknown';
    senderUsername: string = 'Unknown';
    readonly className = 'SACBuyDevCard';

    myString() { return 'bought a development card'; }

    async Execute(gameData: IGameData): Promise<ICommandOutcome> {
        const sacData = gameData as ISettlementsAndCitiesGameData;
        const gs = sacData.specificGameState;

        if (!sacCanBuildOrTrade(gs)) return { validMove: false, turnOver: false };
        if (gs.devCardDeck.length === 0) return { validMove: false, turnOver: false };

        const ps = gs.playerStates.get(this.senderId);
        if (!ps) return { validMove: false, turnOver: false };
        if (ps.resources.wool < 1 || ps.resources.grain < 1 || ps.resources.ore < 1) {
            return { validMove: false, turnOver: false };
        }

        ps.resources.wool--;
        ps.resources.grain--;
        ps.resources.ore--;

        const card = gs.devCardDeck.pop()!;
        ps.newDevCards[card]++;
        ps.devCardsBought++;

        sacData.gameState.history.unshift(playerHistory(this.senderId, `bought a development card`));
        return sacFinishTurn(sacData, this.senderId);
    }

    Undo(gameData: IGameData): void {
        gameData.gameState.commandHistory.pop();
    }
}

// ─── Play Road Building ───────────────────────────────────────────────────────

@serializable
export class SACPlayRoadBuilding implements IGameCommand {
    id: uuidString = uuidv4() as uuidString;
    timestamp: string = new Date().toISOString();
    gameId: uuidString = NIL_UUID as uuidString;
    senderId: string = 'Unknown';
    senderUsername: string = 'Unknown';
    readonly className = 'SACPlayRoadBuilding';

    myString() { return 'played Road Building'; }

    async Execute(gameData: IGameData): Promise<ICommandOutcome> {
        const sacData = gameData as ISettlementsAndCitiesGameData;
        const gs = sacData.specificGameState;

        if (!sacCanPlayDevCard(gs)) return { validMove: false, turnOver: false };

        const ps = gs.playerStates.get(this.senderId);
        if (!ps || ps.devCards.roadBuilding < 1) return { validMove: false, turnOver: false };

        ps.devCards.roadBuilding--;
        gs.playedDevCard = true;
        gs.pendingRoadBuilding = 2;

        sacData.gameState.history.unshift(playerHistory(this.senderId, `played Road Building`));
        return { validMove: true, turnOver: false };
    }

    Undo(gameData: IGameData): void {
        gameData.gameState.commandHistory.pop();
    }
}

// ─── Play Year of Plenty ──────────────────────────────────────────────────────

@serializable
export class SACPlayYearOfPlenty implements IGameCommand {
    id: uuidString = uuidv4() as uuidString;
    timestamp: string = new Date().toISOString();
    gameId: uuidString = NIL_UUID as uuidString;
    senderId: string = 'Unknown';
    senderUsername: string = 'Unknown';
    resource1: SAC_Resource = 'lumber';
    resource2: SAC_Resource = 'lumber';
    readonly className = 'SACPlayYearOfPlenty';

    myString() { return `played Year of Plenty (+${this.resource1}, +${this.resource2})`; }

    async Execute(gameData: IGameData): Promise<ICommandOutcome> {
        const sacData = gameData as ISettlementsAndCitiesGameData;
        const gs = sacData.specificGameState;

        if (!sacCanPlayDevCard(gs)) return { validMove: false, turnOver: false };

        const ps = gs.playerStates.get(this.senderId);
        if (!ps || ps.devCards.yearOfPlenty < 1) return { validMove: false, turnOver: false };

        ps.devCards.yearOfPlenty--;
        gs.playedDevCard = true;
        ps.resources[this.resource1]++;
        ps.resources[this.resource2]++;
        ps.resourcesGathered += 2;

        sacData.gameState.history.unshift(playerHistory(this.senderId, `played Year of Plenty (+${this.resource1}, +${this.resource2})`));
        return sacFinishTurn(sacData, this.senderId);
    }

    Undo(gameData: IGameData): void {
        gameData.gameState.commandHistory.pop();
    }
}

// ─── Play Monopoly ────────────────────────────────────────────────────────────

@serializable
export class SACPlayMonopoly implements IGameCommand {
    id: uuidString = uuidv4() as uuidString;
    timestamp: string = new Date().toISOString();
    gameId: uuidString = NIL_UUID as uuidString;
    senderId: string = 'Unknown';
    senderUsername: string = 'Unknown';
    resource: SAC_Resource = 'lumber';
    readonly className = 'SACPlayMonopoly';

    myString() { return `played Monopoly on ${this.resource}`; }

    async Execute(gameData: IGameData): Promise<ICommandOutcome> {
        const sacData = gameData as ISettlementsAndCitiesGameData;
        const gs = sacData.specificGameState;

        if (!sacCanPlayDevCard(gs)) return { validMove: false, turnOver: false };

        const ps = gs.playerStates.get(this.senderId);
        if (!ps || ps.devCards.monopoly < 1) return { validMove: false, turnOver: false };

        ps.devCards.monopoly--;
        gs.playedDevCard = true;

        let total = 0;
        for (const [userId, other] of gs.playerStates) {
            if (userId === this.senderId) continue;
            total += other.resources[this.resource];
            other.resources[this.resource] = 0;
        }
        ps.resources[this.resource] += total;
        ps.resourcesGathered += total;

        sacData.gameState.history.unshift(playerHistory(this.senderId, `played Monopoly on ${this.resource} (+${total})`));
        return sacFinishTurn(sacData, this.senderId);
    }

    Undo(gameData: IGameData): void {
        gameData.gameState.commandHistory.pop();
    }
}

// ─── Maritime trade ───────────────────────────────────────────────────────────

@serializable
export class SACMaritimeTrade implements IGameCommand {
    id: uuidString = uuidv4() as uuidString;
    timestamp: string = new Date().toISOString();
    gameId: uuidString = NIL_UUID as uuidString;
    senderId: string = 'Unknown';
    senderUsername: string = 'Unknown';
    offerResource: SAC_Resource = 'lumber';
    wantResource: SAC_Resource = 'wool';
    readonly className = 'SACMaritimeTrade';

    // The trade ratio comes off the board's harbours, which the command can't
    // read, so the summary names what was swapped and the history line (written
    // with the state to hand) keeps the rate.
    myString() { return `traded ${this.offerResource} for ${this.wantResource}`; }

    async Execute(gameData: IGameData): Promise<ICommandOutcome> {
        const sacData = gameData as ISettlementsAndCitiesGameData;
        const gs = sacData.specificGameState;

        if (!sacCanBuildOrTrade(gs)) return { validMove: false, turnOver: false };
        if (this.offerResource === this.wantResource) return { validMove: false, turnOver: false };

        const ps = gs.playerStates.get(this.senderId);
        if (!ps) return { validMove: false, turnOver: false };

        const ratio = sacTradeRatio(gs, this.senderId, this.offerResource);

        if (ps.resources[this.offerResource] < ratio) return { validMove: false, turnOver: false };

        ps.resources[this.offerResource] -= ratio;
        ps.resources[this.wantResource]++;

        sacData.gameState.history.unshift(playerHistory(this.senderId, `traded ${ratio}x ${this.offerResource} → 1x ${this.wantResource}`));
        return sacFinishTurn(sacData, this.senderId);
    }

    Undo(gameData: IGameData): void {
        gameData.gameState.commandHistory.pop();
    }
}

// ─── End turn ─────────────────────────────────────────────────────────────────

@serializable
export class SACEndTurn implements IGameCommand {
    id: uuidString = uuidv4() as uuidString;
    timestamp: string = new Date().toISOString();
    gameId: uuidString = NIL_UUID as uuidString;
    senderId: string = 'Unknown';
    senderUsername: string = 'Unknown';
    readonly className = 'SACEndTurn';

    myString() { return 'ended their turn'; }

    async Execute(gameData: IGameData): Promise<ICommandOutcome> {
        const sacData = gameData as ISettlementsAndCitiesGameData;
        const gs = sacData.specificGameState;

        if (gs.phase !== 'main') return { validMove: false, turnOver: false };
        if (gs.pendingRobber) return { validMove: false, turnOver: false };
        if (gs.pendingRoadBuilding > 0) return { validMove: false, turnOver: false };
        // Main turn requires a roll first; a special-build turn does not.
        if (!gs.specialBuildActive && !gs.hasRolled) return { validMove: false, turnOver: false };

        sacData.gameState.history.unshift(playerHistory(
            this.senderId,
            gs.specialBuildActive ? `finished their special build` : `ended their turn`,
        ));
        return { validMove: true, turnOver: true };
    }

    Undo(gameData: IGameData): void {
        gameData.gameState.commandHistory.pop();
    }
}
