'use client'
import React from 'react';
import Section from '@/components/ui/Section';
import { CHARACTERS } from '@/games/RealmArena/characters';
import { ACTION_POINTS, isStanding, maxHpOf, type BattleState, type Fighter } from '@/games/RealmArena/rules';
import RealmArenaCrosshair from './RealmArenaCrosshair';
import { RealmArenaStatusList } from './RealmArenaEffects';
import { apPips, canAct, effectsOn, fighterName, hpFraction, watchStatus } from '@/games/RealmArena/ui';
import { attackOptions } from '@/games/RealmArena/tactics';
import { CHARACTER_MARK } from '@/games/RealmArena/roster';

interface RealmArenaUnitsProps {
    /** The battlefield and everyone on it: the viewer's own are picked out of it. */
    battle: BattleState;
    player: string;
    colourFor: (userId: string) => string;
    /** It's the viewer's battle turn, so their AP is live and worth counting. */
    acting: boolean;
    /** Counts what each unit has in reach: not once the battle is over. */
    showReach: boolean;
    selectedId: number | null;
    /** Selects a unit, which also brings the board's view to it. */
    onSelect: (fighterId: number) => void;
}

/**
 * The viewer's squad under the board (docs/games/realm-arena.md §17.3): a box
 * per character with its HP and, on their turn, the AP it has left of its
 * `ACTION_POINTS` — the same pips the board draws beside the figure — and a
 * crosshair counting the enemies its main weapon could hit from where it
 * stands, and its status effects spelled out under its HP (§20.2). Tapping a box selects the character and brings the view to it, and
 * "Next ready" steps to the next one with AP left to spend.
 */
export default function RealmArenaUnits({ battle, player, colourFor, acting, showReach, selectedId, onSelect }: RealmArenaUnitsProps) {
    const { fighters } = battle;
    const squad = fighters.filter(fighter => fighter.owner === player);
    if (squad.length === 0) return null;
    const ready = acting ? squad.filter(canAct) : [];
    // The first ready one after the selected one, round to the start again.
    const next = ready.find(fighter => fighter.id > (selectedId ?? -1)) ?? ready.find(fighter => fighter.id !== selectedId);

    return (
        <Section
            label={acting ? `Your units · ${ready.length} can act` : 'Your units'}
            action={next && (
                <button type="button" className="ag-section-action" onClick={() => onSelect(next.id)}>Next ready ›</button>
            )}
        >
            <div className="ag-ra-units" data-tour="ra-units">
                {squad.map(fighter => {
                    const standing = isStanding(fighter);
                    const done = acting && standing && !canAct(fighter);
                    return (
                        <UnitBox
                            key={fighter.id}
                            mark={standing ? CHARACTER_MARK[fighter.character] : '✕'}
                            colour={standing ? colourFor(fighter.owner) : undefined}
                            name={fighterName(fighters, fighter)}
                            sub={`${fighter.hp}/${maxHpOf(fighter)} HP`}
                            selected={fighter.id === selectedId}
                            dim={done || !standing}
                            onClick={() => onSelect(fighter.id)}
                        >
                            <span className="ag-ra-unit-hp">
                                <span style={{ width: `${hpFraction(fighter) * 100}%` }} />
                            </span>
                            <RealmArenaStatusList effects={effectsOn(fighter)} item={fighter.item} />
                            <span className={`ag-ra-unit-foot${done ? ' ag-ra-unit-foot--done' : ''}`}>
                                <UnitStatus fighter={fighter} acting={acting} done={done} />
                                {standing && showReach && <TargetCount count={attackOptions(battle, fighter).length} />}
                            </span>
                        </UnitBox>
                    );
                })}
            </div>
        </Section>
    );
}

interface UnitBoxProps {
    /** The character's mark, or what stands in for it. */
    mark: React.ReactNode;
    /** Its owner's colour behind the mark; none once it's down. */
    colour?: string;
    name: string;
    /** The line under its name. */
    sub: string;
    selected: boolean;
    /** Greyed: done for the turn, or down. */
    dim?: boolean;
    onClick: () => void;
    /** What the box says under its head. */
    children?: React.ReactNode;
}

/**
 * One of the viewer's squad as a tappable box: its mark on its owner's colour
 * and its name over a line, ringed when it's selected. The squad under the
 * board in battle, and the squad being placed in the muster.
 */
export function UnitBox({ mark, colour, name, sub, selected, dim, onClick, children }: UnitBoxProps) {
    const classes = ['ag-ra-unit'];
    if (selected) classes.push('ag-ra-unit--selected');
    if (dim) classes.push('ag-ra-unit--done');
    return (
        <button type="button" className={classes.join(' ')} aria-pressed={selected} onClick={onClick}>
            <span className="ag-ra-unit-head">
                <span className="ag-ra-unit-disc" style={{ background: colour }}>{mark}</span>
                <span className="ag-ra-unit-name">
                    <b>{name}</b>
                    <span>{sub}</span>
                </span>
            </span>
            {children}
        </button>
    );
}

/** The start of a unit's last line: down, done, its AP pips on the viewer's turn, or whether it's on watch off it. */
function UnitStatus({ fighter, acting, done }: { fighter: Fighter; acting: boolean; done: boolean }) {
    if (!isStanding(fighter)) return <span>✕ Down</span>;
    if (done) return <span>✓ Done</span>;
    if (!acting) return <span>{watchStatus(fighter) ?? 'Waiting'}</span>;
    return (
        <span className="ag-ra-unit-ap" aria-label={`${fighter.ap} of ${ACTION_POINTS} AP left`}>
            <span className="ag-ra-unit-pips" aria-hidden="true">
                {apPips(fighter).map((on, i) => (
                    <span key={i} className={`ag-ra-unit-pip${on ? ' ag-ra-unit-pip--on' : ''}`} />
                ))}
            </span>
            <b aria-hidden="true">{fighter.ap}</b>
        </span>
    );
}

/** How many enemies a unit's main weapon could hit from where it stands. */
function TargetCount({ count }: { count: number }) {
    return (
        <span className={`ag-ra-unit-targets${count === 0 ? ' ag-ra-unit-targets--none' : ''}`} aria-label={`${count} in reach`} title={`${count} in reach`}>
            <RealmArenaCrosshair />
            <span aria-hidden="true">{count}</span>
        </span>
    );
}
