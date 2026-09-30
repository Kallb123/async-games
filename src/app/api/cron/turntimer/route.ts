import { sendPushToUsers, gameNotificationLink } from '@/utils/firebase/pushNotification';
import { buildTurnExpiringNotification, buildYourTurnNotification } from '@/utils/firebase/notificationContent';
import { dbConnect } from '@/utils/mongodb/mongodb';
import { IGameDataDocument, ISweepCandidate, SWEEP_CANDIDATE_LIMIT, findSweepCandidates, trySave } from '@/utils/mongodb/GameData';
import { finishGame } from '@/utils/games/finishGame';
import { resolveStalledTurn, TurnTimeoutOutcome } from '@/utils/games/turnTimeout';
import { canDropPlayer, nextActivePlayer, PlayerDropped } from '@/utils/games/playerDropout';
import { runCommand } from '@/utils/games/commandPipeline';
import { deserializeJSON } from '@/utils/apiModels/Serialisable';
import { IGameType } from '@/utils/apiModels/gameCommand';
import { User } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { formatRemainingTime, hasAbandonedGame, isExpired, needsSweeping } from '@/utils/games/TurnTimer';
import { requireLiveGame } from '@/utils/games/liveGame';
import { isAuthorisedCron } from '@/utils/cronAuth';
import { userListToUserIdNameMap, usersById } from '@/utils/users/clerk';
import { readableName } from '@/utils/ui/players';
import { gameCommandVersion } from '@/utils/ui/games';

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
type SweepOutcome = 'expired' | 'dropped' | 'abandoned' | 'warned' | 'skipped' | 'declined' | 'stuck';

/**
 * Ends a game whose current player has stopped turning up.
 *
 * The answer for a game that can't carry on without them — one that registers
 * no dropout adapter (utils/games/playerDropout.ts), because its rules assume
 * the whole roster, or one that would be left with too few players. Every
 * other game drops the player instead: see `dropPlayer`.
 */
async function abandonGame(gameData: IGameDataDocument, missingPlayerId: string): Promise<SweepOutcome> {
    // A player may have taken their turn concurrently with this cron run —
    // finishGame leaves their move alone rather than clobbering it with a stale
    // expiry, and says so by refusing to save.
    const finished = await finishGame(gameData, { endReason: "abandoned", forfeitedBy: missingPlayerId });
    if (!finished.saved) return 'skipped';

    // No response to flush here, so the cron waits on the result record, the
    // achievements judgment and the pushes rather than handing them to `after`.
    // It logs its own failures, so a game this run did abandon is never counted
    // as one that failed.
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

    const resolution = await playOutStalledTurn(gameData, timedOutPlayerId, timedOutName);

    if (resolution === 'gameOver') return finishPlayedOut(gameData, 'expired');

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
        // read every tick for as long as it lived. A Fires Out solitaire game
        // (§1, plan step 12) has exactly such a turn: a board where every
        // figure is the stalled player's, which no number of endTurns can hand
        // to anybody else.
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

    await tellNextPlayer(gameData, userList, timedOutName);
    return 'expired';
}

/**
 * Runs a timed-out player's turn to its end: through the game's own
 * turn-timeout adapter where it has one (turnTimeout.ts), or the plain step to
 * the next seat still playing where it doesn't. Mutates `gameData`; saving it
 * is the caller's call, since a 'stuck' turn must not be saved at all.
 */
async function playOutStalledTurn(gameData: IGameDataDocument, timedOutPlayerId: string, timedOutName: string): Promise<TurnTimeoutOutcome> {
    const resolution = await resolveStalledTurn(gameData, timedOutPlayerId, timedOutName);
    if (resolution === 'noAdapter') {
        gameData.currentTurn = nextActivePlayer(gameData, timedOutPlayerId);
    }
    return resolution;
}

/**
 * Saves and announces a game that a forced command ended. How it ended is the
 * game's to say: a co-op game records 'teamwin' or 'teamloss' on the way
 * through CheckGameOver, and the `?? "win"` here only fills in for a game that
 * named no reason of its own (see the same call in the command route). A
 * player may also have taken their turn concurrently with this cron run —
 * finishGame leaves their move alone rather than clobbering it with a stale
 * expiry.
 */
