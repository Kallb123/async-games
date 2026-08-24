# "Since you were last here" — implementation plan

A per-player recap shown when you open a game where it's your turn: a short
"here's what happened while you were away" screen listing the turns that
elapsed since your last move, a one-line summary, an optional strategic tip,
and a call-to-action into the board.

This was the planning document for the feature, and it records the agreed
design. **It is now implemented** — phase 1 and the roll-out in phase 2
shipped (minus the optional home-dashboard teaser, and phase 3's unification of
`GameHistoryList` was not done) — so read it for the *why*, and treat
[`turn-recap-and-planning.md`](./turn-recap-and-planning.md) as the current
state of the code. Where the two disagree, that one is right.

## 1. Motivation & what exists today

The app already stores two overlapping records of what has happened in a game,
and neither is quite what this feature needs:

- **`gameState.history: string[]`** — human prose, newest-first
  (`"Sarah rolled a 3 and climbed a ladder to square 68"`). Good wording, but
  **flat**: no timestamp, no actor id, no event type, no notion of *who was
  affected*. Rendered by [`GameHistoryList`](../src/components/games/GameHistoryList.tsx).
- **`gameState.commandHistory: IGameCommand[]`** — structured and timestamped
  (`timestamp`, `senderId`, `senderUsername`, `className`, recorded RNG), but
  `myString()` prose is weak (`"SnakesAndLadders DiceRoll!"`), and one command
  is not the same thing as one narrative beat.
- **`buildTimeline()`** ([`src/utils/games/replay.ts`](../src/utils/games/replay.ts))
  already replays `commandHistory` into per-turn snapshots carrying
  `{ command metadata, per-turn history, full reconstructed state }`. This is
  most of what the recap needs.

The gap the design mockups require is a **structured, timestamped, semantic
event feed**. Each recap row has a glyph, a title, a detail line, a relative
timestamp, an affected player ("…from **you**"), and a coloured dot. Neither
existing store provides that shape.

**"Since you were last here"** is then just: the slice of that feed from the
viewer's previous turn to now, plus a one-line summary, an optional tip, and a
CTA into the board.

## 2. The event model

One shared type becomes the source of truth for the recap (and, later,
potentially the turn-history list too):

```ts
interface IGameEvent {
    id: string;
    timestamp: string;          // ISO — from the producing command
    commandId: string;          // links back to the command in commandHistory
    actorId: string;            // who did it (Clerk userId) — also drives the dot colour
    actorUsername: string;
    type: string;               // game-defined semantic key, e.g. "built_landmark"
    glyph?: string;             // "🎡", "🐍", "☕"
    title: string;              // "Sarah rolled 3, built the Amusement Park"
    detail?: string;            // "3rd landmark · one from winning"
    affectedIds?: string[];     // players this event touched — drives "…from you"
}
```

Notes on the shape (reflecting the agreed tweaks):

- **No significance/emphasis field.** The coloured dot on each timeline row is
  the **actor's player colour**, not a good/bad signal. The UI maps
  `actorId → player colour` (see §5).
- `affectedIds` is what lets the component render second-person phrasing
  ("Tom's Café took 1 from **you**") when the viewer is in the affected set.

## 3. Producing events — replay adapters (chosen approach)

Events are **derived from `commandHistory` by replaying it**, not stored. This
reuses the existing [`buildTimeline()`](../src/utils/games/replay.ts) engine and
mirrors the `IReplayAdapter` convention already used for turn recap / planning.

Consequences of this choice:

- **No data migration.** Any game that already has a replay adapter
  (Snakes & Ladders, Dice Cities, Settlements & Cities) can reconstruct the
  event feed for *existing* games for free. Where a game already gates recap
  behind an availability flag (SAC's `recapAvailable`), the event feed inherits
  the same gate.
- **Smartthink opts out by simply not registering a recap adapter** — the same
  way planning is intentionally disabled there, since recapping opponents'
  guesses would leak deduction information.
- Some semantics (who was charged, how much) are only visible inside a
  command's `Execute`. Where the before/after snapshot pair plus the
  `ICommandOutcome` isn't enough to synthesize an event, the command records a
  small structured field — the same `recordedRoll` pattern already used for
  deterministic replay — and the adapter reads it.

### New shared piece: `IRecapAdapter`

A per-game adapter, registered by `gameType.className` exactly like
`IReplayAdapter`, living in a new `src/utils/games/recap.ts`:

```ts
interface IRecapAdapter {
    className: string;                       // gameType.className

    // Turn one replayed turn (the diff between two consecutive snapshots) into
    // zero or more display events.
    toEvents(
        prev: ITurnSnapshot,
        next: ITurnSnapshot,
        command: IGameCommand,
        outcome: ICommandOutcome,
    ): IGameEvent[];

    // The headline + subline at the top of the card, from the viewer's POV.
    summarize(events: IGameEvent[], forUserId: string): { headline: string; subline: string };

    // Optional green "tip" box. Return null to omit it.
    tip?(state: unknown, forUserId: string): { glyph: string; text: string } | null;
}
```

### New engine function: `buildEventFeed()`

In the same file, sitting on top of `buildTimeline()`:

```ts
buildEventFeed(gameData, userIdNameMap, forUserId): {
    hasRecap: boolean;
    events: IGameEvent[];     // since forUserId's last turn, oldest-first
    summary: { headline: string; subline: string };
    tip: { glyph: string; text: string } | null;
}
```

It builds the timeline, walks consecutive snapshots through the game's
`toEvents`, then **slices to "since the viewer's last turn."**

**Boundary rule.** The recap covers everything after the viewer's own last
completed move — i.e. after the last snapshot whose `command.senderId ===
forUserId`. If the viewer has never moved (they're first up) or nothing has
happened since, `hasRecap` is `false` and the client shows nothing. For
turn-timer skips (a player who never submitted a command that turn), fall back
to `lastTurnTimestamp` so a skipped player still gets a sensible window.

## 4. API

New route `POST /api/game/[gameid]/recap/route.ts` (sibling to the existing
`timeline` route, sharing its auth + membership guards):

```
→  { }                                    // viewer identified from auth()
←  {
     hasRecap: boolean,
     header: { gameName, url, accent, glyph },   // from the game's meta.ts
     summary: { headline, subline },
     events: IGameEvent[],
     tip: { glyph, text } | null,
     players: { [userId]: { username, colour } }, // for dot colours + "you"
   }
```

The route resolves usernames via `userIdListToUsernameMap` (as `timeline` does),
calls `buildEventFeed`, and returns `hasRecap: false` for games whose
`gameType.className` has no registered recap adapter (e.g. Smartthink) so the
client can no-op cleanly.

## 5. UI

### One reusable component: `TurnRecap`

`src/components/games/TurnRecap.tsx`, driven entirely by generic props so a
single component serves every game (per the component-reuse rule in
`AGENTS.md`). It renders the whole card from the mockups using `ag-*` design
tokens + the game's accent from `meta.ts`:

- dark header bar (game name + "Since your last turn"),
- "Your roll again 👋" style headline + subline,
- the dotted timeline: one row per event with the actor's-colour dot, glyph,
  bold `title`, and muted `detail · <relative time>`,
- the green tip card (only when `tip` is present),
- the terracotta CTA button.

**Dot colour = player colour.** The dot on each row is the *actor's* colour.
Player colours are currently a local `PLAYER_COLORS` array in the Snakes &
Ladders page; factor that palette into a shared helper in `src/utils/ui/`
(keyed by the player's index in `turnOrder`) and reuse it on both the board
scoreboard and the recap so the two always agree. The recap API returns each
player's resolved colour so the component doesn't re-derive it.

### Supporting helper

`formatRelativeTime(iso, now)` in `src/utils/ui/` → `"14h ago"`, `"yesterday"`.
`now` comes from `useNowToTheMinute()` so render never reads the clock itself.
Small, pure, unit-testable, reusable anywhere timestamps are shown.

### Surfacing it

A shared hook `useTurnRecap(gameId)` (`src/utils/hooks/`) fetches the recap once
on game-page load. When it's the viewer's turn and `hasRecap` is true, the game
page shows `TurnRecap` as an intro screen in front of the board; dismissing it
(or the CTA) reveals the board. For single-action games (SnL, Dice Cities) the
CTA can drop the player straight onto the roll control.

Optionally (phase 2) a condensed teaser — the headline + event count — can be
shown on the home dashboard's "my turn" card.

## 6. Per-game scope

Recap is opt-in per game, and which games have it moves as games are added.
The live list is the per-game table in
[`turn-recap-and-planning.md`](./turn-recap-and-planning.md#per-game-status) —
kept there so recap, planning and replay status are read in one place rather
than drifting apart across two docs.

The rule of thumb the table records: every multiplayer game gets a recap
adapter, except where recapping would leak hidden information (Smartthink's
deduction feedback), and solo games skip it entirely because nothing happens
while you're away.

## 7. Phasing

1. **Pilot (Snakes & Ladders):** event model + `IRecapAdapter` + `buildEventFeed`
   + `/recap` route + `TurnRecap` component + shared player-colour helper +
   `formatRelativeTime`, wired end-to-end into SnL. Mirrors how turn recap
   itself was proven on one game first.
2. **Roll out:** Dice Cities + SAC recap adapters; per-game heuristic tips;
   optional home-card teaser.
3. **Unify (optional):** re-render `GameHistoryList` from the same event feed,
   retiring the ad-hoc `history` strings so the turn log and the recap share one
   structured source.

## 8. The tip box

Optional, per-game, heuristic (chosen scope). Each game may implement
`IRecapAdapter.tip(...)` with hand-written, deterministic advice (e.g. SnL:
"You're on 41, one below the ladder at 42 — roll a 1 and you leap to 62").
Games that don't implement it simply omit the green box. No model calls in v1;
an LLM-generated tip could be a later enhancement.

## 9. Tests

Extend the registry-style tests (`src/games/gameRegistry.test.ts` pattern):
assert that every game which registers a **replay** adapter also registers a
**recap** adapter, minus an explicit opt-out list (Smartthink), so a new game
can't silently ship without recap. Determinism is inherited from the existing
replay engine, so no new replay-determinism harness is needed.

**As shipped, this is weaker than planned.** `gameRegistry.test.ts` only checks
that a `recap.ts` which *exists* is imported by the engine — nothing fails when
a game has none. Adapters are covered by per-game unit tests
(`DiceCities/recap.test.ts`, `SettlementsAndCities/recap.test.ts`). The
parity assertion above is still worth adding: Train Time was built without a
recap adapter, which is exactly what it was meant to catch.

## 10. New / touched files at a glance

**New**
- `src/utils/games/recap.ts` — `IGameEvent`, `IRecapAdapter`, `buildEventFeed`, adapter registry.
- `src/app/api/game/[gameid]/recap/route.ts` — the recap endpoint.
- `src/components/games/TurnRecap.tsx` — the reusable card.
- `src/utils/hooks/useTurnRecap.ts` — fetch + show-on-load logic.
- `src/utils/ui/time.ts` (or extend an existing helper) — `formatRelativeTime`.
- `src/utils/ui/playerColours.ts` (or extend `players.ts`) — shared colour palette.
- per-game recap adapters (start with Snakes & Ladders).

**Touched**
- game pages under `src/app/games/<game>/[gameid]/page.tsx` — wire in `useTurnRecap` + `TurnRecap`.
- Snakes & Ladders page — extract `PLAYER_COLORS` into the shared helper.
- `src/games/gameRegistry.test.ts` — the new adapter-parity assertion.

## 11. Related docs

- [`ARCHITECTURE.md`](../ARCHITECTURE.md) — overall system tour.
- [`turn-recap-and-planning.md`](./turn-recap-and-planning.md) — the replay
  engine this feature builds on.
</content>
</invoke>
