/**
 * The Android notification channel every push lands on, foreground and
 * background alike. `pushNotification.ts` (server) stamps this onto
 * `android.notification.channelId` so a backgrounded or killed app's own tray
 * display uses it; `nativePush.ts` (native shell) creates the channel and
 * schedules the foreground fallback on it. One constant shared by both is
 * what keeps a player looking at one channel in Android's notification
 * settings rather than two, however the push reached them.
 */
export const ANDROID_NOTIFICATION_CHANNEL_ID = 'game_updates';
