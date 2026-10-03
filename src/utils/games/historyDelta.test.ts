import { describe, expect, it } from "vitest";
import { fromHistoryDeltas, toHistoryDeltas } from "./historyDelta";
import type { IHistoryEntry } from "./history";

const line = (text: string, extra: Partial<IHistoryEntry> = {}): IHistoryEntry => ({ text, ...extra });

/** Fresh objects every time, the way resolveHistory hands each snapshot its own copy. */
const copy = (history: IHistoryEntry[]) => history.map((entry) => ({ ...entry }));

describe("history deltas", () => {
    it("sends only the lines each snapshot puts on top", () => {
        const setup = line("Turn order: Alice, Bob");
        const a = line("Alice rolled a 4", { actorId: "a", commandId: "c1" });
        const b = line("Bob rolled a 6", { actorId: "b", commandId: "c2" });
        const c = line("Bob bought a farm", { actorId: "b", commandId: "c3" });
        const histories = [[setup], [a, setup], [c, b, a, setup]].map(copy);

        expect(toHistoryDeltas(histories)).toEqual([
            { added: [setup], dropped: 0 },
            { added: [a], dropped: 0 },
            { added: [c, b], dropped: 0 },
        ]);
    });

    it("sends a snapshot whose history didn't change as an empty delta", () => {
        const a = line("Alice rolled a 4");
        expect(toHistoryDeltas([[a], [a]].map(copy))[1]).toEqual({ added: [], dropped: 0 });
    });

    it("drops the lines an undo took back off the front", () => {
        const a = line("Alice rolled a 4");
        const b = line("Alice built a road");
        expect(toHistoryDeltas([[b, a], [a]].map(copy))[1]).toEqual({ added: [], dropped: 1 });
    });

    it("resends everything in front of a line that changed in place", () => {
        const a = line("Alice rolled a 4");
        const b = line("Bob rolled a 6");
        const c = line("Bob traded");
        const histories = [[c, b, a], [c, line("Bob rolled a 6, then a 2"), a]].map(copy);

        expect(toHistoryDeltas(histories)[1]).toEqual({ added: [c, line("Bob rolled a 6, then a 2")], dropped: 2 });
    });

    it("tells two lines apart by any field, not just their text", () => {
        const histories = [[line("Alice rolled a 4", { commandId: "c1" })], [line("Alice rolled a 4", { commandId: "c2" })]];
        expect(toHistoryDeltas(histories)[1]).toEqual({ added: [histories[1][0]], dropped: 1 });
    });

    it("decodes back to exactly the histories it was given", () => {
        const pool = Array.from({ length: 8 }, (_, i) => line(`line ${i}`, { commandId: `c${i}` }));
        // Grows, holds, shrinks, rewrites the middle, empties and grows again.
        const histories = [
            [],
            [pool[0]],
            [pool[1], pool[0]],
            [pool[1], pool[0]],
            [pool[3], pool[2], pool[1], pool[0]],
            [pool[2], pool[1], pool[0]],
            [pool[4], pool[5], pool[1], pool[0]],
            [],
            [pool[6], pool[7]],
        ].map(copy);

        expect(fromHistoryDeltas(toHistoryDeltas(histories))).toEqual(histories);
    });

    it("sends each line once across a game that only ever adds lines", () => {
        const histories: IHistoryEntry[][] = [];
        let history: IHistoryEntry[] = [];
        for (let i = 0; i < 300; i++) {
            history = [line(`move ${i}`), ...history];
            histories.push(copy(history));
        }

        const sent = toHistoryDeltas(histories).reduce((total, delta) => total + delta.added.length, 0);
        expect(sent).toBe(300);
        expect(fromHistoryDeltas(toHistoryDeltas(histories))).toEqual(histories);
    });
});
