import { rulesetOf, type RulesContext } from "./rulesets";
// Turn recap for Realm Arena — docs/games/realm-arena.md §17.3 PR 8.
//
// Every row is a line the match history already wrote, or says less than one:
// an action's row is the narration `RealmArenaAct` wrote for it, read off the
// replayed snapshot, so the log, the review and the recap tell a shot in the
// same words. That narration names a player by a history token, which the
// replay has already resolved, and it is the only way this adapter names
// anyone but the actor: the response carries no names of its own.
//
// The feed tells everything one character did in a turn as one row, so a
// move, a shot and a move back into cover read as one line (`byCharacter`),
// and then tells a run of quiet deeds by different characters — one player
// moving, hunkering down or going on watch with several in a row — as one row
// naming them all: "Alice moved their Archer, their Knight and their Mage"
// (`byDeed`). Everywhere else every command keeps a row of its own, a quiet
// move included: a reaction to a line of the match history is resolved to the
// recap row of the command that wrote it (the reaction route's
// `buildAllEvents` lookup), so folding a run of moves into one row there
// would leave the rest of the run unreactable.
//
// In co-op the enemy's turn is inside each player's End turn (§29.4), and its
// row comes with a row for each of the enemy's actions, built as a player's
// action's is (`actionRow`) from the line the warband wrote and what the
// action did (§29.9). Those lines name the enemy in plain text (`ownerToken`),
// and nobody can react to a line nobody acted.
//
// In fog of war (§27.2) every row is told to its viewer as their log tells it:
// an action their side saw none of has no row at all, as it has no line, and
// one it saw some of is told — its kind, its glyph, whom it hurt — from only
// what they were told of it (`Told`, which each command's outcome carries for
// its lines). The fog lifts as the battle ends, on the rows with the log.
//
// The muster stays sealed here as it does everywhere else (§17.2). A muster's
// row says only that it happened. Nothing below reads the command's `picks`,
// or the snapshot's `myMuster`, which holds the squad of whoever the feed is
// built for: a row is written once and read by whoever it's shown to.
import type { IRecapAdapter, IGameEvent, IRecapSummary, IRecapTip } from "@/utils/games/recap";
import type { ITurnSnapshot } from "@/utils/games/replay";
import type { IGameCommand, ICommandOutcome } from "@/utils/apiModels/GameLogic";
import type { IHistoryEntry } from "@/utils/games/history";
import { andList, capitalise, numberWord, pluralize } from "@/utils/ui/text";
import type { IRealmArenaSpecificGameStateResponse } from "./apiModels";
import { enemyTurnsOf, unnamed, type EnemyTurn, type IRealmArenaOutcome, type RealmArenaAct, type Told } from "./RealmArenaLogic";
import { battlefieldOf } from "./maps";
import { enemyNameOf, UNKNOWN_ENEMY, type CharacterId, type ItemId } from "./characters";
import { battleFrom, centreHolders, ENEMY_SIDE, isStanding, isWarband, sideOf, sideScore, TEAM_SIDE, type BattleEvent, type Fighter } from "./rules";
import { AREA_BLAST, centreInSight } from "./ui";

type RAState = IRealmArenaSpecificGameStateResponse;

/**
 * What a character did in a turn, when all of it was quiet, as sentences around
 * the character they name — "put" + "their Archer" + " on watch" — in the order
 * they happened (`steps`), and the player's name the line starts with. What
 * `byDeed` strings the same deeds by different characters together by. A
 * character told by its kind — "their Archer" — has that `character`, so
 * several of a kind can be counted: "two Archers".
 */
type Deed = { prefix: string; whom: string; character?: CharacterId; plural?: string; steps: { verb: string; tail: string }[] };

/**
 * An action's row as `toEvents` leaves it: the character that acted, what
 * happened, its line without the player's name it starts with, and — for one
 * that was nothing but quiet deeds — those, which is what `byCharacter`
 * and `byDeed` fold by. `postProcess` strips all four from every row, on every
 * path: `battle` holds each shot's roll.
 */
