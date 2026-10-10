'use client'
import React from 'react';
import ActionButton from '@/components/ui/ActionButton';
import BuildRow from '@/components/ui/BuildRow';
import ListRow from '@/components/ui/ListRow';
import PendingTag from '@/components/ui/PendingTag';
import Stat from '@/components/ui/Stat';
import { ABILITIES, CHARACTERS, EFFECTS, type Ability, type AbilityId, type Affliction, type Item } from '@/games/RealmArena/characters';
import { ITEM_ART } from '@/games/RealmArena/art';
import { ATTACK_AP, HUNKER_AP, REACTION_COST, abilitiesOf, allied, check, fighterById, hasEffect, healedEffects, isStanding, itemOf, LONG_RANGE_PENALTY, maxHpOf, shotEffect, shotOdds, smokeSquares, strikeChance, weaponOf, type Action, type BattleState, type Fighter } from '@/games/RealmArena/rules';
import { abilityWait, whoseName } from '@/games/RealmArena/ui';
import { rangeSquares, shotOf, targetsOf, type TargetKind } from '@/games/RealmArena/tactics';
import { ABILITY_MARK, CHARACTER_MARK, weaponLine, weaponMark } from '@/games/RealmArena/roster';
import { HEAL_HP, INSTANT_KINDS, type Aim, type InstantKind, type TurnDraft } from '@/games/RealmArena/useTurnDraft';
import { andList, capitalise, pluralize } from '@/utils/ui/text';
import { SpriteImage } from './RealmArenaTerrain';

/** The `target` an action lined up on the board wears while it's in flight: the sheet's send button. */
const LINED_UP = 'act';

const isInstant = (kind: string): kind is InstantKind => (INSTANT_KINDS as readonly string[]).includes(kind);

/** The `target` an action wears while it's in flight: its own row for one that goes the moment it's tapped, else the send button. */
export function actTarget(action: Action): string {
    return isInstant(action.kind) ? `act:${action.kind}` : LINED_UP;
}

/** What to tap, for an aim with nothing lined up yet. */
const AIM_HINT: Readonly<Record<Aim, string>> = {
    move: 'Tap a shaded square to move there: the darker the shade, the more AP it takes.',
    sneak: 'Tap a shaded square to sneak there. Nobody on watch reacts to a sneak.',
    attack: 'Tap an enemy to see the odds.',
    aimedShot: 'Tap an enemy to see the odds.',
    cleave: 'Tap two enemies next to them.',
    fireball: 'Tap the square to centre the fireball on. It hits the 3×3 around it, friend or foe.',
    heal: `Tap a hurt ally they can see within ${ABILITIES.heal.range} squares.`,
    raise: 'Tap a downed ally next to them.',
    throw: 'Tap a shaded square to throw it there: where it lands is shaded red, and catches friend and foe alike.',
    draught: 'Tap them, or a hurt ally next to them, to give the draught.',
    shieldBash: 'Tap an enemy next to them to see the odds. A hit stuns them.',
    cripplingShot: 'Tap an enemy to see the odds. A hit slows them.',
    huntersMark: 'Tap an enemy they can see within 12 squares.',
    demolish: 'Tap the low cover next to them to blast it away. Everyone else beside it is struck, friend or foe.',
    rend: 'Tap an enemy next to them to see the odds.',
    regrowth: `Tap a hurt ally they can see within ${ABILITIES.regrowth.range} squares.`,
};

/** What the send button says, by the action lined up. */
const SEND_LABEL: Readonly<Record<Aim, string>> = {
    move: 'Move here',
    sneak: 'Sneak here',
    attack: 'Attack',
    aimedShot: 'Take the aimed shot',
    cleave: 'Cleave',
    fireball: 'Throw the fireball',
    heal: 'Heal',
    raise: 'Raise',
    throw: 'Throw',
    draught: 'Give the draught',
    shieldBash: 'Shield bash',
    cripplingShot: 'Take the crippling shot',
    huntersMark: 'Mark them',
    demolish: 'Demolish',
    rend: 'Rend',
    regrowth: 'Regrowth',
};

