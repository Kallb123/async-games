// The two rules auto-play and "replay from your last turn" hang on, without a
// React tree or a timer: where a replay starts, and how long a step may rest.

import { describe, expect, it } from "vitest";
import { DEFAULT_STEP_DURATION_MS, playbackDelay, replayStartIndex } from "./useTurnNavigation";

const by = (senderId: string | null) => ({
    command: senderId ? { senderId, senderUsername: senderId, timestamp: "", summary: "" } : null,
});

describe("replayStartIndex", () => {
    it("starts one step before the viewer's last command, so that command plays first", () => {
        // 0 is the opening position; steps 1-4 are commands by a, b, a, b.
        const snapshots = [by(null), by("a"), by("b"), by("a"), by("b")];
        expect(replayStartIndex(snapshots, 4, "a")).toBe(2);
        expect(replayStartIndex(snapshots, 4, "b")).toBe(3);
    });

    it("clamps at the opening position when the last command is the first step", () => {
        expect(replayStartIndex([by(null), by("a"), by("b")], 2, "a")).toBe(0);
    });

    it("ignores planned steps beyond the live position", () => {
        const snapshots = [by(null), by("a"), by("b"), by("a")];
        expect(replayStartIndex(snapshots, 2, "a")).toBe(0);
    });

    it("falls back to the step before the present for a viewer with no command", () => {
        const snapshots = [by(null), by("a"), by("b"), by("a")];
        expect(replayStartIndex(snapshots, 3, "nobody")).toBe(2);
    });

    it("never goes below zero on a game with nothing played", () => {
        expect(replayStartIndex([by(null)], 0, "a")).toBe(0);
        expect(replayStartIndex([], 0, "a")).toBe(0);
    });
});

describe("playbackDelay", () => {
    it("trusts a usable duration", () => {
        expect(playbackDelay(0)).toBe(0);
        expect(playbackDelay(2400)).toBe(2400);
    });

    it("falls back when the game gives nothing it can use", () => {
        expect(playbackDelay(undefined)).toBe(DEFAULT_STEP_DURATION_MS);
        expect(playbackDelay(NaN)).toBe(DEFAULT_STEP_DURATION_MS);
        expect(playbackDelay(-5)).toBe(DEFAULT_STEP_DURATION_MS);
        expect(playbackDelay(Infinity)).toBe(DEFAULT_STEP_DURATION_MS);
    });
});