type RAEvent = IGameEvent & { fighter?: number; battle?: readonly BattleEvent[]; clause?: string; deed?: Deed };

const RA_MUSTER = "ra_muster";
const RA_BATTLE = "ra_battle";
const RA_KNOCKOUT = "ra_knockout";
const RA_FIREBALL = "ra_fireball";
const RA_DYNAMITE = "ra_dynamite";
const RA_THROWN = "ra_thrown";
const RA_HIT = "ra_hit";
const RA_MISS = "ra_miss";
const RA_RAISED = "ra_raised";
const RA_HEALED = "ra_healed";
const RA_MANOEUVRE = "ra_manoeuvre";
const RA_END_TURN = "ra_endturn";
const RA_BURNING = "ra_burning";
const RA_CENTRE = "ra_centre";
const RA_WON = "ra_won";

/**
 * The lines the battle's end writes, after the command that ended it and so
 * newest in the history: the winner's, and the final scores under it
 * (`CheckGameOver`).
 */
const BATTLE_END_LINES = 2;

/**
 * The glyph a row about an item leads with (§21.2). The board draws each
 * item's mark (`ITEM_ART`), but a recap row takes a glyph, as it does for
 * burning.
 */
const ITEM_GLYPH: Readonly<Record<ItemId, string>> = {
    fireFlask: "🔥",
    thunderFlask: "⚡",
    smokePot: "💨",
    healingDraught: "🧪",
};

function state(snapshot: ITurnSnapshot): RAState {
    return snapshot.specificGameState as RAState;
}

/**
 * The lines this command added to the history the viewer is told, newest
 * first: every one stamped with its id, under the battle's end if it ended it,
 * which the game type writes after it (`BATTLE_END_LINES`). Not counted off
 * the length the history grew by, since the fog lifting at the battle's end
 * brings back every line the viewer wasn't told before (§27.1).
 */
function newLines(prev: ITurnSnapshot, next: ITurnSnapshot, command: IGameCommand): IHistoryEntry[] {
    let at = 0;
    if (next.complete && !prev.complete) while (at < next.history.length && next.history[at].commandId === undefined) at++;
    while (at < next.history.length && next.history[at].commandId === command.id) at++;
    return next.history.slice(0, at);
}

/**
 * What `viewerId` was told of some events (§27.2): their own share of `told`,
 * in a battle fought in fog of war and not yet over — none for nobody in
 * particular — and all of them otherwise.
 */
function toldOf(told: Told | undefined, events: readonly BattleEvent[], viewerId: string | null, next: ITurnSnapshot): readonly BattleEvent[] {
    if (!told || next.complete) return events;
    return viewerId === null ? [] : told[viewerId] ?? [];
}

/**
 * What an action is told as: the row type and glyph of the most telling thing
 * it did — a knock-out over a fireball or a thrown item over a hit, and so on
 * down to a move, a stance or going on watch, which are quiet. The glyphs are
 * the ones the board shows the same events with (`eventLines`, ui.ts), or an
 * item's own (`ITEM_GLYPH`) where the board draws its mark.
 */
