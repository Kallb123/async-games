import { describe, expect, it } from "vitest";
import {
    AMBULANCE_START,
    COLS,
    ENGINE_START,
    EXTERIOR_TOP_START,
    exteriorBottomSpace,
    exteriorTopSpace,
    INTERIOR_SPACE_COUNT,
    MAX_PLAYERS,
    quadrantOf,
    TOTAL_HOTSPOT_MARKERS,
    edgeBetween,
    spaceIndex,
} from "./board";
import {
    AP_COSTS,
    IFiresOutEdgeState,
    IFiresOutFirefighterState,
    IFiresOutSpaceState,
    SPECIALISTS,
    applyExperiencedSetup,
    buildEmptyEdges,
    buildEmptySpaces,
    canCrewChange,
    canDisposeHazmatOnSite,
    canFireDeckGunAt,
    canTreat,
    checkOutcome,
    chopApCost,
    dealSpecialists,
    deckGunApCost,
    explode,
    extinguishApCost,
    fireCaptainCanControlOthers,
    fireDeckGun,
    flashover,
    isBuildingCollapsed,
    isRescuePoint,
    legalChopTargets,
    legalDeckGunTargets,
    legalDoorTargets,
    legalDriveTargets,
    legalExtinguishTargets,
    legalMoveTargets,
    legalRevealTargets,
    newFirefighter,
    poiCountOnBoard,
    refillFirefighterAp,
    replenishPoi,
    resolveAdvanceFire,
    resolveFireConsequences,
    resolveTargetSpace,
    revealPoiAt,
    rollTargetInQuadrant,
    shuffledPoiPool,
    specialistDef,
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

// A nextRoll that walks every interior space exactly once, in row-major
// order, one (d6, d8) pair per space — never repeats a coordinate within a
// single setup's worth of rolls, so a setup placement's own re-roll-on-invalid
// loop (rollValidSetupTarget) never has to reject a coordinate for being
// already claimed by *this* generator, only for board state (fire from an
// earlier explosion's radiation, say).
function sequentialRolls(): (sides: number) => number {
    let row = 0, col = 0, wantRow = true;
    return () => {
        if (wantRow) { wantRow = false; return row + 1; }
        const d8 = col + 1;
        wantRow = true;
        col++;
        if (col >= COLS) { col = 0; row++; }
        return d8;
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
        const result = resolveAdvanceFire(spaces, edges, [], 0, scriptedRolls(3, 4));
        expect(result.rolls).toEqual({ d6: 3, d8: 4 });
        expect(result.target).toBe(spaceIndex(2, 3));
        expect(result.resolution).toBe('smoke');
        expect(spaces[spaceIndex(2, 3)].threat).toBe('smoke');
    });
});

describe("hazmat detonation (§9.4, §17.6 step 8)", () => {
    it("detonates a hazmat caught by fire — an immediate explosion, replaced by a hot spot drawn from the reserve", () => {
        const spaces = buildEmptySpaces();
        const edges = buildEmptyEdges();
        const target = spaceIndex(2, 3);
        fire(spaces, spaceIndex(2, 2)); // adjacent — the roll below catches (not explodes) per §9.1
        spaces[target].hazmat = true;

        const result = resolveAdvanceFire(spaces, edges, [], 5, scriptedRolls(3, 4)); // -> spaceIndex(2, 3)

        expect(result.resolution).toBe('fire'); // the roll itself only sees "adjacent to fire" — detonation is a consequence, not the resolution
        expect(spaces[target].hazmat).toBe(false);
        expect(spaces[target].hotspot).toBe(true);
        expect(result.hotspotReserve).toBe(4); // one drawn from the reserve of 5
        expect(result.flareUps).toEqual([]); // the hot spot the detonation just placed doesn't flare up itself — see wasHotspot's comment

        // The detonation's own explosion (§9.2) radiated from the hazmat's
        // space — north is a different room and not a doorway, so that
        // direction damages the wall rather than spreading fire.
        const northWall = edgeBetween(target, spaceIndex(1, 3))!;
        expect(edges[northWall].damage).toBe(1);
    });

    it("doesn't place a hot spot once the reserve is empty", () => {
        const spaces = buildEmptySpaces();
        const edges = buildEmptyEdges();
        const target = spaceIndex(2, 3);
        fire(spaces, spaceIndex(2, 2));
        spaces[target].hazmat = true;

        const result = resolveAdvanceFire(spaces, edges, [], 0, scriptedRolls(3, 4));

        expect(spaces[target].hazmat).toBe(false);
        expect(spaces[target].hotspot).toBe(false);
        expect(result.hotspotReserve).toBe(0);
    });
});

