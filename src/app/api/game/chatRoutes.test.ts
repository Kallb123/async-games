// Integration tests over the chat routes — GET and POST /api/game/[gameid]/chat,
// and POST /api/game/[gameid]/chat/read.
//
// The same setup as gameRoutes.test.ts: everything above the database is the
// real thing (the handlers, the request/response objects, the membership gate,
// normaliseMessage/normaliseReadAt, the Mongoose documents), and only Clerk,
// the connection, the rate limiter and the chat collections are stubbed
// (utils/testing/apiRoute).
//
// What this guards is the review docs/in-game-chat.md §5 asks for: chat as pure
// access control. Who may read this thread, who may post to it, what a bad body
// does — and that a message comes back carrying a senderId and *no* name (the
// guard against the frozen-name trap §3 avoids creeping back in). On top of
// that, the §7 push: it reaches the other players and never the sender, it is
// throttled per recipient, and a push that fails can't lose the stored message.
//
// The read-marker route adds §13.4's own review: the same access control as
// its siblings, a monotonic and idempotent `$max` write, and a GET that carries
// the caller's own marker and nobody else's (§13.2).

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@clerk/nextjs/server', async () => (await import('@/utils/testing/apiRoute')).clerkStub());
vi.mock('next/server', async () => (await import('@/utils/testing/afterStub')).nextServerStub());
vi.mock('@/utils/mongodb/mongodb', async () => (await import('@/utils/testing/apiRoute')).mongodbStub());
vi.mock('@/utils/firebase/pushNotification', async () => (await import('@/utils/testing/apiRoute')).pushNotificationStub());
vi.mock('@/utils/rateLimit', async () => (await import('@/utils/testing/apiRoute')).rateLimitStub());

import { consumeRateLimit } from '@/utils/rateLimit';
import { sendPushToUsers } from '@/utils/firebase/pushNotification';
import { runAfterCallbacks } from '@/utils/testing/afterStub';
import {
    ANN, BOB, get, jsonPost, rawPost, resetApiRouteStubs, seedChatMessage, seedChatReadMarker,
    seedGifCatalogueItem, seedSnakesAndLadders,
    sentPushes, signIn, storedChatMessages, storedChatReadMarker, storedGifCatalogueExpiry, stubClerkUsers
} from '@/utils/testing/apiRoute';
import { GET as readChat, POST as postChat } from './[gameid]/chat/route';
import { POST as postChatRead } from './[gameid]/chat/read/route';

/** A GET of one game's chat thread, with the path param Next would hand it. */
function readChatFor(gameid: string) {
    return readChat(get(`/api/game/${gameid}/chat`), { params: Promise.resolve({ gameid }) });
}

/** A GET of an earlier page: the same request, with `?before=`/`?beforeMessageId=`
 *  on it — the compound cursor the client sends (docs/in-game-chat.md §13.7
 *  commit 5). `beforeMessageId` defaults to a low, valid-shaped UUID: none of
 *  the seeded test messageIds sort below it, so the tie clause is inert and the
 *  cursor behaves as pure "strictly before this timestamp" for tests that
 *  aren't specifically exercising the tiebreak. */
function readChatBefore(gameid: string, before: string, beforeMessageId = '00000000-0000-4000-8000-000000000000') {
    const params = new URLSearchParams({ before, beforeMessageId });
    return readChat(get(`/api/game/${gameid}/chat?${params.toString()}`), { params: Promise.resolve({ gameid }) });
}

/** A deterministic, valid-shaped UUID ordered the same as `i` — the route's
 *  `beforeMessageId` gate rejects anything that doesn't look like one
 *  (UUID_PATTERN), so a test that round-trips a page's own messageId back in
 *  as the next page's cursor needs seeded messages to carry real ones. */
function uuidFor(i: number): string {
    return `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
}

/** A POST to one game's chat thread, JSON body and path param. */
function postChatTo(gameid: string, body: unknown) {
    return postChat(jsonPost(`/api/game/${gameid}/chat`, body), { params: Promise.resolve({ gameid }) });
}

/** A GIF as the search route would have written it into the catalogue
 *  (docs/chat-gifs.md §4c) — the only way one becomes attachable. */
const CATALOGUED_GIF = {
    provider: 'tenor' as const,
    mediaId: 'abc123',
    url: 'https://media.tenor.com/abc123/cat.gif',
    stillUrl: 'https://media.tenor.com/abc123/cat.png',
    width: 320,
    height: 240,
    alt: 'a cat falling off a table',
};

/** A POST to one game's read marker, JSON body and path param. */
function postChatReadTo(gameid: string, body: unknown) {
    return postChatRead(jsonPost(`/api/game/${gameid}/chat/read`, body), { params: Promise.resolve({ gameid }) });
}

/** A POST of a raw (not necessarily JSON) body. */
function postRawChatTo(gameid: string, body: string) {
    return postChat(rawPost(`/api/game/${gameid}/chat`, body), { params: Promise.resolve({ gameid }) });
}

beforeEach(async () => {
    await resetApiRouteStubs();
    // Default the limiter back to "allowed"; the 429 and throttle tests each
    // override it. mockReset, not mockClear: the stub is a `vi.fn(async () =>
    // true)`, so reset restores that default, whereas clear only forgets the
    // calls — which left a `mockImplementation` from the throttle test denying
    // `chatPush` for every test that ran after it.
    vi.mocked(consumeRateLimit).mockReset();
});

