import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { RaceCarsGameType } from "./RaceCarsLogic";
import { gameStateToModel, cloneRaceCarsState } from "./RaceCarsModels";
import { consumedRandomness } from "@/utils/apiModels/gameCommand";
import { buildTimeline } from "@/utils/games/replay";
import { log, makeGame, move, race, run, seat, shift, slipstream, undo } from "./testFixtures";

// docs/undo.md §16's second pilot. RaceCarsMove (picking a destination after a
// roll) and RaceCarsSlipstream (taking or declining a tow) are the two
// decisions Race Cars asks for once the dice have already spoken — never the
// roll itself (§6a's launch, RaceCarsShift's gear roll), and never a leg that
// rolled again partway through for oil (§14) or crossed the line, both of
// which would let a driver take back a roll under cover of taking back a move.
//
// A d6 that never comes up a spin, so a slick can be crossed deterministically
// without derailing the position a test expects the car to land on.
vi.mock("@/utils/games/DiceRoll", () => ({ DiceRoll: () => 6 }));

describe("Race Cars — undoing a move", () => {
    it("restores position, phase, roll and the resources it spent", async () => {
        const gs = race({ a: { phase: "move", roll: 7, row: 20, lane: 2, brakes: 4 } });
        const game = makeGame(gs);

        await run(game, move({ row: 24, lane: 2, brake: 3 }));
        expect(seat(game, "a").row).toBe(24);
        expect(seat(game, "a").brakes).toBe(1);
        expect(gs.undoStack).toHaveLength(1);

        const undone = await run(game, undo());
        expect(undone.outcome.validMove).toBe(true);
        expect(seat(game, "a").row).toBe(20);
        expect(seat(game, "a").lane).toBe(2);
        expect(seat(game, "a").brakes).toBe(4);
        expect(seat(game, "a").phase).toBe("move");
        expect(seat(game, "a").roll).toBe(7);
        expect(gs.undoStack).toHaveLength(0);
    });

    it("restores from a copy, not a view — a later mutation of the live state can't leak into the snapshot", async () => {
        const gs = race({ a: { phase: "move", roll: 7, row: 20, lane: 2 } });
        const game = makeGame(gs);
        await run(game, move({ row: 27, lane: 1 }));

        // Simulate the live state moving on after the snapshot was taken.
        seat(game, "a").tyres = 999;

        await run(game, undo());
        expect(seat(game, "a").tyres).toBe(5);
    });

    it("puts the hand-off back too, not just the board — the one thing outside specificGameState", async () => {
        // b is far enough away that the move offers no tow, so it ends the
        // turn outright and CheckEndTurn advances currentTurn to b.
        const gs = race({
            a: { phase: "move", roll: 7, row: 20, lane: 2 },
            b: { row: 70, lane: 1 },
        });
        const game = makeGame(gs);

        const { outcome } = await run(game, move({ row: 27, lane: 1 }));
        expect(outcome.turnOver).toBe(true);
        expect(game.currentTurn).toBe("b");

        const undone = await run(game, undo());
        expect(undone.outcome.validMove).toBe(true);
        // The board's own turn order came back with everything else...
        expect(gs.roundIndex).toBe(0);
        // ...and so does the field CheckEndTurn moved outside specificGameState,
        // which is the one thing a plain Object.assign(gs, restored) can't reach.
        expect(game.currentTurn).toBe("a");
    });
});

