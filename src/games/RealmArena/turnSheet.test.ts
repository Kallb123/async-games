import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { buildBattlefield } from "@/utils/games/battlefield/terrain";
import { RealmArenaAim } from "./components/RealmArenaTurnSheet";
import { newFighter, shotOdds, type BattleState } from "./rules";
import type { TurnDraft } from "./useTurnDraft";

it("shows Shoot + Dodge's hit, graze and damage stats alongside dodge guidance", () => {
    const field = buildBattlefield({ name: "Shot", rows: ["..........", ".........."], deployments: [], objectives: {} });
    const archer = { ...newFighter(0, "a", "archer", 0), ap: 4 };
    const target = newFighter(1, "b", "archer", 8);
    const battle: BattleState = { field, fighters: [archer, target], rulesVersion: 9 };
    const path = [0, 1];
    const noop = () => {};
    const draft: TurnDraft = {
        fighter: archer, aim: "shootDodge", targets: [1], candidates: [], options: [],
        arm: noop, clear: noop, now: noop, send: noop, pick: noop,
        tapSquare: noop, tapFighter: () => false,
        reach: null, range: null, path, forcedPath: null, after: { square: 1, ap: 1 },
        reactions: [], area: null, hpChange: new Map(), blasts: null,
        action: { kind: "shootDodge", fighter: 0, target: 1, path }, verdict: { ap: 3 },
    };
    const markup = renderToStaticMarkup(React.createElement(RealmArenaAim, {
        draft, battle, player: "a", nameFor: id => id, pendingTarget: null, onFocus: noop,
    }));
    const odds = shotOdds(battle, archer, target, "shootDodge")!;
    expect(markup).toContain(`${odds.chance}%`);
    expect(markup).toContain(`${odds.grazeChance}%`);
    expect(markup).toContain("Hit");
    expect(markup).toContain("Graze");
    expect(markup).toContain("Damage");
    expect(markup).toContain("Nobody reacts");
});


it("keeps passives and described effects below a selected unit's actions", async () => {
    const { default: FighterCard } = await import("./components/RealmArenaFighterCard");
    const field = buildBattlefield({ name: "Details", rows: [".."], deployments: [], objectives: {} });
    const fighter = { ...newFighter(0, "a", "knight", 0), effects: { poisoned: 1 } };
    const markup = renderToStaticMarkup(React.createElement(FighterCard, {
        fighter, battle: { field, fighters: [fighter], rulesVersion: 9 }, label: "Knight",
    }, React.createElement("div", null, "Selected actions")));
    expect(markup.indexOf("Bulwark")).toBeGreaterThan(markup.indexOf("Selected actions"));
    expect(markup.indexOf("Poisoned")).toBeGreaterThan(markup.indexOf("Selected actions"));
    expect(markup).toContain("1 damage a turn, 1 turn");
    expect(markup).toContain("Info about Knight");
});

it("sums allied health while only counting enemies supplied by the visible battle", async () => {
    const { default: TeamHealth } = await import("./components/RealmArenaTeamHealth");
    const { warbandOwner } = await import("./rules");
    const field = buildBattlefield({ name: "Health", rows: ["...."], deployments: [], objectives: {} });
    const fighters = [
        { ...newFighter(0, "a", "knight", 0), hp: 4, maxHp: 12 },
        { ...newFighter(1, "b", "knight", 1), hp: 0, maxHp: 12 },
        { ...newFighter(2, warbandOwner(0), "knight", 2), hp: 3, maxHp: 8 },
    ];
    const markup = renderToStaticMarkup(React.createElement(TeamHealth, { battle: { field, fighters, fog: true } }));
    expect(markup).toContain("Team · 4/24 HP");
    expect(markup).toContain("Enemies in sight · 3/8 HP");
    expect(markup).toContain('max="24" value="4"');
});


it("hides the details list when the selected unit has no passives or status effects", async () => {
    const { default: FighterCard } = await import("./components/RealmArenaFighterCard");
    const field = buildBattlefield({ name: "No details", rows: [".."], deployments: [], objectives: {} });
    const fighter = newFighter(0, "a", "archer", 0);
    const markup = renderToStaticMarkup(React.createElement(FighterCard, {
        fighter, battle: { field, fighters: [fighter], rulesVersion: 9 }, label: "Archer",
    }, React.createElement("div", null, "Selected actions")));
    expect(markup).toContain("Selected actions");
    expect(markup).not.toContain('class="ag-list"');
});
