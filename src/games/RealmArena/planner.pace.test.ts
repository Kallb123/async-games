import { afterEach, describe, expect, it, vi } from "vitest";
import { FACTION_IDS, FACTIONS } from "./characters";
import { FOUR_GATE_FORT } from "./maps/fourGateFort";
import { act, endTurn, newFighter, readyMadeMuster, startTurn, viewOf, type BattleState } from "./rules";
import { nextAction, turnMemo } from "./ai";
import type { RealmArenaEndTurn } from "./RealmArenaLogic";
import { battleOf, coopBattle, seedRolls, TEAMS, warbandsOf } from "./testFixtures";

// docs/games/realm-arena.md §29.7, §29.11: the planner held to its time. A
// pace file of its own (vitest.config.ts), run once every other file is done
// and alone, so a budget is read against the planner's work rather than how
// busy the runner is with the files beside it.

vi.mock("./masteryRecord", () => ({ masterySnapshotOf: vi.fn(async () => ({})) }));

afterEach(() => {
    vi.restoreAllMocks();
});

const AI = "ai:0";

describe("nextAction's pace (§29.7)", () => {
    // The Swarm's warband is six characters to the Realm's four (§31.1), the Miners' three (§33.1).
    it.each(["realm", "swarm", "miners"] as const)("plans a %s warband's turn on the Four-Gate Fort in under 312.5 ms", faction => {
        // Three of the team's ready-made squads and one warband. The team ends
        // each of its turns where it stands, so every one of its characters is
        // on watch and every move the warband weighs has a way round to find:
        // as long as a turn gets. Rolls are as good as fixed.
        const team = ["a", "b", "c"];
        const owners = [...team, AI];
        let id = 0;
        const fighters = owners.flatMap((owner, seat) => readyMadeMuster(FOUR_GATE_FORT, seat, FACTIONS[owner === AI ? faction : "realm"].readyMade[80])
            .map(pick => newFighter(id++, owner, pick.character, pick.square)));
        let state: BattleState = { field: FOUR_GATE_FORT, fighters, sides: { a: "team", b: "team", c: "team", [AI]: "enemy" } };
        const turn = (owner: string, round: number) => {
            state = { ...state, fighters: startTurn(state, owner).fighters };
            const start = performance.now();
            if (owner === AI) {
                // As the turn loop plans it: one memo for the whole turn.
                const memo = turnMemo();
                const plan = () => nextAction(viewOf(state, AI), AI, round, undefined, memo);
                for (let action = plan(); action; action = plan()) {
                    state = { ...state, fighters: act(state, AI, action, () => 50).fighters };
                }
            }
            state = { ...state, fighters: endTurn(state, owner, round).fighters };
            return performance.now() - start;
        };
        const times: number[] = [];
        for (let round = 1; round <= 6; round++) {
            for (const player of team) turn(player, round);
            times.push(turn(AI, round));
        }
        // On average, with room for a slow turn on a busy test runner.
        expect(times.reduce((total, ms) => total + ms, 0) / times.length).toBeLessThan(312.5);
        expect(Math.max(...times)).toBeLessThan(625);
    });
});

describe("the computer in whole battles (§29.11)", () => {
    it("never breaks: every co-op battlefield, every faction, with and without fog, to the end within its time", async () => {
        const warn = vi.spyOn(console, "warn");
        const error = vi.spyOn(console, "error");
        const times: number[] = [];
        let seed = 1;
        for (const players of TEAMS) {
            for (const enemy of FACTION_IDS) {
                for (const fog of [false, true]) {
                    seedRolls(seed++);
                    const battle = await coopBattle(players, { fog, coop: { enemy } });
                    times.push(...battle.times);
                    expect(battle.game.complete).toBe(true);
                    // One ending for the whole team (§29.5).
                    expect(["teamwin", "teamloss"]).toContain(battle.game.endReason);
                    expect(battle.game.winner).toBe("");
                    // Every warband fought: each took turns, and the rotation came round.
                    const recorded = battle.game.gameState.commandHistory.flatMap(command => (command as RealmArenaEndTurn).recordedEnemyActions ?? []);
                    const owners = new Set(recorded.map(action => battleOf(battle.game).fighters[action.fighter].owner));
                    expect(owners).toEqual(new Set(warbandsOf(battle.game)));
                }
            }
        }
        // Nothing it chose was refused, and the planner never threw.
        expect(warn).not.toHaveBeenCalled();
        expect(error).not.toHaveBeenCalled();
        // On average, with room for a slow turn on a busy test runner (§29.7).
        expect(times.reduce((total, ms) => total + ms, 0) / times.length).toBeLessThan(312.5);
        expect(Math.max(...times)).toBeLessThan(1_250);
    }, 150_000);

    it("never breaks at any difficulty or battle size, in either mission", async () => {
        const warn = vi.spyOn(console, "warn");
        const error = vi.spyOn(console, "error");
        const times: number[] = [];
        let seed = 900;
        for (const size of ["small", undefined, "large"] as const) {
            for (const difficulty of ["easy", undefined, "hard"] as const) {
                seedRolls(seed);
                const mission = seed % 2 === 0 ? "holdOut" as const : undefined;
                const battle = await coopBattle(TEAMS[seed % 2], { fog: seed % 3 === 0, size, coop: { enemy: "realm", mission, difficulty } });
                seed++;
                times.push(...battle.times);
                expect(battle.game.complete).toBe(true);
                expect(["teamwin", "teamloss"]).toContain(battle.game.endReason);
            }
        }
        expect(warn).not.toHaveBeenCalled();
        expect(error).not.toHaveBeenCalled();
        // Within the budget on average (§29.7). A large battle on Hard fields
        // the most characters on both sides, and its slowest turns take about
        // three-quarters of a second, so the slowest is held to more (§30.5).
        expect(times.reduce((total, ms) => total + ms, 0) / times.length).toBeLessThan(312.5);
        expect(Math.max(...times)).toBeLessThan(1_875);
    }, 225_000);
});
