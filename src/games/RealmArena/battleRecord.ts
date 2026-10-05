// Realm Arena's battle record (docs/games/realm-arena.md §28): what every
// character did in a battle — the damage it dealt and took, who it downed,
// what it healed, how its shots went — and the score and each squad's health
// at the end of every battle round, for the result page.
//
// None of it is kept on the game as it's played. It's read off the events
// each command returned, by watching the game-end replay step by step
// (`replayTurnByTurn`, driven by `recordBattle` in recordBattle.ts from this
// game's GAME_RESULT_STATS entry in GameResultData.ts): every one of them is told by the log, which every
// player reads, so nothing here is a secret once the battle is over — the
// rolls behind a shot are never read, only whether it landed.
//
// Pure: it reads a step's command, its outcome and the state after it, and
// imports nothing server-only.

import type { GameResultEvent } from "@/utils/apiModels/GameDataApi";
import type { IReplayStep } from "@/utils/games/replay";
import { CHARACTERS, type CharacterId } from "./characters";
import type { IRealmArenaSpecificGameState } from "./RealmArenaModels";
import { CHARACTER_IDS } from "./roster";
import { allied, battleRounds, ENEMY_SIDE, isWarband, knockoutPoints, sideOf, type BattleEvent, type BattleState, type Fighter } from "./rules";

/** What one player's characters of one kind did in a battle, pooled as their mastery is (§23.1). */
export interface FightingRecord {
    /** HP taken off enemies, burning it set among it: never more than they had left. */
    dealt: number;
    /** HP taken off its own side — its squad or an ally's — by a blast landing on them (§29.6). */
    friendlyFire: number;
    /** HP taken off it, by anyone. */
    taken: number;
    /** HP given back, by a Heal, a Purify or a healing draught. */
    healed: number;
    /** Enemies it downed, and the points that scored (§13.7). */
    knockouts: number;
    knockoutPoints: number;
    /** Times it was downed. A character raised can be downed again. */
    downed: number;
    /** Shots it took, and how many of them hit or grazed. */
    shots: number;
    landed: number;
    /** Overwatch shots and guard strikes (§13.4). */
    reactions: number;
}

export const NO_RECORD: Readonly<FightingRecord> = {
    dealt: 0, friendlyFire: 0, taken: 0, healed: 0, knockouts: 0, knockoutPoints: 0, downed: 0, shots: 0, landed: 0, reactions: 0,
};

/** Every count a record keeps: the one list, which the result's schema is written from too. */
export const RECORD_KEYS = Object.keys(NO_RECORD) as (keyof FightingRecord)[];

/** Two records summed: a player's whole squad, or one kind of character across every squad. */
export function addRecords(a: Readonly<FightingRecord>, b: Readonly<FightingRecord>): FightingRecord {
    const sum = { ...NO_RECORD };
    for (const key of RECORD_KEYS) sum[key] = a[key] + b[key];
    return sum;
}

export interface FightingRow extends FightingRecord {
    userId: string;
    character: CharacterId;
}

/**
 * A battle's record, by column: a column a player, and in co-op one more for
 * the enemy (`ENEMY_SIDE`), its warbands added together (§29.6) — the team
 * reads its players one by one, and the enemy as the one squad it fights.
 */
export interface BattleRecord {
    /** A row for every kind of character each column fought with, in seat order — the enemy last — and then the muster's. */
    fighting: FightingRow[];
    /** Each column's points from holding the centre; the rest of its score is knock-outs. */
    centrePoints: Map<string, number>;
    /** Each column's score at the end of every battle round. */
    pointsPerRound: Map<string, number>[];
    /** The HP each column had standing at the end of every battle round. */
    squadHpPerRound: Map<string, number>[];
    /** Every character downed, on its column's line, in the round it fell: `turnIndex` is that round's index. */
    losses: GameResultEvent[];
}

const keyOf = (userId: string, character: CharacterId) => `${userId}\u0000${character}`;

const copyOf = (records: ReadonlyMap<string, FightingRecord>) => new Map([...records].map(([key, record]) => [key, { ...record }]));

