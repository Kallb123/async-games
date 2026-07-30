import ActionButton from "@/components/ui/ActionButton";
import type { SubmitCommand } from "@/utils/hooks/useSubmitCommand";
import { ISnakesAndLaddersDiceRollOutcome, SnakesAndLaddersRequestDiceRoll } from "@/utils/apiModels/GameLogic";
import { useState } from "react";

interface SnakesAndLaddersPlayerActionsProps {
    hasRolled: boolean;
    /** 'plan' rolls a hypothetical die inline; 'live' hands off to `onRoll`. */
    mode?: 'live' | 'plan';
    /** Live roll handler — the page owns the roll-result screen so it survives
     *  the turn advancing to the next player. */
    onRoll?: () => void;
    /** Live only: true while the roll is on its way to the server. */
    pending?: boolean;
    /** Live only: this game's "a 6 earns another roll" house rule is on. */
    reRollOnSix?: boolean;
    /** Live only: the roll about to be taken is one a 6 just earned. */
    bonusRoll?: boolean;
    /** Planning-only: submits a hypothetical roll and reports the number. */
    submitCommand?: SubmitCommand;
}

export default function SnakesAndLaddersPlayerActions({ hasRolled, mode = 'live', onRoll, pending = false, reRollOnSix = false, bonusRoll = false, submitCommand }: SnakesAndLaddersPlayerActionsProps) {
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
                <ActionButton
                    className="ag-btn ag-btn--primary ag-btn--block ag-btn--roll"
                    onClick={rollPlan}
                    pending={busy}
                    pendingLabel="Rolling…"
                >
                    🎲 Roll (planned)
                </ActionButton>
                {planRoll != null && (
                    <p className="ag-action-hint">Planned roll: <b>{planRoll}</b></p>
                )}
            </div>
        );
    }

    return (
        <div className="ag-actionsheet">
            <ActionButton
                className="ag-btn ag-btn--primary ag-btn--block ag-btn--roll"
                onClick={() => { if (!hasRolled) onRoll?.(); }}
                disabled={hasRolled}
                pending={pending}
                pendingLabel="Rolling the die…"
            >
                🎲 {bonusRoll ? 'Roll again' : 'Roll the die'}
            </ActionButton>
            <p className="ag-action-hint">
                {reRollOnSix
                    ? 'The die decides — and a 6 earns you another roll.'
                    : 'The die decides — no strategy here, just fate.'}
            </p>
        </div>
    );
}
