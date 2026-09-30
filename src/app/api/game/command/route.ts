import { sendPushToUsers, gameNotificationLink } from '@/utils/firebase/pushNotification';
import { buildYourTurnNotification } from '@/utils/firebase/notificationContent';
import { buildUserDirectory, userListToUserIdNameMap, usersById } from '@/utils/users/clerk';
import { UNKNOWN_PLAYER_NAME } from '@/utils/ui/players';
import { FIRST_COMMAND_VERSION, gameCommandVersion } from '@/utils/ui/games';
import { auth, User } from '@clerk/nextjs/server';
import { after, NextRequest, NextResponse } from 'next/server';
import { dbConnect } from '@/utils/mongodb/mongodb';
import { ICommandOutcome, IGameCommand, IGameType, playableOutOfTurn, serializeOutcomeMaps, stripRecordedRandomness } from '@/utils/apiModels/GameLogic';
import { IGameData, IGameDataDocument, trySave } from '@/utils/mongodb/GameData';
import { requireLiveGame } from '@/utils/games/liveGame';
import { isCommandForGameType } from '@/utils/games/gameCommands';
import { isDropped } from '@/utils/games/playerDropout';
import { finishGame } from '@/utils/games/finishGame';
import { runCommand } from '@/utils/games/commandPipeline';
import { deserializeJSON } from '@/utils/apiModels/Serialisable';
import { IGameDataResponse, uuidString } from '@/utils/apiModels/GameDataApi';
import { v4 as uuidv4 } from 'uuid';
import { attachHistoryReactions } from '@/utils/games/historyReactions';
import { hasTurnEndAchievements, judgeTurnEnd, NO_UNLOCKS, TURN_END_BUDGET_MS } from '@/utils/games/awardAchievements';
import { withTimeout } from '@/utils/withTimeout';

export interface ICommandResponse {
  outcome: ICommandOutcome,
  gameData: IGameDataResponse
}

/** The game's response, with each history line's reaction (if any) attached. */
async function dataResponseWithReactions(gameData: IGameDataDocument, userId: string): Promise<IGameDataResponse> {
  const response = await gameData.CreateDataResponse(userId);
  response.gameState.history = await attachHistoryReactions(gameData.gameId, response.gameState.history);
  return response;
}

/**
 * The command a request body carried, or null if it carried anything else.
 *
 * `deserializeJSON` throws on a body that isn't JSON, and quietly hands back a
 * plain object for JSON whose `className` isn't a registered command — which
 * then throws on the first method call instead. Both are the same 400, so both
 * are answered here rather than becoming a 500 from inside the handler.
 */
function readCommand(body: string): IGameCommand | null {
  let parsed: unknown;
  try {
    parsed = deserializeJSON(body);
  } catch {
    return null;
  }
  const command = parsed as IGameCommand | null;
  if (!command || typeof command.Execute !== 'function' || typeof command.myString !== 'function') {
    return null;
  }
  return command;
}

/**
 * The name to record on this move for the player taking their turn.
 *
 * History no longer freezes a name — it stores a {{userId}} token and resolves
 * it per request (utils/games/history.ts) — but the name recorded on the
 * command still matters: it titles the move in the recap timeline, and it is
 * the only name left for a guest whose Clerk account has since been swept
 * (buildTimeline falls back to it, see replay.ts).
 *
 * A display name is worth a Clerk lookup; it is not worth the turn. Clerk
 * rate-limiting or timing out here would 500 the request *before* Execute and
 * trySave, so the move would be lost rather than merely misnamed. Both degrade
 * to the last name this game recorded for them instead, and their next turn
 * tries Clerk again.
 */
async function senderName(gameData: IGameData, userId: string): Promise<string> {
  try {
    const name = (await buildUserDirectory([userId])).name(userId);
    if (name && name !== UNKNOWN_PLAYER_NAME) {
      return name;
    }
  } catch (error) {
    console.error(`Failed to resolve a name for ${userId}; falling back to their last recorded one`, error);
  }
  return lastRecordedName(gameData, userId) ?? "Someone";
}

