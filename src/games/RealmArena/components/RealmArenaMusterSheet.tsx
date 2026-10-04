'use client'
import React, { useState } from 'react';
import ActionButton from '@/components/ui/ActionButton';
import AmountSteppers from '@/components/ui/AmountSteppers';
import BuildRow from '@/components/ui/BuildRow';
import Section from '@/components/ui/Section';
import { ITEM_ART } from '@/games/RealmArena/art';
import { CHARACTERS, ITEM_IDS, ITEMS, MAX_OF_EACH, OPTIONS, type ItemId, type OptionId } from '@/games/RealmArena/characters';
import type { Ranks } from '@/games/RealmArena/mastery';
import type { MusterPick } from '@/games/RealmArena/rules';
import { CHARACTER_IDS, CHARACTER_MARK, optionsFor, optionView, starterView } from '@/games/RealmArena/roster';
import type { UnitRef } from '@/games/RealmArena/stats';
import { squadOf } from '@/games/RealmArena/ui';
import type { MusterDraft } from '@/games/RealmArena/useMusterDraft';
import { useHeightVar } from '@/utils/hooks/useHeightVar';
import { pluralize } from '@/utils/ui/text';
import RealmArenaUnitInfo from './RealmArenaStats';
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
 * first the squad and the items it carries (§21.3), a stepper for each
 * character and each item with the points left, and then placing it on the
 * board before the sealed muster goes. While placing, the character picked up
 * is offered the options its rank has unlocked (§23.2) and the items bought,
 * to take from whoever carries one. Each character and item on the squad step
 * has an `InfoButton` opening its stats (`RealmArenaUnitInfo`), so a player can see what
 * the points buy before spending them. The points left float over the page
 * through both steps (`PointsBox`), so they stay in view while the steppers
 * change them.
 */
