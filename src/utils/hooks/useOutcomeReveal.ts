import { useState } from "react";
import type { ICommandOutcome } from "@/utils/apiModels/gameCommand";
import type { SubmitCommand } from "@/utils/hooks/useSubmitCommand";

export interface OutcomeReveal<T> {
    /** Wrap the game screen's own `submitCommand` in this one, so every control is caught. */
    submitCommand: SubmitCommand;
    /** What the last command handed back worth showing, or null once dismissed. */
    reveal: T | null;
    dismiss: () => void;
}

/**
 * The end-of-turn (or end-of-move) reveal a game shows over its board: what the
 * command the player just sent actually did.
 *
 * A command that resolves something the board alone cannot show — Outbreak's
 * draw and infect phases, a Race Cars move's corners and spins — hands it back
 * on its own `ICommandOutcome` extension (see `IOutbreakInfectionPhaseOutcome`,
 * `IRaceCarsArrivalOutcome`). The screen then has to catch it whichever control
 * fired the command, which means wrapping `submitCommand` once rather than
 * threading a callback through every tap.
 *
 * Both games wrote the same five lines to do that, which is the second copy
 * AGENTS.md asks us to extract on. `extract` is the only part that differs: it
 * pulls the game's own payload off the outcome and answers null for a command
 * that resolved nothing worth a screen.
 */
export function useOutcomeReveal<T>(
    submitCommand: SubmitCommand,
    extract: (outcome: ICommandOutcome) => T | null | undefined,
): OutcomeReveal<T> {
    const [reveal, setReveal] = useState<T | null>(null);
    return {
        submitCommand: (command, callback, target) => submitCommand(command, (response) => {
            const payload = extract(response.outcome);
            if (payload) setReveal(payload);
            callback?.(response);
        }, target),
        reveal,
        dismiss: () => setReveal(null),
    };
}
