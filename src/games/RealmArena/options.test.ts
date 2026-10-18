import { describe, expect, it, vi } from "vitest";
import { ABILITIES, OPTIONS, REALM, type CharacterOption, type OptionId } from "./characters";
import { battlefieldById } from "./maps";
import { RealmArenaGameDataModel } from "./RealmArenaModels";
import { RealmArenaUndo, tallied } from "./RealmArenaLogic";
import type { IRealmArenaGameDataResponse } from "./apiModels";
import type { MasterySnapshot } from "./mastery";
import { areaAround, check, nextTo, readyMadeMuster, type MusterPick } from "./rules";
import { actBy, battleOf, cmd, makeGame, muster, play, readyMadePicks, type RealmArenaTestGame, responseFor } from "./testFixtures";

// docs/games/realm-arena.md §23.2–§23.3, C5 PR 2: the rank-1 options, picked
// at muster and checked against the ranks the battle snapshotted when it was
// created — never against anything the client sends — then sealed with the
// rest of the squad until every player has mustered, and played through the
// same commands as everything else.

vi.mock("@/utils/users/clerk", () => ({
    userIdListToNamesAndMap: async (ids: string[]) => ({ usernameList: ids, userIdNameMap: Object.fromEntries(ids.map(id => [id, id])) }),
}));

/** Every character ranked 1 for a, so each of its rank-1 options is unlocked. */
const A_RANKED: MasterySnapshot = { a: { manAtArms: 1, knight: 1, archer: 1, scout: 1, mage: 1, cleric: 1 } };

const OPTION_OF = Object.fromEntries((Object.keys(OPTIONS) as OptionId[]).map(id => [OPTIONS[id].character, id]));

/** a's ready-made squad, every one of it with its character's rank-1 option. */
function optionPicks(game: RealmArenaTestGame): MusterPick[] {
    return readyMadePicks(game, 0).map(pick => ({ ...pick, option: OPTION_OF[pick.character] }));
}

const own = (game: RealmArenaTestGame, player: string) => game.specificGameState.fighters.filter(one => one.owner === player);

/**
 * A battle on a's first turn: a's squad is `squad`, each with its option, and
 * b's is the ready-made one.
 */
async function battleWith(squad: readonly (keyof typeof OPTION_OF)[]): Promise<RealmArenaTestGame> {
    const game = makeGame(undefined, A_RANKED, { rulesVersion: 7 });
    const field = battlefieldById(game.specificGameState.map);
    const picks = readyMadeMuster(field, 0, squad as never).map(pick => ({ ...pick, option: OPTION_OF[pick.character] }));
    expect((await play(game, muster("a", picks))).outcome.validMove).toBe(true);
    expect((await play(game, muster("b", readyMadePicks(game, 1)))).outcome.validMove).toBe(true);
    return game;
}

