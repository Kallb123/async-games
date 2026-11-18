'use client'
import { rulesetOf, type RulesContext } from "@/games/RealmArena/rulesets";
import React, { useState } from 'react';
import ActionButton from '@/components/ui/ActionButton';
import AmountSteppers from '@/components/ui/AmountSteppers';
import BuildRow from '@/components/ui/BuildRow';
import ListRow from '@/components/ui/ListRow';
import OptionChoiceSection from '@/components/ui/OptionChoiceSection';
import Section from '@/components/ui/Section';
import { ITEM_ART } from '@/games/RealmArena/art';
import { loadoutOf, loadoutPoolOf, type AbilityId, type ItemId, type OptionId } from '@/games/RealmArena/characters';
import type { Ranks } from '@/games/RealmArena/mastery';
import { musterHp, type MusterPick } from '@/games/RealmArena/rules';
import { CHARACTER_MARK, factionRosterLine, loadoutLine, optionsFor, optionView, starterView, unlockNote, type KitView } from '@/games/RealmArena/roster';
import type { UnitRef } from '@/games/RealmArena/stats';
import { numberedName, squadOf } from '@/games/RealmArena/ui';
import type { MusterDraft } from '@/games/RealmArena/useMusterDraft';
import { useHeightVar } from '@/utils/hooks/useHeightVar';
import { pluralize } from '@/utils/ui/text';
import { RealmArenaStatusList } from './RealmArenaEffects';
import RealmArenaUnitInfo from './RealmArenaStats';
import { SpriteImage } from './RealmArenaTerrain';
import { UnitBox } from './RealmArenaUnits';

interface RealmArenaMusterSheetProps {
    draft: MusterDraft;
    budget: number;
    /** The viewer's own colour, behind each of their squad's marks. */
    colour: string;
    /** Picks up the `index`th of the squad being placed, and brings the board's view to it. */
    onPick: (index: number) => void;
    /** Sends the sealed muster, as placed. */
    onMuster: () => void;
    /** The muster is in flight. */
    pending: boolean;
    /** The team is the tougher one Hold Out gives it (`stoutTeam`), so each character is shown with its bigger HP. */
    stout?: boolean;
}

/**
 * The muster, on the player's own turn (docs/games/realm-arena.md §17.3 PR 6):
 * first the faction, when the host allowed more than one (B6), then the squad and the items it carries (§21.3), a stepper for each
 * character and each item with the points left, and then placing it on the
 * board before the sealed muster goes. While placing, a box for each of the
 * squad (`UnitBox`, as the battle's own list draws them) picks it up and
 * brings the board's view to it, and the character picked up is offered the
 * options its rank has unlocked (§23.2) and the items bought, to take from
 * whoever carries one. Each character and item on the squad step has an
 * `InfoButton` opening its stats (`RealmArenaUnitInfo`), so a player can see
 * what the points buy before spending them. The points left float over the page
 * through both steps (`PointsBox`), so they stay in view while the steppers
 * change them.
 */
export default function RealmArenaMusterSheet(props: RealmArenaMusterSheetProps) {
    // Beside the step rather than inside it, so it stays mounted from one step to the next.
    return (
        <>
            <MusterStep {...props} />
            <PointsBox pointsLeft={props.draft.pointsLeft} budget={props.budget} />
        </>
    );
}

