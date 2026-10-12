import { describe, expect, it } from "vitest";
import { WorldDominationGameDataModel } from "./WorldDominationModels";
import { TERRITORY_COUNT, buildWorldDominationCardDeck, cloneWorldDominationState } from "./board";
import { makeState } from "./testFixtures";
import { undoEntryFor } from "@/utils/games/undo";

// Regression test for a classic Mongoose footgun: a schema field literally
// named `type` (World Domination cards have a `type: WorldDominationCardType` field) collides with
// Mongoose's own `{ type: <SchemaType> }` convention. Without the
// `type: { type: String }` nesting workaround (see WorldDominationModels.ts's
// makeWorldDominationStateSchemaDef), Mongoose silently reinterprets `cardDeck`/`cards`'s
// element definition as "this array holds plain Strings", discarding `id`
// and `territoryId` and throwing a CastError the moment real card objects are
// assigned — exactly the bug this guards against.
describe("World Domination Mongoose schema", () => {
    it("keeps card objects (id/type/territoryId) intact through schema casting", () => {
        const cardDeck = buildWorldDominationCardDeck();
        const territories = Array.from({ length: TERRITORY_COUNT }, () => ({ owner: "u1", armies: 1 }));

        const doc = new WorldDominationGameDataModel({
            gameId: "11111111-1111-1111-1111-111111111111",
            gameType: { gameId: "g", gameType: "WorldDomination", friendlyName: "World Domination", icon: "", url: "worlddomination", className: "WorldDominationGameType" },
            userIdList: ["u1", "u2"],
            turnTimer: "1d",
            currentTurn: "u1",
            lastTurnTimestamp: new Date().toISOString(),
            timerWarningNotificationSent: false,
            gameState: { turnOrder: ["u1", "u2"], history: [], commandHistory: [] },
            complete: false,
            winner: "",
            specificGameState: {
                territories,
                playerStates: new Map([
                    ["u1", { cards: [cardDeck[0]], eliminated: false, conqueredTerritoryThisTurn: false }],
                    ["u2", { cards: [], eliminated: false, conqueredTerritoryThisTurn: false }],
                ]),
                phase: "setup",
                reinforcementsRemaining: 5,
                pendingOccupation: null,
                fortifyUsed: false,
                cardSetsCashedIn: 0,
                cardDeck,
                lastBattle: null,
            },
            initialSpecificGameState: {
                territories,
                playerStates: new Map(),
                phase: "setup",
                reinforcementsRemaining: 5,
                pendingOccupation: null,
                fortifyUsed: false,
                cardSetsCashedIn: 0,
                cardDeck,
                lastBattle: null,
            },
        });

        expect(doc.validateSync()).toBeUndefined();

        const firstCard = doc.specificGameState.cardDeck[0];
        expect(firstCard.id).toBe(cardDeck[0].id);
        expect(firstCard.type).toBe(cardDeck[0].type);

        const u1Cards = doc.specificGameState.playerStates.get("u1")!.cards;
        expect(u1Cards[0].id).toBe(cardDeck[0].id);
        expect(u1Cards[0].type).toBe(cardDeck[0].type);
    });

    // docs/undo.md §9: a game stored before undo has none of the three fields,
    // and every read of them tolerates that.
    it("gives a game that predates undo an empty stack, no anchor and no hold", () => {
        const territories = Array.from({ length: TERRITORY_COUNT }, () => ({ owner: "u1", armies: 1 }));
        const doc = new WorldDominationGameDataModel({
            gameId: "11111111-1111-1111-1111-111111111111",
            gameType: { gameId: "g", gameType: "WorldDomination", friendlyName: "World Domination", icon: "", url: "worlddomination", className: "WorldDominationGameType" },
            userIdList: ["u1", "u2"],
            turnTimer: "1d",
            currentTurn: "u1",
            lastTurnTimestamp: new Date().toISOString(),
            gameState: { turnOrder: ["u1", "u2"], history: [], commandHistory: [] },
            specificGameState: {
                territories, playerStates: new Map(), phase: "reinforce", reinforcementsRemaining: 0,
                pendingOccupation: null, fortifyUsed: false, cardSetsCashedIn: 0, cardDeck: [], lastBattle: null,
            },
        });
        expect(undoEntryFor(doc as never, "u1")).toBeNull();
        expect(doc.specificGameState.undoStack).toHaveLength(0);
        expect(doc.specificGameState.undoAnchorId ?? null).toBeNull();
        expect(doc.specificGameState.autoEndTurnAt ?? null).toBeNull();
    });

    it("stores a snapshot whole, Map and all, on the undo stack", () => {
        const gs = makeState();
        const doc = new WorldDominationGameDataModel({
            gameId: "11111111-1111-1111-1111-111111111111",
            gameType: { gameId: "g", gameType: "WorldDomination", friendlyName: "World Domination", icon: "", url: "worlddomination", className: "WorldDominationGameType" },
            userIdList: ["u1", "u2"],
            turnTimer: "1d",
            currentTurn: "u1",
            lastTurnTimestamp: "2026-10-01T08:00:00.000Z",
            gameState: { turnOrder: ["u1", "u2"], history: [], commandHistory: [] },
            specificGameState: {
                ...gs,
                undoStack: [{ by: "u1", turnStartedAt: "2026-10-01T08:00:00.000Z", state: cloneWorldDominationState(gs, ["u1", "u2"]) }],
                undoAnchorId: "last-command",
            },
        });
        expect(doc.validateSync()).toBeUndefined();
        expect(doc.specificGameState.undoStack[0].by).toBe("u1");
        expect(doc.specificGameState.undoStack[0].state.phase).toBe("reinforce");
    });
});