/**
 * Each ability's row: its icon and tag, and who — or, for a Demolish, what —
 * it needs in reach before it can be aimed.
 */
const ABILITY_ROW: Readonly<Record<AbilityId, { icon: string; tag: string; needs?: TargetKind | 'cover'; least?: number }>> = {
    sneak: { icon: '🤫', tag: 'Sneak' },
    shieldWall: { icon: '🛡️', tag: 'Raise it' },
    fireball: { icon: '🔥', tag: 'Aim' },
    cleave: { icon: ABILITY_MARK, tag: 'Aim', needs: 'attack', least: 2 },
    aimedShot: { icon: ABILITY_MARK, tag: 'Aim', needs: 'aimedShot' },
    heal: { icon: '✚', tag: 'Aim', needs: 'heal' },
    raise: { icon: '✚', tag: 'Aim', needs: 'raise' },
    shieldBash: { icon: '🛡️', tag: 'Aim', needs: 'shieldBash' },
    demolish: { icon: '💥', tag: 'Aim', needs: 'cover' },
    cripplingShot: { icon: ABILITY_MARK, tag: 'Aim', needs: 'cripplingShot' },
    huntersMark: { icon: '◎', tag: 'Aim', needs: 'huntersMark' },
    purify: { icon: '✚', tag: 'Purify' },
    rend: { icon: ABILITY_MARK, tag: 'Aim', needs: 'rend' },
    regrowth: { icon: '✚', tag: 'Aim', needs: 'regrowth' },
    burst: { icon: '💥', tag: 'Burst' },
};

interface RealmArenaTurnSheetProps {
    draft: TurnDraft;
    battle: BattleState;
    player: string;
    /** The `target` of the command in flight, so only what was tapped spins. */
    pendingTarget: string | null;
}

interface RealmArenaAimProps extends RealmArenaTurnSheetProps {
    nameFor: (userId: string) => string;
    /** Brings the board's view to a character picked from the list of targets. */
    onFocus: (fighter: Fighter) => void;
}

/**
 * What's lined up for the selected character, on its owner's turn, at the top
 * of the controls under the board (docs/games/realm-arena.md §17.3 PR 7): its
 * Cancel and send buttons first, then its cost and what it would set off or
 * the odds — or, until something is, what to tap — and everyone the armed
 * action could be aimed at. Picking one there lines it up and brings the board
 * to them. It sits above the squad and the actions so that aiming never needs
 * a scroll past them.
 */
export function RealmArenaAim({ draft, battle, player, nameFor, pendingTarget, onFocus }: RealmArenaAimProps) {
    const busy = pendingTarget !== null;
    const name = (id: number) => whoseName(battle.fighters, id, player, nameFor);
    return (
        <>
            <LinedUp draft={draft} battle={battle} name={name} pending={pendingTarget === LINED_UP} disabled={busy} />
            <TargetList draft={draft} name={name} disabled={busy} onFocus={onFocus} />
        </>
    );
}

/**
 * What the selected character can do, on its owner's turn (§17.3 PR 7): a
 * `BuildRow` for each action it has. A row that needs aiming arms the board,
 * and `RealmArenaAim` shows what that lines up; hunkering down, going on watch
 * and a shield wall go the moment they're tapped.
 */
