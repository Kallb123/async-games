# Admin tools

Support tooling for whoever runs the app, at `/admin`. Getting a guest back
into their game when the link they were given is gone, a look at what
platforms players are actually on, build-time editors for Race Cars circuits
and Kingdom Builder tilesets, and a way to clear out Kingdom Builder worlds.

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

A Race Cars circuit is a graph of tiles (see
[`race-cars.md`](./games/race-cars.md) §5.1, and
[`race-cars-tracks.md`](./games/race-cars-tracks.md) for the whole structure):
every tile carries its own
`exits` — the spaces a car may drive to next — and its own `geometry` (the
centre point and heading it is drawn at). Three things about a real circuit
can't be typed by hand:

- **214 hand-placed coordinates** (§23.6). The centre point of every tile has
  to sit on the road in the art, and eyeballing pixel pairs into a source file
  is not a job.
- **The corner merges that break §5.1's step rule.** The default rule — the
  next tile along, this lane or either lane beside it — is written for you. But
  a painted corner that only feeds particular tiles ahead, and an inside line
  that takes fewer tiles round a corner than the outside, both need their
  `exits` naming by hand. That is a graph edge, and drawing edges is what the
  editor is for.
- **Row numbers.** Nobody types these any more, here or in a track file. They
  are derived from the steps you draw (see below), which is the whole reason
  the editor grew sections.

### Sections and sync lines

The lap is cut into **sections**: a straight, an esse, a corner. Each boundary
between two of them is a **sync line** — a line across the road where every
lane is genuinely level with every other. A **corner is a section** with a stop
count (§10); there is no separate painting of corner bands.

Rows are then derived inside each section from the steps you drew, and they are
the thing sections exist for. A row number counted along a lane drifts the
moment a corner's inside line takes fewer tiles than its outside, and by the
second corner two tiles drawn side by side on the art carry row numbers a lap
apart — which is a step across the road that doesn't move the car forward, and
a corner a car can drive the stop count of for free. Derived, a row is a rank
in the step graph: every step advances at least one row by construction, a lane
taking the short way round simply skips the rows it saved, and both lanes are
level again at the next sync line.

Two consequences worth keeping in mind while drawing:

- **Put a boundary where the road is square**, a tile or two clear of a corner
  whose ends are skewed — not at the corner's own painted edge.
- **Place each lane's tiles in the order the road runs.** A lane's run through
  a section is its order of placement; the derivation and the default step rule
  both read it.
- **A lap needs at least two sections.** The wrap back to the start line has to
  cross a sync line; held inside one section it is a loop in the very graph the
  rows are ranked from.

### What you do with it

1. **Set the art.** Point *Art path* at a file already under `public/`, and/or
   *Upload backdrop* an image to trace against (the upload is held in this
   browser only, never written into the printed track). Set the viewBox size —
   an upload fills it in from the image.
2. **Cut the lap into sections.** In *Sections*, name each stretch in the order
   it is driven, starting at the start/finish line: how many lanes wide it is,
   and whether it is a straight or a corner owing one or two stops. *Earlier* /
   *Later* reorder them; *Draw into this* picks the one new tiles land in.
3. **Place tiles.** In *Place* mode, click the art to drop the next tile into
   the active section; the lane cycles 1 → 2 → 3 and can be set by hand. Drag a
   tile to nudge its centre; click one to select it and edit its section, lane
   or heading in the *Tile* panel — which also shows the row it derived to.
   Heading is computed from where a tile's exits point unless you set it.
4. **Draw movement restriction.** Select a tile, switch to *Draw exits*, and
   click the tiles it may step to — each click adds or removes a step. An edge is
   coloured by where its step came from: faint grey dashed is §5.1's default,
   purple is a step auto-connect drew from the geometry, and terracotta is your
   own hand-drawn override. An edit that lands back on the default drops the
   override, so ordinary straights stay plain. **Auto-connect exits from
   geometry** rebuilds every non-overridden tile's steps from where the tiles
   actually sit rather than from the placement order — the fix for a section
   whose lanes hold different numbers of tiles (see below). It leaves your
   hand-drawn exits alone, and only the purple edges are its to redraw, so the
   colours tell you what a second run will touch.
