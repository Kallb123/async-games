'use client'
import CurrentUserInfo from "@/components/CurrentUserInfo";
import { FcmTokenComp } from "@/components/FirebaseForeground";
import { useToast } from "@/components/ToastContext";
import Avatar from "@/components/ui/Avatar";
import OptionToggleRow from "@/components/ui/OptionToggleRow";
import { SkeletonRow } from "@/components/ui/Skeleton";
import { IFriendRequestResponse, IFriendUser } from "@/utils/mongodb/FriendshipData";
import { formatRelativeTime } from "@/utils/ui/time";
import useFcmToken from "@/utils/hooks/useFcmToken";
import { usePushEvents, FRIEND_EVENTS } from "@/utils/hooks/usePushEvents";
import { NotificationChannel, NOTIFICATION_CHANNELS } from "@/utils/firebase/notificationPreferences";
import { useUser, useClerk } from "@clerk/nextjs";
import moment from 'moment';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from "react";

interface NotificationPreferencesState {
    enabled: boolean;
    channels: Record<NotificationChannel, boolean>;
}

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
    const { notificationPermissionStatus } = useFcmToken();

    const [friends, setFriends] = useState([] as IFriendRequestResponse[]);
    const [incomingRequests, setIncomingRequests] = useState([] as IFriendRequestResponse[]);
    const [outgoingRequests, setOutgoingRequests] = useState([] as IFriendRequestResponse[]);
    const [inviteUsername, setInviteUsername] = useState("");
    const [isSending, setIsSending] = useState(false);
    const [showAdd, setShowAdd] = useState(false);
    const [isLoadingFriends, setIsLoadingFriends] = useState(true);

    const [prefs, setPrefs] = useState<NotificationPreferencesState | null>(null);
    const [isSavingPrefs, setIsSavingPrefs] = useState(false);
    const [hasPrefPermission, setHasPrefPermission] = useState(false);

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
            refreshPreferences();
        }
    }, [isLoaded]);

    useEffect(() => {
        if (typeof window !== 'undefined' && 'Notification' in window) {
            setHasPrefPermission(Notification.permission === 'granted');
        }
    }, []);

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

    const refreshPreferences = () => {
        fetch('/api/notificationpreferences')
            .then(response => response.json())
            .then(data => {
                if (data && data.preferences) {
                    setPrefs(data.preferences);
                }
            })
            .catch(error => console.error('Failed to load notification preferences', error));
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
    const notificationsOn = notificationPermissionStatus === 'granted';

    const enableNotifications = () => {
        if (typeof window !== 'undefined' && 'Notification' in window) {
            Notification.requestPermission().then(() => window.location.reload());
        }
    };

    const updatePreferences = async (patch: { enabled?: boolean; channels?: Partial<Record<NotificationChannel, boolean>> }) => {
        if (!prefs || isSavingPrefs) return;
        setIsSavingPrefs(true);
        const next: NotificationPreferencesState = {
            enabled: patch.enabled !== undefined ? patch.enabled : prefs.enabled,
            channels: { ...prefs.channels, ...(patch.channels ?? {}) }
        };
        setPrefs(next);
        try {
            const response = await fetch('/api/notificationpreferences', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(next)
            });
            if (!response.ok) throw new Error('Failed to save preferences');
            const data = await response.json();
            if (data.preferences) {
                setPrefs(data.preferences);
            }
        } catch (error) {
            console.error(error);
            showToast('Failed to save notification preferences.', 'danger');
            refreshPreferences();
        } finally {
            setIsSavingPrefs(false);
        }
    };

    const toggleMaster = () => {
        if (!hasPrefPermission) {
            enableNotifications();
            return;
        }
        updatePreferences({ enabled: !prefs?.enabled });
    };

    const toggleChannel = (channel: NotificationChannel) => {
        if (!prefs) return;
        updatePreferences({ channels: { [channel]: !prefs.channels[channel] } });
    };

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

            {/* Notifications */}
            <div className="ag-section">
                <div className="ag-section-head">
                    <h2 className="ag-section-label">Notifications</h2>
                </div>

                {!hasPrefPermission && (
                    <div className="ag-cta" style={{ background: "oklch(0.35 0.04 45)", color: "var(--ag-on-dark)" }}>
                        <div className="ag-cta-main">
                            <div className="ag-cta-title">Turn notifications</div>
                            <div className="ag-cta-sub">Enable push so we can nudge you when it&apos;s your move.</div>
                        </div>
                        <button type="button" className="ag-btn ag-btn--light" onClick={enableNotifications}>Enable</button>
                    </div>
                )}

                {hasPrefPermission && (
                    <div className="ag-list">
                        <OptionToggleRow
                            title="All notifications"
                            description="Pause everything, or choose per channel below"
                            on={prefs?.enabled ?? false}
                            onToggle={toggleMaster}
                            disabled={isSavingPrefs}
                            ariaLabel="Toggle all notifications"
                        />
                    </div>
                )}

                {hasPrefPermission && prefs && !prefs.enabled && (
                    <p className="ag-disabled-hint">Notifications are paused. Channel settings will take effect again once you turn notifications back on.</p>
                )}

                {hasPrefPermission && prefs?.enabled && (
                    <div className="ag-list" style={{ marginTop: 12 }}>
                        {NOTIFICATION_CHANNELS.map((channel) => (
                            <OptionToggleRow
                                key={channel.key}
                                title={channel.label}
                                description={channel.description}
                                on={prefs.channels[channel.key]}
                                onToggle={() => toggleChannel(channel.key)}
                                disabled={isSavingPrefs}
                                ariaLabel={`Toggle ${channel.label} notifications`}
                            />
                        ))}
                    </div>
                )}
            </div>

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
                <button
                    type="button"
                    className="ag-card"
                    onClick={() => { signOut().then(() => router.push('/login')); }}
                    style={{
                        width: "100%", display: "flex", alignItems: "center",
                        padding: "14px 16px", font: "700 13px var(--ag-font)",
                        color: "var(--ag-ink)", cursor: "pointer", textAlign: "left",
                    }}
                >
                    <span style={{ flex: 1 }}>Sign out</span>
                    <span style={{ color: "var(--ag-ink-soft)" }}>›</span>
                </button>
            </div>

            <div className="ag-footer"><CurrentUserInfo /></div>
            <FcmTokenComp />
        </main>
    );
}