describe('GET /api/game/[gameid]/chat', () => {
    it('returns the thread oldest-first to a player in the game', async () => {
        signIn(ANN);
        seedSnakesAndLadders();
        seedChatMessage({ messageId: 'm2', gameId: 'game_1', senderId: BOB.id, text: 'second', timestamp: '2026-01-02T00:00:00.000Z' });
        seedChatMessage({ messageId: 'm1', gameId: 'game_1', senderId: ANN.id, text: 'first', timestamp: '2026-01-01T00:00:00.000Z' });

        const response = await readChatFor('game_1');

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.success).toBe(true);
        expect(body.messages.map((m: { text: string }) => m.text)).toEqual(['first', 'second']);
    });

    it('answers an empty thread, not a 404, when nothing has been said', async () => {
        signIn(ANN);
        seedSnakesAndLadders();

        const response = await readChatFor('game_1');
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.messages).toEqual([]);
        // A thread shorter than one page — nothing earlier to load.
        expect(body.hasMore).toBe(false);
        // No marker posted yet: null, not a missing field or a 404 (§13.4).
        expect(body.readAt).toBeNull();
    });

    it('carries the senderId and no name — nothing frozen onto the wire', async () => {
        signIn(ANN);
        seedSnakesAndLadders();
        seedChatMessage({ messageId: 'm1', gameId: 'game_1', senderId: ANN.id, text: 'hi', timestamp: '2026-01-01T00:00:00.000Z' });

        const message = (await (await readChatFor('game_1')).json()).messages[0];

        expect(message.senderId).toBe(ANN.id);
        // The name is resolved by the client from the roster it already holds
        // (§5); the response must not smuggle one in under any of these keys.
        expect(message).not.toHaveProperty('senderName');
        expect(message).not.toHaveProperty('senderUsername');
        expect(message).not.toHaveProperty('username');
        expect(Object.keys(message).sort()).toEqual(['messageId', 'senderId', 'text', 'timestamp']);
    });

    it('returns only the newest CHAT_PAGE_SIZE, oldest-first', async () => {
        signIn(ANN);
        seedSnakesAndLadders();
        // 60 messages, one per minute; the route keeps the newest 50.
        for (let i = 0; i < 60; i++) {
            const minute = String(i).padStart(2, '0');
            seedChatMessage({ messageId: `m${i}`, gameId: 'game_1', senderId: ANN.id, text: `msg ${i}`, timestamp: `2026-01-01T00:${minute}:00.000Z` });
        }

        const body = await (await readChatFor('game_1')).json();

        expect(body.messages).toHaveLength(50);
        expect(body.messages[0].text).toBe('msg 10');
        expect(body.messages.at(-1).text).toBe('msg 59');
        // Ten messages (0-9) are older than the oldest one on this page.
        expect(body.hasMore).toBe(true);
    });

    it('orders two messages written in the same millisecond deterministically', async () => {
        signIn(ANN);
        seedSnakesAndLadders();
        // Same timestamp: timestamp alone can't order these, so the read leans
        // on the messageId tiebreaker and the order must be stable across polls.
        // Valid UUIDs, so the response's messageId round-trips the UUID field.
        const lower = 'aaaaaaaa-0000-4000-8000-000000000000';
        const higher = 'bbbbbbbb-0000-4000-8000-000000000000';
        seedChatMessage({ messageId: higher, gameId: 'game_1', senderId: BOB.id, text: 'B', timestamp: '2026-01-01T00:00:00.000Z' });
        seedChatMessage({ messageId: lower, gameId: 'game_1', senderId: ANN.id, text: 'A', timestamp: '2026-01-01T00:00:00.000Z' });

        const messages = (await (await readChatFor('game_1')).json()).messages;

        // sort({ timestamp: -1, messageId: -1 }) puts the higher id first, then
        // the route reverses to oldest-first, so the lower id leads — a fixed
        // order regardless of which was seeded first, and both survive.
        expect(messages.map((m: { messageId: string }) => m.messageId)).toEqual([lower, higher]);
    });

    it('leaks nothing to somebody who is not in the game', async () => {
        signIn({ id: 'user_carol', username: 'carol' });
        seedSnakesAndLadders();
        seedChatMessage({ messageId: 'm1', gameId: 'game_1', senderId: ANN.id, text: 'secret', timestamp: '2026-01-01T00:00:00.000Z' });

        const response = await readChatFor('game_1');

        expect(response.status).toBe(403);
    });

    it('carries the caller\'s own marker, and no one else\'s (§13.2)', async () => {
        signIn(ANN);
        seedSnakesAndLadders();
        seedChatReadMarker({ gameId: 'game_1', userId: ANN.id, readAt: '2026-01-01T00:00:00.000Z' });
        seedChatReadMarker({ gameId: 'game_1', userId: BOB.id, readAt: '2026-06-01T00:00:00.000Z' });

        const body = await (await readChatFor('game_1')).json();

        expect(body.readAt).toBe('2026-01-01T00:00:00.000Z');
        expect(JSON.stringify(body)).not.toContain('2026-06-01');
    });

    it('answers 401, not 400, for a request from nobody', async () => {
        seedSnakesAndLadders();

        const response = await readChatFor('game_1');

        // 401 so a tab with a still-refreshing session cookie retries (§5).
        expect(response.status).toBe(401);
    });

    it('answers 404 for a game that does not exist', async () => {
        signIn(ANN);

        expect((await readChatFor('no_such_game')).status).toBe(404);
    });

    describe('?before=', () => {
        it('loads the page immediately before the cursor, oldest-first', async () => {
            signIn(ANN);
            seedSnakesAndLadders();
            for (let i = 0; i < 5; i++) {
                const minute = String(i).padStart(2, '0');
                seedChatMessage({ messageId: `m${i}`, gameId: 'game_1', senderId: ANN.id, text: `msg ${i}`, timestamp: `2026-01-01T00:${minute}:00.000Z` });
            }

            // Ask for what came strictly before msg 2's timestamp.
            const body = await (await readChatBefore('game_1', '2026-01-01T00:02:00.000Z')).json();

            expect(body.success).toBe(true);
            expect(body.messages.map((m: { text: string }) => m.text)).toEqual(['msg 0', 'msg 1']);
            expect(body.hasMore).toBe(false);
        });

        it('pages a thread longer than one page, and says so with hasMore', async () => {
            signIn(ANN);
            seedSnakesAndLadders();
            // 120 messages: three pages of 50, 50 and 20.
            for (let i = 0; i < 120; i++) {
                const timestamp = new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString();
                seedChatMessage({ messageId: uuidFor(i), gameId: 'game_1', senderId: ANN.id, text: `msg ${i}`, timestamp });
            }

            const live = await (await readChatFor('game_1')).json();
            expect(live.messages).toHaveLength(50);
            expect(live.messages[0].text).toBe('msg 70');
            expect(live.hasMore).toBe(true);

            const secondPage = await (await readChatBefore('game_1', live.messages[0].timestamp, live.messages[0].messageId)).json();
            expect(secondPage.messages).toHaveLength(50);
            expect(secondPage.messages[0].text).toBe('msg 20');
            expect(secondPage.messages.at(-1).text).toBe('msg 69');
            expect(secondPage.hasMore).toBe(true);

            const thirdPage = await (await readChatBefore('game_1', secondPage.messages[0].timestamp, secondPage.messages[0].messageId)).json();
            expect(thirdPage.messages).toHaveLength(20);
            expect(thirdPage.messages[0].text).toBe('msg 0');
            expect(thirdPage.messages.at(-1).text).toBe('msg 19');
            // Nothing older than msg 0 — the thread ends here.
            expect(thirdPage.hasMore).toBe(false);
        });

        it('does not lose a same-millisecond message split across a page boundary', async () => {
            signIn(ANN);
            seedSnakesAndLadders();
            const tieTimestamp = '2026-01-01T00:01:00.000Z';
            const a = uuidFor(1);   // lower id — loses the tiebreak, sorts after b
            const b = uuidFor(2);   // higher id — wins the tiebreak, sorts first
            seedChatMessage({ messageId: a, gameId: 'game_1', senderId: ANN.id, text: 'tied-a', timestamp: tieTimestamp });
            seedChatMessage({ messageId: b, gameId: 'game_1', senderId: ANN.id, text: 'tied-b', timestamp: tieTimestamp });
            // 49 messages newer than the tie, so the tie lands exactly on the
            // live page's oldest edge: 'tied-b' is the 50th (last) message on
            // the live page, and 'tied-a' — same millisecond, lower id — is the
            // 51st, the one a page boundary here could lose.
            for (let i = 0; i < 49; i++) {
                const timestamp = new Date(Date.UTC(2026, 0, 1, 0, 2, i)).toISOString();
                seedChatMessage({ messageId: uuidFor(100 + i), gameId: 'game_1', senderId: ANN.id, text: `recent ${i}`, timestamp });
            }

            const live = await (await readChatFor('game_1')).json();
            expect(live.messages).toHaveLength(50);
            expect(live.hasMore).toBe(true);
            // The higher id wins the tiebreak and sorts first, so 'tied-b' is
            // the oldest message still inside the live page.
            expect(live.messages[0].text).toBe('tied-b');

            const earlier = await (await readChatBefore('game_1', live.messages[0].timestamp, live.messages[0].messageId)).json();

            // A plain `timestamp: { $lt: before }` cursor would exclude
            // 'tied-a' forever — same timestamp, so never "less than" — even
            // though it never made it onto the live page either. The compound
            // before/beforeMessageId cursor must still find it.
            expect(earlier.messages.map((m: { text: string }) => m.text)).toEqual(['tied-a']);
            expect(earlier.hasMore).toBe(false);
        });

        it('answers an empty page, not an error, once the thread runs out', async () => {
            signIn(ANN);
            seedSnakesAndLadders();
            const onlyMessageId = uuidFor(1);
            seedChatMessage({ messageId: onlyMessageId, gameId: 'game_1', senderId: ANN.id, text: 'only one', timestamp: '2026-01-01T00:00:00.000Z' });

            const body = await (await readChatBefore('game_1', '2026-01-01T00:00:00.000Z', onlyMessageId)).json();

            expect(body.success).toBe(true);
            expect(body.messages).toEqual([]);
            expect(body.hasMore).toBe(false);
        });

        it('rejects a before that is not a date, with a 400', async () => {
            signIn(ANN);
            seedSnakesAndLadders();

            const response = await readChatBefore('game_1', 'not a date');

            expect(response.status).toBe(400);
        });

        it('rejects a beforeMessageId that is not a UUID, with a 400', async () => {
            signIn(ANN);
            seedSnakesAndLadders();

            const response = await readChatBefore('game_1', '2026-01-01T00:00:00.000Z', 'not-a-uuid');

            expect(response.status).toBe(400);
        });

        it('still gates on membership with a valid cursor', async () => {
            signIn({ id: 'user_carol', username: 'carol' });
            seedSnakesAndLadders();

            const response = await readChatBefore('game_1', '2026-01-01T00:00:00.000Z');

            expect(response.status).toBe(403);
        });
    });
});

