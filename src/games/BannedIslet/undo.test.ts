import { describe, expect, it } from "vitest";
import { undoableCommandsIn } from "@/utils/testing/undoableCommands";
import {
    BannedIsletAction,
    BannedIsletActionKind,
    BannedIsletDiscard,
    BannedIsletEndTurn,
    BannedIsletGameType,
    BannedIsletPlayCard,
    BannedIsletUndo,
} from "./BannedIsletLogic";
import { cloneBannedIsletState, gameStateToModel } from "./BannedIsletModels";
import type { IBannedIsletGameData, IBannedIsletSpecificGameState } from "./BannedIsletModels";
import { ACTIONS_PER_TURN, CARDS_TO_CAPTURE, HAND_LIMIT, PIER_TILE, TREASURES, UNDO_STACK_DEPTH, BannedIsletCardId } from "./board";
import { positionOfTile } from "./rules";
import { consumedRandomness } from "@/utils/apiModels/gameCommand";
import { runCommand } from "@/utils/games/commandPipeline";
import { getPlayerDropoutAdapter } from "@/utils/games/playerDropout";
import { buildTimeline } from "@/utils/games/replay";
import { EAST_OF_MIDDLE, MIDDLE, NORTH_OF_MIDDLE, WEST_OF_MIDDLE, baseState } from "./testFixtures";

// docs/undo.md's third game. Everything a player does in Banned Islet's action
// phase is deterministic and none of it ends the turn, so every action — and a
// special card played in the action phase — can be taken back, one at a time,
// until the player ends their turn. What never can: the draw and the flood
// (BannedIsletEndTurn, BannedIsletDiscard), a special that closes the discard
// phase and so runs the flood, and the Helicopter Lift that wins.

const NAMES = { u1: "Alice", u2: "Bob" };

function makeGame(state: IBannedIsletSpecificGameState, turnOrder: string[] = ["u1", "u2"]): IBannedIsletGameData {
    return {
        gameId: "g",
        gameType: new BannedIsletGameType(),
        currentTurn: turnOrder[0],
        userIdList: turnOrder,
        gameState: { turnOrder, history: [], commandHistory: [] },
        specificGameState: state,
        initialSpecificGameState: cloneBannedIsletState(state, turnOrder),
        complete: false,
        winner: "",
    } as unknown as IBannedIsletGameData;
}

function as<T extends { senderId: string; senderUsername: string }>(command: T, senderId: string): T {
    command.senderId = senderId;
    command.senderUsername = senderId;
    return command;
}

function action(kind: BannedIsletActionKind, fields: Partial<BannedIsletAction> = {}, senderId = "u1"): BannedIsletAction {
    return Object.assign(as(new BannedIsletAction(), senderId), { kind }, fields);
}

function playCard(fields: Partial<BannedIsletPlayCard>, senderId = "u1"): BannedIsletPlayCard {
    return Object.assign(as(new BannedIsletPlayCard(), senderId), fields);
}

const undo = (senderId = "u1") => as(new BannedIsletUndo(), senderId);
const endTurn = (senderId = "u1") => as(new BannedIsletEndTurn(), senderId);

function run(game: IBannedIsletGameData, command: BannedIsletAction | BannedIsletPlayCard | BannedIsletUndo | BannedIsletEndTurn | BannedIsletDiscard) {
    return runCommand(game, new BannedIsletGameType(), command);
}

function seat(game: IBannedIsletGameData, userId: string) {
    return game.specificGameState.players.get(userId)!;
}

