import type { IWorldDominationGameData, IWorldDominationSpecificGameState } from "@/games/WorldDomination/WorldDominationModels";
import {
    TERRITORIES,
    isAdjacent,
    connectedThroughOwnedTerritories,
    computeReinforcement,
    isValidCardSet,
    cardSetValue,
    startingArmiesForPlayerCount,
    cloneWorldDominationState,
    UNDO_STACK_DEPTH,
    IWorldDominationCard,
} from "@/games/WorldDomination/board";
import type { IGameData } from "@/utils/mongodb/GameData";
import type { uuidString } from "@/utils/apiModels/GameDataApi";
import type { ICommandOutcome, IGameCommand, IGameType } from "@/utils/apiModels/gameCommand";
import { serializable } from "@/utils/apiModels/Serialisable";
import { DiceRoll } from "@/utils/games/DiceRoll";
import { v4 as uuidv4, NIL as NIL_UUID } from 'uuid';
import { playerHistory, userToken } from "@/utils/games/history";
import { isDropped, registerPlayerDropoutAdapter } from "@/utils/games/playerDropout";
import { markDirty } from "@/utils/games/markDirty";
import { UNDO_WINDOW_MS, holdOpenFor, undoEntryFor } from "@/utils/games/undo";

// ═══════════════════════════════════════════════════════════════════════════════
//  WORLD DOMINATION
// ═══════════════════════════════════════════════════════════════════════════════

const INVALID: ICommandOutcome = { validMove: false, turnOver: false };

// A player holding 5+ World Domination cards must cash in a set before doing anything else
// (docs/games/worlddomination.md §4.1's "5 or 6 cards" start-of-turn rule and §4.2's
// post-elimination "6 or more" overflow rule are unified to one >=5 threshold
// here, applied both to blocking further reinforce-phase deploys and to
// blocking the attack phase from closing out).
const MUST_CASH_IN_THRESHOLD = 5;

// ─── Undo (docs/undo.md) ────────────────────────────────────────────────────
//
// The ninth game to take a move back. What a World Domination player can take
// back is anything that spends armies or cards they already hold at a known
// value, on a spot they chose: a deployment, a card cash-in, the army count
// they move into a territory they have just conquered, and the move from the
// attack phase to the fortify phase. Nothing about any of those is random.
// Combat is dice, so WorldDominationAttack never pushes — and, as in Realm
// Arena, it also EMPTIES the stack: otherwise a deployment made after a battle
// would sit on top of the snapshots from before it, and undoing that chain
// would reach a board from before the roll — a second go at it.
//
// A fortify, a skipped fortify and the last setup placement each end the turn,
// so they hold it (§5) rather than hand it off: they push their snapshot, set
// `autoEndTurnAt` and report no turn change, and WorldDominationEndTurn — the
// board's "Pass now", and what it sends by itself when the countdown runs out
// — closes the hold. The end-of-turn card draw (riskEndTurn, from the hidden
// deck) therefore happens only on that hand-off, in CheckEndTurn, never inside
// the move that is being held: taking a fortify back can't reveal or return a
// card. Only an attack can end the game, which is never undoable.
//
// World Domination's turn-timeout adapter (turnTimeout.ts) closes a live hold
// with WorldDominationEndTurn but leaves every other expired turn to the cron's
// plain step, which moves `currentTurn` on and restarts the clock with no
// command. So each entry records the turn clock it was pushed in, and a turn the
// timer moved on leaves it stale — Train Time's and Dice Cities' shape. Every
// command but WorldDominationEndTurn and WorldDominationUndo refuses while a
// hold is open: the move that ends the turn is already played, and anything more
// would be played on top of a turn that is only waiting to be handed on (a
// second fortify, say).

/** Forgets every snapshot and closes any hold, on every hand-off. */
function clearUndo(gs: IWorldDominationSpecificGameState): void {
    gs.undoStack = [];
    gs.undoAnchorId = null;
    gs.autoEndTurnAt = null;
}

