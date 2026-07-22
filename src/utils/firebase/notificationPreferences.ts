import { User } from '@clerk/nextjs/server';

export type NotificationChannel =
    | 'yourTurn'
    | 'turnNudge'
    | 'playerReaction'
    | 'chat'
    | 'friendInvite'
    | 'gameInvite'
    | 'turnExpiringSoon';

export interface NotificationPreferences {
    /** Master switch. When false, no notification channels should send to this user. */
    enabled: boolean;
    channels: Record<NotificationChannel, boolean>;
}

const DEFAULT_PREFERENCES: NotificationPreferences = {
    enabled: true,
    channels: {
        yourTurn: true,
        turnNudge: true,
        playerReaction: true,
        chat: true,
        friendInvite: true,
        gameInvite: true,
        turnExpiringSoon: true,
    }
};

export const NOTIFICATION_CHANNELS: {
    key: NotificationChannel;
    label: string;
    description: string;
}[] = [
    { key: 'yourTurn', label: "Your turn", description: "When a game becomes your move" },
    { key: 'turnExpiringSoon', label: "Turn expiring", description: "When one of your turns is about to time out" },
    { key: 'turnNudge', label: "Turn nudges", description: "When a player nudges you to take your turn" },
    { key: 'playerReaction', label: "Reactions", description: "When a player reacts to a turn" },
    { key: 'chat', label: "Chat messages", description: "When a player sends you a message" },
    { key: 'gameInvite', label: "Game invites", description: "When someone invites you to a game" },
    { key: 'friendInvite', label: "Friend requests", description: "When someone sends you a friend request" },
];

export function getNotificationPreferences(user: User): NotificationPreferences {
    const metadata = user.privateMetadata?.notificationPreferences;
    if (!metadata || typeof metadata !== 'object') {
        return DEFAULT_PREFERENCES;
    }

    const prefs = metadata as Partial<NotificationPreferences>;
    const channels = prefs.channels ?? {};

    return {
        enabled: prefs.enabled ?? DEFAULT_PREFERENCES.enabled,
        channels: {
            yourTurn: channels.yourTurn ?? DEFAULT_PREFERENCES.channels.yourTurn,
            turnNudge: channels.turnNudge ?? DEFAULT_PREFERENCES.channels.turnNudge,
            playerReaction: channels.playerReaction ?? DEFAULT_PREFERENCES.channels.playerReaction,
            chat: channels.chat ?? DEFAULT_PREFERENCES.channels.chat,
            friendInvite: channels.friendInvite ?? DEFAULT_PREFERENCES.channels.friendInvite,
            gameInvite: channels.gameInvite ?? DEFAULT_PREFERENCES.channels.gameInvite,
            turnExpiringSoon: channels.turnExpiringSoon ?? DEFAULT_PREFERENCES.channels.turnExpiringSoon,
        }
    };
}

export function isChannelEnabled(prefs: NotificationPreferences, channel: NotificationChannel): boolean {
    return prefs.enabled && prefs.channels[channel];
}

export function buildDefaultNotificationPreferences(): NotificationPreferences {
    return structuredClone ? structuredClone(DEFAULT_PREFERENCES) : JSON.parse(JSON.stringify(DEFAULT_PREFERENCES));
}
