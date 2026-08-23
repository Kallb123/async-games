export type ShareResult = 'shared' | 'copied' | 'failed';

/**
 * Hands a link to the user: through `navigator.share` where the browser has
 * one, the clipboard where it doesn't. Shared by every screen that offers a
 * link rather than making someone read out a code — the lobby's join link and
 * a guest's resume link both want the exact same fallback chain, so it lives
 * here once instead of twice.
 *
 * A dismissed share sheet rejects with `AbortError`: the person changed their
 * mind, which isn't a failure to report, so that's reported back as `'shared'`
 * rather than falling through to the clipboard.
 */
export async function shareOrCopyLink(url: string, text: string): Promise<ShareResult> {
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