describe("Race Cars — canUndo and the anchor", () => {
    it("reports canUndo for the driver who moved, and nobody else", async () => {
        const gs = race({ a: { phase: "move", roll: 7, row: 20, lane: 2 } });
        const game = makeGame(gs);
        await run(game, move({ row: 27, lane: 1 }));

        const lastId = game.gameState.commandHistory.at(-1)!.id;
        const NAMES = { a: "Alice", b: "Bob" };
        expect(gameStateToModel(gs, NAMES, "a", lastId).canUndo).toBe(true);
        expect(gameStateToModel(gs, NAMES, "b", lastId).canUndo).toBe(false);
        expect(gameStateToModel(gs, NAMES, null, lastId).canUndo).toBe(false);
    });

    it("refuses once anything else has been played since the snapshot", async () => {
        const gs = race({
            a: { phase: "move", roll: 7, row: 20, lane: 2 },
            b: { row: 70, lane: 1 },
        });
        const game = makeGame(gs);

        await run(game, move({ row: 27, lane: 1 }));
        expect(game.currentTurn).toBe("b");
        // b's own shift is "anything else" — CheckEndTurn already reset b's
        // phase to 'shift' on the hand-off, so this is an ordinary move for b,
        // not a contrivance.
        await run(game, shift({ gear: 3, recordedRoll: 5 }, "b"));

        const undone = await run(game, undo());
        expect(undone.outcome.validMove).toBe(false);
        // Nothing rolled back: a's move and b's shift both stand.
        expect(seat(game, "a").row).toBe(27);
        expect(seat(game, "b").roll).toBe(5);
    });

    it("refuses a player who isn't the one the snapshot belongs to", async () => {
        const gs = race({
            a: { phase: "move", roll: 7, row: 20, lane: 2 },
            b: { row: 70, lane: 1 },
        });
        const game = makeGame(gs);
        await run(game, move({ row: 27, lane: 1 }));

        const undone = await run(game, undo("b"));
        expect(undone.outcome.validMove).toBe(false);
        expect(seat(game, "a").row).toBe(27);
    });

    it("refuses a roll — RaceCarsShift pushes no snapshot, so there is no anchor to match", async () => {
        const gs = race({ a: { phase: "shift", roll: null, row: 20, lane: 2 } });
        const game = makeGame(gs);
        await run(game, shift({ gear: 3, recordedRoll: 5 }));

        const undone = await run(game, undo());
        expect(undone.outcome.validMove).toBe(false);
        expect(seat(game, "a").roll).toBe(5);
    });
});

describe("Race Cars — a leg that rolled for oil, or finished the race, can't be taken back", () => {
    // §14: entering a slick rolls a d6, which is exactly the randomness
    // docs/undo.md §6 refuses to let undo reach back over. The mocked die
    // above never spins, so the position landed on is still deterministic —
    // only whether the leg is undoable is under test here.

    it("never pushes a snapshot for a move that crosses a slick", async () => {
        // A single-space move onto the slick itself — the reach-band router
        // dodges oil into another lane when a same-length detour exists
        // (rules.test.ts, "routes around oil"), so a one-step move onto the
        // only space this roll can reach is what makes the check unavoidable.
        const gs = race(
            { a: { phase: "move", roll: 1, row: 20, lane: 2 } },
            { oilSpills: true, slicks: [{ row: 21, lane: 2, laidOnRound: 1 }] },
        );
        const game = makeGame(gs);

        const command = move({ row: 21, lane: 2 });
        await run(game, command);
        expect(consumedRandomness(command)).toBe(true);
        expect(gs.undoStack).toHaveLength(0);
        expect(gs.undoAnchorId).toBeNull();

        const undone = await run(game, undo());
        expect(undone.outcome.validMove).toBe(false);
        expect(seat(game, "a").row).toBe(21);
    });

    it("never pushes a snapshot for a tow that crosses a slick", async () => {
        // Exactly RaceCarsLogic.test.ts's "takes the tow three rows" fixture,
        // with every lane of every row the fixed three-step tow can possibly
        // cross slicked — the router dodges oil into another lane whenever a
        // same-length detour exists, so nothing narrower guarantees the roll.
        const everyLaneSlicked = [21, 22, 23].flatMap(row =>
            [1, 2, 3].map(lane => ({ row, lane, laidOnRound: 1 })));
        const gs = race({
            a: { row: 20, lane: 1, gear: 4, phase: "slipstream", roll: 4 },
            b: { row: 21, lane: 1, gear: 4 },
        }, { oilSpills: true, slicks: everyLaneSlicked });
        const game = makeGame(gs);

        const tow = slipstream({ tow: { row: 23, lane: 2 } });
        const towed = await run(game, tow);
        expect(towed.outcome.validMove).toBe(true);
        expect(seat(game, "a").row).toBe(23);
        // Proves the slick was actually on the path — a false positive here
        // would mean the test isn't exercising what it claims to.
        expect(consumedRandomness(tow)).toBe(true);
        expect(gs.undoStack).toHaveLength(0);
        expect(gs.undoAnchorId).toBeNull();

        const undone = await run(game, undo());
        expect(undone.outcome.validMove).toBe(false);
    });

    it("never pushes a snapshot for a move that crosses the line", async () => {
        const gs = race({ a: { phase: "move", roll: 4, row: 76, lane: 1 } });
        gs.laps = 1;
        const game = makeGame(gs);

        await run(game, move({ row: 2, lane: 1 }));
        expect(seat(game, "a").lapsCompleted).toBe(1);
        expect(gs.undoStack).toHaveLength(0);

        const undone = await run(game, undo());
        expect(undone.outcome.validMove).toBe(false);
    });
});

