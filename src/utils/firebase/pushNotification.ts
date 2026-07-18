import { User } from '@clerk/nextjs/server';
import TimedToken from './TimedToken';
import { getAdminMessaging } from './adminFirebase';

export async function sendPushToUsers(users: User[], title: string, body: string, data: Record<string, string>) {
    const tokens = users
        .flatMap((user) => (user.privateMetadata.notificationTokens as TimedToken[] | undefined) ?? [])
        .filter(token => token);
    if (!tokens.length) {
        return;
    }
    const messaging = getAdminMessaging();
    await messaging.sendEach(tokens.map((token) => {
        return {
            token: token.token,
            notification: {
                title,
                body
            },
            data
        };
    }));
}
