// The boundary stubs an API-route integration test needs, in one place.
//
// The route handlers were the layer with no tests at all — every finding in
// docs/robustness-review.md lived in it — and the reason is that a handler
// reaches past the process: Clerk, Mongo, Next's request scope, the push
// transport. This module stands in for those and nothing else, so that what a
// test exercises is the real handler, the real request and response objects,
// the real game engine, the real Mongoose documents (casting, defaults, Maps,
// discriminator methods and all) and the real serialiser.
//
// It is *not* a Mongo. The game store below looks a game up by id and writes
// one back, with the version check the schema's `optimisticConcurrency` gives
// it, because that is the whole of what a route that plays a turn does — and a
// query it doesn't understand throws rather than quietly answering nothing.
// Standing up `mongodb-memory-server` instead would exercise the queries and
// the indexes too, which is the next step and a bigger one; this covers the
// handler logic that was going untested today.
//
// Test-only. Nothing under src/app imports this.

import { vi } from 'vitest';
import mongoose from 'mongoose';
import type { NextRequest } from 'next/server';
import type { User } from '@clerk/nextjs/server';
import type { PushNotification, SendPushOptions } from '@/utils/firebase/pushNotification';
import type { IGameDataDocument } from '@/utils/mongodb/GameData';
import { clearAfterCallbacks } from '@/utils/testing/afterStub';

// Every module the stubs below stand in for is imported when `resetApiRouteStubs`
// runs, never at the top of this file — the same rule afterStub.ts is a separate
// module for. A `vi.mock` factory imports this module, so anything imported here
// statically is imported *while* the module being mocked is still resolving, and
// `@clerk/nextjs/server` (which GameData reaches, via clerk.ts) deadlocks that way.
type GameData = typeof import('@/utils/mongodb/GameData');
let mongo: typeof import('@/utils/mongodb/mongodb');
let gameData: GameData;
let chatMessageData: typeof import('@/utils/mongodb/ChatMessageData');
let chatReadData: typeof import('@/utils/mongodb/ChatReadData');
let nextServer: typeof import('next/server');

/** A stored game, as the database would hold it: plain, with a version. */
type StoredGame = Record<string, unknown> & { gameId: string, __v: number };

/** A stored chat message, as the ChatMessage collection would hold it. */
type StoredChatMessage = { messageId: string, gameId: string, senderId: string, text: string, timestamp: string };

/** A stored read marker, as the ChatRead collection would hold it. */
type StoredChatReadMarker = { gameId: string, userId: string, readAt: string };

let signedInUserId: string | null = null;
let clerkUsers: User[] = [];
const games = new Map<string, StoredGame>();
const chatMessages: StoredChatMessage[] = [];
const chatReadMarkers: StoredChatReadMarker[] = [];

/** Every push a request sent, in the order it sent them. */
export const sentPushes: {
    userIds: string[],
    /** The `data` payload — `event`, the `link` a tap follows, and the ids. */
    data: Record<string, string>,
    notification: PushNotification,
    options?: SendPushOptions
}[] = [];

/**
 * Clears every stub's state and re-arms the game store's seam. Call from
 * `beforeEach`, so one test's signed-in user or seeded game can't reach the
 * next one.
 */
