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
  `Avatar`, `GameThumb`, `TurnTimerSelect`, `GameSetupLayout`.
- `src/utils/ui/` — pure presentation helpers: `games.ts` (per-game metadata:
  name, art, accent, players), `avatar.ts` (deterministic avatar colours),
  `players.ts` (opponent summaries).
- `src/utils/hooks/` — shared stateful logic, e.g. `usePlayerList` (the
  "who's playing" invite picker used by every game-setup screen).

New games should add their metadata to `src/utils/ui/games.ts` and reuse
`GameSetupLayout`, `UserInviteList`, and `TurnTimerSelect` for their setup
screen rather than rebuilding the form.

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
- Before committing UI changes, run `npm run build` and `npx tsc --noEmit`;
  both must pass. If you touch the game engine (`src/utils/apiModels/`), also run
  `npm test` — the serializable-registry test guards that every game's rules
  module stays wired into the `GameLogic` barrel.
- After writing or changing UI, components, hooks, or game code, review it
  with the **`caveman`** agent before committing. It guards the component-reuse
  rule above — flagging duplicated markup, copy-pasted logic, and bespoke code
  that an existing component/hook/helper/`ag-*` class already provides. It only
  reports findings (never edits); apply the fixes yourself. Humans can also
  invoke its skills directly: `caveman-review` (full checklist) and
  `spot-duplication` (prove a block duplicates something that already exists).
