import TimedToken from '@/utils/firebase/TimedToken';
import { getAdminMessaging } from '@/utils/firebase/adminFirebase';
import { dbConnect } from '@/utils/mongodb/mongodb';
import { GameDataModel, IGameDataDocument } from '@/utils/mongodb/GameData';
import { clerkClient } from '@clerk/nextjs/server';
import { Message } from 'firebase-admin/messaging';
import { NextRequest, NextResponse } from 'next/server';
import { isExpired, isWarningThreshold, formatRemainingTime } from '@/utils/games/TurnTimer';

export async function GET(request: NextRequest) {
    console.log(`GET ${request.nextUrl.pathname}`);

    const secret = request.headers.get('authorization');
    if (secret !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({}, { status: 401, statusText: 'Unauthorized' });
    }

    await dbConnect();

    const activeGames: IGameDataDocument[] = await GameDataModel.find({ complete: false }).exec();

    if (!activeGames.length) {
        return NextResponse.json({ processed: 0 });
    }

    const messaging = getAdminMessaging();
    const gameIconUrl = `https://async-games.vercel.app/art/dicecities/icon.png`;

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
            await gameData.save();

            const { data: userList } = await (await clerkClient()).users.getUserList({
                userId: gameData.userIdList
            });

            // Silent data notification to all players (refresh game state)
            const allTokens = userList
                .flatMap(u => u.privateMetadata.notificationTokens as TimedToken[])
                .filter(t => t);
            if (allTokens.length) {
                messaging.sendEach(allTokens.map(token => ({
                    token: token.token,
                    data: {
                        event: 'TurnExpired',
                        gameId: gameData.gameId
                    }
                })));
            }

            // Push notification to the newly active player
            const turnUser = userList.find(u => u.id === gameData.currentTurn);
            if (turnUser) {
                const turnTokens = (turnUser.privateMetadata.notificationTokens as TimedToken[]).filter(t => t);
                if (turnTokens.length) {
                    messaging.sendEach(turnTokens.map(token => {
                        const message: Message = {
                            token: token.token,
                            data: {
                                event: 'YourTurn',
                                gameId: gameData.gameId
                            },
                            notification: {
                                title: "Your Turn",
                                body: `It's your turn to play!`,
                                imageUrl: gameIconUrl
                            },
                            apns: { fcmOptions: { imageUrl: gameIconUrl } },
                            android: { notification: { imageUrl: gameIconUrl } },
                            webpush: { headers: { image: gameIconUrl } }
                        };
                        console.log(`[cron/turntimer] Sending YourTurn to ${turnUser.username} via ${token.token}`);
                        return message;
                    }));
                }
            }

            expired++;
        } else if (isWarningThreshold(lastTurnTimestamp, turnTimer) && !gameData.timerWarningNotificationSent) {
            gameData.timerWarningNotificationSent = true;
            await gameData.save();

            const { data: userList } = await (await clerkClient()).users.getUserList({
                userId: gameData.userIdList
            });

            const activeUser = userList.find(u => u.id === currentTurn);
            if (activeUser) {
                const warnTokens = (activeUser.privateMetadata.notificationTokens as TimedToken[]).filter(t => t);
                const timeLeft = formatRemainingTime(lastTurnTimestamp, turnTimer);
                if (warnTokens.length) {
                    messaging.sendEach(warnTokens.map(token => {
                        const message: Message = {
                            token: token.token,
                            data: {
                                event: 'TurnExpiringSoon',
                                gameId: gameData.gameId
                            },
                            notification: {
                                title: "Time Running Out!",
                                body: `You have less than ${timeLeft} left to take your turn!`,
                                imageUrl: gameIconUrl
                            },
                            apns: { fcmOptions: { imageUrl: gameIconUrl } },
                            android: { notification: { imageUrl: gameIconUrl } },
                            webpush: { headers: { image: gameIconUrl } }
                        };
                        console.log(`[cron/turntimer] Sending TurnExpiringSoon to ${activeUser.username} via ${token.token}`);
                        return message;
                    }));
                }
            }

            warned++;
        }
    }

    return NextResponse.json({ processed: activeGames.length, expired, warned });
}
