import type { IGameData, IGameDataDocument } from "@/utils/mongodb/GameData";
import type { uuidString } from "@/utils/apiModels/GameDataApi";
import type { ICommandOutcome, IGameCommand, IGameType } from "@/utils/apiModels/gameCommand";
import { serializable } from "@/utils/apiModels/Serialisable";
import { v4 as uuidv4, NIL as NIL_UUID } from 'uuid';
import type { IFiresOutGameData, IFiresOutSpecificGameState } from "@/games/FiresOut/FiresOutModels";
import { edgeBetween, isExteriorSpace, isInteriorSpace, neighboursOf, quadrantOf, vehicleTrackNeighbours, VICTIMS_LOST_TO_LOSE, VICTIMS_TO_WIN } from "@/games/FiresOut/board";
import {
    AP_COSTS,
    canCrewChange,
    canDisposeHazmatOnSite,
    canFireDeckGunAt,
    canMoveTo,
    canTreat,
    checkOutcome,
    chopApCost,
    deckGunApCost,
    extinguishApCost,
    fireCaptainCanControlOthers,
    fireDeckGun,
    IFiresOutAdvanceFireResult,
    IFiresOutFirefighterState,
    isRescuePoint,
    MAX_BANKED_AP,
    moveApCost,
    NextRoll,
    refillFirefighterAp,
    replenishPoi,
    resolveAdvanceFire,
    revealPoiAt,
    SpecialistId,
    SPECIALISTS,
    specialistDef,
    spendAp,
} from "@/games/FiresOut/rules";
import { playerHistory } from "@/utils/games/history";
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
    // with — their specialist's full allowance (§11, §17.6 step 10) or the
    // flat rate in the Family game, plus whatever they banked last time (§8).
    CheckEndTurn(gameData: IGameData, commandOutcome: ICommandOutcome): void {
        if (!commandOutcome.turnOver) return;
        const gs = (gameData as IFiresOutGameData).specificGameState;
        const next = gs.firefighters[gs.activeFirefighter];
        gameData.currentTurn = next.ownerId;
        refillFirefighterAp(next, gs.ruleset);
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

export type FiresOutActionKind =
    | 'move' | 'door' | 'extinguish' | 'chop' | 'drive' | 'deckGun'
    | 'reveal' | 'treat' | 'disposeHazmat' | 'crewChange' | 'endTurn';

function activeFirefighter(gs: IFiresOutSpecificGameState): IFiresOutFirefighterState | undefined {
    return gs.firefighters[gs.activeFirefighter];
}

function requireTarget(target: number | undefined): target is number {
    return target !== undefined && (isInteriorSpace(target) || isExteriorSpace(target));
}

// §11 Fire Captain: `action.targetUserId`, if set, names whose pawn a 'move'
// command moves — the sender (`ff`) still pays with their own AP. Named and
// shaped after Outbreak's own `targetUserId`/dispatcherCanControlOthers
// (OutbreakLogic.ts:484-487, rules.ts:410-412) — the same "actor pays, mover
// moves" split, for the same reason (§17.3: "it's the pawn that moves, not
// the turn"). Resolving to `ff` itself (no direction) is always allowed.
function resolveMover(gs: IFiresOutSpecificGameState, ff: IFiresOutFirefighterState, action: FiresOutAction): IFiresOutFirefighterState | null {
    if (action.targetUserId === undefined || action.targetUserId === ff.ownerId) return ff;
    if (!fireCaptainCanControlOthers(ff.specialist)) return null;
    return gs.firefighters.find(f => f.ownerId === action.targetUserId) ?? null;
}

// §8, §11: move to an adjacent space, at 1/2/2 AP depending on fire and
// carrying (rules.ts's moveApCost), reveals a POI entered for the first time
// (§10.1), rescues a carried or escorted victim on reaching the rescue point
// (§10.2, isRescuePoint), and disposes of a carried hazmat the same way on
// reaching any exterior space (§8's "Dispose of hazmat ... carried out of the
// building" row — no Ambulance requirement, unlike a victim). A Fire Captain
// may move a teammate's firefighter instead of their own (resolveMover),
// paying with their own command AP.
function applyMove(fo: IFiresOutGameData, gs: IFiresOutSpecificGameState, ff: IFiresOutFirefighterState, action: FiresOutAction): ICommandOutcome {
    const target = action.target;
    if (!requireTarget(target)) return INVALID;
    const mover = resolveMover(gs, ff, action);
    if (!mover) return INVALID;

    const origin = mover.space;
    const originSpace = gs.spaces[origin];
    // Picking up a revealed victim or a hazmat as you leave their space is
    // the choice made on the move that carries it away (§10.1-10.2, §8's
    // hazmat-carry row) — decided before this move's cost and into-fire
    // legality, not applied as an afterthought once a plain move already
    // went through. A revealed victim takes priority over a hazmat sharing
    // the same space; only one thing can be carried at a time.
    let pickup: 'victim' | 'hazmat' | null = null;
    if (mover.carrying === null && action.carry) {
        if (originSpace.poi?.revealed && originSpace.poi.victim) pickup = 'victim';
        else if (originSpace.hazmat) pickup = 'hazmat';
    }
    // A pretend mover carrying iff this move would leave them carrying —
    // canMoveTo/moveApCost only need to know what, not which move set it.
    const asIfCarrying: IFiresOutFirefighterState = pickup ? { ...mover, carrying: pickup } : mover;

    if (!canMoveTo(gs.spaces, gs.edges, asIfCarrying, origin, target)) return INVALID;
    const cost = moveApCost(gs.spaces, asIfCarrying, target);
    // The actor pays: their own moveChop pool (Rescue Specialist) when
    // moving themselves, or their command pool (Fire Captain) when directing
    // someone else — never the mover's own restrictedAp, since it's the
    // actor's AP being spent (§11's "spending their own actions").
    if (!spendAp(ff, cost, mover === ff ? 'moveChop' : 'command')) return INVALID;

    if (pickup === 'victim') { mover.carrying = 'victim'; originSpace.poi = null; }
    else if (pickup === 'hazmat') { mover.carrying = 'hazmat'; originSpace.hazmat = false; }

    mover.space = target;

    const notes: string[] = [];
    const revealed = revealPoiAt(gs.spaces, target);
    if (revealed) notes.push(revealed.victim ? 'revealed a victim' : 'revealed a false alarm');

    // §10.2: any exterior space rescues in the Family game; the Experienced
    // game requires reaching the Ambulance specifically. An escorted victim
    // (§11 Paramedic) rescues exactly like a carried one.
    if ((mover.carrying === 'victim' || mover.carrying === 'escort') && isRescuePoint(gs.ruleset, gs.ambulance, target)) {
        gs.rescued++;
        mover.carrying = null;
        notes.push('rescued a victim!');
    } else if (mover.carrying === 'hazmat' && isExteriorSpace(target)) {
        mover.carrying = null;
        notes.push('disposed of the hazmat');
    }

    const verb = mover.carrying === 'victim' || mover.carrying === 'escort' ? 'carried a victim to'
        : mover.carrying === 'hazmat' ? 'carried a hazmat to' : 'moved to';
    const directed = mover !== ff ? " (directing a teammate's firefighter)" : '';
    const suffix = notes.length ? ` — ${notes.join(', ')}` : '';
    fo.gameState.history.unshift(playerHistory(action.senderId, `${verb} space ${target}${directed}${suffix}`));
    return { validMove: true, turnOver: false };
}

// §8, §11: open or close a door, 1 AP — a Fire Captain's command AP first.
function applyDoor(fo: IFiresOutGameData, gs: IFiresOutSpecificGameState, ff: IFiresOutFirefighterState, action: FiresOutAction): ICommandOutcome {
    const target = action.target;
    if (!requireTarget(target)) return INVALID;
    const edgeId = edgeBetween(ff.space, target);
    if (edgeId === undefined) return INVALID;
    const edge = gs.edges[edgeId];
    if (edge.kind !== 'door') return INVALID;
    if (!spendAp(ff, AP_COSTS.door, 'command')) return INVALID;

    edge.doorOpen = !edge.doorOpen;
    fo.gameState.history.unshift(playerHistory(action.senderId, `${edge.doorOpen ? 'opened' : 'closed'} a door`));
    return { validMove: true, turnOver: false };
}

// §8, §11: extinguish — fire becomes smoke, or smoke is removed — on the
// firefighter's own space or any orthogonally adjacent one (adjacency here
// ignores walls, the same as the fire table itself — §9.1). A CAFS
// Firefighter's extinguish AP first; a Paramedic pays 1 AP more.
function applyExtinguish(fo: IFiresOutGameData, gs: IFiresOutSpecificGameState, ff: IFiresOutFirefighterState, action: FiresOutAction): ICommandOutcome {
    const target = action.target;
    if (!requireTarget(target)) return INVALID;
    if (target !== ff.space && !neighboursOf(ff.space).includes(target)) return INVALID;
    const state = gs.spaces[target];
    if (state.threat === 'none') return INVALID;
    if (!spendAp(ff, extinguishApCost(ff), 'extinguish')) return INVALID;

    state.threat = state.threat === 'fire' ? 'smoke' : 'none';
    fo.gameState.history.unshift(playerHistory(action.senderId, `extinguished space ${target} to ${state.threat === 'none' ? 'clear' : 'smoke'}`));
    return { validMove: true, turnOver: false };
}

// §8, §9.2, §11: chop a wall — places 1 damage marker; 2 damage destroys it.
// A Rescue Specialist's move/chop AP first, and their wall costs 1 AP instead
// of 2 (chopApCost).
function applyChop(fo: IFiresOutGameData, gs: IFiresOutSpecificGameState, ff: IFiresOutFirefighterState, action: FiresOutAction): ICommandOutcome {
    const target = action.target;
    if (!requireTarget(target)) return INVALID;
    const edgeId = edgeBetween(ff.space, target);
    if (edgeId === undefined) return INVALID;
    const edge = gs.edges[edgeId];
    if (edge.kind !== 'wall' || edge.damage >= 2) return INVALID;
    if (!spendAp(ff, chopApCost(ff), 'moveChop')) return INVALID;

    edge.damage = (edge.damage + 1) as 0 | 1 | 2;
    fo.gameState.history.unshift(playerHistory(action.senderId, `chopped a wall toward space ${target}${edge.damage >= 2 ? ' — destroyed it' : ''}`));
    return { validMove: true, turnOver: false };
}

// §11 Imaging Technician: reveal any interior POI remotely, without
// travelling to it — the same flip-and-redact revealPoiAt does for an
// arriving move, just not tied to one.
function applyReveal(fo: IFiresOutGameData, gs: IFiresOutSpecificGameState, ff: IFiresOutFirefighterState, action: FiresOutAction): ICommandOutcome {
    const target = action.target;
    if (!requireTarget(target) || !isInteriorSpace(target)) return INVALID;
    if (ff.specialist !== 'imagingTechnician') return INVALID;
    const poi = gs.spaces[target].poi;
    if (!poi || poi.revealed) return INVALID;
    if (!spendAp(ff, AP_COSTS.reveal, null)) return INVALID;

    const revealed = revealPoiAt(gs.spaces, target)!; // just checked above
    fo.gameState.history.unshift(playerHistory(action.senderId,
        `remotely revealed a ${revealed.victim ? 'victim' : 'false alarm'} at space ${target}`));
    return { validMove: true, turnOver: false };
}

// §11 Paramedic: treat a revealed victim on their own space for 1 AP, so a
// later move carries them at the ordinary per-space rate (moveApCost) rather
// than carryPerSpace, without ever picking them up as 'victim'.
function applyTreat(fo: IFiresOutGameData, gs: IFiresOutSpecificGameState, ff: IFiresOutFirefighterState, action: FiresOutAction): ICommandOutcome {
    if (!canTreat(gs.spaces, ff)) return INVALID;
    if (!spendAp(ff, AP_COSTS.treat, null)) return INVALID;

    ff.carrying = 'escort';
    gs.spaces[ff.space].poi = null;
    fo.gameState.history.unshift(playerHistory(action.senderId, 'treated a victim, who now walks alongside'));
    return { validMove: true, turnOver: false };
}

// §11 Hazmat Technician: remove a hazmat on their own space on the spot,
// instead of carrying it out of the building (§8's other disposal route,
// applyMove above).
function applyDisposeHazmat(fo: IFiresOutGameData, gs: IFiresOutSpecificGameState, ff: IFiresOutFirefighterState, action: FiresOutAction): ICommandOutcome {
    if (!canDisposeHazmatOnSite(gs.spaces, ff)) return INVALID;
    if (!spendAp(ff, AP_COSTS.disposeHazmatOnSite, null)) return INVALID;

    gs.spaces[ff.space].hazmat = false;
    fo.gameState.history.unshift(playerHistory(action.senderId, 'removed a hazmat on the spot'));
    return { validMove: true, turnOver: false };
}

// §8, §11: swap Specialist cards for 2 AP, from the Engine, Experienced only.
// Takes effect immediately for future AP arithmetic (canAffordAp/spendAp all
// read `ff.specialist` live), but a fresh restricted pool only appears at
// this firefighter's *next* turn (refillFirefighterAp, run by CheckEndTurn)
// — swapping mid-turn doesn't retroactively grant this turn's bonus AP.
function applyCrewChange(fo: IFiresOutGameData, gs: IFiresOutSpecificGameState, ff: IFiresOutFirefighterState, action: FiresOutAction): ICommandOutcome {
    if (!canCrewChange(gs.ruleset, ff, gs.engine)) return INVALID;
    const specialist = action.specialist;
    if (!specialist || !SPECIALISTS.some(s => s.id === specialist)) return INVALID;
    if (!spendAp(ff, AP_COSTS.crewChange, null)) return INVALID;

    ff.specialist = specialist;
    ff.restrictedAp = null;
    fo.gameState.history.unshift(playerHistory(action.senderId, `swapped to the ${specialistDef(specialist).label}`));
    return { validMove: true, turnOver: false };
}

// §8, §12.1-12.2, §17.6 step 9: drive the Engine or the Ambulance one parking
// spot along its own track (board.ts's vehicleTrackNeighbours), 2 AP —
// Experienced only (§6.1 step 7 sets vehicles aside in the Family game).
// "Firefighters in the Engine's space may ride along when it is driven"
// (§12.1): everyone standing at the vehicle's space — the driver included —
// moves with it, at no extra cost. `action.vehicle` picks which one, since a
// firefighter starting the action at neither vehicle has nothing to drive.
function applyDrive(fo: IFiresOutGameData, gs: IFiresOutSpecificGameState, ff: IFiresOutFirefighterState, action: FiresOutAction): ICommandOutcome {
    if (gs.ruleset !== 'experienced') return INVALID;
    const vehicle = action.vehicle;
    if (vehicle !== 'engine' && vehicle !== 'ambulance') return INVALID;
    const vehicleSpace = vehicle === 'engine' ? gs.engine : gs.ambulance;
    if (ff.space !== vehicleSpace) return INVALID;

    const target = action.target;
    if (!requireTarget(target) || !vehicleTrackNeighbours(vehicleSpace).includes(target)) return INVALID;
    if (!spendAp(ff, AP_COSTS.drive, null)) return INVALID;

    const riders = gs.firefighters.filter(f => f.space === vehicleSpace);
    for (const rider of riders) rider.space = target;
    if (vehicle === 'engine') gs.engine = target; else gs.ambulance = target;

    const vehicleName = vehicle === 'engine' ? 'Engine' : 'Ambulance';
    const riderNote = riders.length > 1 ? ` with ${riders.length - 1} other firefighter${riders.length > 2 ? 's' : ''} riding along` : '';
    fo.gameState.history.unshift(playerHistory(action.senderId, `drove the ${vehicleName} to space ${target}${riderNote}`));
    return { validMove: true, turnOver: false };
}

// §12.3, §17.6 steps 9-10: fire the deck gun from the Engine — the only
// non-endTurn action that consumes a die roll (see makeNextRoll below), since
// §12.3's targeting is itself random. This doesn't touch Advance Fire (no
// spreading, no consequences) — it only clears threat — so it doesn't run
// afoul of §17.4's "keep Advance Fire out of every other kind"; a future
// crew-planner step (17.6 step 13) that wants a dice-free frozen-fire plan
// will need to exclude this kind too, the same way it already excludes
// endTurn, but that's that step's decision to make, not this one's.
// A Driver/Operator (§11) pays 2 AP instead of 4 (deckGunApCost), and — "re-
// rolls off-target deck gun shots" — automatically fires once more into the
// same quadrant if the first shot cleared nothing, still within the same
// `nextRoll` cursor so a replay reproduces exactly this many rolls.
function applyDeckGun(fo: IFiresOutGameData, gs: IFiresOutSpecificGameState, ff: IFiresOutFirefighterState, action: FiresOutAction): ICommandOutcome {
    if (gs.ruleset !== 'experienced') return INVALID;
    const target = action.target;
    if (!requireTarget(target) || !canFireDeckGunAt(gs.firefighters, ff, gs.engine, target)) return INVALID;
    if (!spendAp(ff, deckGunApCost(ff), null)) return INVALID;

    const { nextRoll, used } = makeNextRoll(action.recordedRolls);
    const quadrant = quadrantOf(target);
    let result = fireDeckGun(gs.spaces, quadrant, nextRoll);
    let rerolled = false;
    if (result.clearedSpaces.length === 0 && ff.specialist === 'driverOperator') {
        result = fireDeckGun(gs.spaces, quadrant, nextRoll);
        rerolled = true;
    }
    action.recordedRolls = used;

    const effect = result.clearedSpaces.length
        ? `cleared ${result.clearedSpaces.length} space${result.clearedSpaces.length === 1 ? '' : 's'}`
        : 'no effect';
    const rerollNote = rerolled ? ' — re-rolled the off-target shot' : '';
    fo.gameState.history.unshift(playerHistory(action.senderId, `fired the deck gun at space ${result.target} — ${effect}${rerollNote}`));
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

// §17.6 step 7: what an 'endTurn' command's Advance Fire did, alongside the
// plain validMove/turnOver every command returns — the structured twin of
// describeAdvanceFire's log line, for FiresOutAdvanceFireResult.tsx to
// animate rather than parse back out of history text. Nothing here is hidden
// information (§10.1's redaction is about POI *identity*, not the count of
// victims a fire caught), so it needs no per-viewer treatment the way
// gameStateToModel's response does. Follows SnakesAndLadders'
// ISnakesAndLaddersDiceRollOutcome precedent: a per-game outcome extends the
// shared ICommandOutcome rather than growing a second response envelope.
export interface IFiresOutAdvanceFireOutcome {
    rolls: { d6: number; d8: number };
    target: number;
    resolution: 'smoke' | 'fire' | 'explosion';
    /** Owner ids of firefighters caught by the fire across this Advance Fire and any hot spot flare-ups it chained into. */
    knockedDownOwnerIds: string[];
    victimsLost: number;
    poiPlaced: number;
    /** §9.4: how many additional full Advance Fire resolutions this one's hot spots chained into. */
    flareUpCount: number;
}

export interface IFiresOutEndTurnOutcome extends ICommandOutcome {
    advanceFire: IFiresOutAdvanceFireOutcome;
}

function describeAdvanceFire(result: IFiresOutAdvanceFireResult, isFlareUp: boolean): string {
    const prefix = isFlareUp ? 'Flare-up! ' : '';
    const rollText = `rolled ${result.rolls.d6},${result.rolls.d8}`;
    switch (result.resolution) {
        case 'smoke': return `${prefix}Advance Fire: ${rollText} — smoke fills space ${result.target}`;
        case 'fire': return `${prefix}Advance Fire: ${rollText} — fire catches at space ${result.target}`;
        case 'explosion': return `${prefix}Advance Fire: ${rollText} — space ${result.target} explodes!`;
    }
}

/** Depth-first flattening of a resolution and every flare-up it chained into (§9.4: "flare-ups can chain into flare-ups") — the primary resolution first, so history logs and the outcome's totals both read in the order the fire actually happened. */
function flattenAdvanceFireChain(result: IFiresOutAdvanceFireResult): IFiresOutAdvanceFireResult[] {
    return [result, ...result.flareUps.flatMap(flattenAdvanceFireChain)];
}

// §7 Phase 1, §8: bank up to MAX_BANKED_AP unspent AP, hand the turn to the
// next figure, then resolve Phase 2 Advance Fire and Phase 3 Replenish POI
// (§9, §10.1) — the fire's consequences for this figure and every other one
// on the board, not just the figure whose turn is ending.
function applyEndTurn(fo: IFiresOutGameData, gs: IFiresOutSpecificGameState, ff: IFiresOutFirefighterState, action: FiresOutAction): IFiresOutEndTurnOutcome {
    const previousOwner = ff.ownerId;
    ff.bankedAp = Math.min(MAX_BANKED_AP, ff.bankedAp + ff.apLeft);
    ff.apLeft = 0;
    gs.activeFirefighter = (gs.activeFirefighter + 1) % gs.firefighters.length;
    const nextOwner = gs.firefighters[gs.activeFirefighter].ownerId;

    fo.gameState.history.unshift(playerHistory(action.senderId, `ended their turn${ff.bankedAp > 0 ? ` with ${ff.bankedAp} AP banked` : ''}`));

    const { nextRoll, used } = makeNextRoll(action.recordedRolls);

    const advance = resolveAdvanceFire(gs.spaces, gs.edges, gs.firefighters, gs.hotspotReserve, nextRoll);
    gs.hotspotReserve = advance.hotspotReserve;

    // Depth-first: the primary roll's own log line, then each flare-up it
    // chained into, in the order the fire actually resolved (§9.4).
    const chain = flattenAdvanceFireChain(advance);
    const knockedDownIndices: number[] = [];
    let victimsLost = 0;
    for (const step of chain) {
        fo.gameState.history.unshift({ text: describeAdvanceFire(step, step !== advance) });
        for (const index of step.consequences.knockedDownIndices) {
            const knocked = gs.firefighters[index];
            fo.gameState.history.unshift(playerHistory(knocked.ownerId, 'was knocked down and carried outside'));
        }
        knockedDownIndices.push(...step.consequences.knockedDownIndices);
        victimsLost += step.consequences.victimsLost;
    }
    if (victimsLost > 0) {
        gs.lost += victimsLost;
        fo.gameState.history.unshift({
            text: `${victimsLost} victim${victimsLost === 1 ? '' : 's'} lost to the fire (${gs.lost}/${VICTIMS_LOST_TO_LOSE})`,
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

    return {
        validMove: true,
        turnOver: nextOwner !== previousOwner,
        advanceFire: {
            rolls: advance.rolls,
            target: advance.target,
            resolution: advance.resolution,
            knockedDownOwnerIds: knockedDownIndices.map(i => gs.firefighters[i].ownerId),
            victimsLost,
            poiPlaced,
            flareUpCount: chain.length - 1,
        },
    };
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
    /** 'move' only: pick up a revealed victim or a hazmat on the firefighter's current space as they leave it (§10.1-10.2, §8's hazmat-carry row). */
    carry?: boolean;
    /** 'drive' only: which vehicle — the firefighter must already be at its space (§12.1-12.2). */
    vehicle?: 'engine' | 'ambulance';
    /** 'move' only: a Fire Captain (§11) may set this to the owner id of the teammate whose firefighter moves instead of their own — resolveMover. */
    targetUserId?: string;
    /** 'crewChange' only: the specialist to swap to (§8, §11). */
    specialist?: SpecialistId;
    /** 'endTurn' and 'deckGun' only: the d6/d8 rolls consumed, in order (§17.4) — 'deckGun' can re-roll more than one pair before landing inside its quadrant (rollTargetInQuadrant), and once more still for a Driver/Operator's off-target re-roll (§11). Stripped from live requests by stripRecordedRandomness; supplied on replay. */
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
            case 'drive': outcome = applyDrive(fo, gs, ff, this); break;
            case 'deckGun': outcome = applyDeckGun(fo, gs, ff, this); break;
            case 'reveal': outcome = applyReveal(fo, gs, ff, this); break;
            case 'treat': outcome = applyTreat(fo, gs, ff, this); break;
            case 'disposeHazmat': outcome = applyDisposeHazmat(fo, gs, ff, this); break;
            case 'crewChange': outcome = applyCrewChange(fo, gs, ff, this); break;
            case 'endTurn': outcome = applyEndTurn(fo, gs, ff, this); break;
            default: return INVALID;
        }

        if (outcome.validMove) markDirty(gameData);
        return outcome;
    }

    Undo(_gameData: IGameData): void {}
}
