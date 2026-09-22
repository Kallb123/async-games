import type { Document } from 'mongoose';
import { generateJoinCode } from '@/utils/games/joinCode';
import { isDuplicateKeyError } from '@/utils/mongodb/duplicateKey';

// A generated code collides with a live lobby's about 1-in-234k of the time
// (docs/account-less-play.md §4), so a handful of retries is already many
// times more headroom than the collision odds need.
const MAX_JOIN_CODE_ATTEMPTS = 5;

/**
 * Saves a freshly built lobby invitation under a fresh join code, retrying
 * with a new code on a collision. `build` is handed each attempt's code and
 * returns a new, unsaved document carrying it.
 *
 * The partial unique index on `joinCode` is the arbiter — no coordination,
 * no counter, just try again with a fresh code (docs/account-less-play.md §4).
 * Shared by every route that opens a join-by-code lobby, so the retry lives
 * once.
 */
export async function saveWithFreshJoinCode<T extends Document>(build: (joinCode: string) => T): Promise<T> {
    for (let attempt = 0; ; attempt++) {
        const candidate = build(generateJoinCode());
        try {
            await candidate.save();
            return candidate;
        } catch (err) {
            if (!isDuplicateKeyError(err) || attempt >= MAX_JOIN_CODE_ATTEMPTS - 1) {
                throw err;
            }
        }
    }
}
