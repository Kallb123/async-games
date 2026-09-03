import { describe, expect, it } from "vitest";
import { FiresOutAction, FiresOutGameType, IFiresOutEndTurnOutcome } from "./FiresOutLogic";
import { IFiresOutGameData, IFiresOutSpecificGameState } from "./FiresOutModels";
import { edgeBetween, ENGINE_START, exteriorTopSpace, perimeterNeighbours, spaceIndex, START_SPACE, VICTIMS_TO_WIN } from "./board";
import { AP_COSTS, AP_PER_TURN } from "./rules";
import { baseState, experiencedState } from "./testFixtures";

// ─── Minimal in-memory game harness (mirrors SolitaireLogic.test.ts) ────────
// markModified is a Mongoose Document method the real command route relies
// on (see markDirty in FiresOutLogic.ts); the plain object here has none,
// and markDirty is written to no-op safely when it's absent.
function makeGame(state: IFiresOutSpecificGameState, turnOrder: string[] = ["u1", "u2"]): IFiresOutGameData {
    return {
        gameId: "g",
        currentTurn: turnOrder[0],
        userIdList: turnOrder,
        gameState: { turnOrder, history: [], commandHistory: [] },
        specificGameState: state,
        complete: false,
        winner: "",
    } as unknown as IFiresOutGameData;
}

function cmd(senderId: string, fields: Partial<FiresOutAction>): FiresOutAction {
    const action = new FiresOutAction();
    action.senderId = senderId;
    action.senderUsername = senderId;
    Object.assign(action, fields);
    return action;
}

describe("FiresOutAction 'move'", () => {
    it("costs 1 AP to step into an open, empty space", async () => {
        const state = baseState();
        const game = makeGame(state);
        const ff = state.firefighters[0];

        const outcome = await cmd("u1", { kind: 'move', target: spaceIndex(3, 3) }).Execute(game);

        expect(outcome).toEqual({ validMove: true, turnOver: false });
        expect(ff.space).toBe(spaceIndex(3, 3));
        expect(ff.apLeft).toBe(AP_PER_TURN - 1);
    });

    it("costs 2 AP to step into fire", async () => {
        const state = baseState();
        state.spaces[spaceIndex(3, 3)].threat = 'fire';
        const game = makeGame(state);
        const ff = state.firefighters[0];

        const outcome = await cmd("u1", { kind: 'move', target: spaceIndex(3, 3) }).Execute(game);

        expect(outcome.validMove).toBe(true);
        expect(ff.apLeft).toBe(AP_PER_TURN - 2);
    });

    it("rejects a move blocked by an undamaged wall", async () => {
        const state = baseState();
        const game = makeGame(state);
        // (3,2) and (3,1) sit in different rooms — walled, not a doorway.
        const outcome = await cmd("u1", { kind: 'move', target: spaceIndex(3, 1) }).Execute(game);
        expect(outcome).toEqual({ validMove: false, turnOver: false });
        expect(state.firefighters[0].space).toBe(spaceIndex(3, 2));
    });

    it("rejects a move through a closed door, and permits it once opened", async () => {
        const state = baseState();
        const game = makeGame(state);
        const doorTarget = spaceIndex(4, 2); // through the kitchen/dining-room door

        const blocked = await cmd("u1", { kind: 'move', target: doorTarget }).Execute(game);
        expect(blocked.validMove).toBe(false);

        const opened = await cmd("u1", { kind: 'door', target: doorTarget }).Execute(game);
        expect(opened.validMove).toBe(true);

        const moved = await cmd("u1", { kind: 'move', target: doorTarget }).Execute(game);
        expect(moved.validMove).toBe(true);
        expect(state.firefighters[0].space).toBe(doorTarget);
    });

    it("rejects moving into fire while carrying, even though it's otherwise passable", async () => {
        const state = baseState();
        const ff = state.firefighters[0];
        ff.carrying = 'victim';
        state.spaces[spaceIndex(3, 3)].threat = 'fire';
        const game = makeGame(state);

        const outcome = await cmd("u1", { kind: 'move', target: spaceIndex(3, 3) }).Execute(game);
        expect(outcome.validMove).toBe(false);
    });

    it("rejects a command from anyone but the active firefighter's own owner", async () => {
        const state = baseState();
        const game = makeGame(state);
        const outcome = await cmd("u2", { kind: 'move', target: spaceIndex(3, 3) }).Execute(game);
        expect(outcome.validMove).toBe(false);
    });

    it("reveals a POI entered for the first time — a false alarm vanishes, a victim stays as a marker", async () => {
        const state = baseState();
        state.spaces[spaceIndex(3, 3)].poi = { id: 0, revealed: false, victim: false };
        state.spaces[spaceIndex(3, 4)].poi = { id: 1, revealed: false, victim: true };
        const game = makeGame(state);

        await cmd("u1", { kind: 'move', target: spaceIndex(3, 3) }).Execute(game);
        expect(state.spaces[spaceIndex(3, 3)].poi).toBeNull();

        state.firefighters[0].apLeft = AP_PER_TURN;
        await cmd("u1", { kind: 'move', target: spaceIndex(3, 4) }).Execute(game);
        expect(state.spaces[spaceIndex(3, 4)].poi).toEqual({ id: 1, revealed: true, victim: true });
    });

    it("picks up a revealed victim when leaving with carry:true, and rescues them on reaching the exterior", async () => {
        const state = baseState();
        const origin = spaceIndex(3, 2);
        state.spaces[origin].poi = { id: 0, revealed: true, victim: true };
        const game = makeGame(state);
        const ff = state.firefighters[0];

        const pickup = await cmd("u1", { kind: 'move', target: spaceIndex(3, 3), carry: true }).Execute(game);
        expect(pickup.validMove).toBe(true);
        expect(ff.carrying).toBe('victim');
        expect(ff.apLeft).toBe(AP_PER_TURN - 2); // carrying cost, not the plain 1 AP
        expect(state.spaces[origin].poi).toBeNull();

        // Walk to the exterior — (0,0) sits on the top-left corner, one step
        // from its own exterior opening.
        ff.apLeft = AP_PER_TURN;
        ff.space = spaceIndex(0, 0);
        const rescue = await cmd("u1", { kind: 'move', target: exteriorTopSpace(0), carry: true }).Execute(game);

        expect(rescue.validMove).toBe(true);
        expect(state.rescued).toBe(1);
        expect(ff.carrying).toBeNull();
    });
});

