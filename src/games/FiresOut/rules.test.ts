import { describe, expect, it } from "vitest";
import {
    AMBULANCE_START,
    COLS,
    ENGINE_START,
    EDGE_COUNT,
    EXTERIOR_CORNERS,
    EXTERIOR_TOP_START,
    FAMILY_STARTING_FIRE,
    FAMILY_STARTING_POI,
    FALSE_ALARM_POI_COUNT,
    exteriorBottomSpace,
    exteriorTopSpace,
    INTERIOR_SPACE_COUNT,
    SPACE_COUNT,
    MAX_PLAYERS,
    quadrantOf,
    TOTAL_HOTSPOT_MARKERS,
    perimeterNeighbours,
    edgeBetween,
    spaceIndex,
    spacePhrase,
    VICTIM_POI_COUNT,
    DIFFICULTY_TIERS,
    DifficultyId,
    asRulesetId,
    difficultyTier,
} from "./board";
import { formatFiresOutResultStats } from "./FiresOutModels";
import { burnAllExcept } from "./testFixtures";
import {
    AP_COSTS,
    boardAtCurrentLayout,
    IFiresOutBoard,
    IFiresOutEdgeState,
    IFiresOutFirefighterState,
    IFiresOutSpaceState,
    SPECIALISTS,
    applyExperiencedSetup,
    applyFamilySetup,
    buildEmptyEdges,
    buildEmptySpaces,
    emptySpaceState,
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
    growBoardToCurrentLayout,
    fireCaptainCanControlOthers,
    fireDeckGun,
    flashover,
    isBuildingCollapsed,
    isRescuePoint,
    legalChopTargets,
    legalDeckGunTargets,
    legalDoorTargets,
    legalDriveTargets,
    otherVehicleSpace,
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
    rollValidTarget,
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

// A deterministic stream of small die faces: row-major (d6, d8) pairs, which
// is what §6.2's explosions consume two at a time (spaceForRoll). Setup's
// other placements take one roll each over their own legal-space list
// (rollValidTarget), so what this gives them is simply a repeatable low
// number — every face of it lands somewhere on an early-setup board.
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
        const origin = spaceIndex(2, 2);
        const corridor = [spaceIndex(2, 3), spaceIndex(2, 4), spaceIndex(2, 5)];
        fire(spaces, origin, ...corridor);

        explode(spaces, edges, origin);

        // The corridor is all one room (open edges) so the blast crosses all
        // three already-burning spaces before meeting the kitchen/games-room wall.
        const wallEdge = edgeBetween(spaceIndex(2, 5), spaceIndex(2, 6))!;
        expect(edges[wallEdge].damage).toBe(1);
        expect(spaces[spaceIndex(2, 6)].threat).toBe('none'); // the wall stopped it — not yet on fire
        for (const c of corridor) expect(spaces[c].threat).toBe('fire');
    });

    it("destroys a closed door in its path and stops, without damaging anything beyond it", () => {
        const spaces = buildEmptySpaces();
        const edges = buildEmptyEdges();
        const origin = spaceIndex(2, 1); // living room, adjacent to the living-room/kitchen door
        fire(spaces, origin);

        explode(spaces, edges, origin);

        const doorEdge = edgeBetween(spaceIndex(2, 1), spaceIndex(2, 2))!;
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

    it("radiates onto the exterior perimeter through the openings round the building", () => {
        const spaces = buildEmptySpaces();
        const edges = buildEmptyEdges();
        const origin = spaceIndex(0, 3);
        fire(spaces, origin);

        explode(spaces, edges, origin);

        expect(spaces[EXTERIOR_TOP_START + 3].threat).toBe('fire');
    });
});

