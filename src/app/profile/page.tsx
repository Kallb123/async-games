'use client'
import { FcmTokenComp } from "@/components/FirebaseForeground";
import { useToast } from "@/components/ToastContext";
import Avatar from "@/components/ui/Avatar";
import Link from "next/link";
import BackLink from "@/components/ui/BackLink";
import GameStatsList from "@/components/ui/GameStatsList";
import ProfileIdentity from "@/components/ui/ProfileIdentity";
import RecentFormSection from "@/components/ui/RecentFormSection";
import ReactionPicker from "@/components/ui/ReactionPicker";
import ListSection from "@/components/ui/ListSection";
import { IFriendRequestResponse } from "@/utils/mongodb/FriendshipData";
import { formatRelativeTime } from "@/utils/ui/time";
import { FRIEND_EVENTS } from "@/utils/hooks/usePushEvents";
import { useRefreshableData } from "@/utils/hooks/useRefreshableData";
import { useNowToTheMinute } from "@/utils/hooks/useNow";
import { useAuthGuard } from "@/utils/hooks/useAuthGuard";
import { useProfilePicture } from "@/utils/hooks/useProfilePicture";
import { displayName, isGuest } from "@/utils/ui/players";
import { profileImageUrl } from "@/utils/ui/avatar";
import type { IGameStats, IRecentMatch } from "@/app/api/stats/route";
import type { IReceivedReaction } from "@/app/api/reactions/route";
import { useClerk } from "@clerk/nextjs";
import moment from 'moment';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from "react";

interface IFriendsResponse {
    friends: IFriendRequestResponse[];
    incomingRequests: IFriendRequestResponse[];
    outgoingRequests: IFriendRequestResponse[];
}