/**
 * Pushes `before` — the state cloned after a command's validation and before
 * its first mutation — for WorldDominationUndo to restore, and moves the anchor
 * onto the command. With `hold`, also opens the §5 countdown the turn waits on.
 * A stack that is stale (not this player's, in this turn, with nothing since)
 * is started afresh rather than built on, or an old entry would come back
 * within reach.
 */
function commitUndo(riskData: IWorldDominationGameData, command: IGameCommand, before: IWorldDominationSpecificGameState, hold = false): void {
    const gs = riskData.specificGameState;
    const kept = undoEntryFor(riskData, command.senderId) ? (gs.undoStack ?? []) : [];
    gs.undoStack = [...kept, { by: command.senderId, turnStartedAt: riskData.lastTurnTimestamp, state: before }].slice(-UNDO_STACK_DEPTH);
    gs.undoAnchorId = command.id;
    // Explicitly null for a move that holds nothing, so a deadline a timed-out
    // turn left behind can never be read as this move's own.
    gs.autoEndTurnAt = hold ? new Date(Date.now() + UNDO_WINDOW_MS).toISOString() : null;
    markDirty(riskData);
}

// ─── Turn/phase helpers ─────────────────────────────────────────────────────

function worldDominationNextActivePlayer(riskData: IWorldDominationGameData): string {
    const order = riskData.gameState.turnOrder;
    const gs = riskData.specificGameState;
    const idx = order.indexOf(riskData.currentTurn);
    for (let step = 1; step <= order.length; step++) {
        const candidate = order[(idx + step) % order.length];
        const cps = gs.playerStates.get(candidate);
        if (cps && !cps.eliminated && !isDropped(riskData, candidate)) return candidate;
    }
    return riskData.currentTurn;
}

// Advances setup once the active player has placed their entire starting
// allotment: hands off to the next player in turnOrder, or — once everyone has
// placed — starts Turn 1's Reinforce phase (docs §3.2).
function worldDominationAdvanceSetup(riskData: IWorldDominationGameData): void {
    const gs = riskData.specificGameState;
    const order = riskData.gameState.turnOrder;
    const idx = order.indexOf(riskData.currentTurn);
    const nextIdx = idx + 1;

    if (nextIdx >= order.length) {
        const first = order[0];
        gs.phase = 'reinforce';
        riskData.currentTurn = first;
        gs.reinforcementsRemaining = computeReinforcement(first, gs.territories);
        riskData.gameState.history.unshift({ text: `Setup complete — ${userToken(first)} begins Turn 1` });
        return;
    }

    const next = order[nextIdx];
    riskData.currentTurn = next;
    const owned = gs.territories.filter(t => t.owner === next).length;
    gs.reinforcementsRemaining = Math.max(0, startingArmiesForPlayerCount(order.length) - owned);
}

// Ends a Fortify-phase turn: draws the end-of-turn card if a territory was
// conquered (docs §4.4), resets per-turn flags, and starts the next active
// (non-eliminated) player's Reinforce phase.
function riskEndTurn(riskData: IWorldDominationGameData): void {
    const gs = riskData.specificGameState;
    const ps = gs.playerStates.get(riskData.currentTurn);
    if (ps?.conqueredTerritoryThisTurn && gs.cardDeck.length > 0) {
        const card = gs.cardDeck.pop()!;
        ps.cards.push(card);
        riskData.gameState.history.unshift(playerHistory(riskData.currentTurn, `drew a World Domination card`));
    }
    if (ps) ps.conqueredTerritoryThisTurn = false;
    gs.fortifyUsed = false;
    gs.pendingOccupation = null;

    const next = worldDominationNextActivePlayer(riskData);
    riskData.currentTurn = next;
    gs.phase = 'reinforce';
    gs.reinforcementsRemaining = computeReinforcement(next, gs.territories);
}

// ─── Game type ────────────────────────────────────────────────────────────────

@serializable
export class WorldDominationGameType implements IGameType {
    gameId: uuidString = uuidv4() as uuidString;
    gameType: string = "WorldDomination";
    friendlyName: string = "World Domination";
    icon: string = "";
    url: string = "worlddomination";
    readonly className: string = "WorldDominationGameType";

