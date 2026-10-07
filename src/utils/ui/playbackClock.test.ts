// The one clock a playback runs on: paused, resumed, sped up, skipped, and
// over at its end — driven by a hand-wound `now`, without a frame loop.

import { describe, expect, it } from "vitest";
import { PlaybackClock } from "./playbackClock";

/** A clock on a time the test moves by hand. */
function wound(end: number) {
    let time = 1000;
    const clock = new PlaybackClock(end, () => time);
    return { clock, pass: (ms: number) => { time += ms; } };
}

describe("PlaybackClock", () => {
    it("starts paused at nothing, and stands still until resumed", () => {
        const { clock, pass } = wound(500);
        pass(200);
        expect(clock.ms).toBe(0);
        expect(clock.running).toBe(false);
        clock.resume();
        pass(200);
        expect(clock.ms).toBe(200);
    });

    it("carries on from where it was paused, however long the pause", () => {
        const { clock, pass } = wound(500);
        clock.resume();
        pass(100);
        clock.pause();
        pass(10_000);
        expect(clock.ms).toBe(100);
        clock.resume();
        pass(50);
        expect(clock.ms).toBe(150);
    });

    it("stops at its end, and says it has ended", () => {
        const { clock, pass } = wound(500);
        clock.resume();
        pass(499);
        expect(clock.ended).toBe(false);
        pass(10);
        expect(clock.ms).toBe(500);
        expect(clock.ended).toBe(true);
    });

    it("plays at a new speed from the moment it's set", () => {
        const { clock, pass } = wound(1000);
        clock.resume();
        pass(100);
        clock.setSpeed(2);
        pass(100);
        expect(clock.ms).toBe(300);
    });

    it("skips to a moment, kept within the playback, and runs on from there", () => {
        const { clock, pass } = wound(500);
        clock.resume();
        clock.seek(400);
        pass(50);
        expect(clock.ms).toBe(450);
        clock.seek(9_999);
        expect(clock.ended).toBe(true);
        clock.seek(-5);
        expect(clock.ms).toBe(0);
    });

    it("is over from the start when it lasts nothing", () => {
        expect(new PlaybackClock(0, () => 0).ended).toBe(true);
    });
});