describe("Banned Islet — undoing an action", () => {
    it("takes a move back: the pawn, the action and the log line", async () => {
        const game = makeGame(baseState({ u1: {}, u2: {} }));

        await run(game, action("move", { target: NORTH_OF_MIDDLE }));
        expect(seat(game, "u1").position).toBe(NORTH_OF_MIDDLE);
        expect(seat(game, "u1").actionsLeft).toBe(ACTIONS_PER_TURN - 1);

        const { outcome } = await run(game, undo());
        expect(outcome).toEqual({ validMove: true, turnOver: false });
        expect(seat(game, "u1").position).toBe(MIDDLE);
        expect(seat(game, "u1").actionsLeft).toBe(ACTIONS_PER_TURN);
        expect(game.currentTurn).toBe("u1");
        expect(game.gameState.history[0].text).toBe("{{u1}} took back their last move");
    });

    it("takes back all three of a turn's actions one at a time, newest first, and no further", async () => {
        const game = makeGame(baseState({ u1: {}, u2: {} }, { flooded: [EAST_OF_MIDDLE] }));

        await run(game, action("move", { target: WEST_OF_MIDDLE }));
        await run(game, action("move", { target: MIDDLE }));
        await run(game, action("shoreUp", { target: EAST_OF_MIDDLE }));
        expect(seat(game, "u1").actionsLeft).toBe(0);
        expect(game.specificGameState.undoStack).toHaveLength(UNDO_STACK_DEPTH);

        expect((await run(game, undo())).outcome.validMove).toBe(true);
        expect(game.specificGameState.positions[EAST_OF_MIDDLE].state).toBe("flooded");
        expect(seat(game, "u1").position).toBe(MIDDLE);

        expect((await run(game, undo())).outcome.validMove).toBe(true);
        expect(seat(game, "u1").position).toBe(WEST_OF_MIDDLE);

        expect((await run(game, undo())).outcome.validMove).toBe(true);
        expect(seat(game, "u1").position).toBe(MIDDLE);
        expect(seat(game, "u1").actionsLeft).toBe(ACTIONS_PER_TURN);

        expect((await run(game, undo())).outcome.validMove).toBe(false);
    });

    it("gives a handed-over card back to the giver", async () => {
        const game = makeGame(baseState({ u1: { hand: ["emberCrown"] }, u2: {} }));

        await run(game, action("giveCard", { targetUserId: "u2", cardId: "emberCrown" }));
        expect(seat(game, "u2").hand).toEqual(["emberCrown"]);

        await run(game, undo());
        expect(seat(game, "u1").hand).toEqual(["emberCrown"]);
        expect(seat(game, "u2").hand).toEqual([]);
    });

    it("puts a captured treasure back on the island and the four cards back in the hand", async () => {
        const state = baseState({ u1: { hand: Array<BannedIsletCardId>(CARDS_TO_CAPTURE).fill("emberCrown") }, u2: {} });
        const game = makeGame(state);
        seat(game, "u1").position = positionOfTile(state.positions, TREASURES.find(t => t.id === "emberCrown")!.tiles[0]);

        await run(game, action("capture"));
        expect(state.treasures.emberCrown).toBe(true);

        await run(game, undo());
        expect(game.specificGameState.treasures.emberCrown).toBe(false);
        expect(seat(game, "u1").hand).toHaveLength(CARDS_TO_CAPTURE);
        expect(game.specificGameState.treasureDiscard).toEqual([]);
    });

    it("takes back a pass, handing the forfeited actions back", async () => {
        const game = makeGame(baseState({ u1: {}, u2: {} }));
        await run(game, action("pass"));
        expect(seat(game, "u1").actionsLeft).toBe(0);

        await run(game, undo());
        expect(seat(game, "u1").actionsLeft).toBe(ACTIONS_PER_TURN);
    });

    it("restores from a copy, not a view — a later change to the live state can't reach the snapshot", async () => {
        const game = makeGame(baseState({ u1: { hand: ["stormIdol"] }, u2: {} }));
        await run(game, action("move", { target: NORTH_OF_MIDDLE }));

        seat(game, "u1").hand.push("tideChalice");

        await run(game, undo());
        expect(seat(game, "u1").hand).toEqual(["stormIdol"]);
    });

    it("pushes nothing for an action the rules refuse", async () => {
        const game = makeGame(baseState({ u1: {}, u2: {} }));
        const { outcome } = await run(game, action("shoreUp", { target: MIDDLE })); // dry: nothing to pump
        expect(outcome.validMove).toBe(false);
        expect(game.specificGameState.undoStack).toHaveLength(0);
        expect(game.specificGameState.undoAnchorId).toBeNull();
    });
});

