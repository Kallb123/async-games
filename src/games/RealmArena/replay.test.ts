import { describe, expect, it, vi } from "vitest";
import { buildTimeline } from "@/utils/games/replay";
import { buildAllEvents, buildEventFeed } from "@/utils/games/recap";
import { resolveStalledTurn } from "@/utils/games/turnTimeout";
import { CHARACTERS } from "./characters";
import { gameStateToModel } from "./RealmArenaModels";
import type { IRealmArenaSpecificGameStateResponse, IRealmArenaStepOutcome } from "./apiModels";
import { endTurnBy, makeGame, muster, musterAll, play, playScriptedTurn, readyMadePicks, type RealmArenaTestGame } from "./testFixtures";

// docs/games/realm-arena.md §17.3 PR 8: the review and the recap are read off
// the same recorded command log, so this replays whole real battles with the
// random-number source ripped out, the way TrainTime/replay.test.ts and
// RaceCars/replay.test.ts prove the same for their games — and holds the
// replay to the sealed muster (§17.2) the live response keeps.

const NAMES: Record<string, string> = { a: "Alice", b: "Bob" };

/** Runs `replay` with both sources of randomness taken away, until it has settled. */
async function noRandomness<T>(replay: () => Promise<T>): Promise<T> {
    const consumed = () => { throw new Error("replay consumed randomness"); };
    const entropy = vi.spyOn(globalThis.crypto, "getRandomValues").mockImplementation(consumed);
    const random = vi.spyOn(Math, "random").mockImplementation(consumed);
    try {
        return await replay();
    } finally {
        entropy.mockRestore();
        random.mockRestore();
    }
}

/** A battle fought from the muster to its winner by the scripted squads. */
async function playScriptedBattle(): Promise<RealmArenaTestGame> {
    const game = makeGame();
    await musterAll(game);
    for (let turn = 0; !game.complete; turn++) {
        if (turn > 100) throw new Error("the battle outlasted its turn limit");
        await playScriptedTurn(game);
    }
    return game;
}

/** Every character's name, as the board and the log write them. */
const CHARACTER_NAMES = Object.values(CHARACTERS).map(character => character.name);

