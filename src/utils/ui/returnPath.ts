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
 * "Starts with a slash" isn't enough on its own. `//evil.example` is a
 * protocol-relative URL: it reads like a path and leaves the site. Backslashes
 * are the same trick against parsers that fold `\` into `/`, which browsers
 * do in URLs, so neither character is allowed in the first two positions.
 * Everything that survives is a path, and a path can only be ours.
 */
export function returnPath(): string {
    const requested = new URLSearchParams(window.location.search).get('redirect_url');
    if (!requested) {
        return '/';
    }
    const [first, second] = requested;
    const isSeparator = (character: string) => character === '/' || character === '\\';
    return first === '/' && !isSeparator(second) ? requested : '/';
}