describe("FiresOutAction 'extinguish'", () => {
    it("turns fire to smoke, and a second application clears smoke entirely", async () => {
        const state = baseState();
        const target = spaceIndex(3, 3); // adjacent to the firefighter at (3,2)
        state.spaces[target].threat = 'fire';
        const game = makeGame(state);
        const ff = state.firefighters[0];

        const first = await cmd("u1", { kind: 'extinguish', target }).Execute(game);
        expect(first.validMove).toBe(true);
        expect(state.spaces[target].threat).toBe('smoke');
        expect(ff.apLeft).toBe(AP_PER_TURN - 1);

        const second = await cmd("u1", { kind: 'extinguish', target }).Execute(game);
        expect(second.validMove).toBe(true);
        expect(state.spaces[target].threat).toBe('none');
    });

    it("rejects a target with nothing to extinguish", async () => {
        const state = baseState();
        const game = makeGame(state);
        const outcome = await cmd("u1", { kind: 'extinguish', target: spaceIndex(3, 3) }).Execute(game);
        expect(outcome.validMove).toBe(false);
    });

    it("rejects a target that isn't the firefighter's own space or a neighbour", async () => {
        const state = baseState();
        state.spaces[spaceIndex(0, 5)].threat = 'fire';
        const game = makeGame(state);
        const outcome = await cmd("u1", { kind: 'extinguish', target: spaceIndex(0, 5) }).Execute(game);
        expect(outcome.validMove).toBe(false);
    });
});

