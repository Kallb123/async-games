import { describe, expect, it } from "vitest";
import { clonePlayerStates, mongoMap } from "./mongoMaps";

interface Player {
    score: number;
    cards: string[];
}

const clone = (ps: Player): Player => ({ score: ps.score, cards: [...ps.cards] });

const alice = (): Player => ({ score: 3, cards: ["red"] });
const bob = (): Player => ({ score: 7, cards: [] });

describe("mongoMap", () => {
    it("passes a Map straight through", () => {
        const source = new Map([["u1", alice()]]);
        expect(mongoMap(source)).toBe(source);
    });

    it("turns the plain object Mongo hands back into a Map", () => {
        // A state that has been through JSON — the timeline route's snapshots,
        // a document read back with .lean() — arrives keyed as an object.
        const map = mongoMap({ u1: alice(), u2: bob() });
        expect(map).toBeInstanceOf(Map);
        expect([...map.keys()]).toEqual(["u1", "u2"]);
        expect(map.get("u2")!.score).toBe(7);
    });
});

describe("clonePlayerStates", () => {
    it("rebuilds the map in the given order, whatever order the source was in", () => {
        // Replay iterates this map, and games deal, discard and break ties by
        // that order, so it follows the seating rather than the source.
        const cloned = clonePlayerStates(new Map([["u2", bob()], ["u1", alice()]]), ["u1", "u2"], clone);
        expect([...cloned.keys()]).toEqual(["u1", "u2"]);
    });

    it("clones deeply, so mutating the copy leaves the original alone", () => {
        const source = new Map([["u1", alice()]]);
        const cloned = clonePlayerStates(source, ["u1"], clone);

        expect(cloned.get("u1")).toEqual(alice());
        cloned.get("u1")!.score = 99;
        cloned.get("u1")!.cards.push("blue");

        expect(source.get("u1")).toEqual(alice());
    });

    it("skips an id with no state rather than seating an empty player", () => {
        const cloned = clonePlayerStates(new Map([["u1", alice()]]), ["u1", "ghost"], clone);
        expect([...cloned.keys()]).toEqual(["u1"]);
    });

    it("clones from the plain-object form too", () => {
        const cloned = clonePlayerStates({ u1: alice(), u2: bob() }, ["u2", "u1"], clone);
        expect([...cloned.keys()]).toEqual(["u2", "u1"]);
        expect(cloned.get("u1")).toEqual(alice());
    });
});
