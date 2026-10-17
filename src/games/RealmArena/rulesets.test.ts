import { describe, expect, it, vi } from "vitest";
import { buildBattlefield } from "@/utils/games/battlefield/terrain";
import { resolveStalledTurn } from "@/utils/games/turnTimeout";
import { nextAction } from "./ai";
import { distance } from "@/utils/games/battlefield/terrain";
import { buildTimeline } from "@/utils/games/replay";
import { abilitiesOf, act, battleFrom, check, fixedRolls, movementOf, newFighter, viewOf, type BattleState } from "./rules";
import { currentRuleset, rulesetFor, type RealmArenaRuleset, type RulesContext } from "./rulesets";
import { rangeKindOf } from "./tactics";
import { hpPreview } from "./useTurnDraft";
import { characterStats } from "./stats";
import { gameStateToModel, RealmArenaInvitationModel, settingsOf, type IRealmArenaGameData } from "./RealmArenaModels";
import { RealmArenaUndo } from "./RealmArenaLogic";
import { cmd, makeGame, muster, oneStep, play, readyMadePicks, actBy } from "./testFixtures";

vi.mock("./masteryRecord", () => ({ masterySnapshotOf: vi.fn(async () => ({})) }));
vi.mock("@/utils/users/clerk", () => ({
    userIdListToNamesAndMap: async (ids: string[]) => ({ usernameList: ids, userIdNameMap: Object.fromEntries(ids.map(id => [id, id])) }),
}));

// Simulate the next release without shipping changed balance. Both games send
// today's command version; their stored rulesVersion must select every value.
vi.mock("./rulesets", async importOriginal => {
    const real = await importOriginal<typeof import("./rulesets")>();
    const old = real.rulesetFor(7);
    const future: RealmArenaRuleset = {
        ...old,
        EFFECTS: { ...old.EFFECTS, ...{ futureEffect: { name: "Future effect", state: "affected", count: 1 } } },
        CHARACTERS: { ...old.CHARACTERS, knight: { ...old.CHARACTERS.knight, hp: 20, movement: 8, abilities: ["shieldWall", "heal"] } },
        FACTIONS: { ...old.FACTIONS, realm: { ...old.FACTIONS.realm, readyMade: { ...old.FACTIONS.realm.readyMade, 100: ["knight", "archer"] } } },
        ABILITIES: { ...old.ABILITIES, fireball: { ...old.ABILITIES.fireball, range: 4 }, heal: { ...old.ABILITIES.heal, ap: 1, hp: 8, range: 4, cooldown: 3 } },
    };
    const resolve = (version: number | undefined) => version === 8 ? future : real.rulesetFor(version);
    return {
        ...real,
        CURRENT_RULESET_VERSION: 8,
        currentRuleset: future,
        rulesetFor: resolve,
        rulesetOf: (context?: RulesContext) => context === undefined ? future : resolve(context.rulesVersion ?? (context.balanced ? 7 : undefined)),
    };
});

const FIELD = buildBattlefield({ name: "Ruleset test", rows: ["............", "............"], deployments: [], objectives: {} });
const stateFor = (rulesVersion: number): BattleState => battleFrom(FIELD, {
    rulesVersion,
    fighters: [
        { ...newFighter(0, "a", "knight", 0, null, undefined, false, { rulesVersion }), ap: 4 },
        { ...newFighter(1, "a", "cleric", 1), ap: 4 },
        { ...newFighter(2, "a", "knight", 3, null, undefined, false, { rulesVersion }), hp: 1 },
    ],
});

