import type { IGameData, IGameDataDocument } from "@/utils/mongodb/GameData";
import type { uuidString } from "@/utils/apiModels/GameDataApi";
import type { ICommandOutcome, IGameCommand, IGameType } from "@/utils/apiModels/gameCommand";
import { serializable } from "@/utils/apiModels/Serialisable";
import { v4 as uuidv4, NIL as NIL_UUID } from 'uuid';
import type { IFiresOutGameData, IFiresOutSpecificGameState } from "@/games/FiresOut/FiresOutModels";
import { edgeBetween, isExteriorSpace, isInteriorSpace, neighboursOf, VICTIMS_LOST_TO_LOSE, VICTIMS_TO_WIN } from "@/games/FiresOut/board";
import {
    AP_COSTS,
    AP_PER_TURN,
    canMoveTo,
    checkOutcome,
    IFiresOutAdvanceFireResult,
    IFiresOutFirefighterState,
    MAX_BANKED_AP,
    moveApCost,
    NextRoll,
    replenishPoi,
    resolveAdvanceFire,
    spendAp,
} from "@/games/FiresOut/rules";
import { playerHistory, userToken } from "@/utils/games/history";
import { DiceRoll } from "@/utils/games/DiceRoll";

// ═══════════════════════════════════════════════════════════════════════════
//  FIRES OUT
// ═══════════════════════════════════════════════════════════════════════════
//
// fires-out-gdd.md §17.6 step 4: the turn's spending half — move (including
// the fire-entry surcharge, carrying a victim, and rescuing one on reaching
// the exterior), doors, extinguish, chop. §17.6 step 6 adds the rest of
// endTurn: Phase 2 Advance Fire and Phase 3 Replenish POI (§7), the only
// place this game's randomness is consumed — everything else in a turn is
// deterministic (§17.4).

const INVALID: ICommandOutcome = { validMove: false, turnOver: false };

// Mongoose doesn't deep-track mutations inside Schema.Types.Mixed fields
// (only top-level reassignment), so every command must explicitly flag the
// whole specificGameState subtree dirty before the route's gameData.save() —
// see docs/new-game.md's Mixed-field gotcha, and Solitaire/TrainTime's own
// markDirty for the same reason.
function markDirty(gameData: IGameData): void {
    (gameData as unknown as Partial<IGameDataDocument>).markModified?.('specificGameState');
}

@serializable
export class FiresOutGameType implements IGameType {
    gameId: uuidString = uuidv4() as uuidString;
    gameType: string = "FiresOut";
    friendlyName: string = "Fires Out!";
    icon: string = "";
    url: string = "firesout";
    readonly className: string = "FiresOutGameType";

    // §17.2 gap 3: the engine's turn belongs to a *player* (currentTurn), but
    // this game's belongs to a *figure* (activeFirefighter). FiresOutAction's
    // 'endTurn' kind has already advanced activeFirefighter and decided
    // turnOver itself (true only when the next figure has a different owner
    // — always true today, since every firefighter has a distinct owner
    // until a later step allows multiple pawns per player); this just syncs
    // currentTurn to match, and refills the AP the new figure's turn opens
    // with — their base allowance plus whatever they banked last time (§8).
    CheckEndTurn(gameData: IGameData, commandOutcome: ICommandOutcome): void {
        if (!commandOutcome.turnOver) return;
        const gs = (gameData as IFiresOutGameData).specificGameState;
        const next = gs.firefighters[gs.activeFirefighter];
        gameData.currentTurn = next.ownerId;
        next.apLeft = AP_PER_TURN + next.bankedAp;
        next.bankedAp = 0;
    }

    CheckGameOver(gameData: IGameData): boolean {
        const fo = gameData as IFiresOutGameData;
        if (fo.complete) return true;

        const gs = fo.specificGameState;
        const outcome = checkOutcome(gs.rescued, gs.lost, gs.edges);
        if (!outcome) return false;

        fo.complete = true;
        fo.winner = '';
        fo.currentTurn = '';
        if (outcome === 'win') {
            fo.endReason = 'teamwin';
            fo.gameState.history.unshift({ text: `${VICTIMS_TO_WIN} victims rescued — the crew wins!` });
        } else {
            fo.endReason = 'teamloss';
            fo.gameState.history.unshift({
                text: outcome === 'buildingCollapsed'
                    ? 'The building has collapsed — the crew loses.'
                    : 'Too many victims have been lost — the crew loses.',
            });
        }
        return true;
    }
}