    CheckEndTurn(gameData: IGameData, commandOutcome: ICommandOutcome): void {
        const riskData = gameData as IWorldDominationGameData;
        const gs = riskData.specificGameState;
        if (!commandOutcome.turnOver) return;

        // Whatever hold was open closes with the turn, and the snapshots behind
        // it go too: the anchor has already made them unreachable, so they
        // would only ride along on every save until the next move.
        clearUndo(gs);

        if (gs.phase === 'setup') {
            worldDominationAdvanceSetup(riskData);
            return;
        }
        // Only WorldDominationEndTurn reports turnOver outside setup — the hold
        // a Fortify or a SkipFortify opens is closed by it, so the end-of-turn
        // card draw happens here and never inside the move being held.
        riskEndTurn(riskData);
    }

    CheckGameOver(gameData: IGameData): boolean {
        const riskData = gameData as IWorldDominationGameData;
        const gs = riskData.specificGameState;
        const owners = new Set(gs.territories.map(t => t.owner).filter((o): o is string => o !== null));
        if (owners.size === 1) {
            const winner = [...owners][0];
            riskData.complete = true;
            riskData.winner = winner;
            riskData.currentTurn = '';
            return true;
        }
        return false;
    }
}

// ─── Deploy armies (setup allotment, reinforcement, or a cashed-in top-up) ────

@serializable
export class WorldDominationDeployArmies implements IGameCommand {
    id: uuidString = uuidv4() as uuidString;
    timestamp: string = new Date().toISOString();
    gameId: uuidString = NIL_UUID as uuidString;
    senderId: string = 'Unknown';
    senderUsername: string = 'Unknown';
    territoryId: number = 0;
    count: number = 1;
    readonly className = 'WorldDominationDeployArmies';
    // Taken back by WorldDominationUndo (docs/undo.md). Nothing here is random.
    readonly undoable = true;

    myString() { return `World Domination DeployArmies territory=${this.territoryId} count=${this.count}`; }

    async Execute(gameData: IGameData): Promise<ICommandOutcome> {
        const riskData = gameData as IWorldDominationGameData;
        const gs = riskData.specificGameState;

        // Deploying mid-attack only happens when a card cash-in produced a
        // top-up pool that must be placed before combat can resume.
        const canDeployNow = gs.phase === 'setup' || gs.phase === 'reinforce'
            || (gs.phase === 'attack' && gs.reinforcementsRemaining > 0);
        if (!canDeployNow || holdOpenFor(riskData, this.senderId)) return INVALID;
        if (gs.pendingOccupation) return INVALID;

        const ps = gs.playerStates.get(this.senderId);
        if (!ps) return INVALID;
        if (gs.phase === 'reinforce' && ps.cards.length >= MUST_CASH_IN_THRESHOLD) return INVALID;

        if (this.count < 1 || this.count > gs.reinforcementsRemaining) return INVALID;
        const territory = gs.territories[this.territoryId];
        if (!territory || territory.owner !== this.senderId) return INVALID;

        const before = cloneWorldDominationState(gs, riskData.userIdList);
        territory.armies += this.count;
        gs.reinforcementsRemaining -= this.count;
        ps.totalArmiesDeployed += this.count;

        riskData.gameState.history.unshift(playerHistory(
            this.senderId,
            `placed ${this.count} arm${this.count === 1 ? 'y' : 'ies'} on ${TERRITORIES[this.territoryId].name}`,
        ));

        // The last of a setup allotment ends the player's setup turn, which
        // holds (§5) rather than hands off: WorldDominationEndTurn closes it.
        const endsSetupTurn = gs.reinforcementsRemaining === 0 && gs.phase === 'setup';
        if (gs.reinforcementsRemaining === 0 && gs.phase === 'reinforce') {
            gs.phase = 'attack';
        }
        commitUndo(riskData, this, before, endsSetupTurn);
        return { validMove: true, turnOver: false };
    }
}

// ─── Cash in a set of World Domination cards ────────────────────────────────────────────

