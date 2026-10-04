// The battle's record (docs/games/realm-arena.md §28), read off one replay of a
// finished battle — the glue between the replay and `battleRecorder`, kept out
// of battleRecord.ts because the replay engine imports RealmArenaModels.ts,
// which imports that file. Server-only.

import { replayTurnByTurn } from "@/utils/games/replay";
import { battleRecorder, type BattleRecord } from "./battleRecord";
import type { IRealmArenaGameData, IRealmArenaSpecificGameState } from "./RealmArenaModels";

/**
 * The record of a finished battle, or undefined when the replay fails — and
 * for a battle still being fought, whose replay would read through the fog
 * and the sealed muster (§27).
 */
export async function recordBattle(gameData: IRealmArenaGameData): Promise<BattleRecord | undefined> {
    if (!gameData.complete) return undefined;
    const recorder = battleRecorder(gameData.specificGameState.seats);
    const replayed = await replayTurnByTurn(gameData, (step, _turnIndex, _isFirstStepOfTurn, specificGameState) =>
        recorder.observe(step, specificGameState as IRealmArenaSpecificGameState), "battle record");
    return replayed ? recorder.result() : undefined;
}
