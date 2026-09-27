import { describe, expect, it } from "vitest";
import { undoableCommandsIn } from "@/utils/testing/undoableCommands";
import { FiresOutAction, FiresOutActionKind, FiresOutGameType, FiresOutUndo } from "./FiresOutLogic";
import { cloneFiresOutState, detectRescueEvent, gameStateToModel } from "./FiresOutModels";
import type { IFiresOutGameData, IFiresOutSpecificGameState } from "./FiresOutModels";
import { DAMAGE_TO_COLLAPSE, edgeBetween, exteriorTopSpace, perimeterNeighbours, spaceIndex, VICTIMS_TO_WIN } from "./board";
import { AP_PER_TURN, UNDO_STACK_DEPTH } from "./rules";
import { consumedRandomness } from "@/utils/apiModels/gameCommand";
import type { GameResultEvent } from "@/utils/apiModels/GameDataApi";
import { runCommand } from "@/utils/games/commandPipeline";
import { getPlayerDropoutAdapter } from "@/utils/games/playerDropout";
import { buildTimeline, computePerTurnEvents } from "@/utils/games/replay";
import { baseState, experiencedState } from "./testFixtures";

// docs/undo.md's seventh game, shaped like Outbreak's and Banned Islet's: a
// turn is spent on actions and only End turn hands it on, so every action that
// rolls nothing and turns no POI face up can be taken back, one at a time,
// until the player ends their turn. What never can: End turn (the Advance
// Fire), the deck gun (it rolls), anything that reveals a POI — a move onto
// one, the Imaging Technician's remote reveal — and the action that ends the
// game.

const NAMES = { u1: "Alice", u2: "Bob" };
const START = spaceIndex(3, 2);
const KITCHEN = spaceIndex(3, 3); // open to START
const DINING = spaceIndex(4, 3); // through the kitchen's door

function makeGame(state: IFiresOutSpecificGameState, turnOrder: string[] = ["u1", "u2"]): IFiresOutGameData {
    return {
        gameId: "g",
        gameType: new FiresOutGameType(),
        currentTurn: turnOrder[0],
        userIdList: turnOrder,
        gameState: { turnOrder, history: [], commandHistory: [] },
        specificGameState: state,
        initialSpecificGameState: cloneFiresOutState(state),
        complete: false,
        winner: "",
    } as unknown as IFiresOutGameData;
}

function action(kind: FiresOutActionKind, fields: Partial<FiresOutAction> = {}, senderId = "u1"): FiresOutAction {
    const command = new FiresOutAction();
    command.senderId = senderId;
    command.senderUsername = senderId;
    return Object.assign(command, { kind }, fields);
}

function undo(senderId = "u1"): FiresOutUndo {
    const command = new FiresOutUndo();
    command.senderId = senderId;
    command.senderUsername = senderId;
    return command;
}

function run(game: IFiresOutGameData, command: FiresOutAction | FiresOutUndo) {
    return runCommand(game, new FiresOutGameType(), command);
}

const lastId = (game: IFiresOutGameData) => game.gameState.commandHistory.at(-1)!.id;

