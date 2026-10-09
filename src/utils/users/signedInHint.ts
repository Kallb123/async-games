import { cookies } from "next/headers";

// Clerk's own "someone is signed in on this browser" cookie: the time of the
// last sign-in, or "0" once they have signed out. It is set by Clerk's script
// on the client and has nothing to do with whether the session token is still
// fresh, which is why it can be read on a request that never went through
// Clerk's middleware. A deployment with several Clerk instances on one domain
// gets a copy per instance, named `__client_uat_<suffix>` where the suffix is
// derived from the publishable key (`getSuffixedCookieName` in @clerk/shared).
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
 * A guess, from the browser's cookies alone, at whether the visitor is signed
 * in — for a server component that only needs to pick its first paint.
 *
 * This is deliberately not `auth()`. Reading the session from the request needs
 * Clerk's middleware to have run on the page, and on a document request whose
 * session token has expired (a minute idle is enough) that middleware answers
 * with a redirect out to Clerk and back before the page is served. A hint costs
 * none of that. It can be wrong in either direction — a stamp left behind by a
 * session that has since been revoked, a visitor whose cookie is blocked — so
 * nothing may be decided on it: the client corrects itself once Clerk loads,
 * and every piece of data still comes from an API route that authenticates the
 * request properly.
 */
export async function signedInHint(): Promise<boolean> {
    return signedInHintFrom((await cookies()).getAll());
}
