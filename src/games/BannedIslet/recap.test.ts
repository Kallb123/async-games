import { describe, expect, it } from "vitest";
import { bannedIsletRecapAdapter } from "./recap";
import { ACTIONS_PER_TURN, PIER_TILE, TILE_IDS, TREASURE_IDS, tileName, treasureName } from "./board";
import type { BannedIsletTileId, BannedIsletTreasureId } from "./board";
import type { IBannedIsletFloodPhaseOutcome } from "./BannedIsletLogic";
import type { IBannedIsletSpecificGameStateResponse, IBannedIsletPlayerStateResponse } from "./apiModels";
import { island, MIDDLE, NORTH_OF_MIDDLE, SOUTH_OF_MIDDLE } from "./testFixtures";
import type { IIslandOptions } from "./testFixtures";
import type { ITurnSnapshot } from "@/utils/games/replay";
import type { IGameCommand } from "@/utils/apiModels/GameLogic";

const ALICE = "u1";
const BOB = "u2";

function seat(overrides: Partial<IBannedIsletPlayerStateResponse> & { userId: string; username: string }): IBannedIsletPlayerStateResponse {
    return {
        hand: [],
        position: MIDDLE,
        role: 'messenger',
        actionsLeft: ACTIONS_PER_TURN,
        pilotFlightUsed: false,
        ...overrides,
    };
}

function state(overrides: Partial<IBannedIsletSpecificGameStateResponse> = {}, islandOptions: IIslandOptions = {}): IBannedIsletSpecificGameStateResponse {
    return {
        difficulty: 'normal',
        positions: island(islandOptions),
        waterLevel: 2,
        treasures: Object.fromEntries(TREASURE_IDS.map(id => [id, false])) as Record<BannedIsletTreasureId, boolean>,
        treasureDeckCount: 0,
        treasureDiscard: [],
        floodDeckCount: 0,
        floodDiscard: [],
        playerStates: {
            [ALICE]: seat({ userId: ALICE, username: "Alice" }),
            [BOB]: seat({ userId: BOB, username: "Bob" }),
        },
        phase: 'actions',
        ...overrides,
    };
}

function snap(gs: IBannedIsletSpecificGameStateResponse, overrides: Partial<ITurnSnapshot> = {}): ITurnSnapshot {
    return { index: 0, specificGameState: gs, currentTurn: ALICE, complete: false, winner: "", history: [], command: null, planned: false, ...overrides };
}

function cmd(overrides: Partial<IGameCommand> & { className: string }): IGameCommand {
    return {
        id: "c1",
        timestamp: "2026-09-12T09:00:00.000Z",
        senderId: ALICE,
        senderUsername: "Alice",
        ...overrides,
    } as unknown as IGameCommand;
}

function endTurn(outcome: IBannedIsletFloodPhaseOutcome, prev = snap(state()), next = snap(state())) {
    return bannedIsletRecapAdapter.toEvents(prev, next, cmd({ className: "BannedIsletEndTurn" }), outcome);
}

function flood(floodLog: IBannedIsletFloodPhaseOutcome['floodLog']): IBannedIsletFloodPhaseOutcome {
    return { validMove: true, turnOver: true, floodLog };
}

/** Two tiles a test can name, whichever way the island shuffled. */
const [FIRST_TILE, SECOND_TILE] = TILE_IDS as readonly BannedIsletTileId[];