@serializable
export class WorldDominationCashInCards implements IGameCommand {
    id: uuidString = uuidv4() as uuidString;
    timestamp: string = new Date().toISOString();
    gameId: uuidString = NIL_UUID as uuidString;
    senderId: string = 'Unknown';
    senderUsername: string = 'Unknown';
    cardIds: string[] = [];
    readonly className = 'WorldDominationCashInCards';
    // Taken back by WorldDominationUndo (docs/undo.md). Nothing here is random.
    readonly undoable = true;

    myString() { return `World Domination CashInCards cards=${this.cardIds.join(',')}`; }

    async Execute(gameData: IGameData): Promise<ICommandOutcome> {
        const riskData = gameData as IWorldDominationGameData;
        const gs = riskData.specificGameState;

        if (gs.phase !== 'reinforce' && gs.phase !== 'attack') return INVALID;
        if (holdOpenFor(riskData, this.senderId)) return INVALID;
        const ps = gs.playerStates.get(this.senderId);
        if (!ps) return INVALID;
        // In the attack phase, cashing in is only for the mandatory overflow
        // after an elimination hands the attacker extra cards (docs §4.2).
        if (gs.phase === 'attack' && ps.cards.length < MUST_CASH_IN_THRESHOLD) return INVALID;

        if (this.cardIds.length !== 3 || new Set(this.cardIds).size !== 3) return INVALID;
        const cards = this.cardIds
            .map(id => ps.cards.find(c => c.id === id))
            .filter((c): c is IWorldDominationCard => !!c);
        if (cards.length !== 3) return INVALID;
        if (!isValidCardSet(cards)) return INVALID;

        const before = cloneWorldDominationState(gs, riskData.userIdList);
        const value = cardSetValue(gs.cardSetsCashedIn);
        gs.cardSetsCashedIn++;
        const idSet = new Set(this.cardIds);
        ps.cards = ps.cards.filter(c => !idSet.has(c.id));
        gs.reinforcementsRemaining += value;

        // Territory match bonus: +2 armies placed directly on a matching territory.
        const matchingCard = cards.find(c => c.territoryId !== null && gs.territories[c.territoryId].owner === this.senderId);
        let bonusText = '';
        if (matchingCard && matchingCard.territoryId !== null) {
            gs.territories[matchingCard.territoryId].armies += 2;
            bonusText = ` (+2 bonus armies on ${TERRITORIES[matchingCard.territoryId].name})`;
        }

        riskData.gameState.history.unshift(playerHistory(this.senderId, `cashed in a card set for ${value} armies${bonusText}`));
        commitUndo(riskData, this, before);
        return { validMove: true, turnOver: false };
    }
}

// ─── Attack (one dice roll) ─────────────────────────────────────────────────

export interface IWorldDominationAttackOutcome extends ICommandOutcome {
    attackerDice: number[];
    defenderDice: number[];
    attackerLosses: number;
    defenderLosses: number;
    conquered: boolean;
    defenderEliminated: string | null;
}

@serializable
export class WorldDominationAttack implements IGameCommand {
    id: uuidString = uuidv4() as uuidString;
    timestamp: string = new Date().toISOString();
    gameId: uuidString = NIL_UUID as uuidString;
    senderId: string = 'Unknown';
    senderUsername: string = 'Unknown';
    fromTerritoryId: number = 0;
    toTerritoryId: number = 0;
    attackerDiceCount: number = 1;
    readonly className = 'WorldDominationAttack';
    // Recorded RNG outcomes, populated on first execution so the roll can be
    // deterministically replayed (turn recap / planning).
    recordedAttackerDice?: number[];
    recordedDefenderDice?: number[];

    myString() { return `World Domination Attack ${this.fromTerritoryId}->${this.toTerritoryId} dice=${this.attackerDiceCount}`; }

