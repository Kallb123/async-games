import { describe, expect, it } from "vitest";
import { brokenBroodText, coopText, guide } from "./guide";
import { holdOutDifficultyDescription, brokenBroodHoldOut } from "./ui";
import { tutorial } from "./tutorial";
import { ruleValuesOf, rulesetFor } from "./rulesets";

const V12 = { rulesVersion: 12 };
const V13 = { rulesVersion: 13 };

describe("Hold Out copy", () => {
    it("switches on the ruleset", () => {
        expect(brokenBroodHoldOut(V12)).toBe(false);
        expect(brokenBroodHoldOut(V13)).toBe(true);
    });

    it("tells version 12's waves at version 12, and the guide still does while 12 is current", () => {
        const text = coopText(V12);
        expect(text).toContain("a fresh wave lands");
        expect(text).not.toContain("Shrine");
        if (!brokenBroodHoldOut()) expect(guide.sections.at(-1)!.body).toBe(coopText());
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
    });

    it("describes the setup's difficulty by the spawn, the nests and the Shrine", () => {
        const rules = ruleValuesOf(V13);
        const nest = rulesetFor(13).CHARACTERS.nest.hp;
        expect(holdOutDifficultyDescription("normal", V13)).toBe(`Each nest spawns ${rules.SPAWN_THREAT} threat a round, has ${nest} HP, and the Shrine has ${rules.SHRINE_HP} HP, plus ${rules.SHRINE_HP_PER_PLAYER} for each of you.`);
        expect(holdOutDifficultyDescription("easy", V13)).toContain(`spawns ${rules.SPAWN_THREAT! - 1} threat`);
        expect(holdOutDifficultyDescription("easy", V13)).toContain(`has ${nest - 3} HP`);
        expect(holdOutDifficultyDescription("hard", V13)).toContain(`the Shrine has ${rules.SHRINE_HP! - 10} HP`);
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
