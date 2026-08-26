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
let nextServer: typeof import('next/server');

/** A stored game, as the database would hold it: plain, with a version. */
type StoredGame = Record<string, unknown> & { gameId: string, __v: number };

let signedInUserId: string | null = null;
let clerkUsers: User[] = [];
const games = new Map<string, StoredGame>();

/** Every push a request sent, in the order it sent them. */
export const sentPushes: { userIds: string[], notification: PushNotification, options?: SendPushOptions }[] = [];

/**
 * Clears every stub's state and re-arms the game store's seam. Call from
 * `beforeEach`, so one test's signed-in user or seeded game can't reach the
 * next one.
 */
export async function resetApiRouteStubs() {
    mongo = await import('@/utils/mongodb/mongodb');
    gameData = await import('@/utils/mongodb/GameData');
    nextServer = await import('next/server');

    signedInUserId = null;
    clerkUsers = [];
    games.clear();
    clearAfterCallbacks();
    sentPushes.length = 0;
    vi.spyOn(gameData.GameDataModel, 'findOne').mockImplementation(findOneFromStore as GameData['GameDataModel']['findOne']);
}

// ---------------------------------------------------------------- Clerk

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
        sendPushToUsers: vi.fn(async (users: User[], _data: unknown, notification: PushNotification, options?: SendPushOptions) => {
            sentPushes.push({ userIds: users.map(user => user.id), notification, options });
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

// ---------------------------------------------------------------- Requests

/** A POST of `body` as JSON, the way the client sends one. */
export function jsonPost(path: string, body: unknown): NextRequest {
    return rawPost(path, JSON.stringify(body));
}

/** A POST of exactly `body`, for the bodies that aren't JSON at all. */
export function rawPost(path: string, body: string): NextRequest {
    return new nextServer.NextRequest(`https://async.games${path}`, { method: 'POST', body });
}