function actionKind(events: readonly BattleEvent[]): { type: string; glyph: string } {
    const has = (match: (event: BattleEvent) => boolean) => events.some(match);
    // A Bloater downs itself as it bursts (§31.2): that's no knock-out.
    if (has(event => event.kind === "downed" && event.by !== event.fighter)) return { type: RA_KNOCKOUT, glyph: "✕" };
    if (has(event => event.kind === "iceBall")) return { type: RA_FIREBALL, glyph: AREA_BLAST.iceBall.icon };
    if (has(event => event.kind === "fireball")) return { type: RA_FIREBALL, glyph: AREA_BLAST.fireball.icon };
    if (has(event => event.kind === "dynamite")) return { type: RA_DYNAMITE, glyph: AREA_BLAST.dynamite.icon };
    const thrown = events.find((event): event is Extract<BattleEvent, { kind: "thrown" }> => event.kind === "thrown");
    if (thrown) return { type: RA_THROWN, glyph: ITEM_GLYPH[thrown.item] };
    if (has(event => (event.kind === "shot" || event.kind === "struck") && event.damage > 0)) return { type: RA_HIT, glyph: "🎯" };
    // A Demolish that struck someone beside the cover hit them, as a strike does (§23.2).
    if (has(event => (event.kind === "demolished" || event.kind === "burst") && event.targets.length > 0)) return { type: RA_HIT, glyph: "💥" };
    // A strike that rolled and missed is a miss as a shot is.
    if (has(event => event.kind === "shot" || (event.kind === "struck" && event.missed === true))) return { type: RA_MISS, glyph: "🎯" };
    if (has(event => event.kind === "raised")) return { type: RA_RAISED, glyph: "✚" };
    const healed = events.find((event): event is Extract<BattleEvent, { kind: "healed" }> => event.kind === "healed");
    if (healed) return { type: RA_HEALED, glyph: healed.via === "draught" ? ITEM_GLYPH.healingDraught : "✚" };
    return { type: RA_MANOEUVRE, glyph: "👣" };
}

/**
 * The players whose characters an action hurt or knocked out — the actor's own
 * included, when a reaction caught them — or burning did as a turn began.
 */
function hurt(events: readonly BattleEvent[], fighters: readonly Fighter[]): string[] {
    const ids = events.flatMap(event => {
        switch (event.kind) {
            case "shot":
            case "struck": return event.damage > 0 ? [event.target] : [];
            case "fireball":
            case "iceBall":
            case "dynamite":
            case "thrown":
            case "demolished":
            case "burst": return event.damage > 0 ? event.targets : [];
            case "burned": return [event.fighter];
            case "downed": return [event.fighter];
            default: return [];
        }
    });
    return [...new Set(ids.flatMap(id => fighters.find(fighter => fighter.id === id)?.owner ?? []))];
}

type RowBase = Omit<IGameEvent, "type" | "title">;

/**
 * The quiet deeds a row can be folded by (`byDeed`), by the one event each
 * is told from: the words around the character `narrate` names.
 */
const QUIET_DEEDS: Partial<Record<BattleEvent["kind"], { verb: string; tail: string }>> = {
    moved: { verb: "moved", tail: "" },
    watching: { verb: "put", tail: " on watch" },
    hunkered: { verb: "hunkered", tail: " down" },
};

/**
 * How a character is named when its kind is not told, mirroring `whose`
 * (RealmArenaLogic.ts): all alike, so they can only be counted — by the plural
 * that goes after the count. A hidden enemy's (§29.3), a warband's seen by
 * someone else, one out of the viewer's sight (§27.2) or not found at all.
 */
const UNNAMED = new Map([
    ["one of its characters", "of its characters"],
    ["an enemy character", "enemy characters"],
    ["a character out of sight", "characters out of sight"],
    ["a character", "characters"],
]);

/**
 * Each kind of character by how `whose` names one of the actor's own: "their
 * Knight". Read off the line rather than the fighter, which in fog of war the
 * viewer's snapshot may no longer hold — an enemy that moved out of sight
 * (§27.2) — though the line still named it.
 */


/**
 * The deed an action was, when it was nothing else: a move, going on watch or
 * hunkering down, and no reaction to it, which would be an event of another
 * kind. Read off its events and the clause `narrate` wrote for them, which
 * must say it as expected (a hidden enemy's sneak is told as a move) and name
 * the character as `whose` does: by its kind, or as one of the `UNNAMED`.
 */
