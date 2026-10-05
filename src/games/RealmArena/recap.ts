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
// move, a shot and a move back into cover read as one line (`byCharacter`).
// Everywhere else every command keeps a row of its own, a quiet move
// included: a reaction to a line of the match history is resolved to the
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
// The muster stays sealed here as it does everywhere else (§17.2). A muster's
// row says only that it happened. Nothing below reads the command's `picks`,
// or the snapshot's `myMuster`, which holds the squad of whoever the feed is
// built for: a row is written once and read by whoever it's shown to.
import type { IRecapAdapter, IGameEvent, IRecapSummary, IRecapTip } from "@/utils/games/recap";
import type { ITurnSnapshot } from "@/utils/games/replay";
import type { IGameCommand, ICommandOutcome } from "@/utils/apiModels/GameLogic";
import type { IHistoryEntry } from "@/utils/games/history";
import { capitalise, pluralize } from "@/utils/ui/text";
import type { IRealmArenaSpecificGameStateResponse } from "./apiModels";
import { enemyLineCount, unnamed, type EnemyTurn, type IRealmArenaOutcome, type RealmArenaAct } from "./RealmArenaLogic";
import { battlefieldOf } from "./maps";
import { enemyNameOf, UNKNOWN_ENEMY, type ItemId } from "./characters";
import { battleFrom, centreHolders, ENEMY_SIDE, isStanding, isWarband, sideOf, sideScore, TEAM_SIDE, type BattleEvent, type Fighter } from "./rules";
import { centreInSight } from "./ui";

type RAState = IRealmArenaSpecificGameStateResponse;

/**
 * An action's row as `toEvents` leaves it: the character that acted, what
 * happened, and its line without the player's name it starts with — what
 * `byCharacter` folds a character's turn by. `postProcess` strips all three
 * from every row, on every path: `battle` holds each shot's roll.
 */
type RAEvent = IGameEvent & { fighter?: number; battle?: readonly BattleEvent[]; clause?: string };

const RA_MUSTER = "ra_muster";
const RA_BATTLE = "ra_battle";
const RA_KNOCKOUT = "ra_knockout";
const RA_FIREBALL = "ra_fireball";
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

/** The lines this command added to the history, newest first. */
function newLines(prev: ITurnSnapshot, next: ITurnSnapshot): IHistoryEntry[] {
    return next.history.slice(0, Math.max(0, next.history.length - prev.history.length));
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
    if (has(event => event.kind === "downed")) return { type: RA_KNOCKOUT, glyph: "✕" };
    if (has(event => event.kind === "fireball")) return { type: RA_FIREBALL, glyph: "🔥" };
    const thrown = events.find((event): event is Extract<BattleEvent, { kind: "thrown" }> => event.kind === "thrown");
    if (thrown) return { type: RA_THROWN, glyph: ITEM_GLYPH[thrown.item] };
    if (has(event => (event.kind === "shot" || event.kind === "struck") && event.damage > 0)) return { type: RA_HIT, glyph: "🎯" };
    // A Demolish that struck someone beside the cover hit them, as a strike does (§23.2).
    if (has(event => event.kind === "demolished" && event.targets.length > 0)) return { type: RA_HIT, glyph: "💥" };
    if (has(event => event.kind === "shot")) return { type: RA_MISS, glyph: "🎯" };
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
            case "thrown":
            case "demolished": return event.damage > 0 ? event.targets : [];
            case "burned": return [event.fighter];
            case "downed": return [event.fighter];
            default: return [];
        }
    });
    return [...new Set(ids.flatMap(id => fighters.find(fighter => fighter.id === id)?.owner ?? []))];
}

type RowBase = Omit<IGameEvent, "type" | "title">;

/**
 * An action's row, a player's or the enemy's (§29.9): its line of the log as
 * the title, the kind and glyph of the most telling thing it did, whom it
 * hurt, and — for `byCharacter` — the character that took it, what happened,
 * and the line without the name `name` it starts with.
 */
