import { sendPushToUsers, gameNotificationLink } from '@/utils/firebase/pushNotification';
import { buildAchievementNotification, buildYourTurnNotification } from '@/utils/firebase/notificationContent';
import { userListToUserIdNameMap, usersById } from '@/utils/users/clerk';
import type { User } from '@clerk/nextjs/server';
import type { IGameData } from '@/utils/mongodb/GameData';
import { judgeTurnEnd, TURN_END_BUDGET_MS, TURN_END_PUSH_GRACE_MS } from '@/utils/games/awardAchievements';
import type { EarnedAchievement } from '@/utils/games/awardAchievements';
import type { Achievement } from '@/utils/games/achievements';
import { withTimeout } from '@/utils/withTimeout';

/**
 * Tells the player whose turn it now is. `userList` is the roster the caller
 * already resolved, so this one is not another Clerk lookup.
 *
 * Its own `try`: a failure here can't cost a move that's already saved, and it
 * can't stop the judging beside it either, so it's logged and swallowed rather
 * than turned into an error. The `!turnUser` early return guards only this
 * push; judging doesn't need the next player to be found.
 */
async function notifyNextPlayer(gameData: IGameData, userList: User[]): Promise<void> {
  try {
    const turnUser = userList.find(u => u.id === gameData.currentTurn);

    if (!turnUser) {
      console.error(`Next user not found for game ${gameData.gameId}`);
      return;
    }

    await sendPushToUsers([turnUser], {
      event: 'YourTurn',
      gameId: gameData.gameId,
      link: gameNotificationLink(gameData.gameType.url, gameData.gameId)
    }, await buildYourTurnNotification(gameData, turnUser.id, userListToUserIdNameMap(userList)), {
      channel: 'yourTurn'
    });
  } catch (error) {
    console.error(`Post-response turn-notification work failed for game ${gameData.gameId}`, error);
  }
}

/**
 * Pushes each player what a turn end unlocked for them that is marked `notify`
 * (docs/achievements.md §7.4): one push per player however many it names, on
 * the `achievements` channel, tagged by game so a second unlock in the same game
 * replaces the first on the lock screen. Tapping it opens the board. Everything
 * else a turn end unlocks is celebrated by the toast alone.
 *
 * Chained onto the judging itself rather than sent after its deadline: a
 * judgment that lands late must still push, or it would write a row whose push
 * nobody sends and the next turn end would see as already held. The caller
 * waits `TURN_END_PUSH_GRACE_MS` past the budget for exactly this.
 * `sendPushToUsers` never throws.
 */
async function pushNotifyUnlocks(gameData: IGameData, userList: User[], unlocks: readonly EarnedAchievement[]): Promise<void> {
  const byUser = new Map<string, Achievement[]>();
  for (const { userId, achievement } of unlocks) {
    if (achievement.notify) byUser.set(userId, [...(byUser.get(userId) ?? []), achievement]);
  }
  await Promise.all([...byUser].map(([userId, achievements]) => {
    const user = userList.find(u => u.id === userId);
    return user && sendPushToUsers([user], {
      event: 'AchievementUnlocked',
      gameId: gameData.gameId,
      link: gameNotificationLink(gameData.gameType.url, gameData.gameId),
    }, buildAchievementNotification(gameData, achievements), { channel: 'achievements' });
  }));
}

export interface AnnounceTurnEndOptions {
  /**
   * Whether to tell the player now on turn that it is theirs. False for a
   * boundary with nobody new to tell — a deadline inside one player's own turn
   * — and for a hand-off to a player who has just moved themselves (a solo
   * battle's warbands, whose turn was the player's own request); judging runs
   * either way.
   */
  push: boolean,
}

/**
 * The work that follows a saved turn end, none of it anything the player who
 * just moved is waiting on: telling the next player it is their turn, and
 * judging achievements for the turn that ended (docs/achievements.md §4.2).
 * Shared by the command route's `after()` and the computer-turn runner, which
 * ends a turn of its own, so there is one copy of it.
 *
 * Notifying the next player — the Clerk lookup and building their "your move"
 * body (which replays the whole game through the recap engine) — is the
 * slowest part of a turn. A failure here can't cost a move that's already
 * saved, so it is logged and swallowed rather than turned into an error.
 */
export async function announceTurnEnd(gameData: IGameData, { push }: AnnounceTurnEndOptions): Promise<void> {
  // Resolved once, for both halves. With no roster there is nobody to push
  // and no way to tell an exhibition table from a counted one, so neither
  // half has anything to do.
  let userList: User[];
  try {
    userList = await usersById(gameData.userIdList);
  } catch (error) {
    console.error(`Couldn't resolve the roster for the post-response work on game ${gameData.gameId}`, error);
    return;
  }

  // Side by side, not queued. The push replays the whole game and sends
  // through FCM with no deadline of its own, so judging queued behind it
  // could run out of the function's time before it ever started, and nothing
  // would say so. Beside it, judging usually finishes first: one read, one
  // view, a few checks. The two never interleave on the shared document,
  // because building the view (`toResponseState`) is synchronous.
  //
  // `notifyNextPlayer` has its own `try`, and `withTimeout` catches and logs
  // a judge that throws (and stops waiting on one that stalls), so neither
  // half can fail the other and this needs no `try` of its own. The earner's
  // `notify` push rides inside the timed work (see pushNotifyUnlocks); the
  // toast needs nothing from here, since every board response carries what
  // its viewer has unlocked.
  //
  // Started once and waited on twice. `withTimeout` stops *waiting* at the
  // budget, but `after()` ends — and the platform may stop the function —
  // once its callback returns, so a judgment that lands late would write its
  // rows and never send the push chained onto them. So after the budget, this
  // stays a while longer for that push alone (TURN_END_PUSH_GRACE_MS), which
  // holds nobody up: the response and the next player's push are already
  // gone.
  const label = `Judging achievements for ${gameData.gameId}`;
  const judging = judgeTurnEnd(gameData, userList)
    .then(unlocks => pushNotifyUnlocks(gameData, userList, unlocks))
    .catch(error => console.error(`${label} failed`, error));
  await Promise.all([
    push ? notifyNextPlayer(gameData, userList) : undefined,
    withTimeout(() => judging, TURN_END_BUDGET_MS, undefined, label),
  ]);
  await withTimeout(() => judging, TURN_END_PUSH_GRACE_MS, undefined, `${label}, and its push,`);
}
