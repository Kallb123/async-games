import { describe, expect, it } from "vitest";

import { MAX_DEVICES_PER_USER, pruneStaleTokens } from "./deviceInfo";
import type TimedToken from "./TimedToken";

function device(index: number, daysAgo: number): TimedToken {
    const at = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();
    return { token: `token_${index}`, timestamp: at, lastSeen: at };
}

describe("device registration cap", () => {
    it("leaves a list under the cap alone", () => {
        const tokens = Array.from({ length: 5 }, (_, i) => device(i, i));
        expect(pruneStaleTokens(tokens)).toHaveLength(5);
    });

    it("keeps the most recently seen once over the cap", () => {
        // Clerk private metadata is capped at 8KB for the whole object, and a
        // registration is a ~160-character token plus a device description.
        // Past the ceiling the metadata *write* fails, so the symptom is not a
        // stale phone but a device that can never register again.
        const tokens = Array.from({ length: MAX_DEVICES_PER_USER + 12 }, (_, i) => device(i, i));

        const kept = pruneStaleTokens(tokens);

        expect(kept).toHaveLength(MAX_DEVICES_PER_USER);
        // device(0) is today, device(1) yesterday, and so on — so the newest
        // survive and the oldest go.
        expect(kept.map(t => t.token)).toEqual(
            Array.from({ length: MAX_DEVICES_PER_USER }, (_, i) => `token_${i}`)
        );
    });

    it("drops stale registrations before the cap is reached", () => {
        const kept = pruneStaleTokens([device(0, 1), device(1, 400), device(2, 2)]);
        expect(kept.map(t => t.token)).toEqual(["token_0", "token_2"]);
    });
});
