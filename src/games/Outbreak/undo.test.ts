import { describe, expect, it } from "vitest";
import { undoableCommandsIn } from "@/utils/testing/undoableCommands";
import {
    OutbreakAction,
    OutbreakActionKind,
    OutbreakDiscard,
    OutbreakEndTurn,
    OutbreakGameType,
    OutbreakPlayEvent,
    OutbreakUndo,
} from "./OutbreakLogic";
import { cloneOutbreakState, gameStateToModel } from "./OutbreakModels";
import type { IOutbreakGameData, IOutbreakSpecificGameState } from "./OutbreakModels";
import {
    ATLANTA_CITY_ID,
    DISEASE_COLORS,
    EVENT_CARD_AIRLIFT,
    EVENT_CARD_FORECAST,
    EVENT_CARD_GOVERNMENT_GRANT,
    EVENT_CARD_ONE_QUIET_NIGHT,
    cityIdsForColor,
} from "./board";
import { ACTIONS_PER_TURN, HAND_LIMIT, UNDO_STACK_DEPTH, cureCardsRequired } from "./rules";
import { consumedRandomness } from "@/utils/apiModels/gameCommand";
import { runCommand } from "@/utils/games/commandPipeline";
import { getPlayerDropoutAdapter } from "@/utils/games/playerDropout";
import { buildTimeline } from "@/utils/games/replay";
import { baseState, idFor } from "./testFixtures";

// docs/undo.md's fourth game, shaped like Banned Islet's. Everything a player
// does in Outbreak's action phase is deterministic and none of it ends the
// turn, so every action — and an event card played or retrieved in the action
// phase — can be taken back, one at a time, until the player ends their turn.
// What never can: the draw and the infection (OutbreakEndTurn,
// OutbreakDiscard), Forecast (it shows the top of the infection deck), an
// event played mid-discard, and the cure that wins.

const NAMES = { u1: "Alice", u2: "Bob" };
const CHICAGO = idFor("Chicago");
const WASHINGTON = idFor("Washington");
const MONTREAL = idFor("Montreal");

function makeGame(state: IOutbreakSpecificGameState, turnOrder: string[] = ["u1", "u2"]): IOutbreakGameData {
    return {
        gameId: "g",
        gameType: new OutbreakGameType(),
        currentTurn: turnOrder[0],
        userIdList: turnOrder,
        gameState: { turnOrder, history: [], commandHistory: [] },
        specificGameState: state,
        initialSpecificGameState: cloneOutbreakState(state, turnOrder),
        complete: false,
        winner: "",
    } as unknown as IOutbreakGameData;
}

function as<T extends { senderId: string; senderUsername: string }>(command: T, senderId: string): T {
    command.senderId = senderId;
    command.senderUsername = senderId;
    return command;
}

function action(kind: OutbreakActionKind, fields: Partial<OutbreakAction> = {}, senderId = "u1"): OutbreakAction {
    return Object.assign(as(new OutbreakAction(), senderId), { kind }, fields);
}

function playEvent(fields: Partial<OutbreakPlayEvent>, senderId = "u1"): OutbreakPlayEvent {
    return Object.assign(as(new OutbreakPlayEvent(), senderId), fields);
}

const undo = (senderId = "u1") => as(new OutbreakUndo(), senderId);
const endTurn = (senderId = "u1") => as(new OutbreakEndTurn(), senderId);

function run(game: IOutbreakGameData, command: OutbreakAction | OutbreakPlayEvent | OutbreakUndo | OutbreakEndTurn | OutbreakDiscard) {
    return runCommand(game, new OutbreakGameType(), command);
}

function seat(game: IOutbreakGameData, userId: string) {
    return game.specificGameState.players.get(userId)!;
}

