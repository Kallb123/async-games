// The server's short memory of how other players are shown — the cache behind
// clerk.ts's directory-shaped resolvers (docs/loading-performance-plan.md,
// "Cache the player directory on the server").
//
// Server-only, like clerk.ts, which is its one reader: a module-level Map is
// per process and, on a client, would be shared by nothing.
//
// This is the first of two tiers. It is per process, so on a new serverless
// instance (nearly every first request of a screen) it is empty; the second
// tier, sharedDirectory.ts, keeps the same records in the database for every
// instance to read. What follows is about this one, and the tier behind it
// holds exactly the same thing under the same rule.
//
// What it holds is a *display record* — the three things a name, a tag and a
// picture are drawn from — and never the Clerk `User` it came from. A user
// carries private metadata (device tokens, preferences, unlock flags), email
// addresses and more, none of which a name lookup has any use for, so none of
// it is kept: the record type below is the whole of what can be stored, and
// the unit test pins that a user carrying the rest leaves none of it behind —
// here, and in the document the shared tier writes.

import { forgetSharedUser, type ForgetReason } from '@/utils/users/sharedDirectory';

/** The display fields of one player, already derived from their Clerk user. */
export interface DirectoryRecord {
    id: string;
    /** The name they are shown under, before any collision tag. */
    name: string;
    /** The handle that tells two of the same name apart; null for a guest. */
    handle: string | null;
    /** Their real picture, or null for none (see profileImageUrl). */
    imageUrl: string | null;
}

/**
 * How long an entry is believed outright. The documented freshness target for
 * a rename or a new picture reaching the other players at a table; our own
 * rename and claim routes drop the entry sooner (`forgetCachedUser`), but a
 * picture is changed through Clerk directly and only this bounds it.
 */
export const DIRECTORY_TTL_MS = 5 * 60 * 1000;

/**
 * How long an entry may still be served once it is past `DIRECTORY_TTL_MS`,
 * while it is refreshed behind the response (`clerk.ts`). A player coming back
 * after a quarter of an hour away would otherwise find every name expired and
 * wait on Clerk for all of them, which the 2026-10-19 checkpoint measured at
 * about 245 ms on nearly every first request. Past this an entry is only a
 * fallback for a Clerk that is down or slow, as before.
 */
export const DIRECTORY_MAX_AGE_MS = 15 * 60 * 1000;

/**
 * A shorter life for "Clerk doesn't know this id". Worth remembering at all
 * because a deleted account stays on every finished game it played, and
 * without it each of those would send the whole lookup back to Clerk on every
 * request, which is the cost this cache exists to remove. Short because an id
 * that missed a moment ago may only have been Clerk catching up. (The shared
 * tier believes the same thing for a day, for the reason given beside
 * `SHARED_KNOWN_MISSING_MS`.)
 */
export const DIRECTORY_MISS_TTL_MS = 30 * 1000;

/** The bound on one process's memory for this, least recently used out first. */
export const DIRECTORY_MAX_ENTRIES = 2000;

interface Entry {
    /** Null for an id Clerk had no user for. */
    record: DirectoryRecord | null;
    /** Believed outright until this; served while it is refreshed until `expiresAt`. */
    staleAt: number;
    expiresAt: number;
}

/**
 * How far an entry is through its life: believed (`fresh`), served while it is
 * refreshed (`stale`), or only good for a bad day (`expired`).
 */
export type DirectoryEntryState = 'fresh' | 'stale' | 'expired';

// A Map iterates in insertion order, so the first key is always the least
// recently used one provided every use re-inserts: see `touch`.
const entries = new Map<string, Entry>();

// When each recently forgotten id was forgotten, on a counter that only goes
// up. A lookup notes the counter before it asks Clerk (`lookupStarted`), and
// what it hears back about an id forgotten since then is not kept: Clerk may
// have answered from before the rename that forgot it, and keeping that answer
// would undo the rename here for a whole TTL. Bounded like the entries; losing
// the oldest only matters to a lookup still in flight when it is dropped.
let forgets = 0;
const forgottenAt = new Map<string, number>();

function touch(id: string, entry: Entry) {
    entries.delete(id);
    entries.set(id, entry);
}

