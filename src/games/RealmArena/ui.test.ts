import { describe, expect, it } from "vitest";
import { buildBattlefield } from "@/utils/games/battlefield/terrain";
import { RUINED_FORT } from "./maps/ruinedFort";
import { squareAt } from "@/utils/games/battlefield/terrain";
import { newFighter } from "./rules";
import { CELL, areaRect, fighterStatus, focusOn, groundLayers, placeTap, squadCounts, squadOf, type Placement } from "./ui";

/** Every square a path's rectangles cover, as "col,row". */
function squaresDrawn(d: string): Set<string> {
    const covered = new Set<string>();
    for (const [, x, y, w] of d.matchAll(/M(\d+) (\d+)h(\d+)v/g)) {
        for (let col = Number(x) / CELL; col < (Number(x) + Number(w)) / CELL; col++) covered.add(`${col},${Number(y) / CELL}`);
    }
    return covered;
}

describe("groundLayers", () => {
    it("draws one path per kind of terrain, merging a row's run of one kind into one rectangle", () => {
        const field = buildBattlefield({ name: "Test", rows: ["..,,#", "....."], deployments: [], objectives: {} });
        expect(groundLayers(field)).toEqual([
            { letter: ".", d: "M0 0h20v10h-20zM0 10h50v10h-50z" },
            { letter: ",", d: "M20 0h20v10h-20z" },
            { letter: "#", d: "M40 0h10v10h-10z" },
        ]);
    });

    it("covers every square of the Ruined Fort exactly once, in its own terrain's layer", () => {
        const layers = groundLayers(RUINED_FORT);
        const drawn = layers.map(layer => squaresDrawn(layer.d));
        expect(drawn.reduce((total, squares) => total + squares.size, 0)).toBe(RUINED_FORT.width * RUINED_FORT.height);
        expect(new Set(drawn.flatMap(squares => [...squares])).size).toBe(RUINED_FORT.width * RUINED_FORT.height);
    });
});

describe("areaRect", () => {
    it("bounds the centre of the Ruined Fort", () => {
        expect(areaRect(RUINED_FORT, RUINED_FORT.objectives.centre)).toEqual({ x: 15 * CELL, y: 21 * CELL, width: 6 * CELL, height: 6 * CELL });
    });
});

describe("focusOn", () => {
    it("frames seven squares across, centred on the character", () => {
        expect(focusOn(RUINED_FORT, squareAt(RUINED_FORT, 10, 20)!)).toEqual({ x: 7 * CELL, y: 17 * CELL, width: 7 * CELL, height: 7 * CELL });
    });
});

describe("fighterStatus", () => {
    const knight = newFighter(0, "alice", "knight", 0);

    it("says nothing for a character doing nothing in particular", () => {
        expect(fighterStatus(knight)).toEqual([]);
    });

    it("names the watch, hunkering down and the shield wall", () => {
        expect(fighterStatus({ ...knight, banked: 4, hunkered: true, shieldWall: true }))
            .toEqual(["On watch (4 AP banked)", "Hunkered down", "Shield wall"]);
    });

    it("says only that a fallen character is down", () => {
        expect(fighterStatus({ ...knight, hp: 0, banked: 4 })).toEqual(["Down"]);
    });
});

describe("squadCounts and squadOf", () => {
    it("count a squad, and list it back in the muster's order", () => {
        const counts = squadCounts(["cleric", "manAtArms", "knight", "manAtArms"]);
        expect(counts).toEqual({ manAtArms: 2, knight: 1, archer: 0, scout: 0, mage: 0, cleric: 1 });
        expect(squadOf(counts)).toEqual(["manAtArms", "manAtArms", "knight", "cleric"]);
    });
});

describe("placeTap", () => {
    const zone = [0, 1, 2, 3];
    const placed: Placement = { picks: [{ character: "knight", square: 0 }, { character: "archer", square: 1 }], selected: null };

    it("picks a character up, and puts it back down on a second tap", () => {
        const holding = placeTap(placed, 1, zone);
        expect(holding).toEqual({ ...placed, selected: 1 });
        expect(placeTap(holding, 1, zone)).toEqual(placed);
    });

    it("does nothing for a tap on an empty square with nobody picked up", () => {
        expect(placeTap(placed, 3, zone)).toEqual(placed);
    });

    it("moves the character picked up to an empty square of the zone", () => {
        expect(placeTap({ ...placed, selected: 0 }, 3, zone)).toEqual({
            picks: [{ character: "knight", square: 3 }, { character: "archer", square: 1 }],
            selected: null,
        });
    });

    it("swaps the character picked up with another", () => {
        expect(placeTap({ ...placed, selected: 0 }, 1, zone)).toEqual({
            picks: [{ character: "knight", square: 1 }, { character: "archer", square: 0 }],
            selected: null,
        });
    });

    it("won't move a character out of the zone", () => {
        expect(placeTap({ ...placed, selected: 0 }, 9, zone)).toEqual({ ...placed, selected: 0 });
    });
});
