import { describe, expect, it } from "vitest";
import { WorldDominationGameDataModel } from "./WorldDominationModels";
import { TERRITORY_COUNT, buildWorldDominationCardDeck } from "./board";

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
});