describe("Race Cars — declining a tow is undoable, and costs nothing to restore", () => {
    it("takes back a decline, putting the driver back in the slipstream phase", async () => {
        const gs = race({
            a: { row: 20, lane: 1, gear: 4, phase: "slipstream", roll: 4 },
            b: { row: 21, lane: 1, gear: 4 },
        });
        const game = makeGame(gs);

        const declined = await run(game, slipstream({ tow: null }));
        expect(declined.outcome.turnOver).toBe(true);
        expect(log(game)).toContain("waved the tow away");
        expect(game.currentTurn).toBe("b");

        const undone = await run(game, undo());
        expect(undone.outcome.validMove).toBe(true);
        expect(seat(game, "a").phase).toBe("slipstream");
        expect(seat(game, "a").row).toBe(20);
        expect(game.currentTurn).toBe("a");
    });
});

describe("Race Cars — declares undoable on exactly these two commands", () => {
    it("RaceCarsMove and RaceCarsSlipstream, and no others", () => {
        expect(classesDeclaringUndoable().sort()).toEqual(["RaceCarsMove", "RaceCarsSlipstream"]);
    });
});

// Every `readonly className = 'X';` in the logic file, checked for an
// `undoable` declaration before the next `myString(` — the same source scan
// SettlementsAndCitiesLogic's undo.test.ts runs, so a class that starts
// declaring `undoable` is caught here even if nobody remembered to add a test
// for it.
function classesDeclaringUndoable(): string[] {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(path.join(here, "RaceCarsLogic.ts"), "utf8");
    const found: string[] = [];
    for (const match of source.matchAll(/readonly className = '(\w+)';([\s\S]*?)myString\(/g)) {
        if (/readonly undoable = true/.test(match[2])) found.push(match[1]);
    }
    return found;
}

describe("Race Cars — an undo replays byte-for-byte", () => {
    it("reconstructs a turn with a move, an undo and a rebuild through turn recap", async () => {
        const gs = race({
            a: { phase: "move", roll: 7, row: 20, lane: 2 },
            b: { row: 70, lane: 1 },
        });
        const game = makeGame(gs);
        game.gameType = new RaceCarsGameType();
        game.initialSpecificGameState = cloneRaceCarsState(gs, game.userIdList);
        const NAMES = { a: "Alice", b: "Bob" };

        await run(game, move({ row: 27, lane: 1 }));
        await run(game, undo());
        await run(game, move({ row: 27, lane: 1 }));

        expect(game.gameState.commandHistory.map(c => (c as { className: string }).className))
            .toEqual(["RaceCarsMove", "RaceCarsUndo", "RaceCarsMove"]);

        const lastId = game.gameState.commandHistory.at(-1)!.id;
        for (const viewerId of ["a", "b", null]) {
            const live = gameStateToModel(game.specificGameState, NAMES, viewerId, lastId);
            const replayed = (await buildTimeline(game, NAMES, [], undefined, viewerId)).snapshots;
            const replayedFinal = replayed[replayed.length - 1].specificGameState;
            expect(replayedFinal).toEqual(live);
            expect(replayed).toHaveLength(game.gameState.commandHistory.length + 1);
        }
    });
});