export async function resetApiRouteStubs() {
    mongo = await import('@/utils/mongodb/mongodb');
    gameData = await import('@/utils/mongodb/GameData');
    chatMessageData = await import('@/utils/mongodb/ChatMessageData');
    chatReadData = await import('@/utils/mongodb/ChatReadData');
    nextServer = await import('next/server');

    signedInUserId = null;
    clerkUsers = [];
    metadataWrites.length = 0;
    mintedSignInTokens.length = 0;
    games.clear();
    chatMessages.length = 0;
    chatReadMarkers.length = 0;
    clearAfterCallbacks();
    sentPushes.length = 0;
    vi.spyOn(gameData.GameDataModel, 'findOne').mockImplementation(findOneFromStore as GameData['GameDataModel']['findOne']);
    vi.spyOn(gameData.GameDataModel, 'find').mockImplementation(findManyFromStore as GameData['GameDataModel']['find']);
    vi.spyOn(chatMessageData.ChatMessageModel, 'find').mockImplementation(findChatFromStore as typeof chatMessageData.ChatMessageModel.find);
    vi.spyOn(chatMessageData.ChatMessageModel, 'aggregate').mockImplementation(aggregateChatFromStore as unknown as typeof chatMessageData.ChatMessageModel.aggregate);
    // new ChatMessageModel(...).save() lands in the store, so the chat route's
    // POST writes somewhere a later GET (or a test) can read it back.
    vi.spyOn(chatMessageData.ChatMessageModel.prototype, 'save').mockImplementation(saveChatToStore);
    vi.spyOn(chatReadData.ChatReadModel, 'findOne').mockImplementation(findOneChatReadFromStore as typeof chatReadData.ChatReadModel.findOne);
    vi.spyOn(chatReadData.ChatReadModel, 'find').mockImplementation(findManyChatReadFromStore as typeof chatReadData.ChatReadModel.find);
    vi.spyOn(chatReadData.ChatReadModel, 'findOneAndUpdate').mockImplementation(findOneAndUpdateChatReadFromStore as typeof chatReadData.ChatReadModel.findOneAndUpdate);
}

// ---------------------------------------------------------------- Clerk

/**
 * The metadata writes routes made this test, oldest first — for asserting what
 * a route stored without reaching back into the stubbed user.
 */
export const metadataWrites: { userId: string, publicMetadata?: Record<string, unknown> }[] = [];

/**
 * The Clerk sign-in tokens routes minted this test, oldest first — a ticket is
 * a way into an account, so what a route minted and for whom is the assertion
 * worth having (see the guest resume link, docs/admin-tools.md).
 */
export const mintedSignInTokens: { userId: string, expiresInSeconds?: number }[] = [];

/** The `@clerk/nextjs/server` a route sees. Pass to `vi.mock`. */
export function clerkStub() {
    return {
        auth: async () => ({ userId: signedInUserId }),
        currentUser: async () => clerkUsers.find(user => user.id === signedInUserId) ?? null,
        clerkClient: async () => ({
            users: {
                // The real thing's filter behaviour, which utils/users/clerk.ts
                // is written around: a filter selects, and paging is the
                // caller's job (see usersByFilter).
                getUserList: async ({ userId, username, limit = 10, offset = 0 }: {
                    userId?: string[], username?: string[], limit?: number, offset?: number
                }) => {
                    const selected = clerkUsers.filter(user =>
                        (!userId || userId.includes(user.id)) &&
                        (!username || (!!user.username && username.includes(user.username))));
                    // Sliced to the limit, because the bug in finding 1 was a
                    // caller not passing one — a stub that answers with more
                    // than Clerk would is wrong in the direction that hides it.
                    return { data: selected.slice(offset, offset + limit) };
                },
                // Merges the bag's top-level keys and treats a null value as
                // "remove this key" — enough to catch a route clobbering
                // `guest` or `unlocked` on its way past, which a stub that
                // replaced the whole bag would let through. Clerk itself merges
                // at every depth, so a route that ever writes a nested object
                // needs more than this before its test means anything.
                updateUserMetadata: async (userId: string, params: { publicMetadata?: Record<string, unknown> }) => {
                    const user = clerkUsers.find(known => known.id === userId);
                    if (!user) throw new Error(`updateUserMetadata: no such user ${userId}`);
                    metadataWrites.push({ userId, ...params });
                    if (params.publicMetadata) {
                        const merged: Record<string, unknown> = { ...user.publicMetadata };
                        for (const [key, value] of Object.entries(params.publicMetadata)) {
                            if (value === null) delete merged[key];
                            else merged[key] = value;
                        }
                        (user as { publicMetadata: Record<string, unknown> }).publicMetadata = merged;
                    }
                    return user;
                }
            },
            signInTokens: {
                createSignInToken: async ({ userId, expiresInSeconds }: { userId: string, expiresInSeconds?: number }) => {
                    mintedSignInTokens.push({ userId, expiresInSeconds });
                    // Shaped like the real token only in being opaque and
                    // per-user: a test asserts which account a link signs in,
                    // which is the whole of what it can check from outside.
                    return { token: `ticket_${userId}_${mintedSignInTokens.length}` };
                }
            }
        })
    };
}