export default function RealmArenaTurnSheet({ draft, battle, player, pendingTarget }: RealmArenaTurnSheetProps) {
    const { fighter, aim } = draft;
    const character = CHARACTERS[fighter.character];
    const weapon = weaponOf(fighter);
    const busy = pendingTarget !== null;
    const needs = (ap: number) => fighter.ap < ap ? `Needs ${ap} AP` : undefined;
    const reachable = (kind: TargetKind, least = 1) =>
        targetsOf(battle, player, fighter, kind).length >= least ? undefined : 'Nobody in reach';
    /** Why an ability that's ready and affordable still can't be used: nothing in reach for it, or — for one that goes at once — whatever `check` says. */
    const blocked = (id: AbilityId): string | undefined => {
        const { needs: inReach, least } = ABILITY_ROW[id];
        if (inReach === 'cover') return rangeSquares(battle, fighter, 'cover').size > 0 ? undefined : 'No low cover beside them';
        if (inReach) return reachable(inReach, least);
        if (!isInstant(id)) return undefined;
        const verdict = check(battle, player, { kind: id, fighter: fighter.id });
        return 'refused' in verdict ? verdict.refused : undefined;
    };
    const item = itemOf(fighter);
    const thrown = item?.range !== undefined;

    /** A row: one that arms the board for `id`, or one that sends `id` at once. */
    const row = (id: Aim | InstantKind, icon: React.ReactNode, title: string, cost: string, wait: string | undefined, tag: string) => {
        const instant = isInstant(id);
        const pending = instant && pendingTarget === `act:${id}`;
        return (
            <BuildRow
                key={id}
                icon={icon}
                name={title}
                cost={cost}
                tag={pending ? <PendingTag label="Sending…" /> : wait ?? (aim === id ? 'Aiming' : tag)}
                tagMuted={wait !== undefined}
                disabled={busy || wait !== undefined}
                active={aim === id}
                pending={pending}
                onClick={() => instant ? draft.now(id) : aim === id ? draft.clear() : draft.arm(id)}
            />
        );
    };

    return (
        <div className="ag-build-list">
            {row('move', '👣', 'Move', `1 AP per ${character.movement} squares`, needs(1), 'Move')}
            {row('attack', weaponMark(fighter.character, fighter.option), weapon.name, `${ATTACK_AP} AP · ${weaponLine(weapon)}`,
                needs(ATTACK_AP) ?? reachable('attack'), 'Attack')}
            {abilitiesOf(fighter).map(id => {
                const ability = ABILITIES[id];
                const { icon, tag } = ABILITY_ROW[id];
                const per = id === 'sneak' ? ` per ${character.movement} squares` : '';
                const wait = abilityWait(fighter, id) ?? needs(ability.ap) ?? blocked(id);
                return row(id, icon, ability.name, `${ability.ap} AP${per} · ${ability.description}`, wait, tag);
            })}
            {/* Its one item (§21.1): thrown at a square, or a draught handed to whoever needs it. */}
            {fighter.item && item && row(thrown ? 'throw' : 'draught', <SpriteImage sprite={ITEM_ART[fighter.item]} />, item.name,
                `${item.ap} AP · ${item.description}`, needs(item.ap) ?? (thrown ? undefined : reachable('draught')), thrown ? 'Throw' : 'Aim')}
            {row('hunker', '⛨', 'Hunker down', `${HUNKER_AP} AP · doubles its cover against shots until your next turn, and ends its turn`, needs(HUNKER_AP), 'Hunker')}
            {row('watch', '👁', weapon.kind === 'ranged' ? 'Go on overwatch' : 'Go on guard',
                `All ${fighter.ap} AP left · ${pluralize(Math.floor(fighter.ap / REACTION_COST), 'reaction')} before your next turn`,
                needs(REACTION_COST), 'Watch')}
        </div>
    );
}

interface TargetListProps {
    draft: TurnDraft;
    name: (id: number) => string;
    disabled: boolean;
    onFocus: (fighter: Fighter) => void;
}

/**
 * Everyone the armed action could be aimed at, each with their HP and — at an
 * enemy — the chance to hit them. Picking one lines it up and brings the
 * board to them; picking a cleave's target again lets it go, and stays put.
 */
function TargetList({ draft, name, disabled, onFocus }: TargetListProps) {
    if (draft.options.length === 0) return null;
    return (
        <div className="ag-build-list">
            {draft.options.map(({ target, chance }) => {
                const aimed = draft.targets.includes(target.id);
                const pick = () => {
                    draft.pick(target.id);
                    if (!(aimed && draft.aim === 'cleave')) onFocus(target);
                };
                return (
                    <BuildRow
                        key={target.id}
                        icon={CHARACTER_MARK[target.character]}
                        name={capitalise(name(target.id))}
                        cost={`${target.hp}/${maxHpOf(target)} HP`}
                        tag={chance !== undefined ? `${chance}% to hit` : aimed ? 'Aiming' : 'Pick'}
                        disabled={disabled}
                        active={aimed}
                        onClick={pick}
                    />
                );
            })}
        </div>
    );
}

