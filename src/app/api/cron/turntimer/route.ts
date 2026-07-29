import { sendPushToUsers, gameNotificationLink } from '@/utils/firebase/pushNotification';
import { buildTurnExpiringNotification, buildYourTurnNotification } from '@/utils/firebase/notificationContent';
import { dbConnect } from '@/utils/mongodb/mongodb';
import { GameDataModel, IGameDataDocument, trySave } from '@/utils/mongodb/GameData';
import { clerkClient } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { isExpired, isWarningThreshold, formatRemainingTime } from '@/utils/games/TurnTimer';
import { isAuthorisedCron } from '@/utils/cronAuth';
import { userListToUserIdNameMap } from '@/utils/users/clerk';
import { readableName } from '@/utils/ui/players';

export async function GET(request: NextRequest) {
    console.log(`GET ${request.nextUrl.pathname}`);

    if (!isAuthorisedCron(request)) {
        return NextResponse.json({}, { status: 401, statusText: 'Unauthorized' });
    }

    await dbConnect();

    const activeGames: IGameDataDocument[] = await GameDataModel.find({ complete: false }).exec();

    if (!activeGames.length) {
        return NextResponse.json({ processed: 0 });
    }

    let expired = 0;
    let warned = 0;

    for (const gameData of activeGames) {
        const { lastTurnTimestamp, turnTimer, currentTurn } = gameData;

        if (isExpired(lastTurnTimestamp, turnTimer)) {
            // Advance the turn
            const currentIndex = gameData.gameState.turnOrder.findIndex(to => to === currentTurn);
            const nextTurn = gameData.gameState.turnOrder[(currentIndex + 1) % gameData.gameState.turnOrder.length];
            gameData.currentTurn = nextTurn;
            gameData.lastTurnTimestamp = new Date().toISOString();
            gameData.timerWarningNotificationSent = false;
            // A player may have taken their turn concurrently with this cron run —
            // skip this game rather than clobber their move with a stale expiry.
            if (!(await trySave(gameData))) continue;

            const { data: userList } = await (await clerkClient()).users.getUserList({
                userId: gameData.userIdList
            });

            // Silent data notification to all players (refresh game state)
            await sendPushToUsers(userList, {
                event: 'TurnExpired',
                gameId: gameData.gameId
            });

            // Push notification to the newly active player. The turn arrived
            // because the previous player ran out of time, not because they
            // moved — say so, it's the more useful headline.
            const turnUser = userList.find(u => u.id === gameData.currentTurn);
            const timedOutUser = userList.find(u => u.id === currentTurn);
            if (turnUser) {
                await sendPushToUsers([turnUser], {
                    event: 'YourTurn',
                    gameId: gameData.gameId,
                    link: gameNotificationLink(gameData.gameType.url, gameData.gameId)
                }, await buildYourTurnNotification(gameData, turnUser.id, userListToUserIdNameMap(userList), {
                    timedOutName: readableName(timedOutUser, 'The last player')
                }), {
                    channel: 'yourTurn'
                });
            }

            expired++;
        } else if (isWarningThreshold(lastTurnTimestamp, turnTimer) && !gameData.timerWarningNotificationSent) {
            gameData.timerWarningNotificationSent = true;
            if (!(await trySave(gameData))) continue;

            const { data: userList } = await (await clerkClient()).users.getUserList({
                userId: gameData.userIdList
            });

            const activeUser = userList.find(u => u.id === currentTurn);
            if (activeUser) {
                const timeLeft = formatRemainingTime(lastTurnTimestamp, turnTimer);
                await sendPushToUsers([activeUser], {
                    event: 'TurnExpiringSoon',
                    gameId: gameData.gameId,
                    link: gameNotificationLink(gameData.gameType.url, gameData.gameId)
                }, buildTurnExpiringNotification(gameData, timeLeft), {
                    channel: 'turnExpiringSoon'
                });
            }

            warned++;
        }
    }

    return NextResponse.json({ processed: activeGames.length, expired, warned });
}
