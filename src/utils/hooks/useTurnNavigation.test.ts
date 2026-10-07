// The two rules auto-play and "replay from your last turn" hang on, without a
// React tree or a timer: where a replay starts, and what a finished step does.

import { describe, expect, it } from "vitest";
import { autoPlayAfter, replayStartIndex } from "./useTurnNavigation";

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

describe("autoPlayAfter", () => {
    const at = (viewIndex: number, currentIndex = 5, playing = true) => ({ playing, viewIndex, currentIndex });

    it("moves on to the next step when the step shown has finished", () => {
        expect(autoPlayAfter(at(2), 2)).toEqual({ playing: true, viewIndex: 3 });
        expect(autoPlayAfter(at(0), 0)).toEqual({ playing: true, viewIndex: 1 });
    });

    it("stops at the live position, once its step has finished too", () => {
        expect(autoPlayAfter(at(5), 5)).toEqual({ playing: false, viewIndex: 5 });
    });

    it("ignores a step that is not the one shown", () => {
        expect(autoPlayAfter(at(2), 1)).toBeNull();
        expect(autoPlayAfter(at(2), 3)).toBeNull();
    });

    it("ignores a step that finishes after auto-play was stopped", () => {
        expect(autoPlayAfter(at(2, 5, false), 2)).toBeNull();
    });
});