describe("Outbreak — undoing an action", () => {
    it("takes a drive back: the pawn, the action, the travel count and the log line", async () => {
        const game = makeGame(baseState(["u1", "u2"]));

        await run(game, action("drive", { destination: CHICAGO }));
        expect(seat(game, "u1").city).toBe(CHICAGO);
        expect(seat(game, "u1").actionsLeft).toBe(ACTIONS_PER_TURN - 1);

        const { outcome } = await run(game, undo());
        expect(outcome).toEqual({ validMove: true, turnOver: false });
        expect(seat(game, "u1").city).toBe(ATLANTA_CITY_ID);
        expect(seat(game, "u1").actionsLeft).toBe(ACTIONS_PER_TURN);
        expect(seat(game, "u1").timesTravelled).toBe(0);
        expect(game.currentTurn).toBe("u1");
        expect(game.gameState.history[0].text).toBe("{{u1}} took back their last move");
    });

    it("takes back all four of a turn's actions one at a time, newest first, and no further", async () => {
        const game = makeGame(baseState(["u1", "u2"]));

        await run(game, action("drive", { destination: CHICAGO }));
        await run(game, action("drive", { destination: MONTREAL }));
        await run(game, action("drive", { destination: WASHINGTON }));
        await run(game, action("drive", { destination: ATLANTA_CITY_ID }));
        expect(seat(game, "u1").actionsLeft).toBe(0);
        expect(game.specificGameState.undoStack).toHaveLength(UNDO_STACK_DEPTH);

        for (const city of [WASHINGTON, MONTREAL, CHICAGO, ATLANTA_CITY_ID]) {
            expect((await run(game, undo())).outcome.validMove).toBe(true);
            expect(seat(game, "u1").city).toBe(city);
        }
        expect(seat(game, "u1").actionsLeft).toBe(ACTIONS_PER_TURN);
        expect((await run(game, undo())).outcome.validMove).toBe(false);
    });

    it("puts treated cubes back on the city and in no supply", async () => {
        const state = baseState(["u1", "u2"]);
        state.cities[ATLANTA_CITY_ID].cubes.blue = 2;
        state.cubesLeft.blue -= 2;
        const game = makeGame(state);

        await run(game, action("treatDisease", { color: "blue" }));
        expect(game.specificGameState.cities[ATLANTA_CITY_ID].cubes.blue).toBe(1);

        await run(game, undo());
        expect(game.specificGameState.cities[ATLANTA_CITY_ID].cubes.blue).toBe(2);
        expect(game.specificGameState.cubesLeft.blue).toBe(state.cubesLeft.blue);
        expect(seat(game, "u1").cubesTreated).toBe(0);
    });

    it("gives a shared card back to the giver", async () => {
        const state = baseState(["u1", "u2"]);
        state.players.get("u1")!.hand = [ATLANTA_CITY_ID];
        const game = makeGame(state);

        await run(game, action("shareKnowledge", { targetUserId: "u2", direction: "give" }));
        expect(seat(game, "u2").hand).toEqual([ATLANTA_CITY_ID]);

        await run(game, undo());
        expect(seat(game, "u1").hand).toEqual([ATLANTA_CITY_ID]);
        expect(seat(game, "u2").hand).toEqual([]);
    });

    it("takes back a cure that doesn't win: the cards come back and the disease is uncured", async () => {
        const state = baseState(["u1", "u2"]);
        const blueCards = cityIdsForColor("blue").slice(0, cureCardsRequired());
        state.players.get("u1")!.hand = [...blueCards];
        const game = makeGame(state);

        await run(game, action("cure", { color: "blue", cardIds: blueCards }));
        expect(game.specificGameState.cures.blue).not.toBe("none");

        await run(game, undo());
        expect(game.specificGameState.cures.blue).toBe("none");
        expect(seat(game, "u1").hand).toEqual(blueCards);
        expect(game.specificGameState.playerDiscard).toEqual([]);
    });

    it("takes back a forfeit, handing the action back", async () => {
        const game = makeGame(baseState(["u1", "u2"]));
        await run(game, action("pass"));
        await run(game, undo());
        expect(seat(game, "u1").actionsLeft).toBe(ACTIONS_PER_TURN);
    });

    it("restores from a copy, not a view — a later change to the live state can't reach the snapshot", async () => {
        const state = baseState(["u1", "u2"]);
        state.players.get("u1")!.hand = [CHICAGO];
        const game = makeGame(state);
        await run(game, action("drive", { destination: WASHINGTON }));

        seat(game, "u1").hand.push(MONTREAL);

        await run(game, undo());
        expect(seat(game, "u1").hand).toEqual([CHICAGO]);
    });

    it("pushes nothing for an action the rules refuse", async () => {
        const game = makeGame(baseState(["u1", "u2"]));
        const { outcome } = await run(game, action("treatDisease", { color: "blue" })); // no cubes to treat
        expect(outcome.validMove).toBe(false);
        expect(game.specificGameState.undoStack).toHaveLength(0);
        expect(game.specificGameState.undoAnchorId).toBeNull();
    });

    it("never pushes a snapshot for the cure that wins", async () => {
        const state = baseState(["u1", "u2"]);
        state.cures = { blue: "none", yellow: "cured", black: "cured", red: "cured" };
        const blueCards = cityIdsForColor("blue").slice(0, cureCardsRequired());
        state.players.get("u1")!.hand = [...blueCards];
        const game = makeGame(state);

        await run(game, action("cure", { color: "blue", cardIds: blueCards }));
        expect(game.complete).toBe(true);
        expect(game.specificGameState.undoStack).toHaveLength(0);
        expect(DISEASE_COLORS.every(c => game.specificGameState.cures[c] !== "none")).toBe(true);
    });
});

