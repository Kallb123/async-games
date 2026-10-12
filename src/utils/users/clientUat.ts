// Clerk's own "someone is signed in on this browser" cookie: the time of the
// last sign-in, or "0" once they have signed out. It is set by Clerk's script
// on the client and has nothing to do with whether the session token is still
// fresh, which is why it can be read on a request that never went through
// Clerk's middleware — and, being a plain cookie the browser's own script can
// see, from JavaScript as well. A deployment with several Clerk instances on one
// domain gets a copy per instance, named `__client_uat_<suffix>` where the
// suffix is derived from the publishable key (`getSuffixedCookieName` in
// @clerk/shared).
//
// Browser-safe on purpose (no `next/headers`): the server's hint
// (`signedInHint.ts`), the home page's client read and the inline script that
// runs before it paints all apply the one rule below.
const CLIENT_UAT = "__client_uat";

/** The cookies that can carry Clerk's client-updated-at stamp, whatever the suffix. */
const isClientUat = (name: string) => name === CLIENT_UAT || name.startsWith(`${CLIENT_UAT}_`);

/**
 * Whether any of these cookies says a Clerk account is signed in on this
 * browser. Split from `signedInHint` so the cookie rules can be tested without
 * a request.
 */
export function signedInHintFrom(jar: { name: string; value: string }[]): boolean {
    return jar.some(({ name, value }) => isClientUat(name) && value !== "" && value !== "0");
}

/**
 * `document.cookie`'s format — `name=value; name=value` — as a jar. A piece with
 * no `=` is dropped rather than guessed at.
 */
export function parseCookieString(cookies: string): { name: string; value: string }[] {
    return cookies.split(";").flatMap(piece => {
        const at = piece.indexOf("=");
        return at < 0 ? [] : [{ name: piece.slice(0, at).trim(), value: piece.slice(at + 1).trim() }];
    });
}

/** `signedInHintFrom` for the string `document.cookie` hands back. */
export const signedInHintFromCookieString = (cookies: string): boolean => signedInHintFrom(parseCookieString(cookies));

/** The attribute the pre-paint script sets on `<html>` when the hint says signed in. */
export const SIGNED_IN_ATTRIBUTE = "data-ag-signed-in";

/**
 * `signedInHintFromCookieString` as source for an inline `<script>`, which sets
 * `SIGNED_IN_ATTRIBUTE="1"` on `<html>` when it holds. The home page is served
 * as the same static HTML to everyone, both screens in it; this runs before
 * either paints so CSS can show the right one (`ag-home-screen` in
 * `ag-theme.css`) without waiting for React. Plain ES5 and wrapped in a
 * try/catch, because it runs on every cold open of `/` and must never be the
 * thing that breaks it. `clientUat.test.ts` holds it to the same answers as
 * `signedInHintFrom`.
 */
export const SIGNED_IN_PRE_PAINT_SCRIPT = `try{document.cookie.split(";").some(function(p){var a=p.indexOf("=");if(a<0)return false;var n=p.slice(0,a).trim(),v=p.slice(a+1).trim();return(n==="${CLIENT_UAT}"||n.indexOf("${CLIENT_UAT}_")===0)&&v!==""&&v!=="0"})&&document.documentElement.setAttribute("${SIGNED_IN_ATTRIBUTE}","1")}catch(e){}`;
