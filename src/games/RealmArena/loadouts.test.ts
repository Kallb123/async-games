import { describe, expect, it, vi } from "vitest";
import { buildTimeline } from "@/utils/games/replay";
import { kitOf, loadoutPoolOf, type AbilityId, type CharacterId } from "./characters";
import { battlefieldById } from "./maps";
import type { MasterySnapshot } from "./mastery";
import { gameStateToModel } from "./RealmArenaModels";
import { undoDepthOf } from "./RealmArenaLogic";
import { rulesetOf } from "./rulesets";
import { abilitiesOf, check, musterRefusal, newFighter, pickOf, readyMadeMuster, storedFighter, type MusterPick } from "./rules";
import { battleOf, makeGame, muster, musterAll, play, playScriptedTurn, readyMadePicks, responseFor, type RealmArenaTestGame } from "./testFixtures";

// docs/games/realm-arena.md §40: each of the Realm's figures keeps its fixed
// abilities and picks two more from its character's pool at muster, in rules
// version 12 only. Checked against the battle's own rank snapshot, sealed with
// the squad, public once the battle starts, and carried by the fighter.

vi.mock("@/utils/users/clerk", () => ({
    userIdListToNamesAndMap: async (ids: string[]) => ({ usernameList: ids, userIdNameMap: Object.fromEntries(ids.map(id => [id, id])) }),
}));

const V12 = { rulesVersion: 12 };
const V11 = { rulesVersion: 11 };
const RANKED: MasterySnapshot = { a: { manAtArms: 1, knight: 1, archer: 1, mage: 1, cleric: 1 } };

const kitIds = (character: CharacterId, loadout?: AbilityId[], context = V12, option?: Parameters<typeof kitOf>[1]) => [...kitOf(character, option, context, loadout).abilities];

/** The first seat's squad as `squad` stands in its zone, each carrying the loadouts given by character. */
function picksFor(game: RealmArenaTestGame, squad: CharacterId[], loadouts: Partial<Record<CharacterId, unknown>> = {}): MusterPick[] {
    const field = battlefieldById(game.specificGameState.map);
    return readyMadeMuster(field, 0, squad).map(pick => (Object.hasOwn(loadouts, pick.character) ? { ...pick, loadout: loadouts[pick.character] } : pick) as MusterPick);
}

/** Whether a's squad is mustered as picked, by the real command. */
const musters = async (game: RealmArenaTestGame, picks: MusterPick[]) => (await play(game, muster("a", picks))).outcome.validMove;

const refusal = (picks: unknown, ranks: Record<string, number> = {}, version = V12) => {
    const game = makeGame(undefined, {}, version);
    const faction = rulesetOf(game.specificGameState).FACTIONS.realm;
    return musterRefusal(battlefieldById(game.specificGameState.map), 0, picks, 120, ranks, faction, game.specificGameState);
};
const squadOf = (character: CharacterId, extra: Partial<MusterPick> = {}) => {
    const game = makeGame(undefined, {}, V12);
    return [{ ...readyMadeMuster(battlefieldById(game.specificGameState.map), 0, [character])[0], ...extra }];
};