/** Whichever step of the muster the player is on: picking the squad, or placing it. */
function MusterStep({ draft, budget, colour, onPick, onMuster, pending, stout = false }: RealmArenaMusterSheetProps) {
    const { CHARACTERS, ITEMS, FACTIONS } = rulesetOf(draft.context);
    const itemIds = Object.keys(ITEMS) as ItemId[];
    const { factions, faction, setFaction, roster, counts, setCounts, items, setItems, pointsLeft, refusal, placement, ranks } = draft;
    const [info, setInfo] = useState<UnitRef>();
    // Over budget, the box already says why the muster can't go.
    const why = pointsLeft >= 0 && refusal && <p className="ag-hint">{refusal}</p>;

    if (!placement) {
        const squadSize = squadOf(counts).length;
        return (
            <>
                {info && <RealmArenaUnitInfo context={draft.context} unit={info} onClose={() => setInfo(undefined)} />}
                {/* Nothing to choose with one faction allowed: the squad is bought from it. */}
                {factions.length > 1 && (
                    <OptionChoiceSection
                        label="Your faction"
                        value={faction}
                        onChange={setFaction}
                        choices={factions.map(id => ({ id, label: FACTIONS[id].name, description: factionRosterLine(id, draft.context) }))}
                    />
                )}
                <Section label="Muster your squad">
                    {/* No cap on any one character: the budget is the limit, so each
                        goes as high as the whole budget would buy, and over it the
                        points box turns red. */}
                    <AmountSteppers
                        kinds={roster}
                        icon={id => CHARACTER_MARK[id]}
                        title={id => CHARACTERS[id].name}
                        sub={id => `${CHARACTERS[id].points} points · ${CHARACTERS[id].role}${ranks[id] ? ` · Rank ${ranks[id]}` : ''}`}
                        amounts={counts}
                        max={id => Math.max(Math.floor(budget / CHARACTERS[id].points), counts[id])}
                        onChange={setCounts}
                        onInfo={id => setInfo({ kind: 'character', id })}
                    />
                </Section>
                <Section label="Consumables, given to units on the next step">
                    <AmountSteppers
                        kinds={itemIds}
                        icon={id => <SpriteImage sprite={ITEM_ART[id]} boxed />}
                        title={id => ITEMS[id].name}
                        sub={id => `${ITEMS[id].points} points · ${ITEMS[id].ap} AP · ${ITEMS[id].description}`}
                        amounts={items}
                        max={id => Math.max(squadSize, items[id])}
                        onChange={setItems}
                        onInfo={id => setInfo({ kind: 'item', id })}
                    />
                </Section>
                <MusterActions why={why}>
                    <button type="button" className="ag-btn ag-btn--primary" disabled={refusal !== undefined} onClick={draft.place}>
                        Place your squad
                    </button>
                </MusterActions>
            </>
        );
    }

    const { picks, selected } = placement;
    const picked = selected !== null ? picks[selected] : undefined;
    return (
        <>
            <Section label="Place your squad">
                <div className="ag-ra-units">
                    {picks.map((pick, index) => (
                        <UnitBox
                            key={index}
                            mark={CHARACTER_MARK[pick.character]}
                            colour={colour}
                            name={numberedName(picks, index, draft.context)}
                            sub={squadLine(pick, stout, draft.context)}
                            selected={index === selected}
                            onClick={() => onPick(index)}
                        >
                            <RealmArenaStatusList item={pick.item} />
                        </UnitBox>
                    ))}
                </div>
                <p className="ag-hint">
                    Tap one of your squad, here or on the board, to pick it up. Then tap a square of your zone to move it
                    there, another of your squad on the board to swap the two, or what it takes into battle below. Nobody
                    sees your squad until every player has mustered.
                </p>
                {picked && (
                    <>
                        <LoadoutPicker context={draft.context} pick={picked} ranks={ranks} onPick={draft.pickAbility} />
                        <OptionPicker context={draft.context} pick={picked} ranks={ranks} onChoose={draft.choose} />
                        <ItemPicker context={draft.context} pick={picked} picks={picks} onCarry={draft.carry} />
                    </>
                )}
            </Section>
            <MusterActions why={why}>
                <button type="button" className="ag-btn ag-btn--light" disabled={pending} onClick={draft.unplace}>
                    Change squad
                </button>
                <ActionButton className="ag-btn ag-btn--success" pending={pending} pendingLabel="Mustering…" disabled={refusal !== undefined} onClick={onMuster}>
                    Muster
                </ActionButton>
            </MusterActions>
        </>
    );
}

/**
 * The buttons at the foot of either step, with why they're greyed when they
 * are: a section of their own, so they stand clear of the list above them.
 */
function MusterActions({ why, children }: { why: React.ReactNode; children: React.ReactNode }) {
    return (
        <div className="ag-section ag-stack">
            {why}
            <div className="ag-action-grid">{children}</div>
        </div>
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
            <div className={`ag-dock-pill${pointsLeft < 0 ? ' ag-dock-pill--warn' : ''}`} role="status">
                {pointsLeft >= 0
                    ? <><b>{pointsLeft}</b> of {budget} points left</>
                    : <><b>{pluralize(-pointsLeft, 'point')}</b> over the budget of {budget}</>}
            </div>
        </div>
    );
}