5. **Name a tile's own steps.** Most tiles take §5.1's default rule and print
   nothing. A section whose lanes hold **different numbers of tiles** can't:
   "the next tile along in the lane beside me" is an index, and where the runs
   are different lengths that index is not a statement about the road, so
   `deriveTrack` refuses the section unless every tile in it names its own
   steps — *"section "X" runs its lanes out of step, so Y has to name its own
   steps"*. The default drawn on the canvas is often still the right answer
   near the section's entry, but it has to be **confirmed** rather than
   assumed, which is the whole point of the rule. Click the tile you are
   drawing from (or *Make these steps its own* in the *Tile* panel) to write
   its current steps down as its own; the *Sections* panel counts the tiles
   still leaning on the rule and names a whole section's in one go, which is
   worth using because the error surfaces one tile at a time. Toggling a step
   off and on again cannot do this: an edit that lands back on the default
   drops the override — except in an out-of-step section, where it is kept for
   exactly this reason.
6. **Move tiles between sections.** *Paint into section* drags the brush over
   tiles to move them into the active section — how a corner gets its tiles, and
   how a sync line is nudged a tile either way once the art shows it is in the
   wrong place.
7. **Mark the grid, the line and the oil.** In *Mark* mode, the *Marking*
   picker says which of the three a click lays; a drag paints a run of them (a
   line across the road is one stroke), and clicking a marked tile takes the
   mark off again. Each one rings the tile on the canvas and badges it
   underneath.
   - **Starting grid** — the tile each car is dealt onto (§5.2), *in the order
     you mark them*: first is P1. A track cannot be exported until all six are
     marked, because this is the one mark a race reads, and a slot that is not a
     space the circuit has is a car that cannot move at all. That is not
     hypothetical: Anglet shipped taking the shared six-slot grid of rows 0–2,
     lanes 1 and 3, on a circuit whose derived rows 0 and 2 are lane 2 alone —
     four of its six drivers spent the race being told "boxed in".
   - **Finish line** — the tiles the line is painted across. It need not be one
     row: a lane taking the short way round a corner carries the line on its
     own row, and a line drawn on the skew sits on several. The panel warns if a
     lane has no tile on it, since a car down that lane would never cross it.
   - **Oil** — optional, and most circuits have none.

   The *Marks* panel also carries **the grid sits behind the finish line**, for
   a circuit whose cars line up back down the straight from the line so that it
   doubles as the start: the first crossing is then the start of lap 1 rather
   than the end of it.

   **The grid and the finish line are both read by a race.** §15 counts the lap
   at the *earliest* row the line is painted on — one row for the whole circuit,
   so two cars level across the road bank their laps on the same step and none of
   them can cross twice by changing lane — or at the derived row 0 where no line
   is painted. A grid marked as sitting behind the line seats the field a lap
   short, so its first crossing starts lap 1 rather than ending it. **Oil is
   still printed and unread**: §14's slicks are laid only by spins and heavy
   braking.
8. **Hot keys.** The toolbar is driveable from the keyboard, which is worth
   knowing before placing a few hundred tiles by hand: `Q` *Place*, `W` *Draw
   exits*, `E` *Paint into section*, `R` *Mark*, `1`/`2`/`3` for that lane,
   `G`/`F`/`O` for the mark (grid, finish, oil), and `A`/`S` to step back and on
   through the sections. Each key does exactly what its control does and nothing
   the control wouldn't — so a key is ignored while a button is disabled or a
   lane is one this section hasn't got, as is anything typed into a field or
   held with Ctrl/Cmd/Alt.
9. **Save/resume.** The draft autosaves to this browser's `localStorage`;
   *Save draft to file* / *Open draft file* move it to a `.json` you can keep or
   carry to another machine. That draft is the working copy — separate from the
   deployable track file the export panel prints.
10. **Validate & export.** The panel runs the drawing through the game's own
    `deriveTrack`, so "driveable in the editor" and "loads in the game" are the
    same check — and refuses a circuit that has not marked a full grid, which is
    "seats a field" rather than "joins up". Copy the printed file, save it as
    `src/games/RaceCars/tracks/<id>.ts`, and add it to `TRACK_LIST` in
    `board.ts`. No row number is printed anywhere: the file carries sections,
    tiles, steps and the tile ids its marks sit on, and derives its rows — and
    resolves those marks through `spacesOf` — at module load exactly as the
    editor did.

