import type { IGameData } from '@/utils/mongodb/GameData';
import type { IGameEvent } from '@/utils/games/recap';
import { buildEventFeed } from '@/utils/games/recap';
import { metaForGame } from '@/utils/ui/games';
import { formatElapsedTime } from '@/utils/games/TurnTimer';
import { nameList } from '@/utils/ui/players';
import { gameNotificationImage, PushNotification } from './pushNotification';
import { truncate, pluralize } from '@/utils/ui/text';
import { resolveHistory } from "@/utils/games/history";
import { gameLength } from "@/utils/games/turnCount";

// Every piece of user-visible push copy in the app is written here rather than
// inline in the route that sends it. Three routes can hand a player their turn
// (a move, an explicit end-of-turn, the turn-timer cron) and six can invite
// them to a game, so copy written at the call site drifts — and the whole point
// of these notifications is to say something worth tapping.
//
// The rule for a body: one short sentence saying what actually happened, not
// "it's your turn" (the title already says that). The material comes from the
// recap engine — the same replayed, per-game event feed the "since you were
// last here" screen shows — so games describe their own moves and there is no
// per-game branching here.

// Push bodies are truncated by the OS well before this, but a runaway game
// event shouldn't produce a wall of text on the platforms that do wrap.
const MAX_BODY_LENGTH = 140;

function sentence(text: string): string {
    return `${text.trim().replace(/[.!?]+$/, '')}.`;
}

// Every push about a game gets that game's own artwork and a trimmed body, so
// the builders below only have to decide what to say.
function gamePush(gameData: IGameData, title: string, body: string): PushNotification {
    return {
        title,
        body: truncate(body, MAX_BODY_LENGTH),
        imageUrl: gameNotificationImage(gameData.gameType.url)
    };
}

// One sentence covering the recap events a player missed. Leads with the most
// recent thing that happened (the concrete hook) and only counts the rest, so
// the sentence stays readable however long they were away.
function describeEvents(events: IGameEvent[]): string {
    const latest = events[events.length - 1];
    const glyph = latest.glyph ? `${latest.glyph} ` : '';
    const others = events.length - 1;

    if (others > 0) {
        return sentence(`${glyph}${latest.title}, plus ${others} more move${others === 1 ? '' : 's'} while you were away`);
    }
    return sentence(`${glyph}${latest.title}${latest.detail ? ` — ${latest.detail}` : ''}`);
}

// What the player missed, best source first: the game's own recap events, then
// the newest line of its plain-text history (every game writes one, including
// those with no recap adapter), then nothing.
async function describeWhatHappened(
    gameData: IGameData,
    forUserId: string,
    userIdNameMap: { [key: string]: string }
): Promise<string | null> {
    try {
        const feed = await buildEventFeed(gameData, userIdNameMap, forUserId);
        if (feed.hasRecap && feed.events.length) {
            return describeEvents(feed.events);
        }
    } catch (error) {
        // These builders run after the turn has already been saved, so a game
        // the recap engine can't replay must cost the player a nicer sentence,
        // never their move.
        console.error(`Failed to build recap copy for game ${gameData.gameId}`, error);
    }

    // Straight off the stored log, so the {{userId}} tokens in it still have to
    // be resolved — this copy is read by a player, not by the engine.
    const latestHistory = resolveHistory(gameData.gameState.history.slice(0, 1), userIdNameMap)[0];
    return latestHistory ? sentence(latestHistory.text) : null;
}

export interface YourTurnOptions {
    /** Set when the game has only just been created and this player moves first. */
    gameJustStarted?: boolean;
    /** Set when the previous player's turn timer expired and the turn skipped to
     *  this player, which is a more useful thing to say than what last happened. */
    timedOutName?: string;
}

/**
 * The "you're up" push. Sent from the command route, the take-turn route, the
 * turn-timer cron and game start — hence the options for the two cases where
 * the turn arrived by something other than an opponent moving.
 *
 * Building the body replays the game through the recap engine, so callers
 * should already have loaded the game and its player names.
 */
export async function buildYourTurnNotification(
    gameData: IGameData,
    forUserId: string,
    userIdNameMap: { [key: string]: string },
    options: YourTurnOptions = {}
): Promise<PushNotification> {
    const friendlyName = gameData.gameType.friendlyName;

    let body: string;
    if (options.gameJustStarted) {
        body = `Everyone's in and you're first to play — get things started!`;
    } else if (options.timedOutName) {
        body = `${options.timedOutName} ran out of time, so the turn passes to you.`;
    } else {
        body = await describeWhatHappened(gameData, forUserId, userIdNameMap)
            ?? `The board is waiting on your move.`;
    }

    return gamePush(gameData, `Your move in ${friendlyName}`, body);
}

/** The turn-timer warning: says how long is left and what happens if they don't move. */
export function buildTurnExpiringNotification(gameData: IGameData, timeLeft: string): PushNotification {
    return gamePush(
        gameData,
        `⏳ ${timeLeft} left in ${gameData.gameType.friendlyName}`,
        `Take your turn now or it passes to the next player.`
    );
}

/** One player prodding another who's sitting on their turn. */
export function buildNudgeNotification(nudgerName: string, gameData: IGameData): PushNotification {
    return gamePush(
        gameData,
        `👉 ${nudgerName} is waiting on you`,
        `It's been ${formatElapsedTime(gameData.lastTurnTimestamp)} since your turn came round in ${gameData.gameType.friendlyName}.`
    );
}

