import { describe, expect, it } from "vitest";
import { buildTimeline } from "@/utils/games/replay";
import type { ITurnSnapshot } from "@/utils/games/replay";
import { SACRollDice, SACEndTurn, SettlementsAndCitiesGameType } from "./SettlementsAndCitiesLogic";
import { makeState, player } from "./testFixtures";
import { BOARD_TOPOLOGY } from "./board";
import type { ISACPlayerState, ISACSpecificGameState } from "./board";
import type { ISACSpecificGameStateResponse } from "./apiModels";
import type { ISettlementsAndCitiesGameData } from "./SettlementsAndCitiesModels";

// A turn that ends because its player can afford nothing is a statement about
// their hand: it says they can't buy a road and hold under four of every
// resource. So it has to be indistinguishable, to everybody else, from a turn
// its player chose to end — and the match-review timeline is the strictest test
// of that, because it hands an opponent a snapshot per command played.
//
// The two games below differ in one thing only: whether u1 holds four ore. With
// it, u1 rolls and taps "End turn"; without it, the roll leaves them nothing to
// do and the game ends the turn for them. Every byte u2 can see of the two
// replays has to match.
const NAMES = { u1: "Alice", u2: "Bob" };

function boardWithOneForest(u1: ISACPlayerState): ISACSpecificGameState {
    const gs = makeState({
        robberHexIndex: 18,
        hexes: [{ terrain: "forest", numberToken: 8 }],
        vertices: Array.from({ length: BOARD_TOPOLOGY.numVertices }, () => ({ building: null, owner: null })),
        edges: Array.from({ length: BOARD_TOPOLOGY.numEdges }, () => ({ hasRoad: false, owner: null })),
        hasRolled: false,
        lastRoll: null,
    });
    gs.vertices[BOARD_TOPOLOGY.hexVertices[0][0]] = { building: "settlement", owner: "u1" };
    gs.playerStates.set("u1", u1);
    gs.playerStates.set("u2", player());
    return gs;
}

// commandHistory holds commands as they were persisted — plain JSON, not live
// instances — which is also what keeps this honest: a follow-up the game
// generates is never recorded, so the auto-ended game's history is the roll and
// nothing else.
function persisted(command: object): unknown {
    return JSON.parse(JSON.stringify(command));
}

function rollOf5And3(): unknown {
    const roll = new SACRollDice();
    roll.senderId = "u1";
    roll.senderUsername = "Alice";
    roll.recordedRoll1 = 5;
    roll.recordedRoll2 = 3;
    return persisted(roll);
}

function endTurn(): unknown {
    const end = new SACEndTurn();
    end.senderId = "u1";
    end.senderUsername = "Alice";
    return persisted(end);
}

function gameOf(gs: ISACSpecificGameState, commandHistory: unknown[]): ISettlementsAndCitiesGameData {
    return {
        gameId: "11111111-1111-1111-1111-111111111111",
        gameType: new SettlementsAndCitiesGameType(),
        userIdList: ["u1", "u2"],
        turnTimer: "1d",
        currentTurn: "u2",
        lastTurnTimestamp: "2026-01-01T00:00:00.000Z",
        gameState: { turnOrder: ["u1", "u2"], history: [], commandHistory },
        complete: false,
        winner: "",
        specificGameState: gs,
        initialSpecificGameState: gs,
    } as unknown as ISettlementsAndCitiesGameData;
}

/** Everything a snapshot shows about who is on and what has happened. */
function visible(snapshots: ITurnSnapshot[]) {
    return snapshots.map(snapshot => {
        const state = snapshot.specificGameState as ISACSpecificGameStateResponse;
        return {
            currentTurn: snapshot.currentTurn,
            summary: snapshot.command?.summary ?? null,
            history: snapshot.history.map(entry => entry.text),
            hasRolled: state.hasRolled,
            lastRoll: state.lastRoll,
            lastRollAutoEnded: state.lastRollAutoEnded,
        };
    });
}

describe("Settlements & Cities — a turn the game ends for you", () => {
    async function timelineFor(u1: ISACPlayerState, commandHistory: unknown[], viewerId: string) {
        const timeline = await buildTimeline(gameOf(boardWithOneForest(u1), commandHistory), NAMES, [], undefined, viewerId);
        return timeline.snapshots;
    }

    // u1 collects one lumber from the 8 and holds nothing else: no build is
    // affordable, no dev card, and one lumber is short of even a 4:1 trade.
    const brokeAfterTheRoll = () => player();
    // The same roll, but u1 can still trade four ore for anything they like.
    const canStillTrade = () => player({ resources: { ore: 4 } });

    it("replays to an opponent exactly like a turn its player chose to end", async () => {
        const automatic = await timelineFor(brokeAfterTheRoll(), [rollOf5And3()], "u2");
        const chosen = await timelineFor(canStillTrade(), [rollOf5And3(), endTurn()], "u2");

        // Two steps either way — the roll, then the hand-off — with the same
        // summaries, the same log and the same dice on screen at each point.
        // An auto-end that rode on the roll command would show as a single step
        // whose currentTurn had already moved on, which is the whole giveaway.
        expect(visible(automatic)).toEqual(visible(chosen));
        expect(visible(automatic).map(step => step.summary)).toEqual([
            null,
            "rolled a 8 — Alice +1🪵",
            "ended their turn",
        ]);
    });

    it("still holds the roll on screen for the player it happened to", async () => {
        const automatic = await timelineFor(brokeAfterTheRoll(), [rollOf5And3()], "u1");
        const final = automatic[automatic.length - 1].specificGameState as ISACSpecificGameStateResponse;

        expect(final.lastRoll).toBe(8);
        expect(final.lastRollAutoEnded).toBe(true);
    });

    it("holds it for a player who taps End turn with nothing left to do, too", async () => {
        // The held-over roll is derived from the hand the turn ended on, not from
        // what ended it — so there is no "this one was automatic" bit anywhere in
        // the state for an opponent to find.
        const chosen = await timelineFor(brokeAfterTheRoll(), [rollOf5And3(), endTurn()], "u1");
        const final = chosen[chosen.length - 1].specificGameState as ISACSpecificGameStateResponse;

        expect(final.lastRoll).toBe(8);
        expect(final.lastRollAutoEnded).toBe(true);
    });
});