// ─── FiresOutAction ─────────────────────────────────────────────────────────
// One parameterised command for every action in §8, following Outbreak's
// precedent (§21.4: "four command classes, not fifteen") rather than a class
// per move type.

export type FiresOutActionKind = 'move' | 'door' | 'extinguish' | 'chop' | 'endTurn';

function activeFirefighter(gs: IFiresOutSpecificGameState): IFiresOutFirefighterState | undefined {
    return gs.firefighters[gs.activeFirefighter];
}

function requireTarget(target: number | undefined): target is number {
    return target !== undefined && (isInteriorSpace(target) || isExteriorSpace(target));
}

// §8: move to an adjacent space, at 1/2/2 AP depending on fire and carrying
// (rules.ts's moveApCost), reveals a POI entered for the first time (§10.1),
// and rescues a carried victim on reaching the exterior (§10.2 Family game:
// "any exterior space").
function applyMove(fo: IFiresOutGameData, gs: IFiresOutSpecificGameState, ff: IFiresOutFirefighterState, action: FiresOutAction): ICommandOutcome {
    const target = action.target;
    if (!requireTarget(target)) return INVALID;

    const origin = ff.space;
    const originPoi = gs.spaces[origin].poi;
    // Picking up a revealed victim as you leave their space is the choice a
    // player makes on the move that carries them away, not on the move that
    // revealed them (§10.1-10.2) — so it has to be decided before this move's
    // cost and its into-fire legality are, not applied as an afterthought
    // once a plain 1 AP move has already gone through.
    const willCarry = ff.carrying !== null || (!!action.carry && !!originPoi?.revealed && originPoi.victim);
    // A pretend firefighter carrying iff this move would leave them carrying
    // — canMoveTo/moveApCost only need to know that one boolean, not which
    // move set it.
    const asIfCarrying: IFiresOutFirefighterState = { ...ff, carrying: willCarry ? 'victim' : ff.carrying };

    if (!canMoveTo(gs.spaces, gs.edges, asIfCarrying, origin, target)) return INVALID;
    const cost = moveApCost(gs.spaces, asIfCarrying, target);
    if (!spendAp(ff, cost, null)) return INVALID;

    const notes: string[] = [];
    if (willCarry && !ff.carrying) {
        ff.carrying = 'victim';
        gs.spaces[origin].poi = null;
    }

    ff.space = target;

    const targetPoi = gs.spaces[target].poi;
    if (targetPoi && !targetPoi.revealed) {
        targetPoi.revealed = true;
        if (targetPoi.victim) {
            notes.push('revealed a victim');
        } else {
            gs.spaces[target].poi = null; // §10.1: a false alarm is simply removed
            notes.push('revealed a false alarm');
        }
    }

    if (ff.carrying === 'victim' && isExteriorSpace(target)) {
        gs.rescued++;
        ff.carrying = null;
        notes.push('rescued a victim!');
    }

    const verb = ff.carrying === 'victim' ? 'carried a victim to' : 'moved to';
    const suffix = notes.length ? ` — ${notes.join(', ')}` : '';
    fo.gameState.history.unshift(playerHistory(action.senderId, `${verb} space ${target}${suffix}`));
    return { validMove: true, turnOver: false };
}

// §8: open or close a door, 1 AP.
function applyDoor(fo: IFiresOutGameData, gs: IFiresOutSpecificGameState, ff: IFiresOutFirefighterState, action: FiresOutAction): ICommandOutcome {
    const target = action.target;
    if (!requireTarget(target)) return INVALID;
    const edgeId = edgeBetween(ff.space, target);
    if (edgeId === undefined) return INVALID;
    const edge = gs.edges[edgeId];
    if (edge.kind !== 'door') return INVALID;
    if (!spendAp(ff, AP_COSTS.door, null)) return INVALID;

    edge.doorOpen = !edge.doorOpen;
    fo.gameState.history.unshift(playerHistory(action.senderId, `${edge.doorOpen ? 'opened' : 'closed'} a door`));
    return { validMove: true, turnOver: false };
}

