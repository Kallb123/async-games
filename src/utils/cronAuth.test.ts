import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { isAuthorisedCron } from "./cronAuth";

function cronRequest(authorization?: string): NextRequest {
    return new NextRequest("https://example.test/api/cron/turntimer", {
        headers: authorization ? { authorization } : {},
    });
}

const original = process.env.CRON_SECRET;
afterEach(() => {
    if (original === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = original;
});

describe("isAuthorisedCron", () => {
    it("accepts the configured secret", () => {
        process.env.CRON_SECRET = "s3cret";
        expect(isAuthorisedCron(cronRequest("Bearer s3cret"))).toBe(true);
    });

    it("refuses a wrong or missing header", () => {
        process.env.CRON_SECRET = "s3cret";
        expect(isAuthorisedCron(cronRequest("Bearer nope"))).toBe(false);
        expect(isAuthorisedCron(cronRequest("s3cret"))).toBe(false);
        expect(isAuthorisedCron(cronRequest())).toBe(false);
    });

    it("fails closed when no secret is configured", () => {
        // The one that mattered: comparing against `Bearer ${undefined}`
        // meant a deployment that forgot CRON_SECRET accepted the literal
        // string "Bearer undefined" from anybody.
        delete process.env.CRON_SECRET;
        expect(isAuthorisedCron(cronRequest("Bearer undefined"))).toBe(false);
        expect(isAuthorisedCron(cronRequest("Bearer "))).toBe(false);
        expect(isAuthorisedCron(cronRequest())).toBe(false);
    });
});
