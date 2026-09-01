import { readJsonBody } from '@/utils/api/requestBody';
import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { dbConnect } from '@/utils/mongodb/mongodb';
import { GameDataModel, IGameDataDocument } from '@/utils/mongodb/GameData';
import { ChatReadModel } from '@/utils/mongodb/ChatReadData';
import { normaliseReadAt } from '@/utils/chat';
import { consumeRateLimit } from '@/utils/rateLimit';
import { isDuplicateKeyError } from '@/utils/mongodb/duplicateKey';

export interface IChatReadParams {
    gameid: string;
}

// Marks how far the caller has read into a game's chat thread. Its own route
// under the existing chat/ folder, not a body flag on the message POST — it is
// a different resource, and folding "mark read" into the message handler would
// mean one handler doing two things (docs/in-game-chat.md §13.4).
//
// Access control is the same membership gate as the sibling chat routes. On
// top of it: a bad body is a 400 (normaliseReadAt), a flood is a 429, and the
// write is a clamped, monotonic `$max` upsert — a forged or stale timestamp
// can only ever suppress the forger's own badge, never move it backwards or
// touch anyone else's marker. No push, no notification: marking read is the
// one thing in this feature that tells nobody.
export async function POST(request: NextRequest, { params }: { params: Promise<IChatReadParams> }) {
    console.log(`POST ${request.nextUrl.pathname}`);

    const { userId } = await auth();
    if (!userId) {
        // Same retryable 401 as the sibling chat routes (§5): a session cookie
        // still refreshing should be retried, not dropped.
        return NextResponse.json({}, { status: 401, statusText: "Not signed in" });
    }

    const { readAt: rawReadAt } = await readJsonBody<{ readAt: string }>(request);
    const readAt = normaliseReadAt(rawReadAt);
    if (readAt === null) {
        return NextResponse.json({}, { status: 400, statusText: "Invalid readAt" });
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

    // Sixty per five minutes, per player per game. An open panel only posts
    // when the newest message *changes*, so real traffic is already bounded by
    // the 20-per-5-minutes message limit; this is headroom whose job is to
    // stop a loop, not to shape behaviour (§13.4).
    const allowed = await consumeRateLimit('chatRead', `${gameid}:${userId}`, 60, 5 * 60_000);
    if (!allowed) {
        return NextResponse.json({}, { status: 429, statusText: "Too many requests" });
    }

    // Clamped to now, then applied with $max — a lexical comparison that, on an
    // ISO-8601 string, is also a chronological one. That makes the marker
    // monotonic (two tabs racing, or a request arriving out of order, can never
    // move it backwards and re-light a cleared dot) and idempotent (the client
    // can post the same value as often as it likes).
    const now = new Date().toISOString();
    const clampedReadAt = readAt < now ? readAt : now;

    try {
        await ChatReadModel.findOneAndUpdate(
            { gameId: gameid, userId },
            { $max: { readAt: clampedReadAt } },
            { upsert: true }
        ).exec();
    } catch (err) {
        // Two concurrent upserts on a row that doesn't exist yet both hit the
        // unique { gameId, userId } index; that's a duplicate key, not a real
        // failure — the same retry-without-upsert the repo already writes
        // twice (consumeRateLimit, the join-code generator).
        if (!isDuplicateKeyError(err)) {
            throw err;
        }
        await ChatReadModel.findOneAndUpdate(
            { gameId: gameid, userId },
            { $max: { readAt: clampedReadAt } }
        ).exec();
    }

    return NextResponse.json({ success: true });
}
