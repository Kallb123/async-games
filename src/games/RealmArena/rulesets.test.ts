import { describe, expect, it, vi } from "vitest";
import { buildBattlefield } from "@/utils/games/battlefield/terrain";
import { resolveStalledTurn } from "@/utils/games/turnTimeout";
import { nextAction } from "./ai";
import { distance } from "@/utils/games/battlefield/terrain";
import { buildTimeline } from "@/utils/games/replay";
import { masteryRoster, weaponLine } from "./roster";
import { eventLines } from "./ui";
import { realmArenaRecapAdapter } from "./recap";
import type { ITurnSnapshot } from "@/utils/games/replay";
import { abilitiesOf, actionPointsOf, afflicted, armourOf, bankedAp, damageTo, endTurn, startTurn, temporaryCover, weaponOf, act, battleFrom, check, fixedRolls, movementOf, newFighter, viewOf, type BattleState } from "./rules";
import { currentRuleset, rulesetFor, type RealmArenaRuleset, type RulesContext } from "./rulesets";
import { rangeKindOf } from "./tactics";
import { hpPreview } from "./useTurnDraft";
import { characterStats } from "./stats";
import { gameStateToModel, RealmArenaInvitationModel, settingsOf, type IRealmArenaGameData } from "./RealmArenaModels";
import { RealmArenaUndo, undoDepthOf, type IRealmArenaOutcome } from "./RealmArenaLogic";
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
    const behavior: RealmArenaRuleset = {
        ...future,
        RULES: { ...old.RULES, ACTION_POINTS: 6, BONUS_AP: 1, ATTACK_AP: 1, REACTION_COST: 1,
            MAX_ATTACKS_PER_TURN: 2, BANK_CAP: 2, MELEE_ACCURACY: 55, ARMOUR: 3 },
        CHARACTERS: { ...future.CHARACTERS, knight: { ...future.CHARACTERS.knight, name: "Sentinel", plural: "Sentinels", bonusAp: 1 } },
        FACTIONS: { ...future.FACTIONS, realm: { ...future.FACTIONS.realm, characters: future.FACTIONS.realm.characters.filter(id => id !== "scout") } },
        ABILITIES: { ...future.ABILITIES,
            shieldWall: { ...future.ABILITIES.shieldWall, passive: true, bonusAp: 1, coverFor: "everyone" },
            raise: { ...future.ABILITIES.raise, apOnRaise: 2 },
            sneak: { ...future.ABILITIES.sneak, movesWithoutReactions: false },
            huntersMark: { ...future.ABILITIES.huntersMark, name: "Beacon" },
            purify: { ...future.ABILITIES.purify, bonusAp: 3 },
        },
        EFFECTS: { ...future.EFFECTS, corroded: { ...future.EFFECTS.corroded, name: "Ward", state: "warded", cover: "full", tick: "end", damage: 2, apModifier: -1 },
            slowed: { ...future.EFFECTS.slowed, armour: 2 },
            marked: { ...future.EFFECTS.marked, damageBonus: 1, abilityDamageBonus: 2 } },
    };
    const resolve = (version: number | undefined) => version === 9 ? behavior : version === 8 ? future : real.rulesetFor(version);
    return {
        ...real,
        CURRENT_RULESET_VERSION: 8,
        currentRuleset: behavior,
        rulesetFor: resolve,
        ruleValuesOf: (context?: RulesContext) => (context === undefined ? behavior : resolve(context.rulesVersion)).RULES,
        rulesetOf: (context?: RulesContext) => context === undefined ? behavior : resolve(context.rulesVersion),
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
        for (const version of [undefined, 7, 8, 9]) {
            const game = makeGame(["a", "b"], {}, { rulesVersion: version });
            for (const player of ["a", "b"]) {
                expect((await play(game, muster(player, readyMadePicks(game, game.specificGameState.seats.indexOf(player))))).outcome.validMove).toBe(true);
            }
            const fighter = game.specificGameState.fighters.find(one => one.owner === "a" && one.character === "knight")!;
            expect(fighter.hp).toBe((version ?? 0) >= 8 ? 20 : 12);
            const before = structuredClone(game.specificGameState.fighters);
            expect((await play(game, actBy("a", oneStep(game, fighter)))).outcome.validMove).toBe(true);
            expect(game.gameState.history.some(entry => entry.text.includes(version === 9 ? "Sentinel" : "Knight"))).toBe(true);
            expect(fighter.ap).toBe(version === 9 ? 9 : 4);
            expect((await play(game, cmd(RealmArenaUndo, "a"))).outcome.validMove).toBe(true);
            expect(game.specificGameState.fighters).toEqual(before);
            expect(game.specificGameState.rulesVersion).toBe(version);
            const timeline = await buildTimeline(game, { a: "Alice", b: "Bob" }, [], undefined, "a");
            expect(timeline.snapshots.at(-1)!.specificGameState).toEqual(gameStateToModel(game.specificGameState, "a", game.gameState.commandHistory.at(-1)!.id));
            const response = gameStateToModel(game.specificGameState, "a", null);
            expect(response.fighters.find(one => one.id === fighter.id)?.maxHp).toBe((version ?? 0) >= 8 ? 20 : 12);
        }
    });
});