describe("Banned Islet recap adapter — the island getting smaller (§21.5)", () => {
    it("gives a sinking its own row, naming the tile that is gone for good", () => {
        const events = endTurn(flood([{ kind: 'flood', tile: FIRST_TILE, outcome: 'sunk' }]));

        expect(events).toHaveLength(1);
        expect(events[0].type).toBe("bi_sink");
        expect(events[0].title).toBe(`${tileName(FIRST_TILE)} is gone for good`);
    });

    it("folds several sinkings from one flood phase into one row that names them all", () => {
        const events = endTurn(flood([
            { kind: 'flood', tile: FIRST_TILE, outcome: 'sunk' },
            { kind: 'flood', tile: SECOND_TILE, outcome: 'sunk' },
        ]));

        expect(events).toHaveLength(1);
        expect(events[0].title).toBe("2 tiles went under for good");
        expect(events[0].detail).toBe(`${tileName(FIRST_TILE)} and ${tileName(SECOND_TILE)}`);
    });

    it("reports a flood-only phase rather than staying silent about the sea's turn", () => {
        const events = endTurn(flood([
            { kind: 'flood', tile: FIRST_TILE, outcome: 'flooded' },
            { kind: 'flood', tile: SECOND_TILE, outcome: 'flooded' },
        ]));

        expect(events).toHaveLength(1);
        expect(events[0].type).toBe("bi_flood");
        expect(events[0].title).toBe("The tide came in — 2 tiles flooded");
    });

    it("lets a sinking speak for the phase rather than counting the floods beside it twice", () => {
        const events = endTurn(flood([
            { kind: 'flood', tile: FIRST_TILE, outcome: 'flooded' },
            { kind: 'flood', tile: SECOND_TILE, outcome: 'sunk' },
        ]));

        expect(events.map(e => e.type)).toEqual(["bi_sink"]);
    });

    it("says nothing at all for a command that ran no flood phase", () => {
        expect(bannedIsletRecapAdapter.toEvents(snap(state()), snap(state()), cmd({ className: "BannedIsletAction" }), { validMove: true, turnOver: false }))
            .toEqual([]);
    });
});

describe("Banned Islet recap adapter — the forced swim (§9.2, §21.3)", () => {
    it("gives each swim its own row, naming the swimmer and where they surfaced", () => {
        const next = snap(state({}, { sunk: [MIDDLE] }));
        const events = endTurn(
            flood([{ kind: 'flood', tile: FIRST_TILE, outcome: 'sunk', swims: [{ userId: BOB, from: MIDDLE, to: NORTH_OF_MIDDLE }] }]),
            snap(state()),
            next,
        );

        const swim = events.find(e => e.type === "bi_swim");
        const tile = (next.specificGameState as IBannedIsletSpecificGameStateResponse).positions[NORTH_OF_MIDDLE].tile;
        expect(swim?.title).toBe(`Bob swam to ${tileName(tile)}`);
        expect(swim?.affectedIds).toEqual([BOB]);
    });

    it("says so when a pawn went into the water with nowhere to swim", () => {
        const events = endTurn(flood([
            { kind: 'flood', tile: FIRST_TILE, outcome: 'sunk', swims: [{ userId: BOB, from: MIDDLE, to: null }] },
        ]));

        const swim = events.find(e => e.type === "bi_swim");
        expect(swim?.title).toBe("Bob went into the water with nowhere to swim");
        expect(swim?.glyph).toBe("💀");
    });
});

describe("Banned Islet recap adapter — Waters Rise! and captures", () => {
    it("gives Waters Rise! a row that says how much faster the island now sinks", () => {
        const events = endTurn(flood([{ kind: 'watersRise', waterLevelAfter: 3, floodRateAfter: 3, shuffledBack: 7 }]));

        expect(events).toHaveLength(1);
        expect(events[0].type).toBe("bi_watersrise");
        expect(events[0].title).toBe("Waters Rise! The water meter climbs to level 3");
        expect(events[0].detail).toContain("7 flood cards");
    });

    it("gives a captured relic a row, whichever command claimed it", () => {
        const captured = { ...state().treasures, emberCrown: true };
        const events = bannedIsletRecapAdapter.toEvents(
            snap(state()),
            snap(state({ treasures: captured })),
            cmd({ className: "BannedIsletAction" }),
            { validMove: true, turnOver: false },
        );

        expect(events).toHaveLength(1);
        expect(events[0].type).toBe("bi_capture");
        expect(events[0].title).toBe(`Alice captured the ${treasureName('emberCrown')}!`);
        expect(events[0].detail).toBe("1 of 4 relics aboard");
    });
});

