import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    userId: "owner" as string | null,
    foundExpansion: vi.fn(),
    worldView: vi.fn(),
    endWorld: vi.fn(),
    leaveWorld: vi.fn(),
    marchArmy: vi.fn(),
    pushAttack: vi.fn(),
    sallyOut: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: async () => ({ userId: mocks.userId }) }));
vi.mock("@/utils/mongodb/mongodb", () => ({ dbConnect: vi.fn() }));
vi.mock("@/games/KingdomBuilder", () => ({
    KingdomBuilderPersistenceError: class KingdomBuilderPersistenceError extends Error {
        constructor(public code: string, message: string) { super(message); }
    },
    foundExpansion: mocks.foundExpansion,
    worldView: mocks.worldView,
    endWorld: mocks.endWorld,
    leaveWorld: mocks.leaveWorld,
    marchArmy: mocks.marchArmy,
    pushAttack: mocks.pushAttack,
    sallyOut: mocks.sallyOut,
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

    it("ends the world for its host, removing it only when asked to", async () => {
        const response = await POST(request("POST", JSON.stringify({ action: "end", deleteNow: "yes" })), { params });
        expect(response.status).toBe(200);
        expect(mocks.endWorld).toHaveBeenCalledWith("0123456789abcdef01234567", "owner", { deleteNow: false });

        await POST(request("POST", JSON.stringify({ action: "end", deleteNow: true })), { params });
        expect(mocks.endWorld).toHaveBeenLastCalledWith("0123456789abcdef01234567", "owner", { deleteNow: true });
        expect(mocks.foundExpansion).not.toHaveBeenCalled();
    });

    it("maps a member who isn't the host to 403", async () => {
        mocks.endWorld.mockRejectedValueOnce(new KingdomBuilderPersistenceError("FORBIDDEN", "Only the host can end this world"));
        expect((await POST(request("POST", JSON.stringify({ action: "end" })), { params })).status).toBe(403);
    });

    it("leaves the world, and refuses an action it doesn't know", async () => {
        expect((await POST(request("POST", JSON.stringify({ action: "leave" })), { params })).status).toBe(200);
        expect(mocks.leaveWorld).toHaveBeenCalledWith("0123456789abcdef01234567", "owner");

        expect((await POST(request("POST", JSON.stringify({ action: "explode" })), { params })).status).toBe(400);
        expect(mocks.foundExpansion).not.toHaveBeenCalled();
    });

    it("passes a march order on as the caller's, and answers a missing army with 404", async () => {
        mocks.marchArmy.mockResolvedValueOnce({ worldId: "world" });
        const order = { action: "march", settlementId: "s", units: { militia: 2 }, targetNodeId: "camp", ownerId: "someone-else" };
        expect((await POST(request("POST", JSON.stringify(order)), { params })).status).toBe(200);
        expect(mocks.marchArmy).toHaveBeenCalledWith("0123456789abcdef01234567", "owner", { settlementId: "s", units: { militia: 2 }, targetNodeId: "camp", armyId: undefined });

        mocks.marchArmy.mockRejectedValueOnce(new KingdomBuilderPersistenceError("ARMY_NOT_FOUND" as never, "Army not found"));
        expect((await POST(request("POST", JSON.stringify({ action: "march", armyId: "a", targetNodeId: "camp" })), { params })).status).toBe(404);
        mocks.marchArmy.mockRejectedValueOnce(new KingdomBuilderPersistenceError("NO_ROUTE" as never, "No way"));
        expect((await POST(request("POST", JSON.stringify({ action: "march", armyId: "a", targetNodeId: "isle" })), { params })).status).toBe(409);
    });

    it("passes a push and a sally on as the caller's, and answers a siege that's over with 409", async () => {
        mocks.pushAttack.mockResolvedValueOnce({ worldId: "world", battle: { won: true } });
        expect((await POST(request("POST", JSON.stringify({ action: "push", armyId: "a", ownerId: "someone-else" })), { params })).status).toBe(200);
        expect(mocks.pushAttack).toHaveBeenCalledWith("0123456789abcdef01234567", "owner", "a");

        mocks.sallyOut.mockRejectedValueOnce(new KingdomBuilderPersistenceError("NO_SIEGE" as never, "Not besieged"));
        expect((await POST(request("POST", JSON.stringify({ action: "sally", settlementId: "s" })), { params })).status).toBe(409);
        expect(mocks.sallyOut).toHaveBeenCalledWith("0123456789abcdef01234567", "owner", "s");
    });
});
