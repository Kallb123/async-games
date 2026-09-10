import { readJsonBody } from '@/utils/api/requestBody';
import { auth, currentUser } from '@clerk/nextjs/server';
import { after, NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { dbConnect } from '@/utils/mongodb/mongodb';
import { GameDataModel, IGameDataDocument } from '@/utils/mongodb/GameData';
import { ChatMessageModel, IChatMessageDataDocument } from '@/utils/mongodb/ChatMessageData';
import { ChatReadModel } from '@/utils/mongodb/ChatReadData';
import { GIF_CATALOGUE_TTL_MS, GifCatalogueModel } from '@/utils/mongodb/GifCatalogueData';
import { IChatAttachment, IChatGifRef, normaliseAttachment, normaliseMessageBody, normaliseReadAt } from '@/utils/chat';
import { registerGifShare } from '@/utils/gif/tenor';
import { consumeRateLimit } from '@/utils/rateLimit';
import { usersById } from '@/utils/users/clerk';
import { sendPushToUsers, gameNotificationLink } from '@/utils/firebase/pushNotification';
import { buildChatNotification } from '@/utils/firebase/notificationContent';
import { readableName } from '@/utils/ui/players';

export interface IChatParams {
    gameid: string;
}

// A v4 UUID, case-insensitively — messageId's own format (randomUUID() below).
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
    /** The message's GIF, if it has one — resolved server-side, never from
     *  anything the sender supplied (docs/chat-gifs.md §4). Absent on a plain
     *  message, and on one whose stored attachment no longer validates. */
    attachment?: IChatAttachment;
    timestamp: string;
}

export interface IChatResponse {
    success: boolean;
    messages: IChatMessageResponse[];
    readAt: string | null;   // this viewer's own marker; null if they never opened the thread. Nobody else's is ever in here (§13.2).
    // True when there are messages older than the oldest one in this response —
    // whether this is the live window or an earlier page fetched with `before`.
    // Drives the panel's "Load earlier" control (§13.7 commit 5).
    hasMore: boolean;
}

function toResponse(message: IChatMessageDataDocument): IChatMessageResponse {
    // normaliseAttachment does two jobs here, which is why it is worth the URL
    // parse per GIF rather than spreading the subdocument: it reduces a
    // Mongoose subdocument to exactly the seven fields that belong on the wire,
    // *and* it re-checks them. So a stored attachment that no longer passes —
    // because the host list has since been narrowed, or because it was written
    // by an older version of the search route — degrades to a message without
    // one instead of putting a URL we would no longer accept into an <img src>.
    // A message left with neither text nor attachment renders as the
    // "GIF unavailable" caption (docs/chat-gifs.md §7).
    //
    // Deliberately not logged. The condition is a property of a stored row, not
    // an event, so it would re-fire for the same message on every poll of an
    // open panel — forever, since nothing repairs the row — and a handful of
    // them in a busy thread would bury the real errors. What it costs is two
    // URL parses per GIF per poll, which is nothing beside the two Mongo round
    // trips in the same handler.
    const attachment = message.attachment ? normaliseAttachment(message.attachment) : null;
    return {
        // messageId is a UUID field; String() gives its canonical form whether
        // the driver hands it back as a UUID object or already as a string.
        messageId: String(message.messageId),
        senderId: message.senderId,
        text: message.text,
        ...(attachment ? { attachment } : {}),
        timestamp: message.timestamp,
    };
}