/** The name this game last recorded for a player, from their own last move. */
function lastRecordedName(gameData: IGameData, userId: string): string | undefined {
  const history = gameData.gameState.commandHistory ?? [];
  for (let i = history.length - 1; i >= 0; i--) {
    const command = history[i] as { senderId?: string, senderUsername?: string } | null;
    if (command?.senderId === userId && command.senderUsername) {
      return command.senderUsername;
    }
  }
  return undefined;
}

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

export async function POST(request: NextRequest) {
  console.log(`POST ${request.nextUrl.pathname}`);
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({}, {status: 400, statusText: "Not signed in"});
  }

  // Authentication first, and every read of the body after it. Deserialising
  // ran ahead of `auth()` before, so a body that wasn't JSON — or was JSON but
  // not a registered command, leaving a plain object with no `myString` —
  // threw before anyone had proved who they were: an unauthenticated 500 on a
  // POST of `{}`.
  const commandRequest: IGameCommand | null = readCommand(await request.text());
  if (!commandRequest) {
    return NextResponse.json({}, {status: 400, statusText: "Not a valid command"});
  }
  // The client supplies the move, never the randomness it consumes. Recorded
  // RNG is a replay mechanism, and every Execute prefers a recorded value over
  // rolling fresh, so a request that arrived carrying one would be choosing its
  // own dice. Replay (buildTimeline) still honours them; a live request can't.
  //
  // Stripped here, before the line below reads the command, rather than further
  // down beside the other client-can't-supply-this fix: `myString()` prints a
  // roll's dice and the payout it dealt (SAC's `rollChanges`, Dice Cities'
  // `moneyChanges`), and both games only print a payout once the dice are
  // recorded. Stripping afterwards left that log line reading a forged body —
  // arbitrary numbers, and text of the caller's choosing inside a `{{…}}` token
  // that nothing has resolved yet.
  stripRecordedRandomness(commandRequest);

  console.log(commandRequest.myString());

  await dbConnect();
  const found = await requireLiveGame(commandRequest.gameId);
  if ('error' in found) {
    return found.error;
  }
  const gameData = found.game;

  // Every command is played by the player whose turn it is, save one kind: a
  // command whose *class* declares `playableOutOfTurn`, which any seated
  // player may send on somebody else's turn (docs/out-of-turn-actions.md).
  // The flag is read off the class, never the body — a body can claim
  // anything (§3). This gate is the only membership-adjacent check most
  // commands get, and their Execute relies on it rather than re-checking
  // whose turn it is, which is why a declaring class's own Execute has to
  // police what it allows off turn, and why the route checks membership
  // itself on this path: being `currentTurn` implies being seated, and
  // nothing else here does.
  const onTurn = userId === gameData.currentTurn;
  if (!onTurn) {
    if (!playableOutOfTurn(commandRequest)) {
      return NextResponse.json({}, {status: 400, statusText: "Not your turn in this game"});
    }
    if (!gameData.userIdList.includes(userId)) {
      return NextResponse.json({}, {status: 403, statusText: "Not a player in this game"});
    }
  }

  // A player the turn-timer cron dropped for going quiet has left the game
  // (utils/games/playerDropout.ts). Their seat never gets the turn again, so
  // the gate above already refuses them an ordinary command; this is what
  // stops the out-of-turn path from letting them back in.
  if (isDropped(gameData, userId)) {
    return NextResponse.json({}, {status: 400, statusText: "You have left this game"});
  }

  if (userId !== commandRequest.senderId) {
    return NextResponse.json({}, {status: 400, statusText: "Can't request for someone else"});
  }

  // A command only runs against the game that owns it — see gameCommands.ts.
  // Every Execute casts the game to its own shape on the first line, so a
  // command from another game reaches those rules holding state they were
  // never written for.
  if (!isCommandForGameType(gameData.gameType.className, commandRequest.className)) {
    console.warn(`POST ${request.nextUrl.pathname} 400: ${commandRequest.className} is not a ${gameData.gameType.className} command`);
    return NextResponse.json({}, {status: 400, statusText: "Not a command for this game"});
  }

  // The rules the move was built for (docs/command-versions.md): older is a
  // stale tab, told to reload; newer is a client ahead of this instance's
  // deploy, told to try again. None at all is a bundle from before commands
  // carried one, built for the first version's rules and unable to act on a
  // 426. Kept on the command, so a replay knows which rules it was played by.
  commandRequest.version ??= FIRST_COMMAND_VERSION;
  const version = gameCommandVersion(gameData.gameType);
  if (commandRequest.version !== version) {
    if (typeof commandRequest.version === 'number' && commandRequest.version > version) {
      return NextResponse.json({}, {status: 409, statusText: "This game has just been updated, try again in a moment"});
    }
    return NextResponse.json({}, {status: 426, statusText: "This game has been updated, reload to keep playing"});
  }

  // The board the move was built against. In a game where a teammate may play
  // out of turn, the active player's board can have moved since they rendered
  // it, and a move that is still legal on the new board can mean something
  // they never chose — so a client that says which board it saw is refused
  // when that isn't the board any more, and its resync shows them the new one
  // (docs/out-of-turn-actions.md §5.7). `commandHistory` only ever grows, so
  // its length is the board's version. A request field, not part of the move:
  // deleted before anything records the command. It can only fail the
  // sender's own request, so nothing about it needs trusting beyond that.
  const expectedCommandCount = commandRequest.expectedCommandCount;
  delete commandRequest.expectedCommandCount;
  if (expectedCommandCount !== undefined && expectedCommandCount !== gameData.gameState.commandHistory.length) {
    return NextResponse.json({}, {status: 409, statusText: "The board changed, take another look"});
  }

  // The client supplies the move, never the name on it. `senderUsername` is
  // recorded on the command and read back by every replayed view — the recap
  // timeline's title for this move, and the name a swept guest's moves keep —
  // so a client that named itself could put any text it liked in front of
  // another player, and a guest's client named them by the random account id
  // createGuest() minted rather than the name they typed. Resolved here from
  // the authenticated caller instead, the same way the game's usernameList
  // resolves them.
  commandRequest.senderUsername = await senderName(gameData, userId);
  // And the clock is ours too. `timestamp` is a field initialiser, so a command
  // built in a browser arrives carrying *that device's* clock — which orders the
  // player's own history lines, and disagrees with the server's on any phone
  // that isn't in sync. A command the game generates for itself (see
  // ICommandOutcome.followUpCommand) is necessarily stamped here, so leaving the
  // hand-played ones on their own clocks would make "which clock stamped this"
  // a way of telling the two apart.
  commandRequest.timestamp = new Date().toISOString();
  // And the id. Undo trusts it to be unique: SAC's and Race Cars' undo take a
  // move back only while `undoAnchorId` — the id of the undoable command that
  // pushed the snapshot — is still the id at the tail of `commandHistory`,
  // which is how they know nothing has run since. A client that chose its own
  // ids could give a later command the anchor's id, keep the anchor matching,
  // and undo past it: buy a development card, see what it was, and put it
  // back. The same comparison decides whether a turn-ending move holds the turn
  // open for its undo window (`sacFinishTurn`, `raceCarsFinishTurn`), so a
  // reused id could also hold one open that should have ended — a Race Cars
  // leg that rolled for oil, say. It is also the key a history line's
  // reactions join on.
  commandRequest.id = uuidv4() as uuidString;

  // Checks whether the turn should be progressed and actions it if so. Off
  // turn, the pipeline stamps the command with whose turn it was, and never
  // lets it hand the turn off or run a follow-up (RunCommandOptions.outOfTurn).
  const gameType: IGameType = deserializeJSON(JSON.stringify(gameData.gameType));
  const { outcome: commandOutcome, gameOver } = await runCommand(gameData, gameType, commandRequest, { outOfTurn: !onTurn });
  if (!commandOutcome.validMove) {
    return NextResponse.json({}, {status: 401, statusText: "Not a valid move"});
  }

  // They acted within their turn window, so they haven't missed this one —
  // clear any run of expiries the turntimer cron had counted against them.
  // Not for a card played on somebody else's turn: that isn't taking your
  // own, and a player who only ever interrupts should still climb the
  // abandon ladder.
  if (onTurn && gameData.missedTurnCounts?.get(commandRequest.senderId)) {
    gameData.missedTurnCounts.set(commandRequest.senderId, 0);
  }

  gameData.markModified('gameState.commandHistory');

  if (gameOver) {
    // How it ended is the game's to say: a co-op game records 'teamwin' or
    // 'teamloss' on the way through CheckGameOver, and this branch used to
    // overwrite whatever it had said with "win" — filing a defeat as a victory.
    // A game that says nothing ended the ordinary way, with a winner.
    const finished = await finishGame(gameData, {
      winner: gameData.winner,
      endReason: gameData.endReason ?? "win",
    });
    if (!finished.saved) {
      return NextResponse.json({}, {status: 409, statusText: "Game state changed, please refresh and try again"});
    }

    const response: ICommandResponse = {
      outcome: serializeOutcomeMaps(commandOutcome),
      gameData: await dataResponseWithReactions(gameData, userId)
    }

    // Recording the match result and telling everyone the game is over doesn't
    // change what this player sees, so it runs after the response has flushed
    // rather than making them wait on a Clerk lookup and a fan-out of pushes.
    after(finished.announce);

    return NextResponse.json(response, {status: 200});
  }

  // A hand-off to somebody else, or a deadline boundary inside one player's
  // own turn (`timerRestarts` — Fires Out's solitaire crew, where each
  // figure's turn is its own deadline and `turnOver` never comes). Both
  // restart the clock and both are a turn boundary worth judging achievements
  // at (docs/achievements.md §4.2); only the first has anybody new to tell,
  // which is why the push below stays on `turnOver` alone. Neither for an
  // out-of-turn play: the clock is the active player's, and they're still on
  // it, and what such a play changes is judged at the end of the turn it
  // landed in.
  const turnBoundary = onTurn && (commandOutcome.turnOver || commandOutcome.timerRestarts);
  if (turnBoundary) {
    gameData.lastTurnTimestamp = new Date().toISOString();
    gameData.timerWarningNotificationSent = false;
  }

  if (!(await trySave(gameData))) {
    return NextResponse.json({}, {status: 409, statusText: "Game state changed, please refresh and try again"});
  }

  const response: ICommandResponse = {
    outcome: serializeOutcomeMaps(commandOutcome),
    gameData: await dataResponseWithReactions(gameData, userId)
  }

  // The pipeline already refuses an out-of-turn `turnOver` that didn't end
  // the game; `onTurn` keeps this work from ever resting on that alone.
  //
  // A `timerRestarts`-only boundary has nobody to push, so judging is all the
  // work there would be, and it is entered only if the game has something to
  // judge: otherwise every figure hand-off in a solo Fires Out game would pay a
  // Clerk roster lookup, forever, to learn there was nothing to do.
  if (!turnBoundary || !(commandOutcome.turnOver || hasTurnEndAchievements(gameData))) {
    return NextResponse.json(response, {status: 200});
  }

  // Notifying the next player — the Clerk lookup and building their "your move"
  // body (which replays the whole game through the recap engine) — is the
  // slowest part of a turn and none of it is anything the player who just moved
  // is waiting on. Run it after the response has flushed. A failure here can't
  // cost a move that's already saved, so it's logged and swallowed rather than
  // turned into an error. Judging achievements for the turn that just ended
  // (docs/achievements.md §4.2) shares that slot and that guarantee.
  after(async () => {
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
    // half can fail the other and this needs no `try` of its own. What judging
    // unlocked isn't pushed or shown yet, so the answer is ignored.
    await Promise.all([
      commandOutcome.turnOver ? notifyNextPlayer(gameData, userList) : undefined,
      withTimeout(() => judgeTurnEnd(gameData, userList), TURN_END_BUDGET_MS, NO_UNLOCKS, `Judging achievements for ${gameData.gameId}`),
    ]);
  });

  return NextResponse.json(response, {status: 200});
}
