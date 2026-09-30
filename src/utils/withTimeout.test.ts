import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MockInstance } from "vitest";

import { withTimeout } from "./withTimeout";

/** Resolves with `value` after `ms`. */
const slow = <T>(value: T, ms: number) => () => new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));

describe("withTimeout", () => {
    // Giving up is logged, and so is a failure; the tests that cause either
    // keep the output out of the run and, where it matters, read it back.
    let warn: MockInstance<typeof console.warn>;
    let error: MockInstance<typeof console.error>;
    beforeEach(() => {
        warn = vi.spyOn(console, 'warn').mockImplementation(() => { });
        error = vi.spyOn(console, 'error').mockImplementation(() => { });
    });
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("answers with the work when it finishes in time", async () => {
        await expect(withTimeout(slow('done', 1), 500, 'gave up', 'test')).resolves.toBe('done');
    });

    it("answers with the fallback when the work takes too long", async () => {
        await expect(withTimeout(slow('done', 500), 1, 'gave up', 'test')).resolves.toBe('gave up');
    });

    it("says so, naming the work and the budget, when it stops waiting", async () => {
        await withTimeout(slow('done', 500), 1, 'gave up', 'Previewing lobby PLUM');

        expect(warn).toHaveBeenCalledWith('Previewing lobby PLUM still running after 1ms; not waiting for it');
    });

    it("says nothing of giving up when the work finishes in time, or fails, which logs itself", async () => {
        await withTimeout(slow('done', 1), 500, 'gave up', 'test');
        await withTimeout(() => Promise.reject(new Error('nope')), 500, 'gave up', 'test');

        expect(warn).not.toHaveBeenCalled();
        expect(error).toHaveBeenCalledWith('test failed', expect.any(Error));
    });

    it("answers with the fallback when the work fails", async () => {
        const failing = () => Promise.reject(new Error('nope'));
        await expect(withTimeout(failing, 500, 'gave up', 'test')).resolves.toBe('gave up');
    });

    it("answers with the fallback when the work throws before it even starts", async () => {
        const throwing = () => { throw new Error('nope'); };
        await expect(withTimeout(throwing, 500, 'gave up', 'test')).resolves.toBe('gave up');
    });

    it("swallows a failure that arrives after the deadline, rather than leaving it unhandled", async () => {
        const unhandled = vi.fn();
        process.on('unhandledRejection', unhandled);
        const lateFailure = () => new Promise<string>((_, reject) => setTimeout(() => reject(new Error('late')), 10));

        await expect(withTimeout(lateFailure, 1, 'gave up', 'test')).resolves.toBe('gave up');
        // Long enough for the rejection to land and for node to have noticed it
        // had nowhere to go.
        await new Promise((resolve) => setTimeout(resolve, 50));
        process.off('unhandledRejection', unhandled);

        expect(unhandled).not.toHaveBeenCalled();
    });
});