/**
 * Two players to hand a route, so a test that only needs "somebody" and
 * "somebody else" doesn't invent them again. Spread to vary a field:
 * `{ ...ANN, publicMetadata: { unlocked: true } }`.
 */
export const ANN = { id: 'user_ann', username: 'ann' };
export const BOB = { id: 'user_bob', username: 'bob' };

/**
 * Who Clerk says is making the request, and who else it knows about. A user
 * only needs the fields the code under test reads — `id`, a `username`, and
 * whatever `publicMetadata` the gate being tested looks at.
 */
export function signIn(user: Partial<User> & { id: string }) {
    stubClerkUsers(user);
    signedInUserId = user.id;
}

/**
 * Signed in, but Clerk can't resolve them — an outage, a rate limit, or an
 * account deleted mid-session. Routes that name the caller have to cope with
 * this rather than fail the write they were actually asked to do.
 */
export function signInUnresolvable(userId: string) {
    signedInUserId = userId;
}

/** Users Clerk can resolve, without signing any of them in. */
export function stubClerkUsers(...users: (Partial<User> & { id: string })[]) {
    for (const user of users) {
        if (!clerkUsers.some(known => known.id === user.id)) {
            // A real Clerk user always has publicMetadata, and the gates read
            // it without checking (isUnlockedUser, unclaimedGuestsOf) — so a
            // stub without one fails where a real user wouldn't.
            clerkUsers.push({ publicMetadata: {}, ...user } as User);
        }
    }
}

// ---------------------------------------------------------------- Mongo

/** `@/utils/mongodb/mongodb` with the connection stubbed out. Pass to `vi.mock`. */
export async function mongodbStub() {
    const actual = await vi.importActual<typeof import('@/utils/mongodb/mongodb')>('@/utils/mongodb/mongodb');
    return { ...actual, dbConnect: vi.fn(async () => undefined) };
}

/** `@/utils/firebase/pushNotification` with the send recorded, not sent. Pass to `vi.mock`. */
export async function pushNotificationStub() {
    const actual = await vi.importActual<typeof import('@/utils/firebase/pushNotification')>('@/utils/firebase/pushNotification');
    return {
        ...actual,
        sendPushToUsers: vi.fn(async (users: User[], data: Record<string, string>, notification: PushNotification, options?: SendPushOptions) => {
            sentPushes.push({ userIds: users.map(user => user.id), data, notification, options });
            // The real one answers how many devices it reached, and a route can
            // branch on that (/api/notificationtest reports it to the player),
            // so the stub counts the stored tokens rather than answering
            // undefined and making every such route look like it sent nothing.
            return users.reduce((reached, user) =>
                reached + ((user.privateMetadata?.notificationTokens as unknown[] | undefined)?.length ?? 0), 0);
        })
    };
}

/**
 * `@/utils/rateLimit` with the limiter always allowing. Pass to `vi.mock`.
 *
 * It is a Mongo write of its own (see RateLimitData) and it runs before the
 * body check on the one public route, so a route test can't get past it — and
 * what it counts has its own tests in rateLimit.test.ts.
 */
export async function rateLimitStub() {
    const actual = await vi.importActual<typeof import('@/utils/rateLimit')>('@/utils/rateLimit');
    return { ...actual, consumeRateLimit: vi.fn(async () => true) };
}

/**
 * A value as the database would hold it: plain, and with Maps flattened to the
 * objects BSON stores them as. Hydrating casts them back, so a saved game comes
 * back to the next request the way a real one would.
 */
function asStored(value: Record<string, unknown>): StoredGame {
    return JSON.parse(JSON.stringify(value)) as StoredGame;
}

/** Puts a game in the store, as if it had been created earlier. */
export function seedGame(game: Record<string, unknown> & { gameId: string }) {
    games.set(game.gameId, asStored({ __v: 0, _id: new mongoose.Types.ObjectId().toString(), ...game }));
}

/** Where the two players start in the game below, unless a test cares. */
export const SQUARES = { [ANN.id]: 10, [BOB.id]: 20 };

