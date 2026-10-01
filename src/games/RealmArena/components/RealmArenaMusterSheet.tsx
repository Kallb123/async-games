'use client'
import ActionButton from '@/components/ui/ActionButton';
import AmountSteppers from '@/components/ui/AmountSteppers';
import Section from '@/components/ui/Section';
import { CHARACTERS, MAX_OF_EACH } from '@/games/RealmArena/characters';
import { CHARACTER_IDS, CHARACTER_MARK } from '@/games/RealmArena/ui';
import type { MusterDraft } from '@/games/RealmArena/useMusterDraft';
import { pluralize } from '@/utils/ui/text';

interface RealmArenaMusterSheetProps {
    draft: MusterDraft;
    budget: number;
    /** Sends the sealed muster, as placed. */
    onMuster: () => void;
    /** The muster is in flight. */
    pending: boolean;
}

/**
 * The muster, on the player's own turn (docs/games/realm-arena.md §17.3 PR 6):
 * first the squad, a stepper per character with the points left, and then
 * placing it on the board before the sealed muster goes.
 */
export default function RealmArenaMusterSheet({ draft, budget, onMuster, pending }: RealmArenaMusterSheetProps) {
    const { counts, setCounts, pointsLeft, refusal, placement } = draft;

    if (!placement) {
        return (
            <Section label="Muster your squad">
                <AmountSteppers
                    kinds={CHARACTER_IDS}
                    icon={id => CHARACTER_MARK[id]}
                    title={id => CHARACTERS[id].name}
                    sub={id => `${CHARACTERS[id].points} points · ${CHARACTERS[id].role}`}
                    amounts={counts}
                    max={() => MAX_OF_EACH}
                    onChange={setCounts}
                />
                <p className="ag-hint">
                    {pointsLeft >= 0
                        ? `${pointsLeft} of ${budget} points left. Up to ${MAX_OF_EACH} of each.`
                        : `${pluralize(-pointsLeft, 'point')} over the budget of ${budget}.`}
                </p>
                <div className="ag-action-grid">
                    <button type="button" className="ag-btn ag-btn--primary" disabled={refusal !== undefined} onClick={draft.place}>
                        Place your squad
                    </button>
                </div>
            </Section>
        );
    }

    return (
        <Section label="Place your squad">
            <p className="ag-hint">
                Tap one of your squad on the board, then a square of your zone to move it there, or another of
                your squad to swap the two. Nobody sees your squad until both of you have mustered.
            </p>
            {refusal && <p className="ag-hint">{refusal}</p>}
            <div className="ag-action-grid">
                <button type="button" className="ag-btn ag-btn--light" disabled={pending} onClick={draft.unplace}>
                    Change squad
                </button>
                <ActionButton className="ag-btn ag-btn--success" pending={pending} pendingLabel="Mustering…" disabled={refusal !== undefined} onClick={onMuster}>
                    Muster
                </ActionButton>
            </div>
        </Section>
    );
}
