// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { at } from "@/utils/games/battlefield/testFixtures";
import { buildBattlefield, distance } from "@/utils/games/battlefield/terrain";
import RealmArenaTurnSheet, { actTarget, RealmArenaAim } from "./components/RealmArenaTurnSheet";
import { ACTION_POINTS, newFighter, type Action, type BattleState, type Fighter } from "./rules";
import { shadedSquares } from "./ui";
import { useTurnDraft, type TurnDraft } from "./useTurnDraft";

// Taunt (from rules version 12) and Blessing are armed, not sent: the board
// shades their radius and the sheet lists who they'd reach (§39.2).
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const field = buildBattlefield({ name: "Open", rows: ["..........", "..........", "..........", "..........", ".........."], deployments: [], objectives: {} });
const ready = (id: number, owner: string, character: "knight" | "archer" | "cleric" | "mage", col: number, row: number): Fighter =>
    ({ ...newFighter(id, owner, character, at(field, col, row)), ap: ACTION_POINTS });

const knight = ready(0, "a", "knight", 4, 2);
const bishop = ready(1, "a", "cleric", 7, 2); // 3 squares away
const archer = ready(2, "a", "archer", 8, 2); // 4 squares away
const foe = ready(3, "b", "knight", 5, 3);
const stateAt = (rulesVersion: number): BattleState => ({ field, fighters: [knight, bishop, archer, foe], sides: { a: "team", b: "enemy" }, rulesVersion });

let root: ReturnType<typeof createRoot> | undefined;
afterEach(() => { act(() => root?.unmount()); root = undefined; });

/** Mounts the real hook for the Knight and hands back what it returns, live. */
function mount(battle: BattleState, onAct: (action: Action) => void = () => {}, actor: Fighter = knight) {
    const seen: { draft: TurnDraft | null } = { draft: null };
    function Probe() {
        seen.draft = useTurnDraft(battle, "a", actor, "t", onAct);
        return null;
    }
    root = createRoot(document.createElement("div"));
    act(() => root!.render(React.createElement(Probe)));
    return () => seen.draft!;
}

describe("arming Taunt at rules version 12", () => {
    it("shades exactly the squares within 3 and rings the allies in reach, not the one at 4", () => {
        const battle = stateAt(12);
        const draft = mount(battle);
        act(() => draft().arm("taunt"));
        const shades = shadedSquares({ smoke: new Set(), aiming: { reach: draft().reach, range: draft().range, area: draft().area, blasts: draft().blasts } });
        expect(shades.map(shade => shade.kind)).toEqual(["range"]);
        field.tiles.forEach((_, square) => expect(shades[0].has(square)).toBe(distance(field, knight.square, square) <= 3));
        expect(draft().aimed).toEqual([0, 1]);
        expect(draft().action).toEqual({ kind: "taunt", fighter: 0 });
    });

    it("lists who would be braced in the sheet, with a send button, and sends the action only on it", () => {
        const battle = stateAt(12);
        const sent = vi.fn();
        const draft = mount(battle, sent);
        act(() => draft().arm("taunt"));
        expect(sent).not.toHaveBeenCalled();
        const markup = renderToStaticMarkup(React.createElement(RealmArenaAim, {
            draft: draft(), battle, player: "a", nameFor: id => id, pendingTarget: null, onFocus: () => {},
        }));
        expect(markup).toContain("Cancel");
        expect(markup).toContain("Taunt");
        expect(markup).toContain("braced");
        act(() => draft().send());
        expect(sent).toHaveBeenCalledWith({ kind: "taunt", fighter: 0 });
        expect(actTarget({ kind: "taunt", fighter: 0 }, battle)).toBe("act");
    });
});

describe("at the default rules version", () => {
    it("Taunt is still instant, with its pending state on its own row", () => {
        const battle = stateAt(11);
        const sent = vi.fn();
        const draft = mount(battle, sent);
        act(() => draft().now("taunt"));
        expect(sent).toHaveBeenCalledWith({ kind: "taunt", fighter: 0 });
        expect(actTarget({ kind: "taunt", fighter: 0 }, battle)).toBe("act:taunt");
        // Its row sends rather than arms: the sheet draws it, and nothing is shaded.
        expect(draft().range).toBeNull();
        expect(renderToStaticMarkup(React.createElement(RealmArenaTurnSheet, { draft: draft(), battle, player: "a", pendingTarget: null }))).toContain("Taunt");
    });

    it("Blessing is armed with its radius shaded and its allies listed, and is sent from the sheet", () => {
        const battle = stateAt(11);
        const sent = vi.fn();
        const draft = mount(battle, sent, bishop);
        act(() => draft().arm("blessing"));
        expect(sent).not.toHaveBeenCalled();
        expect(draft().range!.size).toBeGreaterThan(0);
        // The Cleric at 7: the Knight at 3 squares and the Archer at 1 are in reach.
        expect(draft().aimed).toEqual([0, 1, 2]);
        act(() => draft().send());
        expect(sent).toHaveBeenCalledWith({ kind: "blessing", fighter: 1 });
        expect(actTarget({ kind: "blessing", fighter: 1 }, battle)).toBe("act");
    });
});
