/**
 * Where to send someone once they've signed in: the screen that bounced them,
 * or home.
 *
 * `useAuthGuard` puts it there — an authenticated screen a visitor landed on
 * sends them to `/login?redirect_url=<where they were>`, so someone who
 * followed a join link comes back to it with the code still in the box.
 * Clerk's own card reads that parameter itself; this is for the one control on
 * those screens that isn't Clerk's, the native shell's Google button
 * (`useNativeGoogleSignIn`).
 *
 * Only a path on this site is ever followed. The value comes off the URL bar,
 * so anyone can put anything in it, and handing an arbitrary one to the router
 * would turn the sign-in screen into an open redirect — a link that looks like
 * ours, signs you in, and lands you on someone else's page asking for the
 * password you just proved you know.
 *
 * Deciding that by inspecting characters does not work, and the first version
 * of this got it wrong. `//evil.example` is the obvious trap — a
 * protocol-relative URL that reads like a path and leaves the site — but a tab,
 * carriage return or newline is the one that bites: the URL parser strips
 * those from anywhere in the input *before* parsing, so `/\t/evil.example`
 * satisfies any "second character isn't a slash" rule and then resolves to
 * `https://evil.example/` once the tab disappears. Backslashes fold into
 * slashes on the way too.
 *
 * So the question is handed to the same parser that will resolve it, rather
 * than to a rule that has to predict it: resolve against this origin, and
 * accept the result only if it stayed here. That covers the protocol-relative
 * form, backslashes, control characters, an absolute URL elsewhere and a
 * `javascript:` URL (whose origin is `null`) without enumerating any of them.
 */
export function returnPath(): string {
    const requested = new URLSearchParams(window.location.search).get('redirect_url');
    if (!requested) {
        return '/';
    }
    try {
        const resolved = new URL(requested, window.location.origin);
        return resolved.origin === window.location.origin
            ? `${resolved.pathname}${resolved.search}${resolved.hash}`
            : '/';
    } catch {
        // Not a URL at all once resolved. Nowhere to send them but home.
        return '/';
    }
}