describe("Banned Islet — special cards", () => {
    it("takes back Sandbags played in the action phase, card and all", async () => {
        const game = makeGame(baseState({ u1: { hand: ["sandbags"] }, u2: {} }, { flooded: [EAST_OF_MIDDLE] }));

        await run(game, playCard({ cardId: "sandbags", target: EAST_OF_MIDDLE }));
        expect(game.specificGameState.positions[EAST_OF_MIDDLE].state).toBe("dry");

        expect((await run(game, undo())).outcome.validMove).toBe(true);
        expect(game.specificGameState.positions[EAST_OF_MIDDLE].state).toBe("flooded");
        expect(seat(game, "u1").hand).toEqual(["sandbags"]);
        expect(game.specificGameState.treasureDiscard).toEqual([]);
    });

    it("never pushes a snapshot for a special played to close the discard phase — that runs the flood", async () => {
        const hand: BannedIsletCardId[] = ["sandbags", "emberCrown", "emberCrown", "stormIdol", "stormIdol", "tideChalice"];
        expect(hand.length).toBe(HAND_LIMIT + 1);
        const state = baseState({ u1: { hand, actionsLeft: 0 }, u2: {} }, { flooded: [EAST_OF_MIDDLE] });
        state.phase = "discard";
        const game = makeGame(state);

        const { outcome } = await run(game, playCard({ cardId: "sandbags", target: EAST_OF_MIDDLE }));
        expect(outcome.turnOver).toBe(true);
        expect(game.currentTurn).toBe("u2");
        expect(game.specificGameState.undoStack).toHaveLength(0);
        expect((await run(game, undo())).outcome.validMove).toBe(false);
    });

    it("never pushes a snapshot for the Helicopter Lift that wins", async () => {
        const state = baseState({ u1: { hand: ["helicopterLift"] }, u2: {} });
        const pier = positionOfTile(state.positions, PIER_TILE);
        for (const ps of state.players.values()) ps.position = pier;
        for (const id of Object.keys(state.treasures)) state.treasures[id as keyof typeof state.treasures] = true;
        const game = makeGame(state);

        await run(game, playCard({ cardId: "helicopterLift" }));
        expect(game.complete).toBe(true);
        expect(game.specificGameState.undoStack).toHaveLength(0);
    });
});

describe("Banned Islet — what can't be taken back", () => {
    it("refuses once End turn has drawn, and the hand-off empties the stack", async () => {
        const game = makeGame(baseState({ u1: {}, u2: {} }));
        await run(game, action("pass"));
        await run(game, endTurn());
        expect(game.currentTurn).toBe("u2");
        expect(game.specificGameState.undoStack).toHaveLength(0);
        expect(game.specificGameState.undoAnchorId).toBeNull();

        expect((await run(game, undo("u1"))).outcome.validMove).toBe(false);
        expect((await run(game, undo("u2"))).outcome.validMove).toBe(false);
    });

    it("refuses after an End turn that stopped for a hand-limit discard, though the turn is still theirs", async () => {
        const state = baseState({ u1: { hand: ["emberCrown", "emberCrown", "stormIdol", "stormIdol", "tideChalice"] }, u2: {} });
        state.treasureDeck = ["rootStone", "rootStone"];
        const game = makeGame(state);

        await run(game, action("pass"));
        await run(game, endTurn());
        expect(game.specificGameState.phase).toBe("discard");
        expect(game.currentTurn).toBe("u1");

        expect((await run(game, undo())).outcome.validMove).toBe(false);
        expect(seat(game, "u1").hand).toHaveLength(HAND_LIMIT + 2);
    });

    it("refuses a player the snapshot doesn't belong to", async () => {
        const game = makeGame(baseState({ u1: {}, u2: {} }));
        await run(game, action("move", { target: NORTH_OF_MIDDLE }));

        expect((await run(game, undo("u2"))).outcome.validMove).toBe(false);
        expect(seat(game, "u1").position).toBe(NORTH_OF_MIDDLE);
    });

    it("forgets the stack when a teammate plays a special on this turn, so no undo can hand it back", async () => {
        // Without that, the active player's next action pushes a snapshot
        // taken after the teammate's card, and undoing *two* would reach one
        // taken before it: the tile wet again and the card back in the
        // teammate's hand, on a move the teammate never took back.
        const game = makeGame(baseState({ u1: {}, u2: { hand: ["sandbags"] } }, { flooded: [EAST_OF_MIDDLE] }));
        await run(game, action("move", { target: NORTH_OF_MIDDLE }));

        const outOfTurn = await runCommand(game, new BannedIsletGameType(), playCard({ cardId: "sandbags", target: EAST_OF_MIDDLE }, "u2"), { outOfTurn: true });
        expect(outOfTurn.outcome.validMove).toBe(true);
        expect(game.specificGameState.undoStack).toHaveLength(0);
        expect(game.specificGameState.undoAnchorId).toBeNull();

        await run(game, action("move", { target: MIDDLE }));
        expect((await run(game, undo())).outcome.validMove).toBe(true);
        expect(seat(game, "u1").position).toBe(NORTH_OF_MIDDLE);
        expect((await run(game, undo())).outcome.validMove).toBe(false);
        expect(game.specificGameState.positions[EAST_OF_MIDDLE].state).toBe("dry");
        expect(seat(game, "u2").hand).toEqual([]);
    });

    it("forgets the stack when a player drops out, so no snapshot can bring their pawn back", async () => {
        const game = makeGame(baseState({ u1: {}, u2: {}, u3: {} }), ["u1", "u2", "u3"]);
        await run(game, action("move", { target: NORTH_OF_MIDDLE }));

        getPlayerDropoutAdapter("BannedIsletGameType")!.dropPlayer(game, "u2");
        expect(game.specificGameState.undoStack).toHaveLength(0);
        expect((await run(game, undo())).outcome.validMove).toBe(false);
        expect(game.specificGameState.players.has("u2")).toBe(false);
    });
});

