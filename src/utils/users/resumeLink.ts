// A guest's durable handle back into a game after they close the tab
// (docs/account-less-play.md §2): a Clerk sign-in token in a link, shown once
// at sign-up. Read the way a join link's code is (`joinCode.ts`'s
// buildJoinHref/readJoinCode) — one param name, shared by whoever mints the
// link (the join route, via the guest ticket) and whoever consumes it
// (/join). Not to be confused with `code` on the same route: that one opens a
// lobby to anyone holding it, this one signs back in exactly the guest it was
// minted for.
const RESUME_TICKET_PARAM = 'resume';

/** The in-app path a guest's resume link points at. Prefix with an origin to share it. */
export function buildResumeHref(ticket: string): string {
    return `/join?${new URLSearchParams({ [RESUME_TICKET_PARAM]: ticket })}`;
}

/** The sign-in ticket a `/join` link arrived with, or null when there wasn't one. */
export function readResumeTicket(searchParams: URLSearchParams): string | null {
    return searchParams.get(RESUME_TICKET_PARAM);
}
