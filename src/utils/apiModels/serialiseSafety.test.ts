import { describe, expect, it } from "vitest";

import { deserializeJSON } from "./Serialisable";
import "./GameLogic";

describe("deserializeJSON", () => {
    it("rehydrates a registered command into a real instance", () => {
        const command = deserializeJSON(JSON.stringify({
            className: "SnakesAndLaddersRequestDiceRoll",
            gameId: "g1",
            senderId: "u1",
        }));
        expect(typeof command.Execute).toBe("function");
        expect(command.gameId).toBe("g1");
    });

    it("does not let a body choose the instance's prototype", () => {
        // JSON.parse gives __proto__ a real own property, and Object.assign
        // copies with [[Set]] — which fires Object.prototype's setter and
        // re-prototypes the command being built. /api/game/command
        // deserialises raw request bodies, so the body must not get a say.
        const command = deserializeJSON(JSON.stringify({
            className: "SnakesAndLaddersRequestDiceRoll",
            __proto__: { hijacked: true },
        }));

        expect((command as Record<string, unknown>).hijacked).toBeUndefined();
        expect(typeof command.Execute).toBe("function");
        expect(({} as Record<string, unknown>).hijacked).toBeUndefined();
    });

    it("leaves ordinary JSON alone", () => {
        expect(deserializeJSON('{"a":1,"b":[2,3]}')).toEqual({ a: 1, b: [2, 3] });
    });
});
