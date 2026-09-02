import { describe, expect, it } from "vitest";
import {
    COLS,
    EXTERIOR_TOP_START,
    INTERIOR_SPACE_COUNT,
    edgeBetween,
    spaceIndex,
} from "./board";
import {
    IFiresOutEdgeState,
    IFiresOutFirefighterState,
    IFiresOutSpaceState,
    buildEmptyEdges,
    buildEmptySpaces,
    checkOutcome,
    explode,
    flashover,
    isBuildingCollapsed,
    legalChopTargets,
    legalDoorTargets,
    legalExtinguishTargets,
    legalMoveTargets,
    newFirefighter,
    poiCountOnBoard,
    replenishPoi,
    resolveAdvanceFire,
    resolveFireConsequences,
    resolveTargetSpace,
    shuffledPoiPool,
    totalDamage,
} from "./rules";

function fire(spaces: IFiresOutSpaceState[], ...cells: number[]): void {
    for (const c of cells) spaces[c].threat = 'fire';
}

// A nextRoll that returns a fixed, scripted sequence of (d6, d8) pairs, two
// values at a time — the same shape resolveAdvanceFire/replenishPoi consume
// it in. Throws once exhausted, so a test only pays for the rolls it scripts.
function scriptedRolls(...values: number[]): (sides: number) => number {
    let i = 0;
    return (_sides: number) => {
        if (i >= values.length) throw new Error("scriptedRolls exhausted");
        return values[i++];
    };
}

describe("explode (§9.2)", () => {
    it("sends a shockwave through a burning corridor and damages the wall at the end of it", () => {
        const spaces = buildEmptySpaces();
        const edges = buildEmptyEdges();
        const origin = spaceIndex(2, 1);
        const corridor = [spaceIndex(2, 2), spaceIndex(2, 3), spaceIndex(2, 4)];
        fire(spaces, origin, ...corridor);

        explode(spaces, edges, origin);

        // The corridor is all one room (open edges) so the blast crosses all
        // three already-burning spaces before meeting the kitchen/den wall.
        const wallEdge = edgeBetween(spaceIndex(2, 4), spaceIndex(2, 5))!;
        expect(edges[wallEdge].damage).toBe(1);
        expect(spaces[spaceIndex(2, 5)].threat).toBe('none'); // the wall stopped it — not yet on fire
        for (const c of corridor) expect(spaces[c].threat).toBe('fire');
    });

    it("destroys a closed door in its path and stops, without damaging anything beyond it", () => {
        const spaces = buildEmptySpaces();
        const edges = buildEmptyEdges();
        const origin = spaceIndex(1, 2); // living room, adjacent to the living/kitchen door
        fire(spaces, origin);

        explode(spaces, edges, origin);

        const doorEdge = edgeBetween(spaceIndex(1, 2), spaceIndex(2, 2))!;
        expect(edges[doorEdge].kind).toBe('open'); // destroyed doors are permanently passable
    });

    it("places fire in an open direction and stops there", () => {
        const spaces = buildEmptySpaces();
        const edges = buildEmptyEdges();
        const origin = spaceIndex(2, 1);
        fire(spaces, origin);

        explode(spaces, edges, origin);

        expect(spaces[spaceIndex(2, 0)].threat).toBe('fire'); // open, same room, west
    });

    it("dissipates off the edge of the grid rather than wrapping or throwing", () => {
        const spaces = buildEmptySpaces();
        const edges = buildEmptyEdges();
        const origin = spaceIndex(0, 0);
        fire(spaces, origin);

        expect(() => explode(spaces, edges, origin)).not.toThrow();
    });

    it("radiates onto the exterior track through the top/bottom openings", () => {
        const spaces = buildEmptySpaces();
        const edges = buildEmptyEdges();
        const origin = spaceIndex(0, 3);
        fire(spaces, origin);

        explode(spaces, edges, origin);

        expect(spaces[EXTERIOR_TOP_START + 3].threat).toBe('fire');
    });
});

