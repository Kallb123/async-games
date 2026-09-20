import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
    GAME_TUTORIALS,
    GameTutorial,
    TOUR_ANCHORS,
    TutorialStep,
    anchorSelector,
    applicableSteps,
    hasTutorial,
    tutorialRun,
} from "./gameTutorials";

const uiRoot = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.resolve(uiRoot, "..", "..");

// Every .tsx/.ts file under src/, so we can grep for data-tour attributes and
// TOUR_ANCHORS class usage without pretending to render anything (there is no
// jsdom in this repo — see docs/game-tutorials.md §11).
function walk(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) return walk(full);
        return full.endsWith(".ts") || full.endsWith(".tsx") ? [full] : [];
    });
}

const sourceFiles = walk(srcRoot);
const componentFiles = sourceFiles.filter((f) => f.endsWith(".tsx"));
const sourceText = sourceFiles.map((f) => readFileSync(f, "utf8")).join("\n");
const componentText = componentFiles.map((f) => readFileSync(f, "utf8")).join("\n");

describe("GAME_TUTORIALS anchors", () => {
    it("resolves every registered step's anchor to a TOUR_ANCHORS name or a data-tour attribute", () => {
        const missing: string[] = [];
        for (const [gameUrl, tutorial] of Object.entries(GAME_TUTORIALS)) {
            for (const step of tutorial.steps) {
                if (!step.anchor) continue;
                const isNamedAnchor = step.anchor in TOUR_ANCHORS;
                const isDataTour = sourceText.includes(`data-tour="${step.anchor}"`);
                if (!isNamedAnchor && !isDataTour) {
                    missing.push(`${gameUrl}: "${step.anchor}"`);
                }
            }
        }
        expect(
            missing,
            `These tutorial steps name an anchor that is neither a TOUR_ANCHORS ` +
                `key nor a data-tour="…" attribute anywhere under src/:\n` +
                missing.map((m) => `  - ${m}`).join("\n"),
        ).toEqual([]);
    });

    it("keeps every TOUR_ANCHORS selector applied to something under src/", () => {
        // Grepping the components rather than ag-theme.css: a CSS rule outlives
        // its markup, so checking the stylesheet would only prove the rule
        // still exists, not that anything on screen still wears the class.
        const missing = Object.entries(TOUR_ANCHORS).filter(([, selector]) => {
            const className = selector.replace(/^\./, "");
            return !componentText.includes(className);
        });
        expect(
            missing.map(([name]) => name),
            `These TOUR_ANCHORS entries have no component under src/ wearing their ` +
                `class any more — the anchor rotted out from under the tutorial:\n` +
                missing.map(([name, selector]) => `  - ${name}: ${selector}`).join("\n"),
        ).toEqual([]);
    });

    it("finds at least one anchor to check against (sanity check on the scanner)", () => {
        expect(componentFiles.length).toBeGreaterThan(0);
    });
});

describe("hasTutorial", () => {
    it("is true only for a game registered in GAME_TUTORIALS", () => {
        expect(hasTutorial("dicecities")).toBe(true);
        for (const gameUrl of ["outbreak", "worlddomination", "not-a-real-game"]) {
            expect(hasTutorial(gameUrl)).toBe(false);
        }
    });
});

describe("anchorSelector", () => {
    it("resolves a TOUR_ANCHORS name to its shared selector", () => {
        expect(anchorSelector("scoreboard")).toBe(TOUR_ANCHORS.scoreboard);
        expect(anchorSelector("board")).toBe(TOUR_ANCHORS.board);
    });

    it("falls back to a data-tour selector for a game's own anchor", () => {
        expect(anchorSelector("dc-market")).toBe('[data-tour="dc-market"]');
    });
});

describe("applicableSteps", () => {
    type Signal = "myTurn" | "hasRolled" | "canBuild";

    const tutorial: GameTutorial<Signal> = {
        steps: [
            { title: "Welcome", body: "…" },
            { anchor: "scoreboard", title: "The scoreboard", body: "…" },
            {
                anchor: "dc-roll",
                title: "Your roll",
                body: "…",
                when: "myTurn",
                advanceOn: "hasRolled",
                hint: "Tap Roll the dice",
            },
            { anchor: "dc-market", title: "The market", body: "…", when: "canBuild" },
        ],
    };

    it("keeps a step with no when/advanceOn unconditionally", () => {
        const steps = applicableSteps(tutorial, { myTurn: false, hasRolled: false, canBuild: false });
        expect(steps.map((s) => s.title)).toContain("Welcome");
        expect(steps.map((s) => s.title)).toContain("The scoreboard");
    });

    it("drops a step whose when signal doesn't hold", () => {
        const steps = applicableSteps(tutorial, { myTurn: false, hasRolled: false, canBuild: false });
        expect(steps.map((s) => s.title)).not.toContain("Your roll");
        expect(steps.map((s) => s.title)).not.toContain("The market");
    });

    it("includes a step once its when signal holds", () => {
        const steps = applicableSteps(tutorial, { myTurn: true, hasRolled: false, canBuild: true });
        expect(steps.map((s) => s.title)).toContain("Your roll");
        expect(steps.map((s) => s.title)).toContain("The market");
    });

    it("drops a do-it step whose advanceOn signal is already true at run start", () => {
        // The player already rolled before the tour reached this step — "tap
        // Roll the dice" would be wrong, so the step never appears at all
        // rather than being shown and instantly auto-advanced past.
        const steps = applicableSteps(tutorial, { myTurn: true, hasRolled: true, canBuild: true });
        expect(steps.map((s) => s.title)).not.toContain("Your roll");
    });

    it("reports an empty run for a tutorial with no applicable steps", () => {
        const noStepsTutorial: GameTutorial<Signal> = {
            steps: [
                { anchor: "dc-roll", title: "Your roll", body: "…", when: "myTurn" },
                { anchor: "dc-market", title: "The market", body: "…", when: "canBuild" },
            ],
        };
        const steps = applicableSteps(noStepsTutorial, { myTurn: false, hasRolled: false, canBuild: false });
        expect(steps).toEqual([]);
    });
});

describe("tutorialRun", () => {
    it("carries the tutorial, signals and active flag through unchanged", () => {
        const step: TutorialStep<"myTurn"> = { title: "Welcome", body: "…" };
        const tutorial: GameTutorial<"myTurn"> = { steps: [step] };
        const run = tutorialRun(tutorial, { myTurn: true }, { active: true });
        expect(run).toEqual({ tutorial, signals: { myTurn: true }, active: true });
    });
});