export default function RealmArenaMusterSheet({ draft, budget, onMuster, pending }: RealmArenaMusterSheetProps) {
    const { counts, setCounts, items, setItems, pointsLeft, refusal, placement, ranks } = draft;
    const [info, setInfo] = useState<UnitRef>();
    const points = <PointsBox pointsLeft={pointsLeft} budget={budget} />;
    // Over budget, the box already says why the muster can't go.
    const why = pointsLeft >= 0 && refusal && <p className="ag-hint">{refusal}</p>;

    if (!placement) {
        const squadSize = squadOf(counts).length;
        return (
            <Section label="Muster your squad">
                {info && <RealmArenaUnitInfo unit={info} onClose={() => setInfo(undefined)} />}
                <AmountSteppers
                    kinds={CHARACTER_IDS}
                    icon={id => CHARACTER_MARK[id]}
                    title={id => CHARACTERS[id].name}
                    sub={id => `${CHARACTERS[id].points} points · ${CHARACTERS[id].role}${ranks[id] ? ` · Rank ${ranks[id]}` : ''}`}
                    amounts={counts}
                    max={() => MAX_OF_EACH}
                    onChange={setCounts}
                    onInfo={id => setInfo({ kind: 'character', id })}
                />
                <p className="ag-hint ag-hint--tight">
                    Up to {MAX_OF_EACH} of each character, and items for them to carry into battle: one each, used once.
                    You choose who carries what as you place your squad.
                </p>
                <AmountSteppers
                    kinds={ITEM_IDS}
                    icon={id => <SpriteImage sprite={ITEM_ART[id]} boxed />}
                    title={id => ITEMS[id].name}
                    sub={id => `${ITEMS[id].points} points · ${ITEMS[id].ap} AP · ${ITEMS[id].description}`}
                    amounts={items}
                    max={id => Math.max(squadSize, items[id])}
                    onChange={setItems}
                    onInfo={id => setInfo({ kind: 'item', id })}
                />
                {why}
                {points}
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
                another of your squad to swap the two, or what it takes into battle below. Nobody sees your squad
                until every player has mustered.
            </p>
            {picked && (
                <>
                    <OptionPicker pick={picked} ranks={ranks} onChoose={draft.choose} />
                    <ItemPicker pick={picked} picks={placement.picks} onCarry={draft.carry} />
                </>
            )}
            {why}
            {points}
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

interface PointsBoxProps {
    pointsLeft: number;
    budget: number;
}

/**
 * The points left of the budget, floating at the foot of the screen so a
 * player tapping a stepper far down the list still sees what it cost. Red once
 * the squad is over budget. It is an `ag-dock`, measured into
 * `--ag-actions-dock-height` so the page scrolls clear of it.
 */
function PointsBox({ pointsLeft, budget }: PointsBoxProps) {
    const measure = useHeightVar('--ag-actions-dock-height');
    return (
        <div className="ag-dock ag-dock--float" ref={measure}>
            <div className={`ag-float-box${pointsLeft < 0 ? ' ag-float-box--warn' : ''}`} role="status">
                {pointsLeft >= 0
                    ? <><b>{pointsLeft}</b> of {budget} points left</>
                    : <><b>{pluralize(-pointsLeft, 'point')}</b> over the budget of {budget}</>}
            </div>
        </div>
    );
}

interface OptionPickerProps {
    /** The character picked up. */
    pick: MusterPick;
    ranks: Ranks;
    onChoose: (option: OptionId | null) => void;
}

/**
 * The character picked up's options (§23.2), each under the part of its own
 * kit it would swap out, so the player sees what they'd give up: a `BuildRow`
 * for the starter part, marked as taken while no option replaces it, then one
 * for each option in its place. Tapping a row takes it, and tapping the
 * starter part musters the starter character again. An option its rank hasn't
 * unlocked is greyed, with the rank that does. An option costs what it
 * replaces, so the points never decide it.
 */
function OptionPicker({ pick, ranks, onChoose }: OptionPickerProps) {
    const { character } = pick;
    const options = optionsFor(character);
    if (options.length === 0) return null;
    const rank = ranks[character] ?? 0;
    const { name } = CHARACTERS[character];
    // The parts of its kit some option swaps out, in the options' order.
    const parts = [...new Set(options.map(id => OPTIONS[id].replaces))];
    return (
        <>
            <p className="ag-hint ag-hint--tight">
                {rank > 0
                    ? `You're rank ${rank} with the ${name}: keep its own kit, or swap part of it for an option.`
                    : `Fight with the ${name} to rank up with it and unlock the options below.`}
            </p>
            <div className="ag-build-list">
                {parts.map(part => {
                    const starter = starterView(character, part);
                    const kept = !pick.option || OPTIONS[pick.option].replaces !== part;
                    return (
                        <React.Fragment key={part}>
                            <BuildRow
                                icon={starter.icon}
                                name={starter.name}
                                cost={`Standard · ${starter.line}`}
                                tag={kept ? 'Taken' : 'Take'}
                                active={kept}
                                onClick={() => { if (!kept) onChoose(null); }}
                            />
                            {options.filter(id => OPTIONS[id].replaces === part).map(id => {
                                const { icon, name: optionName, line } = optionView(id);
                                const chosen = pick.option === id;
                                const locked = OPTIONS[id].rank > rank;
                                return (
                                    <BuildRow
                                        key={id}
                                        icon={icon}
                                        name={optionName}
                                        cost={line}
                                        tag={chosen ? 'Taken' : locked ? `Rank ${OPTIONS[id].rank}` : 'Take'}
                                        tagMuted={locked}
                                        disabled={locked}
                                        active={chosen}
                                        onClick={() => onChoose(id)}
                                    />
                                );
                            })}
                        </React.Fragment>
                    );
                })}
            </div>
        </>
    );
}

interface ItemPickerProps {
    /** The character picked up. */
    pick: MusterPick;
    /** The whole squad as placed, every item bought carried by one of them. */
    picks: readonly MusterPick[];
    onCarry: (item: ItemId) => void;
}

/**
 * The items the squad bought, for the character picked up to carry (§21.1):
 * a `BuildRow` for each kind carried. Tapping one it doesn't carry takes it
 * from whoever does, and hands them this character's own item, if it has
 * one, in exchange. Nothing is bought or left behind here: the points were
 * spent choosing the squad, and changing the squad is where to change them.
 */
function ItemPicker({ pick, picks, onCarry }: ItemPickerProps) {
    const { name } = CHARACTERS[pick.character];
    const carried = ITEM_IDS.filter(id => picks.some(one => one.item === id));
    if (carried.length === 0) {
        return <p className="ag-hint ag-hint--tight">Your squad has no items to carry. Change squad to buy some.</p>;
    }
    return (
        <>
            <p className="ag-hint ag-hint--tight">
                Your {name} can carry one of your items into battle, to use once. Taking one from another of your squad hands them {pick.item ? `its ${ITEMS[pick.item].name.toLowerCase()}` : 'nothing'} in exchange.
            </p>
            <div className="ag-build-list">
                {carried.map(id => {
                    const item = ITEMS[id];
                    const mine = pick.item === id;
                    return (
                        <BuildRow
                            key={id}
                            icon={<SpriteImage sprite={ITEM_ART[id]} />}
                            name={item.name}
                            cost={`${item.ap} AP · ${item.description}`}
                            tag={mine ? 'Carrying' : pick.item ? 'Swap' : 'Take'}
                            active={mine}
                            onClick={() => onCarry(id)}
                        />
                    );
                })}
            </div>
        </>
    );
}