describe("mustering with options (§23.2)", () => {
    it("takes an option the battle's own snapshot unlocks, and carries it onto the battlefield", async () => {
        const game = makeGame(undefined, A_RANKED, { rulesVersion: 7 });
        const picks = optionPicks(game);
        expect((await play(game, muster("a", picks))).outcome.validMove).toBe(true);
        expect((await play(game, muster("b", readyMadePicks(game, 1)))).outcome.validMove).toBe(true);
        expect(own(game, "a").map(one => one.option)).toEqual(picks.map(pick => pick.option));
        expect(own(game, "b").every(one => one.option === undefined)).toBe(true);
    });

    it("leaves the ready-made squad a timed-out muster gets with none", () => {
        const field = battlefieldById(makeGame().specificGameState.map);
        expect(readyMadeMuster(field, 0, REALM.readyMade[100]).every(pick => pick.option === undefined)).toBe(true);
    });

    it("refuses one the player hasn't unlocked, whoever else has", async () => {
        const game = makeGame(undefined, { b: A_RANKED.a });
        expect((await play(game, muster("a", optionPicks(game)))).outcome.validMove).toBe(false);
        // Each option alone is refused: no rank, no option.
        for (const pick of optionPicks(game)) {
            const picks = readyMadePicks(game, 0).map(one => one.square === pick.square ? pick : one);
            expect((await play(game, muster("a", picks))).outcome.validMove, pick.option).toBe(false);
        }
        expect(game.specificGameState.musters).toEqual([]);
    });

    it("never reads a rank from the request", async () => {
        const game = makeGame();
        const command = Object.assign(muster("a", optionPicks(game)), { mastery: A_RANKED, ranks: A_RANKED.a });
        expect((await play(game, command)).outcome.validMove).toBe(false);
    });

    it("seals the options with the squad: its owner's to see until every player has mustered, and everyone's after", async () => {
        const game = makeGame(undefined, A_RANKED, { rulesVersion: 7 });
        const picks = optionPicks(game);
        const command = muster("a", picks);
        const { outcome } = await play(game, command);
        // Every option's id and the name of what it swaps in, and the key a pick would carry one under.
        const names = (Object.entries(OPTIONS) as [OptionId, CharacterOption][])
            .flatMap(([id, option]) => [id, "weapon" in option ? option.weapon.name : ABILITIES[option.ability]!.name]);
        for (const viewer of ["b", null]) {
            const traces = [JSON.stringify((await responseFor(game, viewer)).specificGameState), command.myString(), JSON.stringify(outcome), game.gameState.history[0].text];
            for (const trace of traces) {
                for (const name of [...names, '"option"']) expect(trace, `${viewer} sees ${name}`).not.toContain(name);
            }
        }
        expect((await responseFor(game, "a")).specificGameState.myMuster).toEqual(picks);

        await play(game, muster("b", readyMadePicks(game, 1)));
        const fighters = (await responseFor(game, "b")).specificGameState.fighters;
        expect(fighters.filter(one => one.owner === "a").map(one => one.option)).toEqual(picks.map(pick => pick.option));
    });

    it("sends each viewer their own ranks the battle snapshotted, and nobody else's", async () => {
        const game = makeGame(undefined, A_RANKED, { rulesVersion: 7 });
        expect((await responseFor(game, "a")).specificGameState.mastery).toEqual(A_RANKED);
        for (const viewer of ["b", null]) {
            expect((await responseFor(game, viewer)).specificGameState.mastery).toEqual({});
        }
        expect((await responseFor(makeGame(), "a")).specificGameState.mastery).toEqual({});
    });

    it("sends only ranks of 1–3 by a character, whatever else the snapshot holds", async () => {
        const game = makeGame(undefined, { a: { knight: 2, archer: 0, dragon: 3, mage: 7, xp: 900 } as never, b: { cleric: 3 } });
        expect((await responseFor(game, "a")).specificGameState.mastery).toEqual({ a: { knight: 2 } });
        expect((await responseFor(game, "b")).specificGameState.mastery).toEqual({ b: { cleric: 3 } });
    });
});

