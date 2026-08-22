'use client'
import { use } from "react";
import { FcmTokenComp } from "@/components/FirebaseForeground";
import GameStatsList from "@/components/ui/GameStatsList";
import BackLink from "@/components/ui/BackLink";
import ProfileIdentity from "@/components/ui/ProfileIdentity";
import RecentFormSection from "@/components/ui/RecentFormSection";
import type { IGameStats, IRecentMatch } from "@/app/api/stats/route";
import type { IProfileUser } from "@/app/api/profile/[userId]/route";
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from "react";
import { useAuthGuard } from "@/utils/hooks/useAuthGuard";
import { useRefreshableData } from "@/utils/hooks/useRefreshableData";

interface IProfileResponse {
    success: boolean;
    user: IProfileUser;
    recent: IRecentMatch[];
    byGame: IGameStats[];
}

export default function FriendProfile({ params }: { params: Promise<{ userId: string }> }) {
    const pathName = usePathname();
    console.log(`GET ${pathName}`);
    const { userId } = use(params);
    const { user } = useAuthGuard();
    const router = useRouter();

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

    const fullName = profileUser ? [profileUser.firstName, profileUser.lastName].filter(name => name).join(" ") : "";
    const friendDisplayName = profileUser?.firstName || profileUser?.username || (isLoading ? "…" : "");

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
                        <ProfileIdentity name={friendDisplayName} username={profileUser?.username} imageUrl={profileUser?.imageUrl} fullName={fullName} />

                        {/* Recent form */}
                        <RecentFormSection matches={recentMatches} isLoading={isLoading} isRefreshing={isRefreshing} highlightShared />

                        {/* Match outcome history, by game */}
                        <GameStatsList label="Match history" stats={gameStats} isLoading={isLoading} isRefreshing={isRefreshing} />
                        <FcmTokenComp />
                    </>
                )}
        </main>
    );
}