    async Execute(gameData: IGameData): Promise<ICommandOutcome> {
        const riskData = gameData as IWorldDominationGameData;
        const gs = riskData.specificGameState;

        if (gs.phase !== 'attack') return INVALID;
        if (gs.pendingOccupation) return INVALID;
        if (gs.reinforcementsRemaining > 0) return INVALID;
        if (holdOpenFor(riskData, this.senderId)) return INVALID;

        const from = gs.territories[this.fromTerritoryId];
        const to = gs.territories[this.toTerritoryId];
        if (!from || !to) return INVALID;
        if (from.owner !== this.senderId) return INVALID;
        if (to.owner === this.senderId || to.owner === null) return INVALID;
        if (!isAdjacent(this.fromTerritoryId, this.toTerritoryId)) return INVALID;
        if (from.armies < 2) return INVALID;

        const maxAttackerDice = Math.min(3, from.armies - 1);
        if (this.attackerDiceCount < 1 || this.attackerDiceCount > maxAttackerDice) return INVALID;

        // Defender always rolls the maximum dice they can (2, or 1 if down to a
        // single army) — a common async-World Domination simplification, since there's no
        // synchronous defender to prompt for a choice (docs §4.2).
        const defenderDiceCount = Math.min(2, to.armies);

        // Dice. Never undoable, and it empties the stack too (see the block
        // above): nothing from before this roll may be reachable after it.
        gs.undoStack = [];
        gs.undoAnchorId = null;
        markDirty(riskData);

        const attackerDice = this.recordedAttackerDice
            ?? Array.from({ length: this.attackerDiceCount }, () => DiceRoll(6));
        const defenderDice = this.recordedDefenderDice
            ?? Array.from({ length: defenderDiceCount }, () => DiceRoll(6));
        this.recordedAttackerDice = attackerDice;
        this.recordedDefenderDice = defenderDice;

        const aSorted = [...attackerDice].sort((a, b) => b - a);
        const dSorted = [...defenderDice].sort((a, b) => b - a);
        const pairs = Math.min(aSorted.length, dSorted.length);
        let attackerLosses = 0;
        let defenderLosses = 0;
        for (let i = 0; i < pairs; i++) {
            // Ties go to the defender (docs §4.2).
            if (aSorted[i] > dSorted[i]) defenderLosses++;
            else attackerLosses++;
        }

        from.armies -= attackerLosses;
        to.armies -= defenderLosses;

        let conquered = false;
        let defenderEliminated: string | null = null;
        const defenderId = to.owner;

        if (to.armies <= 0) {
            conquered = true;
            to.owner = this.senderId;
            to.armies = 0;
            gs.pendingOccupation = {
                fromTerritoryId: this.fromTerritoryId,
                toTerritoryId: this.toTerritoryId,
                minArmies: this.attackerDiceCount,
            };
            const attackerPs = gs.playerStates.get(this.senderId);
            if (attackerPs) attackerPs.conqueredTerritoryThisTurn = true;

            const defenderStillOwnsSomething = gs.territories.some(t => t.owner === defenderId);
            if (defenderId && !defenderStillOwnsSomething) {
                const defenderPs = gs.playerStates.get(defenderId);
                if (defenderPs && attackerPs) {
                    defenderPs.eliminated = true;
                    attackerPs.cards.push(...defenderPs.cards);
                    defenderPs.cards = [];
                    defenderEliminated = defenderId;
                }
            }
        }

        gs.lastBattle = {
            attackerId: this.senderId,
            fromTerritoryId: this.fromTerritoryId,
            toTerritoryId: this.toTerritoryId,
            attackerDice, defenderDice, attackerLosses, defenderLosses, conquered, defenderEliminated,
        };

        riskData.gameState.history.unshift(playerHistory(
            this.senderId,
            `attacked ${TERRITORIES[this.toTerritoryId].name} from ${TERRITORIES[this.fromTerritoryId].name}: ` +
            `[${attackerDice.join(',')}] vs [${defenderDice.join(',')}] — lost ${attackerLosses}, ` +
            `${defenderId ? userToken(defenderId) : 'the defender'} lost ${defenderLosses}` +
            (conquered ? ', conquered!' : '') +
            (defenderEliminated ? ` — ${userToken(defenderEliminated)} eliminated!` : ''),
        ));

        const outcome: IWorldDominationAttackOutcome = {
            validMove: true,
            turnOver: false,
            attackerDice, defenderDice, attackerLosses, defenderLosses, conquered, defenderEliminated,
        };
        return outcome;
    }
}

