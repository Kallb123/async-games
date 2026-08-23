import { clerkClient } from "@clerk/nextjs/server";
import { randomUUID } from "crypto";

// A ticket is minted and handed to the client to consume immediately
// (`signIn.create({ strategy: 'ticket', ticket })`), not stored anywhere —
// long enough to cover that one round trip, nowhere near the resume window
// docs/account-less-play.md §2 gives a *returning* guest's sign-in link.
const GUEST_TICKET_TTL_SECONDS = 60;

export interface GuestTicket {
    userId: string;
    ticket: string;
}

// Clerk usernames are unique across the instance (docs/account-less-play.md
// §3), so a guest can't just be handed the name they'll display under — that
// is a per-lobby concern for whoever mints the guest (step 14). This is only
// the account identifier, and a random one is enough not to collide.
function generateGuestUsername(): string {
    return `guest_${randomUUID().replace(/-/g, "")}`;
}

// A guest principal (docs/account-less-play.md §3 Option A): a real Clerk
// user, marked `publicMetadata.guest` so the rest of the app's authorisation
// checks (`useIsAuthorised`, `isUnlockedUser`) let them in without the
// invite-only unlock a real signup requires. Claiming later is then just
// dropping that flag off the same user — the id never changes.
export async function createGuest(): Promise<GuestTicket> {
    const client = await clerkClient();
    const user = await client.users.createUser({
        username: generateGuestUsername(),
        skipPasswordRequirement: true,
        publicMetadata: { guest: true },
    });
    const { token } = await client.signInTokens.createSignInToken({
        userId: user.id,
        expiresInSeconds: GUEST_TICKET_TTL_SECONDS,
    });
    return { userId: user.id, ticket: token };
}