interface LinedUpProps {
    draft: TurnDraft;
    battle: BattleState;
    name: (id: number) => string;
    /** The lined-up action is in flight. */
    pending: boolean;
    /** Something else is in flight. */
    disabled: boolean;
}

/**
 * What's lined up on the board, before it's sent: Cancel and the send button,
 * then a move's AP and every watcher it would set off, an attack's chance to hit, graze and damage, or
 * who a fireball would catch and the cover it would blast (§17.3 PR 7, §22). Until something is, what to tap.
 */
function LinedUp({ draft, battle, name, pending, disabled }: LinedUpProps) {
    const { aim, action, verdict } = draft;
    if (!action) {
        const chosen = aim === 'cleave' && draft.targets.length === 1 ? ` ${capitalise(name(draft.targets[0]))} is picked.` : '';
        return <p className="ag-hint">{AIM_HINT[aim]}{chosen}</p>;
    }
    const refusal = verdict && 'refused' in verdict ? verdict.refused : undefined;
    const ap = verdict && 'ap' in verdict ? verdict.ap : undefined;
    const target = draft.targets.length === 1 ? fighterById(battle, draft.targets[0]) : undefined;

    return (
        <>
            <div className="ag-action-grid">
                <button type="button" className="ag-btn ag-btn--light" disabled={disabled} onClick={draft.clear}>
                    Cancel
                </button>
                <ActionButton
                    className="ag-btn ag-btn--primary"
                    pending={pending}
                    pendingLabel="Sending…"
                    disabled={disabled || refusal !== undefined}
                    onClick={draft.send}
                >
                    {SEND_LABEL[aim]}{ap !== undefined ? ` · ${ap} AP` : ''}
                </ActionButton>
            </div>
            {refusal
                ? <p className="ag-hint">{target ? `${capitalise(name(target.id))}: ` : ''}{refusal}.</p>
                : <Detail draft={draft} battle={battle} name={name} ap={ap ?? 0} target={target} />}
        </>
    );
}

interface DetailProps {
    draft: TurnDraft;
    battle: BattleState;
    name: (id: number) => string;
    /** What the action lined up costs. */
    ap: number;
    /** The one character it's aimed at, if it's aimed at one. */
    target: Fighter | undefined;
}

