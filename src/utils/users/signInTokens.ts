import { clerkClient } from "@clerk/nextjs/server";

/**
 * The one place a Clerk sign-in token is minted.
 *
 * A sign-in token *is* the account: whoever holds one can become that user by
 * handing it to `signIn.create({ strategy: 'ticket' })`. So every caller has
 * to have established, by its own means, that the person it is minting for is
 * the person it is minting about — there is no check here that could do it for
 * them, and none of the callers' reasons are the same:
 *
 * - a guest's own join mints for an account it created a moment ago
 *   (`users/guest.ts`, docs/account-less-play.md §14)
 * - a returning guest's resume link is the same thing held open longer (§2/§15)
 * - an admin re-mints one for a guest who lost theirs (docs/admin-tools.md)
 * - the Android app's Google sign-in mints for the user whose verified Google
 *   address it just checked (`api/auth/googlenative`)
 *
 * The lifetime is the caller's too, and it should be the shortest one that
 * covers what the ticket is for: a round trip, or a link worth saving.
 */
export async function mintSignInToken(userId: string, expiresInSeconds: number): Promise<string> {
    const client = await clerkClient();
    const { token } = await client.signInTokens.createSignInToken({ userId, expiresInSeconds });
    return token;
}
