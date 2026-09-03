import { describe, expect, it } from "vitest";
import { resolveStalledTurn } from "@/utils/games/turnTimeout";
import { FiresOutAction, FiresOutGameType } from "./FiresOutLogic";
import { IFiresOutSpecificGameState } from "./FiresOutModels";
import { AMBULANCE_START, ENGINE_START, spaceIndex, VICTIMS_LOST_TO_LOSE } from "./board";
import { AP_PER_TURN, buildEmptyEdges, buildEmptySpaces, newFirefighter } from "./rules";
import type { IGameDataDocument } from "@/utils/mongodb/GameData";

// docs/games/fires-out-gdd.md §17.2 gaps 2 and 3: a timed-out turn has to run
// the game's own 'endTurn' command, because that command is the only place
// §7's Advance Fire and Replenish POI phases happen *and* the only thing that
// keeps currentTurn in step with activeFirefighter. So this exercises
// resolveStalledTurn exactly as the turn-timer cron calls it, against a real
// FiresOutGameType and a real command — mirroring Outbreak's own
// turnTimeout.test.ts.

// baseState from FiresOutLogic.test.ts: an empty board with no fire, POIs or
// damage, so the only fire consequences in a test are the ones it sets up.
// `firefighters` is taken separately from `turnOrder` here because §17.2 gap 3
// is exactly the case where the two differ.
function baseState(owners: string[]): IFiresOutSpecificGameState {
    return {
        ruleset: 'family',
        difficulty: 'recruit',
        spaces: buildEmptySpaces(),
        edges: buildEmptyEdges(),
        poiPool: [],
        nextPoiId: 0,
        rescued: 0,
        lost: 0,
        firefighters: owners.map(userId => newFirefighter(userId, spaceIndex(3, 2))),
        activeFirefighter: 0,
        hotspotReserve: 0,
        engine: ENGINE_START,
        ambulance: AMBULANCE_START,
    };
}

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
        // §17.2 gap 3: the plain advance the cron falls back to would have
        // moved currentTurn without moving activeFirefighter, leaving a game
        // nobody could take a turn in. CheckEndTurn moved both.
        expect(state.activeFirefighter).toBe(1);
        expect(game.currentTurn).toBe("u2");
        expect(state.firefighters[1].apLeft).toBe(AP_PER_TURN);
        // §8: a forced end of turn banks what went unspent, exactly as the
        // deliberate pass a player could have sent by hand does.
        expect(state.firefighters[0].bankedAp).toBe(3);
    });

    it("resolves Advance Fire, and records the rolls it consumed so the recap replays the same fire", async () => {
        const state = baseState(["u1", "u2"]);
        const game = makeGame(state, ["u1", "u2"]);

        const resolution = await resolveStalledTurn(game, "u1", "Alice");

        expect(resolution).toBe('advanced');
        // §7 Phase 2: the timed-out turn burned the building, which is the
        // whole point — the plain advance would have left the board untouched
        // and made going quiet the strongest play (§17.2 gap 2).
        const rolls = commandHistory(game)[0].recordedRolls;
        expect(rolls).toHaveLength(2); // an empty poiPool has nothing to replenish
        const target = spaceIndex(rolls![0] - 1, rolls![1] - 1);
        expect(state.spaces[target].threat).not.toBe('clear');
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
        // §1's solitaire play, and §7's design note: the fire advances once per
        // *figure*, so a stalled player with two pawns owes two advances before
        // the turn is anyone else's. resolveStalledTurn keeps asking until
        // turnOver, which is what makes that fall out.
        const state = baseState(["u1", "u1", "u2"]);
        const game = makeGame(state, ["u1", "u2"]);

        const resolution = await resolveStalledTurn(game, "u1", "Alice");

        expect(resolution).toBe('advanced');
        expect(commandHistory(game)).toHaveLength(2);
        expect(state.activeFirefighter).toBe(2);
        expect(game.currentTurn).toBe("u2");
    });

    it("reports stuck, rather than rewriting whose figure is up, when the timed-out player isn't the active one", async () => {
        // The deadlocked game §17.2 gap 3 warns about: currentTurn and
        // activeFirefighter out of step, which no player can move either. It's
        // left for the missed-turn count to abandon.
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
