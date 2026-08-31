import { readJsonBody } from '@/utils/api/requestBody';
import { auth, currentUser } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { dbConnect } from '@/utils/mongodb/mongodb';
import { GameDataModel, IGameDataDocument } from '@/utils/mongodb/GameData';
import { ChatMessageModel, IChatMessageDataDocument } from '@/utils/mongodb/ChatMessageData';
import { normaliseMessage } from '@/utils/chat';
import { consumeRateLimit } from '@/utils/rateLimit';
import { usersById } from '@/utils/users/clerk';
import { sendPushToUsers, gameNotificationLink } from '@/utils/firebase/pushNotification';
import { buildChatNotification } from '@/utils/firebase/notificationContent';
import { readableName } from '@/utils/ui/players';

export interface IChatParams {
    gameid: string;
}

// The newest this many messages, oldest-first — one indexed read served by
// { gameId: 1, timestamp: -1 } (ChatMessageData). Older-than-this paging is a
// phase-2 cursor (docs/in-game-chat.md §5, §10); fifty is a long conversation
// for one game.
export const CHAT_PAGE_SIZE = 50;

// One message on the wire. It carries `senderId`, never a name: every sender is
// a player in this game, so the board already holds the roster that names them
// (usernameList / userIdList), and resolving names here would turn a polled
// endpoint into the app's chattiest Clerk caller for nothing. See §5 — this is
// not the frozen-name trap §3 avoids, because nothing is stored or sent stale.
export interface IChatMessageResponse {
    messageId: string;
    senderId: string;
    text: string;
    timestamp: string;
}

export interface IChatResponse {
    success: boolean;
    messages: IChatMessageResponse[];
}

function toResponse(message: IChatMessageDataDocument): IChatMessageResponse {
    return {
        // messageId is a UUID field; String() gives its canonical form whether
        // the driver hands it back as a UUID object or already as a string.
        messageId: String(message.messageId),
        senderId: message.senderId,
        text: message.text,
        timestamp: message.timestamp,
    };
}

// The one query chat makes: the newest CHAT_PAGE_SIZE messages in this game,
// then reversed to oldest-first for the thread. Membership is the whole of the
// access control — a player in the game may read it, nobody else may.
export async function GET(request: NextRequest, { params }: { params: Promise<IChatParams> }) {
    console.log(`GET ${request.nextUrl.pathname}`);

    const { userId } = await auth();
    if (!userId) {
        // 401 (not 400) so the client can tell "session cookie not ready yet"
        // apart from a genuine failure and retry rather than dropping the
        // thread — fetchWithSessionRetry retries a 401, and only a 401, and
        // this endpoint is polled while the panel is open, so a backgrounded
        // tab whose Clerk cookie is still refreshing recovers on its own.
        console.warn(`GET ${request.nextUrl.pathname} 401: no authenticated user`);
        return NextResponse.json({}, { status: 401, statusText: "Not signed in" });
    }

    await dbConnect();

    const { gameid } = await params;
    const gameData: IGameDataDocument = await GameDataModel.findOne({ gameId: gameid }).exec();
    if (!gameData) {
        return NextResponse.json({}, { status: 404, statusText: "Game not found" });
    }

    if (!gameData.userIdList.includes(userId)) {
        return NextResponse.json({}, { status: 403, statusText: "Not a player in this game" });
    }

    const newest: IChatMessageDataDocument[] = await ChatMessageModel
        // messageId is a deterministic tiebreaker: two messages written in the
        // same millisecond compare equal on timestamp alone, and their order
        // among the tie would otherwise be unspecified — swapping between polls
        // and, at the page boundary, flipping in and out of the window. The
        // { gameId: 1, timestamp: -1 } index still leads the scan; only a
        // same-ms tie is settled in memory, and there are only ever a handful.
        .find({ gameId: gameid })
        .sort({ timestamp: -1, messageId: -1 })
        .limit(CHAT_PAGE_SIZE)
        .exec();

    const messages = newest.reverse().map(toResponse);
    return NextResponse.json({ success: true, messages } satisfies IChatResponse);
}