function quietDeed(events: readonly BattleEvent[], clause: string, prefix: string, context: RulesContext): Deed | undefined {
    const [first] = events;
    const words = first && QUIET_DEEDS[first.kind];
    if (!words || !events.every(event => event.kind === first.kind)) return undefined;
    const verb = first.kind === "moved" && first.sneaking ? "sneaked" : words.verb;
    if (!clause.startsWith(`${verb} `) || !clause.endsWith(words.tail)) return undefined;
    const whom = clause.slice(verb.length + 1, clause.length - words.tail.length);
    const steps = [{ verb, tail: words.tail }];
    const { CHARACTERS } = rulesetOf(context);
    const character = (Object.keys(CHARACTERS) as CharacterId[]).find(id => whom === `their ${CHARACTERS[id]!.name}`);
    if (character) return { prefix, whom, character, plural: CHARACTERS[character].plural, steps };
    return UNNAMED.has(whom) ? { prefix, whom, steps } : undefined;
}

/**
 * An action's row, a player's or the enemy's (§29.9): its line of the log as
 * the title, the kind and glyph of the most telling thing it did, whom it
 * hurt, and — for `byCharacter` and `byDeed` — the character that took it,
 * what happened, the line without the name `name` it starts with, and the
 * quiet deed it was, if only that.
 */
function actionRow(base: RowBase, name: string, title: string, events: readonly BattleEvent[], fighter: number | undefined, fighters: readonly Fighter[], context: RulesContext): RAEvent {
    const prefix = title.startsWith(`${name} `) ? `${name} ` : "";
    const clause = title.slice(prefix.length);
    return {
        ...base,
        ...actionKind(events),
        title,
        affectedIds: hurt(events, fighters),
        fighter,
        battle: events,
        clause,
        deed: quietDeed(events, clause, prefix, context),
    };
}

/**
 * The rows for what burning did as a turn began (§20.3), from the lines it
 * wrote for it: one row however many, never quiet — it hurt somebody, and it
 * may have knocked them out.
 */
function burningRow(base: RowBase, id: string, lines: readonly IHistoryEntry[], events: readonly BattleEvent[], fighters: readonly Fighter[]): IGameEvent[] {
    if (lines.length === 0) return [];
    const knockout = events.some(event => event.kind === "downed");
    return [{
        ...base,
        id,
        type: knockout ? RA_KNOCKOUT : RA_BURNING,
        glyph: knockout ? "✕" : "🔥",
        title: lines.map(entry => entry.text).join("; "),
        affectedIds: hurt(events, fighters),
    }];
}

/**
 * The centre points an End turn scored its own `owner`, read off its events
 * rather than the score, which a knock-out by burning as the next turn begins
 * can add to as well (§20.2).
 */
const centrePointsOf = (events: readonly BattleEvent[], owner: string): number =>
    events.reduce((sum, event) => sum + (event.kind === "scored" && event.reason === "centre" && event.player === owner ? event.points : 0), 0);

/**
 * How many lines of the viewer's log a warband's turn wrote: one for its
 * burning, one an action, each only when they were told of it (§27.2), and one
 * for its End turn, which everyone is.
 */
function enemyLineCount(turn: EnemyTurn, said: (told: Told | undefined, events: readonly BattleEvent[]) => readonly BattleEvent[]): number {
    return (said(turn.startedTold, turn.started).length > 0 ? 1 : 0)
        + turn.steps.filter(step => said(step.told, step.events).length > 0).length
        + (turn.ended ? 1 : 0);
}

/**
 * The rows of the enemy's turn inside an End turn (§29.4), from its lines of
 * the log, oldest first: what burning did as it began, a row for each of its
 * actions, built as a player's are, and one when its End turn held the
 * centre. Each is the warband's own row, keyed by the End turn's command, so
 * the board's dot and the feed's folding read it as the enemy's.
 */
