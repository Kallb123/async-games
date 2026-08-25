import { sendPushToUsers, gameNotificationLink } from '@/utils/firebase/pushNotification';
import { buildGameLostNotification, buildTurnExpiringNotification, buildYourTurnNotification } from '@/utils/firebase/notificationContent';
import { dbConnect } from '@/utils/mongodb/mongodb';
import { GameDataModel, IGameDataDocument, trySave } from '@/utils/mongodb/GameData';
import { recordGameResult } from '@/utils/mongodb/GameResultData';
import { unclaimedGuestsOf } from '@/utils/users/guest';
import { NextRequest, NextResponse } from 'next/server';
import { hasAbandonedGame, isExpired, isWarningThreshold, formatRemainingTime, SHORTEST_ACTIONABLE_ELAPSED_MS, UNLIMITED_TURN_TIMER } from '@/utils/games/TurnTimer';
import { isAuthorisedCron } from '@/utils/cronAuth';
import { userListToUserIdNameMap, usersById } from '@/utils/users/clerk';
import { readableName } from '@/utils/ui/players';

/**
 * What one game's sweep did, which is also how the run tallies itself.
 * `skipped` covers both "nothing due yet" and "the player moved while we were
 * looking" — a lost optimistic-concurrency save, which is a player taking
 * their turn, not a failure.
 */
type SweepOutcome = 'expired' | 'abandoned' | 'warned' | 'skipped';

/**
 * Ends a game whose current player has stopped turning up.
 *
 * We can't assume the remaining players still make a fair game (turnOrder,
 * scoring and every game's own state all assume the original roster), so the
 * game ends for everyone rather than continuing without them.
 */
async function abandonGame(gameData: IGameDataDocument, missingPlayerId: string): Promise<SweepOutcome> {
    gameData.complete = true;
    gameData.winner = "";
    gameData.endReason = "abandoned";
    gameData.forfeitedBy = missingPlayerId;
    gameData.currentTurn = "";
    // A player may have taken their turn concurrently with this cron run —
    // leave this game rather than clobber their move with a stale expiry.
    if (!(await trySave(gameData))) return 'skipped';

    const userList = await usersById(gameData.userIdList);

    const { unclaimedPlayerIds, guestNames } = unclaimedGuestsOf(userList);
    await recordGameResult(gameData, unclaimedPlayerIds, guestNames);

    await sendPushToUsers(userList, {
        event: 'GameOver',
        gameId: gameData.gameId,
        link: gameNotificationLink(gameData.gameType.url, gameData.gameId)
    }, buildGameLostNotification(gameData, ''), {
        channel: 'gameOver'
    });

    return 'abandoned';
}

/** Rotates a timed-out turn on to the next player and tells them. */
async function passTurnOn(gameData: IGameDataDocument, timedOutPlayerId: string): Promise<SweepOutcome> {
    const currentIndex = gameData.gameState.turnOrder.findIndex(to => to === timedOutPlayerId);
    gameData.currentTurn = gameData.gameState.turnOrder[(currentIndex + 1) % gameData.gameState.turnOrder.length];
    gameData.lastTurnTimestamp = new Date().toISOString();
    gameData.timerWarningNotificationSent = false;
    // A player may have taken their turn concurrently with this cron run —
    // leave this game rather than clobber their move with a stale expiry.
    if (!(await trySave(gameData))) return 'skipped';

    const userList = await usersById(gameData.userIdList);

    // The turn arrived because the previous player ran out of time, not
    // because they moved — say so, it's the more useful headline.
    const turnUser = userList.find(u => u.id === gameData.currentTurn);
    if (turnUser) {
        await sendPushToUsers([turnUser], {
            event: 'YourTurn',
            gameId: gameData.gameId,
            link: gameNotificationLink(gameData.gameType.url, gameData.gameId)
        }, await buildYourTurnNotification(gameData, turnUser.id, userListToUserIdNameMap(userList), {
            timedOutName: readableName(userList.find(u => u.id === timedOutPlayerId), 'The last player')
        }), {
            channel: 'yourTurn'
        });
    }

    return 'expired';
}