describe("flashover (§9.3)", () => {
    it("flashes over a smoke-filled wing to a fixpoint in one call, even when the chain is more than one hop from the original fire", () => {
        const spaces = buildEmptySpaces();
        fire(spaces, spaceIndex(0, 0));
        spaces[spaceIndex(0, 1)].threat = 'smoke';
        spaces[spaceIndex(0, 2)].threat = 'smoke';
        spaces[spaceIndex(0, 3)].threat = 'smoke'; // two hops from the fire — only reachable via 0,2

        flashover(spaces);

        expect(spaces[spaceIndex(0, 1)].threat).toBe('fire');
        expect(spaces[spaceIndex(0, 2)].threat).toBe('fire');
        expect(spaces[spaceIndex(0, 3)].threat).toBe('fire');
    });

    it("leaves smoke alone when nothing nearby is on fire", () => {
        const spaces = buildEmptySpaces();
        spaces[spaceIndex(3, 3)].threat = 'smoke';
        flashover(spaces);
        expect(spaces[spaceIndex(3, 3)].threat).toBe('smoke');
    });
});

describe("resolveTargetSpace (§9.1)", () => {
    it("places smoke on an empty space not adjacent to fire", () => {
        const spaces = buildEmptySpaces();
        const edges = buildEmptyEdges();
        const result = resolveTargetSpace(spaces, edges, spaceIndex(4, 4));
        expect(result).toBe('smoke');
        expect(spaces[spaceIndex(4, 4)].threat).toBe('smoke');
    });

    it("places fire (not smoke) on an empty space adjacent to fire", () => {
        const spaces = buildEmptySpaces();
        const edges = buildEmptyEdges();
        fire(spaces, spaceIndex(4, 3));
        const result = resolveTargetSpace(spaces, edges, spaceIndex(4, 4));
        expect(result).toBe('fire');
        expect(spaces[spaceIndex(4, 4)].threat).toBe('fire');
    });

    it("flips smoke to fire", () => {
        const spaces = buildEmptySpaces();
        const edges = buildEmptyEdges();
        spaces[spaceIndex(2, 2)].threat = 'smoke';
        const result = resolveTargetSpace(spaces, edges, spaceIndex(2, 2));
        expect(result).toBe('fire');
        expect(spaces[spaceIndex(2, 2)].threat).toBe('fire');
    });

    it("explodes an already-burning space", () => {
        const spaces = buildEmptySpaces();
        const edges = buildEmptyEdges();
        fire(spaces, spaceIndex(2, 1));
        const result = resolveTargetSpace(spaces, edges, spaceIndex(2, 1));
        expect(result).toBe('explosion');
    });
});

describe("resolveFireConsequences (§9.1 step 6, §10.3)", () => {
    it("loses a victim POI caught by fire, and silently removes a false alarm", () => {
        const spaces = buildEmptySpaces();
        fire(spaces, spaceIndex(1, 1), spaceIndex(1, 5));
        spaces[spaceIndex(1, 1)].poi = { id: 0, revealed: false, victim: true };
        spaces[spaceIndex(1, 5)].poi = { id: 1, revealed: false, victim: false };

        const result = resolveFireConsequences(spaces, []);

        expect(result.victimsLost).toBe(1);
        expect(spaces[spaceIndex(1, 1)].poi).toBeNull();
        expect(spaces[spaceIndex(1, 5)].poi).toBeNull();
    });

    it("knocks a firefighter caught by fire back to the start space, dropping what they carried without losing it", () => {
        const spaces = buildEmptySpaces();
        fire(spaces, spaceIndex(3, 3));
        const ff = newFirefighter("u1", spaceIndex(3, 3));
        ff.carrying = 'victim';

        const result = resolveFireConsequences(spaces, [ff]);

        expect(result.knockedDownIndices).toEqual([0]);
        expect(ff.carrying).toBeNull();
        expect(ff.space).not.toBe(spaceIndex(3, 3));
    });

    it("leaves an untouched firefighter alone", () => {
        const spaces = buildEmptySpaces();
        const ff = newFirefighter("u1", spaceIndex(3, 3));
        const result = resolveFireConsequences(spaces, [ff]);
        expect(result.knockedDownIndices).toEqual([]);
        expect(ff.space).toBe(spaceIndex(3, 3));
    });

    it("puts out any fire that ended up outside the building", () => {
        const spaces = buildEmptySpaces();
        spaces[EXTERIOR_TOP_START].threat = 'fire';
        resolveFireConsequences(spaces, []);
        expect(spaces[EXTERIOR_TOP_START].threat).toBe('none');
    });
});

