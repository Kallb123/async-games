import { User } from '@clerk/nextjs/server';
import { sendPushToUsers, gameNotificationLink } from '@/utils/firebase/pushNotification';
import { buildGameLostNotification, buildGameWonNotification, buildTeamResultNotification } from '@/utils/firebase/notificationContent';
import { readableName } from '@/utils/ui/players';
import { usersById } from '@/utils/users/clerk';
import { unclaimedGuestsOf } from '@/utils/users/guest';
import { IGameDataDocument, trySave } from '@/utils/mongodb/GameData';
import { recordGameResult } from '@/utils/mongodb/GameResultData';
import { GameEndReason } from '@/utils/apiModels/GameDataApi';

/**
 * How a game finished, as the caller that finished it knows it.
 *
 * `winner` is a Clerk user id, and is empty for every ending nobody won
 * outright: a surrender, an abandonment, a shared score, and a co-op table
 * whose `endReason` is 'teamwin' or 'teamloss' — there, the whole roster won or
 * lost together and no single id can say so.
 */
export interface GameEnding {
    winner?: string;
    endReason: GameEndReason;
    /** The player whose silence ended the game, for an 'abandoned' ending. */
    forfeitedBy?: string;
}

/**
 * A finished game, saved — and the part of finishing it that nobody is waiting
 * on. `saved` is false when optimistic concurrency rejected the save, which
 * means somebody moved while this request was deciding the game was over: the
 * caller answers a 409 (or, in the cron, leaves the game for the next tick) and
 * never calls `announce`.
 */
export interface FinishedGame {
    saved: boolean;
    /**
     * Records the match result and tells every player the game is over.
     *
     * Hand it straight to `after(...)`: it touches nothing the response
     * carries, it never throws (each half logs its own failure — see
     * announceGameOver), and `recordGameResult` is idempotent on gameId, so a
     * retried request still writes one record.
     */
    announce: () => Promise<void>;
}

/**
 * The one way a game ends.
 *
 * Three routes finish games — the command pipeline's game-over branch, the
 * turn-timer cron's abandon path, and the manual `POST /api/game/end` — and
 * each carried its own copy of the same sequence: mark the game complete, clear
 * the turn, save it, write the GameResult, resolve the roster through Clerk,
 * fan out the 'GameOver' pushes. Three copies is how the fourth ending was
 * going to be wrong: a co-op table wins and loses as a table, and a copy that
 * splits the roster into one winner and N losers has no way to say that. The
 * co-op case lives inside this function rather than becoming that fourth copy.
 *
 * Everything up to and including the save happens here; everything after it is
 * handed back as `announce` so a route can flush its response first (see
 * FinishedGame).
 */
export async function finishGame(gameData: IGameDataDocument, ending: GameEnding): Promise<FinishedGame> {
    gameData.complete = true;
    gameData.winner = ending.winner ?? "";
    gameData.endReason = ending.endReason;
    if (ending.forfeitedBy) {
        gameData.forfeitedBy = ending.forfeitedBy;
    }
    // Nobody's turn any more. Most games' CheckGameOver clears this itself, but
    // a game ended by hand or by the cron has no CheckGameOver to run — and
    // whoever was mid-turn could otherwise keep playing a game that had already
    // written its result (see requireLiveGame).
    gameData.currentTurn = "";

    // A player may have taken their turn while this request was deciding the
    // game was over — leave their move alone rather than clobbering it.
    if (!(await trySave(gameData))) {
        return { saved: false, announce: async () => {} };
    }

    return { saved: true, announce: () => announceGameOver(gameData) };
}

/**
 * The result record and the "game over" pushes, once the game itself is safely
 * saved. Neither can fail the other, and neither reaches the caller: the game
 * is already finished by the time this runs, so the worst either failure may
 * cost is a stats record or a notification — never the ending itself.
 */
async function announceGameOver(gameData: IGameDataDocument): Promise<void> {
    let userList: User[];
    try {
        userList = await usersById(gameData.userIdList);
    } catch (error) {
        // Without the roster there is no way to tell a guest's exhibition match
        // from a counted one, and nobody to address a push to, so a Clerk
        // outage costs both halves. The game itself is saved either way.
        console.error(`Couldn't resolve the roster to finish game ${gameData.gameId}`, error);
        return;
    }

    // Its own try: a wobble on the read-model write must not swallow the pushes
    // as well, or the table would be left waiting on a turn that is never
    // coming — which is the thing this whole path exists to prevent.
    try {
        const { unclaimedPlayerIds, guestNames } = unclaimedGuestsOf(userList);
        await recordGameResult(gameData, unclaimedPlayerIds, guestNames);
    } catch (error) {
        console.error(`Couldn't record the result of game ${gameData.gameId}`, error);
    }

    // sendPushToUsers reports a failed send rather than throwing (see its own
    // comment), so the fan-out below needs no try of its own.
    const push = {
        event: 'GameOver',
        gameId: gameData.gameId,
        link: gameNotificationLink(gameData.gameType.url, gameData.gameId),
    };

    // A co-op table shares one ending, so everybody gets the same push. Split
    // into a winner and some losers, they'd each be told the opposite of what
    // happened to the others at a table that only has one result.
    if (gameData.endReason === 'teamwin' || gameData.endReason === 'teamloss') {
        await sendPushToUsers(userList, push,
            buildTeamResultNotification(gameData, gameData.endReason === 'teamwin'),
            { channel: 'gameOver' });
        return;
    }

    const winnerUser = userList.find(u => u.id === gameData.winner);
    const losers = userList.filter(u => u.id !== gameData.winner);

    if (winnerUser) {
        await sendPushToUsers([winnerUser], push,
            buildGameWonNotification(gameData, losers.map(u => readableName(u))),
            { channel: 'gameOver' });
    }

    await sendPushToUsers(losers, push,
        buildGameLostNotification(gameData, winnerUser ? readableName(winnerUser) : ''),
        { channel: 'gameOver' });
}
