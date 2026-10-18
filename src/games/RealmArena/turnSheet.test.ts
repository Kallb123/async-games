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