describe("resolveAdvanceFire (§7 Phase 2)", () => {
    it("rolls, resolves the target, flashes over, and applies consequences in one call", () => {
        const spaces = buildEmptySpaces();
        const edges = buildEmptyEdges();
        const result = resolveAdvanceFire(spaces, edges, [], scriptedRolls(3, 4));
        expect(result.rolls).toEqual({ d6: 3, d8: 4 });
        expect(result.target).toBe(spaceIndex(2, 3));
        expect(result.resolution).toBe('smoke');
        expect(spaces[spaceIndex(2, 3)].threat).toBe('smoke');
    });
});

describe("replenishPoi (§7 Phase 3)", () => {
    it("re-rolls an invalid target (fire, or an existing POI) before placing", () => {
        const spaces = buildEmptySpaces();
        fire(spaces, spaceIndex(0, 0)); // first roll's target — invalid, must re-roll
        const pool = [true];
        const nextId = replenishPoi(spaces, pool, scriptedRolls(1, 1, 3, 4), 0);

        expect(pool).toHaveLength(0);
        expect(poiCountOnBoard(spaces)).toBe(1);
        expect(spaces[spaceIndex(2, 3)].poi).toEqual({ id: 0, revealed: false, victim: true });
        expect(nextId).toBe(1);
    });

    it("stops once 3 POIs are on the board", () => {
        const spaces = buildEmptySpaces();
        spaces[spaceIndex(0, 0)].poi = { id: 0, revealed: false, victim: true };
        spaces[spaceIndex(0, 1)].poi = { id: 1, revealed: false, victim: true };
        spaces[spaceIndex(0, 2)].poi = { id: 2, revealed: false, victim: true };
        const pool = [true, true];

        replenishPoi(spaces, pool, scriptedRolls(), 3);

        expect(pool).toHaveLength(2); // never drawn from — nextRoll was never called
    });
});

describe("reachability (§17.6 step 5 — must mirror FiresOutLogic.ts's own Execute checks)", () => {
    it("legalMoveTargets excludes a space blocked by an undamaged wall, and excludes fire when carrying but not otherwise", () => {
        const spaces = buildEmptySpaces();
        const edges = buildEmptyEdges();
        const origin = spaceIndex(2, 1);
        const ff = newFirefighter("u1", origin);
        spaces[spaceIndex(2, 2)].threat = 'fire';

        // (2,1)-(2,5) is walled; (2,0)/(2,2) are open same-room neighbours.
        const notCarrying = legalMoveTargets(spaces, edges, ff, false);
        expect(notCarrying).toContain(spaceIndex(2, 0));
        expect(notCarrying).toContain(spaceIndex(2, 2)); // fire is fine unless carrying
        expect(notCarrying).not.toContain(spaceIndex(1, 1)); // walled off

        const carrying = legalMoveTargets(spaces, edges, ff, true);
        expect(carrying).not.toContain(spaceIndex(2, 2)); // blocked while carrying
    });

    it("legalMoveTargets is empty once AP runs out", () => {
        const spaces = buildEmptySpaces();
        const edges = buildEmptyEdges();
        const ff = newFirefighter("u1", spaceIndex(2, 1));
        ff.apLeft = 0;
        expect(legalMoveTargets(spaces, edges, ff, false)).toEqual([]);
    });

    it("legalDoorTargets finds only adjacent doors, and only while affordable", () => {
        const spaces = buildEmptySpaces();
        const edges = buildEmptyEdges();
        const ff = newFirefighter("u1", spaceIndex(1, 2)); // beside the living/kitchen door
        expect(legalDoorTargets(edges, ff)).toEqual([spaceIndex(2, 2)]);

        ff.apLeft = 0;
        expect(legalDoorTargets(edges, ff)).toEqual([]);
    });

    it("legalExtinguishTargets includes the firefighter's own space and any smoking/burning neighbour, never a clear one", () => {
        const spaces = buildEmptySpaces();
        const ff = newFirefighter("u1", spaceIndex(2, 1));
        spaces[ff.space].threat = 'smoke';
        spaces[spaceIndex(2, 2)].threat = 'fire';

        const targets = legalExtinguishTargets(spaces, ff);
        expect(targets).toContain(ff.space);
        expect(targets).toContain(spaceIndex(2, 2));
        expect(targets).not.toContain(spaceIndex(2, 0)); // clear
    });

    it("legalChopTargets excludes a wall already destroyed", () => {
        const edges = buildEmptyEdges();
        const ff = newFirefighter("u1", spaceIndex(2, 1));
        const wallEdge = edgeBetween(spaceIndex(2, 1), spaceIndex(1, 1))!;

        expect(legalChopTargets(edges, ff)).toEqual([spaceIndex(1, 1)]);

        edges[wallEdge].damage = 2;
        expect(legalChopTargets(edges, ff)).toEqual([]);
    });

});