describe("Outbreak — event cards", () => {
    it("takes back an Airlift played in the action phase, card and all", async () => {
        const state = baseState(["u1", "u2"]);
        state.players.get("u1")!.hand = [EVENT_CARD_AIRLIFT];
        const game = makeGame(state);

        await run(game, playEvent({ cardId: EVENT_CARD_AIRLIFT, targetUserId: "u2", destination: CHICAGO }));
        expect(seat(game, "u2").city).toBe(CHICAGO);

        expect((await run(game, undo())).outcome.validMove).toBe(true);
        expect(seat(game, "u2").city).toBe(ATLANTA_CITY_ID);
        expect(seat(game, "u1").hand).toEqual([EVENT_CARD_AIRLIFT]);
        expect(game.specificGameState.playerDiscard).toEqual([]);
    });

    it("takes back a Contingency Planner's retrieval, returning the card to the discard pile", async () => {
        const state = baseState(["u1", "u2"]);
        state.players.get("u1")!.role = "contingencyPlanner";
        state.playerDiscard = [EVENT_CARD_ONE_QUIET_NIGHT];
        const game = makeGame(state);

        await run(game, playEvent({ kind: "retrieve", cardId: EVENT_CARD_ONE_QUIET_NIGHT }));
        expect(seat(game, "u1").contingencyCard).toBe(EVENT_CARD_ONE_QUIET_NIGHT);

        await run(game, undo());
        expect(seat(game, "u1").contingencyCard).toBeNull();
        expect(seat(game, "u1").actionsLeft).toBe(ACTIONS_PER_TURN);
        expect(game.specificGameState.playerDiscard).toEqual([EVENT_CARD_ONE_QUIET_NIGHT]);
    });

    it("never pushes a snapshot for Forecast — the top of the infection deck can't be un-seen", async () => {
        const state = baseState(["u1", "u2"]);
        state.players.get("u1")!.hand = [EVENT_CARD_FORECAST];
        state.infectionDeck = [1, 2, 3, 4, 5, 6, 7];
        const game = makeGame(state);

        await run(game, action("pass"));
        await run(game, playEvent({ cardId: EVENT_CARD_FORECAST }));
        expect(game.specificGameState.phase).toBe("forecast");

        // Nor can it reach back past the Forecast to the forfeit before it.
        expect((await run(game, undo())).outcome.validMove).toBe(false);
        expect(game.specificGameState.phase).toBe("forecast");
    });

    it("never pushes a snapshot for an event played to close the discard phase — that runs the infection", async () => {
        const hand = [EVENT_CARD_GOVERNMENT_GRANT, ...cityIdsForColor("blue").slice(0, HAND_LIMIT)];
        const state = baseState(["u1", "u2"]);
        state.players.get("u1")!.hand = hand;
        state.players.get("u1")!.actionsLeft = 0;
        state.phase = "discard";
        const game = makeGame(state);

        const { outcome } = await run(game, playEvent({ cardId: EVENT_CARD_GOVERNMENT_GRANT, destination: CHICAGO }));
        expect(outcome.turnOver).toBe(true);
        expect(game.currentTurn).toBe("u2");
        expect(game.specificGameState.undoStack).toHaveLength(0);
        expect((await run(game, undo())).outcome.validMove).toBe(false);
    });
});

describe("Outbreak — what can't be taken back", () => {
    it("refuses once End turn has drawn, and the hand-off empties the stack", async () => {
        const state = baseState(["u1", "u2"]);
        state.playerDeck = [CHICAGO, WASHINGTON];
        state.players.get("u1")!.actionsLeft = 1;
        const game = makeGame(state);

        await run(game, action("pass"));
        await run(game, endTurn());
        expect(game.currentTurn).toBe("u2");
        expect(game.specificGameState.undoStack).toHaveLength(0);
        expect(game.specificGameState.undoAnchorId).toBeNull();

        expect((await run(game, undo("u1"))).outcome.validMove).toBe(false);
        expect((await run(game, undo("u2"))).outcome.validMove).toBe(false);
    });

    it("refuses after an End turn that stopped for a hand-limit discard, though the turn is still theirs", async () => {
        const state = baseState(["u1", "u2"]);
        state.players.get("u1")!.hand = cityIdsForColor("blue").slice(0, HAND_LIMIT);
        state.players.get("u1")!.actionsLeft = 1;
        state.playerDeck = cityIdsForColor("red").slice(0, 2);
        const game = makeGame(state);

        await run(game, action("pass"));
        await run(game, endTurn());
        expect(game.specificGameState.phase).toBe("discard");
        expect(game.currentTurn).toBe("u1");

        expect((await run(game, undo())).outcome.validMove).toBe(false);
        expect(seat(game, "u1").hand).toHaveLength(HAND_LIMIT + 2);
    });

    it("refuses a player the snapshot doesn't belong to", async () => {
        const game = makeGame(baseState(["u1", "u2"]));
        await run(game, action("drive", { destination: CHICAGO }));

        expect((await run(game, undo("u2"))).outcome.validMove).toBe(false);
        expect(seat(game, "u1").city).toBe(CHICAGO);
    });

    it("forgets the stack when a player drops out, so no snapshot can bring their pawn back", async () => {
        const game = makeGame(baseState(["u1", "u2", "u3"]), ["u1", "u2", "u3"]);
        await run(game, action("drive", { destination: CHICAGO }));

        getPlayerDropoutAdapter("OutbreakGameType")!.dropPlayer(game, "u2");
        expect(game.specificGameState.undoStack).toHaveLength(0);
        expect((await run(game, undo())).outcome.validMove).toBe(false);
        expect(game.specificGameState.players.has("u2")).toBe(false);
    });
});

