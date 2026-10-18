'use client'
import { ruleValuesOf, rulesetOf } from "@/games/RealmArena/rulesets";
import React, { useState } from 'react';
import ActionButton from '@/components/ui/ActionButton';
import BuildRow from '@/components/ui/BuildRow';
import InfoButton from '@/components/ui/InfoButton';
import InfoModal from '@/components/ui/InfoModal';
import ListRow from '@/components/ui/ListRow';
import PendingTag from '@/components/ui/PendingTag';
import Stat from '@/components/ui/Stat';
import { EFFECTS, type AbilityId, type Affliction } from '@/games/RealmArena/characters';
import { ITEM_ART } from '@/games/RealmArena/art';
import { ATTACK_AP, HUNKER_AP, REACTION_COST, bankedAp, abilitiesOf, allied, check, damageTo, fighterById, hasEffect, healedEffects, isStanding, itemOf, maxHpOf, shotEffect, shotOdds, smokeSquares, strikeChance, weaponOf, type Action, type BattleState, type Fighter, type OddsBreakdown } from '@/games/RealmArena/rules';
import { abilityWait, AREA_BLAST, oddsLines, whoseName } from '@/games/RealmArena/ui';
import { rangeSquares, shotOf, targetsOf, type TargetKind } from '@/games/RealmArena/tactics';
import { ABILITY_MARK, CHARACTER_MARK, weaponLine, weaponMark } from '@/games/RealmArena/roster';
import { healingHp, INSTANT_KINDS, isAtSquare, landsOf, type Aim, type InstantKind, type TurnDraft } from '@/games/RealmArena/useTurnDraft';
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
    leap: 'Tap a clear square in sight within 4 squares to jump beside enemies.',
    iceBall: 'Tap a square: Ice Ball hits and slows everyone in the 3×3, friend or foe.',
    shove: 'Tap an enemy next to the Knight. A hit pushes it away; collisions hurt.',
    poisonArrow: 'Tap an enemy. A hit poisons it.',
    bouncingArrow: 'Tap an enemy. A hit bounces to a random other enemy within 4 squares.',
    splittingArrow: 'Tap two different enemies in bow range.',
    shootDodge: 'Tap an enemy, then a shaded square to dodge to. Tap the Archer to stay put.',
    thunder: 'Tap an enemy. A hit stuns it.',
    beckon: 'Tap another ally in sight within 8 squares to pull it closer.',
    ward: 'Tap the Cleric or an ally in sight within 6 squares to give full cover.',
    runeRaise: 'Tap a downed ally next to them.',

    move: 'Tap a shaded square to move there: the darker the shade, the more AP it takes.',
    sneak: 'Tap a shaded square to sneak there. Nobody on watch reacts to a sneak.',
    attack: 'Tap an enemy to see the odds.',
    aimedShot: 'Tap an enemy to see the odds.',
    cleave: 'Tap two enemies next to them.',
    fireball: 'Tap the square to centre the fireball on. It hits the 3×3 around it, friend or foe.',
    dynamite: `Tap a square in range to throw the dynamite at. It hits the 3×3 around it, friend or foe.`,
    heal: `Tap a hurt ally they can see in range.`,
    raise: 'Tap a downed ally next to them.',
    throw: 'Tap a shaded square to throw it there: where it lands is shaded red, and catches friend and foe alike.',
    draught: 'Tap them, or a hurt ally next to them, to give the draught.',
    shieldBash: 'Tap an enemy next to them to see the odds. A hit stuns them.',
    cripplingShot: 'Tap an enemy to see the odds. A hit slows them.',
    huntersMark: 'Tap an enemy they can see within 12 squares.',
    demolish: 'Tap the low cover next to them to blast it away. Everyone else beside it is struck, friend or foe.',
    rend: 'Tap an enemy next to them to see the odds.',
    regrowth: `Tap a hurt ally they can see in range.`,
};