describe("FiresOutAction 'chop'", () => {
    it("places one damage marker per chop, destroying the wall — and opening a route — at 2", async () => {
        const state = baseState();
        // (3,2)'s only undamaged wall is toward (3,1) (kitchen/living room,
        // no door there) — (2,2) and (3,3) are open, same-room neighbours.
        const wallTarget = spaceIndex(3, 1);
        const game = makeGame(state);
        const ff = state.firefighters[0];
        const edgeId = edgeBetween(ff.space, wallTarget)!;

        const first = await cmd("u1", { kind: 'chop', target: wallTarget }).Execute(game);
        expect(first.validMove).toBe(true);
        expect(state.edges[edgeId].damage).toBe(1);
        expect(ff.apLeft).toBe(AP_PER_TURN - 2);

        ff.apLeft = AP_PER_TURN;
        const second = await cmd("u1", { kind: 'chop', target: wallTarget }).Execute(game);
        expect(second.validMove).toBe(true);
        expect(state.edges[edgeId].damage).toBe(2);

        // Destroyed — now passable without a door.
        ff.apLeft = AP_PER_TURN;
        const moved = await cmd("u1", { kind: 'move', target: wallTarget }).Execute(game);
        expect(moved.validMove).toBe(true);
    });

    it("rejects chopping an edge that isn't a wall", async () => {
        const state = baseState();
        const game = makeGame(state);
        // (3,2)-(3,3) is open (same room) — nothing to chop.
        const outcome = await cmd("u1", { kind: 'chop', target: spaceIndex(3, 3) }).Execute(game);
        expect(outcome.validMove).toBe(false);
    });
});

describe("FiresOutAction 'drive' (§8, §12.1-12.2, §17.6 step 9)", () => {
    it("drives the Engine one parking spot, taking every firefighter at its space along for free", async () => {
        const state = experiencedState();
        state.firefighters[0].space = ENGINE_START;
        state.firefighters[1].space = ENGINE_START; // riding along
        const game = makeGame(state);
        const target = perimeterNeighbours(ENGINE_START)[0];

        const outcome = await cmd("u1", { kind: 'drive', vehicle: 'engine', target }).Execute(game);

        expect(outcome.validMove).toBe(true);
        expect(state.engine).toBe(target);
        expect(state.firefighters[0].space).toBe(target);
        expect(state.firefighters[1].space).toBe(target); // rode along, at no extra cost
        expect(state.firefighters[0].apLeft).toBe(AP_PER_TURN - 2);
        expect(state.firefighters[1].apLeft).toBe(AP_PER_TURN); // the passenger paid nothing
    });

    it("rejects driving from anywhere but the vehicle's own space", async () => {
        const state = experiencedState();
        state.firefighters[0].space = spaceIndex(3, 2); // not at the Engine
        const game = makeGame(state);

        const outcome = await cmd("u1", { kind: 'drive', vehicle: 'engine', target: perimeterNeighbours(ENGINE_START)[0] }).Execute(game);
        expect(outcome.validMove).toBe(false);
    });

    it("rejects driving in the Family game — vehicles are set aside (§6.1 step 7)", async () => {
        const state = baseState();
        state.firefighters[0].space = ENGINE_START;
        const game = makeGame(state);

        const outcome = await cmd("u1", { kind: 'drive', vehicle: 'engine', target: perimeterNeighbours(ENGINE_START)[0] }).Execute(game);
        expect(outcome.validMove).toBe(false);
    });
});

describe("FiresOutAction 'deckGun' (§12.3, §17.6 step 9)", () => {
    it("fires from the Engine into an unoccupied quadrant, clearing threat there and recording the roll it consumed", async () => {
        const state = experiencedState();
        state.firefighters[0].space = ENGINE_START;
        state.firefighters[1].space = spaceIndex(0, 0); // occupies quadrant 0
        state.spaces[spaceIndex(5, 7)].threat = 'fire'; // inside quadrant 3, clear of firefighters
        const game = makeGame(state);

        const action = cmd("u1", { kind: 'deckGun', target: spaceIndex(5, 7), recordedRolls: [6, 8] });
        const outcome = await action.Execute(game);

        expect(outcome.validMove).toBe(true);
        expect(state.spaces[spaceIndex(5, 7)].threat).toBe('none');
        expect(state.firefighters[0].apLeft).toBe(AP_PER_TURN - 4);
        expect(action.recordedRolls).toEqual([6, 8]);
        expect(game.gameState.history.some(h => h.text.includes('fired the deck gun'))).toBe(true);
    });

    it("rejects targeting a quadrant that has a firefighter in it", async () => {
        const state = experiencedState();
        state.firefighters[0].space = ENGINE_START;
        state.firefighters[1].space = spaceIndex(0, 0); // occupies quadrant 0
        const game = makeGame(state);

        const outcome = await cmd("u1", { kind: 'deckGun', target: spaceIndex(0, 1), recordedRolls: [1, 2] }).Execute(game);
        expect(outcome.validMove).toBe(false);
    });

    it("rejects firing from anywhere but the Engine", async () => {
        const state = experiencedState();
        state.firefighters[0].space = spaceIndex(3, 2);
        const game = makeGame(state);

        const outcome = await cmd("u1", { kind: 'deckGun', target: spaceIndex(5, 7), recordedRolls: [6, 8] }).Execute(game);
        expect(outcome.validMove).toBe(false);
    });
});

