import type { ICommandResponse } from "@/app/api/game/command/route";
import { ISnakesAndLaddersDiceRollOutcome, IGameCommand, SnakesAndLaddersRequestDiceRoll } from "@/utils/apiModels/GameLogic";
import { useState } from "react";

interface SnakesAndLaddersPlayerActionsProps {
    hasRolled: boolean;
    /** 'plan' rolls a hypothetical die inline; 'live' hands off to `onRoll`. */
    mode?: 'live' | 'plan';
    /** Live roll handler — the page owns the roll-result screen so it survives
     *  the turn advancing to the next player. */
    onRoll?: () => void;
    /** Planning-only: submits a hypothetical roll and reports the number. */
    submitCommand?: (command: IGameCommand, callback: (commandResponse: ICommandResponse) => void) => Promise<void>;
}

export default function SnakesAndLaddersPlayerActions({ hasRolled, mode = 'live', onRoll, submitCommand }: SnakesAndLaddersPlayerActionsProps) {
    const [planRoll, setPlanRoll] = useState<number | null>(null);
    const [busy, setBusy] = useState(false);

    // ── Planning mode: a lightweight hypothetical roll with no payoff sheet ───
    if (mode === 'plan') {
        const rollPlan = async () => {
            if (busy || !submitCommand) return;
            setBusy(true);
            await submitCommand(new SnakesAndLaddersRequestDiceRoll(), (commandResponse) => {
                const outcome = commandResponse.outcome as ISnakesAndLaddersDiceRollOutcome;
                setPlanRoll(outcome.roll);
                setBusy(false);
            });
        };
        return (
            <div className="ag-actionsheet">
                <button className="ag-btn ag-btn--primary ag-btn--block ag-btn--roll" onClick={rollPlan} disabled={busy}>
                    🎲 Roll (planned)
                </button>
                {planRoll != null && (
                    <p className="ag-action-hint">Planned roll: <b>{planRoll}</b></p>
                )}
            </div>
        );
    }

    return (
        <div className="ag-actionsheet">
            <button
                className="ag-btn ag-btn--primary ag-btn--block ag-btn--roll"
                onClick={() => { if (!hasRolled) onRoll?.(); }}
                disabled={hasRolled}
            >
                🎲 Roll the die
            </button>
            <p className="ag-action-hint">The die decides — no strategy here, just fate.</p>
        </div>
    );
}
