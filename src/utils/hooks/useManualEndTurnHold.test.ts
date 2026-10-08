// What an End turn tap does, and how long the hold it opens runs — the pieces
// of `useManualEndTurnHold` that can be asked a question without a React tree.

import { describe, expect, it } from "vitest";
import { endTurnTapPlan, manualHoldDeadline } from "./useManualEndTurnHold";
import { UNDO_WINDOW_MS } from "@/utils/games/undo";

describe("endTurnTapPlan", () => {
    it("opens a hold when a move can still be taken back", () => {
        expect(endTurnTapPlan(null, true)).toBe("hold");
    });

    it("sends at once when there is nothing to take back", () => {
        expect(endTurnTapPlan(null, false)).toBe("send");
    });

    it("sends at once when a hold is already open — that tap is Pass now", () => {
        const open = manualHoldDeadline(0);
        expect(endTurnTapPlan(open, true)).toBe("send");
        expect(endTurnTapPlan(open, false)).toBe("send");
    });
});

describe("manualHoldDeadline", () => {
    it("closes one undo window after it opened, as the server's own hold does", () => {
        const opened = Date.UTC(2026, 0, 1, 12, 0, 0);
        expect(new Date(manualHoldDeadline(opened)).getTime() - opened).toBe(UNDO_WINDOW_MS);
    });
});