describe("Ambulance-gated rescue (§10.2, §17.6 step 9)", () => {
    it("does not rescue at an ordinary exterior space in the Experienced game", async () => {
        const state = experiencedState();
        const ff = state.firefighters[0];
        ff.space = spaceIndex(0, 0);
        ff.carrying = 'victim';
        const game = makeGame(state);

        const outcome = await cmd("u1", { kind: 'move', target: exteriorTopSpace(0) }).Execute(game);

        expect(outcome.validMove).toBe(true);
        expect(state.rescued).toBe(0);
        expect(ff.carrying).toBe('victim'); // still carrying — not yet at the Ambulance
    });

    it("rescues once the carried victim reaches the Ambulance", async () => {
        const state = experiencedState();
        state.ambulance = exteriorTopSpace(0);
        const ff = state.firefighters[0];
        ff.space = spaceIndex(0, 0);
        ff.carrying = 'victim';
        const game = makeGame(state);

        const outcome = await cmd("u1", { kind: 'move', target: exteriorTopSpace(0) }).Execute(game);

        expect(outcome.validMove).toBe(true);
        expect(state.rescued).toBe(1);
        expect(ff.carrying).toBeNull();
    });
});

describe("FiresOutAction 'endTurn' and FiresOutGameType", () => {
    it("banks unspent AP up to the cap, and hands the turn to the next figure", async () => {
        const state = baseState(["u1", "u2"]);
        state.firefighters[0].apLeft = 3; // less than the 4-AP cap, so all of it banks
        const game = makeGame(state);
        const gameType = new FiresOutGameType();

        const outcome = await cmd("u1", { kind: 'endTurn' }).Execute(game);
        expect(outcome).toMatchObject({ validMove: true, turnOver: true });
        expect(state.firefighters[0].bankedAp).toBe(3);
        expect(state.activeFirefighter).toBe(1);

        gameType.CheckEndTurn(game, outcome);
        expect(game.currentTurn).toBe("u2");
        expect(state.firefighters[1].apLeft).toBe(AP_PER_TURN); // u2 had nothing banked
    });

    it("caps banked AP at 4 even with a full unspent turn", async () => {
        const state = baseState(["u1", "u2"]);
        state.firefighters[0].apLeft = AP_PER_TURN;
        state.firefighters[0].bankedAp = 2; // already carrying some over
        const game = makeGame(state);

        await cmd("u1", { kind: 'endTurn' }).Execute(game);
        expect(state.firefighters[0].bankedAp).toBe(4);
    });

    it("refills the next figure's AP with their base allowance plus what they banked", async () => {
        const state = baseState(["u1", "u2"]);
        state.firefighters[1].bankedAp = 2;
        state.activeFirefighter = 0;
        const game = makeGame(state);
        const gameType = new FiresOutGameType();

        const outcome = await cmd("u1", { kind: 'endTurn' }).Execute(game);
        gameType.CheckEndTurn(game, outcome);

        expect(state.firefighters[1].apLeft).toBe(AP_PER_TURN + 2);
        expect(state.firefighters[1].bankedAp).toBe(0);
    });

    it("wins once 7 victims are rescued", () => {
        const state = baseState(["u1"]);
        state.rescued = VICTIMS_TO_WIN;
        const game = makeGame(state, ["u1"]);
        const gameType = new FiresOutGameType();

        expect(gameType.CheckGameOver(game)).toBe(true);
        expect(game.complete).toBe(true);
        expect(game.endReason).toBe('teamwin');
        expect(game.winner).toBe('');
    });

    it("is not over mid-game", () => {
        const state = baseState(["u1"]);
        const game = makeGame(state, ["u1"]);
        expect(new FiresOutGameType().CheckGameOver(game)).toBe(false);
        expect(game.complete).toBe(false);
    });

    it("resolves Advance Fire and Replenish POI, and records the rolls it consumed so replay reproduces the same fire", async () => {
        const state1 = baseState(["u1", "u2"]);
        const game1 = makeGame(state1);
        const action1 = cmd("u1", { kind: 'endTurn' });

        const outcome1 = await action1.Execute(game1);
        expect(outcome1.validMove).toBe(true);
        expect(action1.recordedRolls).toHaveLength(2); // baseState's poiPool is empty — nothing to replenish
        const [d6, d8] = action1.recordedRolls!;
        expect(d6).toBeGreaterThanOrEqual(1);
        expect(d6).toBeLessThanOrEqual(6);
        expect(d8).toBeGreaterThanOrEqual(1);
        expect(d8).toBeLessThanOrEqual(8);

        // Replaying the same rolls against an identical fresh state reaches
        // the identical result — the point of recording them (§17.4).
        const state2 = baseState(["u1", "u2"]);
        const game2 = makeGame(state2);
        await cmd("u1", { kind: 'endTurn', recordedRolls: action1.recordedRolls }).Execute(game2);
        const target = spaceIndex(d6 - 1, d8 - 1);
        expect(state2.spaces[target].threat).toBe(state1.spaces[target].threat);
    });

    it("loses a victim and knocks down a firefighter caught by fire when Advance Fire resolves, without touching the (1,1) target it rolled", async () => {
        const state = baseState(["u1", "u2"]);
        const burning = spaceIndex(3, 3);
        state.spaces[burning].threat = 'fire';
        state.spaces[burning].poi = { id: 0, revealed: false, victim: true };
        state.firefighters[1].space = burning; // not the active figure — Advance Fire hits every firefighter, not just the one ending their turn
        const game = makeGame(state);

        // Rolls a safe, empty target (1,1) so the only fire consequences come
        // from the pre-existing blaze at (3,3), not from this roll.
        const outcome = await cmd("u1", { kind: 'endTurn', recordedRolls: [2, 2] }).Execute(game);

        expect(outcome.validMove).toBe(true);
        expect(state.lost).toBe(1);
        expect(state.spaces[burning].poi).toBeNull();
        expect(state.firefighters[1].space).toBe(START_SPACE);
        expect(game.gameState.history.some(h => h.text.includes('lost to the fire'))).toBe(true);
        expect(game.gameState.history.some(h => h.text.includes('was knocked down'))).toBe(true);

        // The structured twin of those history lines (§17.6 step 7) — what
        // FiresOutAdvanceFireResult.tsx animates instead of parsing text back
        // out of the log.
        const advance = (outcome as IFiresOutEndTurnOutcome).advanceFire;
        expect(advance.rolls).toEqual({ d6: 2, d8: 2 });
        expect(advance.target).toBe(spaceIndex(1, 1));
        expect(advance.resolution).toBe('smoke');
        expect(advance.knockedDownOwnerIds).toEqual(["u2"]);
        expect(advance.victimsLost).toBe(1);
        expect(advance.poiPlaced).toBe(0);
    });

    it("replenishes a POI from the pool once fewer than 3 are on the board", async () => {
        const state = baseState(["u1", "u2"]);
        state.poiPool = [true];
        const game = makeGame(state);

        // (1,1) for the Advance Fire roll (harmless smoke), then (3,5) for
        // Replenish to place the pool's one marker.
        await cmd("u1", { kind: 'endTurn', recordedRolls: [2, 2, 4, 6] }).Execute(game);

        expect(state.poiPool).toHaveLength(0);
        expect(state.spaces[spaceIndex(3, 5)].poi).toEqual({ id: 0, revealed: false, victim: true });
        expect(game.gameState.history.some(h => h.text.includes('Replenish: 1 new POI marker placed'))).toBe(true);
    });

    it("loses if the building collapses (even from a crew's own chopping, before Advance Fire exists)", () => {
        const state = baseState(["u1"]);
        const wallEdges = state.edges.filter(e => e.kind === 'wall');
        wallEdges.slice(0, 12).forEach(e => { e.damage = 2; });
        const game = makeGame(state, ["u1"]);
        const gameType = new FiresOutGameType();

        expect(gameType.CheckGameOver(game)).toBe(true);
        expect(game.endReason).toBe('teamloss');
    });

    it("refills the next figure's AP from their specialist in the Experienced game", async () => {
        const state = experiencedState(["u1", "u2"]);
        state.firefighters[1].specialist = 'cafsFirefighter';
        const game = makeGame(state);
        const gameType = new FiresOutGameType();

        const outcome = await cmd("u1", { kind: 'endTurn' }).Execute(game);
        gameType.CheckEndTurn(game, outcome);

        expect(state.firefighters[1].apLeft).toBe(3); // CAFS Firefighter's base
        expect(state.firefighters[1].restrictedAp).toEqual({ kind: 'extinguish', left: 3 });
    });
});