describe("Outbreak — canUndo on the wire", () => {
    it("is the mover's alone, and only while their move is the last one", async () => {
        const state = baseState(["u1", "u2"]);
        state.playerDeck = [CHICAGO, WASHINGTON];
        state.players.get("u1")!.actionsLeft = 1;
        const game = makeGame(state);
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
        const game = makeGame(baseState(["u1", "u2"]));
        await run(game, action("drive", { destination: CHICAGO }));
        const wire = gameStateToModel(game.specificGameState, NAMES, "u1", game.gameState.commandHistory.at(-1)!.id);
        expect(wire).not.toHaveProperty("undoStack");
        expect(wire).not.toHaveProperty("undoAnchorId");
    });
});

describe("Outbreak — replay", () => {
    it("replays an out-of-turn event against the same active player's board", async () => {
        const state = baseState(["u1", "u2"]);
        state.players.get("u2")!.hand = [EVENT_CARD_AIRLIFT];
        const game = makeGame(state);
        const command = playEvent({ cardId: EVENT_CARD_AIRLIFT, targetUserId: "u1", destination: MONTREAL }, "u2");

        expect((await runCommand(game, new OutbreakGameType(), command, { outOfTurn: true })).outcome.validMove).toBe(true);
        const live = gameStateToModel(game.specificGameState, NAMES, "u1", command.id);
        const replayed = (await buildTimeline(game, NAMES, [], undefined, "u1")).snapshots.at(-1)!;

        expect(replayed.currentTurn).toBe("u1");
        expect(replayed.specificGameState).toEqual(live);
    });

    it("replays a turn with an undo in the middle of it to the live table's state", async () => {
        const state = baseState(["u1", "u2"]);
        state.players.get("u1")!.hand = [EVENT_CARD_AIRLIFT];
        const game = makeGame(state);
        await run(game, action("drive", { destination: CHICAGO }));
        await run(game, undo());
        await run(game, action("drive", { destination: WASHINGTON }));
        await run(game, playEvent({ cardId: EVENT_CARD_AIRLIFT, targetUserId: "u2", destination: MONTREAL }));
        await run(game, undo());

        const lastId = game.gameState.commandHistory.at(-1)!.id;
        for (const viewerId of ["u1", "u2", null]) {
            const live = gameStateToModel(game.specificGameState, NAMES, viewerId, lastId);
            const replayed = (await buildTimeline(game, NAMES, [], undefined, viewerId)).snapshots;
            expect(replayed.at(-1)!.specificGameState).toEqual(live);
        }
    });
});

describe("Outbreak — the undoable commands never consume randomness", () => {
    // docs/undo.md §6's guard: a command that declares `undoable` must never
    // carry a `recorded…` field once it has run, or taking it back would let a
    // player re-roll whatever it recorded.
    it("leaves an action and an action-phase event with no recorded field", async () => {
        const state = baseState(["u1", "u2"]);
        state.players.get("u1")!.hand = [EVENT_CARD_AIRLIFT];
        const game = makeGame(state);
        for (const command of [
            action("drive", { destination: CHICAGO }),
            playEvent({ cardId: EVENT_CARD_AIRLIFT, targetUserId: "u2", destination: MONTREAL }),
        ]) {
            expect((await run(game, command)).outcome.validMove).toBe(true);
            expect(game.specificGameState.undoAnchorId).toBe(command.id);
            expect(consumedRandomness(command)).toBe(false);
        }
    });

    it("declares undoable on exactly these two commands, and no others", () => {
        expect(undoableCommandsIn(import.meta.url, "OutbreakLogic.ts")).toEqual(["OutbreakAction", "OutbreakPlayEvent"]);
    });
});
