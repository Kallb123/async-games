'use client'
import React from 'react';
import ListRow from '@/components/ui/ListRow';
import Section from '@/components/ui/Section';
import Stat from '@/components/ui/Stat';
import { ITEM_ART } from '@/games/RealmArena/art';
import { ABILITIES, CHARACTERS, ITEMS } from '@/games/RealmArena/characters';
import { abilitiesOf, ARMOUR, isStanding, isWarband, maxHpOf, weaponOf, type BattleState, type Fighter } from '@/games/RealmArena/rules';
import { abilityWait, effectsOn, watchStatus } from '@/games/RealmArena/ui';
import { ABILITY_MARK, weaponLine, weaponMark } from '@/games/RealmArena/roster';
import { RealmArenaStatusList } from './RealmArenaEffects';
import { SpriteImage } from './RealmArenaTerrain';

interface RealmArenaFighterCardProps {
    fighter: Fighter;
    /** The battle it's in, which says what it's fighting with (`weaponOf`) and whether it wears armour (`BattleState.armoured`). */
    battle: BattleState;
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
 * it's doing and its status effects (§20.2), and its weapon, abilities with their cooldowns
 * (docs/games/realm-arena.md §13.6) and the item it carries (§21) — or, when
 * it's the viewer's to act with, the turn sheet that uses them (§17.3 PR 7).
 */
export default function RealmArenaFighterCard({ fighter, battle, label, children }: RealmArenaFighterCardProps) {
    const character = CHARACTERS[fighter.character];
    const weapon = weaponOf(battle, fighter);
    return (
        <Section label={label}>
            <div className="ag-stack">
                <div className="ag-stat-row">
                    <Stat value={`${fighter.hp}/${maxHpOf(fighter)}`} label="HP" />
                    <Stat value={fighter.ap} label="AP left" />
                    <Stat value={fighter.banked} label="AP banked" />
                    {battle.armoured && !isWarband(fighter.owner) && <Stat value={ARMOUR} label="Armour" />}
                </div>
                <p className="ag-hint">{isStanding(fighter) ? watchStatus(fighter) ?? character.role : 'Down'}</p>
                <RealmArenaStatusList effects={effectsOn(fighter)} />
                {children ?? (
                    <div className="ag-list">
                        <ListRow icon={weaponMark(fighter.character, fighter.option)} title={weapon.name} sub={weaponLine(weapon)} />
                        {abilitiesOf(fighter).map(id => {
                            const ability = ABILITIES[id];
                            return (
                                <ListRow
                                    key={id}
                                    icon={ABILITY_MARK}
                                    title={ability.name}
                                    sub={`${ability.ap} AP · ${ability.description}`}
                                    action={<span className="ag-tag ag-tag--quiet">{abilityWait(fighter, id) ?? 'Ready'}</span>}
                                />
                            );
                        })}
                        {fighter.item && (
                            <ListRow
                                icon={<SpriteImage sprite={ITEM_ART[fighter.item]} boxed />}
                                title={ITEMS[fighter.item].name}
                                sub={`${ITEMS[fighter.item].ap} AP · ${ITEMS[fighter.item].description}`}
                                action={<span className="ag-tag ag-tag--quiet">Carried</span>}
                            />
                        )}
                    </div>
                )}
            </div>
        </Section>
    );
}
