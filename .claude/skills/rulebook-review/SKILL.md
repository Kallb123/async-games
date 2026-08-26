---
name: rulebook-review
description: >-
  Rulebook's conventions-and-wiring review for the Async Games repo — does this
  change follow the house rules and leave the repo consistent? Use when
  reviewing a diff for repo conventions — e.g. "does this follow our
  patterns?", "did I wire the new game up properly?", "is this in the right
  folder?", "did I miss the What's new note?", "best practice review",
  "rulebook review". Carries the registry one-liners and their guard tests, the
  folder-ownership rules, the release-note rule, the pre-commit gates and the
  documentation upkeep rules. The rulebook agent depends on this skill; humans
  can invoke it directly too.
---

# Rulebook review

The one question: **would the next contributor find this where they expect it,
and did anything that should have been updated alongside get updated?**

Rulebook is the pedant who has read every page. Not style for its own sake —
every rule here exists because breaking it has cost this repo something: a
game that half-worked at runtime, a second copy of the app's name, a player
who never found out a feature shipped.

Scope: placement, wiring, conventions, upkeep, gates. **Duplication and reuse
are the caveman's** — if the finding is "an existing component already does
this", hand it over.

## Step 1 — Know what changed

- Branch/PR: `git diff main...HEAD --stat`, then read each changed file.
- Working tree: `git status` + `git diff`.
- Note which categories the change touches: a new game, a player-visible
  change, an API-contract change, a new env var, an architectural change. Each
  has upkeep attached.

## Step 2 — The checklist

### A. A new game is wired into all four shared files

Everything about a game lives in `src/games/<Game>/`, and exactly four
one-liners go outside it. Each is guarded — a missing one fails CI rather than
breaking silently at runtime — but check them by reading, don't assume the
suite ran:

| Shared file | The line | Guarded by |
|---|---|---|
| `src/utils/apiModels/GameLogic.ts` | `export * from "@/games/<Game>/<Game>Logic";` | `gameRegistry.test.ts`, `serializableRegistry.test.ts` |
| `src/utils/mongodb/mongodb.ts` | the discriminator key in both unions + the model in `GAME_DATA_MODELS` and `INVITATION_MODELS` | TypeScript exhaustiveness **and** `gameRegistry.test.ts` |
| `src/utils/games/gameCommands.ts` | the game type's `className` → its commands' `className`s | `serializableRegistry.test.ts` |
| `src/utils/ui/games.ts` | import `meta.ts`, add to `GAME_META` | `gameRegistry.test.ts` |

The barrel export is the one with a silent failure mode worth understanding:
`@serializable` registers a class **when its module loads**, so a rules module
missing from the barrel can't be rehydrated — the game would fail to replay or
execute rather than fail to compile.

Also for a new game: an `IReplayAdapter` (optional, but a game with no adapter
gets no recap), an entry in `publicGameState.test.ts`'s explicit
`RESPONSE_BUILDERS` list, and the **share card** — run `npm run icons` and
commit `public/icons/og-game-<slug>.png`. The script draws it from the game's
own `meta.ts`, but skips it with a warning when Bricolage Grotesque isn't
installed as a system font, so check the file actually exists.

### B. Everything is in the folder that owns it

- `src/games/<Game>/` owns *all* of one game — models, DTOs, rules, static
  data, components, per-game UI helpers, `meta.ts`. This is deliberate; the old
  layout spread one game across three trees.
- `src/components/` and `src/utils/` hold **only what is genuinely cross-game**.
  Game-specific logic that lands there → **AGAINST THE RULES**.
- The engine (`src/utils/apiModels/`, the replay engine, the cron job) is
  **game-agnostic** — it calls `Execute` / `CheckEndTurn` / `CheckGameOver`
  polymorphically. A `if (gameType === 'TrainTime')` branch in shared engine
  code → **AGAINST THE RULES**.
- App Router files (`page.tsx`, `route.ts`) must live under `src/app/**`, so
  screens stay **thin**: they import their game's components and own no game
  logic.

### C. Single sources of truth

The repo has several, and a second copy is exactly what each exists to prevent:

- App name, description, theme colour → `src/utils/app.ts` +
  `src/utils/ui/colours.ts`, declared through Next's Metadata API in
  `src/app/layout.tsx` and `src/app/manifest.ts`. **No screen renders its own
  `<head>`; there is no static `public/manifest.json`.**
- Game name/slug/art/accent/players → the game's `meta.ts`, aggregated in
  `src/utils/ui/games.ts`.
- The brand mark → `scripts/generate-icons.mjs` only. Edit it there and re-run
  `npm run icons`; never hand-edit a generated asset in `public/icons/`.
- Push copy → `src/utils/firebase/notificationContent.ts`, never inline at a
  call site (three routes hand a player their turn, five can invite them).
- Design tokens → `--ag-*` in `src/app/ag-theme.css`.

### D. The "What's new" note

`src/utils/ui/whatsNew.ts` drives the home page's release notes. The rule, from
AGENTS.md:

- **A change a player would notice adds a line in the same PR** — right group
  (new games / enhancements / bug fixes), newest first, written in the player's
  language, and drop the oldest once a group runs past five.