describe("Banned Islet recap adapter — the ending", () => {
    const allCaptured = Object.fromEntries(TREASURE_IDS.map(id => [id, true])) as Record<BannedIsletTreasureId, boolean>;

    it("reads the escape as a win from the island rather than from the command", () => {
        // Everyone on Beacon Pier with all four relics: the only state §4.1's
        // win can leave behind.
        const pier = island({ tiles: { [MIDDLE]: PIER_TILE } });
        const escaped = state({
            positions: pier,
            treasures: allCaptured,
            playerStates: {
                [ALICE]: seat({ userId: ALICE, username: "Alice", position: MIDDLE }),
                [BOB]: seat({ userId: BOB, username: "Bob", position: MIDDLE }),
            },
        });

        const events = bannedIsletRecapAdapter.toEvents(
            snap(state({ treasures: allCaptured })),
            snap(escaped, { complete: true }),
            cmd({ className: "BannedIsletPlayCard" }),
            { validMove: true, turnOver: true },
        );

        const ending = events.find(e => e.type === "bi_win");
        expect(ending?.title).toContain("they win!");
        expect(ending?.affectedIds).toEqual([ALICE, BOB]);
    });

    it("reads a defeat as a loss, in the words the game logged it in", () => {
        const lost = snap(state({}, { sunk: [SOUTH_OF_MIDDLE] }), {
            complete: true,
            history: [{ text: "The team loses — the water level reached 10." }] as ITurnSnapshot['history'],
        });

        const events = endTurn(flood([{ kind: 'watersRise', waterLevelAfter: 10, shuffledBack: 0 }]), snap(state()), lost);

        const ending = events.find(e => e.type === "bi_loss");
        expect(ending?.title).toBe("The team loses — the water level reached 10.");
    });
});

describe("Banned Islet recap adapter — the summary and the tip", () => {
    it("leads on the sea taking the island when the game ended in a loss", () => {
        const events = endTurn(flood([{ kind: 'flood', tile: FIRST_TILE, outcome: 'sunk' }]), snap(state()), snap(state(), {
            complete: true,
            history: [{ text: "The team loses — Beacon Pier sank." }] as ITurnSnapshot['history'],
        }));

        expect(bannedIsletRecapAdapter.summarize(events, ALICE).subline).toContain("the sea took the island");
    });

    it("counts the beats of a quiet away-window without counting the ending as one", () => {
        const events = endTurn(flood([
            { kind: 'flood', tile: FIRST_TILE, outcome: 'sunk' },
            { kind: 'flood', tile: SECOND_TILE, outcome: 'flooded' },
        ]));

        expect(bannedIsletRecapAdapter.summarize(events, ALICE).subline).toBe("1 thing happened while you were away — the island is smaller.");
    });

    it("tips a treasure down to one flooded tile ahead of everything else", () => {
        // Both Ember Crown tiles named into known positions, one sunk and the
        // other flooded: one flood card from §4.2's treasure loss.
        const gs = state({}, {
            tiles: { [NORTH_OF_MIDDLE]: 'cinderTemple', [SOUTH_OF_MIDDLE]: 'ashfallHollow' },
            sunk: [NORTH_OF_MIDDLE],
            flooded: [SOUTH_OF_MIDDLE],
        });

        expect(bannedIsletRecapAdapter.tip!(gs, ALICE)?.text).toContain(
            `Ashfall Hollow is the last tile the ${treasureName('emberCrown')} sits on`,
        );
    });

    it("tells a player standing on a treasure with the four cards it costs to capture it", () => {
        const gs = state({
            playerStates: {
                [ALICE]: seat({ userId: ALICE, username: "Alice", position: MIDDLE, hand: ['stormIdol', 'stormIdol', 'stormIdol', 'stormIdol'] }),
                [BOB]: seat({ userId: BOB, username: "Bob" }),
            },
        }, { tiles: { [MIDDLE]: 'whistlingSpire' } });

        expect(bannedIsletRecapAdapter.tip!(gs, ALICE)?.text).toContain("capture it");
    });

    it("tells a player one card short who to ask rather than where to stand", () => {
        const gs = state({
            playerStates: {
                [ALICE]: seat({ userId: ALICE, username: "Alice", hand: ['rootStone', 'rootStone', 'rootStone'] }),
                [BOB]: seat({ userId: BOB, username: "Bob" }),
            },
        });

        expect(bannedIsletRecapAdapter.tip!(gs, ALICE)?.text).toContain("one card off the Root Stone");
    });

    it("warns a player whose own tile is flooded, and says nothing on a dry island", () => {
        const flooded = state({
            playerStates: {
                [ALICE]: seat({ userId: ALICE, username: "Alice", position: MIDDLE }),
            },
        }, { flooded: [MIDDLE] });

        expect(bannedIsletRecapAdapter.tip!(flooded, ALICE)?.text).toContain("one more card and you are swimming");
        expect(bannedIsletRecapAdapter.tip!(state(), ALICE)).toBeNull();
    });
});
