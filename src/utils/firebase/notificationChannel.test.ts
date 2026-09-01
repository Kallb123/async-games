// android/app/src/main/AndroidManifest.xml is a static file: FCM reads its
// default_notification_channel_id meta-data as the fallback channel for a
// push that somehow arrives with no channelId set. XML can't import
// ANDROID_NOTIFICATION_CHANNEL_ID, so the value is copied into it by hand —
// the same problem serviceWorker.test.ts holds firebase-messaging-sw.js to,
// held here the same way, so the two can't drift apart silently.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { ANDROID_NOTIFICATION_CHANNEL_ID } from './notificationChannel';

const manifest = readFileSync(
    join(process.cwd(), 'android/app/src/main/AndroidManifest.xml'),
    'utf8'
);

function defaultChannelId(): string | undefined {
    return manifest.match(/default_notification_channel_id"[^>]*android:value="([^"]+)"/)?.[1];
}

describe('the Android manifest', () => {
    it('names a fallback notification channel', () => {
        expect(defaultChannelId()).toBeTruthy();
    });

    it('names the same channel every push is sent on', () => {
        expect(defaultChannelId()).toBe(ANDROID_NOTIFICATION_CHANNEL_ID);
    });
});