// The one query chat makes: the newest CHAT_PAGE_SIZE messages in this game (or,
// with `?before=`, the newest CHAT_PAGE_SIZE *older than* that cursor), then
// reversed to oldest-first for the thread. Membership is the whole of the
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

    // `before` loads an earlier page of the thread (docs/in-game-chat.md §13.7
    // commit 5): the client sends the oldest message it already has — its
    // timestamp *and* its messageId — and gets the CHAT_PAGE_SIZE messages
    // immediately before it. Both together, because timestamp alone reopens the
    // same tie the sort's own tiebreaker exists for (the comment on the query
    // below): two messages can share a millisecond, and a page boundary that
    // fell between them would mean `timestamp: { $lt: before }` skips the one
    // that lost the tiebreak forever — it was never on the earlier page (cut
    // off by CHAT_PAGE_SIZE) and can never satisfy a plain `$lt` on any later
    // one either. `before` still reuses normaliseReadAt rather than a second
    // "is this a well-formed ISO timestamp" check — the read marker and a
    // paging cursor are the same shape of value.
    const beforeParam = request.nextUrl.searchParams.get('before');
    const beforeMessageIdParam = request.nextUrl.searchParams.get('beforeMessageId');
    let before: string | null = null;
    let beforeMessageId: string | null = null;
    if (beforeParam !== null || beforeMessageIdParam !== null) {
        before = beforeParam === null ? null : normaliseReadAt(beforeParam);
        beforeMessageId = beforeMessageIdParam !== null && UUID_PATTERN.test(beforeMessageIdParam) ? beforeMessageIdParam : null;
        if (before === null || beforeMessageId === null) {
            return NextResponse.json({}, { status: 400, statusText: "Invalid before" });
        }
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

    // The cursor mirrors the sort key exactly: strictly older, or the same
    // millisecond and strictly on the other side of the tiebreak — "earlier in
    // { timestamp: -1, messageId: -1 } order than (before, beforeMessageId)".
    const cursor = before === null ? { gameId: gameid } : {
        gameId: gameid,
        $or: [
            { timestamp: { $lt: before } },
            { timestamp: before, messageId: { $lt: beforeMessageId } },
        ],
    };
    const page: IChatMessageDataDocument[] = await ChatMessageModel
        // messageId is a deterministic tiebreaker: two messages written in the
        // same millisecond compare equal on timestamp alone, and their order
        // among the tie would otherwise be unspecified — swapping between polls
        // and, at the page boundary, flipping in and out of the window. The
        // { gameId: 1, timestamp: -1 } index still leads the scan; only a
        // same-ms tie is settled in memory, and there are only ever a handful.
        .find(cursor)
        .sort({ timestamp: -1, messageId: -1 })
        // One extra, never returned, so hasMore is known without a second
        // count query — the same "fetch N+1" a limit-based cursor always uses.
        .limit(CHAT_PAGE_SIZE + 1)
        .exec();

    const hasMore = page.length > CHAT_PAGE_SIZE;
    const newest = hasMore ? page.slice(0, CHAT_PAGE_SIZE) : page;
    const messages = newest.reverse().map(toResponse);

    // The caller's own marker, from the same indexed lookup the read route
    // writes ({ gameId: 1, userId: 1 }) — never another player's (§13.2), and
    // riding this GET rather than a separate request means the dot and the
    // messages it's counting can never disagree (§13.4). An earlier page is
    // never what the marker or the unread dot is about, but there is exactly
    // one caller and one shape for this response either way.
    const marker = await ChatReadModel.findOne({ gameId: gameid, userId }).exec();
    const readAt = marker?.readAt ?? null;

    return NextResponse.json({ success: true, messages, readAt, hasMore } satisfies IChatResponse);
}

