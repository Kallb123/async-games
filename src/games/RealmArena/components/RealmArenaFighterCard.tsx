'use client'
import React from 'react';
import ListRow from '@/components/ui/ListRow';
import Section from '@/components/ui/Section';
import Stat from '@/components/ui/Stat';
import { ABILITIES, CHARACTERS, type Ability, type AbilityId, type Weapon } from '@/games/RealmArena/characters';
import type { Fighter } from '@/games/RealmArena/rules';
import { CHARACTER_MARK, fighterStatus } from '@/games/RealmArena/ui';
import { pluralize } from '@/utils/ui/text';

function weaponLine(weapon: Weapon): string {
    return weapon.kind === 'melee'
        ? `Melee · ${weapon.damage} damage`
        : `${weapon.accuracy}% · range ${weapon.range} · ${weapon.damage} damage`;
}

/** Whether an ability can be used now, as the tag beside it says. */
function abilityTag(fighter: Fighter, id: AbilityId, ability: Ability): string {
    if (ability.oncePerBattle && fighter.spent.includes(id)) return 'Used';
    const cooldown = fighter.cooldowns[id] ?? 0;
    return cooldown > 0 ? `Back in ${pluralize(cooldown, 'turn')}` : 'Ready';
}

interface RealmArenaFighterCardProps {
    fighter: Fighter;
    ownerName: string;
}

/**
 * Everything about the character selected on the board, read-only: its HP and
 * AP, what it's doing, its weapon and its abilities with their cooldowns
 * (docs/games/realm-arena.md §13.6). PR 7's turn sheet acts on the same
 * selection.
 */
export default function RealmArenaFighterCard({ fighter, ownerName }: RealmArenaFighterCardProps) {
    const character = CHARACTERS[fighter.character];
    const status = fighterStatus(fighter);
    return (
        <Section label={`${character.name} · ${ownerName}`}>
            <div className="ag-stat-row">
                <Stat value={`${fighter.hp}/${character.hp}`} label="HP" />
                <Stat value={fighter.ap} label="AP left" />
                <Stat value={fighter.banked} label="AP banked" />
            </div>
            <p className="ag-hint ag-hint--tight">{status.length > 0 ? status.join(' · ') : character.role}</p>
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
                            action={<span className="ag-tag ag-tag--quiet">{abilityTag(fighter, id, ability)}</span>}
                        />
                    );
                })}
            </div>
        </Section>
    );
}