describe('POST /api/game/[gameid]/chat', () => {
    it('stores a message and returns it carrying a senderId and no name', async () => {
        signIn(ANN);
        seedSnakesAndLadders();

        const response = await postChatTo('game_1', { text: '  gg  ' });

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.success).toBe(true);
        expect(body.message.senderId).toBe(ANN.id);
        // Trimmed as normaliseMessage stores it.
        expect(body.message.text).toBe('gg');
        expect(body.message).not.toHaveProperty('senderName');
        expect(Object.keys(body.message).sort()).toEqual(['messageId', 'senderId', 'text', 'timestamp']);

        const stored = storedChatMessages('game_1');
        expect(stored).toHaveLength(1);
        expect(stored[0]).toMatchObject({ senderId: ANN.id, text: 'gg', gameId: 'game_1' });
    });

    it('pushes the message to the other players, but never the sender', async () => {
        signIn(ANN);
        stubClerkUsers(BOB);
        seedSnakesAndLadders();

        await postChatTo('game_1', { text: 'your move' });
        // The push is scheduled with after(), so it runs once the response has
        // flushed — the sender waits on none of it (§7). Drive that work here.
        await runAfterCallbacks();

        expect(sentPushes).toHaveLength(1);
        const push = sentPushes[0];
        // Every player but the sender — Ann posted it, so Ann is not told.
        expect(push.userIds).toEqual([BOB.id]);
        expect(push.userIds).not.toContain(ANN.id);
        expect(push.options?.channel).toBe('chat');
        expect(push.data.event).toBe('ChatMessage');
        expect(push.data.gameId).toBe('game_1');
        // The message itself is the body; the title names the sender and game.
        expect(push.notification.body).toBe('your move');
        expect(push.notification.title).toBe('ann in Snakes and Ladders');
    });

    it('throttles the buzz per recipient, but still stores the message', async () => {
        signIn(ANN);
        stubClerkUsers(BOB);
        seedSnakesAndLadders();
        // The message limit ('chat') stays open; the per-recipient buzz
        // ('chatPush') is spent, so the line lands silently (§7).
        vi.mocked(consumeRateLimit).mockImplementation(async (action) => action !== 'chatPush');

        const response = await postChatTo('game_1', { text: 'and another' });
        await runAfterCallbacks();

        expect(response.status).toBe(200);
        expect(storedChatMessages('game_1')).toHaveLength(1);
        expect(sentPushes).toHaveLength(0);
        // One chat push per player per game per ten minutes (§7).
        expect(vi.mocked(consumeRateLimit)).toHaveBeenCalledWith('chatPush', `game_1:${BOB.id}`, 1, 10 * 60_000);
    });

    it('keeps the message even when the push blows up', async () => {
        // The push happens because of the message, never the other way round: a
        // Firebase or Clerk wobble must not turn a stored line into a 500, and
        // must not escape the after() callback either (§7).
        signIn(ANN);
        stubClerkUsers(BOB);
        seedSnakesAndLadders();
        vi.mocked(sendPushToUsers).mockRejectedValueOnce(new Error('FCM is down'));

        const response = await postChatTo('game_1', { text: 'still here' });

        expect(response.status).toBe(200);
        expect((await response.json()).message.text).toBe('still here');
        expect(storedChatMessages('game_1')).toHaveLength(1);
        // The scheduled push rejects, but its guard swallows it — running the
        // post-response work resolves rather than throwing, and the stored
        // message is untouched.
        await expect(runAfterCallbacks()).resolves.toBe(1);
        expect(storedChatMessages('game_1')).toHaveLength(1);
    });

    it('lets a player post to a game that has already finished', async () => {
        // "gg" after the last turn is the whole point of not gating on a live
        // game (§5): a finished game's document still exists, so chat is open.
        signIn(ANN);
        seedSnakesAndLadders({ complete: true, endReason: 'ended', currentTurn: '' });

        const response = await postChatTo('game_1', { text: 'gg wp' });

        expect(response.status).toBe(200);
        expect(storedChatMessages('game_1')).toHaveLength(1);
    });

    it('refuses a message from somebody who is not in the game', async () => {
        signIn({ id: 'user_carol', username: 'carol' });
        seedSnakesAndLadders();

        const response = await postChatTo('game_1', { text: 'let me in' });

        expect(response.status).toBe(403);
        expect(storedChatMessages('game_1')).toHaveLength(0);
    });

    it('answers 401, not 400, for a request from nobody', async () => {
        seedSnakesAndLadders();

        const response = await postChatTo('game_1', { text: 'hello' });

        expect(response.status).toBe(401);
        expect(storedChatMessages('game_1')).toHaveLength(0);
    });

    it('answers 404 for a game that does not exist', async () => {
        signIn(ANN);

        const response = await postChatTo('no_such_game', { text: 'hello' });

        expect(response.status).toBe(404);
    });

    it('rejects an over-length body with a 400 and stores nothing', async () => {
        signIn(ANN);
        seedSnakesAndLadders();

        const response = await postChatTo('game_1', { text: 'x'.repeat(501) });

        expect(response.status).toBe(400);
        expect(storedChatMessages('game_1')).toHaveLength(0);
    });

    it.each([
        ['an empty message', { text: '   ' }],
        ['a missing text field', { notText: 'hello' }],
        ['a non-string text', { text: 42 }],
    ])('rejects %s with a 400', async (_label, body) => {
        signIn(ANN);
        seedSnakesAndLadders();

        expect((await postChatTo('game_1', body)).status).toBe(400);
        expect(storedChatMessages('game_1')).toHaveLength(0);
    });

    it('answers 400 for a body that is not JSON', async () => {
        signIn(ANN);
        seedSnakesAndLadders();

        expect((await postRawChatTo('game_1', 'not json at all')).status).toBe(400);
        expect(storedChatMessages('game_1')).toHaveLength(0);
    });

    it('checks who is asking before it reads the body', async () => {
        // Signed out, a non-JSON body must not throw a 500 on its way to the
        // parser — auth answers first.
        const response = await postRawChatTo('game_1', 'not json at all');

        expect(response.status).toBe(401);
    });

    it('refuses once the rate limit is spent, and stores nothing', async () => {
        signIn(ANN);
        seedSnakesAndLadders();
        vi.mocked(consumeRateLimit).mockResolvedValueOnce(false);

        const response = await postChatTo('game_1', { text: 'flood' });

        expect(response.status).toBe(429);
        expect(storedChatMessages('game_1')).toHaveLength(0);
        // Keyed by game and sender, at twenty per five minutes (§5, §7).
        expect(vi.mocked(consumeRateLimit)).toHaveBeenCalledWith('chat', `game_1:${ANN.id}`, 20, 5 * 60_000);
    });

    it("rate-limits only after the membership gate, so a stranger can't probe it", async () => {
        signIn({ id: 'user_carol', username: 'carol' });
        seedSnakesAndLadders();

        await postChatTo('game_1', { text: 'probe' });

        expect(vi.mocked(consumeRateLimit)).not.toHaveBeenCalled();
    });

    // GIFs (docs/chat-gifs.md §4). The claim under test is that a sender picks
    // *which* catalogued GIF, and nothing else about it: every field on the
    // message comes from the catalogue row our own filtered search wrote, so a
    // forged id, a forged URL, or a URL smuggled in alongside a real id all get
    // the sender nowhere.
    describe('with a GIF', () => {
        it('stores a catalogued GIF and sends it back resolved', async () => {
            signIn(ANN);
            seedSnakesAndLadders();
            seedGifCatalogueItem(CATALOGUED_GIF);

            const response = await postChatTo('game_1', { gif: { provider: 'tenor', mediaId: 'abc123' } });

            expect(response.status).toBe(200);
            expect((await response.json()).message.attachment).toEqual(CATALOGUED_GIF);
            // Text is empty, not absent: a GIF with no caption is a message.
            expect(storedChatMessages('game_1')).toHaveLength(1);
            expect(storedChatMessages('game_1')[0].text).toBe('');
            expect(storedChatMessages('game_1')[0].attachment).toEqual(CATALOGUED_GIF);
        });

        it('keeps a caption alongside the GIF', async () => {
            signIn(ANN);
            seedSnakesAndLadders();
            seedGifCatalogueItem(CATALOGUED_GIF);

            await postChatTo('game_1', { text: '  this is you  ', gif: { provider: 'tenor', mediaId: 'abc123' } });

            const stored = storedChatMessages('game_1')[0];
            expect(stored.text).toBe('this is you');
            expect(stored.attachment).toEqual(CATALOGUED_GIF);
        });

        it('ignores everything the sender says about the GIF except which one it is', async () => {
            // The whole design in one test: a sender who supplies their own url,
            // dimensions and alt next to a real id gets the catalogue's copy of
            // all three, not theirs.
            signIn(ANN);
            seedSnakesAndLadders();
            seedGifCatalogueItem(CATALOGUED_GIF);

            await postChatTo('game_1', {
                gif: {
                    provider: 'tenor',
                    mediaId: 'abc123',
                    url: 'https://evil.example/tracker.gif',
                    stillUrl: 'https://evil.example/tracker.png',
                    width: 9999,
                    height: 9999,
                    alt: 'click here',
                },
            });

            expect(storedChatMessages('game_1')[0].attachment).toEqual(CATALOGUED_GIF);
        });

        it('refuses an id that is not in the catalogue, and stores nothing', async () => {
            // Unreachable from the picker, which resolved the row seconds ago —
            // so the caller worth thinking about is one sending ids by hand.
            signIn(ANN);
            seedSnakesAndLadders();
            seedGifCatalogueItem(CATALOGUED_GIF);

            const response = await postChatTo('game_1', { gif: { provider: 'tenor', mediaId: 'neverserved' } });

            expect(response.status).toBe(400);
            expect(storedChatMessages('game_1')).toHaveLength(0);
        });

        it('refuses a catalogued id whose stored row no longer validates', async () => {
            // A row written before the host list was narrowed. Ours, and still
            // refused, rather than trusted for being ours.
            signIn(ANN);
            seedSnakesAndLadders();
            seedGifCatalogueItem({ ...CATALOGUED_GIF, url: 'https://evil.example/x.gif' });

            const response = await postChatTo('game_1', { gif: { provider: 'tenor', mediaId: 'abc123' } });

            expect(response.status).toBe(400);
            expect(storedChatMessages('game_1')).toHaveLength(0);
        });

        it.each([
            ['an unknown provider', { gif: { provider: 'giphy', mediaId: 'abc123' } }],
            ['a bare URL instead of a reference', { gif: 'https://media.tenor.com/abc123/cat.gif' }],
            ['a reference with no id', { gif: { provider: 'tenor' } }],
            ['an id outside the inert charset', { gif: { provider: 'tenor', mediaId: '../abc123' } }],
            ['a query operator where the id goes', { gif: { provider: 'tenor', mediaId: { $ne: '' } } }],
        ])('rejects %s with a 400 before it reaches the catalogue', async (_label, body) => {
            signIn(ANN);
            seedSnakesAndLadders();
            seedGifCatalogueItem(CATALOGUED_GIF);

            expect((await postChatTo('game_1', body)).status).toBe(400);
            expect(storedChatMessages('game_1')).toHaveLength(0);
        });

        it('rejects an invalid GIF rather than quietly posting just the caption', async () => {
            signIn(ANN);
            seedSnakesAndLadders();

            const response = await postChatTo('game_1', { text: 'look at this', gif: { provider: 'giphy', mediaId: 'x' } });

            expect(response.status).toBe(400);
            expect(storedChatMessages('game_1')).toHaveLength(0);
        });

        it('still gates on membership before resolving anything', async () => {
            signIn({ id: 'user_carol', username: 'carol' });
            seedSnakesAndLadders();
            seedGifCatalogueItem(CATALOGUED_GIF);

            const response = await postChatTo('game_1', { gif: { provider: 'tenor', mediaId: 'abc123' } });

            expect(response.status).toBe(403);
            expect(storedChatMessages('game_1')).toHaveLength(0);
        });

        it('pushes "Sent a GIF" for a GIF with no caption', async () => {
            signIn(ANN);
            seedSnakesAndLadders();
            stubClerkUsers(BOB);
            seedGifCatalogueItem(CATALOGUED_GIF);

            await postChatTo('game_1', { gif: { provider: 'tenor', mediaId: 'abc123' } });
            await runAfterCallbacks();

            expect(sentPushes).toHaveLength(1);
            expect(sentPushes[0].notification.body).toBe('Sent a GIF');
            // The image slot is the game's own art, never the GIF (§8) — this
            // game happens to have none, so what matters is only that neither
            // of the GIF's URLs got in.
            expect(sentPushes[0].notification.imageUrl).not.toBe(CATALOGUED_GIF.url);
            expect(sentPushes[0].notification.imageUrl).not.toBe(CATALOGUED_GIF.stillUrl);
        });

        it('pushes the caption when a GIF has one', async () => {
            signIn(ANN);
            seedSnakesAndLadders();
            stubClerkUsers(BOB);
            seedGifCatalogueItem(CATALOGUED_GIF);

            await postChatTo('game_1', { text: 'this is you', gif: { provider: 'tenor', mediaId: 'abc123' } });
            await runAfterCallbacks();

            expect(sentPushes[0].notification.body).toBe('this is you');
        });

        it('pushes the row\'s expiry out when a GIF is used', async () => {
            // The TTL runs from when the row was written, and a CDN-cached
            // search response never re-runs the route that would rewrite it —
            // so without this touch a GIF that has sat in the picker's results
            // for thirty days resolves to nothing and the tap 400s for reasons
            // the player can't see (docs/chat-gifs.md §4c).
            signIn(ANN);
            seedSnakesAndLadders();
            const nearlyReaped = new Date(Date.now() + 60_000);
            seedGifCatalogueItem({ ...CATALOGUED_GIF, expiresAt: nearlyReaped });

            await postChatTo('game_1', { gif: { provider: 'tenor', mediaId: 'abc123' } });

            const expiry = storedGifCatalogueExpiry('tenor', 'abc123');
            expect(expiry!.getTime()).toBeGreaterThan(nearlyReaped.getTime());
        });

        it('spends its own limiter, not the one plain messages use', async () => {
            // Keyed on the player, not the game: the message limiter is per
            // game and games are free to create, so a per-game bound on "is
            // this id in your cache?" multiplies without limit.
            signIn(ANN);
            seedSnakesAndLadders();
            seedGifCatalogueItem(CATALOGUED_GIF);

            await postChatTo('game_1', { gif: { provider: 'tenor', mediaId: 'abc123' } });

            expect(vi.mocked(consumeRateLimit)).toHaveBeenCalledWith('chatGif', ANN.id, 30, 5 * 60_000);
        });

        it('refuses once the GIF limiter is spent, without touching the message limiter', async () => {
            signIn(ANN);
            seedSnakesAndLadders();
            seedGifCatalogueItem(CATALOGUED_GIF);
            vi.mocked(consumeRateLimit).mockImplementation(async (action) => action !== 'chatGif');

            const response = await postChatTo('game_1', { gif: { provider: 'tenor', mediaId: 'abc123' } });

            expect(response.status).toBe(429);
            expect(storedChatMessages('game_1')).toHaveLength(0);
            expect(vi.mocked(consumeRateLimit)).not.toHaveBeenCalledWith('chat', expect.anything(), expect.anything(), expect.anything());
        });

        it("leaves the conversation's budget alone when a GIF won't resolve", async () => {
            // Every way a send legitimately misses is our fault, not the
            // sender's — so their next plain message must not be a 429.
            signIn(ANN);
            seedSnakesAndLadders();

            const response = await postChatTo('game_1', { gif: { provider: 'tenor', mediaId: 'neverserved' } });

            expect(response.status).toBe(400);
            expect(vi.mocked(consumeRateLimit)).not.toHaveBeenCalledWith('chat', expect.anything(), expect.anything(), expect.anything());
        });

        it('carries a stored GIF on the GET, and no attachment key on a plain message', async () => {
            signIn(ANN);
            seedSnakesAndLadders();
            seedChatMessage({
                messageId: 'm1', gameId: 'game_1', senderId: BOB.id, text: '', timestamp: '2026-01-01T00:00:00.000Z',
                attachment: CATALOGUED_GIF,
            });
            seedChatMessage({ messageId: 'm2', gameId: 'game_1', senderId: ANN.id, text: 'ha', timestamp: '2026-01-02T00:00:00.000Z' });

            const messages = (await (await readChatFor('game_1')).json()).messages;

            expect(messages[0].attachment).toEqual(CATALOGUED_GIF);
            expect(messages[1]).not.toHaveProperty('attachment');
        });

        it('drops a stored GIF from the GET once its row no longer validates', async () => {
            // Degrades to a message without a picture rather than putting a URL
            // we would no longer accept into an <img src> in every browser.
            signIn(ANN);
            seedSnakesAndLadders();
            seedChatMessage({
                messageId: 'm1', gameId: 'game_1', senderId: BOB.id, text: 'look', timestamp: '2026-01-01T00:00:00.000Z',
                attachment: { ...CATALOGUED_GIF, url: 'https://evil.example/x.gif' },
            });

            const messages = (await (await readChatFor('game_1')).json()).messages;

            expect(messages[0]).not.toHaveProperty('attachment');
            expect(messages[0].text).toBe('look');
        });
    });
});

