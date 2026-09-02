import { describe, expect, it } from "vitest";
import { buildInitialFiresOutState, FiresOutGameDataModel, gameStateToModel } from "./FiresOutModels";
import { INTERIOR_SPACE_COUNT } from "./board";

// Regression test for a classic Mongoose footgun (see WorldDominationModels.test.ts
// for the sibling one this game hit): a bare nested object schema path —
// `poi: { id: Number, revealed: Boolean, victim: Boolean }` — is a Mongoose
// "single nested subdocument", which defaults to a truthy empty object rather
// than `null` on every read after the first, no matter what was actually
// saved. Every command reloads the game fresh (requireLiveGame's
// findOne().exec()), so this made *every* space look like it held an
// unrevealed POI — the schema fix (FiresOutModels.ts's firesOutStateSchemaDef)
// is `default: undefined` on the wrapped nested type.
describe("Fires Out Mongoose schema", () => {
    it("keeps a space's poi genuinely null through schema casting when there isn't one", () => {
        const specificGameState = buildInitialFiresOutState(["u1", "u2"], "family", "recruit");
        const poiCount = specificGameState.spaces.filter(s => s.poi).length;
        expect(poiCount).toBe(3); // §6.1 step 4 / the family setup this test seeds

        const doc = new FiresOutGameDataModel({
            gameId: "11111111-1111-1111-1111-111111111111",
            gameType: { gameId: "g", gameType: "FiresOut", friendlyName: "Fires Out!", icon: "", url: "firesout", className: "FiresOutGameType" },
            userIdList: ["u1", "u2"],
            turnTimer: "1d",
            currentTurn: "u1",
            lastTurnTimestamp: new Date().toISOString(),
            timerWarningNotificationSent: false,
            gameState: { turnOrder: ["u1", "u2"], history: [], commandHistory: [] },
            complete: false,
            winner: "",
            specificGameState,
            initialSpecificGameState: specificGameState,
        });

        expect(doc.validateSync()).toBeUndefined();

        // Direct property access on the freshly-cast document — the same
        // access gameStateToModel makes off a document requireLiveGame just
        // loaded — is where the bug showed: every empty space's `poi` used to
        // come back as a truthy `{}`, not `null`.
        const emptySpaces = doc.specificGameState.spaces.filter((s: { poi: unknown }) => !s.poi);
        expect(emptySpaces.length).toBe(specificGameState.spaces.length - 3);

        // And the response builder — what the client actually receives —
        // shows a "?" badge for exactly the spaces that hold a POI, not every
        // space on the board.
        const response = gameStateToModel(doc.specificGameState, {}, null);
        const poiSpacesInResponse = response.spaces.filter(s => s.poi).length;
        expect(poiSpacesInResponse).toBe(3);
        expect(response.spaces.length).toBe(INTERIOR_SPACE_COUNT + 16); // + the exterior parking track
    });

    it("keeps a firefighter's restrictedAp genuinely null once dealt a specialist without one", () => {
        const specificGameState = buildInitialFiresOutState(["u1", "u2"], "experienced", "recruit");

        const doc = new FiresOutGameDataModel({
            gameId: "22222222-2222-2222-2222-222222222222",
            gameType: { gameId: "g", gameType: "FiresOut", friendlyName: "Fires Out!", icon: "", url: "firesout", className: "FiresOutGameType" },
            userIdList: ["u1", "u2"],
            turnTimer: "1d",
            currentTurn: "u1",
            lastTurnTimestamp: new Date().toISOString(),
            timerWarningNotificationSent: false,
            gameState: { turnOrder: ["u1", "u2"], history: [], commandHistory: [] },
            complete: false,
            winner: "",
            specificGameState,
            initialSpecificGameState: specificGameState,
        });

        expect(doc.validateSync()).toBeUndefined();

        const response = gameStateToModel(doc.specificGameState, {}, null);
        for (const ff of response.firefighters) {
            const dealt = specificGameState.firefighters.find(f => f.ownerId === ff.ownerId)!;
            expect(ff.restrictedAp).toEqual(dealt.restrictedAp);
        }
    });
});
