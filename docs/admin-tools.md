# Admin tools — guest account recovery

Support tooling for whoever runs the app, at `/admin`. One job today:
getting a guest back into their game when the link they were given is gone.

## The problem it solves

A guest (see [`account-less-play.md`](./account-less-play.md)) is a real Clerk
user with no email, no password and no handle. Two things can bring them back
to a game:

1. **The session cookie** in the browser they joined from.
2. **The resume link** — a Clerk sign-in token, shown once by
   `ResumeLinkOffer` right after they claim a seat and stored nowhere
   afterwards.

Lose both — a cleared browser, a private window, a new phone, a link they never
saved — and the account is unreachable. Nothing in the product can help them:
there is no address to send a reset to, and the game they were playing is not
even theirs to abandon quietly, because the other players are waiting on a turn
that will now never come. Until the sweeper reaps the account
(`GUEST_SWEEP_DAYS` after their last game ends) their seat just goes cold.

So the recovery path is a human one: the player says "I was Dave, playing Train
Time with Ann", and an admin mints them a new link.

## Who is an admin

`publicMetadata.admin === true` on the Clerk user, set by hand in the Clerk
dashboard — the same shape as the `unlocked` invite gate, and per Clerk
instance, so a dev admin is not a production one.

- `isAdmin(user)` (`src/utils/ui/players.ts`) is the single predicate, read on
  both sides of the wire.
- `requireAdmin()` (`src/utils/api/adminRequest.ts`) is the gate every
  `/api/admin/*` route opens with. It is the real one.
- The client checks — the `/admin` screen, the `AdminLink` in the Settings
  footer — only decide what to draw. `publicMetadata` is writable through
  Clerk's Backend API only, so a browser cannot grant itself the flag, but it
  also cannot be trusted to have checked.

A non-admin who types `/admin` gets the same "There's nothing here" dead end a
mistyped link gets, rather than a locked door advertising what is behind it.

## The screen

`/admin` → `AdminGuestRecovery`:

- **A list of unclaimed guests**, newest first, from `GET /api/admin/guests`.
  Guest-ness lives in Clerk rather than Mongo, so the list is a walk of the
  instance (`forEachClerkUser`, the same walk the `staleguests` cron makes),
  capped at 25 rows — narrow the search rather than scroll.
- **Each row names the tables they are sitting at**: every live game, finished
  game and open lobby, with the other players named and a link to the board.
  This is the part that matters. A guest's name is not an identification — two
  Daves is the normal case, which is why `uniqueGuestName` exists — so the
  check before minting anything is *"Train Time with Ann and Bob"* against what
  the player actually said.
- **A search box** matching the display name or the account id, applied during
  the walk so an older guest can still be found once the cap bites.
- **A "Resume link" button** per row, which mints and offers the link through
  the share sheet or the clipboard (`shareOrCopyLink`, the same handoff the
  guest's own offer card uses) and leaves it on screen to paste by hand.

## The mint: `POST /api/admin/guests/resume`

Body `{ userId }`, answer `{ resumeUrl, name, expiresAt }`. It re-mints exactly
what the join route hands a brand-new guest — `createResumeTicket` in
`src/utils/users/guest.ts`, a Clerk sign-in token behind
`/join?resume=<ticket>` — with the same 7-day life, because it is the same link
and the window is already bounded by the guest account it signs into.

Four things hold it in place:

- **Guests only.** The route reads the target from Clerk and refuses anything
  without `publicMetadata.guest`. A sign-in token *is* the account: for a guest
  that is the designed way in (unclaimed, no password, a link shown once), and
  for a registered account it would be an impersonation tool, since that
  account has a password and a reset flow of its own.
- **Admin only**, per `requireAdmin` above.
- **Rate limited per admin** (20 an hour) — a support conversation needs one or
  two, and a stolen admin session minting them in bulk is the thing worth
  slowing down. The list route is capped too (60 per 10 minutes), because every
  call walks the whole Clerk instance.
- **Logged.** `Admin <id> minted a resume link for guest <id>` is the only
  record that a link exists at all: nothing stores the ticket, here or in the
  join route.

## What it deliberately does not do

- **No "recover any account".** See guests-only above.
- **No revocation.** Clerk's sign-in tokens expire but are not listed or
  revoked from here, so minting a second link does not kill the first. Both
  work until they expire, which is the same exposure the sign-up link already
  has.
- **No editing.** Nothing on this screen writes to a game, a lobby or a
  player's metadata. It reads, and it mints a link.

## Adding another admin tool

Put the route under `src/app/api/admin/**`, open it with `requireAdmin()`, and
add a section to `/admin` rather than a second screen — the page is a list of
sections, and `Section` / `ListSection` / `ListRow` already draw them.