describe("Realm Arena ruleset compatibility", () => {
    it("keeps released catalogues deeply frozen and refuses unknown versions", async () => {
        const real = await vi.importActual<typeof import("./rulesets")>("./rulesets");
        for (const version of [undefined, 0, 1, 2, 3, 4, 5, 6, 7]) {
            const rules = real.rulesetFor(version);
            expect(Object.isFrozen(rules)).toBe(true);
            expect(Object.isFrozen(rules.CHARACTERS.knight.abilities)).toBe(true);
            expect(Object.isFrozen(rules.FACTIONS.realm.readyMade[100])).toBe(true);
        }
        expect(() => { real.rulesetFor(7).CHARACTERS.knight.weapon.damage = 99; }).toThrow();
        for (const version of [-1, 1.5, NaN, 8]) expect(() => real.rulesetFor(version)).toThrow(/Unsupported/);
        expect(real.rulesetFor(undefined).CHARACTERS.mage.weapon).toMatchObject({ accuracy: 70, range: 10 });
        expect(real.rulesetFor(undefined).ABILITIES.raise.oncePerBattle).toBe(true);
        expect(real.rulesetFor(7).ABILITIES.heal.oncePerTurn).toBe(true);
    });

    it("pins HP, movement and available abilities to the game, including an added ability", () => {
        const old = stateFor(7), future = stateFor(8);
        expect(old.fighters[0].hp).toBe(12);
        expect(future.fighters[0].hp).toBe(20);
        expect(movementOf(old.fighters[0], old)).toBe(4);
        expect(movementOf(future.fighters[0], future)).toBe(8);
        expect(abilitiesOf(old.fighters[0], old)).toEqual(["shieldWall"]);
        expect(abilitiesOf(future.fighters[0], future)).toEqual(["shieldWall", "heal"]);
        const heal = { kind: "heal", fighter: 0, target: 2 } as const;
        expect(check(old, "a", heal)).toHaveProperty("refused");
        expect(check(future, "a", heal)).toEqual({ ap: 1 });
        expect(currentRuleset.CHARACTERS.knight.hp).toBe(20); // default advanced
        expect(rulesetFor(7).CHARACTERS.knight.hp).toBe(12); // existing game didn't
    });

    it("uses the pinned ability cost, healing, range and cooldown in execution and previews", () => {
        const heal = { kind: "heal", fighter: 1, target: 2 } as const;
        for (const [version, ap, hp, cooldown, range] of [[7, 2, 4, 0, 12], [8, 1, 8, 3, 4]]) {
            const battle = stateFor(version);
            expect(check(battle, "a", heal)).toEqual({ ap });
            const done = act(battle, "a", heal, fixedRolls([]));
            expect(done.fighters[2].hp).toBe(1 + hp);
            expect(done.fighters[1].cooldowns.heal ?? 0).toBe(cooldown);
            expect(hpPreview(battle, battle.fighters[1], { aim: "heal", targets: [2], square: null }, null).get(2)).toBe(hp);
            expect(rangeKindOf("heal", battle)).toBe(range);
            const sheet = characterStats("cleric", battle).actions.find(row => row.key === "heal")!;
            expect(sheet.ap).toBe(String(ap));
            expect(sheet.range).toBe(String(range));
            expect(sheet.extras).toContain(`Heals ${hp} HP`);
            battle.fighters[2].square = 9;
            expect("refused" in check(battle, "a", heal)).toBe(version === 8);
        }
    });

    it("preserves the catalogue in fogged views and AI area targeting", () => {
        const fogged = { ...stateFor(8), fog: true };
        const view = viewOf(fogged, "a");
        expect(view.rulesVersion).toBe(8);
        expect(check(view, "a", { kind: "heal", fighter: 0, target: 2 })).toEqual({ ap: 1 });
        const battle = battleFrom(FIELD, { rulesVersion: 7, fighters: [
            { ...newFighter(0, "a", "mage", 0), ap: 4 },
            newFighter(1, "b", "knight", 9), newFighter(2, "b", "knight", 10), newFighter(3, "b", "knight", 21),
        ] });
        const choice = nextAction(battle, "a", 1);
        expect(choice?.kind).toBe("fireball");
        expect(choice && "at" in choice && distance(FIELD, 0, choice.at)).toBeGreaterThan(4);
    });

    it("does not read future-only effects when resolving old attacks or healing", () => {
        const battle = battleFrom(FIELD, { rulesVersion: 7, fighters: [
            { ...newFighter(0, "a", "mage", 0), ap: 4 }, newFighter(1, "b", "knight", 3),
        ] });
        expect(() => act(battle, "a", { kind: "attack", fighter: 0, target: 1 }, fixedRolls([1]))).not.toThrow();
        expect(() => check(stateFor(7), "a", { kind: "heal", fighter: 1, target: 2 })).not.toThrow();
    });

    it("musters timeout squads from the game's faction catalogue", async () => {
        for (const version of [7, 8]) {
            const game = makeGame(["a", "b"], {}, { rulesVersion: version });
            expect(await resolveStalledTurn(game, "a", "a")).toBe("advanced");
            expect(game.specificGameState.musters[0].picks.map(pick => pick.character)).toEqual(rulesetFor(version).FACTIONS.realm.readyMade[100]);
        }
    });

    it("stamps production creation from the ruleset release independently of commandVersion", async () => {
        const create = RealmArenaInvitationModel.schema.methods.CreateGame as
            (this: unknown, invite: unknown, players: string[]) => Promise<IRealmArenaGameData>;
        const invite = { turnTimer: "unlimited" };
        const game = await create.call(invite, invite, ["a", "b"]);
        expect(game.specificGameState.rulesVersion).toBe(8);
        expect(settingsOf(game.specificGameState).rulesVersion).toBe(8);
        expect(gameStateToModel(game.specificGameState, "a", null).rulesVersion).toBe(8);
    });

    it("keeps muster, undo and replay on the stored version after the default advances", async () => {
        for (const version of [undefined, 7, 8]) {
            const game = makeGame(["a", "b"], {}, { rulesVersion: version });
            for (const player of ["a", "b"]) {
                expect((await play(game, muster(player, readyMadePicks(game, game.specificGameState.seats.indexOf(player))))).outcome.validMove).toBe(true);
            }
            const fighter = game.specificGameState.fighters.find(one => one.owner === "a" && one.character === "knight")!;
            expect(fighter.hp).toBe(version === 8 ? 20 : 12);
            const before = structuredClone(game.specificGameState.fighters);
            expect((await play(game, actBy("a", oneStep(game, fighter)))).outcome.validMove).toBe(true);
            expect((await play(game, cmd(RealmArenaUndo, "a"))).outcome.validMove).toBe(true);
            expect(game.specificGameState.fighters).toEqual(before);
            expect(game.specificGameState.rulesVersion).toBe(version);
            const timeline = await buildTimeline(game, { a: "Alice", b: "Bob" }, [], undefined, "a");
            expect(timeline.snapshots.at(-1)!.specificGameState).toEqual(gameStateToModel(game.specificGameState, "a", game.gameState.commandHistory.at(-1)!.id));
            const response = gameStateToModel(game.specificGameState, "a", null);
            expect(response.fighters.find(one => one.id === fighter.id)?.maxHp).toBe(version === 8 ? 20 : 12);
        }
    });
});
