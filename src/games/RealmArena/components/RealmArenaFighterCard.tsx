'use client'
import React from 'react';
import ListRow from '@/components/ui/ListRow';
import Section from '@/components/ui/Section';
import Stat from '@/components/ui/Stat';
import { ABILITIES, CHARACTERS, type Weapon } from '@/games/RealmArena/characters';
import type { Fighter } from '@/games/RealmArena/rules';
import { abilityWait, CHARACTER_MARK, fighterStatus } from '@/games/RealmArena/ui';

export function weaponLine(weapon: Weapon): string {
    return weapon.kind === 'melee'
        ? `Melee · ${weapon.damage} damage`
        : `${weapon.accuracy}% · range ${weapon.range} · ${weapon.damage} damage`;
}

interface RealmArenaFighterCardProps {
    fighter: Fighter;
    /** Its heading: the character's name and whose it is. */
    label: string;
    /**
     * What it can do now, on its owner's turn: the turn sheet, in place of the
     * read-only list of its weapon and abilities.
     */
    children?: React.ReactNode;
}

/**
 * Everything about the character selected on the board: its HP and AP, what
 * it's doing, and its weapon and abilities with their cooldowns
 * (docs/games/realm-arena.md §13.6) — or, when it's the viewer's to act with,
 * the turn sheet that uses them (§17.3 PR 7).
 */
export default function RealmArenaFighterCard({ fighter, label, children }: RealmArenaFighterCardProps) {
    const character = CHARACTERS[fighter.character];
    const status = fighterStatus(fighter);
    return (
        <Section label={label}>
            <div className="ag-stat-row">
                <Stat value={`${fighter.hp}/${character.hp}`} label="HP" />
                <Stat value={fighter.ap} label="AP left" />
                <Stat value={fighter.banked} label="AP banked" />
            </div>
            <p className="ag-hint ag-hint--tight">{status.length > 0 ? status.join(' · ') : character.role}</p>
            {children ?? (
                <div className="ag-list">
                    <ListRow icon={CHARACTER_MARK[fighter.character]} title={character.weapon.name} sub={weaponLine(character.weapon)} />
                    {character.abilities.map(id => {
                        const ability = ABILITIES[id];
                        return (
                            <ListRow
                                key={id}
                                icon="✦"
                                title={ability.name}
                                sub={`${ability.ap} AP · ${ability.description}`}
                                action={<span className="ag-tag ag-tag--quiet">{abilityWait(fighter, id) ?? 'Ready'}</span>}
                            />
                        );
                    })}
                </div>
            )}
        </Section>
    );
}