describe('POST /api/game/[gameid]/chat/read', () => {
    it('upserts a marker on the first post, then updates it on the second', async () => {
        signIn(ANN);
        seedSnakesAndLadders();

        const first = await postChatReadTo('game_1', { readAt: '2026-01-01T00:00:00.000Z' });
        expect(first.status).toBe(200);
        expect(storedChatReadMarker('game_1', ANN.id)).toBe('2026-01-01T00:00:00.000Z');

        const second = await postChatReadTo('game_1', { readAt: '2026-01-02T00:00:00.000Z' });
        expect(second.status).toBe(200);
        expect(storedChatReadMarker('game_1', ANN.id)).toBe('2026-01-02T00:00:00.000Z');
    });

    it('never moves the marker backwards — a later, older post leaves the newer one standing', async () => {
        signIn(ANN);
        seedSnakesAndLadders();

        await postChatReadTo('game_1', { readAt: '2026-01-05T00:00:00.000Z' });
        const response = await postChatReadTo('game_1', { readAt: '2026-01-01T00:00:00.000Z' });

        // $max is monotonic: two tabs racing, or a request arriving out of
        // order, can never re-light a dot the player already cleared (§13.4).
        expect(response.status).toBe(200);
        expect(storedChatReadMarker('game_1', ANN.id)).toBe('2026-01-05T00:00:00.000Z');
    });

    it('clamps a future timestamp to now, rather than storing it as read', async () => {
        signIn(ANN);
        seedSnakesAndLadders();
        const farFuture = '2099-01-01T00:00:00.000Z';

        const response = await postChatReadTo('game_1', { readAt: farFuture });

        expect(response.status).toBe(200);
        const stored = storedChatReadMarker('game_1', ANN.id);
        expect(stored).toBeDefined();
        expect(stored).not.toBe(farFuture);
        expect(new Date(stored!).getTime()).toBeLessThanOrEqual(Date.now());
    });

    it('refuses a marker from somebody who is not in the game, and stores nothing', async () => {
        signIn({ id: 'user_carol', username: 'carol' });
        seedSnakesAndLadders();

        const response = await postChatReadTo('game_1', { readAt: '2026-01-01T00:00:00.000Z' });

        expect(response.status).toBe(403);
        expect(storedChatReadMarker('game_1', 'user_carol')).toBeUndefined();
    });

    it('answers 401, not 400, for a request from nobody', async () => {
        seedSnakesAndLadders();

        const response = await postChatReadTo('game_1', { readAt: '2026-01-01T00:00:00.000Z' });

        expect(response.status).toBe(401);
    });

    it('answers 404 for a game that does not exist', async () => {
        signIn(ANN);

        expect((await postChatReadTo('no_such_game', { readAt: '2026-01-01T00:00:00.000Z' })).status).toBe(404);
    });

    it.each([
        ['a missing readAt', {}],
        ['a non-string readAt', { readAt: 1_756_728_000_000 }],
        ['a readAt that does not parse as a date', { readAt: 'not a date' }],
    ])('rejects %s with a 400, and stores nothing', async (_label, body) => {
        signIn(ANN);
        seedSnakesAndLadders();

        const response = await postChatReadTo('game_1', body);

        expect(response.status).toBe(400);
        expect(storedChatReadMarker('game_1', ANN.id)).toBeUndefined();
    });

    it('answers 400 for a body that is not JSON', async () => {
        signIn(ANN);
        seedSnakesAndLadders();

        expect((await postChatRead(rawPost('/api/game/game_1/chat/read', 'not json at all'), { params: Promise.resolve({ gameid: 'game_1' }) })).status).toBe(400);
    });

    it('refuses once the rate limit is spent, and stores nothing', async () => {
        signIn(ANN);
        seedSnakesAndLadders();
        vi.mocked(consumeRateLimit).mockResolvedValueOnce(false);

        const response = await postChatReadTo('game_1', { readAt: '2026-01-01T00:00:00.000Z' });

        expect(response.status).toBe(429);
        expect(storedChatReadMarker('game_1', ANN.id)).toBeUndefined();
        // Sixty per five minutes, per player per game (§13.4).
        expect(vi.mocked(consumeRateLimit)).toHaveBeenCalledWith('chatRead', `game_1:${ANN.id}`, 60, 5 * 60_000);
    });

    it("rate-limits only after the membership gate, so a stranger can't probe it", async () => {
        signIn({ id: 'user_carol', username: 'carol' });
        seedSnakesAndLadders();

        await postChatReadTo('game_1', { readAt: '2026-01-01T00:00:00.000Z' });

        expect(vi.mocked(consumeRateLimit)).not.toHaveBeenCalled();
    });
});
