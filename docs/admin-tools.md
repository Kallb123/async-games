# Admin tools

Support tooling for whoever runs the app, at `/admin`. Three jobs today:
getting a guest back into their game when the link they were given is gone,
a look at what platforms players are actually on, and a build-time editor for
authoring Race Cars circuits onto their art.

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

## User analytics

`/admin` → `AdminUserAnalytics`: a snapshot of the registered push devices
across every account — how many, and a breakdown by desktop vs. mobile vs.
tablet, operating system, and browser — from `GET /api/admin/analytics`.

- **Built from Clerk, not Mongo.** A registration lives in each user's private
  metadata (`getDeviceTokens`, `src/utils/firebase/deviceTokens.ts`), the same
  place the player's own "Your devices" list in Settings reads from. This
  screen just walks every account (`forEachClerkUser`) and tallies what
  `parseUserAgent` (`src/utils/firebase/deviceInfo.ts`) already recorded about
  each one — nothing new is parsed or stored for it.
- **Generated when asked, not kept in sync.** This is a screen an admin opens
  rarely, so it is cheaper to walk the instance fresh on every request
  (`buildDeviceAnalytics`, `src/utils/users/adminAnalytics.ts`) than to keep a
  second copy of the same counts up to date somewhere. The rate limit (30
  requests per 10 minutes, the same window the guest list's uses) exists for
  the same reason the guest list's does: to bound how often that walk runs,
  not because the numbers themselves are sensitive.
- **Counts devices, not people.** One player signed in on a phone and a laptop
  is two rows in every breakdown. `usersWithDevices`/`scannedUsers` are the
  only per-account figures, there to show how much of the instance the device
  counts actually cover.
- **Read-only**, same as the guest list: nothing here writes to a game, a
  lobby, or an account's metadata.

## Game tools: the Race Cars track editor

`/admin` → **Race Cars track editor** → `/admin/racecars`
(`RaceCarsTrackEditor`). A build-time authoring aid for the Race Cars circuit
data, not a runtime feature: it produces a `tracks/` source file a developer
saves into the repo, and it persists nothing server-side, so — unlike the tools
above — there is **no `/api/admin` route behind it**. The gate is the same
client-only `isAdmin` dead end the rest of `/admin` uses.

### Why it exists

A Race Cars circuit is a graph of spaces (see
[`race-cars.md`](./games/race-cars.md) §5.1): every tile carries its own
`exits` — the spaces a car may drive to next — and its own `geometry` (the
centre point and heading it is drawn at). Two things about a real circuit can't
be typed by hand:

- **214 hand-placed coordinates** (§23.6). The centre point of every tile has
  to sit on the road in the art, and eyeballing pixel pairs into a source file
  is not a job.
- **The corner merges that break §5.1's step rule.** The default rule — the
  next row, this lane or either lane beside it — is written for you. But a
  painted corner that only feeds particular tiles ahead, and an inside line
  that takes fewer tiles round a corner than the outside, both need their
  `exits` naming by hand. That is a graph edge, and drawing edges is what the
  editor is for.

### What you do with it

1. **Set the art.** Point *Art path* at a file already under `public/`, and/or
   *Upload backdrop* an image to trace against (the upload is held in this
   browser only, never written into the printed track). Set the viewBox size —
   an upload fills it in from the image.
2. **Place tiles.** In *Place* mode, click the art to drop the next tile; its
   row/lane auto-advance (lane 1 → 2 → 3 → next row). Drag a tile to nudge its
   centre; click one to select it and edit its row, lane, heading or corner in
   the *Tile* panel. Heading is computed from where a tile's exits point unless
   you set it by hand.
3. **Draw movement restriction.** Select a tile, switch to *Draw exits*, and
   click the tiles it may step to — each click adds or removes a step. Faint
   dashed edges are §5.1's default; solid edges are your overrides. An edit that
   lands back on the default drops the override, so ordinary straights stay
   plain. **Auto-connect exits from geometry** rebuilds every non-overridden
   tile's steps from where the tiles actually sit rather than from row+1 — the
   fix for a corner sharp enough that the lanes come out of it out of step (see
   below). It leaves your hand-drawn exits alone.
4. **Paint the corners.** In *Corners*, add a corner (id, name, stop count),
   then switch to *Paint corners* and drag over exactly the tiles that belong
   to it. Membership is **per tile** (§10, §5.1): a corner covers all its lanes
   but not every lane on every row — the inside line is the short way round, so
   it is in the corner for fewer rows than the outside. The corner's row band
   (`from`/`to`, what §10 charges overshoot against) is derived from the rows
   its tiles span. Set the brush to *Erase* to clear tiles.
5. **Save/resume.** The draft autosaves to this browser's `localStorage`;
   *Save draft to file* / *Open draft file* move it to a `.json` you can keep or
   carry to another machine. That draft is the working copy — separate from the
   deployable track file the export panel prints.
6. **Validate & export.** The panel runs the tiles through the game's own
   `assembleSpaces`, so "driveable in the editor" and "loads in the game" are
   the same check. Copy the printed file, save it as
   `src/games/RaceCars/tracks/<id>.ts`, and add it to `TRACK_LIST` in
   `board.ts`.

Load a shipped track (Ashcombe, Anglet) to refine its placeholder geometry
against the real art rather than placing every tile from nothing. The whole
screen stretches to a desktop's width — the canvas stays put on the left while
the panels scroll on the right — and folds to a single column on a phone.

### Re-aligning lanes after a corner

The inside of a corner covers the same rows in fewer tiles than the outside, so
the lanes come out of a corner out of step, and past it they have to line up
again. There is **no separate re-alignment step, and none is needed** — the
merge *is* an exit. Draw the inside line's last tile straight onto the row it
should rejoin, and the graph carries the re-alignment; `assembleSpaces` then
checks that every such exit lands on a real space and moves the car forward.

The catch is the auto-generator: §5.1's default step rule (this lane or either
beside it, in the *next row*) can't see that the inside line took fewer tiles,
so past a sharp corner "the next row in this lane" is no longer the tile in
front. *Auto-connect exits from geometry* solves it by connecting each tile to
the tiles physically ahead of it — off the shape you drew, not off row+1 — so a
tile whose true next space carries a lower row number than its neighbour (the
inside line having spent fewer rows) still connects forward. If an exit ends up
running more than half a lap "forward", the export panel warns: that is almost
always a row-numbering slip, where the rows past the corner stopped counting up
in step with the road.

### No "What's new" entry

This is admin-only internal tooling; a player never sees it, so it does not earn
a release note (see AGENTS.md, "Keep the What's new notes up to date").

## Adding another admin tool

Put the route under `src/app/api/admin/**`, open it with `requireAdmin()`, and
add a section to `/admin` rather than a second screen — the page is a list of
sections, and `Section` / `ListSection` / `ListRow` already draw them. A tool
that only authors repo data and persists nothing (the track editor) needs no
API route at all — a client screen behind the same `isAdmin` gate is enough.
