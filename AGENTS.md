# AGENTS.md

Guidance for AI agents and human contributors working in this repository.

## Project

Async Games is a Next.js (App Router) app for playing turn-based games
asynchronously. Auth is handled by Clerk, persistence by MongoDB/Mongoose,
and push notifications by Firebase Cloud Messaging.

For a detailed tour of the app and repo architecture — the game engine and
command pattern, the data model, the turn lifecycle, push notifications, and
how to add a new game — see [`ARCHITECTURE.md`](./ARCHITECTURE.md).

## Component reuse — the most important rule

**Build reusable components and reuse them wherever possible.** The UI was
overhauled away from stock Bootstrap to a small custom design system. That
only stays maintainable if we keep the number of building blocks small and
share them. Duplicated markup and copy-pasted logic are how this codebase
becomes unmaintainable — treat both as defects.

Before writing UI, in this order:

1. **Reuse an existing component or hook.** Check `src/components/ui/`,
   `src/components/`, `src/utils/hooks/`, and `src/utils/ui/` first.
2. **Reuse a design-system class** from `src/app/ag-theme.css` (the `ag-*`
   classes) instead of hand-rolling inline styles for spacing, colour,
   cards, buttons, pills, toggles, list rows, etc.
3. **Extract a new shared piece** when the same markup or logic would appear
   in two or more places. Put presentational primitives in
   `src/components/ui/`, stateful logic in `src/utils/hooks/`, and pure
   helpers in `src/utils/ui/`.
4. Only then write something bespoke — and keep it local to the one screen
   that needs it.

If you find yourself copy-pasting a block between files, stop and factor it
out. A second copy is the signal to extract the first one.

### Where the shared pieces live

- `src/app/ag-theme.css` — design tokens (CSS custom properties) and all
  reusable `ag-*` component classes. Extend this rather than inventing new
  inline-styled variants.