describe("catalogue-driven behavior", () => {
    const battle = (version: number, fighters: BattleState["fighters"]) => battleFrom(FIELD, { rulesVersion: version, fighters });
    const ready = (id: number, owner: string, character: Parameters<typeof newFighter>[2], square: number, version: number) =>
        ({ ...newFighter(id, owner, character, square, null, undefined, false, { rulesVersion: version }), ap: 20 });

    it("reads AP, attack costs and the per-turn attack limit from the catalogue", () => {
        for (const version of [7, 9]) {
            let state = battle(version, [ready(0, "a", "knight", 0, version), { ...ready(1, "b", "knight", 1, version), hp: 100 }]);
            const attack = { kind: "attack", fighter: 0, target: 1 } as const;
            expect(check(state, "a", attack)).toEqual({ ap: version === 9 ? 1 : 2 });
            for (let count = 0; count < 2; count++) state = { ...state, fighters: act(state, "a", attack, fixedRolls([1])).fighters };
            expect("refused" in check(state, "a", attack)).toBe(version === 9);
            state = { ...state, fighters: startTurn(state, "a").fighters };
            expect(state.fighters[0].ap).toBe(version === 9 ? 9 : 4);
            expect("refused" in check(state, "a", attack)).toBe(false);
        }
    });

    it("caps explicit and automatic banking, and charges the selected reaction cost", () => {
        for (const version of [7, 9]) {
            const state = battle(version, [ready(0, "a", "archer", 0, version)]);
            expect(act(state, "a", { kind: "watch", fighter: 0 }, fixedRolls([])).fighters[0].banked).toBe(version === 9 ? 2 : 20);
            expect(endTurn(state, "a", 1).fighters[0].banked).toBe(version === 9 ? 2 : 20);
            expect(bankedAp(7, state)).toBe(version === 9 ? 2 : 7);
        }
    });

    it("keeps undo deep enough for the most AP one character can have under the battle's catalogue", () => {
        // Today's 4; and the future's Cleric mustered with Purify: 6 AP, 1 for
        // everyone, and the 3 its Purify adds when used — past the Knight's 9.
        expect([undefined, 7].map(rulesVersion => undoDepthOf({ rulesVersion }))).toEqual([4, 4]);
        expect(undoDepthOf({ rulesVersion: 9 })).toBe(10);
    });

    it("grants AP on Raise only where that ability definition says to", () => {
        for (const version of [7, 9]) {
            const state = battle(version, [ready(0, "a", "cleric", 0, version), { ...ready(1, "a", "knight", 1, version), hp: 0, ap: 0 }]);
            const outcome = act(state, "a", { kind: "raise", fighter: 0, target: 1 }, fixedRolls([]));
            expect(outcome.fighters[1].ap).toBe(version === 9 ? 2 : 0);
        }
    });

    it("interprets passive cover and temporary effect cover without version branches", () => {
        const state = battle(9, [ready(0, "a", "knight", 0, 9), ready(1, "a", "archer", 1, 9)]);
        expect(temporaryCover(state, state.fighters[1])).toBe("half");
        expect(check(state, "a", { kind: "shieldWall", fighter: 0 })).toHaveProperty("refused", "Shield wall is passive");
        const warded = afflicted(state.fighters[1], "corroded", 0, state)!.fighter;
        expect(temporaryCover({ ...state, fighters: [state.fighters[0], warded] }, warded)).toBe("full");
        const old = battle(7, state.fighters);
        expect(temporaryCover(old, old.fighters[1])).toBe("none");
    });

    it("lets an aura's cover reach enemies only where its definition says so", () => {
        const knight = { ...ready(0, "a", "knight", 0, 9), effects: { shieldWall: 1 } };
        for (const version of [7, 9]) {
            const state = battle(version, [knight, ready(1, "a", "archer", 1, version), ready(2, "b", "archer", 12, version)]);
            expect(temporaryCover(state, state.fighters[1])).toBe("half");
            expect(temporaryCover(state, state.fighters[2])).toBe(version === 9 ? "half" : "none");
        }
    });

    it("adds effect armour and damage bonuses to every blow, an ability's bonus to its own alone", () => {
        for (const version of [7, 9]) {
            const blessed = { ...ready(0, "a", "knight", 0, version), effects: { marked: 2 } };
            const braced = { ...ready(1, "b", "knight", 1, version), hp: 100, effects: { slowed: 2 } };
            const state = battle(version, [blessed, braced]);
            expect(armourOf(state, braced)).toBe(version === 9 ? 2 : 0);
            expect(damageTo(state, blessed, braced)).toBe(version === 9 ? 3 : 4);
            expect(damageTo(state, blessed, braced, 4, "ability")).toBe(version === 9 ? 5 : 4);
            expect(damageTo(state, blessed, braced, 1)).toBe(1);
            expect(damageTo(state, blessed, braced, 0)).toBe(0);
            const struck = act(state, "a", { kind: "attack", fighter: 0, target: 1 }, fixedRolls([1])).events.find(event => event.kind === "struck");
            expect(struck).toMatchObject({ damage: version === 9 ? 3 : 4 });
        }
    });

    it("ticks and expires an effect at its configured boundary, preserving legacy ticks", () => {
        const unit = { ...ready(0, "a", "knight", 0, 9), hp: 10, effects: { corroded: 2 } };
        let state = battle(9, [unit]);
        state = { ...state, fighters: startTurn(state, "a").fighters };
        expect(state.fighters[0]).toMatchObject({ hp: 10, ap: 8, effects: { corroded: 2 } });
        state = { ...state, fighters: endTurn(state, "a", 1).fighters };
        expect(state.fighters[0]).toMatchObject({ hp: 8, effects: { corroded: 1 } });
        state = { ...state, fighters: startTurn(state, "a").fighters };
        state = { ...state, fighters: endTurn(state, "a", 2).fighters };
        expect(state.fighters[0].hp).toBe(6);
        expect(state.fighters[0].effects.corroded).toBeUndefined();
        const old = startTurn(battle(7, [unit]), "a").fighters[0];
        expect(old.hp).toBe(10);
        expect(old.effects.corroded).toBe(1);
    });

    it("uses the ability flag to decide whether movement provokes reactions", () => {
        for (const version of [7, 9]) {
            const mover = ready(0, "a", "scout", 0, version);
            const watcher = { ...ready(1, "b", "archer", 6, version), banked: 2 };
            const outcome = act(battle(version, [mover, watcher]), "a", { kind: "sneak", fighter: 0, path: [0, 1, 2] }, fixedRolls([1]));
            expect(outcome.events.some(event => event.kind === "shot")).toBe(version === 9);
            expect(outcome.fighters[1].banked).toBe(version === 9 ? 1 : 2);
        }
    });

    it("folds historical recap names and plurals using the battle catalogue", () => {
        for (const version of [7, 9]) {
            const gs = makeGame(["a", "b"], {}, { rulesVersion: version }).specificGameState;
            gs.phase = "battle";
            gs.fighters = [ready(0, "a", "knight", 0, version), ready(1, "a", "knight", 1, version)];
            const response = gameStateToModel(gs, "a", null);
            const snapshot = (history: ITurnSnapshot["history"]): ITurnSnapshot => ({ index: 0, specificGameState: response, currentTurn: "a", complete: false, winner: "", history, command: null, planned: false });
            const rows = gs.fighters.flatMap(fighter => {
                const command = actBy("a", { kind: "move", fighter: fighter.id, path: [fighter.square, fighter.square + 2] });
                command.senderUsername = "Alice";
                const title = `Alice moved their ${version === 9 ? "Sentinel" : "Knight"}`;
                return realmArenaRecapAdapter.toEvents(snapshot([]), snapshot([{ text: title, actorId: "a", commandId: command.id }]), command,
                    { validMove: true, turnOver: false, events: [{ kind: "moved", fighter: fighter.id, path: [fighter.square, fighter.square + 2], sneaking: false }] } as IRealmArenaOutcome);
            });
            const folded = realmArenaRecapAdapter.postProcess!(rows, { forFeed: true });
            expect(folded.map(row => row.title)).toEqual([`Alice moved two ${version === 9 ? "Sentinels" : "Knights"}`]);
        }
    });

    it("pins melee odds and narration, while marking retired mastery separately", () => {
        const fighters = [ready(0, "a", "knight", 0, 7), ready(1, "b", "scout", 1, 7)];
        const event = { kind: "marked", fighter: 0, target: 1 } as const;
        const old = eventLines([event], fighters, "a", id => id, { rulesVersion: 7 })[0].title;
        const next = eventLines([event], fighters, "a", id => id, { rulesVersion: 9 })[0].title;
        expect(old).toContain("Knight");
        expect(old).toContain("Hunter's mark");
        expect(next).toContain("Sentinel");
        expect(next).toContain("Beacon");
        expect(weaponLine(weaponOf({ rulesVersion: 7 }, fighters[0]), { rulesVersion: 7 })).toContain("80%");
        expect(weaponLine(weaponOf({ rulesVersion: 9 }, fighters[0]), { rulesVersion: 9 })).toContain("55%");
        expect(masteryRoster({ scout: { xp: 15, battles: 1, attacks: 0, abilities: 0, items: 0 } }, { rulesVersion: 9 })).toContainEqual({ id: "scout", retired: true });
        expect(masteryRoster({}, { rulesVersion: 9 }).some(row => row.id === "scout")).toBe(false);
        expect(actionPointsOf(fighters[0], { rulesVersion: 7 })).toBe(4);
    });
});