describe("kits under a pool (§40.3)", () => {
    it("gives each Realm character its fixed abilities and its defaults in version 12", () => {
        expect(kitIds("manAtArms")).toEqual(["cleave", "leap"]);
        expect(kitIds("knight")).toEqual(["bulwark", "taunt", "shove"]);
        expect(kitIds("archer")).toEqual(["aimedShot", "poisonArrow"]);
        expect(kitIds("mage")).toEqual(["fireball", "thunder"]);
        expect(kitIds("cleric")).toEqual(["heal", "raise", "blessing"]);
    });

    it("reads a chosen loadout in the pool's order, as one cached, frozen kit however it was sent", () => {
        const one = kitOf("archer", undefined, V12, ["splittingArrow", "aimedShot"]);
        expect([...one.abilities]).toEqual(["aimedShot", "splittingArrow"]);
        expect(kitOf("archer", undefined, V12, ["aimedShot", "splittingArrow"])).toBe(one);
        expect(Object.isFrozen(one)).toBe(true);
        expect(Object.isFrozen(one.abilities)).toBe(true);
        // The default is a kit of its own, the same object each time.
        expect(kitOf("archer", undefined, V12)).toBe(kitOf("archer", undefined, V12, ["aimedShot", "poisonArrow"]));
        expect(kitIds("cleric", ["ward", "beckon"])).toEqual(["heal", "beckon", "ward"]);
    });

    it("builds the pool from the character's other abilities, then its ability options with their ranks", () => {
        expect(loadoutPoolOf("manAtArms", V12)).toEqual([
            { ability: "cleave", rank: 0 }, { ability: "leap", rank: 0 }, { ability: "slashAndDash", rank: 0 }, { ability: "shieldBash", rank: 1 },
        ]);
        expect(loadoutPoolOf("knight", V12)!.map(entry => entry.ability)).toEqual(["taunt", "shove", "demolish"]);
        // Frost bolt swaps the weapon, so it isn't a pick.
        expect(loadoutPoolOf("mage", V12)!.map(entry => entry.ability)).toEqual(["fireball", "iceBall", "thunder", "focus"]);
        expect(loadoutPoolOf("archer", V12)).toBe(loadoutPoolOf("archer", V12));
        for (const character of ["scout", "skitterling", "miner"] as const) expect(loadoutPoolOf(character, V12)).toBeUndefined();
        expect(loadoutPoolOf("knight", V11)).toBeUndefined();
    });

    it("still swaps the Mage's weapon with Frost bolt, and ignores an ability option, beside a loadout", () => {
        expect(kitOf("mage", "frostBolt", V12, ["focus", "iceBall"]).weapon.name).not.toBe(kitOf("mage", undefined, V12).weapon.name);
        expect(kitIds("mage", ["focus", "iceBall"], V12, "frostBolt")).toEqual(["iceBall", "focus"]);
        expect(kitIds("knight", undefined, V12, "demolish")).toEqual(["bulwark", "taunt", "shove"]);
    });

    it("leaves every earlier catalogue's whole kit, and its options swapping, alone", () => {
        expect(kitIds("manAtArms", undefined, V11)).toEqual(["cleave", "leap", "slashAndDash"]);
        expect(kitIds("manAtArms", ["cleave"], V11)).toEqual(["cleave", "leap", "slashAndDash"]);
        expect(kitIds("knight", undefined, V11, "demolish")).toEqual(["bulwark", "taunt", "demolish"]);
        expect(kitIds("mage", undefined, V11)).toEqual(["fireball", "iceBall", "thunder", "focus"]);
        expect(kitOf("knight", undefined, V11)).toBe(kitOf("knight", undefined, V11));
    });
});