/** Warns the current player that their turn is nearly up, once per turn. */
async function warnTurnExpiring(gameData: IGameDataDocument): Promise<SweepOutcome> {
    const { lastTurnTimestamp, turnTimer, currentTurn } = gameData;

    gameData.timerWarningNotificationSent = true;
    if (!(await trySave(gameData))) return 'skipped';

    const userList = await usersById(gameData.userIdList);
    const activeUser = userList.find(u => u.id === currentTurn);
    if (activeUser) {
        await sendPushToUsers([activeUser], {
            event: 'TurnExpiringSoon',
            gameId: gameData.gameId,
            link: gameNotificationLink(gameData.gameType.url, gameData.gameId)
        }, buildTurnExpiringNotification(gameData, formatRemainingTime(lastTurnTimestamp, turnTimer)), {
            channel: 'turnExpiringSoon'
        });
    }

    return 'warned';
}

/** The whole decision for one game: has this turn run out, is the player gone,
 *  or is it just close enough to be worth a warning? */
async function sweepGame(gameData: IGameDataDocument): Promise<SweepOutcome> {
    const { lastTurnTimestamp, turnTimer, currentTurn } = gameData;

    if (isExpired(lastTurnTimestamp, turnTimer)) {
        if (!gameData.missedTurnCounts) gameData.missedTurnCounts = new Map();
        const missedCount = (gameData.missedTurnCounts.get(currentTurn) ?? 0) + 1;
        gameData.missedTurnCounts.set(currentTurn, missedCount);

        return hasAbandonedGame(missedCount)
            ? abandonGame(gameData, currentTurn)
            : passTurnOn(gameData, currentTurn);
    }

    if (isWarningThreshold(lastTurnTimestamp, turnTimer) && !gameData.timerWarningNotificationSent) {
        return warnTurnExpiring(gameData);
    }

    return 'skipped';
}

export async function GET(request: NextRequest) {
    console.log(`GET ${request.nextUrl.pathname}`);

    if (!isAuthorisedCron(request)) {
        return NextResponse.json({}, { status: 401, statusText: 'Unauthorized' });
    }

    await dbConnect();

    // Only the games this run could actually act on, rather than every live
    // game in the database. Two exclusions, both exact rather than heuristic:
    //
    //  - an unlimited timer never expires and never warns (isExpired and
    //    isWarningThreshold both answer false on sight), so those games were
    //    being loaded in full every five minutes to be looked at and dropped;
    //  - a turn that started less than SHORTEST_ACTIONABLE_ELAPSED_MS ago is
    //    too young for any timer on the ladder to have anything to say.
    //
    // lastTurnTimestamp is an ISO-8601 string rather than a Date, and this
    // compares it as one: every writer produces it with toISOString(), which
    // is fixed-width and UTC, so lexicographic order is chronological order.
    //
    // Oldest turn first, so a run that doesn't finish — this is a serial sweep
    // on a platform with a request deadline — has spent its time on the games
    // that were furthest overdue rather than wherever the collection scan
    // happened to start. The rest are still there on the next tick.
    const cutoff = new Date(Date.now() - SHORTEST_ACTIONABLE_ELAPSED_MS).toISOString();
    const activeGames: IGameDataDocument[] = await GameDataModel.find({
        complete: false,
        turnTimer: { $ne: UNLIMITED_TURN_TIMER },
        lastTurnTimestamp: { $lte: cutoff },
    }).sort({ lastTurnTimestamp: 1 }).exec();

    if (!activeGames.length) {
        return NextResponse.json({ processed: 0 });
    }

    const tally: Record<SweepOutcome, number> = { expired: 0, abandoned: 0, warned: 0, skipped: 0 };
    let failed = 0;

    // Each game is swept on its own. Without this, one game's Clerk lookup or
    // FCM send throwing ended the whole run — every game after it in the list
    // went unswept until the next tick, and a game that reliably threw starved
    // everything behind it indefinitely. A game that fails is logged and
    // skipped; the next tick retries it.
    for (const gameData of activeGames) {
        try {
            tally[await sweepGame(gameData)]++;
        } catch (error) {
            failed++;
            console.error(`Turn-timer sweep failed for game ${gameData.gameId}`, error);
        }
    }

    return NextResponse.json({
        processed: activeGames.length,
        expired: tally.expired,
        warned: tally.warned,
        abandoned: tally.abandoned,
        failed,
    });
}