describe("Specialists (§11, §17.6 step 10)", () => {
    it("Rescue Specialist chops for 1 AP, funded by their move/chop pool first", async () => {
        const state = experiencedState(["u1"]);
        const ff = state.firefighters[0];
        ff.specialist = 'rescueSpecialist';
        ff.apLeft = 4;
        ff.restrictedAp = { kind: 'moveChop', left: 3 };
        const wallTarget = spaceIndex(3, 1);
        const game = makeGame(state, ["u1"]);

        const outcome = await cmd("u1", { kind: 'chop', target: wallTarget }).Execute(game);

        expect(outcome.validMove).toBe(true);
        expect(ff.restrictedAp).toEqual({ kind: 'moveChop', left: 2 }); // 1 AP drawn from the restricted pool first
        expect(ff.apLeft).toBe(4); // general AP untouched
    });

    it("CAFS Firefighter's extinguish AP funds extinguishing before their general pool", async () => {
        const state = experiencedState(["u1"]);
        const ff = state.firefighters[0];
        ff.specialist = 'cafsFirefighter';
        ff.apLeft = 3;
        ff.restrictedAp = { kind: 'extinguish', left: 3 };
        state.spaces[spaceIndex(3, 3)].threat = 'fire'; // adjacent to (3,2)
        const game = makeGame(state, ["u1"]);

        const outcome = await cmd("u1", { kind: 'extinguish', target: spaceIndex(3, 3) }).Execute(game);

        expect(outcome.validMove).toBe(true);
        expect(ff.restrictedAp).toEqual({ kind: 'extinguish', left: 2 });
        expect(ff.apLeft).toBe(3);
    });

    it("Paramedic pays 1 AP more to extinguish", async () => {
        const state = experiencedState(["u1"]);
        const ff = state.firefighters[0];
        ff.specialist = 'paramedic';
        state.spaces[spaceIndex(3, 3)].threat = 'fire';
        const game = makeGame(state, ["u1"]);

        await cmd("u1", { kind: 'extinguish', target: spaceIndex(3, 3) }).Execute(game);
        expect(ff.apLeft).toBe(AP_PER_TURN - (AP_COSTS.extinguish + 1));
    });

    it("Fire Captain's command AP funds a door, and moving a teammate's firefighter", async () => {
        const state = experiencedState(["u1", "u2"]);
        const captain = state.firefighters[0];
        captain.specialist = 'fireCaptain';
        captain.apLeft = 4;
        captain.restrictedAp = { kind: 'command', left: 2 };
        state.firefighters[1].space = spaceIndex(3, 3); // the teammate being directed
        const game = makeGame(state, ["u1", "u2"]);

        const doorTarget = spaceIndex(4, 2); // the kitchen/dining-room door
        const doorOutcome = await cmd("u1", { kind: 'door', target: doorTarget }).Execute(game);
        expect(doorOutcome.validMove).toBe(true);
        expect(captain.restrictedAp).toEqual({ kind: 'command', left: 1 }); // 1 AP drawn from command first

        const moveOutcome = await cmd("u1", { kind: 'move', target: spaceIndex(3, 4), targetUserId: "u2" }).Execute(game);
        expect(moveOutcome.validMove).toBe(true);
        expect(state.firefighters[1].space).toBe(spaceIndex(3, 4)); // the teammate moved
        expect(captain.space).toBe(spaceIndex(3, 2)); // the Fire Captain stayed put
        expect(captain.restrictedAp).toEqual({ kind: 'command', left: 0 }); // the Fire Captain paid
        expect(game.gameState.history.some(h => h.text.includes("directing a teammate's firefighter"))).toBe(true);
    });

    it("rejects a non-Fire-Captain trying to move a teammate's firefighter", async () => {
        const state = experiencedState(["u1", "u2"]);
        state.firefighters[1].space = spaceIndex(3, 3);
        const game = makeGame(state, ["u1", "u2"]);

        const outcome = await cmd("u1", { kind: 'move', target: spaceIndex(3, 4), targetUserId: "u2" }).Execute(game);
        expect(outcome.validMove).toBe(false);
        expect(state.firefighters[1].space).toBe(spaceIndex(3, 3));
    });

    it("Imaging Technician reveals a POI remotely without moving", async () => {
        const state = experiencedState(["u1"]);
        const ff = state.firefighters[0];
        ff.specialist = 'imagingTechnician';
        const target = spaceIndex(4, 4);
        state.spaces[target].poi = { id: 0, revealed: false, victim: true };
        const game = makeGame(state, ["u1"]);

        const outcome = await cmd("u1", { kind: 'reveal', target }).Execute(game);

        expect(outcome.validMove).toBe(true);
        expect(state.spaces[target].poi).toEqual({ id: 0, revealed: true, victim: true });
        expect(ff.space).toBe(spaceIndex(3, 2)); // never moved
        expect(ff.apLeft).toBe(3); // AP_PER_TURN - AP_COSTS.reveal
    });

    it("rejects reveal from anyone but the Imaging Technician", async () => {
        const state = experiencedState(["u1"]);
        const target = spaceIndex(4, 4);
        state.spaces[target].poi = { id: 0, revealed: false, victim: true };
        const game = makeGame(state, ["u1"]);

        const outcome = await cmd("u1", { kind: 'reveal', target }).Execute(game);
        expect(outcome.validMove).toBe(false);
    });

    it("Paramedic treats a revealed victim, who then moves at the ordinary rate instead of carryPerSpace", async () => {
        const state = experiencedState(["u1"]);
        const ff = state.firefighters[0];
        ff.specialist = 'paramedic';
        state.spaces[ff.space].poi = { id: 0, revealed: true, victim: true };
        const game = makeGame(state, ["u1"]);

        const treat = await cmd("u1", { kind: 'treat' }).Execute(game);
        expect(treat.validMove).toBe(true);
        expect(ff.carrying).toBe('escort');
        expect(ff.apLeft).toBe(3); // AP_PER_TURN - AP_COSTS.treat

        const move = await cmd("u1", { kind: 'move', target: spaceIndex(3, 3) }).Execute(game);
        expect(move.validMove).toBe(true);
        expect(ff.apLeft).toBe(2); // ordinary 1 AP move, not the 2 AP carry rate
    });

    it("rejects treat for anyone but a Paramedic with a revealed victim on their own space", async () => {
        const state = experiencedState(["u1"]);
        state.spaces[state.firefighters[0].space].poi = { id: 0, revealed: true, victim: true };
        const game = makeGame(state, ["u1"]);

        const outcome = await cmd("u1", { kind: 'treat' }).Execute(game);
        expect(outcome.validMove).toBe(false);
    });

    it("Hazmat Technician removes a hazmat on the spot", async () => {
        const state = experiencedState(["u1"]);
        const ff = state.firefighters[0];
        ff.specialist = 'hazmatTechnician';
        state.spaces[ff.space].hazmat = true;
        const game = makeGame(state, ["u1"]);

        const outcome = await cmd("u1", { kind: 'disposeHazmat' }).Execute(game);

        expect(outcome.validMove).toBe(true);
        expect(state.spaces[ff.space].hazmat).toBe(false);
    });

    it("a firefighter can carry a hazmat out of the building without a Specialist, disposing of it at the exterior", async () => {
        const state = experiencedState(["u1"]);
        const origin = spaceIndex(0, 0);
        state.firefighters[0].space = origin;
        state.spaces[origin].hazmat = true;
        const game = makeGame(state, ["u1"]);

        const pickup = await cmd("u1", { kind: 'move', target: spaceIndex(0, 1), carry: true }).Execute(game);
        expect(pickup.validMove).toBe(true);
        expect(state.firefighters[0].carrying).toBe('hazmat');
        expect(state.spaces[origin].hazmat).toBe(false);

        state.firefighters[0].apLeft = AP_PER_TURN;
        state.firefighters[0].space = spaceIndex(0, 0);
        const dispose = await cmd("u1", { kind: 'move', target: exteriorTopSpace(0) }).Execute(game);
        expect(dispose.validMove).toBe(true);
        expect(state.firefighters[0].carrying).toBeNull();
        expect(game.gameState.history.some(h => h.text.includes('disposed of the hazmat'))).toBe(true);
    });

    it("Driver/Operator fires the deck gun for 2 AP and re-rolls a shot that clears nothing", async () => {
        const state = experiencedState(["u1"]);
        const ff = state.firefighters[0];
        ff.specialist = 'driverOperator';
        ff.space = ENGINE_START;
        const game = makeGame(state, ["u1"]);

        // First roll (1,1) -> (0,0), empty board — clears nothing, so the
        // Driver/Operator's ability re-rolls once more into the *same*
        // quadrant (0): (3,1) -> (2,0), still empty.
        const outcome = await cmd("u1", { kind: 'deckGun', target: spaceIndex(0, 0), recordedRolls: [1, 1, 3, 1] }).Execute(game);

        expect(outcome.validMove).toBe(true);
        expect(ff.apLeft).toBe(AP_PER_TURN - 2); // discounted cost
        expect(game.gameState.history.some(h => h.text.includes('re-rolled the off-target shot'))).toBe(true);
    });

    it("swaps Specialist cards at the Engine for 2 AP, taking effect immediately for future AP checks", async () => {
        const state = experiencedState(["u1"]);
        const ff = state.firefighters[0];
        ff.space = ENGINE_START;
        const game = makeGame(state, ["u1"]);

        const outcome = await cmd("u1", { kind: 'crewChange', specialist: 'rescueSpecialist' }).Execute(game);

        expect(outcome.validMove).toBe(true);
        expect(ff.specialist).toBe('rescueSpecialist');
        expect(ff.restrictedAp).toBeNull(); // no bonus pool until their next turn (refillFirefighterAp)
        expect(ff.apLeft).toBe(AP_PER_TURN - 2);
    });

    it("rejects crew change away from the Engine, and in the Family game", async () => {
        const experienced = experiencedState(["u1"]);
        const notAtEngine = await cmd("u1", { kind: 'crewChange', specialist: 'rescueSpecialist' }).Execute(makeGame(experienced, ["u1"]));
        expect(notAtEngine.validMove).toBe(false);

        const family = baseState(["u1"]);
        family.firefighters[0].space = ENGINE_START;
        const inFamily = await cmd("u1", { kind: 'crewChange', specialist: 'rescueSpecialist' }).Execute(makeGame(family, ["u1"]));
        expect(inFamily.validMove).toBe(false);
    });
});

