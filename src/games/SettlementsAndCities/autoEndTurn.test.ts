import { describe, expect, it } from "vitest";
import { buildTimeline } from "@/utils/games/replay";
import type { ITurnSnapshot } from "@/utils/games/replay";
import { runCommand } from "@/utils/games/commandPipeline";
import type { IGameData } from "@/utils/mongodb/GameData";
import { SACEndTurn, SettlementsAndCitiesGameType } from "./SettlementsAndCitiesLogic";
import { cmd, makeGame, makeState, player, rollOf } from "./testFixtures";
import { BOARD_TOPOLOGY } from "./board";
import type { ISACPlayerState, ISACSpecificGameState } from "./board";
import type { ISACSpecificGameStateResponse } from "./apiModels";
import { resolveTokens } from "@/utils/games/history";

// A turn that ends because its player can afford nothing is a statement about
// their hand: it says they can't buy a road and hold under four of every
// resource. So it has to be indistinguishable, to everybody else, from a turn
// its player chose to end — and the match-review timeline is the strictest test
// of that, because it hands an opponent a snapshot per command played, each
// carrying the log as it stood, the command that produced it, and every id and
// timestamp on both.
//
// The two games below differ in one thing only: whether u1 holds four ore. With
// it, u1 rolls and taps "End turn"; without it, the roll leaves them nothing to
// do and the game sends the end turn for them.
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

// u1 collects one lumber from the 8 and holds nothing else: no build is
// affordable, no dev card, and one lumber is short of even a 4:1 trade.
const brokeAfterTheRoll = () => player();
// The same roll, but u1 can still trade four ore for anything they like.
const canStillTrade = () => player({ resources: { ore: 4 } });

/**
 * Plays u1's turn for real — through the same pipeline the command route uses —
 * and returns the game it left behind, commandHistory and all. Deliberately not
 * a hand-written command list: what gets *recorded* is half of what this file is
 * testing, and a fixture that assumes it would hide a difference rather than
 * catch one.
 */
async function playTurn(u1: ISACPlayerState, alsoTapEndTurn: boolean) {
    const game = makeGame(boardWithOneForest(u1));
    const gameType = new SettlementsAndCitiesGameType();
    await runCommand(game as unknown as IGameData, gameType, rollOf(5, 3));
    if (alsoTapEndTurn) {
        await runCommand(game as unknown as IGameData, gameType, cmd(new SACEndTurn()));
    }
    return game;
}

async function replayFor(u1: ISACPlayerState, alsoTapEndTurn: boolean, viewerId: string) {
    const played = await playTurn(u1, alsoTapEndTurn);
    return (await buildTimeline(played, NAMES, [], undefined, viewerId)).snapshots;
}