Load a shipped track (Ashcombe, Anglet) to refine its placeholder geometry
against the real art rather than placing every tile from nothing — its corners
come back as sections with the straights between them, ready to be split
further, and its marks come back on the tiles they sit on. A slot naming a
space that circuit hasn't got is dropped on the way in, so a grid reading
fewer than six is the editor telling you which cars had nowhere to stand.

The whole screen stretches to a desktop's width — the canvas stays put on the
left while the panels scroll on the right — and folds to a single column on a
phone.

### A corner whose lanes run out of step

The inside of a corner covers the same stretch in fewer tiles than the outside.
Say so by drawing it: place the inside line's tiles where they sit on the art,
and draw the steps out of each one, including the last one's merge back onto
the straight. **The re-alignment *is* an exit** — there is no separate step for
it, and the derivation spreads the shorter lane evenly across the rows its
section spans so the two lines stay comparable.

A band like that has to name every one of its steps, and the export panel says
so if it doesn't: "the next tile along in the lane beside me" is a statement
about lanes that run *in step*, and over one that doesn't it is a guess — the
guess that used to put two tiles drawn side by side a row apart.

*Auto-connect exits from geometry* does most of the work: it connects each tile
to the tiles physically ahead of it in this lane and the one either side,
working the direction of travel out from the next tile along the tile's own
lane. It cannot finish the job on its own, though, and this is the one place
that matters: where the geometry's answer happens to *match* §5.1's default,
auto-connect leaves the tile on the rule rather than writing the set down — so
the section stays refused however many times you run it. Those are the tiles
step 5 is for. Finish with **Name this section's steps** in the *Sections*
panel, which writes down every tile still leaning on the rule in one go and
leaves the ones auto-connect drew alone; the panel counts them for you, so a
section reading zero is one that will load.

### No "What's new" entry

This is admin-only internal tooling; a player never sees it, so it does not earn
a release note (see AGENTS.md, "Keep the What's new notes up to date").

## Game tools: the Kingdom Builder tile mapper

`/admin` → **Kingdom Builder tile mapper** → `/admin/kingdombuilder-tiles`
(`KingdomBuilderTileMapper`). A build-time authoring aid for the world map's
tilesheets, in the same spirit as the track editor above: it produces the
`tileset.ts` data a developer pastes into the repo, persists nothing
server-side, and sits behind the same client-only `isAdmin` gate — no
`/api/admin` route behind it either.

### Why it exists

Kingdom Builder GDD §3.5.5 draws the world's ground from tilesheets: each
registry area or overlay uses one of five layouts (`mask16`, `mask47`,
`orientation`, `variants`, `single`), addressed as `{ sheet, index }` — a flat,
row-major square on a named sheet, optionally widened into a piece several
squares across. Counting pixels in an image viewer to work out which index is
which square, for every mask a 16-tile autotile needs — let alone the 47 a
blob sheet needs — is exactly the kind of job this repo hands to an editor
rather than a human with a calculator.

### What you do with it

1. **Point it at a sheet.** *Art path* takes anything already under
   `public/art/kingdombuilder/`; *Upload sheet from disk* previews a file
   before it's committed anywhere (held in this browser only, like the track
   editor's traced backdrop — never written into the printed file). Or **load
   a sheet already in `tileset.ts`**: pick it from the dropdown and *Load
   sheet & its mappings* brings in its size, margin and spacing along with
   every area or overlay whose art already points at it, replacing whatever
   the draft currently holds for those (`entriesUsingSheet` in
   `tileMapperModel.ts`) — so continuing an already-shipped entry means
   picking up where the file left off, not re-clicking it in from scratch.
2. **Set the tile size.** Width and height in pixels, plus the sheet's own
   margin and spacing (the outer border and inter-tile gutter a real
   tilesheet usually has). The panel offers every size in a sane range that
   divides the loaded image evenly on both axes as one-tap chips, and warns
   when the current numbers leave a partial row or column — the usual sign of
   an undeclared gutter.
