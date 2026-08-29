import type { IWorldDominationGameData } from "@/games/WorldDomination/WorldDominationModels";
import {
    TERRITORIES,
    isAdjacent,
    connectedThroughOwnedTerritories,
    computeReinforcement,
    isValidCardSet,
    cardSetValue,
    startingArmiesForPlayerCount,
    IWorldDominationCard,
} from "@/games/WorldDomination/board";
import type { IGameData } from "@/utils/mongodb/GameData";
import type { uuidString } from "@/utils/apiModels/GameDataApi";
import type { ICommandOutcome, IGameCommand, IGameType } from "@/utils/apiModels/gameCommand";
import { serializable } from "@/utils/apiModels/Serialisable";
import { DiceRoll } from "@/utils/games/DiceRoll";
import { v4 as uuidv4, NIL as NIL_UUID } from 'uuid';
import { playerHistory, userToken } from "@/utils/games/history";

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

// ─── Turn/phase helpers ─────────────────────────────────────────────────────

function worldDominationNextActivePlayer(riskData: IWorldDominationGameData): string {
    const order = riskData.gameState.turnOrder;
    const gs = riskData.specificGameState;
    const idx = order.indexOf(riskData.currentTurn);
    for (let step = 1; step <= order.length; step++) {
        const candidate = order[(idx + step) % order.length];
        const cps = gs.playerStates.get(candidate);
        if (cps && !cps.eliminated) return candidate;
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

        if (gs.phase === 'setup') {
            worldDominationAdvanceSetup(riskData);
            return;
        }
        // Only a Fortify-phase command (WorldDominationFortify / WorldDominationSkipFortify) reports
        // turnOver outside setup — see those commands' Execute().
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

    myString() { return `World Domination DeployArmies territory=${this.territoryId} count=${this.count}`; }

    async Execute(gameData: IGameData): Promise<ICommandOutcome> {
        const riskData = gameData as IWorldDominationGameData;
        const gs = riskData.specificGameState;

        // Deploying mid-attack only happens when a card cash-in produced a
        // top-up pool that must be placed before combat can resume.
        const canDeployNow = gs.phase === 'setup' || gs.phase === 'reinforce'
            || (gs.phase === 'attack' && gs.reinforcementsRemaining > 0);
        if (!canDeployNow) return INVALID;
        if (gs.pendingOccupation) return INVALID;

        const ps = gs.playerStates.get(this.senderId);
        if (!ps) return INVALID;
        if (gs.phase === 'reinforce' && ps.cards.length >= MUST_CASH_IN_THRESHOLD) return INVALID;

        if (this.count < 1 || this.count > gs.reinforcementsRemaining) return INVALID;
        const territory = gs.territories[this.territoryId];
        if (!territory || territory.owner !== this.senderId) return INVALID;

        territory.armies += this.count;
        gs.reinforcementsRemaining -= this.count;
        ps.totalArmiesDeployed += this.count;

        riskData.gameState.history.unshift(playerHistory(
            this.senderId,
            `placed ${this.count} arm${this.count === 1 ? 'y' : 'ies'} on ${TERRITORIES[this.territoryId].name}`,
        ));

        if (gs.reinforcementsRemaining === 0) {
            if (gs.phase === 'setup') {
                return { validMove: true, turnOver: true };
            }
            if (gs.phase === 'reinforce') {
                gs.phase = 'attack';
            }
        }
        return { validMove: true, turnOver: false };
    }

    Undo(gameData: IGameData): void {
        gameData.gameState.commandHistory.pop();
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

    myString() { return `World Domination CashInCards cards=${this.cardIds.join(',')}`; }

    async Execute(gameData: IGameData): Promise<ICommandOutcome> {
        const riskData = gameData as IWorldDominationGameData;
        const gs = riskData.specificGameState;

        if (gs.phase !== 'reinforce' && gs.phase !== 'attack') return INVALID;
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
        return { validMove: true, turnOver: false };
    }

    Undo(gameData: IGameData): void {
        gameData.gameState.commandHistory.pop();
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

    Undo(gameData: IGameData): void {
        gameData.gameState.commandHistory.pop();
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

    myString() { return `World Domination OccupyTerritory armies=${this.armies}`; }

    async Execute(gameData: IGameData): Promise<ICommandOutcome> {
        const riskData = gameData as IWorldDominationGameData;
        const gs = riskData.specificGameState;

        if (gs.phase !== 'attack' || !gs.pendingOccupation) return INVALID;
        const { fromTerritoryId, toTerritoryId, minArmies } = gs.pendingOccupation;
        const from = gs.territories[fromTerritoryId];
        if (!from || from.owner !== this.senderId) return INVALID;
        if (this.armies < minArmies || this.armies > from.armies - 1) return INVALID;

        from.armies -= this.armies;
        gs.territories[toTerritoryId].armies = this.armies;
        gs.pendingOccupation = null;

        riskData.gameState.history.unshift(playerHistory(this.senderId, `moved ${this.armies} armies into ${TERRITORIES[toTerritoryId].name}`));
        return { validMove: true, turnOver: false };
    }

    Undo(gameData: IGameData): void {
        gameData.gameState.commandHistory.pop();
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

    myString() { return `World Domination EndAttackPhase`; }

    async Execute(gameData: IGameData): Promise<ICommandOutcome> {
        const riskData = gameData as IWorldDominationGameData;
        const gs = riskData.specificGameState;

        if (gs.phase !== 'attack') return INVALID;
        if (gs.pendingOccupation) return INVALID;
        if (gs.reinforcementsRemaining > 0) return INVALID;
        const ps = gs.playerStates.get(this.senderId);
        if (!ps || ps.cards.length >= MUST_CASH_IN_THRESHOLD) return INVALID;

        gs.phase = 'fortify';
        riskData.gameState.history.unshift(playerHistory(this.senderId, `ended their attacks`));
        return { validMove: true, turnOver: false };
    }

    Undo(gameData: IGameData): void {
        gameData.gameState.commandHistory.pop();
    }
}

// ─── Fortify (single move, ends the turn) ───────────────────────────────────

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

    myString() { return `World Domination Fortify ${this.fromTerritoryId}->${this.toTerritoryId} armies=${this.armies}`; }

    async Execute(gameData: IGameData): Promise<ICommandOutcome> {
        const riskData = gameData as IWorldDominationGameData;
        const gs = riskData.specificGameState;

        if (gs.phase !== 'fortify' || gs.fortifyUsed) return INVALID;
        const from = gs.territories[this.fromTerritoryId];
        const to = gs.territories[this.toTerritoryId];
        if (!from || !to) return INVALID;
        if (from.owner !== this.senderId || to.owner !== this.senderId) return INVALID;
        if (this.armies < 1 || this.armies > from.armies - 1) return INVALID;
        if (!connectedThroughOwnedTerritories(this.fromTerritoryId, this.toTerritoryId, this.senderId, gs.territories)) {
            return INVALID;
        }

        from.armies -= this.armies;
        to.armies += this.armies;
        gs.fortifyUsed = true;

        riskData.gameState.history.unshift(playerHistory(
            this.senderId,
            `fortified ${TERRITORIES[this.toTerritoryId].name} with ${this.armies} armies from ${TERRITORIES[this.fromTerritoryId].name}`,
        ));
        return { validMove: true, turnOver: true };
    }

    Undo(gameData: IGameData): void {
        gameData.gameState.commandHistory.pop();
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

    myString() { return `World Domination SkipFortify`; }

    async Execute(gameData: IGameData): Promise<ICommandOutcome> {
        const riskData = gameData as IWorldDominationGameData;
        const gs = riskData.specificGameState;

        if (gs.phase !== 'fortify' || gs.fortifyUsed) return INVALID;

        riskData.gameState.history.unshift(playerHistory(this.senderId, `skipped fortifying`));
        return { validMove: true, turnOver: true };
    }

    Undo(gameData: IGameData): void {
        gameData.gameState.commandHistory.pop();
    }
}
