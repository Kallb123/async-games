/**
 * Working out which device registrations FCM has told us are dead. Kept
 * dependency-free (no firebase-admin, no Clerk) so it can be unit-tested on
 * its own; `pushNotification.ts` feeds it a real batch response.
 */

/** One device we're about to push to. */
export interface PushTarget {
    userId: string;
    token: string;
}

/**
 * FCM error codes meaning the token is gone for good — the app was
 * uninstalled, notification permission was revoked, or the token rotated.
 * Everything else FCM can return (quota, network trouble, a malformed
 * payload of ours) is transient or our own fault, and must never cost a
 * player their device registration.
 */
const DEAD_TOKEN_CODES = new Set([
    'messaging/registration-token-not-registered',
    'messaging/invalid-registration-token'
]);

/**
 * Picks the dead tokens out of an FCM batch response, grouped by owner.
 * `results` lines up with `targets` by index — that's the contract
 * `sendEach` gives us, and the reason this is worth testing on its own.
 */
export function deadTokensByUser(
    targets: PushTarget[],
    results: { success: boolean; error?: { code: string } }[]
): Map<string, string[]> {
    const dead = new Map<string, string[]>();

    results.forEach((result, index) => {
        const target = targets[index];
        if (!target || result.success || !result.error) {
            return;
        }
        if (!DEAD_TOKEN_CODES.has(result.error.code)) {
            return;
        }
        dead.set(target.userId, [...(dead.get(target.userId) ?? []), target.token]);
    });

    return dead;
}