/**
 * A Snakes & Ladders game part-way through, with Ann to play — the stand-in
 * for "a live game" wherever a test needs one and doesn't care which game it
 * is. It's the simplest game in the app: one command, no hidden state, and a
 * win is a player past square 100.
 */
export function seedSnakesAndLadders(
    overrides: Record<string, unknown> = {},
    squares: Record<string, number> = SQUARES
) {
    seedGame({
        gameId: 'game_1',
        gameType: {
            gameId: 'gametype_1', gameType: 'SnakesAndLadders', friendlyName: 'Snakes and Ladders',
            icon: '', url: 'snakesandladders', className: 'SnakesAndLaddersGameType'
        },
        kind: 'SnakesAndLaddersGameData',
        userIdList: [ANN.id, BOB.id],
        turnTimer: '1 day',
        currentTurn: ANN.id,
        lastTurnTimestamp: '2026-01-01T00:00:00.000Z',
        timerWarningNotificationSent: true,
        gameState: { turnOrder: [ANN.id, BOB.id], history: [], commandHistory: [] },
        complete: false,
        winner: '',
        specificGameState: {
            playerPositions: Object.fromEntries(Object.entries(squares)
                .map(([userId, position]) => [userId, { position, laddersClimbed: 0, snakesHit: 0 }])),
            hasRolled: false,
            reRollOnSix: false
        },
        ...overrides
    });
}

/** The game as the store now holds it — what a later request would read. */
export function storedGame(gameId: string): StoredGame | undefined {
    return games.get(gameId);
}

/**
 * The game as a request would find it: a real document of the game's own
 * discriminator model, freshly hydrated from what the store holds.
 *
 * Fresh every lookup, so two requests against one game hold separate copies
 * and race the way two real requests do — which is what the version check in
 * `save` below is there to settle.
 */
function hydrate(stored: StoredGame): IGameDataDocument {
    const gameType = (stored.gameType as { gameType?: string } | undefined)?.gameType;
    const model = gameType ? mongo.gameDataModelFor(gameType) : undefined;
    if (!model) {
        throw new Error(`Seeded game ${stored.gameId} has no registered gameType ('${gameType}')`);
    }

    const document = model.hydrate(asStored(stored)) as IGameDataDocument;
    // The one write path a game route has (trySave), standing in for the
    // driver: the schema sets optimisticConcurrency, so a save asserts the
    // version it loaded and bumps it, and the loser of a race gets the
    // VersionError trySave turns into a 409.
    document.save = (async () => {
        const current = games.get(document.gameId);
        if (!current || current.__v !== document.get('__v')) {
            throw new mongoose.Error.VersionError(document, current?.__v ?? -1, []);
        }
        const version = current.__v + 1;
        document.set('__v', version);
        games.set(document.gameId, asStored({ ...document.toObject({ flattenMaps: true }), __v: version }));
        return document;
    }) as IGameDataDocument['save'];
    return document;
}

function findOneFromStore(filter: Record<string, unknown>) {
    const gameId = filter?.gameId;
    if (typeof gameId !== 'string' || Object.keys(filter).length !== 1) {
        throw new Error(`The test game store only looks games up by gameId, not ${JSON.stringify(filter)}`);
    }
    const stored = games.get(gameId);
    // Enough of a Query for the callers, which all end in .exec().
    return { exec: async () => (stored ? hydrate(stored) : null) };
}

// The dashboard's one query over the whole game store: every live game a
// player is in — find({ userIdList: userId, complete: false }).exec().
function findManyFromStore(filter: Record<string, unknown>) {
    const userId = filter?.userIdList;
    const complete = filter?.complete;
    if (typeof userId !== 'string' || typeof complete !== 'boolean' || Object.keys(filter).length !== 2) {
        throw new Error(`The test game store only searches many by userIdList and complete, not ${JSON.stringify(filter)}`);
    }
    const matches = [...games.values()].filter(stored =>
        (stored.userIdList as string[]).includes(userId) && stored.complete === complete);
    return { exec: async () => matches.map(hydrate) };
}

// ---------------------------------------------------------------- Chat

/** Puts a message in the chat store, as if it had been posted earlier. */
export function seedChatMessage(message: StoredChatMessage) {
    chatMessages.push(message);
}