3. **Pick what you're assigning.** Choose an area or an overlay from the
   registry, and the layout its art uses (locked once any tile has been
   assigned to it, so a partway-through entry can't be switched into a shape
   half its tiles don't match). A `mask16` entry picks its role from four
   "matches" checkboxes — north/east/south/west, the same 4-bit mask
   `useTerrainImage.ts` computes at render time; a `mask47` entry adds the four
   diagonals, each disabled unless both the sides beside it are ticked, since a
   diagonal whose side is open can't change the picture and must not enter a
   second slot for the same tile. An `orientation` entry takes a free-text key
   — whatever `OverlayPlacement.orientation` will carry — looked up at render
   time; only two overlays' generators actually set one today (Bridge/Ford get
   `"ns"`/`"ew"`, the direction the crossing itself runs; Pier gets
   `"n"`/`"e"`/`"s"`/`"w"`, the side of the site facing the water), so anything
   else declares one key of its own choosing (e.g. `"default"`) and leans on
   the variant checkbox below for a look that still varies. `variants`/`single`
   need no role at all.
4. **Say how big the piece is**, where one may be. An overlay's
   `orientation`/`variants`/`single` art can be several squares across — the
   walled town, the church — so those layouts show a width, a height and an
   anchor: which square *of the piece* lands on the square of map it's placed
   on, defaulting to the bottom-left so a building stands on its base and rises
   over the ground behind it. Areas and mask layouts don't offer it, because
   they fill the grid one square at a time and the guard rejects a piece there.
5. **Click the squares.** Each click on the sheet preview assigns the tile
   under the pointer to whatever's currently picked; an assigned square is
   tinted and labelled with its entry's code so the sheet reads back at a
   glance, and a piece marks every square it covers rather than just its
   corner. A mask entry's own panel counts down "N of 16 left" (or of 47).
   Once a mask slot or an orientation key already holds a tile, an **"Add as
   another variant for this slot/key"** checkbox appears next to it: tick it
   and the next click folds the new square in alongside what's there instead
   of replacing it, so that slot or key ends up holding several
   interchangeable tiles — picked at render time the same seeded-hash way a
   `variants` entry's own list is. It's the escape hatch for the slot a big
   filled area leans on hardest, mask16's fully-interior slot (mask 15, every
   side ticked): several plain-grass squares instead of one repeating across
   the whole field — and equally the way an `orientation` entry with no real
   direction (Ruins, say) shows several different looks under its one key.
   Leave it unticked to keep clicking normally replacing whatever a slot or
   key already holds.
6. **Or import a nine-slice.** Most hand-drawn sheets arrive as 3×3 blocks —
   corner, edge, centre — which is nine of the sixteen neighbourhoods a
   `mask16` wants. *Import a 3×3 nine-slice* arms the next click to take that
   square as a block's top-left and fill all sixteen at once: the nine from the
   block, and the seven a nine-slice never draws aliased onto the closest it
   has (`nearestDeclaredMask` in `tileMapperModel.ts` has the weighting, and
   ties break low so the same block always prints the same file). Clicking
   within three squares of the right or bottom edge says so rather than
   wrapping onto the next row.
7. **Or fill every slot with one tile.** *Fill all 16 with one tile* (or 47)
   arms the next click to point the entire entry at that one square —
   `fillMaskWithTile` in `tileMapperModel.ts`, the flat placeholder fill an
   entry with no differentiated edge art yet wants. The shipped grass area
   already leans on the idea by hand: every slot but the fully-interior one is
   the same plain square. Works for either mask layout, and — like the
   nine-slice import — replaces whatever the entry held before rather than
   folding into it.
