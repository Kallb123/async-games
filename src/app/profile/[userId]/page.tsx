'use client'
import { use } from "react";
import { FcmTokenComp } from "@/components/FirebaseForeground";
import AchievementsSection from "@/components/ui/AchievementsSection";
import GameStatsList from "@/components/ui/GameStatsList";
import BackLink from "@/components/ui/BackLink";
import Tabs, { TabPanel } from "@/components/ui/Tabs";
import ProfileIdentity from "@/components/ui/ProfileIdentity";
import RecentFormSection from "@/components/ui/RecentFormSection";
import type { IAchievementUnlock, IGameStats, IRecentMatch } from "@/app/api/stats/route";
import type { IProfileUser } from "@/app/api/profile/[userId]/route";
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from "react";
import { useAuthGuard } from "@/utils/hooks/useAuthGuard";
import { useRefreshableData } from "@/utils/hooks/useRefreshableData";
import { profileHeading } from "@/utils/ui/players";

interface IProfileResponse {
    success: boolean;
    user: IProfileUser;
    recent: IRecentMatch[];
    byGame: IGameStats[];
    achievements?: IAchievementUnlock[];
}

export default function FriendProfile({ params }: { params: Promise<{ userId: string }> }) {
    const pathName = usePathname();
    console.log(`GET ${pathName}`);
    const { userId } = use(params);
    const { user } = useAuthGuard();
    const router = useRouter();
    const [tab, setTab] = useState<"results" | "achievements">("results");

    const { data, isLoading, isRefreshing, status } = useRefreshableData<IProfileResponse>(`/api/profile/${userId}`);

    // Your own userId in the URL is just the profile screen — send them there.
    useEffect(() => {
        if (user && userId === user.id) {
            router.replace('/profile');
        }
    }, [user, userId, router]);

    const profileUser = data?.user ?? null;
    const recentMatches = data?.recent ?? [];
    const gameStats = data?.byGame ?? [];
    const forbidden = status === 403;

    // Null name until their profile arrives — the header shows placeholders
    // rather than an ellipsis standing in for a name.
    const heading = profileHeading(profileUser, "Player");

    return (
        <main>
            <div className="ag-topbar">
                <div className="ag-topbar-title">
                    <BackLink href="/profile" label="Back to your profile" />
                    <span className="ag-wordmark">Profile</span>
                </div>
            </div>

            {forbidden
                ? (
                    <div className="ag-section">
                        <div className="ag-empty">You can only view profiles of your friends.</div>
                    </div>
                )
                : (
                    <>
                        {/* Identity */}
                        <ProfileIdentity {...heading} imageUrl={profileUser?.imageUrl} />

                        <Tabs
                            label="Profile sections"
                            value={tab}
                            onChange={setTab}
                            tabs={[
                                { id: "results", label: "Results" },
                                { id: "achievements", label: "Achievements" },
                            ]}
                        />

                        <TabPanel id="results" active={tab}>
                            {/* Recent form */}
                            <RecentFormSection matches={recentMatches} isLoading={isLoading} isRefreshing={isRefreshing} highlightShared />

                            {/* Match outcome history, by game */}
                            <GameStatsList label="Match history" stats={gameStats} isLoading={isLoading} isRefreshing={isRefreshing} />
                        </TabPanel>

                        <TabPanel id="achievements" active={tab}>
                            {/* Their achievements, read-only */}
                            <AchievementsSection unlocks={data?.achievements ?? []} byGame={gameStats} isLoading={isLoading} isRefreshing={isRefreshing} />
                        </TabPanel>
                        <FcmTokenComp />
                    </>
                )}
        </main>
    );
}
