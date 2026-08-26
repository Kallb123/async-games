---
name: trace-hidden-state
description: >-
  Trace one hidden game field from the Mongoose schema to the bytes on the
  wire, and prove whether an opponent can read it. Use when checking a specific
  secret — a hand, a deck, a secret code, a kept ticket, a recorded dice roll —
  e.g. "can Bob see Alice's cards?", "does this field reach the client?", "prove
  the hand is redacted", "trace the secret code", "what's actually in the
  response?". The croupier agent uses this to prove a leak finding; it also
  stands alone as a quick check on one field.
---

# Trace hidden state

Prove — with a serialised payload, not a type signature — whether one field
reaches a player who should not see it. This is the croupier's magnifying
glass: `croupier-review` sweeps a diff, this follows a single secret end to
end.

## Why the wire and not the types

A DTO interface that omits a field does not remove it. Excess-property checks
don't apply to whole-object assignment or to spreads, so `gameState:
doc.gameState` and `{ ...playerState }` both type-check and both ship
everything. Every leak this repo has had type-checked cleanly and rendered
correctly on screen — the UI drew a count while the payload carried the hand.

The only question that settles it: **is the value in
`JSON.stringify(response)`?**

## The five hops

Pick the field, then walk them in order. Stop at the first hop that drops it —
that's the redaction. If you reach the end still holding it, that's the leak.

**1. Where it is stored.** Find it in `src/games/<Game>/<Game>Models.ts` — the
`specificGameState` sub-schema — or in `IGameData` for base fields.

```bash
grep -rn "FIELD" src/games/<Game>/
```

**2. How the response is built.** Read the game's `CreateDataResponse(viewerId)`
and the `gameStateToResponse(state, names, viewerId)` it calls. Three
questions:

- Is `viewerId` *read*, or only accepted? (`grep -c viewerId` on the converter —
  a signature that takes it and never uses it is the classic miss.)
- Is the field behind a `userId === viewerId` ternary, or handed to everyone?
- Is there a count alongside it (`cardCount`, `resourceCount`) — the shape that
  says the game meant to hide it?

**3. Whether the raw document rides along anyway.** Two specific carriers:

```bash
# commandHistory holds every move ever played, secrets included.
grep -n "gameState:" src/games/<Game>/<Game>Models.ts   # must be publicGameState(...)
# The sub-document itself.
grep -n "specificGameState:\|toObject()\|\.\.\.doc" src/games/<Game>/<Game>Models.ts
```

A field can be perfectly redacted in step 2 and still ship in `commandHistory`.

**4. The replay path.** The game's `IReplayAdapter.toResponseState` must take
the same `viewerId` and redact identically — otherwise the recap leaks what the
live response protects.

```bash
grep -n "toResponseState\|plannableCommands" src/utils/games/replay.ts
```

Also check the game's `plannableCommands`: it is a default-deny allowlist, and
a command that resolves against this field must not be on it.

**5. The prose paths.** Two places a secret escapes in English rather than
JSON: `gameState.history` lines (read by everyone in the game) and the push
copy built in `src/utils/firebase/notificationContent.ts` (lands on a lock
screen).

```bash
grep -rn "history.push\|history.unshift" src/games/<Game>/
```

## Prove it

Don't reason about it — serialise it. The pattern is
`src/utils/apiModels/games/hiddenHands.test.ts`: give the secret a value no
other field could plausibly contain, build the response for each viewer, and
substring-search the payload.

```ts
const BOB_CARD = { id: "bob-secret-card", /* … */ };

const wire = JSON.stringify(gameStateToResponse(state, NAMES, "u1")); // Alice asking

expect(wire).toContain("alice-secret-card");     // her own, still there
expect(wire).not.toContain("bob-secret-card");   // his, gone
```

Run the three viewers that matter — **the owner** (must keep it), **an
opponent** (must not get it), and **`null`** (recap/result replays: nobody's
hidden state, but counts still correct). A quick one-off is fine:

```bash
npx vitest run src/utils/apiModels/games/hiddenHands.test.ts
```

If a test doesn't exist yet for this game and the field is genuinely hidden,
that absence is itself worth reporting.

## What to report

- **The field** — `file:line` of the schema it lives on, and what it hides.
- **The hop that fails** — which of the five, with `file:line`.
- **The proof** — the substring found in the serialised response, for which
  viewer.
- **The fix** — the existing shape to copy: the `userId === viewerId` ternary
  plus a count, `publicGameState(...)` for the game state, threading `viewerId`
  into `toResponseState`, or dropping the command from `plannableCommands`.

If every hop drops it, say so — name the hop that does the redacting and the
viewers you checked, so the next reader knows it was actually proven and not
assumed. Do not stretch a public field (turn order, scores, counts, usernames,
already-played moves) into a finding.
