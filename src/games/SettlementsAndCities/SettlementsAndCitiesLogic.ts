import type { ISettlementsAndCitiesGameData } from "@/games/SettlementsAndCities/SettlementsAndCitiesModels";
import type { SAC_Resource, SAC_DevCard, ISACPlayerState } from "@/games/SettlementsAndCities/board";
import { BOARD_TOPOLOGY, TERRAIN_TO_RESOURCE, calculateLongestRoad, calculateVisibleVP, isValidSettlementVertex, isValidRoadEdge, isValidSetupRoadEdge } from "@/games/SettlementsAndCities/board";
import type { IGameData } from "@/utils/mongodb/GameData";
import type { uuidString } from "@/utils/apiModels/GameDataApi";
import type { ICommandOutcome, IGameCommand, IGameType } from "@/utils/apiModels/gameCommand";
import { serializable } from "@/utils/apiModels/Serialisable";
import { DiceRoll } from "@/utils/games/DiceRoll";
import { v4 as uuidv4, NIL as NIL_UUID } from 'uuid';

// ═══════════════════════════════════════════════════════════════════════════════
//  SETTLEMENTS AND CITIES
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Helper: randomly discard half of a player's cards ───────────────────────
// Records the raw Math.random() draws a command consumes the first time it runs
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
            return this.draws[this.cursor++] ?? Math.random();
        }
        const value = Math.random();
        this.draws.push(value);
        return value;
    }

    get log(): number[] {
        return this.draws;
    }
}

