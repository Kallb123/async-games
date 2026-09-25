import { useState } from 'react';
import type { ICommandOutcome } from '@/utils/apiModels/gameCommand';
import type { SubmitCommand } from '@/utils/hooks/useSubmitCommand';

/** Collects one command's payload until a later command produces the reveal. */
export function useStagedOutcomeReveal<TStage, TReveal>(
    submit: SubmitCommand,
    stageFrom: (outcome: ICommandOutcome) => TStage | undefined,
    revealFrom: (outcome: ICommandOutcome, stage: TStage | null) => TReveal | null,
) {
    const [stage, setStage] = useState<TStage | null>(null);
    const [reveal, setReveal] = useState<TReveal | null>(null);

    const submitCommand: SubmitCommand = (command, callback, target) => submit(command, (response) => {
        const nextStage = stageFrom(response.outcome);
        const nextReveal = revealFrom(response.outcome, nextStage ?? stage);
        if (nextStage !== undefined) setStage(nextStage);
        if (nextReveal) {
            setReveal(nextReveal);
            setStage(null);
        }
        callback?.(response);
    }, target);

    return { submitCommand, reveal, dismiss: () => setReveal(null) };
}
