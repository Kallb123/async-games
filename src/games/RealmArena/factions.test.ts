import { describe, expect, it, vi } from "vitest";
import { resolveStalledTurn } from "@/utils/games/turnTimeout";
import { FACTIONS, playableFactionsOf, readyMadeSquad, type FactionId } from "./characters";
import { battlefieldById } from "./maps";
import { RealmArenaInvitationModel, settingsOf, type IRealmArenaGameData } from "./RealmArenaModels";
import { readyMadeMuster } from "./rules";
import { cmd, makeGame, play, readyMadePicks, responseFor, type RealmArenaTestGame } from "./testFixtures";
import { budgetOf, RealmArenaMuster } from "./RealmArenaLogic";

// docs/games/realm-arena.md B6: the host chooses which factions the players
// may muster from — any of them, at least one — and each player picks one of
// those as they muster, held to its roster.

vi.mock("./masteryRecord", () => ({ masterySnapshotOf: vi.fn(async () => ({})) }));
vi.mock("@/utils/users/clerk", () => ({
    userIdListToNamesAndMap: async (ids: string[]) => ({ usernameList: ids, userIdNameMap: Object.fromEntries(ids.map(id => [id, id])) }),
}));

const createGame = RealmArenaInvitationModel.schema.methods.CreateGame as
    (this: unknown, invite: unknown, userIdList: string[]) => Promise<IRealmArenaGameData>;

/** `faction`'s ready-made squad for a seat, where a timed-out muster would put it. */
function factionPicks(game: RealmArenaTestGame, seat: number, faction: FactionId) {
    return readyMadeMuster(battlefieldById(game.specificGameState.map), seat, readyMadeSquad(FACTIONS[faction], budgetOf(game.specificGameState)));
}

const musterAs = (sender: string, game: RealmArenaTestGame, seat: number, faction: FactionId | undefined, squadOf: FactionId = faction ?? "realm") =>
    cmd(RealmArenaMuster, sender, { picks: factionPicks(game, seat, squadOf), faction });

describe("the host's choice of factions (B6)", () => {
    it("is a list of known factions, at least one, each once in their own order — and nothing else a request could send", () => {
        expect(playableFactionsOf(["realm"])).toEqual(["realm"]);
        expect(playableFactionsOf(["swarm", "realm", "swarm"])).toEqual(["realm", "swarm"]);
        for (const junk of [undefined, null, [], "realm", {}, ["orcs"], ["realm", "orcs"], ["constructor"], [["realm"]], [null]]) {
            expect(playableFactionsOf(junk), JSON.stringify(junk)).toBeUndefined();
        }
    });

    it("is kept on the invitation only as one, whatever a lobby's settings carried", () => {
        expect(new RealmArenaInvitationModel({ factions: ["swarm"] }).toObject().factions).toEqual(["swarm"]);
        expect(new RealmArenaInvitationModel({ factions: [] }).toObject().factions).toBeUndefined();
        expect(new RealmArenaInvitationModel({ factions: ["orcs"] }).toObject().factions).toBeUndefined();
    });

    it("is stored on the battle and named in the setup, and left off for the Realm alone, as every battle before it", async () => {
        const both = { turnTimer: 0, factions: ["realm", "swarm"] };
        const game = await createGame.call(both, both, ["a", "b"]);
        expect(game.specificGameState.factions).toEqual(["realm", "swarm"]);
        expect(game.gameState.history.map(entry => entry.text).join("\n")).toContain("characters, from the Realm or the Swarm, sealed");

        for (const invite of [{ turnTimer: 0, factions: ["realm"] }, { turnTimer: 0 }]) {
            const old = await createGame.call(invite, invite, ["a", "b"]);
            expect(old.specificGameState.factions).toBeUndefined();
            expect(old.gameState.history.map(entry => entry.text).join("\n")).toContain("points' worth of characters, sealed");
        }
    });

    it("goes to every player during the muster, and to a replay as the battle's settings", async () => {
        const game = makeGame(undefined, {}, { factions: ["swarm"] });
        expect(settingsOf(game.specificGameState).factions).toEqual(["swarm"]);
        expect((await responseFor(game, "b")).specificGameState.factions).toEqual(["swarm"]);
        expect((await responseFor(makeGame(), null)).specificGameState.factions).toEqual(["realm"]);
        await play(game, musterAs("a", game, 0, "swarm"));
        await play(game, musterAs("b", game, 1, "swarm"));
        expect((await responseFor(game, "a")).specificGameState.factions).toBeUndefined();
    });
});

describe("mustering from a faction (B6)", () => {
    it("takes any faction the host allowed, held to its roster, and the battle fields it", async () => {
        const game = makeGame(undefined, {}, { factions: ["realm", "swarm"] });
        expect((await play(game, musterAs("a", game, 0, "swarm"))).outcome.validMove).toBe(true);
        expect((await play(game, musterAs("b", game, 1, "realm"))).outcome.validMove).toBe(true);
        const roster = (owner: string) => game.specificGameState.fighters.filter(one => one.owner === owner).map(one => one.character);
        expect(roster("a")).toEqual(readyMadeSquad(FACTIONS.swarm, budgetOf(game.specificGameState)));
        expect(roster("b")).toEqual(readyMadeSquad(FACTIONS.realm, budgetOf(game.specificGameState)));
    });

    it("refuses a faction the host didn't allow, or a squad from outside the faction named", async () => {
        const game = makeGame(undefined, {}, { factions: ["swarm"] });
        expect((await play(game, musterAs("a", game, 0, "realm"))).outcome.validMove).toBe(false);
        expect((await play(game, musterAs("a", game, 0, "swarm", "realm"))).outcome.validMove).toBe(false);
        expect((await play(game, cmd(RealmArenaMuster, "a", { picks: factionPicks(game, 0, "swarm"), faction: "orcs" as FactionId }))).outcome.validMove).toBe(false);
        expect(game.specificGameState.musters).toEqual([]);
    });

    it("musters from the battle's first faction when none is named, as every muster before the choice did", async () => {
        const old = makeGame();
        expect((await play(old, cmd(RealmArenaMuster, "a", { picks: readyMadePicks(old, 0) }))).outcome.validMove).toBe(true);
        expect(old.specificGameState.musters[0].faction).toBe("realm");

        const swarm = makeGame(undefined, {}, { factions: ["swarm"] });
        expect((await play(swarm, musterAs("a", swarm, 0, undefined, "swarm"))).outcome.validMove).toBe(true);
        expect(swarm.specificGameState.musters[0].faction).toBe("swarm");
    });

    it("keeps the faction sealed with the squad: the other player isn't told it before the battle begins", async () => {
        const game = makeGame(undefined, {}, { factions: ["realm", "swarm"] });
        await play(game, musterAs("a", game, 0, "swarm"));
        for (const viewer of ["b", null]) {
            const wire = JSON.stringify((await responseFor(game, viewer)).specificGameState);
            for (const character of FACTIONS.swarm.characters) expect(wire, String(viewer)).not.toContain(character);
        }
    });

    it("gives a timed-out muster the first allowed faction's ready-made squad", async () => {
        const game = makeGame(undefined, {}, { factions: ["swarm"] });
        expect(await resolveStalledTurn(game, "a", "a")).toBe("advanced");
        expect(game.specificGameState.musters[0]).toEqual({ owner: "a", faction: "swarm", picks: factionPicks(game, 0, "swarm") });
    });
});