function sacDiscardHalf(ps: ISACPlayerState, rng: SACRandomLog): void {
    const total = sacTotalResources(ps);
    if (total <= 7) return;
    let toDiscard = Math.floor(total / 2);
    const pool: SAC_Resource[] = [];
    const resourceKeys: SAC_Resource[] = ['lumber', 'wool', 'grain', 'brick', 'ore'];
    for (const r of resourceKeys) {
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

// Ends a regular main turn: reset per-turn flags, promote freshly-bought dev
// cards to playable, and pass the dice to the next seat in turn order.
function sacAdvanceMainTurn(sacData: ISettlementsAndCitiesGameData): void {
    const gs = sacData.specificGameState;
    gs.hasRolled = false;
    gs.lastRoll = null;
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
    sacData.gameState.history.unshift('Special Build Phase — other players may build & trade with the bank');
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

    myString() { return `SAC PlaceSettlementSetup vertex=${this.vertexId}`; }

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
                        if (resource) ps.resources[resource]++;
                    }
                }
            }
        }

        gs.pendingRoadSetup = true;
        gs.lastSetupSettlementVertex = this.vertexId;

        sacData.gameState.history.unshift(
            `${this.senderUsername} placed a settlement (setup)`
        );
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

    myString() { return `SAC PlaceRoadSetup edge=${this.edgeId}`; }

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

        sacData.gameState.history.unshift(`${this.senderUsername} placed a road (setup)`);
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

    myString() { return `SAC PlayKnight`; }

    async Execute(gameData: IGameData): Promise<ICommandOutcome> {
        const sacData = gameData as ISettlementsAndCitiesGameData;
        const gs = sacData.specificGameState;

        // Knights may be played before or after rolling (one dev card per turn).
        if (!sacCanPlayDevCard(gs)) return { validMove: false, turnOver: false };

        const ps = gs.playerStates.get(this.senderId);
        if (!ps || ps.devCards.knight < 1) return { validMove: false, turnOver: false };

        ps.devCards.knight--;
        ps.knightsPlayed++;
        gs.playedDevCard = true;
        gs.pendingRobber = true;

        sacUpdateLargestArmy(sacData);

        sacData.gameState.history.unshift(`${this.senderUsername} played a Knight card`);
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

    myString() { return `SAC RollDice`; }

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

        if (roll === 7) {
            sacData.gameState.history.unshift(`${this.senderUsername} rolled a ${roll}`);
            // Discard phase: auto-discard for all players with >7 cards. The
            // shuffle draws are recorded so replay discards the same cards. The
            // playerStates iteration order is stable (userIdList order), so the
            // recorded draws line up with the same players on replay.
            const rng = new SACRandomLog(this.recordedDiscards);
            for (const [, ps] of gs.playerStates) {
                sacDiscardHalf(ps, rng);
            }
            this.recordedDiscards = rng.log;
            gs.pendingRobber = true;
        } else {
            const resourceDistributions = new Map<string, Partial<Record<SAC_Resource, number>>>();
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

                    const playerResources = resourceDistributions.get(vertex.owner) ?? {};
                    playerResources[resource] = (playerResources[resource] ?? 0) + amount;
                    resourceDistributions.set(vertex.owner, playerResources);
                }
            }

            const summary = Array.from(resourceDistributions.entries()).map(([userId, resources]) => {
                const resourceList = Object.entries(resources)
                    .map(([resource, amount]) => `${amount} ${resource}`)
                    .join(', ');
                return `${userId} received ${resourceList}`;
            }).join('; ');

            sacData.gameState.history.unshift(
                `${this.senderUsername} rolled a ${roll}${summary ? `: ${summary}` : ''}`
            );
        }

        gs.hasRolled = true;
        return { validMove: true, turnOver: false };
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

    myString() { return `SAC MoveRobber hex=${this.hexId} stealFrom=${this.stealFromUserId}`; }

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
            const resourceKeys: SAC_Resource[] = ['lumber', 'wool', 'grain', 'brick', 'ore'];
            for (const r of resourceKeys) {
                for (let i = 0; i < victim.resources[r]; i++) pool.push(r);
            }
            if (pool.length > 0) {
                const stealIndex = this.recordedStealIndex ?? Math.floor(Math.random() * pool.length);
                this.recordedStealIndex = stealIndex;
                const stolen = pool[stealIndex];
                victim.resources[stolen]--;
                const thief = gs.playerStates.get(this.senderId);
                if (thief) thief.resources[stolen]++;
                sacData.gameState.history.unshift(
                    `${this.senderUsername} moved the robber and stole a resource`
                );
            }
        } else if (adjacentUserIds.size > 0) {
            // Must specify someone to steal from
            return { validMove: false, turnOver: false };
        } else {
            sacData.gameState.history.unshift(`${this.senderUsername} moved the robber`);
        }

        gs.robberHexIndex = this.hexId;
        gs.pendingRobber = false;
        return { validMove: true, turnOver: false };
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

    myString() { return `SAC BuildRoad edge=${this.edgeId}`; }

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
        sacData.gameState.history.unshift(`${this.senderUsername} built a road`);
        return { validMove: true, turnOver: false };
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

    myString() { return `SAC BuildSettlement vertex=${this.vertexId}`; }

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

        sacData.gameState.history.unshift(`${this.senderUsername} built a settlement`);
        return { validMove: true, turnOver: false };
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

    myString() { return `SAC BuildCity vertex=${this.vertexId}`; }

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

        sacData.gameState.history.unshift(`${this.senderUsername} built a city`);
        return { validMove: true, turnOver: false };
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

    myString() { return `SAC BuyDevCard`; }

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

        sacData.gameState.history.unshift(`${this.senderUsername} bought a development card`);
        return { validMove: true, turnOver: false };
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

    myString() { return `SAC PlayRoadBuilding`; }

    async Execute(gameData: IGameData): Promise<ICommandOutcome> {
        const sacData = gameData as ISettlementsAndCitiesGameData;
        const gs = sacData.specificGameState;

        if (!sacCanPlayDevCard(gs)) return { validMove: false, turnOver: false };

        const ps = gs.playerStates.get(this.senderId);
        if (!ps || ps.devCards.roadBuilding < 1) return { validMove: false, turnOver: false };

        ps.devCards.roadBuilding--;
        gs.playedDevCard = true;
        gs.pendingRoadBuilding = 2;

        sacData.gameState.history.unshift(`${this.senderUsername} played Road Building`);
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

    myString() { return `SAC PlayYearOfPlenty r1=${this.resource1} r2=${this.resource2}`; }

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

        sacData.gameState.history.unshift(
            `${this.senderUsername} played Year of Plenty (+${this.resource1}, +${this.resource2})`
        );
        return { validMove: true, turnOver: false };
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

    myString() { return `SAC PlayMonopoly resource=${this.resource}`; }

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

        sacData.gameState.history.unshift(
            `${this.senderUsername} played Monopoly on ${this.resource} (+${total})`
        );
        return { validMove: true, turnOver: false };
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

    myString() { return `SAC MaritimeTrade offer=${this.offerResource} want=${this.wantResource}`; }

    async Execute(gameData: IGameData): Promise<ICommandOutcome> {
        const sacData = gameData as ISettlementsAndCitiesGameData;
        const gs = sacData.specificGameState;

        if (!sacCanBuildOrTrade(gs)) return { validMove: false, turnOver: false };
        if (this.offerResource === this.wantResource) return { validMove: false, turnOver: false };

        const ps = gs.playerStates.get(this.senderId);
        if (!ps) return { validMove: false, turnOver: false };

        // Determine trade ratio
        let ratio = 4;
        for (const harbor of gs.harbors) {
            const hasAccess = harbor.vertices.some(vid => {
                const v = gs.vertices[vid];
                return v.owner === this.senderId && v.building !== null;
            });
            if (!hasAccess) continue;
            if (harbor.type === '3to1' && ratio > 3) ratio = 3;
            if (harbor.type === this.offerResource) { ratio = 2; break; }
        }

        if (ps.resources[this.offerResource] < ratio) return { validMove: false, turnOver: false };

        ps.resources[this.offerResource] -= ratio;
        ps.resources[this.wantResource]++;

        sacData.gameState.history.unshift(
            `${this.senderUsername} traded ${ratio}x ${this.offerResource} → 1x ${this.wantResource}`
        );
        return { validMove: true, turnOver: false };
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

    myString() { return `SAC EndTurn`; }

    async Execute(gameData: IGameData): Promise<ICommandOutcome> {
        const sacData = gameData as ISettlementsAndCitiesGameData;
        const gs = sacData.specificGameState;

        if (gs.phase !== 'main') return { validMove: false, turnOver: false };
        if (gs.pendingRobber) return { validMove: false, turnOver: false };
        if (gs.pendingRoadBuilding > 0) return { validMove: false, turnOver: false };
        // Main turn requires a roll first; a special-build turn does not.
        if (!gs.specialBuildActive && !gs.hasRolled) return { validMove: false, turnOver: false };

        sacData.gameState.history.unshift(
            gs.specialBuildActive
                ? `${this.senderUsername} finished their special build`
                : `${this.senderUsername} ended their turn`
        );
        return { validMove: true, turnOver: true };
    }

    Undo(gameData: IGameData): void {
        gameData.gameState.commandHistory.pop();
    }
}
