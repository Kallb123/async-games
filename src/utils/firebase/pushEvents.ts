'use client'

/**
 * Re-dispatches an arriving push as the `window` event its `data.event` names,
 * which is how a screen learns the turn has moved without a socket (the
 * listening half is `usePushEvents`).
 *
 * Both delivery paths land here: `FcmTokenComp`'s web `onMessage`, and the
 * native shell's `pushNotificationReceived`. They arrive in different shapes
 * from different SDKs, so the one thing they share — turning a payload into an
 * event name — is shared rather than written twice.
 *
 * A push with no `event` field displays its notification and changes nothing on
 * screen, which is a perfectly good push; there is just nothing to dispatch.
 */
export function dispatchPushEvent(data: Record<string, unknown> | undefined): void {
    const event = data?.event;
    if (typeof event !== 'string' || !event) {
        return;
    }
    window.dispatchEvent(new CustomEvent(event));
}