function enemyRows(base: RowBase, command: IGameCommand, turn: EnemyTurn, lines: readonly IHistoryEntry[], next: RAState, said: (told: Told | undefined, events: readonly BattleEvent[]) => readonly BattleEvent[], key = `${command.id}:enemy`): IGameEvent[] {
    // The enemy's name as its lines begin with it: "The enemy" while a random
    // enemy is hidden (§29.3), its faction's once it's known — and a turn can
    // see the one give way to the other.
    const names = [UNKNOWN_ENEMY, ...next.enemy ? [enemyNameOf(next.enemy, next)] : []].map(capitalise);
    // "The Renegades moved…", and "The Renegades' Archer burned…" as well.
    const nameOf = (text: string) => names.find(name => text.startsWith(name)) ?? names[0];
    // Named as its latest line names it, which is the last to see a sighting.
    const own = { ...base, actorId: turn.owner, actorUsername: nameOf(lines.at(-1)?.text ?? "") };
    // While it's hidden, its rows tell what its characters did as the wire
    // does (`unnamed`), and a blast as the hit it was: a fireball, dynamite, a
    // Demolish or a Burst names the kind of character that did it.
    const notTeam = (id: number) => !next.fighters.some(fighter => fighter.id === id && !isWarband(fighter.owner));
    const told = (events: readonly BattleEvent[]): readonly BattleEvent[] => next.enemy ? events
        : unnamed(events, notTeam);
    // In fog, only the parts the viewer was told of wrote them a line (§27.2).
    let at = 0;
    const started = said(turn.startedTold, turn.started);
    const rows: IGameEvent[] = burningRow(own, `${key}:burning`, started.length > 0 ? lines.slice(at, ++at) : [], started, next.fighters);
    for (const [index, step] of turn.steps.entries()) {
        const events = said(step.told, step.events);
        if (events.length === 0) continue;
        const line = lines[at++];
        if (!line) break;
        rows.push(actionRow({ ...own, id: `${key}:${index}` }, nameOf(line.text), line.text, told(events), step.action.fighter, next.fighters, next));
    }
    const points = turn.ended ? centrePointsOf(turn.ended, turn.owner) : 0;
    if (points > 0) {
        rows.push({ ...own, id: `${key}:centre`, type: RA_CENTRE, glyph: "★", title: `${nameOf(lines[at]?.text ?? "")} ended their turn holding the centre, for ${pluralize(points, "point")}` });
    }
    return rows;
}

