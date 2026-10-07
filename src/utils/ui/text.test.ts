import { describe, expect, it } from "vitest";
import { andList, numberWord, possessive } from "./text";

describe("possessive", () => {
    it("adds 's to a name, and a bare apostrophe to one ending in s", () => {
        expect(possessive("Alice")).toBe("Alice's");
        expect(possessive("the Renegades")).toBe("the Renegades'");
    });
});

describe("andList", () => {
    it("joins items as prose, with commas up to the last and no serial comma", () => {
        expect(andList([])).toBe("");
        expect(andList(["Archer"])).toBe("Archer");
        expect(andList(["Archer", "Knight"])).toBe("Archer and Knight");
        expect(andList(["Archer", "Knight", "Mage"])).toBe("Archer, Knight and Mage");
    });
});

describe("numberWord", () => {
    it("spells a small count out, and leaves a large one as digits", () => {
        expect(numberWord(2)).toBe("two");
        expect(numberWord(10)).toBe("ten");
        expect(numberWord(11)).toBe("11");
    });
});
