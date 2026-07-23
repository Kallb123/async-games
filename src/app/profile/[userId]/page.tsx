'use client'
import { use } from "react";
import CurrentUserInfo from "@/components/CurrentUserInfo";
import { FcmTokenComp } from "@/components/FirebaseForeground";
import Avatar from "@/components/ui/Avatar";
import GameThumb from "@/components/ui/GameThumb";
import ListSection from "@/components/ui/ListSection";
import Skeleton from "@/components/ui/Skeleton";
import { displayName } from "@/utils/ui/players";
import { GAME_META } from "@/utils/ui/games";
import type { IGameStats, IRecentMatch, MatchOutcome } from "@/app/api/stats/route";
import type { IProfileUser } from "@/app/api/profile/[userId]/route";
import { useUser } from "@clerk/nextjs";
import moment from 'moment';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from "react";

const OUTCOME_LABEL: Record<MatchOutcome, string> = { win: "W", loss: "L", draw: "D" };
const GAME_STAT_THUMB_SIZE = 36;

export default function FriendProfile({ params }: { params: Promise<{ userId: string }> }) {
    const pathName = usePathname();
    console.log(`GET ${pathName}`);
    const { userId } = use(params);
    const { user, isLoaded } = useUser();
    const router = useRouter();

    const [profileUser, setProfileUser] = useState(null as IProfileUser | null);
    const [recentMatches, setRecentMatches] = useState([] as IRecentMatch[]);
    const [gameStats, setGameStats] = useState([] as IGameStats[]);
    const [isLoading, setIsLoading] = useState(true);
    const [forbidden, setForbidden] = useState(false);

    useEffect(() => {
        if (isLoaded) {
            if (!user) {
                router.push('/login');
                return;
            }
            const unlocked = user?.publicMetadata.unlocked;
            if (unlocked !== true) {
                router.push('/unlockaccess');
                return;
            }
            if (userId === user.id) {
                router.replace('/profile');
                return;
            }

            fetch(`/api/profile/${userId}`)
                .then(response => {
                    if (response.status === 403) {
                        setForbidden(true);
                        return null;
                    }
                    return response.json();
                })
                .then(data => {
                    if (data && data.success) {
                        setProfileUser(data.user);
                        setRecentMatches(data.recent);
                        setGameStats(data.byGame);
                    }
                })
                .catch(error => console.error('Failed to load profile', error))
                .finally(() => setIsLoading(false));
        }
    }, [isLoaded, userId]);

    if (forbidden) {
        return (
            <main>
                <div className="ag-topbar">
                    <div className="ag-topbar-title">
                        <a href="/profile" className="ag-back" aria-label="Back to your profile">←</a>
                        <span className="ag-wordmark">Profile</span>
                    </div>
                </div>
                <div className="ag-section">
                    <div className="ag-empty">You can only view profiles of your friends.</div>
                </div>
            </main>
        );
    }

    const fullName = profileUser ? [profileUser.firstName, profileUser.lastName].filter(name => name).join(" ") : "";

    return (
        <main>
            <div className="ag-topbar">
                <div className="ag-topbar-title">
                    <a href="/profile" className="ag-back" aria-label="Back to your profile">←</a>
                    <span className="ag-wordmark">Profile</span>
                </div>
            </div>

            {/* Identity */}
            <div className="ag-section" style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <Avatar name={profileUser?.username ?? profileUser?.firstName} size={64} ring="var(--ag-terracotta)" />
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ font: "800 24px/1.1 var(--ag-font)", color: "var(--ag-ink)" }}>
                        {profileUser ? displayName(profileUser) : (isLoading ? "…" : "")}
                    </div>
                    <div style={{ font: "500 12px var(--ag-font)", color: "var(--ag-ink-soft)" }}>
                        {profileUser?.username ? `@${profileUser.username}` : "No username"}{fullName ? ` · ${fullName}` : ""}
                    </div>
                </div>
            </div>

            {/* Recent form */}
            <div className="ag-section">
                <div className="ag-section-head">
                    <h2 className="ag-section-label">Recent form</h2>
                </div>
                {isLoading
                    ? <div className="ag-chips">
                        {Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} width={26} height={26} radius="50%" />)}
                    </div>
                    : recentMatches.length === 0
                    ? <div className="ag-empty">No finished games yet.</div>
                    : (
                        <div className="ag-chips">
                            {recentMatches.map(match => (
                                <div
                                    key={match.gameId}
                                    className={`ag-result-dot ag-result-dot--${match.outcome}`}
                                    title={`${GAME_META[match.url]?.name ?? match.url} · ${moment(match.endedAt).fromNow()}`}
                                >
                                    {OUTCOME_LABEL[match.outcome]}
                                </div>
                            ))}
                        </div>
                    )}
            </div>

            {/* Match outcome history, by game */}
            <ListSection label="Match history" isLoading={isLoading} hasItems={gameStats.length > 0}>
                <div className="ag-list">
                    {gameStats.map(stats => {
                        const meta = GAME_META[stats.url];
                        return (
                            <div key={stats.url} className="ag-list-row">
                                {meta
                                    ? <GameThumb meta={meta} size={GAME_STAT_THUMB_SIZE} radius={10} />
                                    : <div style={{ width: GAME_STAT_THUMB_SIZE, height: GAME_STAT_THUMB_SIZE, flex: "none" }} />}
                                <div className="ag-list-row-main">
                                    <div className="ag-list-row-title">{meta?.name ?? stats.url}</div>
                                    <div className="ag-list-row-sub">{stats.total} match{stats.total === 1 ? "" : "es"}</div>
                                </div>
                                <div style={{ font: "800 12.5px var(--ag-font)", whiteSpace: "nowrap" }}>
                                    <span className="ag-outcome-text--win">{stats.wins}W</span>
                                    {" · "}
                                    <span className="ag-outcome-text--loss">{stats.losses}L</span>
                                    {" · "}
                                    <span className="ag-outcome-text--draw">{stats.draws}D</span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </ListSection>

            <div className="ag-footer"><CurrentUserInfo /></div>
            <FcmTokenComp />
        </main>
    );
}