/** Turns one replayed Realm Arena command into its recap rows, as `viewerId` is told them. */
function toEvents(
    prev: ITurnSnapshot,
    next: ITurnSnapshot,
    command: IGameCommand,
    outcome: ICommandOutcome,
    viewerId: string | null = null,
): IGameEvent[] {
    if (!outcome.validMove) return [];
    const name = command.senderUsername;
    const base = {
        id: command.id,
        commandId: command.id,
        timestamp: command.timestamp,
        actorId: command.senderId,
        actorUsername: name,
    };
    const lines = newLines(prev, next, command);
    const said = (told: Told | undefined, events: readonly BattleEvent[]) => toldOf(told, events, viewerId, next);
    const rows: IGameEvent[] = [];

    switch (command.className) {
        case "RealmArenaMuster": {
            rows.push({ ...base, type: RA_MUSTER, glyph: "📜", title: `${name} mustered their squad` });
            if (state(prev).phase === "muster" && state(next).phase === "battle") {
                rows.push({ ...base, id: `${command.id}:battle`, type: RA_BATTLE, glyph: "⚔️", title: "The squads take the field, and the battle begins" });
            }
            break;
        }
        case "RealmArenaAct": {
            const { events: all = [], recap } = outcome as Partial<IRealmArenaOutcome>;
            // Nothing the viewer's side saw, so no line of their log and no row (§27.2).
            const events = said(recap?.told, all);
            if (events.length === 0) return [];
            // The oldest of its lines: one that ended the battle has the
            // winner's line above it, and that names an actor too.
            const title = [...lines].reverse().find(entry => entry.actorId === command.senderId)?.text ?? `${name} ${command.myString()}`;
            rows.push(actionRow(base, name, title, events, (command as Partial<RealmArenaAct>).action?.fighter, state(next).fighters, state(next)));
            break;
        }
        case "RealmArenaEndTurn": {
            // Always a row, since it closes the turn's window; only the centre
            // scoring makes it news, so a bare one is `quiet` — and only the
            // sender's own, not a warband's in the enemy's turn after it (§29.4).
            const { events = [], recap } = outcome as Partial<IRealmArenaOutcome>;
            const turns = enemyTurnsOf(recap);
            const points = centrePointsOf(events, command.senderId);
            if (points > 0) {
                // Counted off the squad as the feed's viewer sees it, so not
                // at all in fog of war, where they may see none of it (§27).
                const watching = state(next).fog ? 0
                    : state(next).fighters.filter(fighter => fighter.owner === command.senderId && isStanding(fighter) && fighter.banked > 0).length;
                rows.push({
                    ...base,
                    type: RA_CENTRE,
                    glyph: "★",
                    title: `${name} ended their turn holding the centre, for ${pluralize(points, "point")}`,
                    detail: watching > 0 ? `${watching} on watch` : undefined,
                });
            } else {
                rows.push({ ...base, type: RA_END_TURN, glyph: "⏳", title: `${name} ended their turn`, quiet: true });
            }
            // The rest of its lines, oldest first, under the battle's end if
            // this ended it: the enemy's turn, in co-op, then what burning did
            // as the next turn began, told in the line the hand-off wrote for
            // it (§20.3) — more than one where it burned a squad out and passed
            // on. None of them is anybody's to react to, and the next turn's
            // burning is nobody's at all: as the sender's, it would close their
            // own window after the enemy's turn, and they'd never see it.
            const ended = next.complete && !prev.complete;
            const rest = lines.slice(ended ? BATTLE_END_LINES : 0).filter(entry => entry.actorId === undefined).reverse();
            // Each warband turn of a block (§29.4) wrote its lines in turn, and its rows are keyed apart.
            let enemyLines = 0;
            for (const [index, turn] of turns.entries()) {
                const count = enemyLineCount(turn, said);
                rows.push(...enemyRows(base, command, turn, rest.slice(enemyLines, enemyLines + count), state(next), said, index === 0 ? undefined : `${command.id}:enemy${index}`));
                enemyLines += count;
            }
            rows.push(...burningRow({ ...base, actorId: "", actorUsername: "" }, `${command.id}:burning`, rest.slice(enemyLines), said(recap?.startedTold, recap?.started ?? events), state(next).fighters));
            break;
        }
        default:
            return [];
    }

    // The battle's end is written by the game type after the command that
    // ended it: the winner's line newest, the final scores beneath it.
    if (next.complete && !prev.complete && lines.length >= BATTLE_END_LINES) {
        rows.push({ ...base, id: `${command.id}:won`, type: RA_WON, glyph: "🏆", title: lines[0].text, detail: lines[1].text });
    }
    return rows;
}

/**
 * Folds every action one character took in a turn into the row of its first,
 * so a move, a shot and a move back into cover are one line: the first
 * action's narration, then each later one's without the player's name it
 * starts with ("Alice moved their Archer; then shot Bob's Knight with their
 * Archer (80%): a hit for 3; then moved their Archer"). A move straight after
 * the same move is told once, as one move broken up by reactions is
 * (`narrate`); anything else is told as often as it happened. The row takes
 * the kind of the most telling thing the character did all turn, and everyone
 * any of it hurt. Anything but an action — an End turn, a muster, the
 * battle's end — closes the turn. Characters who did only quiet deeds, the same
 * ones, are then told together by `byDeed`.
 */