// A malformed target must come back as an ordinary invalid move, not as a
// crash. isInteriorSpace/isExteriorSpace are bare range comparisons, so a
// fractional or non-numeric target satisfied them; 'reveal' then indexed
// `gs.spaces[target]` directly and threw a TypeError out of Execute, which
// POST /api/game/command answers as a 500 rather than "Not a valid move".
// Every kind is covered here because requireTarget guards them all — the
// others survived the old code only by accident, through edgeBetween or
// neighboursOf missing the value further down.
describe("malformed command targets (every kind, no 500s)", () => {
    const JUNK: unknown[] = [5.5, 0.5, 47.9999, 1e-10, -0.5, NaN, Infinity, true, null, "3", [], {}];

    it("rejects a non-integer target on 'reveal' instead of throwing", async () => {
        const state = experiencedState();
        state.firefighters[0].specialist = 'imagingTechnician';
        const game = makeGame(state);

        for (const target of JUNK) {
            const action = cmd("u1", { kind: 'reveal' });
            (action as unknown as { target: unknown }).target = target;
            await expect(action.Execute(game)).resolves.toEqual({ validMove: false, turnOver: false });
        }
    });

    it("rejects one on every other targeted kind too", async () => {
        const kinds = ['move', 'door', 'extinguish', 'chop', 'drive', 'deckGun'] as const;
        for (const kind of kinds) {
            const state = experiencedState();
            state.firefighters[0].specialist = 'imagingTechnician';
            const game = makeGame(state);
            for (const target of JUNK) {
                const action = cmd("u1", { kind });
                (action as unknown as { target: unknown }).target = target;
                await expect(action.Execute(game)).resolves.toEqual({ validMove: false, turnOver: false });
            }
        }
    });
});