// Post a message to a game's thread. Access control is the same membership gate
// as the GET; on top of it, a bad body is a 400 (normaliseMessageBody), an
// unresolvable GIF is a 400 (see below), and a flood is a 429. Deliberately *not* requireLiveGame: "gg" after the last turn is the
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

    // Text, a GIF reference, or both — but never neither, and never a GIF the
    // caller described themselves. `gif` is read as `unknown` on purpose: the
    // only two fields of it that survive are the provider and the id, and
    // normaliseGifRef builds them into a fresh object rather than filtering the
    // one that arrived, so a body sending a `url` or a `width` next to the id
    // cannot influence what gets stored (docs/chat-gifs.md §4).
    const body = await readJsonBody<{ text: string, gif: unknown }>(request);
    const messageBody = normaliseMessageBody(body);
    if (messageBody === null) {
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

    // Resolve the GIF, if there is one, from the catalogue our own search route
    // populated — the whole point of the client sending an id rather than a URL
    // (docs/chat-gifs.md §4c). Three properties fall out of it: the stored
    // fields are ones a provider gave us, the item is one our own *filtered*
    // search served to somebody (not merely a real Tenor id, which a player
    // could name from a query the filter would have blocked — note "somebody":
    // the catalogue is app-global, so this is not narrowed to what *this*
    // player's own search returned), and the send touches no third party, so
    // posting a GIF doesn't depend on Tenor being up.
    //
    // Its own limiter, spent before the message limiter below, and keyed on the
    // player rather than the game. Both halves matter:
    //
    // - Keyed on the player, because games are free to create and the message
    //   limiter is per game — so a per-game bound on "is this id in your
    //   cache?" multiplies without limit, while a per-player one doesn't.
    // - Spent first, so a GIF that won't resolve doesn't eat the budget "gg"
    //   needs. Every way a send legitimately misses is our fault, not the
    //   sender's (an empty catalogue after a deploy, a search-route upsert
    //   that's failing, a row reaped between browsing and tapping), and none of
    //   them should end with their next plain message getting a 429.
    //
    // A miss is still a 400 and nothing more clever (§5a).
    let attachment: IChatAttachment | undefined;
    if (messageBody.gif) {
        if (!await consumeRateLimit('chatGif', userId, 30, 5 * 60_000)) {
            return NextResponse.json({}, { status: 429, statusText: "Too many GIFs" });
        }

        // The ref *is* the filter: two fields, both already checked to be
        // strings from a restricted charset, so there is no shape here for a
        // query operator to arrive in.
        const filter: IChatGifRef = messageBody.gif;
        // findOneAndUpdate, not findOne, so using a GIF pushes its expiry out.
        // The TTL runs from when the row was *written*, and a search response
        // served from the CDN never re-runs the route that would rewrite it —
        // so without this touch a GIF that has been in the picker's results for
        // thirty days resolves to nothing, the tap 400s, and the player has no
        // way to understand why. One small write, on a path that is about to
        // write a message anyway. It also means the catalogue holds what is
        // actually in use rather than what was once searched for.
        const row = await GifCatalogueModel.findOneAndUpdate(
            filter,
            { $set: { expiresAt: new Date(Date.now() + GIF_CATALOGUE_TTL_MS) } },
            { new: true }
        ).exec();
        attachment = row ? normaliseAttachment(row) ?? undefined : undefined;
        if (!attachment) {
            // Worth telling apart in the log: an id we have never served is a
            // client doing something odd, whereas a row that fails its own
            // validator is our data being wrong.
            if (row) {
                console.error(`Chat GIF ${filter.provider}:${filter.mediaId} is in the catalogue but does not validate`);
            } else {
                console.warn(`POST ${request.nextUrl.pathname} 400: GIF ${filter.provider}:${filter.mediaId} is not in the catalogue`);
            }
            return NextResponse.json({}, { status: 400, statusText: "Unknown GIF" });
        }
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
        text: messageBody.text,
        // Denormalised, not referenced: the chat GET stays one indexed read
        // with no join, and a catalogue row expiring later can't break a GIF
        // that has already been sent.
        attachment,
        timestamp: (new Date()).toISOString(),
    });
    await messageDoc.save();

    // Tell the other players — never the sender, who is looking at the thread
    // they just posted in. Throttled per recipient (docs/in-game-chat.md §7):
    // at most one chat push per player per game per ten minutes, so a
    // back-and-forth doesn't buzz a phone once a line. The message is stored and
    // shown on the poll either way; only the buzz is suppressed.
    //
    // Run after the response has flushed, like the command route's "your move"
    // push: the Clerk lookups and the FCM fan-out are the slowest part of this
    // request and none of it is anything the sender is waiting on (they just
    // want the line stored — the client refetches rather than rendering the
    // return value). The whole block is guarded, so nothing here can undo a
    // message that already saved: a push happens *because* of a message, never
    // the other way round. sendPushToUsers already swallows its own transport
    // failure; this catches the lookups around it (usersById, currentUser, the
    // throttle) so a Clerk or limiter wobble stays a missing buzz, not a failed
    // request (docs/in-game-chat.md §7).
    after(async () => {
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
                }, buildChatNotification(senderName, gameData, messageBody.text), { channel: 'chat' });
            }
        } catch (error) {
            console.error(`Failed to send chat push for game ${gameid}`, error);
        }

        // Tenor asks for a ping when one of its results is really sent, and it
        // is the only thing we give back for a free API (docs/chat-gifs.md §5).
        //
        // Last, and outside the guard above rather than inside it, because both
        // of those are deliberate: the buzz is what a player is waiting for, so
        // an analytics round trip must not sit in front of it — and
        // `registerGifShare` swallows its own failure, so it neither needs the
        // try/catch nor is skipped when the push has already used it up.
        if (attachment) {
            await registerGifShare(attachment);
        }
    });

    // The stored message, for the route test to assert on. The client refetches
    // rather than rendering this directly — one source of truth, no optimistic
    // append (docs/in-game-chat.md §6).
    return NextResponse.json({ success: true, message: toResponse(messageDoc) });
}
