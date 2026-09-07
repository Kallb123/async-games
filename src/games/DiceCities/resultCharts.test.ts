import { describe, expect, it } from "vitest";
import { buildTimeline, computePerTurnStat } from "@/utils/games/replay";
import { countTurns } from "@/utils/games/turnCount";
import { DiceCitiesRequestUnlockAmusementPark, DiceCitiesRequestUnlockTrainStation } from "./DiceCitiesLogic";
import { playerByUserId } from "./DiceCitiesModels";
import { DiceCitiesCardIds, DiceCitiesCards } from "./cards";
import { passCommand, replayableGame, rollCommand, saveUpTo, sentBy } from "./testHarness";
import type { IDiceCitiesGameStateResponse } from "./apiModels";
import type { IGameCommand } from "@/utils/apiModels/GameLogic";

// Proves the result-page chart fix against real Dice Cities play, not just the
// generic engine test in utils/games/replay.test.ts: the Amusement Park's
// roll-doubles-go-again bonus is real card cost, real dice, real CheckEndTurn,
// replayed through the same computePerTurnStat the result page's coins/turn
// chart is built from (see GAME_RESULT_STATS.DiceCities in GameResultData.ts).
describe("Dice Cities result charts, replayed from a real command log", () => {
    it("charts one point per real turn even when the Amusement Park grants a bonus roll", async () => {
        const trainStationCost = DiceCitiesCards[DiceCitiesCardIds.TRAIN_STATION].cost;
        const amusementParkCost = DiceCitiesCards[DiceCitiesCardIds.AMUSEMENT_PARK].cost;

        const commandHistory: IGameCommand[] = [
            // Every round rolls a 1, so the Wheat Field both players start with
            // pays every owner a coin each round - comfortably past the cost of
            // both landmarks before either is bought. saveUpTo alternates u1
            // and u2 starting with u1, so an odd target leaves an even number
            // of rounds - ending on u2's round, so it's u1's real turn next.
            ...saveUpTo(trainStationCost + amusementParkCost + 9, "u1", "u2"),
            rollCommand(1, "u1"), sentBy(new DiceCitiesRequestUnlockTrainStation(), "u1"),
            rollCommand(1, "u2"), passCommand("u2"),
            rollCommand(1, "u1"), sentBy(new DiceCitiesRequestUnlockAmusementPark(), "u1"),
            rollCommand(1, "u2"), passCommand("u2"),
            // u1 now owns both landmarks. Rolling doubles grants another go:
            // the pass that follows reports turnOver, but the real turn does
            // not end until the second pass, after a second, non-double roll.
            rollCommand(3, "u1", 3), passCommand("u1"),
            rollCommand(1, "u1"), passCommand("u1"),
        ];
        // Every command above is a legal move against the state it runs
        // against, so it plays out exactly as written - nothing for the
        // replay to silently skip - and countTurns(commandHistory) (the same
        // "N turns" the result page's summary line uses) is the real turn
        // count to compare the chart against.
        const realTurns = countTurns(commandHistory);

        const game = replayableGame(commandHistory);

        // What the old, buggy computePerTurnStat did: one chart point per
        // command reporting `turnOver: true`, regardless of whether the turn
        // actually passed to the next player.
        const identityMap = Object.fromEntries(game.userIdList.map(id => [id, id]));
        let turnOverCount = 0;
        await buildTimeline(game, identityMap, [], (step) => {
            if (step.outcome.turnOver) {
                turnOverCount++;
            }
        });

        const coinsPerTurn = await computePerTurnStat<IDiceCitiesGameStateResponse>(
            game,
            (state, userId) => playerByUserId(state, userId)?.totalCoinsEarned,
        );

        expect(coinsPerTurn).toHaveLength(realTurns);
        // The bonus roll's own pass reports turnOver without the turn
        // actually changing hands, so before the fix this game charted one
        // more point than it had turns.
        expect(turnOverCount).toBe(realTurns + 1);
    });
});
