// The battle's record (docs/games/realm-arena.md §28), read off one replay of a
// finished battle — the glue between the replay and `battleRecorder`, kept out
// of battleRecord.ts because the replay engine imports RealmArenaModels.ts,
// which imports that file. Server-only.

import { replayTurnByTurn } from "@/utils/games/replay";
import { withTimeout } from "@/utils/withTimeout";
import { battleRecorder, type BattleRecord } from "./battleRecord";
import type { IRealmArenaGameData, IRealmArenaSpecificGameState } from "./RealmArenaModels";

/**
 * How long the replay may take. A long four-player battle is a thousand
 * commands or more, and the turn-timer cron awaits the result inline with
 * ten seconds of headroom for everything a game's end does.
 */
const RECORD_BUDGET_MS = 4_000;

/**
 * The record of a finished battle, or undefined when the replay fails or runs
 * past its budget — which leaves the result with the XP alone, and the
 * regenerate route able to work it out later — and for a battle still being
 * fought, whose replay would read through the fog and the sealed muster (§27).
 */
export async function recordBattle(gameData: IRealmArenaGameData): Promise<BattleRecord | undefined> {
    if (!gameData.complete) return undefined;
    return withTimeout(async () => {
        const recorder = battleRecorder(gameData.specificGameState.seats);
        const replayed = await replayTurnByTurn(gameData, (step, _turnIndex, _isFirstStepOfTurn, specificGameState) =>
            recorder.observe(step, specificGameState as IRealmArenaSpecificGameState), "battle record");
        return replayed ? recorder.result() : undefined;
    }, RECORD_BUDGET_MS, undefined, `Recording Realm Arena battle ${gameData.gameId}`);
}
