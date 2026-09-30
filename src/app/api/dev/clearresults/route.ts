import { GameResultModel } from '@/utils/mongodb/GameResultData';
import { AchievementUnlockModel } from '@/utils/mongodb/AchievementUnlockData';
import { devWipeRoute } from '../wipeRoute';

export const GET = devWipeRoute('result data and achievement unlocks', async () => {
    await GameResultModel.deleteMany({}).exec();
    // An unlock links to the game that earned it and keeps that game's slug for
    // when its result is gone, so a dev database that just lost every result
    // would otherwise be left holding unlocks for games it no longer has
    // (docs/achievements.md §5.4).
    await AchievementUnlockModel.deleteMany({}).exec();
});

export const dynamic = 'force-dynamic';