// ─── Occupy a just-conquered territory ──────────────────────────────────────

@serializable
export class WorldDominationOccupyTerritory implements IGameCommand {
    id: uuidString = uuidv4() as uuidString;
    timestamp: string = new Date().toISOString();
    gameId: uuidString = NIL_UUID as uuidString;
    senderId: string = 'Unknown';
    senderUsername: string = 'Unknown';
    armies: number = 1;
    readonly className = 'WorldDominationOccupyTerritory';
    // Taken back by WorldDominationUndo (docs/undo.md). Nothing here is random.
    readonly undoable = true;

    myString() { return `World Domination OccupyTerritory armies=${this.armies}`; }

    async Execute(gameData: IGameData): Promise<ICommandOutcome> {
        const riskData = gameData as IWorldDominationGameData;
        const gs = riskData.specificGameState;

        if (gs.phase !== 'attack' || !gs.pendingOccupation) return INVALID;
        if (holdOpenFor(riskData, this.senderId)) return INVALID;
        const { fromTerritoryId, toTerritoryId, minArmies } = gs.pendingOccupation;
        const from = gs.territories[fromTerritoryId];
        if (!from || from.owner !== this.senderId) return INVALID;
        if (this.armies < minArmies || this.armies > from.armies - 1) return INVALID;

        // Taking it back restores `pendingOccupation`; the conquest itself, and
        // the roll behind it, stay made — the snapshot is taken after the battle.
        const before = cloneWorldDominationState(gs, riskData.userIdList);
        from.armies -= this.armies;
        gs.territories[toTerritoryId].armies = this.armies;
        gs.pendingOccupation = null;

        riskData.gameState.history.unshift(playerHistory(this.senderId, `moved ${this.armies} armies into ${TERRITORIES[toTerritoryId].name}`));
        commitUndo(riskData, this, before);
        return { validMove: true, turnOver: false };
    }
}

// ─── End the attack phase (move to Fortify) ─────────────────────────────────

@serializable
export class WorldDominationEndAttackPhase implements IGameCommand {
    id: uuidString = uuidv4() as uuidString;
    timestamp: string = new Date().toISOString();
    gameId: uuidString = NIL_UUID as uuidString;
    senderId: string = 'Unknown';
    senderUsername: string = 'Unknown';
    readonly className = 'WorldDominationEndAttackPhase';
    // Taken back by WorldDominationUndo (docs/undo.md). Nothing here is random.
    readonly undoable = true;

    myString() { return `World Domination EndAttackPhase`; }

    async Execute(gameData: IGameData): Promise<ICommandOutcome> {
        const riskData = gameData as IWorldDominationGameData;
        const gs = riskData.specificGameState;

        if (gs.phase !== 'attack') return INVALID;
        if (gs.pendingOccupation) return INVALID;
        if (gs.reinforcementsRemaining > 0) return INVALID;
        const ps = gs.playerStates.get(this.senderId);
        if (!ps || ps.cards.length >= MUST_CASH_IN_THRESHOLD) return INVALID;
        if (holdOpenFor(riskData, this.senderId)) return INVALID;

        const before = cloneWorldDominationState(gs, riskData.userIdList);
        gs.phase = 'fortify';
        riskData.gameState.history.unshift(playerHistory(this.senderId, `ended their attacks`));
        commitUndo(riskData, this, before);
        return { validMove: true, turnOver: false };
    }
}

// ─── Fortify (single move, ends the turn — held, then WorldDominationEndTurn) ─