function actionRow(base: RowBase, name: string, title: string, events: readonly BattleEvent[], fighter: number | undefined, fighters: readonly Fighter[]): RAEvent {
    return {
        ...base,
        ...actionKind(events),
        title,
        affectedIds: hurt(events, fighters),
        fighter,
        battle: events,
        clause: title.startsWith(`${name} `) ? title.slice(name.length + 1) : title,
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
 * The rows of the enemy's turn inside an End turn (§29.4), from its lines of
 * the log, oldest first: what burning did as it began, a row for each of its
 * actions, built as a player's are, and one when its End turn held the
 * centre. Each is the warband's own row, keyed by the End turn's command, so
 * the board's dot and the feed's folding read it as the enemy's.
 */
function enemyRows(base: RowBase, command: IGameCommand, turn: EnemyTurn, lines: readonly IHistoryEntry[], next: RAState): IGameEvent[] {
    // The enemy's name as its lines begin with it: "The enemy" while a random
    // enemy is hidden (§29.3), its faction's once it's known — and a turn can
    // see the one give way to the other.
    const names = [UNKNOWN_ENEMY, ...next.enemy ? [enemyNameOf(next.enemy)] : []].map(capitalise);
    // "The Renegades moved…", and "The Renegades' Archer burned…" as well.
    const nameOf = (text: string) => names.find(name => text.startsWith(name)) ?? names[0];
    // Named as its latest line names it, which is the last to see a sighting.
    const own = { ...base, actorId: turn.owner, actorUsername: nameOf(lines.at(-1)?.text ?? "") };
    // While it's hidden, its rows tell what its characters did as the wire
    // does (`unnamed`), and a blast as the hit it was: a fireball or a Demolish
    // names the kind of character that did it.
    const notTeam = (id: number) => !next.fighters.some(fighter => fighter.id === id && !isWarband(fighter.owner));
    const told = (events: readonly BattleEvent[]): readonly BattleEvent[] => next.enemy ? events
        : unnamed(events, notTeam).flatMap((event): BattleEvent[] => event.kind === "fireball" || event.kind === "demolished"
            ? event.targets.map(target => ({ kind: "struck", fighter: event.fighter, target, damage: event.damage, reaction: false }))
            : [event]);
    let at = 0;
    const rows: IGameEvent[] = burningRow(own, `${command.id}:enemy:burning`, turn.started.length > 0 ? lines.slice(at, ++at) : [], turn.started, next.fighters);
    for (const [index, step] of turn.steps.entries()) {
        const line = lines[at++];
        if (!line) break;
        rows.push(actionRow({ ...own, id: `${command.id}:enemy:${index}` }, nameOf(line.text), line.text, told(step.events), step.action.fighter, next.fighters));
    }
    const points = turn.ended ? centrePointsOf(turn.ended, turn.owner) : 0;
    if (points > 0) {
        rows.push({ ...own, id: `${command.id}:enemy:centre`, type: RA_CENTRE, glyph: "★", title: `${nameOf(lines[at]?.text ?? "")} ended their turn holding the centre, for ${pluralize(points, "point")}` });
    }
    return rows;
}

/** Turns one replayed Realm Arena command into its recap rows. */
function toEvents(
    prev: ITurnSnapshot,
    next: ITurnSnapshot,
    command: IGameCommand,
    outcome: ICommandOutcome,
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
    const lines = newLines(prev, next);
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
            const events = (outcome as Partial<IRealmArenaOutcome>).events ?? [];
            // The oldest of its lines: one that ended the battle has the
            // winner's line above it, and that names an actor too.
            const title = [...lines].reverse().find(entry => entry.actorId === command.senderId)?.text ?? `${name} ${command.myString()}`;
            rows.push(actionRow(base, name, title, events, (command as Partial<RealmArenaAct>).action?.fighter, state(next).fighters));
            break;
        }
        case "RealmArenaEndTurn": {
            // Always a row, since it closes the turn's window; only the centre
            // scoring makes it news, so a bare one is `quiet` — and only the
            // sender's own, not a warband's in the enemy's turn after it (§29.4).
            const { events = [], recap } = outcome as Partial<IRealmArenaOutcome>;
            const enemy = recap?.enemy;
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
            const enemyLines = enemy ? enemyLineCount(enemy) : 0;
            if (enemy) rows.push(...enemyRows(base, command, enemy, rest.slice(0, enemyLines), state(next)));
            rows.push(...burningRow({ ...base, actorId: "", actorUsername: "" }, `${command.id}:burning`, rest.slice(enemyLines), recap?.started ?? events, state(next).fighters));
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
 * battle's end — closes the turn.
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
            affectedIds: [...new Set([...(first.affectedIds ?? []), ...(event.affectedIds ?? [])])],
            battle,
            // The clause the row now ends on, so a move repeating it is told once.
            clause: event.clause,
        };
    }
    return rows;
}

/** Folds the feed by character (`byCharacter`); and strips what `toEvents` kept for it from every row. */
function postProcess(events: IGameEvent[], { forFeed }: { forFeed: boolean }): IGameEvent[] {
    const rows = forFeed ? byCharacter(events) : events as RAEvent[];
    return rows.map(({ fighter, battle, clause, ...row }) => row);
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