describe("Realm Arena replay", () => {
    it("replays a whole battle to exactly the live state without consuming randomness", async () => {
        const game = await playScriptedBattle();
        const history = game.gameState.commandHistory;
        expect(history.some(command => (command as { recordedRolls?: number[] }).recordedRolls?.length)).toBe(true);

        for (const viewer of [null, "a", "b"]) {
            const timeline = await noRandomness(() => buildTimeline(game, NAMES, [], undefined, viewer));
            // One snapshot before anyone has mustered, then one per command.
            expect(timeline.snapshots).toHaveLength(history.length + 1);
            const last = timeline.snapshots[timeline.currentIndex];
            expect(last.specificGameState).toEqual(gameStateToModel(game.specificGameState, viewer, game.gameState.commandHistory.at(-1)?.id ?? null));
            expect(last.complete).toBe(true);
            expect(last.winner).toBe(game.winner);
        }
    });

    it("would draw a roll the log is missing, which is how the test above knows none are", async () => {
        const game = await playScriptedBattle();
        const shooter = game.gameState.commandHistory.find(command => (command as { recordedRolls?: number[] }).recordedRolls?.length);
        delete (shooter as { recordedRolls?: number[] }).recordedRolls;
        await expect(noRandomness(() => buildTimeline(game, NAMES))).rejects.toThrow("replay consumed randomness");
    });

    it("carries each action's events on its step, without a shot's roll, and nothing on a muster (§26.2)", async () => {
        const game = await playScriptedBattle();
        const timeline = await buildTimeline(game, NAMES, [], undefined, "b");
        const steps = timeline.snapshots.slice(1);
        const outcomes = steps.map(snapshot => snapshot.outcome as IRealmArenaStepOutcome | undefined);
        // The two musters: one sealed, and one that put both squads on the field.
        expect(outcomes.slice(0, 2)).toEqual([undefined, undefined]);
        const events = outcomes.flatMap(outcome => outcome?.events ?? []);
        expect(events.some(event => event.kind === "shot")).toBe(true);
        expect(events.every(event => !("roll" in event))).toBe(true);
        // An action that did nothing carries nothing, rather than an empty list.
        expect(outcomes.every(outcome => outcome === undefined || outcome.events.length > 0)).toBe(true);
    });

    it("titles each step of the review in the player's words", async () => {
        const game = makeGame();
        await musterAll(game);
        await playScriptedTurn(game);
        const timeline = await buildTimeline(game, NAMES, [], undefined, "b");
        const summaries = timeline.snapshots.slice(1).map(snapshot => `${snapshot.command?.senderUsername} · ${snapshot.command?.summary}`);
        expect(summaries.slice(0, 2)).toEqual(["Alice · mustered their squad", "Bob · mustered their squad"]);
        expect(summaries.at(-1)).toBe("Alice · ended their turn");
        expect(summaries.join("\n")).not.toMatch(/\bacted\b|\{\{/);
    });

    it("replays a timed-out muster and a timed-out turn", async () => {
        const game = makeGame();
        await resolveStalledTurn(game, "a", NAMES.a);
        await resolveStalledTurn(game, "b", NAMES.b);
        await resolveStalledTurn(game, "a", NAMES.a);
        expect(game.specificGameState.phase).toBe("battle");
        expect(game.gameState.commandHistory).toHaveLength(3);

        const timeline = await noRandomness(() => buildTimeline(game, NAMES));
        expect(timeline.snapshots.at(-1)?.specificGameState).toEqual(gameStateToModel(game.specificGameState, null, null));
    });
});

describe("the sealed muster, replayed (§17.2)", () => {
    // A squad a player chose, so nothing of it could be mistaken for the
    // ready-made one a timed-out muster brings — and carrying an item, which
    // that never does (§21.1).
    async function oneMustered(): Promise<RealmArenaTestGame> {
        const game = makeGame();
        const zone = readyMadePicks(game, 0).map(pick => pick.square);
        const picks = [
            { character: "mage" as const, square: zone[0] },
            { character: "archer" as const, square: zone[1] },
            { character: "cleric" as const, square: zone[2] },
            { character: "scout" as const, square: zone[3], item: "smokePot" as const },
        ];
        expect((await play(game, muster("a", picks))).outcome.validMove).toBe(true);
        return game;
    }

    it("sends an opponent, or nobody in particular, nothing of a squad until both have mustered", async () => {
        const game = await oneMustered();
        for (const viewer of ["b", null]) {
            const timeline = await buildTimeline(game, NAMES, [], undefined, viewer);
            const wire = JSON.stringify(timeline);
            expect(wire).not.toMatch(/"character"|"square"|"item"|smoke/i);
            for (const name of CHARACTER_NAMES) expect(wire).not.toContain(name);
            for (const snapshot of timeline.snapshots) {
                const gs = snapshot.specificGameState as IRealmArenaSpecificGameStateResponse;
                expect(gs.fighters).toEqual([]);
                expect(gs.myMuster).toBeNull();
            }
        }
    });

    it("shows the player who mustered their own squad, and only them", async () => {
        const game = await oneMustered();
        const timeline = await buildTimeline(game, NAMES, [], undefined, "a");
        const gs = timeline.snapshots.at(-1)?.specificGameState as IRealmArenaSpecificGameStateResponse;
        expect(gs.myMuster?.map(pick => pick.character)).toEqual(["mage", "archer", "cleric", "scout"]);
        expect(gs.myMuster?.[3].item).toBe("smokePot");
    });

    it("says only that the squad was mustered in the opponent's recap", async () => {
        const game = await oneMustered();
        const feed = await noRandomness(() => buildEventFeed(game, NAMES, "b"));
        expect(feed.hasRecap).toBe(true);
        expect(feed.events.map(event => event.title)).toEqual(["Alice mustered their squad"]);
        expect(feed.summary?.headline).toBe("Your turn to muster 👋");
        expect(feed.tip).toBeNull();
        const wire = JSON.stringify(feed);
        for (const name of CHARACTER_NAMES) expect(wire).not.toContain(name);
    });
});

describe("Realm Arena recap", () => {
    it("tells the player who moves next what the other did, and opens on their last turn", async () => {
        const game = makeGame();
        await musterAll(game);
        await playScriptedTurn(game);
        await playScriptedTurn(game);
        expect(game.currentTurn).toBe("a");

        const feed = await noRandomness(() => buildEventFeed(game, NAMES, "a"));
        expect(feed.hasRecap).toBe(true);
        // Bob's turn and nothing of Alice's: her End turn closes the window.
        expect(feed.events.every(event => event.actorId === "b")).toBe(true);
        // Ending a turn is no news on its own: only the centre makes it a row.
        expect(feed.events.map(event => event.title)).not.toContain("Bob ended their turn");
        expect(feed.summary?.headline).toBe("Your move 👋");
        expect(feed.tip?.text).toMatch(/standing/);
    });

    it("opens the window on a turn ended with nothing done, and tells nobody it was", async () => {
        const game = makeGame();
        await musterAll(game);
        await playScriptedTurn(game);
        await playScriptedTurn(game);
        // Alice passes, then Bob does too: nothing happened.
        expect((await play(game, endTurnBy("a"))).outcome.validMove).toBe(true);
        expect((await play(game, endTurnBy("b"))).outcome.validMove).toBe(true);
        expect(game.currentTurn).toBe("a");

        const feed = await noRandomness(() => buildEventFeed(game, NAMES, "a"));
        // Not Bob's turn before Alice's pass, and not his bare end of turn.
        expect(feed.events).toEqual([]);
        expect(feed.hasRecap).toBe(false);
    });

    it("ends a whole battle's events on its winner", async () => {
        const game = await playScriptedBattle();
        const events = await noRandomness(() => buildAllEvents(game, NAMES));
        expect(events.at(-1)?.type).toBe("ra_won");
        expect(events.at(-1)?.title).toBe(`${NAMES[game.winner]} wins the battle`);
        // Every row's title is resolved: no history token reaches a reader.
        expect(events.map(event => event.title).join("\n")).not.toContain("{{");
        expect(events.some(event => event.type === "ra_knockout")).toBe(true);
        // Every command keeps a row, so a reaction to any line of the log
        // finds the row it lands on (the reaction route's lookup).
        const rowed = new Set(events.map(event => event.commandId));
        expect(game.gameState.commandHistory.every(command => rowed.has((command as { id: string }).id))).toBe(true);
    });
});
