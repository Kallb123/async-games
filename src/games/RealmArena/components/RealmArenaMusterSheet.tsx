'use client'
import ActionButton from '@/components/ui/ActionButton';
import AmountSteppers from '@/components/ui/AmountSteppers';
import BuildRow from '@/components/ui/BuildRow';
import Section from '@/components/ui/Section';
import { ITEM_ART } from '@/games/RealmArena/art';
import { CHARACTERS, ITEM_IDS, ITEMS, MAX_OF_EACH, type ItemId } from '@/games/RealmArena/characters';
import { itemPoints, type MusterPick } from '@/games/RealmArena/rules';
import { CHARACTER_IDS, CHARACTER_MARK } from '@/games/RealmArena/ui';
import type { MusterDraft } from '@/games/RealmArena/useMusterDraft';
import { pluralize } from '@/utils/ui/text';
import { SpriteImage } from './RealmArenaTerrain';

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
 * placing it on the board before the sealed muster goes. While placing, the
 * character picked up is offered the items to carry (§21.3), out of the same
 * points.
 */
export default function RealmArenaMusterSheet({ draft, budget, onMuster, pending }: RealmArenaMusterSheetProps) {
    const { counts, setCounts, pointsLeft, refusal, placement } = draft;
    const points = pointsLeft >= 0
        ? `${pointsLeft} of ${budget} points left.`
        : `${pluralize(-pointsLeft, 'point')} over the budget of ${budget}.`;

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
                <p className="ag-hint">{points}{pointsLeft >= 0 ? ` Up to ${MAX_OF_EACH} of each.` : ''}</p>
                <div className="ag-action-grid">
                    <button type="button" className="ag-btn ag-btn--primary" disabled={refusal !== undefined} onClick={draft.place}>
                        Place your squad
                    </button>
                </div>
            </Section>
        );
    }

    const picked = placement.selected !== null ? placement.picks[placement.selected] : undefined;
    return (
        <Section label="Place your squad">
            <p className="ag-hint">
                Tap one of your squad on the board to pick it up, then a square of your zone to move it there,
                another of your squad to swap the two, or an item below for it to carry. Nobody sees your squad
                until every player has mustered.
            </p>
            {picked && <ItemPicker pick={picked} pointsLeft={pointsLeft} onCarry={draft.carry} />}
            <p className="ag-hint">{refusal ?? points}</p>
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

interface ItemPickerProps {
    /** The character picked up. */
    pick: MusterPick;
    pointsLeft: number;
    onCarry: (item: ItemId | null) => void;
}

/**
 * The items the character picked up can carry, one at most (§21.1): a
 * `BuildRow` each with its cost. Tapping one gives it to the character in place
 * of whatever it carried, and tapping the one it carries leaves it behind. One
 * the points left can't pay for, even trading in what it carries, is greyed.
 */
function ItemPicker({ pick, pointsLeft, onCarry }: ItemPickerProps) {
    const spare = pointsLeft + itemPoints(pick.item);
    return (
        <>
            <p className="ag-hint ag-hint--tight">Your {CHARACTERS[pick.character].name} can carry one item into battle, to use once.</p>
            <div className="ag-build-list">
                {ITEM_IDS.map(id => {
                    const item = ITEMS[id];
                    const carried = pick.item === id;
                    const short = !carried && item.points > spare;
                    return (
                        <BuildRow
                            key={id}
                            icon={<SpriteImage sprite={ITEM_ART[id]} />}
                            name={item.name}
                            cost={`${item.points} points · ${item.ap} AP · ${item.description}`}
                            tag={carried ? 'Carrying' : short ? 'Over budget' : 'Carry'}
                            tagMuted={short}
                            disabled={short}
                            active={carried}
                            onClick={() => onCarry(carried ? null : id)}
                        />
                    );
                })}
            </div>
        </>
    );
}
