'use client'
import React from 'react';
import ActionButton from '@/components/ui/ActionButton';
import BuildRow from '@/components/ui/BuildRow';
import ListRow from '@/components/ui/ListRow';
import PendingTag from '@/components/ui/PendingTag';
import Stat from '@/components/ui/Stat';
import { ABILITIES, CHARACTERS } from '@/games/RealmArena/characters';
import { ATTACK_AP, HUNKER_AP, REACTION_COST, fighterById, isStanding, shotOdds, type Action, type BattleState } from '@/games/RealmArena/rules';
import { abilityWait, CHARACTER_MARK, targetsOf, whoseName } from '@/games/RealmArena/ui';
import type { Aim, InstantKind, TurnDraft } from '@/games/RealmArena/useTurnDraft';
import { weaponLine } from '@/games/RealmArena/components/RealmArenaFighterCard';
import { capitalise, pluralize } from '@/utils/ui/text';

/** The `target` an action lined up on the board wears while it's in flight: the sheet's send button. */
const LINED_UP = 'act';

const INSTANT: readonly string[] = ['hunker', 'watch', 'shieldWall'] satisfies InstantKind[];

/** The `target` an action wears while it's in flight: its own row for one that goes the moment it's tapped, else the send button. */
export function actTarget(action: Action): string {
    return INSTANT.includes(action.kind) ? `act:${action.kind}` : LINED_UP;
}

/** What to tap, for an aim with nothing lined up yet. */
const AIM_HINT: Readonly<Record<Aim, string>> = {
    move: 'Tap a shaded square to move there: the darker the shade, the more AP it takes.',
    sneak: 'Tap a shaded square to sneak there. Nobody on watch reacts to a sneak.',
    attack: 'Tap an enemy to see the odds.',
    aimedShot: 'Tap an enemy to see the odds.',
    cleave: 'Tap two enemies next to them.',
    fireball: 'Tap the square to centre the fireball on. It hits the 3×3 around it, friend or foe.',
    heal: 'Tap a hurt ally next to them.',
    raise: 'Tap a downed ally next to them.',
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
};

interface RealmArenaTurnSheetProps {
    draft: TurnDraft;
    battle: BattleState;
    player: string;
    nameFor: (userId: string) => string;
    /** The `target` of the command in flight, so only what was tapped spins. */
    pendingTarget: string | null;
}

/**
 * What the selected character can do, on its owner's turn
 * (docs/games/realm-arena.md §17.3 PR 7): whatever is lined up on the board,
 * with its cost and what it would set off or the odds, and a `BuildRow` for
 * each action it has. A row that needs aiming arms the board; hunkering down,
 * going on watch and a shield wall go the moment they're tapped.
 */