describe("Settlements & Cities — a turn the game ends for you", () => {
    it("records it as an ordinary end turn, so replay reads it back rather than repeating it", async () => {
        const automatic = await playTurn(brokeAfterTheRoll(), false);
        const chosen = await playTurn(canStillTrade(), true);

        const classNames = (game: typeof automatic) =>
            game.gameState.commandHistory.map(c => (c as { className: string }).className);
        expect(classNames(automatic)).toEqual(["SACRollDice", "SACEndTurn"]);
        expect(classNames(automatic)).toEqual(classNames(chosen));

        // Its own id and timestamp, not the roll's. Sharing either would put the
        // same commandId (and the same createdAt) on both history lines, which is
        // an exact test for a turn that ended itself — and the log is public.
        const lines = automatic.gameState.history;
        expect(lines.map(line => line.text)).toEqual([
            "{{u1}} ended their turn",
            "{{u1}} rolled a 8 — {{u1}} +1🪵",
        ]);
        expect(lines[0].commandId).not.toBe(lines[1].commandId);
    });

    it("replays to an opponent byte for byte like a turn its player chose to end", async () => {
        const automatic = await replayFor(brokeAfterTheRoll(), false, "u2");
        const chosen = await replayFor(canStillTrade(), true, "u2");

        // Two steps either way — the roll, then the hand-off. An ending folded
        // into the roll command would replay as one step whose currentTurn had
        // already moved on, which is the giveaway.
        expect(automatic.map(step => step.command?.summary ?? null)).toEqual([
            null,
            "rolled a 8 — Alice +1🪵",
            "ended their turn",
        ]);
        expect(scrubbed(comparable(automatic))).toEqual(scrubbed(comparable(chosen)));
    });

    it("doesn't replay twice where the Special Build phase would let it", async () => {
        // The one shape that hides a double-apply: with the 5-6 extension on, the
        // end turn opens a Special Build phase in which a *second* end turn is
        // perfectly legal. A replay that regenerated the follow-up as well as
        // reading the recorded one would close Bob's special build for him, put
        // a "finished their special build" line in the log that never happened,
        // and leave the rest of the replay a seat ahead of the real game.
        const state = boardWithOneForest(brokeAfterTheRoll());
        state.expansions = { ...state.expansions, fiveSixPlayerExtension: true };
        const game = makeGame(state);
        await runCommand(game as unknown as IGameData, new SettlementsAndCitiesGameType(), rollOf(5, 3));

        const live = game.gameState.history.map(line => resolveTokens(line.text, NAMES));
        const replayed = (await buildTimeline(game, NAMES, [], undefined, "u2")).snapshots;

        expect(replayed[replayed.length - 1].history.map(line => line.text)).toEqual(live);
        expect(replayed[replayed.length - 1].currentTurn).toBe(game.currentTurn);
        expect(replayed.map(step => step.command?.summary ?? null))
            .toEqual([null, "rolled a 8 — Alice +1🪵", "ended their turn"]);
    });

    it("still holds the roll on screen for the player the turn ended for", async () => {
        const automatic = await replayFor(brokeAfterTheRoll(), false, "u1");
        const final = automatic[automatic.length - 1].specificGameState as ISACSpecificGameStateResponse;

        expect(final.lastRoll).toBe(8);
        expect(final.lastRollAutoEnded).toBe(true);
    });

    it("holds it for a player who taps End turn with nothing left to do, too", async () => {
        // Held over because of the hand the turn ended on, not because of what
        // ended it — so there is no "that one was automatic" bit in the state
        // either, for an opponent to find.
        const chosen = await replayFor(brokeAfterTheRoll(), true, "u1");
        const final = chosen[chosen.length - 1].specificGameState as ISACSpecificGameStateResponse;

        expect(final.lastRoll).toBe(8);
        expect(final.lastRollAutoEnded).toBe(true);
    });
});

/**
 * Everything a snapshot says about how the turn went, which is everything except
 * the hands: those differ between the two games by construction (four ore is the
 * only difference between them), and hand sizes are public anyway.
 *
 * History entries and command metadata go in whole rather than picked over. The
 * tell this is guarding against lives in exactly the fields a summary would drop:
 * two log lines carrying the same commandId, or the same createdAt to the
 * millisecond, say "one command wrote both of these" — and only an ending the
 * game sent does that.
 */
function comparable(snapshots: ITurnSnapshot[]) {
    return snapshots.map(snapshot => {
        const state = snapshot.specificGameState as ISACSpecificGameStateResponse;
        return {
            index: snapshot.index,
            currentTurn: snapshot.currentTurn,
            complete: snapshot.complete,
            winner: snapshot.winner,
            planned: snapshot.planned,
            history: snapshot.history,
            command: snapshot.command,
            roll: {
                hasRolled: state.hasRolled,
                lastRoll: state.lastRoll,
                lastRollDie1: state.lastRollDie1,
                lastRollDie2: state.lastRollDie2,
                lastRollChanges: state.lastRollChanges,
                lastRollAutoEnded: state.lastRollAutoEnded,
            },
        };
    });
}

/**
 * The above as JSON, with every id and timestamp replaced by a marker
 * that says *which* id or timestamp it was. Two ids that were equal stay equal
 * and two that differed stay different, so the comparison keeps the correlations
 * an opponent could actually exploit while dropping the values, which are random
 * per run.
 */
function scrubbed(snapshots: unknown): string {
    const seen = new Map<string, string>();
    const marker = (value: string) => {
        if (!seen.has(value)) seen.set(value, `<${seen.size}>`);
        return seen.get(value)!;
    };
    return JSON.stringify(snapshots).replace(
        /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\d{4}-\d{2}-\d{2}T[\d:.]+Z/g,
        marker,
    );
}
