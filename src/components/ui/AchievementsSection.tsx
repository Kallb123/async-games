'use client'

import moment from "moment";
import AchievementIcon from "@/components/ui/AchievementIcon";
import DisclosureSection from "@/components/ui/DisclosureSection";
import ListRow from "@/components/ui/ListRow";
import ListSection from "@/components/ui/ListSection";
import type { IAchievementUnlock, IGameStats } from "@/app/api/stats/route";
import { profileAchievements, type ProfileAchievementGroup, type ProfileAchievementRow } from "@/utils/ui/achievements";
import { pluralize } from "@/utils/ui/text";

interface AchievementsSectionProps {
    /** The player's stored unlocks, as their profile response carries them. */
    unlocks: IAchievementUnlock[];
    /** The same `byGame` the stats list beside this draws from: what a career row's progress is worked out on. */
    byGame: IGameStats[];
    isLoading: boolean;
    isRefreshing?: boolean;
}

/**
 * A profile's achievements (docs/achievements.md §7.5), shared by your own
 * profile and a friend's the way `GameStatsList` and `RecentFormSection` are.
 *
 * Every achievement there is, one `ListRow` each — icon, title, what it asks
 * for, and the date it was unlocked or how far along the player is — so there
 * is no badge grid and no detail modal to tap into. The platform's come first
 * under the count, then one group per game played, then the games not played
 * yet, folded away. A locked row is muted; an unlocked one links to the results
 * of the game that earned it, once there is a results page to land on.
 *
 * Renders nothing while there is no achievement to list.
 */
export default function AchievementsSection({ unlocks, byGame, isLoading, isRefreshing }: AchievementsSectionProps) {
    const { unlocked, total, groups, unplayed } = profileAchievements(unlocks, byGame);
    // Before anything is in the catalogue there is nothing to list, loading or not.
    if (total === 0) return null;
    // Rows drawn from a profile that hasn't arrived would all read as locked.
    if (isLoading) {
        return <ListSection label="Achievements" isLoading skeletonIcon="thumb">{null}</ListSection>;
    }

    const list = (group: ProfileAchievementGroup, label: string) => (
        <ListSection key={group.key} label={label} isLoading={false} isRefreshing={isRefreshing}>
            {group.rows.map(row => <AchievementRow key={row.achievement.id} row={row} />)}
        </ListSection>
    );

    return (
        <>
            {groups.map(group => list(group, group.key === "platform" ? `${group.label} · ${unlocked} of ${total}` : group.label))}
            {unplayed.length > 0 && (
                <DisclosureSection level="section" title={`${pluralize(unplayed.length, "game")} you haven’t played`}>
                    {unplayed.map(group => list(group, group.label))}
                </DisclosureSection>
            )}
        </>
    );
}

function AchievementRow({ row }: { row: ProfileAchievementRow }) {
    const { achievement } = row;
    // Unlocked: the day it was, and a chevron where the row goes somewhere. Met
    // but not stored yet (a veteran at launch, §5.3): a tick, with no date to
    // give. Locked: how far along, or a dash for a match achievement, which is
    // earned in one go and has no "3 / 5".
    const status = row.unlocked
        ? (row.unlockedAt ? `${moment(row.unlockedAt).format("D MMM")}${row.href ? " ›" : ""}` : "✓")
        : row.progress ?? "—";
    return (
        <ListRow
            icon={<AchievementIcon achievement={achievement} />}
            title={achievement.title}
            sub={achievement.description}
            action={<span className="ag-list-row-time">{status}</span>}
            muted={!row.unlocked}
            href={row.href}
        />
    );
}
