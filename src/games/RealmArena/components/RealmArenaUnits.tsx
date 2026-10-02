'use client'
import React from 'react';
import Section from '@/components/ui/Section';
import { CHARACTERS } from '@/games/RealmArena/characters';
import { ACTION_POINTS, isStanding, type Fighter } from '@/games/RealmArena/rules';
import { apPips, canAct, CHARACTER_MARK, fighterName, fighterStatus, hpFraction } from '@/games/RealmArena/ui';

interface RealmArenaUnitsProps {
    /** Everyone on the battlefield: the viewer's own are picked out of it. */
    fighters: readonly Fighter[];
    player: string;
    colourFor: (userId: string) => string;
    /** It's the viewer's battle turn, so their AP is live and worth counting. */
    acting: boolean;
    selectedId: number | null;
    /** Selects a unit, which also brings the board's view to it. */
    onSelect: (fighterId: number) => void;
}

/**
 * The viewer's squad under the board (docs/games/realm-arena.md §17.3): a box
 * per character with its HP and, on their turn, the AP it has left of its
 * `ACTION_POINTS` — the same pips the board draws beside the figure. Tapping a
 * box selects the character and brings the view to it, and "Next ready" steps
 * to the next one with AP left to spend.
 */
export default function RealmArenaUnits({ fighters, player, colourFor, acting, selectedId, onSelect }: RealmArenaUnitsProps) {
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
            <div className="ag-ra-units">
                {squad.map(fighter => {
                    const character = CHARACTERS[fighter.character];
                    const standing = isStanding(fighter);
                    const done = acting && standing && !canAct(fighter);
                    const classes = ['ag-ra-unit'];
                    if (fighter.id === selectedId) classes.push('ag-ra-unit--selected');
                    if (done || !standing) classes.push('ag-ra-unit--done');
                    const name = fighterName(fighters, fighter);
                    return (
                        <button key={fighter.id} type="button" className={classes.join(' ')} onClick={() => onSelect(fighter.id)}>
                            <span className="ag-ra-unit-head">
                                <span className="ag-ra-unit-disc" style={{ background: standing ? colourFor(fighter.owner) : undefined }}>
                                    {standing ? CHARACTER_MARK[fighter.character] : '✕'}
                                </span>
                                <span className="ag-ra-unit-name">
                                    <b>{name}</b>
                                    <span>{fighter.hp}/{character.hp} HP</span>
                                </span>
                            </span>
                            <span className="ag-ra-unit-hp">
                                <span style={{ width: `${hpFraction(fighter) * 100}%` }} />
                            </span>
                            <UnitFooter fighter={fighter} acting={acting} done={done} />
                        </button>
                    );
                })}
            </div>
        </Section>
    );
}

/** A unit's last line: down, done, its AP pips on the viewer's turn, or what it's doing off it. */
function UnitFooter({ fighter, acting, done }: { fighter: Fighter; acting: boolean; done: boolean }) {
    if (!isStanding(fighter)) return <span className="ag-ra-unit-foot">✕ Down</span>;
    if (done) return <span className="ag-ra-unit-foot ag-ra-unit-foot--done">✓ Done</span>;
    if (!acting) return <span className="ag-ra-unit-foot">{fighterStatus(fighter)[0] ?? 'Waiting'}</span>;
    return (
        <span className="ag-ra-unit-foot" aria-label={`${fighter.ap} of ${ACTION_POINTS} AP left`}>
            <span className="ag-ra-unit-pips" aria-hidden="true">
                {apPips(fighter).map((on, i) => (
                    <span key={i} className={`ag-ra-unit-pip${on ? ' ag-ra-unit-pip--on' : ''}`} />
                ))}
            </span>
            <b aria-hidden="true">{fighter.ap}</b>
        </span>
    );
}
