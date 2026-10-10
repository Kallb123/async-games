import { cookies } from "next/headers";
import { signedInHintFrom } from "@/utils/users/clientUat";

/**
 * A guess, from the browser's cookies alone, at whether the visitor is signed
 * in — for a server component that only needs to pick its first paint. (The
 * cookie rules themselves live in `clientUat.ts`, shared with the browser.)
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
 *
 * Reading cookies makes a route dynamic. Only `/join` still does: the home page
 * reads the same cookie in the browser instead (`HomeScreen`), so that it can be
 * served as a static page.
 */
export async function signedInHint(): Promise<boolean> {
    return signedInHintFrom((await cookies()).getAll());
}