describe("flashover (§9.3)", () => {
    // The real ROOM_GRID down row 0: cols 0-1 and 1-2 are open, 2-3 is a
    // door, and 4-5 is a wall segment. That geometry is the point of these
    // tests — flashover crosses only what fire can actually cross (§4, §8).
    it("flashes over a smoke-filled wing to a fixpoint in one call, even when the chain is more than one hop from the original fire", () => {
        const spaces = buildEmptySpaces();
        const edges = buildEmptyEdges();
        fire(spaces, spaceIndex(0, 0));
        spaces[spaceIndex(0, 1)].threat = 'smoke';
        spaces[spaceIndex(0, 2)].threat = 'smoke'; // two hops from the fire — only reachable via 0,1

        flashover(spaces, edges);

        expect(spaces[spaceIndex(0, 1)].threat).toBe('fire');
        expect(spaces[spaceIndex(0, 2)].threat).toBe('fire');
    });

    it("leaves smoke alone when nothing nearby is on fire", () => {
        const spaces = buildEmptySpaces();
        spaces[spaceIndex(3, 3)].threat = 'smoke';
        flashover(spaces, buildEmptyEdges());
        expect(spaces[spaceIndex(3, 3)].threat).toBe('smoke');
    });

    it("stops at an intact wall segment rather than flashing through it", () => {
        const spaces = buildEmptySpaces();
        const edges = buildEmptyEdges();
        const wall = edgeBetween(spaceIndex(0, 4), spaceIndex(0, 5))!;
        expect(edges[wall].kind).toBe('wall'); // guards the fixture against a ROOM_GRID change
        fire(spaces, spaceIndex(0, 4));
        spaces[spaceIndex(0, 5)].threat = 'smoke';

        flashover(spaces, edges);

        expect(spaces[spaceIndex(0, 5)].threat).toBe('smoke');
    });

    it("crosses that same wall once it has been chopped twice and destroyed", () => {
        const spaces = buildEmptySpaces();
        const edges = buildEmptyEdges();
        edges[edgeBetween(spaceIndex(0, 4), spaceIndex(0, 5))!].damage = 2;
        fire(spaces, spaceIndex(0, 4));
        spaces[spaceIndex(0, 5)].threat = 'smoke';

        flashover(spaces, edges);

        expect(spaces[spaceIndex(0, 5)].threat).toBe('fire');
    });

    it("is blocked by a closed door and let through by an open one (§8's tactical tool)", () => {
        const door = edgeBetween(spaceIndex(0, 2), spaceIndex(0, 3))!;

        const closed = buildEmptySpaces();
        const closedEdges = buildEmptyEdges();
        expect(closedEdges[door].kind).toBe('door');
        closedEdges[door].doorOpen = false;
        fire(closed, spaceIndex(0, 2));
        closed[spaceIndex(0, 3)].threat = 'smoke';
        flashover(closed, closedEdges);
        expect(closed[spaceIndex(0, 3)].threat).toBe('smoke');

        const open = buildEmptySpaces();
        const openEdges = buildEmptyEdges();
        openEdges[door].doorOpen = true;
        fire(open, spaceIndex(0, 2));
        open[spaceIndex(0, 3)].threat = 'smoke';
        flashover(open, openEdges);
        expect(open[spaceIndex(0, 3)].threat).toBe('fire');
    });
});