// §8: extinguish — fire becomes smoke, or smoke is removed — 1 AP, on the
// firefighter's own space or any orthogonally adjacent one (adjacency here
// ignores walls, the same as the fire table itself — §9.1).
function applyExtinguish(fo: IFiresOutGameData, gs: IFiresOutSpecificGameState, ff: IFiresOutFirefighterState, action: FiresOutAction): ICommandOutcome {
    const target = action.target;
    if (!requireTarget(target)) return INVALID;
    if (target !== ff.space && !neighboursOf(ff.space).includes(target)) return INVALID;
    const state = gs.spaces[target];
    if (state.threat === 'none') return INVALID;
    if (!spendAp(ff, AP_COSTS.extinguish, null)) return INVALID;

    state.threat = state.threat === 'fire' ? 'smoke' : 'none';
    fo.gameState.history.unshift(playerHistory(action.senderId, `extinguished space ${target} to ${state.threat === 'none' ? 'clear' : 'smoke'}`));
    return { validMove: true, turnOver: false };
}

// §8, §9.2: chop a wall, 2 AP — places 1 damage marker; 2 damage destroys it.
function applyChop(fo: IFiresOutGameData, gs: IFiresOutSpecificGameState, ff: IFiresOutFirefighterState, action: FiresOutAction): ICommandOutcome {
    const target = action.target;
    if (!requireTarget(target)) return INVALID;
    const edgeId = edgeBetween(ff.space, target);
    if (edgeId === undefined) return INVALID;
    const edge = gs.edges[edgeId];
    if (edge.kind !== 'wall' || edge.damage >= 2) return INVALID;
    if (!spendAp(ff, AP_COSTS.chop, null)) return INVALID;

    edge.damage = (edge.damage + 1) as 0 | 1 | 2;
    fo.gameState.history.unshift(playerHistory(action.senderId, `chopped a wall toward space ${target}${edge.damage >= 2 ? ' — destroyed it' : ''}`));
    return { validMove: true, turnOver: false };
}

// §17.4: "recordedRolls is an ordered list with a cursor" — the resolver
// calls nextRoll(sides), which pops the next recorded value if the command
// carried one (a replay) and otherwise rolls fresh and records it, so a
// single Advance Fire's unknown-in-advance number of rolls (the d6/d8, any
// Replenish re-rolls) all round-trip through one flat array. First
// execution records via `used`; replay (which passes a full `recorded`
// array) consumes it instead of rolling. See stripRecordedRandomness
// (gameCommand.ts) for why a live request can never supply `recorded…`
// itself.
function makeNextRoll(recorded: number[] | undefined): { nextRoll: NextRoll; used: number[] } {
    const used: number[] = [];
    let cursor = 0;
    const nextRoll: NextRoll = sides => {
        const roll = recorded && cursor < recorded.length ? recorded[cursor] : DiceRoll(sides);
        cursor++;
        used.push(roll);
        return roll;
    };
    return { nextRoll, used };
}

function describeAdvanceFire(result: IFiresOutAdvanceFireResult): string {
    const rollText = `rolled ${result.rolls.d6},${result.rolls.d8}`;
    switch (result.resolution) {
        case 'smoke': return `Advance Fire: ${rollText} — smoke fills space ${result.target}`;
        case 'fire': return `Advance Fire: ${rollText} — fire catches at space ${result.target}`;
        case 'explosion': return `Advance Fire: ${rollText} — space ${result.target} explodes!`;
    }
}