/** What the squad list says under a character being placed: its option, or its picked abilities (§40.4), or its HP. */
function squadLine(pick: MusterPick, stout: boolean, context?: RulesContext): string {
    const option = pick.option ? optionView(pick.option, context).name : undefined;
    const abilities = loadoutLine(pick, context);
    return option || abilities ? [option, abilities].filter(Boolean).join(' · ') : `${musterHp(pick.character, stout, context)} HP`;
}

interface UnlockRowProps {
    /** The option or ability the row offers. */
    view: KitView;
    /** The rank with the character that unlocks it: 0 for what it starts with. */
    need: number;
    /** The player's rank with it. */
    rank: number;
    /** It's what the character takes into battle now. */
    taken: boolean;
    /** Takes it. Not called for what's already taken. */
    onTake: () => void;
}

/** One thing a rank unlocks, for the character picked up to take: greyed, with the rank that does, until the player has it. The starting one reads "Standard". */
function UnlockRow({ view, need, rank, taken, onTake }: UnlockRowProps) {
    const locked = need > rank;
    return (
        <BuildRow
            icon={view.icon}
            name={view.name}
            cost={need === 0 ? `Standard · ${view.line}` : view.line}
            tag={taken ? 'Taken' : locked ? `Rank ${need}` : 'Take'}
            tagMuted={locked}
            disabled={locked}
            active={taken}
            onClick={() => { if (!taken) onTake(); }}
        />
    );
}

interface LoadoutPickerProps {
    context?: RulesContext;
    /** The character picked up. */
    pick: MusterPick;
    ranks: Ranks;
    onPick: (ability: AbilityId) => void;
}

/**
 * The abilities the character picked up takes into battle (§40.4), where it
 * has a pool: the ones it always carries, then each ability it can pick, the
 * ones taken marked. Taking another drops the one taken first, so it always
 * has its full number. An ability its rank hasn't unlocked is greyed, with the
 * rank that does.
 */
function LoadoutPicker({ pick, ranks, onPick, context }: LoadoutPickerProps) {
    const { character } = pick;
    const pool = loadoutPoolOf(character, context);
    const taken = loadoutOf(pick, context);
    if (!pool || !taken) return null;
    const { name } = rulesetOf(context).CHARACTERS[character];
    const rank = ranks[character] ?? 0;
    return (
        <>
            <p className="ag-hint ag-hint--tight">
                {`Your ${name} takes ${pool.picks} of these abilities into battle. Taking another drops the one you took first.`}
            </p>
            {pool.fixed.length > 0 && (
                <div className="ag-list">
                    {pool.fixed.map(id => {
                        const view = starterView(character, id, context);
                        return <ListRow key={id} icon={view.icon} title={view.name} sub={view.line} action={<span className="ag-tag ag-tag--quiet">Always</span>} />;
                    })}
                </div>
            )}
            <div className="ag-build-list">
                {pool.entries.map(({ ability, rank: need }) => {
                    const view = starterView(character, ability, context);
                    return (
                        <UnlockRow
                            key={ability}
                            view={need > 0 ? { ...view, line: `${unlockNote(need)} · ${view.line}` } : view}
                            need={need}
                            rank={rank}
                            taken={taken.includes(ability)}
                            onTake={() => onPick(ability)}
                        />
                    );
                })}
            </div>
        </>
    );
}

interface OptionPickerProps {
    context?: RulesContext;
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
function OptionPicker({ pick, ranks, onChoose, context }: OptionPickerProps) {
    const { character } = pick;
    const { OPTIONS, CHARACTERS } = rulesetOf(context);
    const options = optionsFor(character, context);
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
                    const starter = starterView(character, part, context);
                    const kept = !pick.option || OPTIONS[pick.option].replaces !== part;
                    return (
                        <React.Fragment key={part}>
                            <UnlockRow view={starter} need={0} rank={rank} taken={kept} onTake={() => onChoose(null)} />
                            {options.filter(id => OPTIONS[id].replaces === part).map(id => {
                                return (
                                    <UnlockRow
                                        key={id}
                                        view={optionView(id, context)}
                                        need={OPTIONS[id].rank}
                                        rank={rank}
                                        taken={pick.option === id}
                                        onTake={() => onChoose(id)}
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
    context?: RulesContext;
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
function ItemPicker({ pick, picks, onCarry, context }: ItemPickerProps) {
    const { CHARACTERS, ITEMS } = rulesetOf(context);
    const { name } = CHARACTERS[pick.character];
    const carried = (Object.keys(ITEMS) as ItemId[]).filter(id => picks.some(one => one.item === id));
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