describe("playing the options (§23.2)", () => {
    it("writes each to the log in the player's words", async () => {
        const game = await battleWith(["scout", "cleric", "knight"]);
        const [scout, cleric] = own(game, "a");
        const enemy = own(game, "b")[0];
        const battle = battleOf(game);
        // Somewhere b's character can be seen from, within 12 squares.
        enemy.square = battle.field.tiles.findIndex((tile, square) => tile.terrain.standable
            && battle.fighters.every(one => one.square !== square)
            && !("refused" in check({ ...battle, fighters: battle.fighters.map(one => one.id === enemy.id ? { ...one, square } : one) }, "a", { kind: "huntersMark", fighter: scout.id, target: enemy.id })));

        expect((await play(game, actBy("a", { kind: "huntersMark", fighter: scout.id, target: enemy.id }))).outcome.validMove).toBe(true);
        expect(game.gameState.history[0].text).toBe("{{a}} used Hunter's mark with their Scout; {{b}}'s Knight is marked");

        const hurt = own(game, "a")[1];
        hurt.hp = 4;
        expect((await play(game, actBy("a", { kind: "purify", fighter: cleric.id }))).outcome.validMove).toBe(true);
        expect(game.gameState.history[0].text).toBe("{{a}} purified their Cleric for 2");
    });

    it("tallies every option's ability as an ability", () => {
        const fighters = [{ id: 1 }, { id: 2 }] as never;
        for (const kind of ["shieldBash", "cripplingShot", "huntersMark"] as const) {
            expect(tallied(fighters, { kind, fighter: 1, target: 2 }, [])[0].tally, kind).toEqual({ attacks: 0, abilities: 1, items: 0 });
        }
        expect(tallied(fighters, { kind: "demolish", fighter: 1, at: 0 }, [])[0].tally).toEqual({ attacks: 0, abilities: 1, items: 0 });
        expect(tallied(fighters, { kind: "purify", fighter: 1 }, [])[0].tally).toEqual({ attacks: 0, abilities: 1, items: 0 });
    });

    it("takes back a Hunter's mark and a Demolish that strikes nobody, the cover with it", async () => {
        const game = await battleWith(["scout", "knight"]);
        const [scout, knight] = own(game, "a");
        const battle = battleOf(game);
        const { field } = battle;
        const enemy = own(game, "b")[0];

        // The Knight beside some cover with nobody else beside it.
        const clear = (cover: number, spot: number) => battle.fighters.every(one => one.id === knight.id || !areaAround(field, cover).includes(one.square)) && battle.fighters.every(one => one.square !== spot);
        const spots = field.tiles.flatMap((tile, cover) => tile.terrain.destructible
            ? areaAround(field, cover).filter(spot => field.tiles[spot].terrain.standable && nextTo(field, spot, cover) && clear(cover, spot)).map(spot => ({ cover, spot }))
            : []);
        const { cover, spot } = spots[0];
        knight.square = spot;
        expect((await play(game, actBy("a", { kind: "demolish", fighter: knight.id, at: cover }))).outcome.validMove).toBe(true);
        expect(game.specificGameState.blasted).toEqual([cover]);
        expect(game.gameState.history[0].text).toBe("{{a}} used Demolish with their Knight; blasted away 1 square of low cover");
        expect((await play(game, cmd(RealmArenaUndo, "a"))).outcome.validMove).toBe(true);
        expect(game.specificGameState.blasted).toEqual([]);
        expect(own(game, "a")[1].cooldowns).toEqual({});

        // From wherever the Scout can mark b's Knight.
        const markable = battle.field.tiles.findIndex((tile, square) => tile.terrain.standable && battle.fighters.every(one => one.square !== square)
            && !("refused" in check({ ...battle, fighters: battle.fighters.map(one => one.id === scout.id ? { ...one, square } : one) }, "a", { kind: "huntersMark", fighter: scout.id, target: enemy.id })));
        own(game, "a")[0].square = markable;
        expect((await play(game, actBy("a", { kind: "huntersMark", fighter: scout.id, target: enemy.id }))).outcome.validMove).toBe(true);
        expect(own(game, "b")[0].effects).toEqual({ marked: 2 });
        expect((await play(game, cmd(RealmArenaUndo, "a"))).outcome.validMove).toBe(true);
        expect(own(game, "b")[0].effects).toEqual({});
    });

    it("never takes back a Shield bash", async () => {
        const game = await battleWith(["manAtArms"]);
        const [bash] = own(game, "a");
        const enemy = own(game, "b")[0];
        const { field } = battleOf(game);
        enemy.square = field.tiles.findIndex((tile, square) => tile.terrain.standable && square !== bash.square
            && !("refused" in check({ field, fighters: [bash, { ...enemy, square }] }, "a", { kind: "shieldBash", fighter: bash.id, target: enemy.id })));
        // A roll of 1 lands the strike, which stuns on a hit.
        expect((await play(game, Object.assign(actBy("a", { kind: "shieldBash", fighter: bash.id, target: enemy.id }), { recordedRolls: [1] }))).outcome.validMove).toBe(true);
        expect(own(game, "b")[0].effects).toEqual({ stunned: 1 });
        expect((await play(game, cmd(RealmArenaUndo, "a"))).outcome.validMove).toBe(false);
    });
});