describe("Banned Islet — canUndo on the wire", () => {
    it("is the mover's alone, and only while their move is the last one", async () => {
        const game = makeGame(baseState({ u1: {}, u2: {} }));
        await run(game, action("pass"));

        const lastId = () => game.gameState.commandHistory.at(-1)!.id;
        expect(gameStateToModel(game.specificGameState, NAMES, "u1", lastId()).canUndo).toBe(true);
        expect(gameStateToModel(game.specificGameState, NAMES, "u2", lastId()).canUndo).toBe(false);
        expect(gameStateToModel(game.specificGameState, NAMES, null, lastId()).canUndo).toBe(false);
        // Not the tail any more: somebody else's command id stands behind it.
        expect(gameStateToModel(game.specificGameState, NAMES, "u1", "a-later-command").canUndo).toBe(false);

        await run(game, endTurn());
        expect(gameStateToModel(game.specificGameState, NAMES, "u1", lastId()).canUndo).toBe(false);
    });

    it("never sends the stack or the anchor", async () => {
        const game = makeGame(baseState({ u1: {}, u2: {} }));
        await run(game, action("move", { target: NORTH_OF_MIDDLE }));
        const wire = gameStateToModel(game.specificGameState, NAMES, "u1", game.gameState.commandHistory.at(-1)!.id);
        expect(wire).not.toHaveProperty("undoStack");
        expect(wire).not.toHaveProperty("undoAnchorId");
    });
});

describe("Banned Islet — replay", () => {
    it("replays a turn with an undo in the middle of it to the live table's state", async () => {
        const game = makeGame(baseState({ u1: { hand: ["sandbags"] }, u2: {} }, { flooded: [EAST_OF_MIDDLE] }));
        await run(game, action("move", { target: NORTH_OF_MIDDLE }));
        await run(game, undo());
        await run(game, action("move", { target: WEST_OF_MIDDLE }));
        await run(game, playCard({ cardId: "sandbags", target: EAST_OF_MIDDLE }));
        await run(game, undo());

        const lastId = game.gameState.commandHistory.at(-1)!.id;
        for (const viewerId of ["u1", "u2", null]) {
            const live = gameStateToModel(game.specificGameState, NAMES, viewerId, lastId);
            const replayed = (await buildTimeline(game, NAMES, [], undefined, viewerId)).snapshots;
            expect(replayed.at(-1)!.specificGameState).toEqual(live);
        }
    });
});

describe("Banned Islet — the undoable commands never consume randomness", () => {
    // docs/undo.md §6's guard: a command that declares `undoable` must never
    // carry a `recorded…` field once it has run, or taking it back would let a
    // player re-roll whatever it recorded.
    it("leaves every kind of action with no recorded field", async () => {
        const game = makeGame(baseState({ u1: { hand: ["emberCrown"] }, u2: {} }, { flooded: [EAST_OF_MIDDLE] }));
        for (const command of [
            action("move", { target: NORTH_OF_MIDDLE }),
            action("move", { target: MIDDLE }),
            action("shoreUp", { target: EAST_OF_MIDDLE }),
        ]) {
            expect((await run(game, command)).outcome.validMove).toBe(true);
            expect(consumedRandomness(command)).toBe(false);
        }
        const give = action("giveCard", { targetUserId: "u2", cardId: "emberCrown" });
        await run(makeGame(baseState({ u1: { hand: ["emberCrown"] }, u2: {} })), give);
        expect(consumedRandomness(give)).toBe(false);
    });

    it("leaves a special played in the action phase with no recorded field", async () => {
        const game = makeGame(baseState({ u1: { hand: ["sandbags"] }, u2: {} }, { flooded: [EAST_OF_MIDDLE] }));
        const card = playCard({ cardId: "sandbags", target: EAST_OF_MIDDLE });
        expect((await run(game, card)).outcome.validMove).toBe(true);
        expect(game.specificGameState.undoAnchorId).toBe(card.id);
        expect(consumedRandomness(card)).toBe(false);
    });

    it("declares undoable on exactly these two commands, and no others", () => {
        expect(undoableCommandsIn(import.meta.url, "BannedIsletLogic.ts")).toEqual(["BannedIsletAction", "BannedIsletPlayCard"]);
    });
});
