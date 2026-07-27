'use client'
import { FcmTokenComp } from "@/components/FirebaseForeground";
import { useToast } from "@/components/ToastContext";
import Avatar from "@/components/ui/Avatar";
import GameStatsList from "@/components/ui/GameStatsList";
import ProfileIdentity from "@/components/ui/ProfileIdentity";
import RecentFormSection from "@/components/ui/RecentFormSection";
import ReactionPicker from "@/components/ui/ReactionPicker";
import ListSection from "@/components/ui/ListSection";
import { SkeletonRow } from "@/components/ui/Skeleton";
import { IFriendRequestResponse } from "@/utils/mongodb/FriendshipData";
import { formatRelativeTime } from "@/utils/ui/time";
import { usePushEvents, FRIEND_EVENTS } from "@/utils/hooks/usePushEvents";
import { displayName } from "@/utils/ui/players";
import type { IGameStats, IRecentMatch } from "@/app/api/stats/route";
import type { IReceivedReaction } from "@/app/api/reactions/route";
import { useUser, useClerk } from "@clerk/nextjs";
import moment from 'moment';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from "react";

export default function Profile() {
    const pathName = usePathname();
    console.log(`GET ${pathName}`);
    const { user, isLoaded } = useUser();
    const { signOut } = useClerk();
    const router = useRouter();
    const { showToast } = useToast();

    const [friends, setFriends] = useState([] as IFriendRequestResponse[]);
    const [incomingRequests, setIncomingRequests] = useState([] as IFriendRequestResponse[]);
    const [outgoingRequests, setOutgoingRequests] = useState([] as IFriendRequestResponse[]);
    const [inviteUsername, setInviteUsername] = useState("");
    const [isSending, setIsSending] = useState(false);
    const [showAdd, setShowAdd] = useState(false);
    const [isLoadingFriends, setIsLoadingFriends] = useState(true);

    const [recentMatches, setRecentMatches] = useState([] as IRecentMatch[]);
    const [gameStats, setGameStats] = useState([] as IGameStats[]);
    const [isLoadingStats, setIsLoadingStats] = useState(true);

    const [reactions, setReactions] = useState([] as IReceivedReaction[]);
    const [isLoadingReactions, setIsLoadingReactions] = useState(true);

    useEffect(() => {
        if (isLoaded) {
            if (!user) {
                router.push('/login');
                return;
            }
            const unlocked = user?.publicMetadata.unlocked;
            if (unlocked !== true) {
                router.push('/unlockaccess');
            }
            refreshFriends();
            refreshStats();
            refreshReactions();
        }
    }, [isLoaded]);

    usePushEvents(FRIEND_EVENTS, () => refreshFriends(), { refreshOnVisible: true });

    const refreshFriends = () => {
        fetch('/api/friends')
        .then(response => response.json())
        .then(data => {
            if (data && data.success) {
                setFriends(data.friends);
                setIncomingRequests(data.incomingRequests);
                setOutgoingRequests(data.outgoingRequests);
            }
        })
        .catch(error => console.error('Failed to load friends', error))
        .finally(() => setIsLoadingFriends(false));
    }

    const refreshStats = () => {
        fetch('/api/stats')
        .then(response => response.json())
        .then(data => {
            if (data && data.success) {
                setRecentMatches(data.recent);
                setGameStats(data.byGame);
            }
        })
        .catch(error => console.error('Failed to load stats', error))
        .finally(() => setIsLoadingStats(false));
    }

    const refreshReactions = () => {
        fetch('/api/reactions')
        .then(response => response.json())
        .then(data => {
            if (data && data.success) {
                setReactions(data.reactions);
            }
        })
        .catch(error => console.error('Failed to load reactions', error))
        .finally(() => setIsLoadingReactions(false));
    }

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

    return (
        <main>
            <div className="ag-topbar">
                <div className="ag-topbar-title">
                    <a href="/" className="ag-back" aria-label="Back home">←</a>
                    <span className="ag-wordmark">Profile</span>
                </div>
            </div>

            {/* Identity */}
            <ProfileIdentity name={ownDisplayName} username={user?.username} fullName={fullName} />

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
            <RecentFormSection matches={recentMatches} isLoading={isLoadingStats} />

            {/* Per-game stats */}
            <GameStatsList label="Stats by game" stats={gameStats} isLoading={isLoadingStats} />

            {/* Reactions received */}
            <ListSection label="Reactions" isLoading={isLoadingReactions} hasItems={reactions.length > 0}>
                <div className="ag-list">
                    {reactions.map((reaction) => (
                        <div key={reaction.reactionId} className="ag-list-row">
                            <Avatar name={reaction.actorUsername} size={36} />
                            <div className="ag-list-row-main">
                                <div className="ag-list-row-title">
                                    {reaction.actorUsername} · {reaction.gameName}
                                </div>
                                <div className="ag-list-row-sub">
                                    {reaction.eventTitle ?? "your move"} · {formatRelativeTime(reaction.timestamp)}
                                </div>
                            </div>
                            <ReactionPicker
                                reacted={reaction.reaction}
                                reactedLabel={`${reaction.actorUsername} reacted ${reaction.reaction}`}
                            />
                        </div>
                    ))}
                </div>
            </ListSection>

            {/* Friends */}
            <div className="ag-section">
                <div className="ag-section-head">
                    <h2 className="ag-section-label">Friends · {friends.length}</h2>
                    <button type="button" className="ag-section-action" onClick={() => setShowAdd(v => !v)}>
                        {showAdd ? "Close" : "+ Add friend"}
                    </button>
                </div>

                {showAdd && (
                    <form onSubmit={handleInvite} style={{ display: "flex", gap: 8, marginBottom: 12 }}>
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

                {isLoadingFriends && friends.length === 0
                    ? (
                        <div className="ag-list" aria-busy="true">
                            <SkeletonRow />
                            <SkeletonRow />
                            <SkeletonRow />
                        </div>
                    )
                    : friends.length === 0
                    ? <div className="ag-empty">No friends yet. Add someone to start a game together.</div>
                    : (
                        <div className="ag-list">
                            {friends.map((friend) => (
                                <div key={friend.friendshipId} className="ag-list-row">
                                    <a
                                        href={`/profile/${friend.user.userId}`}
                                        style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0, textDecoration: "none", color: "inherit" }}
                                    >
                                        <Avatar name={friend.user.username} size={36} />
                                        <div className="ag-list-row-main">
                                            <div className="ag-list-row-title">{displayName(friend.user)}</div>
                                            <div className="ag-list-row-sub">
                                                {friend.user.lastActionTimestamp
                                                    ? `Last active ${formatRelativeTime(friend.user.lastActionTimestamp)}`
                                                    : "No activity yet"}
                                            </div>
                                        </div>
                                    </a>
                                    <a href="/newgame" className="ag-pill-action">Challenge</a>
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
                        </div>
                    )}
            </div>

            {/* Incoming requests */}
            {incomingRequests.length > 0 && (
                <div className="ag-section">
                    <div className="ag-section-head">
                        <h2 className="ag-section-label">Friend requests · {incomingRequests.length}</h2>
                    </div>
                    <div className="ag-list">
                        {incomingRequests.map((request) => (
                            <div key={request.friendshipId} className="ag-list-row">
                                <Avatar name={request.user.username} size={36} />
                                <div className="ag-list-row-main">
                                    <div className="ag-list-row-title">{request.user.username}</div>
                                    <div className="ag-list-row-sub">wants to be friends · {moment(request.timestamp).fromNow()}</div>
                                </div>
                                <button type="button" className="ag-pill-action ag-pill-action--accept" onClick={() => handleAccept(request.friendshipId)}>Accept</button>
                                <button type="button" className="ag-link-muted" style={{ marginLeft: 8 }} onClick={() => handleRemove(request.friendshipId, 'Friend request declined.')}>Decline</button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Outgoing requests */}
            {outgoingRequests.length > 0 && (
                <div className="ag-section">
                    <div className="ag-section-head">
                        <h2 className="ag-section-label">Sent requests · {outgoingRequests.length}</h2>
                    </div>
                    <div className="ag-list">
                        {outgoingRequests.map((request) => (
                            <div key={request.friendshipId} className="ag-list-row">
                                <Avatar name={request.user.username} size={36} />
                                <div className="ag-list-row-main">
                                    <div className="ag-list-row-title">{request.user.username}</div>
                                    <div className="ag-list-row-sub">waiting to accept · {moment(request.timestamp).fromNow()}</div>
                                </div>
                                <button type="button" className="ag-link-muted" onClick={() => handleRemove(request.friendshipId, 'Friend request cancelled.')}>Cancel</button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Account */}
            <div className="ag-section" style={{ marginTop: 6 }}>
                <div className="ag-list">
                    <a
                        href="/settings"
                        className="ag-list-row"
                        style={{ textDecoration: "none", color: "inherit" }}
                    >
                        <span style={{ flex: 1, font: "700 13px var(--ag-font)" }}>Settings</span>
                        <span style={{ color: "var(--ag-ink-soft)" }}>›</span>
                    </a>
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