describe("checking a muster's loadout (§40.3)", () => {
    it("accepts none, the defaults and any two from the pool", () => {
        expect(refusal(squadOf("archer"))).toBeUndefined();
        expect(refusal(squadOf("archer", { loadout: null as never }))).toBeUndefined();
        expect(refusal(squadOf("archer", { loadout: ["aimedShot", "poisonArrow"] }))).toBeUndefined();
        expect(refusal(squadOf("archer", { loadout: ["shootDodge", "bouncingArrow"] }))).toBeUndefined();
        expect(refusal(squadOf("cleric", { loadout: ["ward", "beckon"] }))).toBeUndefined();
    });

    it("refuses the wrong number, duplicates, and anything outside the pool", () => {
        for (const loadout of [[], ["aimedShot"], ["aimedShot", "poisonArrow", "bouncingArrow"], ["aimedShot", "aimedShot"], ["aimedShot", "fireball"], ["aimedShot", "heal"], ["aimedShot", "nonsense"]]) {
            expect(refusal(squadOf("archer", { loadout: loadout as AbilityId[] })), JSON.stringify(loadout)).toEqual(expect.any(String));
        }
        // A fixed ability is the figure's already, never a pick.
        expect(refusal(squadOf("knight", { loadout: ["bulwark", "taunt"] }))).toBe("That isn't an ability your Knight can pick");
        expect(refusal(squadOf("cleric", { loadout: ["heal", "raise"] }))).toBe("That isn't an ability your Cleric can pick");
        expect(refusal(squadOf("archer", { loadout: ["aimedShot"] }))).toBe("Pick 2 different abilities for your Archer");
    });

    it("holds an option's ability to the rank that unlocks it, and the player's own", () => {
        const shieldBash = squadOf("manAtArms", { loadout: ["cleave", "shieldBash"] });
        expect(refusal(shieldBash)).toBe("That ability isn't unlocked yet");
        expect(refusal(shieldBash, { manAtArms: 0 })).toBe("That ability isn't unlocked yet");
        expect(refusal(shieldBash, { knight: 1 })).toBe("That ability isn't unlocked yet");
        expect(refusal(shieldBash, { manAtArms: 1 })).toBeUndefined();
        // A rank-0 pool entry needs none.
        expect(refusal(squadOf("manAtArms", { loadout: ["cleave", "slashAndDash"] }))).toBeUndefined();
    });

    it("refuses an ability option as the option in version 12, but takes a weapon one", () => {
        expect(refusal(squadOf("manAtArms", { option: "shieldBash" }), { manAtArms: 1 })).toBe("That ability is picked in the loadout");
        expect(refusal(squadOf("knight", { option: "demolish" }), { knight: 1 })).toBe("That ability is picked in the loadout");
        expect(refusal(squadOf("mage", { option: "frostBolt" }), { mage: 1 })).toBeUndefined();
        expect(refusal(squadOf("mage", { option: "frostBolt", loadout: ["focus", "iceBall"] }), { mage: 1 })).toBeUndefined();
        // Still a swap in version 11.
        expect(refusal(squadOf("manAtArms", { option: "shieldBash" }), { manAtArms: 1 }, V11)).toBeUndefined();
    });

    it("refuses a loadout for a character with no pool, and for any in a version before 12", () => {
        const swarm = rulesetOf(V12).FACTIONS.swarm;
        const game = makeGame(undefined, {}, V12);
        const field = battlefieldById(game.specificGameState.map);
        const skitterling = readyMadeMuster(field, 0, ["skitterling"]).map(pick => ({ ...pick, loadout: ["rend", "burst"] as AbilityId[] }));
        expect(musterRefusal(field, 0, skitterling, 120, {}, swarm, V12)).toBe("That character has no abilities to pick");
        expect(refusal(squadOf("archer", { loadout: ["aimedShot", "poisonArrow"] }), {}, V11)).toBe("That character has no abilities to pick");
    });

    it("never throws on junk, and refuses it", () => {
        for (const loadout of ["aimedShot", 7, {}, true, [1, 2], [null, null], [["aimedShot"], ["poisonArrow"]], ["__proto__", "constructor"], ["toString", "hasOwnProperty"],
            { 0: "aimedShot", 1: "poisonArrow", length: 2 }, Object.create(null), [undefined, undefined]]) {
            expect(() => refusal(squadOf("archer", { loadout: loadout as never })), JSON.stringify(loadout)).not.toThrow();
            expect(refusal(squadOf("archer", { loadout: loadout as never })), JSON.stringify(loadout)).toEqual(expect.any(String));
        }
        expect(refusal(squadOf("archer", { option: "__proto__" as never, loadout: ["aimedShot", "poisonArrow"] }))).toEqual(expect.any(String));
    });

    it("keeps only what was checked, the loadout copied", () => {
        const loadout: AbilityId[] = ["aimedShot", "poisonArrow"];
        const [pick] = squadOf("archer", { loadout });
        const kept = pickOf({ ...pick, extra: 1 } as MusterPick);
        expect(kept).toEqual({ character: "archer", square: pick.square, loadout });
        expect(kept.loadout).not.toBe(loadout);
        expect(pickOf({ ...pick, loadout: [] })).not.toHaveProperty("loadout");
        expect(pickOf(squadOf("archer")[0])).not.toHaveProperty("loadout");
    });
});