@serializable
export class WorldDominationFortify implements IGameCommand {
    id: uuidString = uuidv4() as uuidString;
    timestamp: string = new Date().toISOString();
    gameId: uuidString = NIL_UUID as uuidString;
    senderId: string = 'Unknown';
    senderUsername: string = 'Unknown';
    fromTerritoryId: number = 0;
    toTerritoryId: number = 0;
    armies: number = 1;
    readonly className = 'WorldDominationFortify';
    // Taken back by WorldDominationUndo (docs/undo.md). Nothing here is random.
    readonly undoable = true;

    myString() { return `World Domination Fortify ${this.fromTerritoryId}->${this.toTerritoryId} armies=${this.armies}`; }

    async Execute(gameData: IGameData): Promise<ICommandOutcome> {
        const riskData = gameData as IWorldDominationGameData;
        const gs = riskData.specificGameState;

        // The hold, not `fortifyUsed`, is what refuses a second fortify: that
        // flag is only ever left set by a hold, and a hold the turn timer
        // passed on must not lock out the player who inherits the phase.
        if (gs.phase !== 'fortify' || holdOpenFor(riskData, this.senderId)) return INVALID;
        const from = gs.territories[this.fromTerritoryId];
        const to = gs.territories[this.toTerritoryId];
        if (!from || !to) return INVALID;
        if (from.owner !== this.senderId || to.owner !== this.senderId) return INVALID;
        if (this.armies < 1 || this.armies > from.armies - 1) return INVALID;
        if (!connectedThroughOwnedTerritories(this.fromTerritoryId, this.toTerritoryId, this.senderId, gs.territories)) {
            return INVALID;
        }

        const before = cloneWorldDominationState(gs, riskData.userIdList);
        from.armies -= this.armies;
        to.armies += this.armies;
        gs.fortifyUsed = true;

        riskData.gameState.history.unshift(playerHistory(
            this.senderId,
            `fortified ${TERRITORIES[this.toTerritoryId].name} with ${this.armies} armies from ${TERRITORIES[this.fromTerritoryId].name}`,
        ));
        // Ends the turn, so it holds: WorldDominationEndTurn hands it on.
        commitUndo(riskData, this, before, true);
        return { validMove: true, turnOver: false };
    }
}

// ─── Skip fortifying ─────────────────────────────────────────────────────────

@serializable
export class WorldDominationSkipFortify implements IGameCommand {
    id: uuidString = uuidv4() as uuidString;
    timestamp: string = new Date().toISOString();
    gameId: uuidString = NIL_UUID as uuidString;
    senderId: string = 'Unknown';
    senderUsername: string = 'Unknown';
    readonly className = 'WorldDominationSkipFortify';
    // Taken back by WorldDominationUndo (docs/undo.md). Nothing here is random.
    readonly undoable = true;

    myString() { return `World Domination SkipFortify`; }

    async Execute(gameData: IGameData): Promise<ICommandOutcome> {
        const riskData = gameData as IWorldDominationGameData;
        const gs = riskData.specificGameState;

        if (gs.phase !== 'fortify' || holdOpenFor(riskData, this.senderId)) return INVALID;

        const before = cloneWorldDominationState(gs, riskData.userIdList);
        // Spent, as a fortify's is, so the board offers nothing more to do
        // while the turn is held.
        gs.fortifyUsed = true;
        riskData.gameState.history.unshift(playerHistory(this.senderId, `skipped fortifying`));
        commitUndo(riskData, this, before, true);
        return { validMove: true, turnOver: false };
    }
}

// ─── End the turn (closes the hold a fortify, a skip or the last setup placement opened) ───

/**
 * Closes the hold a turn-ending move opened: the board's "Pass now", and what
 * it sends by itself when the countdown runs out. Valid only while that hold is
 * open — `autoEndTurnAt` and the snapshot behind it are server state the move
 * wrote, so this can't be used to skip a turn that hasn't been played. The
 * hand-off itself is CheckEndTurn's: setup advance, or the end-of-turn card
 * draw and the next player's reinforcements.
 */
@serializable
export class WorldDominationEndTurn implements IGameCommand {
    id: uuidString = uuidv4() as uuidString;
    timestamp: string = new Date().toISOString();
    gameId: uuidString = NIL_UUID as uuidString;
    senderId: string = 'Unknown';
    senderUsername: string = 'Unknown';
    readonly className = 'WorldDominationEndTurn';

