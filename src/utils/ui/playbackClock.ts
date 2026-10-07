// The clock one playback runs on — an action played over a board — so that
// everything it moves reads the same time (docs/isometric-animations.md §4.1).
// Pure: it reads the time from `now`, which a test can drive, and draws
// nothing. `usePlayback` runs the frame loop over it.

/**
 * Where a playback is, in milliseconds from its start: running, paused,
 * played faster or slower, sent straight to a moment, and over once it has
 * got to `end`. It starts paused, at nothing.
 */
export class PlaybackClock {
    /** The playback's time when it last resumed, or changed speed, or was sent somewhere. */
    private base = 0;
    /** When that was, by `now`; null while paused. */
    private since: number | null = null;
    private rate = 1;

    constructor(readonly end: number, private readonly now: () => number = () => performance.now()) {}

    /** How far into the playback it is: never before its start, never past its end. */
    get ms(): number {
        const run = this.since === null ? this.base : this.base + (this.now() - this.since) * this.rate;
        return Math.min(this.end, Math.max(0, run));
    }

    get running(): boolean {
        return this.since !== null;
    }

    /** It has got to its end. */
    get ended(): boolean {
        return this.ms >= this.end;
    }

    /** Runs on from where it is: also how it starts. */
    resume(): void {
        if (this.since === null) this.since = this.now();
    }

    /** Stands still where it is, until resumed. */
    pause(): void {
        if (this.since === null) return;
        this.base = this.ms;
        this.since = null;
    }

    /** Plays at `rate` times its own pace from here on: 2 for a review at twice the speed. */
    setSpeed(rate: number): void {
        this.mark(this.ms);
        this.rate = rate;
    }

    /** Goes straight to `ms` — its end, to skip what's left — and carries on from there if it was running. */
    seek(ms: number): void {
        this.mark(Math.min(this.end, Math.max(0, ms)));
    }

    private mark(ms: number): void {
        this.base = ms;
        if (this.since !== null) this.since = this.now();
    }
}
