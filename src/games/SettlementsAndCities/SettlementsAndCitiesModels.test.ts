import { describe, expect, it } from "vitest";
import {
    SettlementsAndCitiesGameDataModel,
    cloneSACState,
    gameStateToResponse,
} from "./SettlementsAndCitiesModels";
import { makeState, player } from "./testFixtures";
import type { ISACRollChange, ISACSpecificGameState } from "./board";
import { NO_RESOURCES } from "./board";

const NAMES = { u1: "Alice", u2: "Bob" };

function gain(userId: string, gained: Partial<typeof NO_RESOURCES>): ISACRollChange {
    return { userId, gained: { ...NO_RESOURCES, ...gained }, discarded: 0 };
}

function stateWith(lastRollChanges: ISACRollChange[] | undefined): ISACSpecificGameState {
    return makeState({
        lastRollChanges,
        playerStates: new Map([["u1", player()], ["u2", player()]]),
    });
}

function docFor(specificGameState: ISACSpecificGameState) {
    return new SettlementsAndCitiesGameDataModel({
        gameId: "11111111-1111-1111-1111-111111111111",
        gameType: {
            gameId: "g", gameType: "SettlementsAndCities", friendlyName: "Settlements & Cities",
            icon: "", url: "settlementsandcities", className: "SettlementsAndCitiesGameType",
        },
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
}

// `lastRollChanges` is what the dice paid out, recorded as the roll resolves so
// the board, the history and the recap all read the same payout. Three things
// about it depend on Mongoose behaving a particular way, and each of them is a
// real bug if it doesn't — hence this file rather than trusting the cast.
describe("Settlements & Cities' roll payout through Mongoose", () => {
    it("stays absent on a game played before the field existed, rather than becoming []", () => {
        // A Mongoose array path defaults to `[]`, which here would be a claim —
        // "this roll paid nobody" — about a roll that simply never recorded one.
        // `default: undefined` in the schema is what keeps the two apart, and the
        // screens show no payout line at all for the absent case.
        const doc = docFor(stateWith(undefined));

        expect(doc.validateSync()).toBeUndefined();
        expect(doc.specificGameState.lastRollChanges).toBeUndefined();
        expect(gameStateToResponse(doc.specificGameState, NAMES, "u1").lastRollChanges).toBeUndefined();
    });

    it("marks itself dirty when a roll writes it, with no markModified to remember", () => {
        // This game has a real schema rather than Schema.Types.Mixed, so assigning
        // a fresh array onto the nested state path is tracked on its own — unlike
        // the Mixed-state games, which each need an explicit markDirty().
        const doc = docFor(stateWith(undefined));
        doc.$isNew = false;
        doc.unmarkModified("specificGameState");

        doc.specificGameState.lastRollChanges = [gain("u1", { lumber: 2 })];
        expect(doc.isModified("specificGameState.lastRollChanges")).toBe(true);

        // …and so does clearing it, which is what the turn hand-off does.
        doc.unmarkModified("specificGameState");
        doc.specificGameState.lastRollChanges = [];
        expect(doc.isModified("specificGameState.lastRollChanges")).toBe(true);
    });

    it("reaches the client as plain rows, without the subdocument _id Mongoose adds", () => {
        const doc = docFor(stateWith([gain("u1", { lumber: 2, grain: 1 }), { userId: "u2", gained: NO_RESOURCES, discarded: 3 }]));
        const wire = JSON.parse(JSON.stringify(gameStateToResponse(doc.specificGameState, NAMES, "u1")));

        expect(wire.lastRollChanges).toEqual([
            { userId: "u1", gained: { lumber: 2, wool: 0, grain: 1, brick: 0, ore: 0 }, discarded: 0 },
            { userId: "u2", gained: { lumber: 0, wool: 0, grain: 0, brick: 0, ore: 0 }, discarded: 3 },
        ]);
        // The stored rows do carry an _id of their own, which is exactly why the
        // response builds each row field by field instead of sending them as-is.
        expect(JSON.parse(JSON.stringify(doc.specificGameState.lastRollChanges))[0]._id).toBeDefined();
    });

    it("is deep-cloned for replay, absent state and all", () => {
        const changes = [gain("u1", { ore: 1 })];
        const cloned = cloneSACState(stateWith(changes), ["u1", "u2"]);

        expect(cloned.lastRollChanges).toEqual(changes);
        expect(cloned.lastRollChanges).not.toBe(changes);
        expect(cloned.lastRollChanges![0].gained).not.toBe(changes[0].gained);
        expect(cloneSACState(stateWith(undefined), ["u1", "u2"]).lastRollChanges).toBeUndefined();
    });
});