/** The chat messages the store now holds for a game, oldest-first — what a
 *  later request (or a test) would read. */
export function storedChatMessages(gameId: string): StoredChatMessage[] {
    return chatMessages.filter(message => message.gameId === gameId);
}

// The one read the chat route makes: find({ gameId }).sort({ timestamp: -1 })
// .limit(N).exec(), optionally narrowed to find({ gameId, timestamp: { $lt } })
// for a `before` page (docs/in-game-chat.md §13.7 commit 5). A chainable
// stand-in for a Query, honouring the sort and limit the route asks for so the
// "newest N, then reversed" slice is real.
function findChatFromStore(filter: Record<string, unknown>) {
    const gameId = filter?.gameId;
    const timestampFilter = filter?.timestamp as { $lt?: string } | undefined;
    const keys = Object.keys(filter);
    const shape = keys.length === 1 && keys[0] === 'gameId'
        || keys.length === 2 && keys.includes('gameId') && keys.includes('timestamp')
            && typeof timestampFilter === 'object' && timestampFilter !== null
            && Object.keys(timestampFilter).length === 1 && typeof timestampFilter.$lt === 'string';
    if (typeof gameId !== 'string' || !shape) {
        throw new Error(`The test chat store only looks messages up by gameId (and an optional timestamp $lt), not ${JSON.stringify(filter)}`);
    }
    let results = chatMessages.filter(message => message.gameId === gameId
        && (timestampFilter === undefined || message.timestamp < timestampFilter.$lt!));
    const query = {
        // Honours each sort key in order, so a tiebreaker (the route sorts
        // { timestamp: -1, messageId: -1 }) is exercised, not silently dropped.
        // JS's own sort is stable, Mongo's is not, so a test that seeds a tie
        // and asserts an order is only meaningful because the tiebreaker settles
        // it here the way the index does in production.
        sort: (spec: Record<string, 1 | -1>) => {
            const keys = Object.entries(spec);
            results = [...results].sort((a, b) => {
                for (const [key, direction] of keys) {
                    const left = (a as Record<string, string>)[key];
                    const right = (b as Record<string, string>)[key];
                    if (left < right) return -direction;
                    if (left > right) return direction;
                }
                return 0;
            });
            return query;
        },
        limit: (count: number) => {
            results = results.slice(0, count);
            return query;
        },
        // Hydrated the way the game store hydrates a game — real documents of
        // the model, so the route reads a UUID `messageId` back the way a real
        // one would, not the plain string the store keeps for easy assertions.
        exec: async () => results.map(message => chatMessageData.ChatMessageModel.hydrate(message)),
    };
    return query;
}

// The dashboard's unread count: one aggregate over every live game at once
// (docs/in-game-chat.md §13.5) — a $match of one $or clause per game, then a
// $group by gameId. This interprets exactly that pipeline shape rather than a
// general aggregation engine, the same trade findChatFromStore above already
// makes for find().
function aggregateChatFromStore(pipeline: Record<string, unknown>[]) {
    const match = pipeline[0]?.$match as { $or?: Record<string, unknown>[] } | undefined;
    const clauses = match?.$or;
    if (!Array.isArray(clauses) || pipeline.length !== 2) {
        throw new Error(`The test chat store only aggregates a one-$match-one-$group pipeline, not ${JSON.stringify(pipeline)}`);
    }
    const counts: { _id: string, count: number }[] = [];
    for (const clause of clauses) {
        const gameId = clause.gameId as string;
        const excludedSender = (clause.senderId as { $ne?: string } | undefined)?.$ne;
        const after = (clause.timestamp as { $gt?: string } | undefined)?.$gt;
        const count = chatMessages.filter(message =>
            message.gameId === gameId &&
            (excludedSender === undefined || message.senderId !== excludedSender) &&
            (after === undefined || message.timestamp > after)
        ).length;
        // $group only ever emits a row for a gameId that had at least one
        // matching message — mirrored here so a fully-read game is absent
        // from the map rather than present at zero.
        if (count > 0) {
            counts.push({ _id: gameId, count });
        }
    }
    return Promise.resolve(counts);
}

