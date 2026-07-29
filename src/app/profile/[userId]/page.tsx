'use client'
import { use } from "react";
import { FcmTokenComp } from "@/components/FirebaseForeground";
import GameStatsList from "@/components/ui/GameStatsList";
import ProfileIdentity from "@/components/ui/ProfileIdentity";
import RecentFormSection from "@/components/ui/RecentFormSection";
import type { IGameStats, IRecentMatch } from "@/app/api/stats/route";
import type { IProfileUser } from "@/app/api/profile/[userId]/route";
import { useUser } from "@clerk/nextjs";
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from "react";

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

    const fullName = profileUser ? [profileUser.firstName, profileUser.lastName].filter(name => name).join(" ") : "";
    const friendDisplayName = profileUser?.firstName || profileUser?.username || (isLoading ? "…" : "");

    return (
        <main>
            <div className="ag-topbar">
                <div className="ag-topbar-title">
                    <a href="/profile" className="ag-back" aria-label="Back to your profile">←</a>
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
                        <ProfileIdentity name={friendDisplayName} username={profileUser?.username} fullName={fullName} />

                        {/* Recent form */}
                        <RecentFormSection matches={recentMatches} isLoading={isLoading} highlightShared />

                        {/* Match outcome history, by game */}
                        <GameStatsList label="Match history" stats={gameStats} isLoading={isLoading} />
                        <FcmTokenComp />
                    </>
                )}
        </main>
    );
}