// §7 Phase 1, §8: bank up to MAX_BANKED_AP unspent AP, hand the turn to the
// next figure, then resolve Phase 2 Advance Fire and Phase 3 Replenish POI
// (§9, §10.1) — the fire's consequences for this figure and every other one
// on the board, not just the figure whose turn is ending.
function applyEndTurn(fo: IFiresOutGameData, gs: IFiresOutSpecificGameState, ff: IFiresOutFirefighterState, action: FiresOutAction): ICommandOutcome {
    const previousOwner = ff.ownerId;
    ff.bankedAp = Math.min(MAX_BANKED_AP, ff.bankedAp + ff.apLeft);
    ff.apLeft = 0;
    gs.activeFirefighter = (gs.activeFirefighter + 1) % gs.firefighters.length;
    const nextOwner = gs.firefighters[gs.activeFirefighter].ownerId;

    fo.gameState.history.unshift(playerHistory(action.senderId, `ended their turn${ff.bankedAp > 0 ? ` with ${ff.bankedAp} AP banked` : ''}`));

    const { nextRoll, used } = makeNextRoll(action.recordedRolls);

    const advance = resolveAdvanceFire(gs.spaces, gs.edges, gs.firefighters, nextRoll);
    fo.gameState.history.unshift({ text: describeAdvanceFire(advance) });
    for (const index of advance.consequences.knockedDownIndices) {
        const knocked = gs.firefighters[index];
        fo.gameState.history.unshift(playerHistory(knocked.ownerId, 'was knocked down and carried outside'));
    }
    if (advance.consequences.victimsLost > 0) {
        gs.lost += advance.consequences.victimsLost;
        fo.gameState.history.unshift({
            text: `${advance.consequences.victimsLost} victim${advance.consequences.victimsLost === 1 ? '' : 's'} lost to the fire (${gs.lost}/${VICTIMS_LOST_TO_LOSE})`,
        });
    }

    const poolBefore = gs.poiPool.length;
    gs.nextPoiId = replenishPoi(gs.spaces, gs.poiPool, nextRoll, gs.nextPoiId);
    const poiPlaced = poolBefore - gs.poiPool.length;
    if (poiPlaced > 0) {
        fo.gameState.history.unshift({ text: `Replenish: ${poiPlaced} new POI marker${poiPlaced === 1 ? '' : 's'} placed` });
    }

    // First execution records what it rolled; a replayed command already
    // carries `recordedRolls` and this is a no-op rewrite of the same array.
    action.recordedRolls = used;

    return { validMove: true, turnOver: nextOwner !== previousOwner };
}

@serializable
export class FiresOutAction implements IGameCommand {
    id: uuidString = uuidv4() as uuidString;
    timestamp: string = new Date().toISOString();
    gameId: uuidString = NIL_UUID as uuidString;
    senderId: string = 'Unknown';
    senderUsername: string = 'Unknown';
    readonly className: string = "FiresOutAction";
    kind: FiresOutActionKind = 'endTurn';
    /** The space a move/door/extinguish/chop targets — meaningless for 'endTurn'. */
    target?: number;
    /** 'move' only: pick up a revealed victim on the firefighter's current space as they leave it (§10.1-10.2). */
    carry?: boolean;
    /** 'endTurn' only: the d6/d8 rolls Advance Fire and Replenish POI consumed, in order (§17.4). Stripped from live requests by stripRecordedRandomness; supplied on replay. */
    recordedRolls?: number[];

    myString(): string {
        return `played ${this.kind}`;
    }

    async Execute(gameData: IGameData): Promise<ICommandOutcome> {
        const fo = gameData as IFiresOutGameData;
        const gs = fo.specificGameState;
        const ff = activeFirefighter(gs);
        if (!ff || ff.ownerId !== this.senderId) return INVALID;

        let outcome: ICommandOutcome;
        switch (this.kind) {
            case 'move': outcome = applyMove(fo, gs, ff, this); break;
            case 'door': outcome = applyDoor(fo, gs, ff, this); break;
            case 'extinguish': outcome = applyExtinguish(fo, gs, ff, this); break;
            case 'chop': outcome = applyChop(fo, gs, ff, this); break;
            case 'endTurn': outcome = applyEndTurn(fo, gs, ff, this); break;
            default: return INVALID;
        }

        if (outcome.validMove) markDirty(gameData);
        return outcome;
    }

    Undo(_gameData: IGameData): void {}
}
