import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/utils/mongodb/mongodb", () => ({
    dbConnect: vi.fn().mockResolvedValue({
        connection: { transaction: vi.fn((callback: (session: object) => unknown) => callback({})) },
    }),
}));

import { KingdomBuilderWorldModel } from "@/games/KingdomBuilder";
import { POST } from "./route";

const originalSecret = process.env.CRON_SECRET;

afterAll(() => {
    if (originalSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalSecret;
});
afterEach(() => vi.restoreAllMocks());

function request(authorization?: string) {
    return new NextRequest("https://example.test/api/cron/kingdombuilder-tick", {
        method: "POST",
        headers: authorization ? { authorization } : undefined,
    });
}

describe("POST /api/cron/kingdombuilder-tick", () => {
    it("refuses a caller without the cron secret", async () => {
        process.env.CRON_SECRET = "cron-secret";
        const response = await POST(request());
        expect(response.status).toBe(401);
    });

    it("accepts the scheduler bearer token", async () => {
        process.env.CRON_SECRET = "cron-secret";
        const lean = vi.fn().mockResolvedValue([]);
        const select = vi.fn().mockReturnValue({ lean });
        const limit = vi.fn().mockReturnValue({ select });
        const sort = vi.fn().mockReturnValue({ limit });
        vi.spyOn(KingdomBuilderWorldModel, "find").mockReturnValue({ sort } as never);

        const response = await POST(request("Bearer cron-secret"));

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({ scanned: 0, ticked: 0, skipped: 0, failed: 0, unswept: 0, capped: false, removed: 0, removalFailed: 0 });
    });
});