8. **Check the preview.** A "Preview" panel shows what the currently-picked
   entry will actually look like, from real cropped squares of the loaded
   sheet rather than a description of them, in three parts for a
   `mask16`/`mask47` entry — all three read straight off the entry's own
   slots rather than the checkboxes above, so none of them collapses to one
   square repeated the instant the checkboxes return to their all-matching
   default; a ring still follows the checkboxes onto whichever cell is the
   slot they currently point at, when that slot is one of the ones shown:
   - **A self-contained 3×3 island** (`islandMaskSlots`): the same fixed
     patch the nine-slice importer reads a block from, only run the other
     way — every one of the nine squares really is this entry, so every one
     draws from a real slot (the middle is the fully-interior one, the rest
     are its edges and corners) rather than standing in for a neighbour the
     mapper doesn't actually know.
   - **A cross** (`crossMaskSlots`): the isolated tile in the middle — a
     square of this entry with nothing else touching it anywhere — and the
     far tip of a peninsula reaching out in each of the four directions, only
     matching on the one side that leads back toward a body. Five of the
     seven exotic neighbourhoods a nine-slice import can't draw
     (`nearestDeclaredMask`'s own list; the two one-square-wide strips are
     the two left out), so an entry that leans on the importer is worth
     checking here too. Works for either mask layout.
   - **The four inner corners** (`innerCornerMaskSlots`, `mask47` only): two
     arms closing around one square of something else, the picture a
     `mask16` tile can never draw because it has no diagonal to ask about at
     all. Each square is otherwise fully surrounded, with only that one
     corner left open.

   A dashed square, in any of the three, is a slot nothing's been clicked
   onto yet. `orientation`/`variants`/`single` get the plainer version, a
   strip of one tile per declared role.
9. **Copy `tileset.ts`.** The export panel prints the sheet list plus
   `AREA_ART`/`OVERLAY_ART` in the exact shape the real file declares them —
   paste it over those three declarations (the type imports, `sheetTilePixels`
   and the guard functions don't move) and run `npm test`. A one-square
   reference still prints as the bare `{ sheet, index }` it always did, and a
   piece prints only the fields it actually departs from the defaults on. An
   entry with a mask still missing some of its slots is left out as a comment
   naming how many, rather than printed with a hole in it, so a half-finished
   draft never turns into a `tileset.ts` that doesn't compile.

**The preview frame** is the track editor's (`.ag-rcedit-canvas` /
`.ag-editor-canvas`, one rule): the sheet and its grid overlay scroll inside a
fixed frame rather than pushing the panels off the screen. An ordinary
tilesheet is a dozen squares across and twenty down, and at a size whose
squares can be clicked accurately that is taller than the screen. A small sheet
is scaled up to fill the column; a big one stays at 1:1 and scrolls, because a
16px square drawn at 7 screen pixels can't be clicked accurately — and the
zoom stepper overrides both. `previewScale` in `tileMapperModel.ts` has the
reasoning and the test.

**Save/resume** works the same as the track editor's: the draft — every
sheet, every assignment — autosaves to this browser's storage, so a reload
keeps the work. The loaded image itself doesn't: an *Art path* reloads for
free, and an uploaded file asks to be chosen again. The sheet's pixel
dimensions are re-measured every time the image changes, so swapping a
192×336 sheet in after a 128×128 one re-cuts the grid for the new shape
instead of keeping the old one's.

### No "What's new" entry

Same reasoning as the track editor's: admin-only tooling a player never sees.

## Game tools: Kingdom Builder worlds

`/admin` → **Kingdom Builder worlds** → `/admin/kingdombuilder-worlds`

A Kingdom Builder world isn't a `GameData`, so `/api/game/end` can't see it,
and a world nobody plays keeps ticking and keeps its place on its players'
dashboards. Its host can end it and anyone can leave it (GDD §9.1), but a test
world whose players have moved on will never be ended by them — this is the
tool for those.

- **The list** is every world, newest first, capped at 50: its seed, its
  players against its seats, its tick, how long ago it was opened and — for
  one that has ended — when and why (by its host, its last player leaving, or
  an admin).
- **End** on a live world does what the host's own "End world" does: sets
  `endedAt`, so it stops ticking, takes no command, leaves every dashboard and
  revokes its join code. It is removed by the tick cron seven days later.
- **Delete** on an ended world removes it now — settlements, invitation, then
  the world — rather than waiting the seven days.

Both sit behind a confirm, and both go through
`POST /api/admin/kingdombuilder-worlds` (body `{ worldId, action: "end" |
"delete" }`), which opens with `requireAdmin()` and logs the admin who asked,
since either is final for every player in the world.

## Adding another admin tool

Put the route under `src/app/api/admin/**`, open it with `requireAdmin()`, and
add a section to `/admin` rather than a second screen — the page is a list of
sections, and `Section` / `ListSection` / `ListRow` already draw them. A tool
that only authors repo data and persists nothing (the track editor) needs no
API route at all — a client screen behind the same `isAdmin` gate is enough.
