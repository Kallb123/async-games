import { describe, expect, it, vi } from "vitest";

import { withTimeout } from "./withTimeout";

/** Resolves with `value` after `ms`. */
const slow = <T>(value: T, ms: number) => () => new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));

describe("withTimeout", () => {
    it("answers with the work when it finishes in time", async () => {
        await expect(withTimeout(slow('done', 1), 500, 'gave up', 'test')).resolves.toBe('done');
    });

    it("answers with the fallback when the work takes too long", async () => {
        await expect(withTimeout(slow('done', 500), 1, 'gave up', 'test')).resolves.toBe('gave up');
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