- `src/components/ui/` — presentational primitives:
  `Brand` (the mark + wordmark lockup every top bar that names the app uses),
  `AppRail` (the platform chrome the home dashboard wears — one element in two
  shapes: the phone's top bar, and the dark left rail it stands up into past
  900px, carrying the navigation and a switcher for every game in play. A wide
  screen never gets a second copy of the top bar, and a phone never gets a
  second copy of the rail),
  `Avatar`, `GameThumb`, `TurnTimerSelect`, `ThemeSelect` (the pick-a-dressing
  block on a setup screen, which renders nothing for a game with no themes),
  `OptionChoiceSection` (every pick-exactly-one choice on a setup screen — a
  radio group of `OptionRadioRow`s, with arrow keys and one Tab stop; a
  genuinely on/off setting stays an `OptionToggleRow`, and two mutually
  exclusive toggles are a choice, not two settings),
  `GameSetupLayout`, `GameLibrary`
  (the filter-chips + featured + grid game browser, shared by `/newgame` and
  the public landing page). Every heading-and-body block on a page is a
  `Section`; `CollapsingSection` adds the animation for one that comes and
  goes, and `ListSection` adds the `ag-list`, its skeletons and its empty
  message. Never hand-roll an `ag-section-head` again. A dismissible panel
  (the chat thread, the turn-history log, the GIF picker) opens with a
  `PanelHead`: its title, its dim subtitle and its own ✕, so the next one can't
  forget the label on that button. It carries no wrapper of its own — the
  thread and the log are `.ag-log`, the picker deliberately isn't. `ChatGif` is one GIF
  attachment drawn — the chat thread's row and the GIF picker's result grid both
  go through it, and it owns the degraded "GIF unavailable" caption for one that
  can't be shown, so that string has one home. `NamedChip` is one card-sized
  "what is this" chip — a mark, a name, and the tappable wiring that has to
  remember `role`, `tabIndex` and the Enter key — which every hand, discard pile
  and forecast list is built from; a game passes in its own mark (a colour dot,
  a figure) and keeps nothing else. The node-and-edge map
  boards (World Domination, Outbreak) share `BoardZoom`, `ClickableMapNode`,
  `MapLabel` and `MapEdges` (the adjacency layer, which draws cross-map edges
  as labelled stubs off each edge rather than a line across the whole board,
  and an edge given `waypoints` as a polyline through them — how Kingdom
  Builder draws a route along the tiles it takes).
  Any board too big for the column — map or not — wears `BoardZoom`: the pill
  stepping fit → in → a deeper step a board may set with `maxWidth`, plus pinch
  and ctrl-wheel zoom, both anchored so the part of the board under the fingers
  stays put. A board whose pieces are too small to tap asks it for a deeper
  step; it doesn't grow its own gesture handling or a cropped second copy of
  itself. It also carries the expand / shrink button in the frame's bottom-right
  corner — the pane grown to most of the screen's height, the board zoomed to
  fill it, and a strip of page left below to scroll by — drawn only where it
  would make the board a fifth taller, so a board never builds one of its own
  and one with something pinned to its frame's foot clears it in `ag-theme.css`.
  A third way the view can move is unprompted: pass `BoardZoom` a
  `focus` (a region in the child's own viewBox units, plus a key that changes
  whenever the focus should reapply) and it glides there on its own, zooming
  and panning from wherever the board already is, as Race Cars does the
  instant a roll hands a driver their car and the spaces it may finish on. It
  zooms to the deepest step the region fits at, or — with `exact` — to the zoom
  that just fits it, as Realm Arena does for the near half of a selected
  unit's reach and for a caster and its target, which no step frames well. A board redrawn under the player without anything
  happening on it — Realm Arena's battlefield turned a quarter — passes a
  `pivot` instead, which keeps whatever was in the middle of the frame there
  at the zoom it was at. And a board keeping something that moves in the
  middle of the frame — Realm Arena following a long walk — calls
  `useBoardCentre()` a frame at a time from its own playback clock, rather than
  feeding `BoardZoom` a new focus each frame; a player taking hold of the board
  stops it until the next focus. A board drawn by a camera rather than laid
  out by the browser — Realm Arena's 3D board, a WebGL canvas that can't be
  made 600% of the column wide — passes `camera`, and has all of the above:
  `BoardZoom` scrolls an empty spacer of the zoomed size, pins the child to the
  pane, and tells it what part of the viewBox is in the pane through
  `useBoardView(listener)` — a callback a frame at a time, never React state —
  while `focus`, `pivot` and `useBoardCentre` stay in the viewBox's units
  ([`docs/realm-arena-3d.md`](./docs/realm-arena-3d.md) §2). Such a board takes
  no drag, pinch or wheel of its own. (The track editor is the one exception,
  and says why in its own file: it owns every pointer press on its canvas.)
  Names printed on a board's art go through `MapLabelLayer`, never a bare
  `MapLabel` per node: it lays every name out in one pass so none of them lands
  on another name, on a node, on a marker beside a node, or off the map — tell
  it the side each name prefers and what to keep off (Train Time uses it too).
  A game that throws dice shows what came up with `Dice` (itself a row of
  `DieFace`) and, where the throw also moved something, with `RollReadout` — the
  dark card holding the dice, the total and a line naming what the roll paid out,
  which Dice Cities puts over its market and Settlements & Cities under its
  board. Don't hand-roll a second dice-and-total card beside it.
  `GameLink` is a `<Link>` to a game's board that starts fetching the board as
  the player reaches for it (press, mouse hover, focus): every row on the
  dashboard or the rail that opens a board is one, so the prefetch is wired once
  and a new row of that kind uses it rather than a bare `<Link>`.
  `WarmUpScript` is the inline script that wakes the function instance a
  signed-in page is about to call, while Clerk is still loading: the home page
  and the static game shell carry it, and a route that wants the ping adds a
  `HEAD` export of `warmUpResponse` rather than a route of its own.
  `ReadOnlyPanel` is how a game screen shows a waiting player the panels they
  can look at but not act on — their hand, the face-up cards, the market — by
  making the turn sheet inert rather than growing a second read-only copy of it.
  (The open-handed co-ops are the exception: every hand is public in Outbreak
  and Banned Islet, so `PlayerHands` renders them all, on or off your turn, and
  needs no wrapper.) `PlayerHands` is that stack of hands — one `ag-hand` panel
  per seat, ordered from the viewer outwards, carrying the colour dot and the
  now/next markers. A game passes its seats and its own card chip; it never
  loops the seats itself. Inside a turn sheet, every choice a player taps is a
  `BuildRow` — the icon, the name over what it costs, and the trailing tag —
  whether the row arms the board for a tap, fires a command outright, or picks
  one card out of a list. Wrap a run of them in `.ag-build-list` yourself, and
  don't hand-write that markup again. Picking an amount of each of several
  things — either side of a trade offer, a caravan's load — is
  `AmountSteppers`: one `ag-list` with a `Stepper` per row, shared by Kingdom
  Builder's trade board, Settlements & Cities' trade offers and Realm Arena's
  muster. A name that opens more about itself wears an `InfoButton` — the round
  "i" after it, which `AmountSteppers` draws per row given `onInfo` — and what
  it opens is an `InfoModal`, which takes `children` for anything that isn't
  headed copy (Realm Arena's stats tables).
  Every hover card on a result chart is a `ChartTooltip` — the round on a
  `LineChart`, a stacked bar's per-player breakdown on a `BarChart`.
  A game with undo ([`docs/undo.md`](./docs/undo.md)) shows it with `UndoButton`
  — one child of an `.ag-action-grid` row beside whatever it shares the row
  with — rather than another hand-built "↩ Undo". A game whose undoable move
  ends the turn holds it open for ten seconds first, and shows that hold with
  `UndoHold`: Pass now, Undo, the countdown and the hand-off it sends by itself.
  A game whose End turn is the player's own tap (Settlements & Cities, Fires
  Out) holds a tap that follows an undoable move with `useManualEndTurnHold`
  (in `src/utils/hooks/`) rather than keeping a deadline of its own.
  A block of the page that folds away behind its heading is a
  `DisclosureSection` (the home page's "What's new", the profile's unplayed
  games) — never another hand-written `<details className="ag-disclosure">`.
  An achievement's icon is drawn by `AchievementIcon` (its art, or its emoji
  when it has none or the art fails), and a profile's achievements are
  `AchievementsSection`, shared by both profile screens. An unlock is
  celebrated by the one `AchievementToaster` in `Providers`: a screen that
  already holds some of the viewer's unlocks hands them to
  `useAchievementToaster().offer` rather than toasting them itself.