// new ChatMessageModel(...).save(): flatten the document down to what the
// collection stores (a string messageId, whatever the schema cast it to) and
// keep it. `this` is the document, so this must stay a plain function.
function saveChatToStore(this: import('@/utils/mongodb/ChatMessageData').IChatMessageDataDocument) {
    chatMessages.push({
        messageId: String(this.messageId),
        gameId: this.gameId,
        senderId: this.senderId,
        text: this.text,
        timestamp: this.timestamp,
    });
    return Promise.resolve(this);
}

// ---------------------------------------------------------------- Chat read markers

/** Puts a read marker in the store, as if a player had already read up to it. */
export function seedChatReadMarker(marker: StoredChatReadMarker) {
    chatReadMarkers.push(marker);
}

/** One player's marker for one game, as a later request would read it. */
export function storedChatReadMarker(gameId: string, userId: string): string | undefined {
    return chatReadMarkers.find(marker => marker.gameId === gameId && marker.userId === userId)?.readAt;
}

// The one read the read-marker route and the chat GET make: this player, this
// game — served by the { gameId: 1, userId: 1 } unique index in production.
function findOneChatReadFromStore(filter: Record<string, unknown>) {
    const gameId = filter?.gameId;
    const userId = filter?.userId;
    if (typeof gameId !== 'string' || typeof userId !== 'string' || Object.keys(filter).length !== 2) {
        throw new Error(`The test chat-read store only looks markers up by gameId and userId, not ${JSON.stringify(filter)}`);
    }
    const found = chatReadMarkers.find(marker => marker.gameId === gameId && marker.userId === userId);
    return { exec: async () => (found ? chatReadData.ChatReadModel.hydrate(found) : null) };
}

// The dashboard's other read: every marker one player holds, across every
// game — find({ userId }).exec(), served by the { userId: 1 } index.
function findManyChatReadFromStore(filter: Record<string, unknown>) {
    const userId = filter?.userId;
    if (typeof userId !== 'string' || Object.keys(filter).length !== 1) {
        throw new Error(`The test chat-read store only searches many by userId, not ${JSON.stringify(filter)}`);
    }
    const matches = chatReadMarkers.filter(marker => marker.userId === userId);
    return { exec: async () => matches.map(marker => chatReadData.ChatReadModel.hydrate(marker)) };
}

// findOneAndUpdate({ gameId, userId }, { $max: { readAt } }, { upsert: true }):
// the one write the read-marker route makes. Applies $max the way Mongo does —
// a lexical comparison, which for ISO-8601 is chronological — so the "never
// moves backwards" behaviour the route relies on is real here too, not assumed.
function findOneAndUpdateChatReadFromStore(
    filter: Record<string, unknown>,
    update: { $max?: { readAt?: string } },
    options?: { upsert?: boolean }
) {
    return {
        exec: async () => {
            const gameId = filter?.gameId;
            const userId = filter?.userId;
            if (typeof gameId !== 'string' || typeof userId !== 'string') {
                throw new Error(`The test chat-read store only updates markers by gameId and userId, not ${JSON.stringify(filter)}`);
            }
            const readAt = update.$max?.readAt;
            let marker = chatReadMarkers.find(m => m.gameId === gameId && m.userId === userId);
            if (!marker) {
                if (!options?.upsert) {
                    return null;
                }
                marker = { gameId, userId, readAt: readAt! };
                chatReadMarkers.push(marker);
            } else if (readAt !== undefined && readAt > marker.readAt) {
                marker.readAt = readAt;
            }
            return chatReadData.ChatReadModel.hydrate(marker);
        }
    };
}

// ---------------------------------------------------------------- Requests

/** A GET of `path`, query string and all — for a route that reads its own
 *  `nextUrl.searchParams`. */
export function get(path: string): NextRequest {
    return new nextServer.NextRequest(`https://async.games${path}`);
}

/** A POST of `body` as JSON, the way the client sends one. */
export function jsonPost(path: string, body: unknown): NextRequest {
    return rawPost(path, JSON.stringify(body));
}

/** A POST of exactly `body`, for the bodies that aren't JSON at all. */
export function rawPost(path: string, body: string): NextRequest {
    return new nextServer.NextRequest(`https://async.games${path}`, { method: 'POST', body });
}
