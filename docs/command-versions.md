# Command versions

Every command carries the version of its game's rules it was built for. The
client stamps it, the server refuses one that isn't current, and the recorded
version is how a replay runs an old move under the rules it was played by.

## Why

A game's rules change while games of it are in progress, and two things go
wrong without a version:

- **A stale client.** A tab opened before a deploy keeps running the old
  bundle. It builds moves for the old rules, and a move that is still legal
  under the new ones can mean something its player never chose. The server
  had no way to tell.
- **A replay.** The recap, the match review, the "your move" push body and the
  end-of-game charts all rebuild a game by replaying `commandHistory` from the
  start (`buildTimeline`). Every recorded move replays through *today's*
  `Execute`, so a changed rule silently rewrites how the moves before it
  played out. The replay had no way to know which rules a move was played by.

## The version

`GameMeta.commandVersion` in the game's `meta.ts` — one number per game,
starting at `FIRST_COMMAND_VERSION` (1) when absent. `gameCommandVersion(gameType)`
in `src/utils/ui/games.ts` reads it, and both sides of the wire use that one
function, so they disagree only when one of them is running an older release.

**Bump it** whenever a change to the rules would make a command built by the
previous release mean something different, or would replay a recorded command
differently. A change that doesn't touch what a command means (copy, art, a
new command class nobody's old client can send) needs no bump.

## The client

`useSubmitCommand` stamps `command.version` with `commandVersionFor(board)`
before sending. It is compiled into the bundle rather than echoed from a
response on purpose: a stale tab echoing the server's version would pass the
very check it exists to fail. Nothing is sent before the board has loaded,
when there is no game to name.

## The server

`POST /api/game/command` compares the command's `version` with the game's
current one:

| The command says | The route answers | The client |
|---|---|---|
| the current version | runs it, and records the version on the move | carries on |
| none at all | treats it as `FIRST_COMMAND_VERSION` (below) | — |
| an older version, or not a number | **426** "This game has been updated, reload to keep playing" | reloads onto the current release — once per version; a reload that comes back on the same bundle resyncs instead |
| a newer version | **409** "This game has just been updated, try again in a moment" | resyncs; a reload would fetch the same bundle |

A command with no version comes from a bundle built before commands carried
one. That bundle was built for the first version's rules, and it knows nothing
of the reload a 426 asks for — refusing it would leave every tab open across the
deploy that introduced versions failing its moves in silence. So it counts as
`FIRST_COMMAND_VERSION`, is recorded as that, and is refused like any other
stale client once its game moves past version 1.

The newer case is a client ahead of a deploy that hasn't reached the instance
serving it — rare, and fixed by trying again.

Commands the server builds itself are stamped by whatever builds them, so every
recorded command carries a version:

- a **follow-up** (`ICommandOutcome.followUpCommand`) inherits its trigger's —
  `runCommand` copies it, live and in a replay alike;
- a **turn-timeout** move (`resolveStalledTurn`) and a **`PlayerDropped`** get
  the game's current version;
- a **planned** move (`/api/game/[gameid]/timeline`) gets the current version:
  a plan is today's rules.

## The replay

A command's `Execute` reads the version it was played under with
`commandVersion(this)`, which answers `UNVERSIONED_COMMAND` (0) for a command
recorded before commands carried one. A rule that changes keeps its old branch:

```ts
async Execute(gameData: IGameData): Promise<ICommandOutcome> {
    const bonus = commandVersion(this) >= 2 ? 2 : 1; // v2 doubled the bonus
    …
}
```

Replay needs nothing else — the recorded move already holds its version, and
the command running it is the same class.

### When a rule must hold for a whole match

Branching on `commandVersion(this)` changes a rule from the next move on. A
rule that can't change halfway through a match — how often a blow lands, how
much HP a character has — is read from a version stamped on the game when it's
created instead, so a match started before the change plays the old rules to
the end and replays by them. Realm Arena's `rulesVersion` is the example
([`games/realm-arena.md`](./games/realm-arena.md) §30.13).

When an old branch is no longer worth keeping, drop it and raise the game's
`GameMeta.oldestReplayableCommandVersion`. `buildTimeline` then refuses (by
throwing) any game whose log holds a command older than that, or newer than the
current version — one recorded by a release this server isn't running — rather
than replaying it under rules it was never played by. Every caller already
treats a timeline it can't build as a recap or chart it goes without; the
timeline route answers 500. Absent, every version replays, back to
`UNVERSIONED_COMMAND`.

### Realm Arena catalogues

Realm Arena uses `CURRENT_RULESET_VERSION` in
`src/games/RealmArena/rulesets.ts` to stamp **new games**. It is independent of
`meta.commandVersion`: current commands may act in an older game, but read
that game's stored `rulesVersion`. Command versions still reject stale clients
and describe recorded command formats.

`rulesetOf(game)` selects the game's frozen character, ability, option, item,
effect and faction definitions. An unstamped game always selects the legacy
catalogue; it never defaults to the newest release. Unknown rules versions
throw rather than silently using different rules. Existing games need no
backfill. No per-unit version is stored.

To release changed units or abilities:

1. Add a catalogue (for example `catalogues/v8.ts`) derived from the previous
   released catalogue. Override the changed entries; leave shipped catalogues
   untouched. Keep stable character and ability ids, including retired ones.
2. Register and deeply freeze the new catalogue in `RULESETS`, then advance
   `CURRENT_RULESET_VERSION`. Keep every old registry entry pointing at its
   original catalogue. `currentRuleset` is derived from that registry.
3. For changes to ability **behavior** in code, branch on the game's
   `rulesVersion` and retain the older implementation. A data catalogue cannot
   preserve behavior if its execution code is overwritten. Bump
   `meta.commandVersion` when older clients would construct or display a move
   differently, as for any other rules change.
4. Pass the game/battle context to catalogue helpers. Omitting context selects
   the current catalogue for setup, profiles and admin tools; passing a game
   without a stamp selects legacy. Preserve `rulesVersion` in filtered views,
   snapshots and replay settings.
5. Test old and new games under the same current commands, including muster,
   validation, effects, previews, undo and replay. `rulesets.test.ts` simulates
   a future catalogue without shipping any balance change.

New units created by muster or Hold Out reinforcement waves use the game's
catalogue too. Responses carry the selected maximum HP so both board renderers
can draw the right bars without looking up the current catalogue.
