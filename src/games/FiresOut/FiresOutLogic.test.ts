import { describe, expect, it } from "vitest";
import { FiresOutAction, FiresOutGameType } from "./FiresOutLogic";
import { IFiresOutGameData, IFiresOutSpecificGameState } from "./FiresOutModels";
import { edgeBetween, exteriorTopSpace, spaceIndex, VICTIMS_TO_WIN } from "./board";
import { AP_PER_TURN, buildEmptyEdges, buildEmptySpaces, newFirefighter } from "./rules";

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

// Two firefighters, both starting at (2,1), no fire/POIs/damage — tests build
// whatever board condition they need on top of this rather than fighting the
// Family setup's fire cluster.
function baseState(turnOrder: string[] = ["u1", "u2"]): IFiresOutSpecificGameState {
    return {
        spaces: buildEmptySpaces(),
        edges: buildEmptyEdges(),
        poiPool: [],
        nextPoiId: 0,
        rescued: 0,
        lost: 0,
        firefighters: turnOrder.map(userId => newFirefighter(userId, spaceIndex(2, 1))),
        activeFirefighter: 0,
    };
}

describe("FiresOutAction 'move'", () => {
    it("costs 1 AP to step into an open, empty space", async () => {
        const state = baseState();
        const game = makeGame(state);
        const ff = state.firefighters[0];

        const outcome = await cmd("u1", { kind: 'move', target: spaceIndex(2, 2) }).Execute(game);

        expect(outcome).toEqual({ validMove: true, turnOver: false });
        expect(ff.space).toBe(spaceIndex(2, 2));
        expect(ff.apLeft).toBe(AP_PER_TURN - 1);
    });

    it("costs 2 AP to step into fire", async () => {
        const state = baseState();
        state.spaces[spaceIndex(2, 2)].threat = 'fire';
        const game = makeGame(state);
        const ff = state.firefighters[0];

        const outcome = await cmd("u1", { kind: 'move', target: spaceIndex(2, 2) }).Execute(game);

        expect(outcome.validMove).toBe(true);
        expect(ff.apLeft).toBe(AP_PER_TURN - 2);
    });

    it("rejects a move blocked by an undamaged wall", async () => {
        const state = baseState();
        const game = makeGame(state);
        // (2,1) and (2,5) sit in different rooms — walled, not a doorway.
        const outcome = await cmd("u1", { kind: 'move', target: spaceIndex(2, 5) }).Execute(game);
        expect(outcome).toEqual({ validMove: false, turnOver: false });
        expect(state.firefighters[0].space).toBe(spaceIndex(2, 1));
    });

    it("rejects a move through a closed door, and permits it once opened", async () => {
        const state = baseState();
        state.firefighters[0].space = spaceIndex(1, 2); // beside the living/kitchen door
        const game = makeGame(state);
        const doorTarget = spaceIndex(2, 2);

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
        state.spaces[spaceIndex(2, 2)].threat = 'fire';
        const game = makeGame(state);

        const outcome = await cmd("u1", { kind: 'move', target: spaceIndex(2, 2) }).Execute(game);
        expect(outcome.validMove).toBe(false);
    });

    it("rejects a command from anyone but the active firefighter's own owner", async () => {
        const state = baseState();
        const game = makeGame(state);
        const outcome = await cmd("u2", { kind: 'move', target: spaceIndex(2, 2) }).Execute(game);
        expect(outcome.validMove).toBe(false);
    });

    it("reveals a POI entered for the first time — a false alarm vanishes, a victim stays as a marker", async () => {
        const state = baseState();
        state.spaces[spaceIndex(2, 2)].poi = { id: 0, revealed: false, victim: false };
        state.spaces[spaceIndex(2, 3)].poi = { id: 1, revealed: false, victim: true };
        const game = makeGame(state);

        await cmd("u1", { kind: 'move', target: spaceIndex(2, 2) }).Execute(game);
        expect(state.spaces[spaceIndex(2, 2)].poi).toBeNull();

        state.firefighters[0].apLeft = AP_PER_TURN;
        await cmd("u1", { kind: 'move', target: spaceIndex(2, 3) }).Execute(game);
        expect(state.spaces[spaceIndex(2, 3)].poi).toEqual({ id: 1, revealed: true, victim: true });
    });

    it("picks up a revealed victim when leaving with carry:true, and rescues them on reaching the exterior", async () => {
        const state = baseState();
        const origin = spaceIndex(2, 1);
        state.spaces[origin].poi = { id: 0, revealed: true, victim: true };
        const game = makeGame(state);
        const ff = state.firefighters[0];

        const pickup = await cmd("u1", { kind: 'move', target: spaceIndex(2, 0), carry: true }).Execute(game);
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
        const target = spaceIndex(2, 2); // adjacent to the firefighter at (2,1)
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
        const outcome = await cmd("u1", { kind: 'extinguish', target: spaceIndex(2, 2) }).Execute(game);
        expect(outcome.validMove).toBe(false);
    });

    it("rejects a target that isn't the firefighter's own space or a neighbour", async () => {
        const state = baseState();
        state.spaces[spaceIndex(2, 5)].threat = 'fire';
        const game = makeGame(state);
        const outcome = await cmd("u1", { kind: 'extinguish', target: spaceIndex(2, 5) }).Execute(game);
        expect(outcome.validMove).toBe(false);
    });
});

describe("FiresOutAction 'chop'", () => {
    it("places one damage marker per chop, destroying the wall — and opening a route — at 2", async () => {
        const state = baseState();
        // (2,1)'s only undamaged wall is toward (1,1) (living/kitchen, no
        // door there) — (2,0) and (2,2) are open, same-room neighbours.
        const wallTarget = spaceIndex(1, 1);
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
        // (2,1)-(2,0) is open (same room) — nothing to chop.
        const outcome = await cmd("u1", { kind: 'chop', target: spaceIndex(2, 0) }).Execute(game);
        expect(outcome.validMove).toBe(false);
    });
});

describe("FiresOutAction 'endTurn' and FiresOutGameType", () => {
    it("banks unspent AP up to the cap, and hands the turn to the next figure", async () => {
        const state = baseState(["u1", "u2"]);
        state.firefighters[0].apLeft = 3; // less than the 4-AP cap, so all of it banks
        const game = makeGame(state);
        const gameType = new FiresOutGameType();

        const outcome = await cmd("u1", { kind: 'endTurn' }).Execute(game);
        expect(outcome).toEqual({ validMove: true, turnOver: true });
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

    it("loses if the building collapses (even from a crew's own chopping, before Advance Fire exists)", () => {
        const state = baseState(["u1"]);
        const wallEdges = state.edges.filter(e => e.kind === 'wall');
        wallEdges.slice(0, 12).forEach(e => { e.damage = 2; });
        const game = makeGame(state, ["u1"]);
        const gameType = new FiresOutGameType();

        expect(gameType.CheckGameOver(game)).toBe(true);
        expect(game.endReason).toBe('teamloss');
    });
});