describe("Fires Out — undoing an action", () => {
    it("takes a move back: the firefighter, the AP and the log line", async () => {
        const game = makeGame(baseState());
        const ff = () => game.specificGameState.firefighters[0];

        await run(game, action("move", { target: KITCHEN }));
        expect(ff().space).toBe(KITCHEN);
        expect(ff().apLeft).toBe(AP_PER_TURN - 1);

        const { outcome } = await run(game, undo());
        expect(outcome).toEqual({ validMove: true, turnOver: false });
        expect(ff().space).toBe(START);
        expect(ff().apLeft).toBe(AP_PER_TURN);
        expect(game.currentTurn).toBe("u1");
        expect(game.gameState.history[0].text).toBe("{{u1}} took back their last move");
    });

    it("takes back a turn's worth of actions one at a time, newest first, and no further", async () => {
        const game = makeGame(baseState());
        const gs = () => game.specificGameState;
        const door = edgeBetween(KITCHEN, DINING)!;

        await run(game, action("move", { target: KITCHEN }));
        await run(game, action("door", { target: DINING }));
        await run(game, action("move", { target: DINING }));
        await run(game, action("move", { target: KITCHEN }));
        expect(gs().firefighters[0].apLeft).toBe(0);
        expect(gs().undoStack).toHaveLength(UNDO_STACK_DEPTH);

        await run(game, undo());
        expect(gs().firefighters[0].space).toBe(DINING);
        await run(game, undo());
        expect(gs().firefighters[0].space).toBe(KITCHEN);
        await run(game, undo());
        expect(gs().edges[door].doorOpen).toBe(false);
        await run(game, undo());
        expect(gs().firefighters[0].space).toBe(START);
        expect(gs().firefighters[0].apLeft).toBe(AP_PER_TURN);
        expect((await run(game, undo())).outcome.validMove).toBe(false);
    });

    it("puts the fire back after an extinguish, and the wall after a chop", async () => {
        const state = baseState();
        state.spaces[KITCHEN].threat = "fire";
        const wallTarget = spaceIndex(3, 1); // walled off from START
        const wall = edgeBetween(START, wallTarget)!;
        const game = makeGame(state);

        await run(game, action("extinguish", { target: KITCHEN }));
        await run(game, action("chop", { target: wallTarget }));
        expect(game.specificGameState.edges[wall].damage).toBe(1);

        await run(game, undo());
        expect(game.specificGameState.edges[wall].damage).toBe(0);
        await run(game, undo());
        expect(game.specificGameState.spaces[KITCHEN].threat).toBe("fire");
    });

    it("takes back a rescue that doesn't win: the victim is carried again and the count drops", async () => {
        const state = baseState();
        const ff = state.firefighters[0];
        ff.space = spaceIndex(0, 0);
        ff.carrying = "victim";
        const game = makeGame(state);

        await run(game, action("move", { target: exteriorTopSpace(0), carry: true }));
        expect(game.specificGameState.rescued).toBe(1);

        expect((await run(game, undo())).outcome.validMove).toBe(true);
        expect(game.specificGameState.rescued).toBe(0);
        expect(game.specificGameState.firefighters[0].carrying).toBe("victim");
        expect(game.specificGameState.firefighters[0].space).toBe(spaceIndex(0, 0));
    });

    it("takes back a drive, and the riders with it", async () => {
        const state = experiencedState();
        state.firefighters[0].space = state.engine;
        state.firefighters[1].space = state.engine;
        const engine = state.engine;
        const game = makeGame(state);
        const target = perimeterNeighbours(engine).find(space => space !== state.ambulance)!;

        await run(game, action("drive", { vehicle: "engine", target }));
        expect(game.specificGameState.engine).toBe(target);

        await run(game, undo());
        expect(game.specificGameState.engine).toBe(engine);
        expect(game.specificGameState.firefighters.map(f => f.space)).toEqual([engine, engine]);
    });

    it("pushes nothing for an action the rules refuse", async () => {
        const game = makeGame(baseState());
        const { outcome } = await run(game, action("move", { target: spaceIndex(3, 1) })); // walled off
        expect(outcome.validMove).toBe(false);
        expect(game.specificGameState.undoStack).toHaveLength(0);
        expect(game.specificGameState.undoAnchorId).toBeNull();
    });
});