describe("§9.1's adjacency ignition respects the floorplan too", () => {
    it("smokes an empty space whose only neighbouring fire is behind a closed door, rather than igniting it", () => {
        const spaces = buildEmptySpaces();
        const edges = buildEmptyEdges();
        const door = edgeBetween(spaceIndex(0, 2), spaceIndex(0, 3))!;
        edges[door].doorOpen = false;
        fire(spaces, spaceIndex(0, 2));

        // §9.1 row 1: "nothing, not adjacent to fire" — the door means this
        // space is not adjacent to fire for spread purposes.
        expect(resolveTargetSpace(spaces, edges, spaceIndex(0, 3))).toBe('smoke');
        expect(spaces[spaceIndex(0, 3)].threat).toBe('smoke');
    });

    it("ignites it once that door is open (§9.1 row 2)", () => {
        const spaces = buildEmptySpaces();
        const edges = buildEmptyEdges();
        edges[edgeBetween(spaceIndex(0, 2), spaceIndex(0, 3))!].doorOpen = true;
        fire(spaces, spaceIndex(0, 2));

        expect(resolveTargetSpace(spaces, edges, spaceIndex(0, 3))).toBe('fire');
        expect(spaces[spaceIndex(0, 3)].threat).toBe('fire');
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

    it("knocks a firefighter caught by fire back to the start space, carrying their victim out with them (§10.3)", () => {
        const spaces = buildEmptySpaces();
        fire(spaces, spaceIndex(3, 3));
        const ff = newFirefighter("u1", spaceIndex(3, 3));
        ff.carrying = 'victim';

        const result = resolveFireConsequences(spaces, [ff]);

        expect(result.knockedDownIndices).toEqual([0]);
        expect(ff.space).not.toBe(spaceIndex(3, 3));
        // "Knocked down along with them rather than lost" — the victim stays
        // in their arms and still has to be walked to a rescue point, rather
        // than being counted as lost *or* silently destroyed.
        expect(ff.carrying).toBe('victim');
        expect(result.victimsLost).toBe(0);
    });

    it("carries an escorted victim (§11 Paramedic) out of a knock-down too", () => {
        const spaces = buildEmptySpaces();
        fire(spaces, spaceIndex(3, 3));
        const ff = newFirefighter("u1", spaceIndex(3, 3));
        ff.carrying = 'escort';

        const result = resolveFireConsequences(spaces, [ff]);

        expect(result.knockedDownIndices).toEqual([0]);
        expect(ff.carrying).toBe('escort');
        expect(result.victimsLost).toBe(0);
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

describe("the Family game's setup (§6.1)", () => {
    // board.test.ts pins what the two setup constants *are*; these pin that
    // applyFamilySetup writes them onto the board and touches nothing else.
    // Both constants are already in ascending order, so the boards below are
    // compared against them as-is.
    it("starts every door marker closed (§6.1 step 1)", () => {
        for (const edge of buildEmptyEdges()) expect(edge.doorOpen).toBe(false);
    });

    it("lights the printed starting fire and nothing else (§6.1 step 2)", () => {
        const spaces = buildEmptySpaces();
        applyFamilySetup(spaces, shuffledPoiPool());

        expect(spaces.flatMap((s, i) => s.threat === 'fire' ? [i] : [])).toEqual(FAMILY_STARTING_FIRE);
        expect(spaces.some(s => s.hazmat || s.hotspot)).toBe(false); // §6.1 step 7 sets both aside
    });

    it("places 3 face-down POIs from the 15-marker pool on the printed coordinates (§6.1 steps 3-4)", () => {
        const spaces = buildEmptySpaces();
        const poiPool = shuffledPoiPool();
        expect(poiPool).toHaveLength(VICTIM_POI_COUNT + FALSE_ALARM_POI_COUNT);

        applyFamilySetup(spaces, poiPool);

        expect(spaces.flatMap((s, i) => s.poi ? [i] : [])).toEqual(FAMILY_STARTING_POI);
        for (const space of FAMILY_STARTING_POI) expect(spaces[space].poi!.revealed).toBe(false);
        expect(poiPool).toHaveLength(VICTIM_POI_COUNT + FALSE_ALARM_POI_COUNT - 3); // drawn from the pool, not conjured
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

    it("logs one line per explosion with the rolled d6,d8", () => {
        const spaces = buildEmptySpaces();
        const edges = buildEmptyEdges();
        // Recruit: 3 explosions (fires-out-gdd.md §6.2's table).
        const { explosionLog } = applyExperiencedSetup(spaces, edges, shuffledPoiPool(), 'recruit', 3, sequentialRolls());

        expect(explosionLog).toHaveLength(3);
        for (const line of explosionLog) expect(line).toMatch(/^Setup: explosion rolled \d,\d — ignited the .+$/);
        // The very first roll is deterministic: sequentialRolls' first pair is (1,1).
        expect(explosionLog[0]).toBe(`Setup: explosion rolled 1,1 — ignited ${spacePhrase(spaceIndex(0, 0))}`);
    });
});

describe("replenishPoi (§7 Phase 3)", () => {
    it("never places on fire, or on a space that already holds a POI", () => {
        const spaces = buildEmptySpaces();
        fire(spaces, spaceIndex(0, 0)); // excluded: alight
        spaces[spaceIndex(0, 1)].poi = { id: 0, revealed: false, victim: true }; // excluded: taken
        const pool = [true];

        // One roll, over the legal spaces only — the first of which is (0,2).
        const nextId = replenishPoi(spaces, pool, scriptedRolls(1), 1);

        expect(pool).toHaveLength(0);
        expect(poiCountOnBoard(spaces)).toBe(2);
        expect(spaces[spaceIndex(0, 2)].poi).toEqual({ id: 1, revealed: false, victim: true });
        expect(nextId).toBe(2);
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

    it("places on the one space left clear, whatever the roll says", () => {
        // The late-game board. This used to spend 192 attempts (384 recorded
        // rolls) rolling coordinates that were all alight, then give up
        // silently and leave §7's board short of the POIs it requires.
        const spaces = buildEmptySpaces();
        const clear = spaceIndex(5, 7);
        burnAllExcept(spaces, clear);
        const pool = [true, true];
        let rolls = 0;
        const nextRoll = () => { rolls++; return 6; }; // off the end of a one-space list

        const nextId = replenishPoi(spaces, pool, nextRoll, 0);

        expect(spaces[clear].poi).toEqual({ id: 0, revealed: false, victim: true });
        expect(pool).toHaveLength(1); // one placed; then there is nowhere left
        expect(nextId).toBe(1);
        // One roll for the marker it placed, and none at all for the pass
        // after it: a board with nowhere legal needs no dice to say so.
        expect(rolls).toBe(1);
    });
});

describe("rollValidTarget (§6.2, §7, §12.3)", () => {
    it("answers null without rolling anything when no space is legal", () => {
        let rolls = 0;
        const target = rollValidTarget(() => { rolls++; return 1; }, () => false);

        expect(target).toBeNull();
        // The point of the finding: a board with nowhere to place is decided
        // by looking, not by rolling 192 coordinates and then giving up.
        expect(rolls).toBe(0);
    });

    it("spends exactly one roll, over the legal spaces in board order", () => {
        let rolls = 0;
        const target = rollValidTarget(() => { rolls++; return 3; }, () => true);

        expect(target).toBe(spaceIndex(0, 2)); // the 3rd space, every one being legal
        expect(rolls).toBe(1);
    });

    it("clamps a roll that doesn't match the list it is picking from", () => {
        // On replay `nextRoll` hands back whatever the command recorded, and a
        // log written while this rolled a d6/d8 pair per attempt can offer a
        // face bigger than the list. Answering `undefined` would put a POI in
        // `spaces[undefined]` — replenishPoi's `null` check walks straight
        // past it.
        const onlyTheMiddle = (space: number) => space === spaceIndex(2, 2);

        expect(rollValidTarget(() => 8, onlyTheMiddle)).toBe(spaceIndex(2, 2));
        expect(rollValidTarget(() => 0, onlyTheMiddle)).toBe(spaceIndex(2, 2));
    });
});

describe("reachability (§17.6 step 5 — must mirror FiresOutLogic.ts's own Execute checks)", () => {
    it("legalMoveTargets excludes a space blocked by an undamaged wall, and excludes fire when carrying but not otherwise", () => {
        const spaces = buildEmptySpaces();
        const edges = buildEmptyEdges();
        const origin = spaceIndex(3, 1);
        const ff = newFirefighter("u1", origin);
        spaces[spaceIndex(3, 0)].threat = 'fire';

        // (3,1)-(3,2) is walled; (3,0)/(2,1) are open same-room neighbours.
        const notCarrying = legalMoveTargets(spaces, edges, ff, false);
        expect(notCarrying).toContain(spaceIndex(2, 1));
        expect(notCarrying).toContain(spaceIndex(3, 0)); // fire is fine unless carrying
        expect(notCarrying).not.toContain(spaceIndex(3, 2)); // walled off

        const carrying = legalMoveTargets(spaces, edges, ff, true);
        expect(carrying).not.toContain(spaceIndex(3, 0)); // blocked while carrying
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
        const ff = newFirefighter("u1", spaceIndex(2, 1)); // beside the living-room/kitchen door
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
        const ff = newFirefighter("u1", spaceIndex(0, 4)); // bathroom, against the bedroom wall
        const wallEdge = edgeBetween(spaceIndex(0, 4), spaceIndex(0, 5))!;

        expect(legalChopTargets(edges, ff)).toEqual([spaceIndex(0, 5)]);

        edges[wallEdge].damage = 2;
        expect(legalChopTargets(edges, ff)).toEqual([]);
    });

    // §11: legalMoveTargets/legalChopTargets/legalExtinguishTargets pass a
    // restricted-AP kind into canAffordAp now, not always null — these prove
    // that mirrors Execute's own spendAp call exactly: a firefighter with 0
    // general apLeft still reaches a target funded entirely by their
    // specialist's own restricted pool, the same as applyChop/applyMove/
    // applyExtinguish (FiresOutLogic.ts) would actually let them pay for it.
    it("legalMoveTargets and legalChopTargets stay reachable off a Rescue Specialist's moveChop pool alone", () => {
        const spaces = buildEmptySpaces();
        const edges = buildEmptyEdges();
        const ff = newFirefighter("u1", spaceIndex(0, 4)); // bathroom, against the bedroom wall
        ff.specialist = 'rescueSpecialist';
        ff.apLeft = 0;
        ff.restrictedAp = { kind: 'moveChop', left: 3 };

        expect(legalMoveTargets(spaces, edges, ff, false)).toContain(spaceIndex(0, 3));
        expect(legalChopTargets(edges, ff)).toEqual([spaceIndex(0, 5)]);

        ff.restrictedAp = { kind: 'moveChop', left: 0 };
        expect(legalMoveTargets(spaces, edges, ff, false)).toEqual([]); // pool spent, general AP empty too
        expect(legalChopTargets(edges, ff)).toEqual([]);
    });

    it("legalExtinguishTargets stays reachable off a CAFS Firefighter's extinguish pool alone", () => {
        const spaces = buildEmptySpaces();
        const ff = newFirefighter("u1", spaceIndex(2, 1));
        ff.specialist = 'cafsFirefighter';
        ff.apLeft = 0;
        ff.restrictedAp = { kind: 'extinguish', left: 3 };
        spaces[ff.space].threat = 'smoke';

        expect(legalExtinguishTargets(spaces, ff)).toContain(ff.space);

        ff.restrictedAp = { kind: 'extinguish', left: 0 };
        expect(legalExtinguishTargets(spaces, ff)).toEqual([]);
    });

    it("legalDoorTargets stays reachable off a Fire Captain's command pool alone", () => {
        const edges = buildEmptyEdges();
        const ff = newFirefighter("u1", spaceIndex(2, 1)); // beside the living-room/kitchen door
        ff.specialist = 'fireCaptain';
        ff.apLeft = 0;
        ff.restrictedAp = { kind: 'command', left: 2 };

        expect(legalDoorTargets(edges, ff)).toEqual([spaceIndex(2, 2)]);

        ff.restrictedAp = { kind: 'command', left: 0 };
        expect(legalDoorTargets(edges, ff)).toEqual([]);
    });

    it("an unrelated restricted pool never funds a different action — general AP only", () => {
        const spaces = buildEmptySpaces();
        const edges = buildEmptyEdges();
        const ff = newFirefighter("u1", spaceIndex(2, 1));
        ff.specialist = 'cafsFirefighter';
        ff.apLeft = 0;
        ff.restrictedAp = { kind: 'extinguish', left: 3 }; // can't fund a chop

        expect(legalChopTargets(edges, ff)).toEqual([]);
        expect(legalMoveTargets(spaces, edges, ff, false)).toEqual([]);
    });
});

describe("growBoardToCurrentLayout / boardAtCurrentLayout (a board saved before the exterior perimeter)", () => {
    /** A board as it was persisted before the perimeter ring: 64 spaces, 98 edges. */
    function legacyBoard(): IFiresOutBoard {
        return {
            spaces: buildEmptySpaces().slice(0, INTERIOR_SPACE_COUNT + 16),
            edges: buildEmptyEdges().slice(0, 98),
        };
    }

    it("appends the spaces and edges the perimeter added, as blanks", () => {
        const grown = boardAtCurrentLayout(legacyBoard());

        expect(grown.spaces).toHaveLength(SPACE_COUNT);
        expect(grown.edges).toHaveLength(EDGE_COUNT);
        expect(grown.spaces.slice(INTERIOR_SPACE_COUNT + 16)).toEqual(
            grown.spaces.slice(INTERIOR_SPACE_COUNT + 16).map(() => emptySpaceState()));
        expect(grown.edges.slice(98).every(e => e.kind === 'open' && e.damage === 0 && !e.doorOpen)).toBe(true);
    });

    it("leaves the walls, doors and damage the game already holds exactly as they are", () => {
        const board = legacyBoard();
        const chopped = edgeBetween(spaceIndex(3, 1), spaceIndex(3, 2))!;
        board.edges[chopped].damage = 1;
        const before = board.edges.map(e => ({ ...e }));

        expect(boardAtCurrentLayout(board).edges.slice(0, 98)).toEqual(before);
    });

    it("does nothing to a board already the current size, and never mutates the one it reads", () => {
        const current: IFiresOutBoard = { spaces: buildEmptySpaces(), edges: buildEmptyEdges() };
        expect(boardAtCurrentLayout(current)).toBe(current); // nothing to grow — the same object back

        const legacy = legacyBoard();
        boardAtCurrentLayout(legacy);
        expect(legacy.spaces).toHaveLength(INTERIOR_SPACE_COUNT + 16);
        expect(legacy.edges).toHaveLength(98);

        growBoardToCurrentLayout(legacy); // the in-place variant is the one that writes
        expect(legacy.spaces).toHaveLength(SPACE_COUNT);
        expect(legacy.edges).toHaveLength(EDGE_COUNT);
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
    const parking = { engine: ENGINE_START, ambulance: AMBULANCE_START };

    it("is empty unless the firefighter is at the vehicle's own space", () => {
        const ff = newFirefighter("u1", spaceIndex(0, 0));
        expect(legalDriveTargets(ff, parking, 'engine')).toEqual([]);
    });

    it("offers the adjacent parking spots once affordable, empty once AP runs out", () => {
        const ff = newFirefighter("u1", ENGINE_START);
        expect(legalDriveTargets(ff, parking, 'engine')).toEqual(
            expect.arrayContaining([exteriorTopSpace(COLS - 2), EXTERIOR_CORNERS.topRight]));

        ff.apLeft = 0;
        expect(legalDriveTargets(ff, parking, 'engine')).toEqual([]);
    });

    it("never offers the spot the other vehicle is parked on — the perimeter is one connected ring", () => {
        const ff = newFirefighter("u1", ENGINE_START);
        const alongside = perimeterNeighbours(ENGINE_START)[0];
        expect(legalDriveTargets(ff, { engine: ENGINE_START, ambulance: alongside }, 'engine')).not.toContain(alongside);
        expect(otherVehicleSpace({ engine: ENGINE_START, ambulance: alongside }, 'engine')).toBe(alongside);
        expect(otherVehicleSpace({ engine: ENGINE_START, ambulance: alongside }, 'ambulance')).toBe(ENGINE_START);
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

    it("rollTargetInQuadrant rolls one of the quadrant's own spaces", () => {
        let i = 0;
        const nextRoll = () => { i++; return 12; }; // the last of quadrant 3's 12 spaces
        expect(rollTargetInQuadrant(3, nextRoll)).toBe(spaceIndex(5, 7));
        expect(i).toBe(1);

        // Every face of that roll is inside the quadrant, so §12.3's "roll for
        // a target space within it" never has anything to reject.
        for (let face = 1; face <= 12; face++) {
            expect(quadrantOf(rollTargetInQuadrant(3, () => face))).toBe(3);
        }
    });

    it("fireDeckGun clears fire/smoke from the rolled target and its orthogonal neighbours, leaving a diagonal untouched", () => {
        const spaces = buildEmptySpaces();
        const target = spaceIndex(5, 7); // a corner of quadrant 3 — fewer neighbours to clear
        spaces[target].threat = 'fire';
        spaces[spaceIndex(5, 6)].threat = 'smoke'; // orthogonal neighbour — cleared
        spaces[spaceIndex(4, 7)].threat = 'fire'; // the other orthogonal neighbour — cleared
        spaces[spaceIndex(4, 6)].threat = 'fire'; // diagonal, not orthogonal — untouched

        const result = fireDeckGun(spaces, 3, scriptedRolls(12)); // the 12th space of quadrant 3 is (5,7)

        expect(result.target).toBe(target);
        expect(result.clearedSpaces.sort((a, b) => a - b)).toEqual([spaceIndex(4, 7), spaceIndex(5, 6), target].sort((a, b) => a - b));
        expect(spaces[target].threat).toBe('none');
        expect(spaces[spaceIndex(5, 6)].threat).toBe('none');
        expect(spaces[spaceIndex(4, 7)].threat).toBe('none');
        expect(spaces[spaceIndex(4, 6)].threat).toBe('fire'); // untouched — not orthogonal
    });

    it("reports no cleared spaces when the target and its neighbours were already clear", () => {
        const spaces = buildEmptySpaces();
        const result = fireDeckGun(spaces, 3, scriptedRolls(12));
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
        //
        // §17.7 asks for *equality*: "what's on the board plus what's in
        // reserve equals what the game started with". A `<=` assertion can't
        // tell conservation from leakage, which is exactly how a knocked-down
        // firefighter destroying the victim in their arms went unnoticed —
        // the count only ever fell. Victims are the checkable half of the
        // pool (a revealed false alarm legitimately leaves play, §10.1), so
        // every one of the 10 must be on the board, in the pool, in
        // somebody's arms, rescued or counted lost.
        const victimsAccountedFor = (): number =>
            rescued + lost
            + pool.filter(isVictim => isVictim).length
            + spaces.slice(0, INTERIOR_SPACE_COUNT).filter(s => s.poi?.victim).length
            + firefighters.filter(ff => ff.carrying === 'victim' || ff.carrying === 'escort').length;

        // This sequence never rescues; `lost` accumulates what the fire took.
        const rescued = 0;
        let lost = 0;

        // A firefighter in the fire's way, holding a victim — the knock-down
        // path that used to make a marker vanish.
        firefighters[0].space = spaceIndex(1, 1);
        firefighters[0].carrying = 'victim';
        pool.splice(pool.findIndex(isVictim => isVictim), 1); // the one they're holding

        expect(victimsAccountedFor()).toBe(VICTIM_POI_COUNT);

        for (let round = 0; round < COLS; round++) {
            const advance = resolveAdvanceFire(spaces, edges, firefighters, 0, scriptedRolls(2, round + 1));
            lost += advance.consequences.victimsLost;
            nextId = replenishPoi(spaces, pool, scriptedRolls(3, 1, 3), nextId); // one roll per marker placed

            expect(totalDamage(edges)).toBeLessThanOrEqual(24);
            expect(pool.length).toBeGreaterThanOrEqual(0);
            expect(victimsAccountedFor()).toBe(VICTIM_POI_COUNT);
        }
    });
});

// Only POST /api/newgame/firesout validates `difficulty`, and only when the
// host opens no seats; with a seat open the client goes through POST
// /api/lobby, which spreads its per-game settings into the invitation
// unchecked against a `difficulty: String` schema. An unknown value used to
// throw off difficultyTier's `!` — inside CreateGame, *before* the
// transaction consumed the invitation, so the invite was left accepted with
// no game and every retry threw again — and again later in
// formatFiresOutResultStats. Both paths now default instead.
describe("an unrecognised ruleset/difficulty never throws (§6.2, the /api/lobby path)", () => {
    const JUNK = ['nightmare', '', 'RECRUIT', undefined, null, 7, {}] as unknown[];

    it("difficultyTier falls back to the first tier", () => {
        for (const value of JUNK) {
            expect(difficultyTier(value as DifficultyId)).toEqual(DIFFICULTY_TIERS[0]);
        }
    });

    it("difficultyTier().id / asRulesetId narrow anything to a real id — what CreateGame stores", () => {
        for (const value of JUNK) {
            expect(difficultyTier(value as DifficultyId).id).toBe('recruit');
            expect(asRulesetId(value)).toBe('family');
        }
        expect(difficultyTier('heroic').id).toBe('heroic');
        expect(asRulesetId('experienced')).toBe('experienced');
    });

    it("applyExperiencedSetup builds a playable board rather than throwing", () => {
        const spaces = buildEmptySpaces();
        const edges = buildEmptyEdges();
        const pool = shuffledPoiPool();

        expect(() => applyExperiencedSetup(spaces, edges, pool, 'nightmare' as DifficultyId, 3, sequentialRolls()))
            .not.toThrow();
        expect(poiCountOnBoard(spaces)).toBe(3);
    });

    it("formatFiresOutResultStats renders a label rather than throwing", () => {
        const groups = formatFiresOutResultStats({
            rescued: 2, lost: 1, damage: 5, turnsLasted: 9,
            ruleset: 'experienced', difficulty: 'nightmare' as DifficultyId,
        });
        expect(groups.flatMap(g => g.lines).join(' ')).toContain(DIFFICULTY_TIERS[0].label);
    });
});