// Post a message to a game's thread. Access control is the same membership gate
// as the GET; on top of it, a bad body is a 400 (normaliseMessage), and a flood
// is a 429. Deliberately *not* requireLiveGame: "gg" after the last turn is the
// most obvious message in an async game, and a finished game's document is not
// deleted (docs/in-game-chat.md §5). Once stored, the message pushes to the
// other players — throttled per recipient, and never able to undo the write it
// follows (see the send below).
export async function POST(request: NextRequest, { params }: { params: Promise<IChatParams> }) {
    console.log(`POST ${request.nextUrl.pathname}`);

    const { userId } = await auth();
    if (!userId) {
        // Same retryable 401 as the GET, for the same reason: a POST whose
        // session cookie is still refreshing should be retried, not dropped.
        return NextResponse.json({}, { status: 401, statusText: "Not signed in" });
    }

    const { text } = await readJsonBody<{ text: string }>(request);
    const message = normaliseMessage(text);
    if (message === null) {
        return NextResponse.json({}, { status: 400, statusText: "Invalid message" });
    }

    await dbConnect();

    const { gameid } = await params;
    const gameData: IGameDataDocument = await GameDataModel.findOne({ gameId: gameid }).exec();
    if (!gameData) {
        return NextResponse.json({}, { status: 404, statusText: "Game not found" });
    }

    if (!gameData.userIdList.includes(userId)) {
        return NextResponse.json({}, { status: 403, statusText: "Not a player in this game" });
    }

    // Twenty messages per five minutes, per player per game — far above
    // conversation, far below a flood. Keyed by game and sender so one chatty
    // table can't starve another, and gated after membership so a non-player
    // can't even probe the counter. The fixed window is the same approximation
    // the nudge limit already accepts.
    const allowed = await consumeRateLimit('chat', `${gameid}:${userId}`, 20, 5 * 60_000);
    if (!allowed) {
        return NextResponse.json({}, { status: 429, statusText: "Too many messages" });
    }

    const messageDoc: IChatMessageDataDocument = new ChatMessageModel({
        messageId: randomUUID(),
        gameId: gameid,
        senderId: userId,
        text: message,
        timestamp: (new Date()).toISOString(),
    });
    await messageDoc.save();

    // Tell the other players — never the sender, who is looking at the thread
    // they just posted in. Throttled per recipient (docs/in-game-chat.md §7):
    // at most one chat push per player per game per ten minutes, so a
    // back-and-forth doesn't buzz a phone once a line. The message is stored and
    // shown on the poll either way; only the buzz is suppressed.
    //
    // Wrapped so nothing here can undo a message that already saved: a push
    // happens *because* of a message, never the other way round. sendPushToUsers
    // already swallows its own transport failure; this guards the lookups around
    // it (usersById, the throttle) so a Clerk or limiter wobble can't turn a
    // stored line into an error the sender sees (docs/in-game-chat.md §7).
    try {
        const recipientIds = gameData.userIdList.filter((id) => id !== userId);
        const notify: string[] = [];
        for (const id of recipientIds) {
            if (await consumeRateLimit('chatPush', `${gameid}:${id}`, 1, 10 * 60_000)) {
                notify.push(id);
            }
        }
        if (notify.length) {
            const senderName = readableName(await currentUser());
            await sendPushToUsers(await usersById(notify), {
                event: 'ChatMessage',
                gameId: gameid,
                link: gameNotificationLink(gameData.gameType.url, gameid),
            }, buildChatNotification(senderName, gameData, message), { channel: 'chat' });
        }
    } catch (error) {
        console.error(`Failed to send chat push for game ${gameid}`, error);
    }

    // The stored message, for the route test to assert on. The client refetches
    // rather than rendering this directly — one source of truth, no optimistic
    // append (docs/in-game-chat.md §6).
    return NextResponse.json({ success: true, message: toResponse(messageDoc) });
}