describe("hot spot flare-ups (§9.4, §17.6 step 8)", () => {
    it("fire newly placed on a pre-existing hot spot triggers one more full Advance Fire, consuming another roll", () => {
        const spaces = buildEmptySpaces();
        const edges = buildEmptyEdges();
        const hotspotSpace = spaceIndex(2, 3);
        fire(spaces, spaceIndex(2, 2)); // adjacent to the target, so it catches rather than explodes
        spaces[hotspotSpace].hotspot = true;

        // First roll (3,4) -> (2,3), the hot spot, catching fire. Second roll
        // (1,1) -> (0,0), the chained flare-up's own resolution.
        const result = resolveAdvanceFire(spaces, edges, [], 2, scriptedRolls(3, 4, 1, 1));

        expect(result.target).toBe(hotspotSpace);
        expect(result.flareUps).toHaveLength(1);
        expect(result.flareUps[0].rolls).toEqual({ d6: 1, d8: 1 });
        expect(result.flareUps[0].target).toBe(spaceIndex(0, 0));
        expect(spaces[spaceIndex(0, 0)].threat).toBe('smoke'); // (0,0) isn't adjacent to any fire
        expect(result.hotspotReserve).toBe(2); // untouched — no hazmat detonated
    });

    it("doesn't re-trigger a flare-up for a hot spot that was already burning", () => {
        const spaces = buildEmptySpaces();
        const edges = buildEmptyEdges();
        const hotspotSpace = spaceIndex(2, 1);
        fire(spaces, hotspotSpace); // already on fire *before* this Advance Fire
        spaces[hotspotSpace].hotspot = true;

        // Rolling the already-burning hot spot itself explodes it (§9.1's
        // fire-on-fire row) — not a "fire placed on a hot spot" event.
        const result = resolveAdvanceFire(spaces, edges, [], 0, scriptedRolls(3, 2));

        expect(result.target).toBe(hotspotSpace);
        expect(result.resolution).toBe('explosion');
        expect(result.flareUps).toEqual([]);
    });

    it("doesn't re-trigger a flare-up an ancestor's own loop rediscovers after a nested flare-up already resolved it", () => {
        const spaces = buildEmptySpaces();
        const edges = buildEmptyEdges();
        const h1 = spaceIndex(0, 0);
        const h2 = spaceIndex(5, 7); // a higher interior index — reached only through h1's own flare-up below, not this call's own roll
        spaces[h1].threat = 'smoke';
        spaces[h1].hotspot = true;
        spaces[h2].threat = 'smoke';
        spaces[h2].hotspot = true;

        // The primary roll catches h1; h1's flare-up catches h2; h2's own
        // flare-up rolls a harmless, unrelated target. Without a tree-wide
        // claimed-space record, the primary call's own for-loop — using its
        // own pre-call snapshot, which still says h2 "wasn't fire yet" —
        // would rediscover h2 once the nested flare-up sets it alight and
        // spawn a second, redundant flare-up for the same ignition. That
        // would need two more rolls than this test scripts, so a regression
        // here fails with "scriptedRolls exhausted" rather than a wrong count.
        const result = resolveAdvanceFire(spaces, edges, [], 0, scriptedRolls(1, 1, 6, 8, 4, 4));

        expect(result.target).toBe(h1);
        expect(result.flareUps).toHaveLength(1);
        expect(result.flareUps[0].target).toBe(h2);
        expect(result.flareUps[0].flareUps).toHaveLength(1);
        expect(result.flareUps[0].flareUps[0].flareUps).toEqual([]);
    });
});