function byCharacter(events: readonly RAEvent[]): RAEvent[] {
    const rows: RAEvent[] = [];
    // This turn's row for each character, by fighter id.
    let turn = new Map<number, number>();
    let actor: string | undefined;
    for (const event of events) {
        if (event.fighter === undefined || event.actorId !== actor) turn = new Map();
        actor = event.actorId;
        const at = event.fighter === undefined ? undefined : turn.get(event.fighter);
        if (at === undefined) {
            if (event.fighter !== undefined) turn.set(event.fighter, rows.length);
            rows.push(event);
            continue;
        }
        const first = rows[at];
        const battle = [...(first.battle ?? []), ...(event.battle ?? [])];
        const again = event.clause === first.clause && (event.battle ?? []).every(one => one.kind === "moved");
        rows[at] = {
            ...first,
            ...actionKind(battle),
            title: again ? first.title : `${first.title}; then ${event.clause}`,
            // Still all quiet while it is the same character's deed after deed.
            deed: again ? first.deed : first.deed && event.deed?.whom === first.deed.whom ? { ...first.deed, steps: [...first.deed.steps, ...event.deed.steps] } : undefined,
            affectedIds: [...new Set([...(first.affectedIds ?? []), ...(event.affectedIds ?? [])])],
            battle,
            // The clause the row now ends on, so a move repeating it is told once.
            clause: event.clause,
        };
    }
    return rows;
}

/**
 * Whom a run of deeds were done by or to, as one list, in order of first
 * appearance: "their Archer and their Knight", a kind seen again counted —
 * "their Knight, their Cleric and two Men-at-arms" — and so are the characters
 * told without one: "three of its characters", "two characters out of sight".
 */
function whomOf(run: readonly Deed[]): string {
    const kinds = new Map<string, { deed: Deed; count: number }>();
    for (const deed of run) {
        const key = deed.character ?? deed.whom;
        kinds.set(key, { deed, count: (kinds.get(key)?.count ?? 0) + 1 });
    }
    // The characters named first, then those told without a class: "their Knight and two characters out of sight".
    const groups = [...kinds.values()].sort((a, b) => Number(!a.deed.character) - Number(!b.deed.character));
    return andList(groups.map(({ deed, count }) => count === 1 ? deed.whom
        : `${numberWord(count)} ${deed.character ? deed.plural : UNNAMED.get(deed.whom)}`));
}

/** What makes two rows one to tell together: the same actor, as named, and the same words around the characters, in the same order. */
const deedKey = (row?: RAEvent) => row?.deed && `${row.actorId}|${row.deed.prefix}|${JSON.stringify(row.deed.steps)}`;

/**
 * Folds a run of consecutive rows that are the same quiet deeds by the same
 * actor — a player's, or the enemy's in co-op — into the row of its first, told
 * as one line: "Alice moved their Archer and their Knight", "The Renegades put
 * their Archer, their Knight and their Mage on watch". Where each did several
 * deeds, the same ones in the same order, the first names the characters and
 * the rest say "them": "Alice moved their Archer and their Knight, then
 * hunkered them down". A sneak only joins sneaks, and several characters of
 * a kind are counted, and so are those told without one: "moved two Archers",
 * "moved three of its characters". In fog of war that is only what the viewer
 * was told, regrouped: each of those characters already had its row (§27.2).
 * Anything between — a shot, a character's row that did more than quiet
 * deeds, an End turn — closes the run, so the order of the feed stays what
 * happened.
 */
function byDeed(rows: readonly RAEvent[]): RAEvent[] {
    const folded: RAEvent[] = [];
    let run: RAEvent[] = [];
    const close = () => {
        if (run.length < 2) folded.push(...run);
        else {
            const { prefix, steps } = run[0].deed!;
            const whom = whomOf(run.map(row => row.deed!));
            const clause = steps.map(({ verb, tail }, index) => `${verb} ${index === 0 ? whom : "them"}${tail}`).join(", then ");
            folded.push({
                ...run[0],
                title: `${prefix}${clause}`,
                clause,
                affectedIds: [...new Set(run.flatMap(row => row.affectedIds ?? []))],
                battle: run.flatMap(row => row.battle ?? []),
            });
        }
        run = [];
    };
    for (const row of rows) {
        if (!row.deed) {
            close();
            folded.push(row);
            continue;
        }
        if (deedKey(run[0]) !== deedKey(row)) close();
        run.push(row);
    }
    close();
    return folded;
}

