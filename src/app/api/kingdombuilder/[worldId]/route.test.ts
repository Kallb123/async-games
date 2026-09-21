import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    userId: "owner" as string | null,
    foundExpansion: vi.fn(),
    worldView: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: async () => ({ userId: mocks.userId }) }));
vi.mock("@/utils/mongodb/mongodb", () => ({ dbConnect: vi.fn() }));
vi.mock("@/games/KingdomBuilder", () => ({
    KingdomBuilderPersistenceError: class KingdomBuilderPersistenceError extends Error {
        constructor(public code: string, message: string) { super(message); }
    },
    foundExpansion: mocks.foundExpansion,
    worldView: mocks.worldView,
}));

import { KingdomBuilderPersistenceError } from "@/games/KingdomBuilder";
import { GET, POST } from "./route";

const params = Promise.resolve({ worldId: "0123456789abcdef01234567" });
const request = (method: "GET" | "POST", body?: string) => new NextRequest("https://example.test/api/kingdombuilder/0123456789abcdef01234567", {
    method,
    body,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
});

afterEach(() => {
    vi.clearAllMocks();
    mocks.userId = "owner";
});

describe("/api/kingdombuilder/[worldId]", () => {
    it("requires authentication", async () => {
        mocks.userId = null;
        expect((await GET(request("GET"), { params })).status).toBe(401);
    });

    it("returns a world view for its member", async () => {
        mocks.worldView.mockResolvedValue({ worldId: "world", settlements: [] });
        const response = await GET(request("GET"), { params });
        expect(response.status).toBe(200);
        expect(mocks.worldView).toHaveBeenCalledWith("0123456789abcdef01234567", "owner");
    });

    it("maps invalid and conflicting expansion requests", async () => {
        mocks.foundExpansion.mockRejectedValueOnce(new KingdomBuilderPersistenceError("INVALID_INPUT", "Choose a site"));
        expect((await POST(request("POST", "{}"), { params })).status).toBe(400);

        mocks.foundExpansion.mockRejectedValueOnce(new KingdomBuilderPersistenceError("SITE_NOT_AVAILABLE", "Claimed"));
        expect((await POST(request("POST", JSON.stringify({ siteId: "open-1" })), { params })).status).toBe(409);
    });

    it("returns the updated map after founding", async () => {
        mocks.foundExpansion.mockResolvedValue({ worldId: "world", settlements: [{ nodeId: "open-1", isMine: true }] });
        const response = await POST(request("POST", JSON.stringify({ siteId: "open-1" })), { params });
        expect(response.status).toBe(200);
        expect(mocks.foundExpansion).toHaveBeenCalledWith("0123456789abcdef01234567", "owner", "open-1");
    });
});