- `src/utils/ui/` — pure presentation helpers: `games.ts` (per-game metadata:
  name, art, accent, players), `gameThemes.ts` (the themes each game can be
  played in — see [`docs/game-themes.md`](./docs/game-themes.md)),
  `avatar.ts` (deterministic avatar colours),
  `players.ts` (opponent summaries), `mapEdges.ts` (the wrap geometry `MapEdges`
  draws), `mapLabels.ts` (the label placement `MapLabelLayer` draws),
  `isometric.ts` (the 2:1 projection of a square grid whose squares stand at
  different heights — Realm Arena's board draws its battlefield through it:
  the per-height runs, the raised blocks' faces, the outline tile art standing
  on a square is cut to, the back-to-front order and which square a tap lands
  on, all of it turned a quarter at a time when the player turns the view),
  `achievements.ts` (a profile's achievement groups, a result's unlock rows,
  and what the toaster hasn't celebrated yet), `playbackClock.ts` (the one
  clock an action played over a board runs on — paused, resumed, sped up,
  skipped, over at its end).
- `src/utils/hooks/` — shared stateful logic, e.g. `usePlayerList` (the
  "who's playing" invite picker used by every game-setup screen),
  `usePlayback` — the one frame loop for whatever a board plays: a board mounts
  `PlaybackProvider` round what it draws, and everything that moves reads the
  time with `usePlaybackFrame`, setting its own SVG attributes (or a WebGL scene) through a ref
  with no React render a frame, rather than running a clock of its own
  ([`docs/isometric-animations.md`](./docs/isometric-animations.md) §4),
  `dataCache` — the tab's in-memory cache of what a screen fetched for the
  signed-in player, which `useRefreshableData` reads and writes for a screen
  that passes `cacheFor` (the board and the dashboard do; add it elsewhere only
  deliberately — a cached body is viewer-specific and paints before it is
  confirmed), and `useStoredValue` — the one place in the app that touches `localStorage`, so
  anything remembered per browser (a dismissed banner, a guest's first turn) is
  a call to it rather than another copy of the swallowed try/catch. A screen
  that wants the phone's pull-down-to-check-again gesture mounts
  `PullToRefresh` (in `src/components/ui/`, driven by `usePullToRefresh`) with
  its `useRefreshableData` `refresh`, rather than listening for touches itself.

New games should add their metadata to `src/utils/ui/games.ts` and reuse
`GameSetupLayout`, `UserInviteList`, and `TurnTimerSelect` for their setup
screen rather than rebuilding the form — and add themselves to the "What's
new" notes (see Working practices below).

Most also want a **game guide**: a `guide.ts` beside the game's `meta.ts`
exporting a `GameGuide`, wired into `GAME_GUIDES` in
`src/utils/ui/gameGuides.ts` and shown by the board screen through
`useGameIntro`. It's the how-to-play popup a player gets on their first match
and from the ⋮ menu after that. Five sections, `Goal` first, then `Your turn`
— and a sixth for a mode of play of its own, as Realm Arena's co-op has —
in the player's language — match the existing guides rather than restating the
GDD.

Most also want a **guided tutorial**: a `tutorial.ts` beside it, exporting a
`GameTutorial`, registered in `GAME_TUTORIALS` in
`src/utils/ui/gameTutorials.ts` and handed to `GameShell`'s `tutorial` prop.
It's the spotlight-and-card tour of the live board a player gets in place of
the guide's auto-show on their first match — see
[`docs/game-tutorials.md`](./docs/game-tutorials.md) for the full design.

Most also want **achievements**: an `achievements.ts` beside `meta.ts`,
exporting `achievements` typed `GameAchievement<YourResponseState>[]`, with one
import and one line in `GAME_ACHIEVEMENTS` in `src/utils/games/achievements.ts`
(a guard test fails if you forget). Three to six per game — a *played* and a
*won* rung and a couple that reward a way of playing. Ids are permanent, a match
check reads only what every viewer gets (its null view is pinned in
`hiddenHands.test.ts` in the same commit), and the file must stay browser-safe.
[`docs/achievements.md`](./docs/achievements.md) §11 is the full checklist.

A game can also offer **themes** — alternative dressings picked on the setup
screen, changing every name, every piece of copy and the art while changing no
rule, cost or number (Dice Cities ships three). That is a `themes.ts` beside the
game's `meta.ts`, one line in `GAME_THEMES` and one `<ThemeSelect>` on the setup
screen; [`docs/game-themes.md`](./docs/game-themes.md) is the full recipe,
including the guard test that keeps a theme from quietly changing a rule.

They also need a **share card**: the image a link to a game unfurls to in a
chat app (today a join link, `/join?code=PLUM`). Run `npm run icons` and
commit the `public/icons/og-game-<slug>.png` it writes. The script draws it
from the game's own `meta` — name, tagline, accent, art or glyph — so there
is nothing to design or list. The typeface it sets them in ships in
[`scripts/fonts/`](./scripts/fonts/README.md), so it no longer matters what is
installed on the machine: the run is reproducible, and every card other than
the one you added should come back byte-identical. One that doesn't is a card
whose game metadata changed without its card being redrawn — commit that too.

Any **hand-drawn art** a game brings — board maps, card faces — arrives from an
art tool essentially uncompressed, at megabytes a file. Save the export to
[`/art-masters`](./art-masters/README.md) under the path it mirrors in
`public/art`, then run `npm run optimise-art` and commit what it writes: it
quantises the served copy to roughly a third of the file at the same
resolution, and never touches the master. Kingdom Builder's world map
(`art-masters/kingdombuilder/v2`) is the one exception: it is served as a
single tile sheet, so run `npm run kb-atlas` instead and commit the
`public/art/kingdombuilder/v2/` files and
`src/games/KingdomBuilder/terrainAtlas.json` it writes. Art drawn as an SVG
rather than exported — Realm Arena's effect and item marks, its scorched
ground, its village terrain and its battle visuals — keeps the SVG as its master and renders the served PNG from it: run
`npm run ra-marks`. Realm Arena's characters are modelled in code too, in
`art-masters/realmarena/characters`, and `npm run ra-characters` renders each
one facing all eight isometric directions, standing and fallen, into the sprite
sheet the board draws its figures from and a team-colour layer it tints per seat,
plus the models as data for the 3D board (see
[`art-masters/README.md`](./art-masters/README.md)). `art-masters` is never
deployed, so nothing under `src/` may import from it.

## Design system conventions

- Font is Bricolage Grotesque (`var(--ag-font)`); palette is warm cream +
  terracotta, defined as `--ag-*` custom properties in `ag-theme.css`. Use
  the tokens, never hard-coded hex/oklch values in components.
- The app is mobile-first: screens render inside the centred `.ag-app`
  column defined in the root layout.
- Bootstrap is still a dependency and remains in use for the in-game board
  screens; prefer the `ag-*` design system for everything else.

## Working practices

- Preserve existing data flows and API contracts when restyling — the UI
  overhaul is presentational and must not change request/response shapes.
- **Indexes are built by the deploy, not the app.** The runtime connection has
  Mongoose's `autoIndex` and `autoCreate` off, so a new `schema.index(...)`
  reaches a database only through `npm run db:indexes` (the Vercel build and the
  E2E workflow run it; `scripts/sync-indexes.ts`). It builds the models that
  `src/utils/mongodb/models.ts` has imported, so a new model file gets one line
  there (`models.test.ts` fails without it). It only adds: dropping or changing
  an index is a manual step.
- **Keep the "What's new" notes up to date.** The bottom of the home page
  lists what has changed recently, in three groups — new games, enhancements
  and bug fixes — from `src/utils/ui/whatsNew.ts`. Any change a player would
  notice adds a line to the right group in the same PR: newest first, written
  in the player's language, and drop the oldest line once a group runs past
  ten. Internal-only work (refactors, docs, CI, dependency bumps) does not
  belong there. A group shows its newest three lines in full — game art and
  the detail — and the rest as compact title-only rows, so a line's `title`
  has to stand on its own once it has aged out of the top.
- **Only one "What's new" entry per feature branch.** A branch gets a single
  line, in whichever group fits the change as a whole — not one per commit and
  not one per fix along the way. Each group holds only ten lines, so a branch
  that adds three of its own evicts three shipped features that players can
  still see; a reader wants "what changed", not this branch's commit log. Two
  consequences worth spelling out:
  - **Work on something not yet released has no entry of its own.** Fixing a
    game (or a feature) that is still on a branch and has never shipped is
    part of building it, so it stays inside that thing's one line. Players
    never saw the broken version and cannot be told it is fixed.
  - **If one line genuinely can't cover the branch, widen the line rather than
    adding another** — and if the branch really is two player-visible changes,
    that is the signal it should have been two branches.
- **Name a docs-only branch `docs/…`, not `claude/…`.** `vercel.json` turns
  Git deployments off for `doc`/`docs` and anything under `doc/` and `docs/`,
  so a branch that only changes Markdown — a GDD, a design note, this file —
  skips a preview build it has no use for. Anything that touches `src/`,
  `public/` or the build keeps the ordinary branch name and its preview: the
  prefix is a statement that there is nothing to deploy, so a branch that
  starts as docs and grows a code change needs renaming, not an exception.
- Before committing UI changes, run `npm run build`, `npx tsc --noEmit` and
  `npm run lint`; all three must pass. If you touch the game engine
  (`src/utils/apiModels/`), also run `npm test` — the serializable-registry test
  guards that every game's rules module stays wired into the `GameLogic` barrel.
  CI runs all four on every push, and `lint` runs with `--max-warnings 0`, so a
  single warning fails it. A test that holds code to a time budget (Realm
  Arena's planner) goes in a `*.pace.test.ts` file: `vitest.config.ts` runs
  those alone, after every other file, so the budget isn't read against
  whatever else the runner is busy with. Don't skip the linter because a change "only touches
  presentation": the React Compiler rules it enforces (`react-hooks/refs` and
  friends) catch real mistakes that the type checker and the build both let
  through.
- **Measure a change to how Realm Arena's battlefield is drawn.** Run
  `npm run ra-bench -- --against main` before calling it faster (or no
  slower), and put its summary in the PR. It draws the real board over a
  frozen Hold Out battle on a throttled phone in headless Chromium and needs
  no build, sign-in or database
  ([`docs/realm-arena-rendering.md`](./docs/realm-arena-rendering.md) §2).
  `--renderers svg,three` measures the 3D experiment beside the isometric
  board ([`docs/realm-arena-3d.md`](./docs/realm-arena-3d.md)); in a
  container without a GPU, read its CPU numbers, not its GPU ones.
- **Review with the crew before committing** (see below). At minimum, run
  `caveman` over any UI, component, hook or game change.

## The review crew

Five reviewer agents live in `.claude/agents/`, each guarding one concern with
its own checklist skill in `.claude/skills/`. They **only report findings and
never edit** — apply the fixes yourself. Humans can invoke any skill directly
by name instead of going through the agent.

| Agent | Guards | Run it after | Skills |
|---|---|---|---|
| **`caveman`** 🪨 | simplicity and reuse — the component-reuse rule above | UI, components, hooks, game code | `caveman-review`, `spot-duplication` |
| **`locksmith`** 🔐 | security — auth, membership checks, forged input, secrets, rate limits | any API route, auth/identity change, `process.env` read, command-pipeline change | `locksmith-review` |
| **`croupier`** 🃏 | hidden information — what the server sends each player | response builders, DTOs, `specificGameState`, command outcomes, replay adapters, push copy | `croupier-review`, `trace-hidden-state` |
| **`gremlin`** 👹 | robustness — how it behaves when things go wrong | routes, saves, cron sweeps, data-fetching hooks, anything looping over players/games/devices | `gremlin-review` |
| **`rulebook`** 📖 | conventions and wiring — placement, registries, upkeep | adding a game, moving code between folders, changing shared metadata, anything player-visible | `rulebook-review` |

The concerns are deliberately separate, and each agent hands work outside its
own to the right one by name rather than half-reviewing it. Two boundaries are
worth remembering:

- A client **sending** a field it shouldn't control is the locksmith's; the
  server **sending back** something a player shouldn't see is the croupier's.
- The rulebook defers to the caveman on anything that is really duplication.

A change usually needs one or two of them, not all five — pick by what you
touched. Anything touching `src/app/api/**` is worth both a `locksmith` and a
`gremlin` pass; a new game wants `rulebook` and `croupier`.
