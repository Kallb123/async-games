import { describe, expect, it } from "vitest";
import { GameDataModel, IGameDataDocument } from "./GameData";

// A document as it comes back from Mongo, built with the raw values a query
// would hydrate rather than through `new Model()` (which casts on the way in).
function hydrate(history: unknown[]): IGameDataDocument {
    return GameDataModel.hydrate({
        _id: "000000000000000000000001",
        gameId: "11111111-1111-1111-1111-111111111111",
        gameType: { gameId: "g", gameType: "Generic", friendlyName: "Generic", icon: "", url: "generic", className: "GameType" },
        userIdList: ["u1", "u2"],
        turnTimer: "1d",
        currentTurn: "u1",
        gameState: { turnOrder: ["u1", "u2"], history, commandHistory: [] },
        complete: false,
        winner: "",
    }) as unknown as IGameDataDocument;
}

describe("legacy string history heals on load", () => {
    // A game created before history was tokenised has its log on disk as a bare
    // string[]. Mongoose can't cast those to the { text, actorId } subdocument,
    // so the getter reads back empty — but before the post('init') fix the
    // uncast primitives stayed on the path and made the next save throw a
    // ValidationError, which surfaced as a 500 on the first command played in
    // any pre-existing game.
    it("does not throw on save after a command appends to it", () => {
        const game = hydrate(["u1 rolled a 6", "u2 drew a card"]);

        // The legacy strings are dropped — as docs/dynamic-names.md §4d accepts.
        expect(game.gameState.history).toEqual([]);

        // A command appends a tokenised entry the way every Execute does.
        game.gameState.history.unshift({ text: "{{u1}} claimed a route", actorId: "u1" });

        // The crux: this validation ran on save() and used to reject the game.
        expect(game.validateSync()).toBeFalsy();
        expect(game.gameState.history.map(h => ({ text: h.text, actorId: h.actorId }))).toEqual([
            { text: "{{u1}} claimed a route", actorId: "u1" },
        ]);
    });

    it("leaves a converted game's log untouched", () => {
        const stored = [
            { text: "{{u2}} drew a card", actorId: "u2" },
            { text: "Setup: running order is {{u1}} → {{u2}}" },
        ];
        const game = hydrate(stored);

        expect(game.validateSync()).toBeFalsy();
        expect(game.gameState.history.map(h => ({ text: h.text, actorId: h.actorId }))).toEqual([
            { text: "{{u2}} drew a card", actorId: "u2" },
            { text: "Setup: running order is {{u1}} → {{u2}}", actorId: undefined },
        ]);
    });
});