/** What the send button says, by the action lined up. */
const SEND_LABEL: Readonly<Record<Aim, string>> = {
    leap: 'Leap',
    iceBall: 'Cast Ice Ball',
    shove: 'Shove',
    poisonArrow: 'Fire Poison Arrow',
    bouncingArrow: 'Fire Bouncing Arrow',
    splittingArrow: 'Fire Splitting Arrow',
    shootDodge: 'Shoot + Dodge',
    thunder: 'Cast Thunder',
    beckon: 'Beckon',
    ward: 'Ward',
    runeRaise: 'Raise',

    move: 'Move here',
    sneak: 'Sneak here',
    attack: 'Attack',
    aimedShot: 'Take the aimed shot',
    cleave: 'Cleave',
    fireball: 'Throw the fireball',
    dynamite: 'Throw the dynamite',
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
    leap: { icon: ABILITY_MARK, tag: 'Aim' },
    iceBall: { icon: ABILITY_MARK, tag: 'Aim' },
    shove: { icon: ABILITY_MARK, tag: 'Aim', needs: 'shove' },
    poisonArrow: { icon: ABILITY_MARK, tag: 'Aim', needs: 'poisonArrow' },
    bouncingArrow: { icon: ABILITY_MARK, tag: 'Aim', needs: 'bouncingArrow' },
    splittingArrow: { icon: ABILITY_MARK, tag: 'Aim', needs: 'splittingArrow', least: 2 },
    shootDodge: { icon: ABILITY_MARK, tag: 'Aim', needs: 'shootDodge' },
    thunder: { icon: ABILITY_MARK, tag: 'Aim', needs: 'thunder' },
    beckon: { icon: ABILITY_MARK, tag: 'Aim', needs: 'beckon' },
    ward: { icon: ABILITY_MARK, tag: 'Aim', needs: 'ward' },
    runeRaise: { icon: ABILITY_MARK, tag: 'Aim', needs: 'runeRaise' },
    slashAndDash: { icon: ABILITY_MARK, tag: 'Use' },
    bulwark: { icon: ABILITY_MARK, tag: 'Use' },
    taunt: { icon: ABILITY_MARK, tag: 'Use' },
    focus: { icon: ABILITY_MARK, tag: 'Use' },
    blessing: { icon: ABILITY_MARK, tag: 'Use' },
    sneak: { icon: '🤫', tag: 'Sneak' },
    shieldWall: { icon: '🛡️', tag: 'Raise it' },
    fireball: { icon: AREA_BLAST.fireball.icon, tag: 'Aim' },
    dynamite: { icon: AREA_BLAST.dynamite.icon, tag: 'Aim' },
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
    const name = (id: number) => whoseName(battle.fighters, id, player, nameFor, battle);
    return (
        <>
            <LinedUp draft={draft} battle={battle} name={name} pending={pendingTarget === LINED_UP} disabled={busy} />
            <TargetList draft={draft} battle={battle} name={name} disabled={busy} onFocus={onFocus} />
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
    const { CHARACTERS, ABILITIES } = rulesetOf(battle);
    const { ATTACK_AP, HUNKER_AP, REACTION_COST } = ruleValuesOf(battle);
    const { fighter, aim } = draft;
    const character = CHARACTERS[fighter.character];
    const weapon = weaponOf(battle, fighter);
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
    const item = itemOf(fighter, battle);
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
            {row('attack', weaponMark(fighter.character, fighter.option), weapon.name, `${ATTACK_AP} AP · ${weaponLine(weapon, battle)}`,
                needs(ATTACK_AP) ?? reachable('attack'), 'Attack')}
            {abilitiesOf(fighter, battle).filter(id => !ABILITIES[id]!.passive).map(id => {
                const ability = ABILITIES[id]!;
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
                `All ${fighter.ap} AP left · ${pluralize(Math.floor(bankedAp(fighter.ap, battle) / REACTION_COST), 'reaction')} before your next turn`,
                needs(REACTION_COST), 'Watch')}
        </div>
    );
}

interface TargetListProps {
    draft: TurnDraft;
    battle: BattleState;
    name: (id: number) => string;
    disabled: boolean;
    onFocus: (fighter: Fighter) => void;
}

/** The signed percentage a factor moves a chance by: +20%, −40%. */
const signedPercent = (amount: number) => `${amount < 0 ? '−' : '+'}${Math.abs(amount)}%`;

interface OddsInfoProps {
    battle: BattleState;
    /** Who it's about, as the sheet names them. */
    target: string;
    /** What the attacker starts from: "Bow accuracy", "Melee accuracy". */
    baseLabel: string;
    odds: OddsBreakdown;
    onClose: () => void;
}

/**
 * Why a target's chance to hit is what the row says: the accuracy it starts
 * from and each thing that moved it (`oddsLines`), then where it came to. The
 * numbers are the ones `targetOptions` already worked out, not a second sum.
 */
function OddsInfo({ target, baseLabel, odds, onClose, battle }: OddsInfoProps) {
    const lines = oddsLines(odds, baseLabel, battle);
    const doubled = lines.some(line => line.note);
    return (
        <InfoModal title={`Hitting ${target}`} onClose={onClose} closeLabel="Close">
            <div className="ag-list">
                {lines.map((line, i) => (
                    <ListRow
                        key={line.label}
                        title={line.label}
                        sub={line.note}
                        action={<span className="ag-build-tag">{i === 0 ? `${line.amount}%` : signedPercent(line.amount)}</span>}
                    />
                ))}
            </div>
            <div className="ag-stat-row">
                <Stat value={`${odds.chance}%`} label="Hit" />
                {odds.grazeChance !== undefined && <Stat value={`${odds.grazeChance}%`} label="Graze" />}
            </div>
            {doubled && <p className="ag-hint ag-hint--tight">Cover is doubled once, however many things would double it.</p>}
        </InfoModal>
    );
}

/**
 * Everyone the armed action could be aimed at, each with their HP and — at an
 * enemy — the chance to hit them, with a "?" that opens what that chance is
 * made of. Picking one lines it up and brings the board to them; picking a
 * cleave's target again lets it go, and stays put.
 */
function TargetList({ draft, battle, name, disabled, onFocus }: TargetListProps) {
    const [why, setWhy] = useState<number | null>(null);
    if (draft.options.length === 0) return null;
    const asked = draft.options.find(({ target }) => target.id === why);
    const weapon = weaponOf(battle, draft.fighter);
    return (
        <div className="ag-build-list">
            {asked?.odds && (
                <OddsInfo
                    battle={battle}
                    target={capitalise(name(asked.target.id))}
                    baseLabel={asked.odds.grazeChance !== undefined ? `${weapon.name} accuracy` : 'Melee accuracy'}
                    odds={asked.odds}
                    onClose={() => setWhy(null)}
                />
            )}
            {draft.options.map(({ target, chance, odds }) => {
                const aimed = draft.targets.includes(target.id);
                const pick = () => {
                    draft.pick(target.id);
                    if (!(aimed && (draft.aim === 'cleave' || draft.aim === 'splittingArrow'))) onFocus(target);
                };
                return (
                    <BuildRow
                        key={target.id}
                        icon={CHARACTER_MARK[target.character]}
                        name={capitalise(name(target.id))}
                        cost={`${target.hp}/${maxHpOf(target, battle)} HP`}
                        tag={chance !== undefined ? `${chance}% to hit` : aimed ? 'Aiming' : 'Pick'}
                        disabled={disabled}
                        active={aimed}
                        onClick={pick}
                        aside={odds && <InfoButton variant="help" label={`Why ${chance}% to hit ${name(target.id)}`} onClick={() => setWhy(target.id)} />}
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
        const chosen = (aim === 'cleave' || aim === 'splittingArrow') && draft.targets.length === 1 ? ` ${capitalise(name(draft.targets[0]))} is picked.` : '';
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
    const { EFFECTS, ABILITIES } = rulesetOf(battle);
    const { fighter, aim } = draft;
    const hint = (text: React.ReactNode) => <p className="ag-hint">{text}</p>;
    const Name = (id: number) => capitalise(name(id));

    if (aim === "shootDodge") return hint(ABILITIES.shootDodge!.description);
    if (draft.path) return <MoveDetail draft={draft} name={name} ap={ap} />;
    if (draft.area) {
        // What lands — a fireball, dynamite, the item thrown, or a Demolish — and on whom.
        const thrown = aim === 'throw' ? itemOf(fighter, battle) : undefined;
        if (thrown?.hitPenalty) return hint('Smoke over the 3×3 until your next turn. It hurts nobody.');
        const area = new Set(draft.area);
        const caught = battle.fighters.filter(one => isStanding(one) && area.has(one.square) && (aim !== 'leap' || !allied(battle, fighter.owner, one.owner)));
        const { damage = 0, effect } = (isAtSquare(aim) ? landsOf(fighter, aim, battle) : undefined) ?? {};
        return hint(<>
            {caught.length === 0 ? `Nobody is ${draft.area.length > 1 ? 'in the blast' : 'there'}.` : landsOn(caught.map(one => name(one.id)).join(', '), damage, effect)}
            {caught.some(one => allied(battle, one.owner, fighter.owner)) ? ' That includes your own.' : ''}
            {draft.blasts?.length ? ` Blasts away ${pluralize(draft.blasts.length, 'square')} of low cover.` : ''}
        </>);
    }
    if (aim === 'cleave' || aim === 'splittingArrow') {
        const chances = draft.targets.map(id => { const hit = fighterById(battle, id); return hit ? `${aim === "splittingArrow" ? shotOdds(battle, fighter, hit, aim)?.chance : strikeChance(battle, hit)}%` : ''; });
        const damages = draft.targets.map(id => { const hit = fighterById(battle, id); return hit ? -(draft.hpChange.get(id) ?? 0) : 0; });
        const each = new Set(damages).size === 1 ? `${damages[0]} each` : andList(damages.map(String));
        return hint(`${aim === "splittingArrow" ? "Shoots" : "Strikes"} ${andList(draft.targets.map(name))} for ${each}, at ${andList(chances)} to hit.`);
    }
    if (!target) return null;
    const max = maxHpOf(target, battle);
    if (aim === 'heal' || aim === 'regrowth' || aim === 'draught') {
        const hp = Math.min(healingHp(aim, battle) ?? 0, max - target.hp);
        const cleared = healedEffects(target, battle).map(effect => EFFECTS[effect]!.state);
        const heals = hp > 0 ? `heals for ${hp} HP` : '';
        const clears = cleared.length > 0 ? `is no longer ${cleared.join(' or ')}` : '';
        return hint(`${Name(target.id)} ${[heals, clears].filter(Boolean).join(', and ')}.`);
    }
    if (aim === 'raise' || aim === 'runeRaise') {
        // Only on its owner's own turn does a raised character have AP to spend.
        const yours = target.owner === fighter.owner;
        const raisedAp = yours ? ABILITIES[aim]!.apOnRaise ?? 0 : 0;
        return hint(`${Name(target.id)} stands again at ${Math.ceil(max / 2)} HP, ${raisedAp > 0 ? `with ${raisedAp} AP to spend now` : `and acts from ${yours ? 'your' : 'its owner\'s'} next turn`}.`);
    }
    if (aim === 'shove' || aim === 'beckon' || aim === 'ward') return hint(ABILITIES[aim]!.description);
    if (aim === 'huntersMark') {
        return hint(`${Name(target.id)} is marked: +${EFFECTS.marked.hitBonus}% to hit them, for every attacker, until their turn after next.`);
    }

    const health = `${Name(target.id)} · ${target.hp}/${max} HP`;
    const lands = strikeChance(battle, target);
    if (aim === 'shieldBash') return hint(`${health} · ${lands}% to hit, for ${damageTo(battle, fighter, target, ABILITIES.shieldBash.damage, 'ability')}, and a hit stuns them.`);
    if (aim === 'rend') return hint(`${health} · ${lands}% to hit, for ${damageTo(battle, fighter, target, ABILITIES.rend.damage, 'ability')}.`);
    const shot = shotOf(aim);
    const odds = shot && shotOdds(battle, fighter, target, shot);
    if (!shot || !odds) return hint(`${health} · ${lands}% to hit, for ${damageTo(battle, fighter, target)}.`);
    const effect = shotEffect(fighter, shot, battle);
    return (
        <>
            <div className="ag-stat-row">
                <Stat value={`${odds.chance}%`} label="Hit" />
                <Stat value={`${odds.grazeChance}%`} label="Graze" />
                <Stat value={odds.grazeChance > 0 ? `${odds.damage} / ${odds.grazeDamage}` : odds.damage} label="Damage" />
            </div>
            {hint(`${health} · ${odds.flanked ? 'flanked, +1 damage' : `${odds.cover} cover`}${hasEffect(target, 'hunkered') ? ', hunkered down' : ''}${smokeSquares(battle).has(target.square) ? ', in smoke' : ''}${odds.farCover ? ', cover doubled at range' : ''}${effect ? ` · a hit leaves them ${EFFECTS[effect]!.state}` : ''}`)}
        </>
    );
}

/** What something landing does to everyone it catches: "3 damage to your Knight, and leaves them burning". */
function landsOn(names: string, damage: number, effect: Affliction | undefined): string {
    const leaves = effect ? EFFECTS[effect]!.state : '';
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