export default function Profile() {
    const pathName = usePathname();
    console.log(`GET ${pathName}`);
    const { user } = useAuthGuard();
    const { signOut } = useClerk();
    const router = useRouter();
    const { showToast } = useToast();
    const now = useNowToTheMinute();
    const picture = useProfilePicture();

    const [inviteUsername, setInviteUsername] = useState("");
    const [isSending, setIsSending] = useState(false);
    const [showAdd, setShowAdd] = useState(false);

    const friendsData = useRefreshableData<IFriendsResponse>('/api/friends', FRIEND_EVENTS);
    const statsData = useRefreshableData<{ recent: IRecentMatch[]; byGame: IGameStats[] }>('/api/stats');
    const reactionsData = useRefreshableData<{ reactions: IReceivedReaction[] }>('/api/reactions');

    const friends = friendsData.data?.friends ?? [];
    const incomingRequests = friendsData.data?.incomingRequests ?? [];
    const outgoingRequests = friendsData.data?.outgoingRequests ?? [];
    const recentMatches = statsData.data?.recent ?? [];
    const gameStats = statsData.data?.byGame ?? [];
    const reactions = reactionsData.data?.reactions ?? [];

    const refreshFriends = friendsData.refresh;

    const handleInvite = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const username = inviteUsername.trim();
        if (!username) return;

        setIsSending(true);
        try {
            const response = await fetch('/api/friends/invite', {
                method: "POST",
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username })
            });
            if (!response.ok) {
                showToast(response.statusText || 'Failed to send the friend request.', 'danger');
                return;
            }
            showToast(`Friend request sent to ${username}!`, 'success', 'Friend Request');
            setInviteUsername("");
            setShowAdd(false);
            refreshFriends();
        } catch (error) {
            console.error(error);
            showToast('Failed to send the friend request. Please try again.', 'danger');
        } finally {
            setIsSending(false);
        }
    }

    const handleAccept = (friendshipId: string) => {
        fetch('/api/friends/accept', {
            method: "POST",
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ friendshipId })
        })
        .then(response => {
            if (!response.ok) throw new Error('Failed to accept friend request');
            showToast('Friend request accepted!', 'success', 'New Friend');
            refreshFriends();
        })
        .catch(() => showToast('Failed to accept the friend request. Please try again.', 'danger'));
    }

    const handleRemove = (friendshipId: string, successMessage: string) => {
        fetch('/api/friends/remove', {
            method: "POST",
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ friendshipId })
        })
        .then(response => {
            if (!response.ok) throw new Error('Failed to remove friendship');
            showToast(successMessage, 'success');
            refreshFriends();
        })
        .catch(() => showToast('Something went wrong. Please try again.', 'danger'));
    }

    const fullName = [user?.firstName, user?.lastName].filter(name => name).join(" ");
    const ownDisplayName = user?.firstName || user?.username || "You";
    const guest = !!user && isGuest(user);

    return (
        <main>
            <div className="ag-topbar">
                <div className="ag-topbar-title">
                    <BackLink href="/" label="Back home" />
                    <span className="ag-wordmark">Profile</span>
                </div>
            </div>

            {/* Identity — your own avatar is the way in to changing your picture */}
            <ProfileIdentity
                name={ownDisplayName}
                username={user?.username}
                imageUrl={profileImageUrl(user)}
                fullName={fullName}
                onAvatarClick={picture.openPicker}
                avatarBusy={picture.isSaving}
                action={picture.hasPicture && (
                    <button
                        type="button"
                        className="ag-link-muted"
                        onClick={picture.removePicture}
                        disabled={picture.isSaving}
                    >
                        Remove photo
                    </button>
                )}
            />
            {picture.fileInput}

            {/* Honest stats */}
            <div className="ag-section">
                <div className="ag-stat-row">
                    <div className="ag-stat">
                        <div className="ag-stat-num">{friends.length}</div>
                        <div className="ag-stat-label">friends</div>
                    </div>
                    <div className="ag-stat">
                        <div className="ag-stat-num" style={{ color: incomingRequests.length ? "var(--ag-terracotta)" : undefined }}>{incomingRequests.length}</div>
                        <div className="ag-stat-label">requests</div>
                    </div>
                    <div className="ag-stat">
                        <div className="ag-stat-num">{outgoingRequests.length}</div>
                        <div className="ag-stat-label">pending</div>
                    </div>
                </div>
            </div>

            {/* Recent match history */}
            <RecentFormSection matches={recentMatches} isLoading={statsData.isLoading} isRefreshing={statsData.isRefreshing} viewAllHref="/games/completed" />

            {/* Per-game stats */}
            <GameStatsList label="Stats by game" stats={gameStats} isLoading={statsData.isLoading} isRefreshing={statsData.isRefreshing} />

            {/* Reactions received */}
            <ListSection
                label="Reactions"
                isLoading={reactionsData.isLoading}
                isRefreshing={reactionsData.isRefreshing}
            >
                {reactions.map((reaction) => (
                    <div key={reaction.reactionId} className="ag-list-row">
                        <Avatar name={reaction.actorUsername} imageUrl={reaction.actorImageUrl} size={36} />
                        <div className="ag-list-row-main">
                            <div className="ag-list-row-title">
                                {reaction.actorUsername} · {reaction.gameName}
                            </div>
                            <div className="ag-list-row-sub">
                                {reaction.eventTitle ?? "your move"}{now !== null && ` · ${formatRelativeTime(reaction.timestamp, now)}`}
                            </div>
                        </div>
                        <ReactionPicker
                            reacted={reaction.reaction}
                            reactedLabel={`${reaction.actorUsername} reacted ${reaction.reaction}`}
                        />
                    </div>
                ))}
            </ListSection>

            {/* Friends */}
            <ListSection
                label="Friends"
                showCount
                isLoading={friendsData.isLoading}
                isRefreshing={friendsData.isRefreshing}
                skeletonRows={3}
                action={
                    <button type="button" className="ag-section-action" onClick={() => setShowAdd(v => !v)}>
                        {showAdd ? "Close" : "+ Add friend"}
                    </button>
                }
                empty={<div className="ag-empty">No friends yet. Add someone to start a game together.</div>}
                // Not `hint` — that prop only renders once the list is
                // non-empty, and a guest should see this before they've
                // added their first friend, not just after.
                beforeList={(guest || showAdd) && (
                    <>
                        {guest && (
                            <p className="ag-hint" style={{ marginBottom: showAdd ? 12 : 0 }}>
                                You&apos;re playing as a guest — <Link href="/settings">sign up</Link> to keep your friends long term.
                            </p>
                        )}
                        {showAdd && (
                            <form onSubmit={handleInvite} style={{ display: "flex", gap: 8 }}>
                                <input
                                    className="ag-input"
                                    type="text"
                                    value={inviteUsername}
                                    onChange={(e) => setInviteUsername(e.target.value)}
                                    placeholder="Their username"
                                />
                                <button type="submit" className="ag-btn ag-btn--dark" disabled={isSending || inviteUsername.trim() === ""}>Send</button>
                            </form>
                        )}
                    </>
                )}
            >
                {friends.map((friend) => (
                    <div key={friend.friendshipId} className="ag-list-row">
                        <Link
                            href={`/profile/${friend.user.userId}`}
                            style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0, textDecoration: "none", color: "inherit" }}
                        >
                            <Avatar name={friend.user.username} imageUrl={friend.user.imageUrl} size={36} />
                            <div className="ag-list-row-main">
                                <div className="ag-list-row-title">{displayName(friend.user)}</div>
                                <div className="ag-list-row-sub">
                                    {friend.user.lastActionTimestamp
                                        ? now !== null && `Last active ${formatRelativeTime(friend.user.lastActionTimestamp, now)}`
                                        : "No activity yet"}
                                </div>
                            </div>
                        </Link>
                        <Link href="/newgame" className="ag-pill-action">Challenge</Link>
                        <button
                            type="button"
                            className="ag-link-muted"
                            style={{ marginLeft: 8 }}
                            onClick={() => handleRemove(friend.friendshipId, 'Friend removed.')}
                        >
                            Remove
                        </button>
                    </div>
                ))}
            </ListSection>

            {/* Incoming requests */}
            <ListSection
                label="Friend requests"
                showCount
                isLoading={false}
                isRefreshing={friendsData.isRefreshing}
            >
                {incomingRequests.map((request) => (
                    <div key={request.friendshipId} className="ag-list-row">
                        <Avatar name={request.user.username} imageUrl={request.user.imageUrl} size={36} />
                        <div className="ag-list-row-main">
                            <div className="ag-list-row-title">{request.user.username}</div>
                            <div className="ag-list-row-sub">wants to be friends · {moment(request.timestamp).fromNow()}</div>
                        </div>
                        <button type="button" className="ag-pill-action ag-pill-action--accept" onClick={() => handleAccept(request.friendshipId)}>Accept</button>
                        <button type="button" className="ag-link-muted" style={{ marginLeft: 8 }} onClick={() => handleRemove(request.friendshipId, 'Friend request declined.')}>Decline</button>
                    </div>
                ))}
            </ListSection>

            {/* Outgoing requests */}
            <ListSection
                label="Sent requests"
                showCount
                isLoading={false}
                isRefreshing={friendsData.isRefreshing}
            >
                {outgoingRequests.map((request) => (
                    <div key={request.friendshipId} className="ag-list-row">
                        <Avatar name={request.user.username} imageUrl={request.user.imageUrl} size={36} />
                        <div className="ag-list-row-main">
                            <div className="ag-list-row-title">{request.user.username}</div>
                            <div className="ag-list-row-sub">waiting to accept · {moment(request.timestamp).fromNow()}</div>
                        </div>
                        <button type="button" className="ag-link-muted" onClick={() => handleRemove(request.friendshipId, 'Friend request cancelled.')}>Cancel</button>
                    </div>
                ))}
            </ListSection>

            {/* Account */}
            <div className="ag-section" style={{ marginTop: 6 }}>
                <div className="ag-list">
                    <Link
                        href="/settings"
                        className="ag-list-row"
                        style={{ textDecoration: "none", color: "inherit" }}
                    >
                        <span style={{ flex: 1, font: "700 13px var(--ag-font)" }}>Settings</span>
                        <span style={{ color: "var(--ag-ink-soft)" }}>›</span>
                    </Link>
                    <button
                        type="button"
                        className="ag-list-row ag-list-row--button"
                        onClick={() => { signOut().then(() => router.push('/login')); }}
                        style={{
                            borderTop: "1.5px dashed var(--ag-line-dashed)",
                            font: "700 13px var(--ag-font)", color: "var(--ag-ink)",
                        }}
                    >
                        <span style={{ flex: 1 }}>Sign out</span>
                        <span style={{ color: "var(--ag-ink-soft)" }}>›</span>
                    </button>
                </div>
            </div>

            <FcmTokenComp />
        </main>
    );
}