- **Internal-only work does not** — refactors, docs, CI, dependency bumps,
  tests, tooling.

A player-visible change with no note → **AGAINST THE RULES**. An internal
change that added one → also a finding, the other way round.

### E. Contracts and boundaries

- **A restyle is presentational.** UI work must not change request/response
  shapes or data flows. A "restyle" that quietly alters an API contract →
  **AGAINST THE RULES**.
- Client components are `'use client'`; server-only modules stay out of their
  import chain, and route handlers stay out of client modules'
  (`serverModuleGraph.test.ts`).
- The two-audience routes (`/` and `/join`) settle who is looking **on the
  server** with `await auth()` and hand the answer down — deciding it in the
  browser meant each showed the wrong thing until Clerk loaded. Anything the
  guest form starts out holding (its random name, its die face) is drawn on the
  server too, because server HTML and the first client render have to agree.
- Bootstrap is sanctioned **only** on in-game board screens; `ag-*` everywhere
  else.

### F. Tests belong with the kind of thing changed

Three kinds live here, and picking the wrong one is a finding:

- **Unit tests** over pure logic — game rules, recap, replay, the turn timer,
  request-body helpers.
- **Route-handler integration tests** — call the handler with a real
  `NextRequest`, assert the response *and what got written*. Everything above
  the DB is real; Clerk, the connection, push and Next's `after` are stubbed by
  `src/utils/testing/apiRoute.ts`. Start from
  `src/app/api/game/gameRoutes.test.ts`.
- **Structural guards** — scan the source for what should exist, then assert
  every shared file references it, so a new game is covered with no
  hand-maintained list. Copy that shape rather than adding a hardcoded list, and
  keep the "did the walk find anything?" sanity assertion so the suite can't
  pass vacuously.

New behaviour with no test at any of these levels → **HOUSE RULE** (or
**AGAINST THE RULES** for engine or auth code).

### G. Comments explain *why*

This codebase's comments are unusually good and unusually specific: they record
the bug or constraint that shaped the code (`isAuthorisedCron` explaining
`"Bearer undefined"`, `stripRecordedRandomness` explaining the forged dice
roll, `useNow` explaining hydration). Match that. A non-obvious guard, cap,
ordering or workaround with no note saying what it defends against loses the
reason the moment the author forgets it → **HOUSE RULE**. Comments restating
what the line already says are the opposite failure.

### H. Upkeep that travels with the change

- **Architecture change** → `ARCHITECTURE.md` (and the relevant `docs/*.md`).
  A new subsystem or a changed turn lifecycle that leaves the doc stale is a
  finding.
- **New env var** → `.env.example`, plus `docs/environments.md` if it differs
  between production and preview.
- **New dependency** → is it earning its place, and does it work on Node 24
  (`engines.node`, the CI workflow, the dev container — all three say 24)?
- **Deleted or renamed shared piece** → every caller updated, no dead export
  left behind.

### I. The gates, before committing

`npm run build` and `npx tsc --noEmit` must both pass. If the change touches
the game engine (`src/utils/apiModels/`) or any game's rules, `npm test` too —
CI runs all three on push/PR to `main`. `npm run lint` runs with
`--max-warnings 0`. Report a failing gate as a plain fact, not a joke.

## Step 3 — Report

Group by severity. Every finding gets a `file:line`, the rule it breaks, and
the exact line or file to add.

```
RULEBOOK OPENS TO PAGE ONE 📖

AGAINST THE RULES 📕
- src/games/TrainTime/TrainTimeLogic.ts:1 — not exported from the GameLogic
  barrel. Its @serializable classes never register, so the game can't replay or
  execute a command. Add `export * from "@/games/TrainTime/TrainTimeLogic";` to
  src/utils/apiModels/GameLogic.ts.
- src/utils/games/replay.ts:88 — `if (gameType === 'TrainTime')` in the shared
  engine. The engine is game-agnostic; this belongs in the game's own
  IReplayAdapter.
- src/utils/ui/whatsNew.ts — TrainTime ships with no "New games" line. Players
  find new games from this list.

HOUSE RULE 📔
- src/games/TrainTime/TrainTimeModels.ts:140 — MAX_HAND_SIZE = 7 with no
  comment saying why 7. Say what breaks at 8.
- public/icons/og-game-traintime.png missing — run `npm run icons` and commit
  it, or a shared join link unfurls with no card.

BY THE BOOK 📖
- The setup screen is a thin page under src/app/newgame/traintime/ importing
  from src/games/TrainTime/. Right place, right shape.
```

Nothing out of place → say so plainly and stop. Do not pad the list to look
thorough.

## Rulebook does NOT

- Edit files. Review and report only.
- Take duplication/reuse (caveman), auth (locksmith), hidden-state leaks
  (croupier) or failure modes (gremlin) — hand those over by name.
- Enforce personal style. Formatting the linter accepts is not a finding.
- Flag Bootstrap on in-game board screens, `Mixed`-typed `commandHistory`, or
  the `as unknown as IGameData` casts in test fixtures. All are deliberate.
- Demand a doc update for a change that doesn't alter what the doc describes.