describe("Fires Out — what can't be taken back", () => {
    it("never pushes a snapshot for a move onto a face-down POI, and can't reach past it", async () => {
        const state = baseState();
        state.spaces[DINING].poi = { id: 0, revealed: false, victim: true };
        state.edges[edgeBetween(KITCHEN, DINING)!].doorOpen = true;
        const game = makeGame(state);

        await run(game, action("move", { target: KITCHEN }));
        await run(game, action("move", { target: DINING }));
        expect(game.specificGameState.spaces[DINING].poi).toEqual({ id: 0, revealed: true, victim: true });

        expect((await run(game, undo())).outcome.validMove).toBe(false);
        expect(game.specificGameState.firefighters[0].space).toBe(DINING);
        expect(gameStateToModel(game.specificGameState, NAMES, "u1", lastId(game)).canUndo).toBe(false);
    });

    it("never pushes one for a false alarm either, though the marker leaves the board", async () => {
        const state = baseState();
        state.spaces[KITCHEN].poi = { id: 0, revealed: false, victim: false };
        const game = makeGame(state);

        await run(game, action("move", { target: KITCHEN }));
        expect(game.specificGameState.spaces[KITCHEN].poi).toBeNull();
        expect(game.specificGameState.undoStack).toHaveLength(0);
    });

    it("never pushes one for the Imaging Technician's remote reveal", async () => {
        const state = experiencedState(["u1"]);
        state.firefighters[0].specialist = "imagingTechnician";
        state.spaces[spaceIndex(4, 4)].poi = { id: 0, revealed: false, victim: true };
        const game = makeGame(state, ["u1"]);

        expect((await run(game, action("reveal", { target: spaceIndex(4, 4) }))).outcome.validMove).toBe(true);
        expect(game.specificGameState.undoStack).toHaveLength(0);
        expect((await run(game, undo())).outcome.validMove).toBe(false);
    });

    it("never pushes one for the deck gun, which rolls", async () => {
        const state = experiencedState();
        state.firefighters[0].space = state.engine;
        state.firefighters[1].space = spaceIndex(0, 0);
        state.spaces[spaceIndex(5, 7)].threat = "fire";
        const game = makeGame(state);

        expect((await run(game, action("deckGun", { target: spaceIndex(5, 7) }))).outcome.validMove).toBe(true);
        expect(game.specificGameState.undoStack).toHaveLength(0);
        expect((await run(game, undo())).outcome.validMove).toBe(false);
    });

    it("never pushes one for the rescue that wins", async () => {
        const state = baseState();
        state.rescued = VICTIMS_TO_WIN - 1;
        state.firefighters[0].space = spaceIndex(0, 0);
        state.firefighters[0].carrying = "victim";
        const game = makeGame(state);

        await run(game, action("move", { target: exteriorTopSpace(0), carry: true }));
        expect(game.complete).toBe(true);
        expect(game.specificGameState.undoStack).toHaveLength(0);
    });

    it("never pushes one for the chop that brings the building down", async () => {
        const state = baseState(["u1"]);
        const wallTarget = spaceIndex(3, 1);
        const target = edgeBetween(START, wallTarget)!;
        const others = state.edges.filter((e, id) => e.kind === "wall" && id !== target);
        others.slice(0, DAMAGE_TO_COLLAPSE / 2 - 1).forEach(e => { e.damage = 2; });
        others[DAMAGE_TO_COLLAPSE / 2].damage = 1;
        const game = makeGame(state, ["u1"]);

        await run(game, action("chop", { target: wallTarget }));
        expect(game.complete).toBe(true);
        expect(game.specificGameState.undoStack).toHaveLength(0);
    });

    it("refuses once End turn has run the fire, and the hand-off empties the stack", async () => {
        const game = makeGame(baseState());
        await run(game, action("move", { target: KITCHEN }));
        await run(game, action("endTurn"));
        expect(game.currentTurn).toBe("u2");
        expect(game.specificGameState.undoStack).toHaveLength(0);
        expect(game.specificGameState.undoAnchorId).toBeNull();

        expect((await run(game, undo("u1"))).outcome.validMove).toBe(false);
        expect((await run(game, undo("u2"))).outcome.validMove).toBe(false);
    });

    it("empties the stack on a solo crew's hand-off too, where the turn never leaves the player", async () => {
        const game = makeGame(baseState(["u1", "u1"]), ["u1"]);
        await run(game, action("move", { target: KITCHEN }));
        await run(game, action("endTurn"));
        expect(game.specificGameState.activeFirefighter).toBe(1);
        expect(game.specificGameState.undoStack).toHaveLength(0);
        expect((await run(game, undo())).outcome.validMove).toBe(false);
    });

    it("refuses a player the snapshot doesn't belong to", async () => {
        const game = makeGame(baseState());
        await run(game, action("move", { target: KITCHEN }));

        expect((await run(game, undo("u2"))).outcome.validMove).toBe(false);
        expect(game.specificGameState.firefighters[0].space).toBe(KITCHEN);
    });

    it("forgets the stack when a player drops out, so no snapshot can hand their figure back", async () => {
        const game = makeGame(baseState(["u1", "u2", "u3"]), ["u1", "u2", "u3"]);
        await run(game, action("move", { target: KITCHEN }));

        getPlayerDropoutAdapter("FiresOutGameType")!.dropPlayer(game, "u2");
        expect(game.specificGameState.undoStack).toHaveLength(0);
        expect((await run(game, undo())).outcome.validMove).toBe(false);
        expect(game.specificGameState.firefighters.some(f => f.ownerId === "u2")).toBe(false);
    });
});

