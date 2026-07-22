---
name: spot-duplication
description: >-
  Find copy-pasted markup/logic and missed reuse in the Async Games codebase.
  Use when checking whether new code duplicates something that already exists —
  another file, or an existing components/ui component, utils/hooks hook,
  utils/ui helper, or ag-* design-system class. Triggers: "is this a
  duplicate?", "did I copy-paste this?", "does a component already do this?",
  "spot duplication", "check for reuse". The caveman agent uses this to prove a
  duplication finding; it also stands alone for a quick reuse check.
---

# Spot duplication

Prove — with locations, not vibes — whether a block of code is a second copy of
something that already exists. Duplicated markup and copy-pasted logic are the
#1 defect in this repo (AGENTS.md). This skill finds them.

## What counts as duplication here

1. **Same block in two files** — near-identical JSX or logic pasted around.
2. **Re-inventing an existing shared piece** — hand-rolled code that an existing
   `components/ui/` component, `utils/hooks/` hook, `utils/ui/` helper, or
   `ag-*` class already provides.

Both are defects. The fix for (1) is to extract one shared piece; the fix for
(2) is to delete the bespoke code and call the thing that already exists.

## How to look

Given a block of new/changed code:

1. **Pull the fingerprints.** Grab distinctive tokens from the block — a
   className string, a JSX shape, a helper/hook name, a magic style value.

2. **Search the shared inventory first** (this is where reuse hides):
   - `src/components/ui/` — `Avatar`, `DieFace`, `GameOptionsMenu`,
     `GameScoreboard`, `GameSetupLayout`, `GameShell`, `GameThumb`, `Skeleton`,
     `TurnTimerSelect`.
   - `src/utils/hooks/` — `usePlayerList`, `useEndGame`, `useFcmToken`,
     `usePushEvents`, `useTurnNavigation`, `useTurnRecap`.
   - `src/utils/ui/` — `games.ts`, `avatar.ts`, `players.ts`,
     `playerColours.ts`, `time.ts`.
   - `src/app/ag-theme.css` — grep for an `ag-*` class that already styles the
     card / button / chip / pill / list row before accepting an inline-styled
     `<div>`.

   Useful sweeps:
   ```bash
   # Does an ag-* class already exist for this pattern?
   grep -oE '\.ag-[a-z0-9-]+' src/app/ag-theme.css | sort -u

   # Where else does this className / helper / hook appear?
   grep -rn "THE_FINGERPRINT" src --include=*.tsx --include=*.ts
   ```

3. **Search sibling code** — other files under `src/games/`, `src/components/`,
   `src/app/` for the same JSX shape or logic. Two or more hits (excluding the
   change itself) = duplication.

4. **Confirm it's really the same** — read both matches. Same intent and
   structure with cosmetic differences counts. Genuinely different behaviour
   that merely looks similar does not — say so rather than force a match.

## What to report

For each duplicate found:

- **The new location** — `file:line` of the copy under review.
- **The canonical target** — the existing file/component/hook/helper/`ag-*`
  class it duplicates, with its `file:line` or class name.
- **The fix** — "call `<Existing>` / `useExisting()` / the `.ag-x` class and
  delete the ~N bespoke lines", or "extract the shared block into
  `components/ui|utils/hooks|utils/ui`" when the copies are peers with no home
  yet.

If nothing duplicates, say so plainly — a clean, well-reused block is the goal,
not a failure to find fault. Do not stretch a loose resemblance into a finding.
