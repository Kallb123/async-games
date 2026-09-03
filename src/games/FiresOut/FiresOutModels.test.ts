import { describe, expect, it } from "vitest";
import { buildInitialFiresOutState, buildInitialFiresOutStateFromGameData, cloneFiresOutState, FiresOutGameDataModel, gameStateToModel, IFiresOutGameData } from "./FiresOutModels";
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
        expect(response.spaces.length).toBe(INTERIOR_SPACE_COUNT + 32); // + the exterior perimeter ring
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

// The sibling footgun to the one above, on the same `poi` subdocument path
// and found the same way — by going through a *hydrated document* rather than
// a plain object. `{ ...subdocument }` copies Mongoose's internals
// (`$__parent`, `$basePath`, `$__`, `_doc`) instead of `id`/`revealed`/
// `victim`, so cloneFiresOutState silently produced POIs with everything
// `undefined`. It only bites on the read path, which is why every plain-object
// test in replay.test.ts passed while turn review diverged from the real game
// in every match and could name a marker still face down on the live board.
//
// Everything a Fires Out replay starts from goes through this clone
// (buildInitialFiresOutStateFromGameData), so asserting it here covers the
// whole timeline.
describe("cloneFiresOutState off a hydrated document", () => {
    function hydrated(): IFiresOutGameData {
        const specificGameState = buildInitialFiresOutState(["u1", "u2"], "family", "recruit");
        return new FiresOutGameDataModel({
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
            initialSpecificGameState: cloneFiresOutState(specificGameState),
        }) as unknown as IFiresOutGameData;
    }

    it("copies a POI's own fields rather than a subdocument's internals", () => {
        const clone = cloneFiresOutState(hydrated().specificGameState);
        const pois = clone.spaces.filter(s => s.poi).map(s => s.poi!);

        expect(pois).toHaveLength(3);
        for (const poi of pois) {
            expect(Object.keys(poi).sort()).toEqual(["id", "revealed", "victim"]);
            expect(typeof poi.id).toBe("number");
            expect(poi.revealed).toBe(false);
            expect(typeof poi.victim).toBe("boolean");
        }
    });

    it("gives the replay snapshot the same board the live game holds", () => {
        const doc = hydrated();
        const snapshot = buildInitialFiresOutStateFromGameData(doc);

        expect(gameStateToModel(snapshot, {}, null))
            .toEqual(gameStateToModel(doc.specificGameState, {}, null));
    });
});