/** What an action `check` allows would do, by its kind. */
function Detail({ draft, battle, name, ap, target }: DetailProps) {
    const { fighter, aim } = draft;
    const hint = (text: React.ReactNode) => <p className="ag-hint">{text}</p>;
    const Name = (id: number) => capitalise(name(id));
    const strike = weaponOf(fighter).damage;

    if (draft.path) return <MoveDetail draft={draft} name={name} ap={ap} />;
    if (draft.area) {
        // What lands — a fireball, the item thrown, or a Demolish — and on whom.
        const thrown = aim === 'throw' ? itemOf(fighter) : undefined;
        if (thrown?.hitPenalty) return hint('Smoke over the 3×3 until your next turn. It hurts nobody.');
        const area = new Set(draft.area);
        const caught = battle.fighters.filter(one => isStanding(one) && area.has(one.square));
        const lands: Ability | Item = thrown ?? (aim === 'demolish' ? ABILITIES.demolish : ABILITIES.fireball);
        const { damage = 0, effect } = lands;
        return hint(<>
            {caught.length === 0 ? `Nobody is ${draft.area.length > 1 ? 'in the blast' : 'there'}.` : landsOn(caught.map(one => name(one.id)).join(', '), damage, effect)}
            {caught.some(one => allied(battle, one.owner, fighter.owner)) ? ' That includes your own.' : ''}
            {draft.blasts?.length ? ` Blasts away ${pluralize(draft.blasts.length, 'square')} of low cover.` : ''}
        </>);
    }
    if (aim === 'cleave') {
        const chances = draft.targets.map(id => { const hit = fighterById(battle, id); return hit ? `${strikeChance(battle, hit)}%` : ''; });
        return hint(`Strikes ${andList(draft.targets.map(name))} for ${strike} each, at ${andList(chances)} to hit.`);
    }
    if (!target) return null;
    const max = maxHpOf(target);
    if (aim === 'heal' || aim === 'regrowth' || aim === 'draught') {
        const hp = Math.min(HEAL_HP[aim] ?? 0, max - target.hp);
        const cleared = healedEffects(target).map(effect => EFFECTS[effect].state);
        const heals = hp > 0 ? `heals for ${hp} HP` : '';
        const clears = cleared.length > 0 ? `is no longer ${cleared.join(' or ')}` : '';
        return hint(`${Name(target.id)} ${[heals, clears].filter(Boolean).join(', and ')}.`);
    }
    if (aim === 'raise') return hint(`${Name(target.id)} stands again at ${Math.ceil(max / 2)} HP, and acts from your next turn.`);
    if (aim === 'huntersMark') {
        return hint(`${Name(target.id)} is marked: +${EFFECTS.marked.hitBonus}% to hit them, for every attacker, until their turn after next.`);
    }

    const health = `${Name(target.id)} · ${target.hp}/${max} HP`;
    if (aim === 'shieldBash') return hint(`${health} · ${strikeChance(battle, target)}% to hit, for ${ABILITIES.shieldBash.damage}, and a hit stuns them.`);
    if (aim === 'rend') return hint(`${health} · ${strikeChance(battle, target)}% to hit, for ${ABILITIES.rend.damage}.`);
    const shot = shotOf(aim);
    const odds = shot && shotOdds(battle, fighter, target, shot);
    if (!shot || !odds) return hint(`${health} · ${strikeChance(battle, target)}% to hit, for ${strike}.`);
    const effect = shotEffect(fighter, shot);
    return (
        <>
            <div className="ag-stat-row">
                <Stat value={`${odds.chance}%`} label="Hit" />
                <Stat value={`${odds.grazeChance}%`} label="Graze" />
                <Stat value={odds.grazeChance > 0 ? `${odds.damage} / ${odds.grazeDamage}` : odds.damage} label="Damage" />
            </div>
            {hint(`${health} · ${odds.flanked ? 'flanked, +1 damage' : `${odds.cover} cover`}${hasEffect(target, 'hunkered') ? ', hunkered down' : ''}${smokeSquares(battle).has(target.square) ? ', in smoke' : ''}${odds.longShot ? `, long range −${LONG_RANGE_PENALTY}%` : ''}${effect ? ` · a hit leaves them ${EFFECTS[effect].state}` : ''}`)}
        </>
    );
}

/** What something landing does to everyone it catches: "3 damage to your Knight, and leaves them burning". */
function landsOn(names: string, damage: number, effect: Affliction | undefined): string {
    const leaves = effect ? EFFECTS[effect].state : '';
    if (damage === 0) return `Leaves ${names} ${leaves}.`;
    return `${damage} damage to ${names}${leaves ? `, and leaves them ${leaves}` : ''}.`;
}

/** A move lined up: what it costs, and every watcher it would set off with what each would do. */
function MoveDetail({ draft, name, ap }: Pick<DetailProps, 'draft' | 'name' | 'ap'>) {
    const { fighter, aim, reactions } = draft;
    return (
        <>
            <div className="ag-stat-row">
                <Stat value={ap} label="AP" />
                <Stat value={fighter.ap - ap} label="AP after" />
                <Stat value={reactions.length} label="Reactions" />
            </div>
            {reactions.length === 0
                ? <p className="ag-hint">{aim === 'sneak' ? 'A sneak sets off nobody.' : 'Nobody on watch sees this move.'}</p>
                : (
                    <div className="ag-list">
                        {reactions.map(({ watcher, kind, chance, damage }) => (
                            <ListRow
                                key={watcher.id}
                                icon="⚠"
                                title={capitalise(name(watcher.id))}
                                sub={`${kind === 'guard' ? 'On guard' : 'On overwatch'} · ${chance}% to hit for ${damage}`}
                            />
                        ))}
                    </div>
                )}
        </>
    );
}