describe("mustering with a loadout (§40.3)", () => {
    it("carries it onto the fighter, which fights with it and nothing else of the pool", async () => {
        const game = makeGame(undefined, RANKED, V12);
        expect(await musters(game, picksFor(game, ["mage", "archer"], { mage: ["focus", "thunder"] }))).toBe(true);
        expect((await play(game, muster("b", readyMadePicks(game, 1)))).outcome.validMove).toBe(true);
        const [mage, archer] = game.specificGameState.fighters.filter(one => one.owner === "a");
        expect(mage.loadout).toEqual(["focus", "thunder"]);
        expect(archer).not.toHaveProperty("loadout");
        expect(abilitiesOf(mage, game.specificGameState)).toEqual(["thunder", "focus"]);
        expect(abilitiesOf(archer, game.specificGameState)).toEqual(["aimedShot", "poisonArrow"]);
        const battle = battleOf(game);
        expect(check(battle, "a", { kind: "focus", fighter: mage.id })).not.toHaveProperty("refused");
        expect(check(battle, "a", { kind: "focus", fighter: archer.id })).toHaveProperty("refused");
        // Fireball is the Mage's default, but not in this loadout.
        expect(check(battle, "a", { kind: "fireball", fighter: mage.id, target: archer.square })).toHaveProperty("refused", "This Mage can't use Fireball");
    });

    it("refuses an invalid loadout through the command, and mustering nothing", async () => {
        const game = makeGame(undefined, RANKED, V12);
        for (const loadout of [["aimedShot"], ["aimedShot", "heal"], "aimedShot", ["__proto__", "x"]]) {
            expect(await musters(game, picksFor(game, ["archer"], { archer: loadout }))).toBe(false);
        }
        expect(game.specificGameState.musters).toEqual([]);
        const old = makeGame(undefined, RANKED, V11);
        expect(await musters(old, picksFor(old, ["archer"], { archer: ["aimedShot", "poisonArrow"] }))).toBe(false);
    });

    it("seals it with the squad, and shows it to everyone once the battle starts", async () => {
        const game = makeGame(undefined, RANKED, V12);
        const picks = picksFor(game, ["mage", "archer"], { mage: ["focus", "iceBall"] });
        const command = muster("a", picks);
        const { outcome } = await play(game, command);
        expect(outcome.validMove).toBe(true);
        for (const viewer of ["b", null]) {
            const traces = [JSON.stringify((await responseFor(game, viewer)).specificGameState), command.myString(), JSON.stringify(outcome), game.gameState.history[0].text];
            for (const trace of traces) expect(trace, `${viewer} sees it`).not.toContain("iceBall");
        }
        expect((await responseFor(game, "a")).specificGameState.myMuster).toEqual(picks);
        expect((await responseFor(game, "b")).specificGameState.myMuster).toBeNull();

        await play(game, muster("b", readyMadePicks(game, 1)));
        for (const viewer of ["b", null]) {
            const fighters = (await responseFor(game, viewer)).specificGameState.fighters;
            expect(fighters.find(one => one.owner === "a" && one.character === "mage")?.loadout).toEqual(["focus", "iceBall"]);
        }
    });

    it("gives the ready-made squad and warbands no loadout, and they fight with the defaults", async () => {
        const game = makeGame(undefined, {}, V12);
        await musterAll(game);
        for (const fighter of game.specificGameState.fighters) {
            expect(fighter).not.toHaveProperty("loadout");
            if (fighter.character === "archer") expect(abilitiesOf(fighter, game.specificGameState)).toEqual(["aimedShot", "poisonArrow"]);
        }
        expect(readyMadePicks(game, 0).every(pick => !("loadout" in pick))).toBe(true);
    });

    it("copies it into undo snapshots, never sharing the array", () => {
        const fighter = newFighter(1, "a", "archer", 0, null, undefined, ["aimedShot", "bouncingArrow"], false, V12);
        expect(fighter.loadout).toEqual(["aimedShot", "bouncingArrow"]);
        const stored = storedFighter(fighter);
        expect(stored.loadout).toEqual(fighter.loadout);
        expect(stored.loadout).not.toBe(fighter.loadout);
        expect(newFighter(1, "a", "archer", 0)).not.toHaveProperty("loadout");
    });

    it("replays a battle with loadouts to the live state without consuming randomness", async () => {
        const game = makeGame(undefined, RANKED, V12);
        expect(await musters(game, picksFor(game, ["mage", "archer", "knight"], { mage: ["focus", "iceBall"], archer: ["bouncingArrow", "aimedShot"], knight: ["shove", "taunt"] }))).toBe(true);
        expect((await play(game, muster("b", readyMadePicks(game, 1)))).outcome.validMove).toBe(true);
        for (let turn = 0; turn < 6 && !game.complete; turn++) await playScriptedTurn(game);
        const timeline = await buildTimeline(game, { a: "A", b: "B" }, [], undefined, "a");
        const last = timeline.snapshots[timeline.currentIndex];
        expect(last.specificGameState).toEqual(gameStateToModel(game.specificGameState, "a", game.gameState.commandHistory.at(-1)?.id ?? null));
        expect(game.specificGameState.fighters.find(one => one.character === "mage" && one.owner === "a")?.loadout).toEqual(["focus", "iceBall"]);
    });
});

describe("undo's depth (§40.3)", () => {
    it("keeps old catalogues' depth, and sizes version 12's by everything a character could pick", () => {
        expect(undoDepthOf(V11)).toBe(6);
        expect(undoDepthOf(V12)).toBeGreaterThanOrEqual(undoDepthOf(V11));
        // Slash and Dash isn't a default, but it can be picked.
        expect(kitIds("manAtArms")).not.toContain("slashAndDash");
    });
});