async function finishPlayedOut(gameData: IGameDataDocument, outcome: SweepOutcome): Promise<SweepOutcome> {
    const finished = await finishGame(gameData, {
        winner: gameData.winner,
        endReason: gameData.endReason ?? "win",
    });
    if (!finished.saved) return 'skipped';
    await finished.announce();
    return outcome;
}

/**
 * Tells whoever now holds the turn that it's theirs. The turn arrived because
 * the previous player ran out of time, not because they moved — say so, it's
 * the more useful headline.
 */
async function tellNextPlayer(gameData: IGameDataDocument, userList: User[], timedOutName: string): Promise<void> {
    const turnUser = userList.find(u => u.id === gameData.currentTurn);
    if (!turnUser) return;
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

/**
 * Takes a player who has stopped turning up out of a game that can carry on
 * without them, rather than ending it for everybody.
 *
 * Their stalled turn is played out first, exactly as `passTurnOn` would — so
 * the board gets the draw, the infection or the fire their turn owed it, and
 * the turn lands on the next player with that player's own turn set up by the
 * game's own CheckEndTurn. Only then is the seat dropped, through the
 * `PlayerDropped` command, once somebody else holds the turn. Whatever stops
 * that — a turn the game can't play for them, or a drop the game refuses once
 * it gets there — falls back to abandoning the game, which is what reaching
 * the end of the ladder always did.
 */
async function dropPlayer(gameData: IGameDataDocument, missingPlayerId: string): Promise<SweepOutcome> {
    const userList = await usersById(gameData.userIdList);
    const missingName = readableName(userList.find(u => u.id === missingPlayerId), 'The last player');

    const resolution = await playOutStalledTurn(gameData, missingPlayerId, missingName);
    if (resolution === 'gameOver') return finishPlayedOut(gameData, 'expired');
    if (resolution === 'stuck') {
        console.error(`Turn-timeout adapter for game ${gameData.gameId} ran commands without finishing ${missingPlayerId}'s stalled turn; discarding them`);
        return 'stuck';
    }

    const gameType: IGameType = deserializeJSON(JSON.stringify(gameData.gameType));
    // A turn the game couldn't pass on ('declined') is still the missing
    // player's, and a seat can't leave while it holds the turn: nobody would
    // be left to take it.
    if (gameData.currentTurn === missingPlayerId) return abandonGame(gameData, missingPlayerId);

    const drop = new PlayerDropped();
    drop.gameId = gameData.gameId;
    drop.senderId = missingPlayerId;
    drop.senderUsername = missingName;
    drop.resumesWith = gameData.currentTurn;
    drop.version = gameCommandVersion(gameData.gameType);

    const { outcome, gameOver } = await runCommand(gameData, gameType, drop);
    if (!outcome.validMove) return abandonGame(gameData, missingPlayerId);
    gameData.markModified('gameState.commandHistory');
    // Their ladder is spent; nothing else will ever count against them here.
    gameData.missedTurnCounts.delete(missingPlayerId);

    if (gameOver) return finishPlayedOut(gameData, 'dropped');

    gameData.lastTurnTimestamp = new Date().toISOString();
    gameData.timerWarningNotificationSent = false;
    if (!(await trySave(gameData))) return 'skipped';

    await tellNextPlayer(gameData, userList, missingName);
    return 'dropped';
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

        if (!hasAbandonedGame(missedCount)) return passTurnOn(gameData, currentTurn);
        // Asked before their last turn is played out as well as by
        // PlayerDropped afterwards: a game that can't lose them is abandoned
        // exactly as it always was, without the cron playing a turn first.
        return canDropPlayer(gameData, currentTurn)
            ? dropPlayer(gameData, currentTurn)
            : abandonGame(gameData, currentTurn);
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

    const tally: Record<SweepOutcome, number> = { expired: 0, dropped: 0, abandoned: 0, warned: 0, skipped: 0, declined: 0, stuck: 0 };
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
        // Players who ran out their missed turns in a game that carries on
        // without them (utils/games/playerDropout.ts), rather than ending it.
        dropped: tally.dropped,
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
