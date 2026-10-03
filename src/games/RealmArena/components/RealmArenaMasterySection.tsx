'use client'
import React from 'react';
import ListRow from '@/components/ui/ListRow';
import ListSection from '@/components/ui/ListSection';
import { CHARACTERS, OPTIONS } from '@/games/RealmArena/characters';
import { rankOf, type PlayerMastery } from '@/games/RealmArena/mastery';
import { CHARACTER_IDS, CHARACTER_MARK, masteryLine, optionsFor, optionView } from '@/games/RealmArena/roster';

interface RealmArenaMasterySectionProps {
    /** The player's record with each character they've fought with; empty, or absent, for one who never has. */
    mastery: PlayerMastery | undefined;
    isLoading: boolean;
    isRefreshing: boolean;
}

/**
 * A profile's Realm Arena section (docs/games/realm-arena.md §23.3): each
 * character's XP, its rank, how far it is from the next and the options its
 * rank has unlocked. Public, like the rest of a profile, so both profile
 * screens show it. A player who has never fought a battle has no section.
 */
export default function RealmArenaMasterySection({ mastery = {}, isLoading, isRefreshing }: RealmArenaMasterySectionProps) {
    const fought = Object.keys(mastery).length > 0;
    return (
        <ListSection
            label="Realm Arena mastery"
            isLoading={isLoading}
            isRefreshing={isRefreshing}
            skeletonRows={0}
            hint="A character earns XP in every battle it fights in, and more for each attack, ability and item it uses."
        >
            {fought ? CHARACTER_IDS.map(id => {
                const xp = mastery[id]?.xp ?? 0;
                const rank = rankOf(xp);
                const unlocked = optionsFor(id).filter(option => OPTIONS[option].rank <= rank).map(option => optionView(option).name);
                return (
                    <ListRow
                        key={id}
                        icon={CHARACTER_MARK[id]}
                        title={CHARACTERS[id].name}
                        sub={[masteryLine(xp), ...unlocked].join(' · ')}
                        muted={!mastery[id]}
                        action={<span className="ag-tag ag-tag--quiet">{rank > 0 ? `Rank ${rank}` : 'Unranked'}</span>}
                    />
                );
            }) : null}
        </ListSection>
    );
}
