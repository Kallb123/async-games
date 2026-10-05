import { describe, expect, it } from "vitest";
import { possessive } from "./text";

describe("possessive", () => {
    it("adds 's to a name, and a bare apostrophe to one ending in s", () => {
        expect(possessive("Alice")).toBe("Alice's");
        expect(possessive("the Renegades")).toBe("the Renegades'");
    });
});
