import { sendPushToUsers, gameNotificationLink } from '@/utils/firebase/pushNotification';
import { buildGameLostNotification, buildTurnExpiringNotification, buildYourTurnNotification } from '@/utils/firebase/notificationContent';
import { dbConnect } from '@/utils/mongodb/mongodb';
import { IGameDataDocument, ISweepCandidate, SWEEP_CANDIDATE_LIMIT, findSweepCandidates, trySave } from '@/utils/mongodb/GameData';
import { recordGameResult } from '@/utils/mongodb/GameResultData';
import { unclaimedGuestsOf } from '@/utils/users/guest';
import { NextRequest, NextResponse } from 'next/server';
import { formatRemainingTime, hasAbandonedGame, isExpired, needsSweeping } from '@/utils/games/TurnTimer';
import { requireLiveGame } from '@/utils/games/liveGame';
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

/**
 * One game's sweep, for a candidate the projected read said was worth a closer
 * look: load the whole game, ask again, and act — has this turn run out, is the
 * player gone, or is it just close enough to be worth a warning?
 *
 * `trySave` is not what makes asking again safe; it is why asking again is
 * necessary. The player whose turn it is may have taken it between the two
 * reads, and the document here is the fresh one — so its version matches, the
 * save goes through, and the turn is rotated away from somebody who had just
 * played. The decision has to be made against the last thing read.
 */
async function sweepGame(gameId: string): Promise<SweepOutcome> {
    // The same guard the mutating routes use, because this route mutates too.
    // It answers a refusal as a NextResponse, and the cron has no caller to send
    // one to, so a game that has gone away or finished is simply left.
    const found = await requireLiveGame(gameId);
    if ('error' in found) return 'skipped';

    const gameData: IGameDataDocument = found.game;
    if (!needsSweeping(gameData)) return 'skipped';

    const { lastTurnTimestamp, turnTimer, currentTurn } = gameData;

    if (isExpired(lastTurnTimestamp, turnTimer)) {
        if (!gameData.missedTurnCounts) gameData.missedTurnCounts = new Map();
        const missedCount = (gameData.missedTurnCounts.get(currentTurn) ?? 0) + 1;
        gameData.missedTurnCounts.set(currentTurn, missedCount);

        return hasAbandonedGame(missedCount)
            ? abandonGame(gameData, currentTurn)
            : passTurnOn(gameData, currentTurn);
    }

    // needsSweeping said yes and the turn hasn't run out, so the only thing
    // left it could have been saying yes to is the warning.
    return warnTurnExpiring(gameData);
}

// A sweep is a serial walk over games, each one a save, a Clerk lookup and a
// push, so it needs more than the platform's default few seconds.
export const maxDuration = 60;

// The run's own deadline, ten seconds short of the platform's. A cron run is a
// request like any other, and this one used to have no idea it was up against
// one: it worked through every live game until it was cut off, part-way through
// a game, with nothing in the response or the log to say how far it got. The
// headroom is what lets it stop between games and report what it left instead.
const SWEEP_BUDGET_MS = (maxDuration - 10) * 1000;

export async function GET(request: NextRequest) {
    console.log(`GET ${request.nextUrl.pathname}`);

    if (!isAuthorisedCron(request)) {
        return NextResponse.json({}, { status: 401, statusText: 'Unauthorized' });
    }

    await dbConnect();

    const deadline = Date.now() + SWEEP_BUDGET_MS;
    const candidates: ISweepCandidate[] = await findSweepCandidates();

    const tally: Record<SweepOutcome, number> = { expired: 0, abandoned: 0, warned: 0, skipped: 0 };
    let failed = 0;
    let unswept = 0;

    // Each game is swept on its own. Without this, one game's Clerk lookup or
    // FCM send throwing ended the whole run — every game after it in the list
    // went unswept until the next tick, and a game that reliably threw starved
    // everything behind it indefinitely. A game that fails is logged and
    // skipped; the next tick retries it.
    for (const [index, candidate] of candidates.entries()) {
        // The query narrowed to games that could need something; this asks
        // whether they do, before spending a read on a whole document.
        if (!needsSweeping(candidate)) {
            tally.skipped++;
            continue;
        }

        if (Date.now() >= deadline) {
            unswept = candidates.length - index;
            console.warn(`Turn-timer sweep ran out of time with ${unswept} game(s) left to look at`);
            break;
        }

        try {
            tally[await sweepGame(candidate.gameId)]++;
        } catch (error) {
            failed++;
            console.error(`Turn-timer sweep failed for game ${candidate.gameId}`, error);
        }
    }

    return NextResponse.json({
        // Every candidate this run reached is counted exactly once, either in
        // the tally or as a failure.
        processed: Object.values(tally).reduce((sum, count) => sum + count, 0) + failed,
        expired: tally.expired,
        warned: tally.warned,
        abandoned: tally.abandoned,
        skipped: tally.skipped,
        failed,
        // What this run didn't get to: games it had read but ran out of time
        // for, and whether the read itself was capped (so there were more
        // candidates than it even asked for). Either being set is the signal
        // that the collection has outgrown a serial sweep on one request.
        unswept,
        capped: candidates.length === SWEEP_CANDIDATE_LIMIT,
    });
}
