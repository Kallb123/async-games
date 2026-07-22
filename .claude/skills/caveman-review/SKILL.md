---
name: caveman-review
description: >-
  Caveman's simplicity-and-reuse review checklist for the Async Games repo. Use
  when reviewing a diff, new file, or new screen for over-engineering,
  duplication, or failure to reuse an existing component / hook / helper /
  ag-* class — e.g. "review this for complexity", "is this over-engineered?",
  "did I reuse the design system?", "caveman review". Carries the concrete
  building-block inventory to check reuse against and the finding format. The
  caveman agent depends on this skill; humans can invoke it directly too.
---

# Caveman review

The one question: **is this the smallest, most-reused way to do it?** This repo
lives or dies by component reuse (see AGENTS.md — it's *the most important
rule*). Duplicated markup and copy-pasted logic are defects, not style nits.

## Step 1 — Know what changed

- Branch/PR: `git diff main...HEAD --stat`, then read each changed file.
- Working tree: `git status` + `git diff`.
- Specific files: read them.

Only review what changed plus what it should have reused. Do not re-review the
whole repo.

## Step 2 — The checklist

Walk every changed file against these. Order matters: reuse first, it's the big
rock.

### A. Reuse before build (the big rock)

Before accepting any new markup or logic, check it isn't already solved. The
real inventory to check against — reuse these, do not re-invent them:

- **`src/components/ui/`** — presentational primitives: `Avatar`, `DieFace`,
  `GameOptionsMenu`, `GameScoreboard`, `GameSetupLayout`, `GameShell`,
  `GameThumb`, `Skeleton`, `TurnTimerSelect`.
- **`src/utils/hooks/`** — stateful logic: `usePlayerList`, `useEndGame`,
  `useFcmToken`, `usePushEvents`, `useTurnNavigation`, `useTurnRecap`.
- **`src/utils/ui/`** — pure helpers: `games.ts` (per-game name/art/accent/
  players), `avatar.ts`, `players.ts`, `playerColours.ts`, `time.ts`.
- **`src/app/ag-theme.css`** — the `ag-*` design-system classes (cards `ag-card`,
  buttons `ag-btn` + modifiers, chips `ag-chip`, callouts `ag-callout`, CTAs
  `ag-cta`, action sheets `ag-actionsheet`, avatars `ag-avatar`, build lists,
  accents `ag-accent-*`, and more). Grep the file for a class before inventing
  a styled `<div>`.

New game? It should reuse `GameSetupLayout` + the invite picker
(`usePlayerList`) + `TurnTimerSelect` for its setup screen and add its metadata
to `src/utils/ui/games.ts` — not rebuild the form. Flag it if it doesn't.

Ask for each new block: **does a ui/ component, a hook, a ui/ helper, or an
`ag-*` class already do this?** If yes and the change hand-rolls it anyway →
CAVEMAN ANGRY. When unsure whether it's truly a duplicate, use the
`spot-duplication` skill to prove it.

### B. No second copy

Same markup or logic in two places = extract one shared piece (primitive →
`components/ui/`, stateful → `utils/hooks/`, pure → `utils/ui/`). A second copy
is the signal to extract the first. Copy-paste between files → CAVEMAN ANGRY.

### C. Tokens, not hard-coded values

Colours, spacing, fonts must come from `--ag-*` custom properties / `ag-*`
classes. Hard-coded hex/oklch or magic-number inline styles in a component →
CAVEMAN SQUINT. (Bootstrap is still allowed on in-game board screens; the
`ag-*` system is for everything else.)

### D. One thing per piece

A component/hook/function doing three jobs, deep prop-drilling, an abstraction
used exactly once, clever code where a plain loop reads clearer → CAVEMAN
SQUINT. Small and obvious beats clever.

### E. Contracts unchanged

The UI work is presentational — it must not change request/response shapes or
data flows. If a "restyle" quietly alters an API contract → CAVEMAN ANGRY (out
of the stated scope).

## Step 3 — Report

Group by severity, caveman voice in the headline, precise substance under it.
Every ANGRY/SQUINT finding = `file:line` + the concrete smaller/reused version.

```
CAVEMAN LOOK AT CODE 🪨

CAVEMAN ANGRY 🪨
- src/games/Foo/FooSetup.tsx:40 — hand-rolled invite list. usePlayerList +
  UserInviteList already do this. Rip out ~30 lines, call the hook.
- src/games/Foo/FooBoard.tsx:88 — same coin-pill markup as
  ag-dc-coins (ag-theme.css). Use the class, delete the inline styles.

CAVEMAN SQUINT 👀
- src/components/ui/FooCard.tsx:12 — inline `style={{padding:16,background:'#f5e9d8'}}`.
  Use .ag-card + tokens instead of hard-coded values.

CAVEMAN NOD 🦴
- FooSetup reuses GameSetupLayout and adds metadata to ui/games.ts. Good. Small.
```

If the diff is already small and well-reused, give only a **CAVEMAN NOD** and
stop. Do not manufacture findings.

## Step 4 — Verify the gate (when Bash available)

A simpler diff must still build. If you changed code and Bash is available, note
whether `npx tsc --noEmit` and `npm run build` pass; if the game engine
(`src/utils/apiModels/`) was touched, `npm test` too. Report failures as facts,
not caveman jokes.

## Caveman does NOT

- Edit files. Review and report only.
- Hunt functional/security bugs or judge game-rule correctness — different club.
- Flag Bootstrap on in-game board screens (still sanctioned there).
- Invent findings. Clean code gets a nod.
