import { describe, expect, it } from "vitest";
import { brokenBroodText, coopText, guide } from "./guide";
import { holdOutDifficultyDescription, holdOutMissionDescription } from "./ui";
import { HOLD_OUT_STAR_INFO, HOLD_OUT_STARS, nestsProduce } from "./rules";
import { tutorial } from "./tutorial";
import { ruleValuesOf, rulesetFor } from "./rulesets";

const V12 = { rulesVersion: 12 };
const V13 = { rulesVersion: 13 };

describe("Hold Out copy", () => {
    it("switches on the ruleset", () => {
        expect(nestsProduce("holdOut", V12)).toBe(false);
        expect(nestsProduce("holdOut", V13)).toBe(true);
        expect(nestsProduce("holdCentre", V13)).toBe(false);
    });

    it("ends the guide with version 13's Hold Out, which is the current release's", () => {
        expect(guide.sections.at(-1)!.body).toBe(coopText(V13));
        expect(coopText()).toBe(coopText(V13));
        expect(guide.sections.at(-1)!.body).not.toContain("fresh wave");
        expect(guide.sections.at(-1)!.body).toContain("Shrine");
    });

    it("tells version 13's Hold Out from the rule values", () => {
        const text = coopText(V13);
        const rules = ruleValuesOf(V13);
        expect(text).not.toMatch(/undefined|NaN/);
        expect(text).not.toContain("fresh wave");
        for (const word of ["Shrine", "nests", "Mend", "Held", "Broke the Brood", "Unscathed", "Easy", "Hard", "Sacked Fort", "Sunken Village", "Hold the Centre"]) expect(text).toContain(word);
        expect(text).toContain(`round ${rules.HOLD_OUT_ROUNDS}`);
        expect(text).toContain(`${rules.ROUND_BONUS} points for each round left`);
        expect(text).toContain(`${rulesetFor(13).CHARACTERS.nest.hp} HP each`);
        expect(text).toContain(`${rules.SHRINE_HP} HP and ${rules.SHRINE_HP_PER_PLAYER} more`);
        for (const round of rules.RALLY_ROUNDS!) expect(text).toContain(String(round));
        expect(brokenBroodText(V13)).toContain("Break the Brood");
        // The Hold the Centre half and the enemies it can be fought against.
        expect(text.startsWith("If the host chose co-op, 2 to")).toBe(true);
        expect(text).toContain("Hold the Centre is fought against the Renegades");
    });

    it("names the stars from the rules in the guide and the tutorial", () => {
        const names = HOLD_OUT_STARS.map(star => HOLD_OUT_STAR_INFO[star].name);
        for (const name of names) expect(coopText(V13)).toContain(name);
        const brood = tutorial.steps.find(step => step.title === "Break the Brood");
        for (const name of names) expect(brood?.body).toContain(name);
    });

    it("tells the setup's Hold Out the way the guide does: break the Brood, or hold the Shrine", () => {
        const rounds = ruleValuesOf(V13).HOLD_OUT_ROUNDS;
        expect(holdOutMissionDescription(V13)).toBe(`Break the Brood by destroying every nest, or hold the Shrine to round ${rounds}.`);
    });

    it("describes the setup's difficulty by the spawn, the nests and the Shrine", () => {
        const rules = ruleValuesOf(V13);
        const nest = rulesetFor(13).CHARACTERS.nest.hp;
        expect(holdOutDifficultyDescription("normal", V13)).toBe(`Nests of ${nest} HP; the Shrine has ${rules.SHRINE_HP} HP, plus ${rules.SHRINE_HP_PER_PLAYER} for each of you.`);
        expect(holdOutDifficultyDescription("easy", V13)).toBe(`The nests hatch less each round and have ${nest - 3} HP; the Shrine has ${rules.SHRINE_HP! + 10} HP, plus ${rules.SHRINE_HP_PER_PLAYER} for each of you.`);
        expect(holdOutDifficultyDescription("hard", V13)).toBe(`The nests hatch more each round and have ${nest + 3} HP; the Shrine has ${rules.SHRINE_HP! - 10} HP, plus ${rules.SHRINE_HP_PER_PLAYER} for each of you.`);
        for (const difficulty of ["easy", "normal", "hard"] as const) expect(holdOutDifficultyDescription(difficulty, V13)).not.toMatch(/threat/);
        expect(holdOutDifficultyDescription("hard", V13)).not.toMatch(/undefined|NaN/);
    });

    it("gates the tutorial's centre and Brood steps on their own signals", () => {
        expect(tutorial.steps.find(step => step.title === "The centre")?.when).toBe("centre");
        const brood = tutorial.steps.find(step => step.title === "Break the Brood");
        expect(brood?.when).toBe("breakTheBrood");
        expect(brood?.anchor).toBe("ra-stats");
        expect(brood?.body).not.toMatch(/undefined|NaN/);
    });
});