/** Folds the feed by character (`byCharacter`), then its quiet deeds (`byDeed`); and strips what `toEvents` kept for it from every row. */
function postProcess(events: IGameEvent[], { forFeed }: { forFeed: boolean }): IGameEvent[] {
    const rows = forFeed ? byDeed(byCharacter(events)) : events as RAEvent[];
    return rows.map(({ fighter, battle, clause, deed, ...row }) => row);
}

function summarize(events: IGameEvent[], forUserId: string): IRecapSummary {
    // Still mustering: the only news is that the other squad is sealed.
    if (events.some(event => event.type === RA_MUSTER) && !events.some(event => event.type === RA_BATTLE)) {
        return {
            headline: "Your turn to muster 👋",
            subline: "The squads before yours are sealed. None is seen until every player has mustered.",
        };
    }

    let tail = ".";
    if (events.some(event => event.type === RA_WON)) {
        tail = " — the battle is over.";
    } else if (events.some(event => event.type === RA_KNOCKOUT)) {
        tail = " — someone was knocked out.";
    } else if (events.some(event => event.actorId !== forUserId && event.affectedIds?.includes(forUserId))) {
        tail = " — your squad took hits.";
    } else if (events.some(event => event.type === RA_CENTRE && event.actorId !== forUserId)) {
        tail = " — they held the centre.";
    } else if (events.some(event => event.type === RA_BATTLE)) {
        tail = " — the battle has begun.";
    }
    return {
        headline: "Your move 👋",
        subline: `${pluralize(events.length, "thing")} happened while you were away${tail}`,
    };
}

/** Where the battle stands for the viewer: "You're 5 points behind, with 4 of 5 standing, and the centre is contested." */
function tip(liveState: unknown, forUserId: string): IRecapTip | null {
    const gs = liveState as RAState | undefined;
    if (!gs || gs.phase !== "battle") return null;
    const squad = gs.fighters.filter(fighter => fighter.owner === forUserId);
    if (squad.length === 0) return null;

    // Once the battle has begun, every seat has mustered.
    const battle = battleFrom(battlefieldOf(gs.map, gs.blasted), { ...gs, seats: gs.mustered });
    // In co-op it's the team's score against the enemy's (§29.5); otherwise
    // the viewer's against the best of anyone else's.
    const [mine, best] = gs.coop
        ? [sideScore(battle, gs.scores, TEAM_SIDE), sideScore(battle, gs.scores, ENEMY_SIDE)]
        : [gs.scores[forUserId] ?? 0, Math.max(0, ...Object.entries(gs.scores).filter(([userId]) => userId !== forUserId).map(([, score]) => score))];
    const gap = mine - best;
    const score = gap === 0 ? "The scores are level" : `${gs.coop ? "The team is" : "You're"} ${pluralize(Math.abs(gap), "point")} ${gap > 0 ? "ahead" : "behind"}`;

    const holders = centreHolders(battle);
    // In fog of war, nobody seen there isn't nobody there (§27).
    const centre = holders.length === 0 ? (centreInSight(battle, forUserId) ? "the centre is empty" : "you can't see all of the centre")
        : holders.length > 1 ? "the centre is contested"
        : holders[0] === sideOf(battle, forUserId) ? "the centre is yours" : "the enemy holds the centre";

    return { glyph: "🏰", text: `${score}, with ${squad.filter(isStanding).length} of ${squad.length} standing, and ${centre}.` };
}

// Registered by the recap engine (src/utils/games/recap.ts), mirroring how
// replay.ts wires up its per-game replay adapters.
export const realmArenaRecapAdapter: IRecapAdapter = {
    className: "RealmArenaGameType",
    toEvents,
    postProcess,
    summarize,
    tip,
};