describe("applyExperiencedSetup (§6.2, §17.6 step 8)", () => {
    it("resolves the tier's initial explosions, places its hazmats and hot spots, reserves the rest, and places 3 POIs", () => {
        const spaces = buildEmptySpaces();
        const edges = buildEmptyEdges();
        const poiPool = shuffledPoiPool();

        const { nextPoiId, hotspotReserve } = applyExperiencedSetup(spaces, edges, poiPool, 'veteran', 4, sequentialRolls());

        // Veteran: 3 explosions, 4 hazmats (fires-out-gdd.md §6.2's table).
        const fireCount = spaces.slice(0, INTERIOR_SPACE_COUNT).filter(s => s.threat === 'fire').length;
        expect(fireCount).toBeGreaterThanOrEqual(3);
        expect(spaces.filter(s => s.hazmat).length).toBe(4);

        // Crew of 4 -> base 3 (§6.2 step 4), +3 for Veteran = 6.
        const hotspotsPlaced = spaces.filter(s => s.hotspot).length;
        expect(hotspotsPlaced).toBe(6);
        expect(hotspotsPlaced + hotspotReserve).toBe(TOTAL_HOTSPOT_MARKERS); // conservation (§17.7)

        expect(poiCountOnBoard(spaces)).toBe(3);
        expect(nextPoiId).toBe(3);
    });

    it("scales the hot spot count down for a small crew and up for Heroic", () => {
        const spaces = buildEmptySpaces();
        const edges = buildEmptyEdges();
        const { hotspotReserve } = applyExperiencedSetup(spaces, edges, shuffledPoiPool(), 'heroic', 2, sequentialRolls());

        // Crew of 2 -> base 2, +3 for Heroic = 5.
        const hotspotsPlaced = spaces.filter(s => s.hotspot).length;
        expect(hotspotsPlaced).toBe(5);
        expect(hotspotsPlaced + hotspotReserve).toBe(TOTAL_HOTSPOT_MARKERS);
        expect(spaces.filter(s => s.hazmat).length).toBe(5); // Heroic's hazmat count
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

describe("isRescuePoint (§10.2, §17.6 step 9)", () => {
    it("rescues at any exterior space in the Family game", () => {
        expect(isRescuePoint('family', AMBULANCE_START, exteriorTopSpace(3))).toBe(true);
        expect(isRescuePoint('family', AMBULANCE_START, spaceIndex(0, 0))).toBe(false); // interior — not exterior at all
    });

    it("requires the Ambulance specifically in the Experienced game", () => {
        expect(isRescuePoint('experienced', AMBULANCE_START, AMBULANCE_START)).toBe(true);
        expect(isRescuePoint('experienced', AMBULANCE_START, exteriorTopSpace(3))).toBe(false);
        // Once the Ambulance has been driven, the new spot rescues.
        expect(isRescuePoint('experienced', exteriorBottomSpace(3), exteriorBottomSpace(3))).toBe(true);
    });
});

describe("legalDriveTargets (§8, §12.1-12.2, §17.6 step 9 — must mirror FiresOutLogic.ts's applyDrive)", () => {
    it("is empty unless the firefighter is at the vehicle's own space", () => {
        const ff = newFirefighter("u1", spaceIndex(0, 0));
        expect(legalDriveTargets(ff, ENGINE_START)).toEqual([]);
    });

    it("offers the adjacent parking spots once affordable, empty once AP runs out", () => {
        const ff = newFirefighter("u1", ENGINE_START);
        expect(legalDriveTargets(ff, ENGINE_START)).toEqual([exteriorTopSpace(COLS - 2)]);

        ff.apLeft = 0;
        expect(legalDriveTargets(ff, ENGINE_START)).toEqual([]);
    });
});

describe("deck gun (§12.3, §17.6 step 9)", () => {
    it("canFireDeckGunAt requires the firefighter at the Engine and a quadrant with no one in it", () => {
        const shooter = newFirefighter("u1", ENGINE_START);
        const bystander = newFirefighter("u2", spaceIndex(0, 0)); // quadrant 0

        expect(canFireDeckGunAt([shooter, bystander], shooter, ENGINE_START, spaceIndex(5, 7))).toBe(true); // quadrant 3 — clear
        expect(canFireDeckGunAt([shooter, bystander], shooter, ENGINE_START, spaceIndex(0, 1))).toBe(false); // quadrant 0 — occupied
        expect(canFireDeckGunAt([shooter, bystander], bystander, ENGINE_START, spaceIndex(5, 7))).toBe(false); // shooter not at the Engine
    });

    it("legalDeckGunTargets lists every space in an unoccupied quadrant, and none in an occupied one", () => {
        const shooter = newFirefighter("u1", ENGINE_START);
        const bystander = newFirefighter("u2", spaceIndex(0, 0)); // quadrant 0
        const targets = legalDeckGunTargets([shooter, bystander], shooter, ENGINE_START);

        expect(targets.length).toBe((INTERIOR_SPACE_COUNT / 4) * 3); // the other 3 quadrants
        expect(targets.every(s => quadrantOf(s) !== 0)).toBe(true);

        shooter.apLeft = 0;
        expect(legalDeckGunTargets([shooter, bystander], shooter, ENGINE_START)).toEqual([]);
    });

    it("rollTargetInQuadrant re-rolls until the d6/d8 lands inside the quadrant", () => {
        let i = 0;
        const rolls = [1, 1, 6, 8]; // (0,0) -> quadrant 0, then (5,7) -> quadrant 3
        const nextRoll = () => rolls[i++];
        expect(rollTargetInQuadrant(3, nextRoll)).toBe(spaceIndex(5, 7));
        expect(i).toBe(4); // both pairs consumed — the first was rejected
    });

    it("fireDeckGun clears fire/smoke from the rolled target and its orthogonal neighbours, leaving a diagonal untouched", () => {
        const spaces = buildEmptySpaces();
        const target = spaceIndex(5, 7); // a corner of quadrant 3 — fewer neighbours to clear
        spaces[target].threat = 'fire';
        spaces[spaceIndex(5, 6)].threat = 'smoke'; // orthogonal neighbour — cleared
        spaces[spaceIndex(4, 7)].threat = 'fire'; // the other orthogonal neighbour — cleared
        spaces[spaceIndex(4, 6)].threat = 'fire'; // diagonal, not orthogonal — untouched

        const result = fireDeckGun(spaces, 3, scriptedRolls(6, 8)); // (5,7) is already inside quadrant 3 — one roll, no re-rolling

        expect(result.target).toBe(target);
        expect(result.clearedSpaces.sort((a, b) => a - b)).toEqual([spaceIndex(4, 7), spaceIndex(5, 6), target].sort((a, b) => a - b));
        expect(spaces[target].threat).toBe('none');
        expect(spaces[spaceIndex(5, 6)].threat).toBe('none');
        expect(spaces[spaceIndex(4, 7)].threat).toBe('none');
        expect(spaces[spaceIndex(4, 6)].threat).toBe('fire'); // untouched — not orthogonal
    });

    it("reports no cleared spaces when the target and its neighbours were already clear", () => {
        const spaces = buildEmptySpaces();
        const result = fireDeckGun(spaces, 3, scriptedRolls(6, 8));
        expect(result.clearedSpaces).toEqual([]);
    });
});

describe("Specialists (§11, §17.6 step 10)", () => {
    it("has exactly 8 distinct specialists — at least MAX_PLAYERS, so dealSpecialists never runs short", () => {
        expect(SPECIALISTS).toHaveLength(8);
        expect(new Set(SPECIALISTS.map(s => s.id)).size).toBe(8);
        expect(SPECIALISTS.length).toBeGreaterThanOrEqual(MAX_PLAYERS);
    });

    it("specialistDef looks up a specialist's own table row", () => {
        expect(specialistDef('cafsFirefighter')).toEqual(SPECIALISTS.find(s => s.id === 'cafsFirefighter'));
    });

    it("dealSpecialists gives every seat a distinct specialist", () => {
        const turnOrder = ["u1", "u2", "u3", "u4"];
        const dealt = dealSpecialists(turnOrder);
        expect(dealt.size).toBe(4);
        const ids = turnOrder.map(u => dealt.get(u));
        expect(new Set(ids).size).toBe(4);
        for (const id of ids) expect(SPECIALISTS.some(s => s.id === id)).toBe(true);
    });

    describe("refillFirefighterAp", () => {
        it("gives the flat AP_PER_TURN in the Family game regardless of the (meaningless) specialist field", () => {
            const ff = newFirefighter("u1");
            ff.specialist = 'cafsFirefighter'; // stray value — must not leak through in Family
            ff.bankedAp = 2;
            refillFirefighterAp(ff, 'family');
            expect(ff.apLeft).toBe(4 + 2);
            expect(ff.restrictedAp).toBeNull();
        });

        it("gives each Experienced specialist their own base AP and restricted pool", () => {
            const generalist = newFirefighter("u1");
            generalist.specialist = 'generalist';
            refillFirefighterAp(generalist, 'experienced');
            expect(generalist.apLeft).toBe(5); // 4 base + 1 (§11)
            expect(generalist.restrictedAp).toBeNull();

            const cafs = newFirefighter("u2");
            cafs.specialist = 'cafsFirefighter';
            refillFirefighterAp(cafs, 'experienced');
            expect(cafs.apLeft).toBe(3);
            expect(cafs.restrictedAp).toEqual({ kind: 'extinguish', left: 3 });
        });

        it("adds banked AP on top of the specialist's base, and never banks restricted AP", () => {
            const ff = newFirefighter("u1");
            ff.specialist = 'fireCaptain';
            ff.bankedAp = 3;
            ff.restrictedAp = { kind: 'command', left: 1 }; // 1 left over from last turn — discarded, not banked
            refillFirefighterAp(ff, 'experienced');
            expect(ff.apLeft).toBe(4 + 3);
            expect(ff.restrictedAp).toEqual({ kind: 'command', left: 2 }); // fresh, full pool
            expect(ff.bankedAp).toBe(0);
        });
    });

    it("chopApCost/extinguishApCost/deckGunApCost only change for their own specialist", () => {
        const rescue = newFirefighter("u1"); rescue.specialist = 'rescueSpecialist';
        const paramedic = newFirefighter("u2"); paramedic.specialist = 'paramedic';
        const driver = newFirefighter("u3"); driver.specialist = 'driverOperator';
        const generalist = newFirefighter("u4");

        expect(chopApCost(rescue)).toBe(1);
        expect(chopApCost(generalist)).toBe(AP_COSTS.chop);
        expect(extinguishApCost(paramedic)).toBe(AP_COSTS.extinguish + 1);
        expect(extinguishApCost(generalist)).toBe(AP_COSTS.extinguish);
        expect(deckGunApCost(driver)).toBe(2);
        expect(deckGunApCost(generalist)).toBe(AP_COSTS.deckGun);
    });

    it("fireCaptainCanControlOthers is true only for that specialist", () => {
        expect(fireCaptainCanControlOthers('fireCaptain')).toBe(true);
        expect(fireCaptainCanControlOthers('generalist')).toBe(false);
    });

    describe("revealPoiAt (§10.1, shared by applyMove and the Imaging Technician's remote reveal)", () => {
        it("flips a victim and leaves the marker, but removes a false alarm", () => {
            const spaces = buildEmptySpaces();
            spaces[spaceIndex(0, 0)].poi = { id: 0, revealed: false, victim: true };
            spaces[spaceIndex(0, 1)].poi = { id: 1, revealed: false, victim: false };

            expect(revealPoiAt(spaces, spaceIndex(0, 0))).toEqual({ victim: true });
            expect(spaces[spaceIndex(0, 0)].poi).toEqual({ id: 0, revealed: true, victim: true });

            expect(revealPoiAt(spaces, spaceIndex(0, 1))).toEqual({ victim: false });
            expect(spaces[spaceIndex(0, 1)].poi).toBeNull();
        });

        it("returns null for an empty space or one already revealed", () => {
            const spaces = buildEmptySpaces();
            expect(revealPoiAt(spaces, spaceIndex(0, 0))).toBeNull();
            spaces[spaceIndex(0, 0)].poi = { id: 0, revealed: true, victim: true };
            expect(revealPoiAt(spaces, spaceIndex(0, 0))).toBeNull();
        });
    });

    it("legalRevealTargets is Imaging Technician only, and lists every unrevealed POI on the board", () => {
        const spaces = buildEmptySpaces();
        spaces[spaceIndex(0, 0)].poi = { id: 0, revealed: false, victim: true };
        spaces[spaceIndex(0, 1)].poi = { id: 1, revealed: true, victim: false };
        const tech = newFirefighter("u1"); tech.specialist = 'imagingTechnician';
        const generalist = newFirefighter("u2");

        expect(legalRevealTargets(spaces, tech)).toEqual([spaceIndex(0, 0)]);
        expect(legalRevealTargets(spaces, generalist)).toEqual([]);
    });

    it("canTreat requires a Paramedic, a revealed victim on their own space, and empty hands", () => {
        const spaces = buildEmptySpaces();
        const origin = spaceIndex(2, 1);
        spaces[origin].poi = { id: 0, revealed: true, victim: true };
        const paramedic = newFirefighter("u1", origin); paramedic.specialist = 'paramedic';
        const generalist = newFirefighter("u2", origin);

        expect(canTreat(spaces, paramedic)).toBe(true);
        expect(canTreat(spaces, generalist)).toBe(false);

        paramedic.carrying = 'hazmat';
        expect(canTreat(spaces, paramedic)).toBe(false);
    });

    it("canDisposeHazmatOnSite requires a Hazmat Technician and a hazmat on their own space", () => {
        const spaces = buildEmptySpaces();
        const origin = spaceIndex(2, 1);
        spaces[origin].hazmat = true;
        const tech = newFirefighter("u1", origin); tech.specialist = 'hazmatTechnician';
        const generalist = newFirefighter("u2", origin);

        expect(canDisposeHazmatOnSite(spaces, tech)).toBe(true);
        expect(canDisposeHazmatOnSite(spaces, generalist)).toBe(false);
    });

    it("canCrewChange requires the Experienced ruleset and starting the turn at the Engine", () => {
        const ff = newFirefighter("u1", ENGINE_START);
        expect(canCrewChange('experienced', ff, ENGINE_START)).toBe(true);
        expect(canCrewChange('family', ff, ENGINE_START)).toBe(false);
        expect(canCrewChange('experienced', ff, AMBULANCE_START)).toBe(false);
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
            resolveAdvanceFire(spaces, edges, firefighters, 0, scriptedRolls(2, round + 1));
            nextId = replenishPoi(spaces, pool, scriptedRolls(3, 1, 3, 2, 3, 3), nextId);

            expect(totalDamage(edges)).toBeLessThanOrEqual(24);
            expect(pool.length).toBeGreaterThanOrEqual(0);
            expect(poiCountOnBoard(spaces) + pool.length).toBeLessThanOrEqual(15);
        }
    });
});
