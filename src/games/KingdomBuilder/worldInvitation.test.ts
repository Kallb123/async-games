import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./roster", () => ({ joinWorld: vi.fn() }));

import { InvitationModel, type IInvitationData } from "@/utils/mongodb/InvitationData";

import { KingdomBuilderPersistenceError } from "./persistence";
import { joinWorld } from "./roster";
import { acceptWorldSeat } from "./worldInvitation";

const WORLD_ID = "64b000000000000000000001";

function invite(seats: { userId: string; inviteAccepted: boolean }[]): IInvitationData {
    return {
        inviteId: "11111111-1111-4111-8111-111111111111",
        senderId: "host",
        userIdList: seats,
        turnTimer: "unlimited",
        timestamp: "2026-09-22T00:00:00.000Z",
        gameType: "KingdomBuilder",
        gameFriendlyName: "Kingdom Builder",
    };
}

afterEach(() => {
    vi.restoreAllMocks();
    vi.mocked(joinWorld).mockReset();
});

describe("acceptWorldSeat", () => {
    it("joins the world for a seat-holder and sends them to it", async () => {
        const result = await acceptWorldSeat(invite([{ userId: "guest", inviteAccepted: true }]), WORLD_ID, "guest");

        expect(joinWorld).toHaveBeenCalledWith(WORLD_ID, "guest");
        expect(result).toEqual({ gameStarted: true, gameId: WORLD_ID, gameUrl: "kingdombuilder" });
    });

    it("seats nobody who holds nothing on the invitation", async () => {
        const result = await acceptWorldSeat(invite([{ userId: "guest", inviteAccepted: true }]), WORLD_ID, "stranger");

        expect(joinWorld).not.toHaveBeenCalled();
        expect(result).toEqual({ gameStarted: false });
    });

    it("sends the host to the world they are already in", async () => {
        const result = await acceptWorldSeat(invite([]), WORLD_ID, "host");

        expect(joinWorld).not.toHaveBeenCalled();
        expect(result.gameStarted).toBe(true);
    });

    it("hands the seat back to the code when the world has no room after all", async () => {
        vi.mocked(joinWorld).mockRejectedValue(new KingdomBuilderPersistenceError("WORLD_FULL", "full"));
        const updateOne = vi.spyOn(InvitationModel, "updateOne").mockResolvedValue({} as never);
        vi.spyOn(console, "warn").mockImplementation(() => {});

        const result = await acceptWorldSeat(invite([{ userId: "guest", inviteAccepted: true }]), WORLD_ID, "guest");

        expect(result).toEqual({ gameStarted: false });
        expect(updateOne.mock.calls[0][1]).toEqual({ $set: { "userIdList.$[seat].userId": "open-seat", "userIdList.$[seat].inviteAccepted": false } });
    });
});
