import { describe, expect, it } from "vitest";

import { playableOutOfTurn } from "../gameCommand";
import type { IGameCommand } from "../gameCommand";
import { deserializeJSON, registeredClassNames } from "../Serialisable";
import "../GameLogic";

// The tripwire docs/out-of-turn-actions.md §5.1 asks for: every registered
// class that may be played off its sender's turn, asked exactly the way the
// command route asks — so an inherited flag or a getter is caught too, which a
// source scan for the literal declaration would miss.
//
// The command route's turn gate is the only membership-adjacent check most
// commands get, and their Execute relies on it rather than re-checking whose
// turn it is. A class on this list has opted out of it, and its own Execute is
// all that stands between a teammate and every rule the gate used to enforce
// for it. So adding a class here needs a reviewer to read that Execute and
// find, for each kind it accepts:
//
// - what it refuses out of turn (`gameData.currentTurn !== this.senderId`),
//   and that the refusal covers every kind that isn't meant to be played so;
// - that it never finishes the active player's phase for them (§2 row 8) —
//   the pipeline refuses a `turnOver`, but not a phase moved on quietly;
// - that it spends only the sender's own resources.
//
// Built from the live registry rather than a list of files, which is why it
// lives apart from outOfTurn.test.ts: that file registers test-only classes
// that declare the flag, and they'd land here.
const PLAYABLE_OUT_OF_TURN: string[] = [
    // Both specials, in either of the active player's phases (rules.ts
    // outOfTurnPlayable); spends only the sender's card; never runs the
    // flood or closes the discard off turn, and clears the undo stack.
    "BannedIsletPlayCard",
];

describe("commands playable out of turn", () => {
    it("are exactly the reviewed list", () => {
        const declaring = registeredClassNames()
            .filter((className) => {
                const instance = deserializeJSON(JSON.stringify({ className })) as IGameCommand;
                return playableOutOfTurn(instance);
            })
            .sort();

        expect(
            declaring,
            "A command class's playableOutOfTurn answer changed. Read its Execute's out-of-turn " +
                "gate (see the checklist above) before updating PLAYABLE_OUT_OF_TURN.",
        ).toEqual([...PLAYABLE_OUT_OF_TURN].sort());
    });

    it("asks a real registry, not an empty one", () => {
        // If the barrel import ever stopped registering anything, the test
        // above would pass vacuously.
        expect(registeredClassNames().length).toBeGreaterThan(50);
    });
});
