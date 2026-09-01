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
    ANN, BOB, get, jsonPost, rawPost, resetApiRouteStubs, seedChatMessage, seedChatReadMarker, seedSnakesAndLadders,
    sentPushes, signIn, storedChatMessages, storedChatReadMarker, stubClerkUsers
} from '@/utils/testing/apiRoute';
import { GET as readChat, POST as postChat } from './[gameid]/chat/route';
import { POST as postChatRead } from './[gameid]/chat/read/route';

/** A GET of one game's chat thread, with the path param Next would hand it. */
function readChatFor(gameid: string) {
    return readChat(get(`/api/game/${gameid}/chat`), { params: Promise.resolve({ gameid }) });
}

/** A POST to one game's chat thread, JSON body and path param. */
function postChatTo(gameid: string, body: unknown) {
    return postChat(jsonPost(`/api/game/${gameid}/chat`, body), { params: Promise.resolve({ gameid }) });
}

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
    // Default the limiter to "allowed"; the 429 test overrides it for one call.
    vi.mocked(consumeRateLimit).mockClear();
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

        const messages = (await (await readChatFor('game_1')).json()).messages;

        expect(messages).toHaveLength(50);
        expect(messages[0].text).toBe('msg 10');
        expect(messages.at(-1).text).toBe('msg 59');
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
