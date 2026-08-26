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
  `Avatar`, `GameThumb`, `TurnTimerSelect`, `GameSetupLayout`, `GameLibrary`
  (the filter-chips + featured + grid game browser, shared by `/newgame` and
  the public landing page). Every heading-and-body block on a page is a
  `Section`; `CollapsingSection` adds the animation for one that comes and
  goes, and `ListSection` adds the `ag-list`, its skeletons and its empty
  message. Never hand-roll an `ag-section-head` again.
- `src/utils/ui/` — pure presentation helpers: `games.ts` (per-game metadata:
  name, art, accent, players), `avatar.ts` (deterministic avatar colours),
  `players.ts` (opponent summaries).
- `src/utils/hooks/` — shared stateful logic, e.g. `usePlayerList` (the
  "who's playing" invite picker used by every game-setup screen).

New games should add their metadata to `src/utils/ui/games.ts` and reuse
`GameSetupLayout`, `UserInviteList`, and `TurnTimerSelect` for their setup
screen rather than rebuilding the form — and add themselves to the "What's
new" notes (see Working practices below).

They also need a **share card**: the image a link to a game unfurls to in a
chat app (today a join link, `/join?code=PLUM`). Run `npm run icons` and
commit the `public/icons/og-game-<slug>.png` it writes. The script draws it
from the game's own `meta` — name, tagline, accent, art or glyph — so there
is nothing to design or list, but it needs **Bricolage Grotesque installed as
a system font** and skips the cards with a warning when it isn't.

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
- **Keep the "What's new" notes up to date.** The bottom of the home page
  lists what has changed recently, in three groups — new games, enhancements
  and bug fixes — from `src/utils/ui/whatsNew.ts`. Any change a player would
  notice adds a line to the right group in the same PR: newest first, written
  in the player's language, and drop the oldest line once a group runs past
  five. Internal-only work (refactors, docs, CI, dependency bumps) does not
  belong there.
- Before committing UI changes, run `npm run build`, `npx tsc --noEmit` and
  `npm run lint`; all three must pass. If you touch the game engine
  (`src/utils/apiModels/`), also run `npm test` — the serializable-registry test
  guards that every game's rules module stays wired into the `GameLogic` barrel.
  CI runs all four on every push, and `lint` runs with `--max-warnings 0`, so a
  single warning fails it. Don't skip the linter because a change "only touches
  presentation": the React Compiler rules it enforces (`react-hooks/refs` and
  friends) catch real mistakes that the type checker and the build both let
  through.
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