export default function RealmArenaTurnSheet({ draft, battle, player, nameFor, pendingTarget }: RealmArenaTurnSheetProps) {
    const { fighter, aim } = draft;
    const character = CHARACTERS[fighter.character];
    const busy = pendingTarget !== null;
    const name = (id: number) => whoseName(battle.fighters, id, player, nameFor);
    const needs = (ap: number) => fighter.ap < ap ? `Needs ${ap} AP` : undefined;
    const reachable = (kind: Parameters<typeof targetsOf>[3], least = 1) =>
        targetsOf(battle, player, fighter, kind).length >= least ? undefined : 'Nobody in reach';

    const arming = (id: Aim, icon: string, title: string, cost: string, wait: string | undefined, tag: string) => (
        <BuildRow
            key={id}
            icon={icon}
            name={title}
            cost={cost}
            tag={wait ?? (aim === id ? 'Aiming' : tag)}
            tagMuted={wait !== undefined}
            disabled={busy || wait !== undefined}
            active={aim === id}
            onClick={() => aim === id ? draft.clear() : draft.arm(id)}
        />
    );
    const instant = (kind: InstantKind, icon: string, title: string, cost: string, wait: string | undefined, tag: string) => (
        <BuildRow
            key={kind}
            icon={icon}
            name={title}
            cost={cost}
            tag={pendingTarget === `act:${kind}` ? <PendingTag label="Sending…" /> : wait ?? tag}
            tagMuted={wait !== undefined}
            disabled={busy || wait !== undefined}
            pending={pendingTarget === `act:${kind}`}
            onClick={() => draft.now(kind)}
        />
    );

    const abilityRows = character.abilities.map(id => {
        const ability = ABILITIES[id];
        const wait = abilityWait(fighter, id) ?? needs(ability.ap);
        switch (id) {
            case 'sneak': return arming('sneak', '🤫', ability.name, `${ability.ap} AP per ${character.movement} squares · ${ability.description}`, wait, 'Sneak');
            case 'shieldWall': return instant('shieldWall', '🛡️', ability.name, `${ability.ap} AP · ${ability.description}`, wait, 'Raise it');
            case 'fireball': return arming('fireball', '🔥', ability.name, `${ability.ap} AP · ${ability.description}`, wait, 'Aim');
            case 'cleave': return arming('cleave', '✦', ability.name, `${ability.ap} AP · ${ability.description}`, wait ?? reachable('attack', 2), 'Aim');
            default: return arming(id, '✦', ability.name, `${ability.ap} AP · ${ability.description}`, wait ?? reachable(id), 'Aim');
        }
    });

    return (
        <>
            <LinedUp draft={draft} battle={battle} name={name} pending={pendingTarget === LINED_UP} disabled={busy} />
            <div className="ag-build-list">
                {arming('move', '👣', 'Move', `1 AP per ${character.movement} squares`, needs(1), 'Move')}
                {arming('attack', CHARACTER_MARK[fighter.character], character.weapon.name, `${ATTACK_AP} AP · ${weaponLine(character.weapon)}`,
                    needs(ATTACK_AP) ?? reachable('attack'), 'Attack')}
                {abilityRows}
                {instant('hunker', '⛨', 'Hunker down', `${HUNKER_AP} AP · doubles its cover against shots until your next turn, and ends its turn`, needs(HUNKER_AP), 'Hunker')}
                {instant('watch', '👁', character.weapon.kind === 'ranged' ? 'Go on overwatch' : 'Go on guard',
                    `All ${fighter.ap} AP left · ${pluralize(Math.floor(fighter.ap / REACTION_COST), 'reaction')} before your next turn`,
                    needs(REACTION_COST), 'Watch')}
            </div>
        </>
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
 * What's lined up on the board, before it's sent: a move's AP and every
 * watcher it would set off, an attack's chance to hit, graze and damage, or
 * who a fireball would catch (§17.3 PR 7). Until something is, what to tap.
 */
function LinedUp({ draft, battle, name, pending, disabled }: LinedUpProps) {
    const { fighter, aim, action, verdict } = draft;
    if (!action) {
        const chosen = aim === 'cleave' && draft.targets.length === 1 ? ` ${capitalise(name(draft.targets[0]))} is picked.` : '';
        return <p className="ag-hint">{AIM_HINT[aim]}{chosen}</p>;
    }

    const refusal = verdict && 'refused' in verdict ? verdict.refused : undefined;
    const ap = verdict && 'ap' in verdict ? verdict.ap : undefined;
    const target = draft.targets.length === 1 ? fighterById(battle, draft.targets[0]) : undefined;
    let detail: React.ReactNode = null;

    if (refusal) {
        detail = <p className="ag-hint">{target ? `${capitalise(name(target.id))}: ` : ''}{refusal}.</p>;
    } else if (draft.path) {
        detail = (
            <>
                <div className="ag-stat-row">
                    <Stat value={ap ?? 0} label="AP" />
                    <Stat value={fighter.ap - (ap ?? 0)} label="AP after" />
                    <Stat value={draft.reactions.length} label="Reactions" />
                </div>
                {draft.reactions.length === 0
                    ? <p className="ag-hint">{aim === 'sneak' ? 'A sneak sets off nobody.' : 'Nobody on watch sees this move.'}</p>
                    : (
                        <div className="ag-list">
                            {draft.reactions.map(({ watcher, kind, odds, damage }) => (
                                <ListRow
                                    key={watcher.id}
                                    icon="⚠"
                                    title={capitalise(name(watcher.id))}
                                    sub={kind === 'guard'
                                        ? `On guard · strikes for ${damage}`
                                        : `On overwatch · ${odds?.chance ?? 0}% to hit for ${damage}`}
                                />
                            ))}
                        </div>
                    )}
            </>
        );
    } else if (target && (aim === 'attack' || aim === 'aimedShot')) {
        const odds = shotOdds(battle, fighter, target, aim);
        const health = `${target.hp}/${CHARACTERS[target.character].hp} HP`;
        detail = odds ? (
            <>
                <div className="ag-stat-row">
                    <Stat value={`${odds.chance}%`} label="Hit" />
                    <Stat value={`${odds.grazeChance}%`} label="Graze" />
                    <Stat value={odds.grazeChance > 0 ? `${odds.damage} / ${odds.grazeDamage}` : odds.damage} label="Damage" />
                </div>
                <p className="ag-hint">
                    {capitalise(name(target.id))} · {health} · {odds.flanked ? `flanked, +1 damage` : `${odds.cover} cover`}{target.hunkered ? ', hunkered down' : ''}
                </p>
            </>
        ) : (
            <p className="ag-hint">{capitalise(name(target.id))} · {health} · a strike always hits, for {CHARACTERS[fighter.character].weapon.damage}.</p>
        );
    } else if (aim === 'cleave') {
        detail = <p className="ag-hint">Strikes {draft.targets.map(name).join(' and ')} for {CHARACTERS[fighter.character].weapon.damage} each.</p>;
    } else if (draft.area) {
        const area = new Set(draft.area);
        const caught = battle.fighters.filter(one => isStanding(one) && area.has(one.square));
        detail = (
            <p className="ag-hint">
                {caught.length === 0 ? 'Nobody is in the blast.' : `${ABILITIES.fireball.damage} damage to ${caught.map(one => name(one.id)).join(', ')}.`}
                {caught.some(one => one.owner === fighter.owner) ? ' That includes your own.' : ''}
            </p>
        );
    } else if (target && aim === 'heal') {
        detail = <p className="ag-hint">{capitalise(name(target.id))} heals for {Math.min(ABILITIES.heal.hp, CHARACTERS[target.character].hp - target.hp)} HP.</p>;
    } else if (target && aim === 'raise') {
        detail = <p className="ag-hint">{capitalise(name(target.id))} stands again at {Math.ceil(CHARACTERS[target.character].hp / 2)} HP, and acts from your next turn.</p>;
    }

    return (
        <>
            {detail}
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
        </>
    );
}
