import { afterEach, describe, expect, it, vi } from "vitest";
import { buildTimeline } from "@/utils/games/replay";
import { gameStateToModel } from "./RealmArenaModels";
import type { RealmArenaEndTurn } from "./RealmArenaLogic";
import { seedRolls, playScriptedBattle, battleOf } from "./testFixtures";
import { isWarband } from "./rules";

// docs/games/realm-arena.md §39.5: a battle in which the Swarm's warband fields
// the elites replays to exactly the state it ended in. Nobody can muster one,
// so this file gives the Swarm a ready-made squad of its own — in a mocked
// catalogue, which is why it is a file of its own — and lets the planner play it.

vi.mock("./catalogues/v12", async importOriginal => {
    const { catalogueV12 } = await importOriginal<typeof import("./catalogues/v12")>();
    const squad = ["broodQueen", "bileLobber", "carapaceBrute", "skitterling"];
    const readyMade = Object.fromEntries(Object.keys(catalogueV12.FACTIONS.swarm.readyMade).map(budget => [budget, squad]));
    return { catalogueV12: { ...catalogueV12, FACTIONS: { ...catalogueV12.FACTIONS, swarm: { ...catalogueV12.FACTIONS.swarm, readyMade } } } };
});
vi.mock("./masteryRecord", () => ({ masterySnapshotOf: vi.fn(async () => ({})) }));
vi.mock("@/utils/users/clerk", () => ({ userIdListToNamesAndMap: async (ids: string[]) => ({ usernameList: ids, userIdNameMap: Object.fromEntries(ids.map(id => [id, id])) }) }));

afterEach(() => vi.restoreAllMocks());

describe("a replay of a Hold Out against a Swarm of elites (§39.5)", () => {
    it.each([false, true])("hatches and spits bile as the planner chose, and lands on exactly the live state without rolling anything again (fog of war: %s)", async fog => {
        seedRolls(4);
        const game = await playScriptedBattle({ rulesVersion: 12, fog, coop: { enemy: "swarm", mission: "holdOut" } });
        const history = game.gameState.commandHistory;
        const recorded = history.flatMap(command => (command as RealmArenaEndTurn).recordedEnemyActions ?? []);
        const kinds = new Set(recorded.map(action => action.kind));
        // The Queen hatched, and a Lobber's bile fell, in the battle that is replayed.
        expect(kinds.has("hatch")).toBe(true);
        expect(kinds.has("bile")).toBe(true);
        expect(game.specificGameState.fighters.some(one => one.hatchedBy !== undefined && isWarband(one.owner))).toBe(true);

        const random = vi.spyOn(Math, "random").mockImplementation(() => { throw new Error("replay consumed randomness"); });
        try {
            const timeline = await buildTimeline(game, { a: "Alice", b: "Bob" }, [], undefined, "a");
            const last = timeline.snapshots[timeline.currentIndex];
            expect(last.specificGameState).toEqual(gameStateToModel(game.specificGameState, "a", history.at(-1)?.id ?? null, true));
        } finally {
            random.mockRestore();
        }
        expect(battleOf(game).fighters.length).toBeGreaterThan(8);
    }, 60_000);
});
