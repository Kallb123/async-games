import { afterEach, describe, expect, it, vi } from "vitest";

import { KingdomBuilderArmyModel } from "./KingdomBuilderArmyModel";
import { siegesOn } from "./besiegers";

afterEach(() => vi.restoreAllMocks());

describe("siegesOn", () => {
    it("reads nothing for no settlements", async () => {
        const find = vi.spyOn(KingdomBuilderArmyModel, "find");
        await expect(siegesOn("world", [])).resolves.toEqual(new Map());
        expect(find).not.toHaveBeenCalled();
    });

    it("reads only whose each camp is and since when, and keys each siege by node", async () => {
        const select = vi.fn(() => ({ lean: async () => [
            { ownerId: "rival", targetNodeId: "home", besiegingSince: 6 },
            { ownerId: "owner", targetNodeId: "away", besiegingSince: 2 },
        ] }));
        const find = vi.spyOn(KingdomBuilderArmyModel, "find").mockReturnValue({ select } as never);

        const sieges = await siegesOn("world", [{ ownerId: "owner", nodeId: "home" }, { ownerId: "owner", nodeId: "away" }]);

        expect(find).toHaveBeenCalledWith({ worldId: "world", targetNodeId: { $in: ["home", "away"] }, besiegingSince: { $ne: null } });
        expect(select).toHaveBeenCalledWith({ _id: 0, ownerId: 1, targetNodeId: 1, besiegingSince: 1 });
        // The owner's own army camped at their other town is no siege on it.
        expect([...sieges.keys()]).toEqual(["home"]);
        expect(sieges.get("home")).toMatchObject({ sinceTick: 6 });
    });
});