/**
 * What is held for an id, expired or not, and how far through its life it is:
 * the caller decides what each state is good for. `undefined` is "nothing
 * held". A look counts as a use only while the entry may be served, so an
 * expired entry kept for a bad day doesn't stay young by being asked about.
 */
export function cachedUser(id: string): { record: DirectoryRecord | null; state: DirectoryEntryState } | undefined {
    const entry = entries.get(id);
    if (!entry) return undefined;
    const now = Date.now();
    const state = entry.staleAt > now ? 'fresh' : entry.expiresAt > now ? 'stale' : 'expired';
    if (state !== 'expired') touch(id, entry);
    return { record: entry.record, state };
}

/** Taken just before a Clerk lookup, and handed back to `rememberUsers` with its answer. */
export function lookupStarted(): number {
    return forgets;
}

/**
 * Remembers what Clerk answered for a set of ids it was asked about: a record
 * for each one it returned, and a miss for each it did not — except for an id
 * forgotten since the lookup `started`, whose answer may predate the change.
 */
export function rememberUsers(askedFor: string[], found: DirectoryRecord[], started: number) {
    const now = Date.now();
    const byId = new Map(found.map(record => [record.id, record]));
    for (const id of askedFor) {
        if ((forgottenAt.get(id) ?? -1) >= started) continue;
        const record = byId.get(id) ?? null;
        // A miss has no stale life: an id Clerk didn't know is asked about again
        // as soon as the short memory of it lapses.
        touch(id, record
            ? { record, staleAt: now + DIRECTORY_TTL_MS, expiresAt: now + DIRECTORY_MAX_AGE_MS }
            : { record, staleAt: now + DIRECTORY_MISS_TTL_MS, expiresAt: now + DIRECTORY_MISS_TTL_MS });
    }
    trim();
}

/**
 * Remembers records the shared tier served, each as old as Clerk's answer for
 * it was rather than as of now: a copy that was four minutes old when it was
 * read is believed for one more, not five. One forgotten since the read
 * `started` is not kept, as in `rememberUsers`: the row read may have been
 * written before the change.
 */
export function rememberSharedUsers(shared: { record: DirectoryRecord; fetchedAt: number }[], started: number) {
    for (const { record, fetchedAt } of shared) {
        if ((forgottenAt.get(record.id) ?? -1) >= started) continue;
        touch(record.id, { record, staleAt: fetchedAt + DIRECTORY_TTL_MS, expiresAt: fetchedAt + DIRECTORY_MAX_AGE_MS });
    }
    trim();
}

function trim() {
    while (entries.size > DIRECTORY_MAX_ENTRIES) {
        const oldest = entries.keys().next();
        if (oldest.done) break;
        entries.delete(oldest.value);
    }
}

/**
 * Drops one player from both tiers, for the routes that change how they are
 * shown (a rename, a claim, a deletion) to await once their write has landed.
 * Memory is dropped at once and for this process only; the shared tier is what
 * reaches the other instances, so a change shows everywhere on the next lookup
 * rather than after the TTL. `'deleted'` also removes the shared row, which is
 * a person's data, rather than leaving an invalidation marker.
 *
 * Never rejects: the caller's write has landed and must not fail because the
 * cache couldn't be told. If the shared tier can't be reached, other instances
 * keep their copy until it ages out, which is all they had before it existed.
 */
export async function forgetCachedUser(userId: string, reason: ForgetReason = 'changed'): Promise<void> {
    entries.delete(userId);
    forgottenAt.delete(userId);
    forgottenAt.set(userId, forgets++);
    if (forgottenAt.size > DIRECTORY_MAX_ENTRIES) forgottenAt.delete(forgottenAt.keys().next().value!);
    await forgetSharedUser(userId, reason);
}

/** Test seam: start from an empty cache. */
export function __resetDirectoryCacheForTests() {
    entries.clear();
    forgottenAt.clear();
}

/** Test seam: everything held, so a test can inspect exactly what is stored. */
export function __heldDirectoryEntriesForTests(): [string, DirectoryRecord | null][] {
    return [...entries].map(([id, entry]) => [id, entry.record]);
}