describe("Fires Out — canUndo on the wire", () => {
    it("is the mover's alone, and only while their move is the last one", async () => {
        const game = makeGame(baseState());
        await run(game, action("move", { target: KITCHEN }));

        expect(gameStateToModel(game.specificGameState, NAMES, "u1", lastId(game)).canUndo).toBe(true);
        expect(gameStateToModel(game.specificGameState, NAMES, "u2", lastId(game)).canUndo).toBe(false);
        expect(gameStateToModel(game.specificGameState, NAMES, null, lastId(game)).canUndo).toBe(false);
        expect(gameStateToModel(game.specificGameState, NAMES, "u1", "a-later-command").canUndo).toBe(false);

        await run(game, action("endTurn"));
        expect(gameStateToModel(game.specificGameState, NAMES, "u1", lastId(game)).canUndo).toBe(false);
    });

    it("never sends the stack, the anchor, or a face-down marker the stack holds", async () => {
        const state = baseState();
        state.spaces[spaceIndex(0, 0)].poi = { id: 7, revealed: false, victim: true };
        const game = makeGame(state);
        await run(game, action("move", { target: KITCHEN }));

        const wire = gameStateToModel(game.specificGameState, NAMES, "u1", lastId(game));
        expect(wire).not.toHaveProperty("undoStack");
        expect(wire).not.toHaveProperty("undoAnchorId");
        expect(JSON.stringify(wire.spaces[spaceIndex(0, 0)])).not.toContain("victim");
    });
});

describe("Fires Out — replay and results", () => {
    it("replays a turn with undos in it to the live table's state", async () => {
        const state = baseState();
        state.spaces[KITCHEN].threat = "smoke";
        const game = makeGame(state);
        for (const command of [
            action("extinguish", { target: KITCHEN }),
            undo(),
            action("move", { target: KITCHEN }),
            action("door", { target: DINING }),
            undo(),
        ]) {
            expect((await run(game, command)).outcome.validMove).toBe(true);
        }
        expect(game.specificGameState.spaces[KITCHEN].threat).toBe("smoke");

        for (const viewerId of ["u1", "u2", null]) {
            const live = gameStateToModel(game.specificGameState, NAMES, viewerId, lastId(game));
            const replayed = (await buildTimeline(game, NAMES, [], undefined, viewerId)).snapshots;
            expect(replayed.at(-1)!.specificGameState).toEqual(live);
        }
    });

    it("takes a rescue taken back off the results chart", async () => {
        const state = baseState();
        state.firefighters[0].space = spaceIndex(0, 0);
        state.firefighters[0].carrying = "victim";
        const game = makeGame(state);
        await run(game, action("move", { target: exteriorTopSpace(0), carry: true }));
        await run(game, undo());

        const events: GameResultEvent[] = await computePerTurnEvents(game, detectRescueEvent);
        expect(events).toEqual([]);
    });
});

describe("Fires Out — the undoable commands never consume randomness", () => {
    // docs/undo.md §6's guard: a command that pushes a snapshot must never
    // carry a `recorded…` field once it has run, or taking it back would let a
    // player re-roll whatever it recorded.
    it("leaves every action that pushed with no recorded field", async () => {
        const state = experiencedState();
        state.spaces[KITCHEN].threat = "smoke";
        const game = makeGame(state);
        for (const command of [
            action("move", { target: KITCHEN }),
            action("extinguish", { target: KITCHEN }),
            action("door", { target: DINING }),
        ]) {
            expect((await run(game, command)).outcome.validMove).toBe(true);
            expect(game.specificGameState.undoAnchorId).toBe(command.id);
            expect(consumedRandomness(command)).toBe(false);
        }
    });

    it("declares undoable on exactly one command", () => {
        expect(undoableCommandsIn(import.meta.url, "FiresOutLogic.ts")).toEqual(["FiresOutAction"]);
    });
});