/**
 * The invite push. Leans on the game's tagline from its metadata — it's the one
 * line already written to make someone want to play that game, so an invite to
 * a game they've never tried says what it is rather than just naming it.
 */
export function buildGameInviteNotification(senderName: string, friendlyName: string): PushNotification {
    const meta = metaForGame({ friendlyName });
    return {
        title: `${senderName} challenged you to ${meta?.name ?? friendlyName}`,
        body: truncate(meta ? `${sentence(meta.tagline)} Tap to accept and get playing.` : `Tap to accept and get playing.`, MAX_BODY_LENGTH),
        imageUrl: meta ? gameNotificationImage(meta.url) : undefined
    };
}

// How long the match ran — a fair (and free) measure to close on, better than
// "you won the game" for both sides. Turns for a game with opponents (counted
// from commandHistory, not read off its length, so a game whose turns take
// several commands each isn't reported as many times longer than it ran); moves
// for a solo game that has no turns. Returns the count and the word to match.
function matchLength(gameData: IGameData) {
    return gameLength(gameData.gameState.commandHistory, gameData.userIdList.length);
}

/** Sent to the winner. `opponentNames` excludes the winner themselves. */
export function buildGameWonNotification(gameData: IGameData, opponentNames: string[]): PushNotification {
    const { count, unit } = matchLength(gameData);

    return gamePush(
        gameData,
        `🏆 You won ${gameData.gameType.friendlyName}!`,
        opponentNames.length
            ? `You beat ${nameList(opponentNames)} in ${pluralize(count, unit)}. Line up a rematch?`
            : `You finished it in ${pluralize(count, unit)}. Fancy another?`
    );
}

/** Sent to everyone who didn't win. `winnerName` is empty for a game with no winner. */
export function buildGameLostNotification(gameData: IGameData, winnerName: string): PushNotification {
    const friendlyName = gameData.gameType.friendlyName;
    const { count, unit } = matchLength(gameData);

    if (!winnerName) {
        return gamePush(gameData, `${friendlyName} is over`, `The game ended after ${pluralize(count, unit)} with no winner.`);
    }

    return gamePush(
        gameData,
        `${winnerName} won ${friendlyName}`,
        `They sealed it after ${pluralize(count, unit)} — challenge them to a rematch.`
    );
}

/**
 * Sent to every player at a co-op table, which wins and loses as one (see
 * GameEndReason 'teamwin'/'teamloss'). There is no opponent to name and nobody
 * to congratulate individually, so the turns the table took together are the
 * measure — the same one the win and loss copy above uses.
 *
 * A defeat also leads with *which* defeat, when the game recorded one (see
 * IGameData.endDetail): a co-op game usually has several ways to go under,
 * and "your team lost" alone tells a player nothing they couldn't already
 * guess. A game that records none keeps the copy it had.
 */
export function buildTeamResultNotification(gameData: IGameData, won: boolean): PushNotification {
    const friendlyName = gameData.gameType.friendlyName;
    const { count, unit } = matchLength(gameData);

    if (won) {
        return gamePush(gameData, `🏆 Your team won ${friendlyName}!`, `You pulled it off together in ${pluralize(count, unit)}. Another run?`);
    }

    const detail = gameData.endDetail
        ? `It got away from you after ${pluralize(count, unit)} — ${gameData.endDetail}. Try again?`
        : `It got away from you after ${pluralize(count, unit)}. Try again?`;
    return gamePush(gameData, `Your team lost ${friendlyName}`, detail);
}

/**
 * Someone sent a message in a game you're in. Unlike a turn notification, the
 * message itself is the body — there is nothing better to say than what was
 * said — so it goes through the same `truncate` every game push uses, carrying
 * the game's own artwork. The name is the sender's, resolved by the route from
 * `currentUser()`, never stored on the message (docs/in-game-chat.md §3, §7).
 */
export function buildChatNotification(senderName: string, gameData: IGameData, text: string): PushNotification {
    return gamePush(gameData, `${senderName} in ${gameData.gameType.friendlyName}`, text);
}

/** Someone reacted to one of your moves in the recap feed. */
export function buildReactionNotification(actorName: string, reaction: string, eventTitle: string): PushNotification {
    return {
        title: `${actorName} reacted ${reaction}`,
        body: truncate(`To your move: ${eventTitle}`, MAX_BODY_LENGTH)
    };
}

export function buildFriendInviteNotification(senderName: string): PushNotification {
    return {
        title: `${senderName} wants to be friends`,
        body: `Accept and you can start a game together.`
    };
}

export function buildFriendAcceptedNotification(accepterName: string): PushNotification {
    return {
        title: `${accepterName} accepted your friend request`,
        body: `You're now friends — challenge them to a game!`
    };
}

/**
 * The "does push actually work on this phone?" push, from Settings' Test button
 * and the dev bench's per-user one. Says which of the two it is, so a player
 * who finds one in their tray an hour later knows nothing is wrong.
 */
export function buildTestNotification(): PushNotification {
    return {
        title: "Notifications are working",
        body: "You asked for a test from Settings — a turn, an invite or a result will arrive just like this."
    };
}