/**
 * Watches a battle's replay, a step at a time, and keeps its record. `seats`
 * is the turn order, and `sides` the battle's (`battleFrom`, §29.6): who is
 * whose ally, for friendly fire and knock-outs, and in co-op the warbands'
 * one column. Absent in a free-for-all.
 *
 * Undo: the one thing an undoable action can add to a record is healing — it
 * hurts nobody and rolls nothing (docs/undo.md). So the recorder keeps the
 * records as they stood before each action the game's own undo stack still
 * holds, and puts them back when one is taken back.
 */
export function battleRecorder(seats: readonly string[], sides?: BattleState["sides"]) {
    const lastRound = battleRounds(seats.length) - 1;
    const sided = { sides };
    /** The record's columns, and the one an owner's deeds go in. */
    const columns = sides ? [...seats, ENEMY_SIDE] : [...seats];
    const columnOf = (owner: string) => isWarband(owner) ? sideOf(sided, owner) : owner;
    /** Everyone who has been on the battlefield, kept after a dropped player's squad has left it. */
    const known = new Map<number, Pick<Fighter, "owner" | "character">>();
    /** Each one's HP, and who set it burning, after the last step. */
    let last = new Map<number, Pick<Fighter, "hp" | "burnedBy">>();
    let records = new Map<string, FightingRecord>();
    let undoable: Map<string, FightingRecord>[] = [];
    const centrePoints = new Map(columns.map(column => [column, 0]));
    const pointsPerRound: Map<string, number>[] = [];
    const squadHpPerRound: Map<string, number>[] = [];
    const losses: GameResultEvent[] = [];
    /** The battle round being played, from 0. */
    let round = 0;

    const recordOf = (id: number | undefined): FightingRecord | undefined => {
        const fighter = id === undefined ? undefined : known.get(id);
        if (!fighter) return undefined;
        const key = keyOf(columnOf(fighter.owner), fighter.character);
        const record = records.get(key) ?? { ...NO_RECORD };
        records.set(key, record);
        return record;
    };

    function tell(events: readonly BattleEvent[]) {
        const hp = new Map([...last].map(([id, fighter]) => [id, fighter.hp]));
        // Who set each one burning, as the step goes: an End turn holds the
        // enemy's turn and the next player's start (§29.4), so a fire can be
        // lit and burn in one step. An effect is told straight after the
        // attack that put it on.
        const burnedBy = new Map([...last].map(([id, fighter]) => [id, fighter.burnedBy]));
        let attacker: number | undefined;
        const wound = (by: number | undefined, target: number, damage: number) => {
            const taken = Math.min(damage, hp.get(target) ?? 0);
            hp.set(target, (hp.get(target) ?? 0) - taken);
            const victim = recordOf(target);
            if (victim) victim.taken += taken;
            const attacker = recordOf(by);
            if (!attacker) return;
            if (allied(sided, known.get(by!)?.owner, known.get(target)?.owner)) attacker.friendlyFire += taken;
            else attacker.dealt += taken;
        };
        for (const event of events) {
            if (event.kind === "shot" || event.kind === "struck" || event.kind === "fireball" || event.kind === "thrown" || event.kind === "demolished") attacker = event.fighter;
            switch (event.kind) {
                case "effect":
                    if (event.effect === "burning") burnedBy.set(event.fighter, event.change === "cleared" ? undefined : attacker);
                    break;
                case "shot": {
                    const shooter = recordOf(event.fighter);
                    if (shooter) {
                        shooter.shots += 1;
                        if (event.result !== "miss") shooter.landed += 1;
                        if (event.reaction) shooter.reactions += 1;
                    }
                    wound(event.fighter, event.target, event.damage);
                    break;
                }
                case "struck": {
                    const striker = recordOf(event.fighter);
                    if (striker && event.reaction) striker.reactions += 1;
                    wound(event.fighter, event.target, event.damage);
                    break;
                }
                case "fireball":
                case "thrown":
                case "demolished":
                    for (const target of event.targets) wound(event.fighter, target, event.damage);
                    break;
                case "burned":
                    // Credited to whoever set it alight, as its knock-out is (§20.2).
                    wound(burnedBy.get(event.fighter), event.fighter, event.damage);
                    break;
                case "healed": {
                    const healer = recordOf(event.fighter);
                    if (healer) healer.healed += event.hp;
                    hp.set(event.target, (hp.get(event.target) ?? 0) + event.hp);
                    break;
                }
                case "raised":
                    hp.set(event.target, event.hp);
                    break;
                case "downed": {
                    const fallen = known.get(event.fighter);
                    if (!fallen) break;
                    recordOf(event.fighter)!.downed += 1;
                    const by = event.by === event.fighter ? undefined : known.get(event.by);
                    const ally = allied(sided, by?.owner, fallen.owner);
                    if (by && !ally) {
                        const downer = recordOf(event.by)!;
                        downer.knockouts += 1;
                        downer.knockoutPoints += knockoutPoints(fallen.character);
                    }
                    const how = !by ? "" : ` by ${by.owner === fallen.owner ? "its own" : ally ? "an allied" : "an enemy"} ${CHARACTERS[by.character].name}`;
                    losses.push({ turnIndex: round, icon: "knockout", title: `${CHARACTERS[fallen.character].name} downed${how}`, seriesKey: columnOf(fallen.owner) });
                    break;
                }
                case "scored":
                    if (event.reason === "centre") centrePoints.set(columnOf(event.player), (centrePoints.get(columnOf(event.player)) ?? 0) + event.points);
                    break;
            }
        }
    }

    return {
        /** One step of the replay: its command and outcome, and the game's own state after it. */
        observe(step: Pick<IReplayStep, "command" | "outcome">, gs: IRealmArenaSpecificGameState): void {
            if (gs.phase !== "battle") return;
            const { className, id } = step.command as { className?: string; id?: string };
            if (className === "RealmArenaUndo") {
                records = undoable.pop() ?? records;
            } else {
                // Only an action can push the game's undo stack.
                const before = className === "RealmArenaAct" ? copyOf(records) : undefined;
                tell((step.outcome as { events?: BattleEvent[] }).events ?? []);
                if (before && gs.undoAnchorId === id) undoable.push(before);
            }
            // Whatever the game's stack has dropped since — its oldest, past
            // its depth, or all of it, on anything that can't be taken back
            // or a hand-off — can't be undone any more.
            undoable = undoable.slice(Math.max(0, undoable.length - (gs.undoStack ?? []).length));

            const fighters = gs.fighters ?? [];
            for (const fighter of fighters) {
                known.set(fighter.id, { owner: fighter.owner, character: fighter.character });
                // Starts its row, so a character that did nothing still has one.
                recordOf(fighter.id);
            }
            last = new Map(fighters.map(fighter => [fighter.id, { hp: fighter.hp, burnedBy: fighter.burnedBy }]));

            // A step counts towards the round it began in: an End turn that
            // closes a round, and any burning as the next one begins, are
            // that round's.
            const index = Math.min(round, lastRound);
            // A round no step began in — passed round the table twice in one
            // hand-off — reads as the one before it.
            for (let skipped = pointsPerRound.length; skipped < index; skipped++) {
                pointsPerRound.push(pointsPerRound[skipped - 1]);
                squadHpPerRound.push(squadHpPerRound[skipped - 1]);
            }
            const score = (column: string) => Object.entries(gs.scores ?? {}).reduce((sum, [owner, points]) => sum + (columnOf(owner) === column ? points : 0), 0);
            pointsPerRound[index] = new Map(columns.map(column => [column, score(column)]));
            // A dropped player's squad leaves the battlefield (§17.4 B2): their
            // line holds at what it had when they left, rather than reading as
            // wiped out — a squad that was keeps its fallen on the field.
            const ours = (column: string) => (fighter: Pick<Fighter, "owner">) => columnOf(fighter.owner) === column;
            const left = (column: string) => !fighters.some(ours(column)) && [...known.values()].some(ours(column));
            const before = squadHpPerRound[index] ?? squadHpPerRound[index - 1];
            squadHpPerRound[index] = new Map(columns.map(column => [column, left(column) ? before?.get(column) ?? 0
                : fighters.filter(ours(column)).reduce((sum, fighter) => sum + fighter.hp, 0)]));
            round = gs.roundsPlayed;
        },

        result(): BattleRecord {
            return {
                fighting: columns.flatMap(userId => CHARACTER_IDS.flatMap(character => {
                    const record = records.get(keyOf(userId, character));
                    return record ? [{ userId, character, ...record }] : [];
                })),
                centrePoints: new Map(centrePoints),
                pointsPerRound: [...pointsPerRound],
                squadHpPerRound: [...squadHpPerRound],
                losses: [...losses],
            };
        },
    };
}