    myString() { return 'ended their turn'; }

    async Execute(gameData: IGameData): Promise<ICommandOutcome> {
        if (!holdOpenFor(gameData as IWorldDominationGameData, this.senderId)) return INVALID;
        // No line of its own: the move that opened the hold already said what the turn was.
        return { validMove: true, turnOver: true };
    }
}

// A game recorded before turns were held for undo (docs/undo.md §5) has no
// WorldDominationEndTurn after the moves that hold today: a fortify, a skipped
// fortify or the last setup placement ended the turn there and then. The replay
// engine asks this before each recorded command
// (IReplayAdapter.closeUnrecordedHold), and while a hold is open, any command
// but its holder's own end turn or undo means the log never closed it — so it
// is closed the way those rules did, with a WorldDominationEndTurn from the
// player holding it, which hands the turn on exactly as the move itself used
// to (the setup advance, or the card draw and the next player's reinforcements).
// A hold this game's own rules opened is closed by a recorded
// WorldDominationEndTurn, so for those this never fires.
export function worldDominationUnrecordedHoldEnd(gs: IWorldDominationSpecificGameState, holderId: string, next: IGameCommand): WorldDominationEndTurn | null {
    if (!gs.autoEndTurnAt || (gs.undoStack ?? []).at(-1)?.by !== holderId) return null;
    if (next.senderId === holderId && (next.className === 'WorldDominationEndTurn' || next.className === 'WorldDominationUndo')) return null;
    return new WorldDominationEndTurn();
}

// ─── Undo ─────────────────────────────────────────────────────────────────────

@serializable
export class WorldDominationUndo implements IGameCommand {
    id: uuidString = uuidv4() as uuidString;
    timestamp: string = new Date().toISOString();
    gameId: uuidString = NIL_UUID as uuidString;
    senderId: string = 'Unknown';
    senderUsername: string = 'Unknown';
    readonly className = 'WorldDominationUndo';

    myString() { return 'took back their last move'; }

    async Execute(gameData: IGameData): Promise<ICommandOutcome> {
        const riskData = gameData as IWorldDominationGameData;
        const gs = riskData.specificGameState;

        // A snapshot is only good for the command directly behind it, in the
        // turn it was taken in, and only for the player who took it
        // (docs/undo.md §4).
        const entry = undoEntryFor(riskData, this.senderId);
        if (!entry) return INVALID;

        gs.undoStack.pop();
        const { undoStack: _undoStack, undoAnchorId: _undoAnchorId, ...restored } = entry.state;
        // `autoEndTurnAt` comes back with the rest, closing a hold. No
        // `currentTurn` to put back: the hold never let the turn go.
        Object.assign(gs, restored);
        gs.undoAnchorId = this.id;

        riskData.gameState.history.unshift(playerHistory(this.senderId, 'took back their last move'));
        markDirty(gameData);
        return { validMove: true, turnOver: false };
    }
}

// A player who stops turning up stops taking turns, and nothing else changes:
// their armies stay where they stand, holding their territories against
// whoever comes for them — they just never reinforce, attack or fortify again.
// Conquest is still the only way off the map. Taking their last territory
// eliminates them the usual way, cards and all, and the game still ends when
// one player holds the world.
//
// Not during setup, whose hand-off walks `turnOrder` seat by seat to deal out
// the starting allotments: a seat that stopped placing would leave the board
// short of the armies setup is dealing. That's the one phase that still ends
// the game.
registerPlayerDropoutAdapter({
    className: "WorldDominationGameType",
    minPlayers: 2,
    canDrop(gameData) {
        return (gameData as IWorldDominationGameData).specificGameState.phase !== 'setup';
    },
    // A drop is recorded in gameData.gameState (playerDropout.ts), not in
    // specificGameState, and changes nothing on the board, so no snapshot can
    // put a dropped seat back. The undo stack is left alone: clearing it would
    // close another player's live hold without a hand-off.
    dropPlayer() {},
});
