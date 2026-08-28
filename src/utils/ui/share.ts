import { Share } from '@capacitor/share';
import { isNativeShell } from '@/utils/native';

export type ShareResult = 'shared' | 'copied' | 'failed';

/**
 * Hands a link to the user: through the OS share sheet where there is one, the
 * clipboard where there isn't. Shared by every screen that offers a link rather
 * than making someone read out a code — the lobby's join link and a guest's
 * resume link both want the exact same fallback chain, so it lives here once
 * instead of twice.
 *
 * Two sheets, one behind each of the app's two skins: `navigator.share` in a
 * browser, and the Capacitor plugin in the native shell, whose WebView
 * implements no Web Share API at all — so inviting someone from the app used to
 * fall all the way through to "copied", which is a worse way to hand a friend a
 * game than the sheet the phone already has.
 *
 * A dismissed share sheet rejects with `AbortError`: the person changed their
 * mind, which isn't a failure to report, so that's reported back as `'shared'`
 * rather than falling through to the clipboard.
 */
export async function shareOrCopyLink(url: string, text: string): Promise<ShareResult> {
    if (isNativeShell()) {
        try {
            await Share.share({ title: 'Async Games', text, url });
            return 'shared';
        } catch (error) {
            // A shell built before this plugin existed answers `UNIMPLEMENTED`
            // — worth checking, because the app loads the live site, so an old
            // APK runs today's code. That one falls through to the clipboard;
            // anything else is the sheet having been dismissed, which is a
            // decision rather than a failure.
            if ((error as { code?: string })?.code !== 'UNIMPLEMENTED') {
                console.log('Native share sheet closed without sharing', error);
                return 'shared';
            }
        }
    }
    if (navigator.share) {
        try {
            await navigator.share({ title: 'Async Games', text, url });
            return 'shared';
        } catch (error) {
            if ((error as Error)?.name === 'AbortError') return 'shared';
            // Anything else falls through to the clipboard below.
        }
    }
    try {
        await navigator.clipboard.writeText(url);
        return 'copied';
    } catch {
        return 'failed';
    }
}
