// The viewer's own unlocks in one game, for the board's response
// (docs/achievements.md §6). The one addition achievements make to the
// most-polled route in the app, so it keeps to three rules:
//
// - It reads only when an unlock can exist: for a finished game, or a live one
//   whose game has `turnEnd` achievements. Mid-game only a `turnEnd` unlock can
//   exist, and a finished board no longer polls. Every other game makes no read.
// - It is one indexed read, by the unique index's `userId` prefix.
// - It fails soft. A failed read is logged and answers none: on the command
//   route this answer comes after `trySave` has committed the move, so an error
//   here would report a saved move as a failure.
//
// Server-only, like the judge it borrows its "anything to judge?" from.

import { ACHIEVEMENT_CATALOGUE } from "./achievements";
import type { AchievementCatalogue } from "./achievements";
import { hasTurnEndAchievements } from "./awardAchievements";
import { unlocksInGame } from "@/utils/mongodb/AchievementUnlockData";
import type { IGameData } from "@/utils/mongodb/GameData";
import type { IUnlockedHere } from "@/utils/apiModels/GameDataApi";

export async function unlockedHere(
    gameData: IGameData,
    viewerId: string,
    catalogue: AchievementCatalogue = ACHIEVEMENT_CATALOGUE,
): Promise<IUnlockedHere[]> {
    if (!gameData.complete && !hasTurnEndAchievements(gameData, catalogue)) return [];
    try {
        const unlocks = await unlocksInGame([viewerId], gameData.gameId);
        return unlocks.map(({ id, unlockedAt }) => ({ id, unlockedAt }));
    } catch (error) {
        console.error(`Couldn't read ${viewerId}'s achievements in game ${gameData.gameId}; the board goes without them`, error);
        return [];
    }
}
