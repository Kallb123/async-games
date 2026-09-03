import { describe, expect, it } from "vitest";
import { resolveStalledTurn } from "@/utils/games/turnTimeout";
import { FiresOutAction, FiresOutGameType } from "./FiresOutLogic";
import { IFiresOutSpecificGameState } from "./FiresOutModels";
import { spaceIndex, VICTIMS_LOST_TO_LOSE } from "./board";
import { AP_PER_TURN } from "./rules";
import { baseState } from "./testFixtures";
import type { IGameDataDocument } from "@/utils/mongodb/GameData";

// docs/games/fires-out-gdd.md §17.2 gaps 2 and 3: a timed-out turn has to run
// the game's own 'endTurn' command, because that command is the only place
// §7's fire phases happen and the only thing that keeps currentTurn in step
// with activeFirefighter. So this exercises resolveStalledTurn exactly as the
// turn-timer cron calls it, against a real FiresOutGameType and a real
// command — mirroring Outbreak's own turnTimeout.test.ts.

// A real gameType (resolveStalledTurn re-serialises it) and a no-op
// markModified are the only two things this needs beyond
// FiresOutLogic.test.ts's own makeGame — enough to stand in for the live
// Mongoose document the cron calls it with.
function makeGame(state: IFiresOutSpecificGameState, turnOrder: string[] = ["u1", "u2"]): IGameDataDocument {
    return {
        gameId: "g",
        gameType: new FiresOutGameType(),
        currentTurn: turnOrder[0],
        userIdList: turnOrder,
        gameState: { turnOrder, history: [], commandHistory: [] },
        specificGameState: state,
        complete: false,
        winner: "",
        markModified: () => {},
    } as unknown as IGameDataDocument;
}

function commandHistory(game: IGameDataDocument): FiresOutAction[] {
    return game.gameState.commandHistory as unknown as FiresOutAction[];
}

describe("resolveStalledTurn (Fires Out)", () => {
    it("ends the stalled turn with the game's own endTurn command, advancing both the figure and the player", async () => {
        const state = baseState(["u1", "u2"]);
        state.firefighters[0].apLeft = 3;
        const game = makeGame(state, ["u1", "u2"]);

        const resolution = await resolveStalledTurn(game, "u1", "Alice");

        expect(resolution).toBe('advanced');
        expect(commandHistory(game).map(c => ({ className: c.className, kind: c.kind })))
            .toEqual([{ className: 'FiresOutAction', kind: 'endTurn' }]);
        // Gap 3: both moved, so the next player can actually play.
        expect(state.activeFirefighter).toBe(1);
        expect(game.currentTurn).toBe("u2");
        expect(state.firefighters[1].apLeft).toBe(AP_PER_TURN);
        expect(state.firefighters[0].bankedAp).toBe(3); // §8: banked, as a deliberate pass would
    });

    it("resolves Advance Fire, and records the rolls it consumed so the recap replays the same fire", async () => {
        const state = baseState(["u1", "u2"]);
        const game = makeGame(state, ["u1", "u2"]);

        const resolution = await resolveStalledTurn(game, "u1", "Alice");

        expect(resolution).toBe('advanced');
        // Gap 2: the timed-out turn burned the building. The plain advance
        // left the board untouched, which is what made going quiet the
        // strongest play.
        const rolls = commandHistory(game)[0].recordedRolls;
        expect(rolls).toHaveLength(2); // an empty poiPool has nothing to replenish
        // 'smoke' exactly: baseState has no fire anywhere, so the target can
        // only step up from 'none' by one. (A `not.toBe('clear')` here proved
        // nothing — 'clear' isn't a ThreatLevel, so it passed against a board
        // Advance Fire never touched.)
        const target = spaceIndex(rolls![0] - 1, rolls![1] - 1);
        expect(state.spaces[target].threat).toBe('smoke');
        expect(game.gameState.history.some(h => h.text.includes('Advance Fire'))).toBe(true);
        expect(game.gameState.history.some(h => h.text.includes('ended their turn'))).toBe(true);
    });

    it("ends the game when the forced Advance Fire loses the last victim the crew could afford", async () => {
        const state = baseState(["u1", "u2"]);
        state.lost = VICTIMS_LOST_TO_LOSE - 1;
        // A victim already sitting in fire is lost when this turn's fire
        // resolves its consequences, whatever the roll targets.
        const burning = spaceIndex(3, 3);
        state.spaces[burning].threat = 'fire';
        state.spaces[burning].poi = { id: 0, revealed: false, victim: true };
        const game = makeGame(state, ["u1", "u2"]);

        const resolution = await resolveStalledTurn(game, "u1", "Alice");

        expect(resolution).toBe('gameOver');
        expect(game.complete).toBe(true);
        expect(game.endReason).toBe('teamloss');
    });

    it("gives a player controlling more than one figure one fire advance per figure, and stops at the next player", async () => {
        // §7's design note: the fire advances once per *figure*, so a stalled
        // player with two pawns owes two advances before the turn is anyone
        // else's.
        const state = baseState(["u1", "u1", "u2"]);
        const game = makeGame(state, ["u1", "u2"]);

        const resolution = await resolveStalledTurn(game, "u1", "Alice");

        expect(resolution).toBe('advanced');
        expect(commandHistory(game)).toHaveLength(2);
        expect(state.activeFirefighter).toBe(2);
        expect(game.currentTurn).toBe("u2");
    });

    it("reports stuck without burning the building down, when every figure on the board is the stalled player's", async () => {
        // No number of endTurns hands the turn to anyone else here, so
        // resolveStalledTurn would otherwise run its whole MAX_TIMEOUT_COMMANDS
        // budget of real Advance Fires — and either throw them away with
        // 'stuck' or save a teamloss caused by twenty forced fires.
        const state = baseState(["u1", "u1"]);
        const game = makeGame(state, ["u1"]);

        const resolution = await resolveStalledTurn(game, "u1", "Alice");

        expect(resolution).toBe('stuck');
        expect(commandHistory(game)).toEqual([]);
        expect(game.gameState.history).toEqual([]);
        expect(state.activeFirefighter).toBe(0);
    });

    it("reports stuck, rather than rewriting whose figure is up, when the timed-out player isn't the active one", async () => {
        // The deadlocked game gap 3 warns about — currentTurn and
        // activeFirefighter out of step — is one no player can move either,
        // and Execute's own ownerId guard refuses the forced command too. The
        // adapter still hands back the command it always would: 'stuck' is the
        // engine's answer, not a whose-turn-is-it rewrite smuggled in here.
        const state = baseState(["u1", "u2"]);
        const game = makeGame(state, ["u1", "u2"]);

        const resolution = await resolveStalledTurn(game, "u2", "Bob");

        expect(resolution).toBe('stuck');
        expect(commandHistory(game)).toEqual([]);
        expect(state.activeFirefighter).toBe(0);
        expect(state.firefighters[0].apLeft).toBe(AP_PER_TURN);
        expect(game.gameState.history).toEqual([]);
    });
});
