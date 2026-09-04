import { sendPushToUsers, gameNotificationLink } from '@/utils/firebase/pushNotification';
import { buildTurnExpiringNotification, buildYourTurnNotification } from '@/utils/firebase/notificationContent';
import { dbConnect } from '@/utils/mongodb/mongodb';
import { IGameDataDocument, ISweepCandidate, SWEEP_CANDIDATE_LIMIT, findSweepCandidates, trySave } from '@/utils/mongodb/GameData';
import { finishGame } from '@/utils/games/finishGame';
import { resolveStalledTurn } from '@/utils/games/turnTimeout';
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
 *
 * The last two are the turns a game's own timeout adapter didn't resolve, and
 * they are two different things (turnTimeout.ts's `unresolved`): `declined` is
 * a shape of game the adapter says it can't play for its player, where the
 * missed turn is banked against the abandon ladder and the turn stays where it
 * is; `stuck` is an adapter that ran commands and still didn't finish the
 * turn, where nothing is kept at all.
 */
type SweepOutcome = 'expired' | 'abandoned' | 'warned' | 'skipped' | 'declined' | 'stuck';

/**
 * Ends a game whose current player has stopped turning up.
 *
 * We can't assume the remaining players still make a fair game (turnOrder,
 * scoring and every game's own state all assume the original roster), so the
 * game ends for everyone rather than continuing without them.
 */
async function abandonGame(gameData: IGameDataDocument, missingPlayerId: string): Promise<SweepOutcome> {
    // A player may have taken their turn concurrently with this cron run —
    // finishGame leaves their move alone rather than clobbering it with a stale
    // expiry, and says so by refusing to save.
    const finished = await finishGame(gameData, { endReason: "abandoned", forfeitedBy: missingPlayerId });
    if (!finished.saved) return 'skipped';

    // No response to flush here, so the cron waits on the result record and the
    // pushes rather than handing them to `after`. It logs its own failures, so
    // a game this run did abandon is never counted as one that failed.
    await finished.announce();

    return 'abandoned';
}

/**
 * Ends a timed-out player's turn and tells whoever's up next.
 *
 * A game that registers a turn-timeout adapter (turnTimeout.ts) gets its
 * stalled turn resolved through its own commands first — Execute, push onto
 * commandHistory, CheckGameOver/CheckEndTurn — so a game whose board only
 * deteriorates on a player's own turn (Outbreak's draw and infect phases)
 * doesn't get to skip that deterioration just because the cron did the
 * skipping (docs/games/outbreak-gdd.md §21.2, gap 2). A game that registers
 * nothing keeps the plain advance this always did.
 */
async function passTurnOn(gameData: IGameDataDocument, timedOutPlayerId: string): Promise<SweepOutcome> {
    const userList = await usersById(gameData.userIdList);
    const timedOutName = readableName(userList.find(u => u.id === timedOutPlayerId), 'The last player');

    const resolution = await resolveStalledTurn(gameData, timedOutPlayerId, timedOutName);

    if (resolution === 'gameOver') {
        // How it ended is the game's to say: a co-op game records 'teamwin' or
        // 'teamloss' on the way through CheckGameOver, and the `?? "win"` here
        // only fills in for a game that named no reason of its own (see the
        // same call in the command route). A player may also have taken their
        // turn concurrently with this cron run — finishGame leaves their move
        // alone rather than clobbering it with a stale expiry.
        const finished = await finishGame(gameData, {
            winner: gameData.winner,
            endReason: gameData.endReason ?? "win",
        });
        if (!finished.saved) return 'skipped';
        await finished.announce();
        return 'expired';
    }

    if (resolution === 'noAdapter') {
        const currentIndex = gameData.gameState.turnOrder.findIndex(to => to === timedOutPlayerId);
        gameData.currentTurn = gameData.gameState.turnOrder[(currentIndex + 1) % gameData.gameState.turnOrder.length];
    }

    if (resolution === 'stuck') {
        // Commands ran and the turn still didn't end, which is an adapter bug
        // rather than a shape of game (turnTimeout.ts's `unresolved`). Half a
        // resolved turn is worse than none, so the document goes back
        // unsaved — everything those commands did is dropped with it — and the
        // next tick starts the turn over from where it really is.
        console.error(`Turn-timeout adapter for game ${gameData.gameId} ran commands without finishing ${timedOutPlayerId}'s stalled turn; discarding them`);
        return 'stuck';
    }

    if (resolution === 'declined') {
        // The game says it can't play this turn for its player and ran
        // nothing, so the only thing dirty here is the missed-turn count
        // sweepGame incremented before calling. That count is the whole point:
        // returning without a save threw it away every tick, so a turn the
        // adapter can never resolve was swept forever —
        // MAX_CONSECUTIVE_MISSED_TURNS never got past its first rung, the game
        // was neither played on nor abandoned, and it cost a full document
        // read every tick for as long as it lived. Fires Out will have exactly
        // such a turn once §1's solitaire play lands (plan step 12): a board
        // where every figure is the stalled player's, which no number of
        // endTurns can hand to anybody else.
        console.error(`Turn-timeout adapter for game ${gameData.gameId} declined ${timedOutPlayerId}'s stalled turn; banking the missed turn and restarting their timer`);
    }

    // resolution === 'advanced': a registered timeout command already ran and
    // CheckEndTurn moved currentTurn on, so there's a new current player to
    // tell. 'declined' has nobody new — the turn is still the same player's —
    // but it is saved on the same terms, because the timer has to restart
    // either way: for a turn that advanced it belongs to somebody new, and for
    // one that didn't it gives the player who still owns it another full
    // timer, and another expiry warning, to come back before the next rung of
    // the ladder. A declined turn is not a turn nobody can take; it is one the
    // *cron* can't take for them, so counting it off at cron cadence instead
    // would abandon a 7-day game half an hour after its first missed turn.
    gameData.lastTurnTimestamp = new Date().toISOString();
    gameData.timerWarningNotificationSent = false;
    // A player may have taken their turn concurrently with this cron run —
    // leave this game rather than clobber their move with a stale expiry.
    if (!(await trySave(gameData))) return 'skipped';

    if (resolution === 'declined') return 'declined';

    // The turn arrived because the previous player ran out of time, not
    // because they moved — say so, it's the more useful headline.
    const turnUser = userList.find(u => u.id === gameData.currentTurn);
    if (turnUser) {
        await sendPushToUsers([turnUser], {
            event: 'YourTurn',
            gameId: gameData.gameId,
            link: gameNotificationLink(gameData.gameType.url, gameData.gameId)
        }, await buildYourTurnNotification(gameData, turnUser.id, userListToUserIdNameMap(userList), {
            timedOutName
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

    const tally: Record<SweepOutcome, number> = { expired: 0, abandoned: 0, warned: 0, skipped: 0, declined: 0, stuck: 0 };
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
        // The turns no adapter resolved. `declined` is expected — a game shape
        // its own rules can't play automatically — and each appearance is a
        // rung up that game's abandon ladder. `stuck` should be zero: it is an
        // adapter that ran commands without finishing a turn, and the work was
        // discarded, so anything above zero here wants a look at the log.
        declined: tally.declined,
        stuck: tally.stuck,
        failed,
        // What this run didn't get to: games it had read but ran out of time
        // for, and whether the read itself was capped (so there were more
        // candidates than it even asked for). Either being set is the signal
        // that the collection has outgrown a serial sweep on one request.
        unswept,
        capped: candidates.length === SWEEP_CANDIDATE_LIMIT,
    });
}