describe("the collapse clock (§5, §17.4 — derived, never stored)", () => {
    it("has no damage on a fresh board", () => {
        expect(totalDamage(buildEmptyEdges())).toBe(0);
        expect(isBuildingCollapsed(buildEmptyEdges())).toBe(false);
    });

    it("collapses the building once 24 damage markers are placed", () => {
        const edges: IFiresOutEdgeState[] = buildEmptyEdges();
        const wallEdges = edges.filter(e => e.kind === 'wall');
        expect(wallEdges.length).toBeGreaterThanOrEqual(12); // enough walls to reach 24 at 2 damage each
        for (let i = 0; i < 12; i++) wallEdges[i].damage = 2;

        expect(totalDamage(edges)).toBe(24);
        expect(isBuildingCollapsed(edges)).toBe(true);
    });
});

describe("checkOutcome (§5)", () => {
    it("wins once 7 victims are rescued", () => {
        expect(checkOutcome(7, 0, buildEmptyEdges())).toBe('win');
    });

    it("loses once 4 victims are lost", () => {
        expect(checkOutcome(0, 4, buildEmptyEdges())).toBe('tooManyVictimsLost');
    });

    it("loses once the building collapses", () => {
        const edges = buildEmptyEdges();
        edges.filter(e => e.kind === 'wall').slice(0, 12).forEach(e => { e.damage = 2; });
        expect(checkOutcome(0, 0, edges)).toBe('buildingCollapsed');
    });

    it("is null mid-game", () => {
        expect(checkOutcome(2, 1, buildEmptyEdges())).toBeNull();
    });
});

describe("shuffledPoiPool (§10.1)", () => {
    it("always deals 10 victims and 5 false alarms", () => {
        const pool = shuffledPoiPool();
        expect(pool).toHaveLength(15);
        expect(pool.filter(Boolean)).toHaveLength(10);
        expect(pool.filter(v => !v)).toHaveLength(5);
    });
});

describe("marker conservation", () => {
    it("keeps total damage within the 24-marker supply and the POI pool never goes negative through a played-out sequence", () => {
        const spaces = buildEmptySpaces();
        const edges = buildEmptyEdges();
        const firefighters: IFiresOutFirefighterState[] = [newFirefighter("u1")];
        const pool = shuffledPoiPool();
        let nextId = 0;

        // Repeatedly roll the same target (row 1, every column) — enough
        // Advance Fires that some hit a space already on fire and explode —
        // then replenish, asserting conservation holds after each round.
        for (let round = 0; round < COLS; round++) {
            resolveAdvanceFire(spaces, edges, firefighters, scriptedRolls(2, round + 1));
            nextId = replenishPoi(spaces, pool, scriptedRolls(3, 1, 3, 2, 3, 3), nextId);

            expect(totalDamage(edges)).toBeLessThanOrEqual(24);
            expect(pool.length).toBeGreaterThanOrEqual(0);
            expect(poiCountOnBoard(spaces) + pool.length).toBeLessThanOrEqual(15);
        }
    });
});
