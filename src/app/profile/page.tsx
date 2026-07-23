'use client'
import CurrentUserInfo from "@/components/CurrentUserInfo";
import { FcmTokenComp } from "@/components/FirebaseForeground";
import { useToast } from "@/components/ToastContext";
import Avatar from "@/components/ui/Avatar";
import GameThumb from "@/components/ui/GameThumb";
import Skeleton, { SkeletonRow } from "@/components/ui/Skeleton";
import { IFriendRequestResponse, IFriendUser } from "@/utils/mongodb/FriendshipData";
import { formatRelativeTime } from "@/utils/ui/time";
import { usePushEvents, FRIEND_EVENTS } from "@/utils/hooks/usePushEvents";
import { GAME_META } from "@/utils/ui/games";
import type { IGameStats, IRecentMatch, MatchOutcome } from "@/app/api/stats/route";
import { useUser, useClerk } from "@clerk/nextjs";
import moment from 'moment';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from "react";

const OUTCOME_LABEL: Record<MatchOutcome, string> = { win: "W", loss: "L", draw: "D" };

function friendDisplayName(user: IFriendUser) {
    const fullName = [user.firstName, user.lastName].filter(name => name).join(" ");
    if (fullName) return `${fullName} (${user.username})`;
    return `${user.username}`;
}

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
    const displayName = user?.firstName || user?.username || "You";

    return (
        <main>
            <div className="ag-topbar">
                <div className="ag-topbar-title">
                    <a href="/" className="ag-back" aria-label="Back home">←</a>
                    <span className="ag-wordmark">Profile</span>
                </div>
            </div>

            {/* Identity */}
            <div className="ag-section" style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <Avatar name={displayName} size={64} ring="var(--ag-terracotta)" />
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ font: "800 24px/1.1 var(--ag-font)", color: "var(--ag-ink)" }}>{displayName}</div>
                    <div style={{ font: "500 12px var(--ag-font)", color: "var(--ag-ink-soft)" }}>
                        {user?.username ? `@${user.username}` : "No username"}{fullName ? ` · ${fullName}` : ""}
                    </div>
                </div>
            </div>

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
            <div className="ag-section">
                <div className="ag-section-head">
                    <h2 className="ag-section-label">Recent form</h2>
                </div>
                {isLoadingStats
                    ? <div className="ag-result-strip">
                        {Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} width={26} height={26} radius="50%" />)}
                    </div>
                    : recentMatches.length === 0
                    ? <div className="ag-empty">No finished games yet.</div>
                    : (
                        <div className="ag-result-strip">
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

            {/* Per-game stats */}
            {(isLoadingStats || gameStats.length > 0) && (
                <div className="ag-section">
                    <div className="ag-section-head">
                        <h2 className="ag-section-label">Stats by game</h2>
                    </div>
                    {isLoadingStats
                        ? <div className="ag-list" aria-busy="true">
                            <SkeletonRow />
                            <SkeletonRow />
                        </div>
                        : (
                            <div className="ag-list">
                                {gameStats.map(stats => {
                                    const meta = GAME_META[stats.url];
                                    return (
                                        <div key={stats.url} className="ag-list-row">
                                            {meta
                                                ? <GameThumb meta={meta} size={36} radius={10} />
                                                : <div style={{ width: 36, height: 36, flex: "none" }} />}
                                            <div className="ag-list-row-main">
                                                <div className="ag-list-row-title">{meta?.name ?? stats.url}</div>
                                                <div className="ag-list-row-sub">{stats.total} match{stats.total === 1 ? "" : "es"}</div>
                                            </div>
                                            <div style={{ font: "800 12.5px var(--ag-font)", whiteSpace: "nowrap" }}>
                                                <span style={{ color: "var(--ag-green)" }}>{stats.wins}W</span>
                                                {" · "}
                                                <span style={{ color: "var(--ag-terracotta)" }}>{stats.losses}L</span>
                                                {" · "}
                                                <span style={{ color: "var(--ag-gold)" }}>{stats.draws}D</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                </div>
            )}

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
                                    <Avatar name={friend.user.username} size={36} />
                                    <div className="ag-list-row-main">
                                        <div className="ag-list-row-title">{friendDisplayName(friend.user)}</div>
                                        <div className="ag-list-row-sub">
                                            {friend.user.lastActionTimestamp
                                                ? `Last active ${formatRelativeTime(friend.user.lastActionTimestamp)}`
                                                : "No activity yet"}
                                        </div>
                                    </div>
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
                        className="ag-list-row"
                        onClick={() => { signOut().then(() => router.push('/login')); }}
                        style={{
                            width: "100%", background: "none", border: "none",
                            borderTop: "1.5px dashed var(--ag-line-dashed)", padding: "13px 0",
                            font: "700 13px var(--ag-font)", color: "var(--ag-ink)",
                            cursor: "pointer", textAlign: "left",
                        }}
                    >
                        <span style={{ flex: 1 }}>Sign out</span>
                        <span style={{ color: "var(--ag-ink-soft)" }}>›</span>
                    </button>
                </div>
            </div>

            <div className="ag-footer"><CurrentUserInfo /></div>
            <FcmTokenComp />
        </main>
    );
}
