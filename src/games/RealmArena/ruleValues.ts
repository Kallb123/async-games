import type { Cover } from "@/utils/games/battlefield/terrain";
import type { Difficulty, FactionId, PlayerCount } from "./characters";

/** A cell of a map, by its column and row. */
export interface Cell { col: number; row: number }

/** Where a Hold Out map stands each warband's nests, in the warbands' order, and the team's Shrine (realm-arena-hold-out.md §5.1, §5.2). */
export interface HoldOutSites {
    nests: readonly (readonly Cell[])[];
    shrine: Cell;
}

/**
 * How a co-op battle's difficulty moves a Hold Out whose nests produce the
 * enemy (realm-arena-hold-out.md §6), each added to the rule it names: the
 * threat each standing nest adds a turn (`SPAWN_THREAT`), each nest's HP, and
 * the Shrine's (`SHRINE_HP`). Small steps, so the win can stay generous on
 * every difficulty while the stars carry the challenge.
 */
export interface HoldOutDifficulty {
    spawnThreat: number;
    nestHp: number;
    shrineHp: number;
}

/** Mechanics interpreted by the shared engine, selected with the match's catalogue. */
export interface RealmArenaRuleValues {
    ACTION_POINTS: number;
    BONUS_AP: number;
    ATTACK_AP: number;
    HUNKER_AP: number;
    REACTION_COST: number;
    MAX_ATTACKS_PER_TURN: number | null;
    BANK_CAP: number | null;
    MELEE_ROLLS: boolean;
    MELEE_ACCURACY: number;
    MELEE_RISE: number;
    FAR_SHOT_DISTANCE: number | null;
    OVERWATCH_PENALTY: number;
    HIGH_GROUND_BONUS: number;
    HIGH_GROUND_RISE: number;
    COVER_PENALTY: Readonly<Record<Cover, number>>;
    GRAZE_BAND: number;
    FLANK_BONUS: number;
    TEAM_HP_FACTOR: number;
    ARMOUR: number;
    ARMOUR_EXEMPT_FACTIONS: readonly FactionId[];
    ARMOURED_ENEMIES: readonly FactionId[];
    HOLD_OUT_ENEMY_STEPS: number;
    HOLD_OUT_PAIR_ROUNDS: number;
    CENTRE_POINTS: number;
    CENTRE_SCORES_FROM_ROUND: number;
    KNOCKOUT_DIVISOR: number;
    ASSIST_DIVISOR: number;
    SIGHT_RANGE: number;
    /**
     * Whether sight runs from eye to eye, so what hides a character depends on
     * the angle it's seen from (realm-arena.md §36), on a battlefield whose
     * hedges stand a full height. Without it, sight is blocked by anything a
     * full height above both ends, and hedges are the low ones nobody below
     * sees through (`Battlefield.levelSight`). Absent in the catalogues before
     * version 10, which played without it.
     */
    ANGLED_SIGHT?: boolean;
    /**
     * Whether a Hold Out wave heals nobody as it lands, each player of the team
     * owing a rally choice instead (realm-arena.md §39.4): Rally, Reinforce or
     * Resupply, made as their next turn begins. Absent in the catalogues
     * before version 12, where the wave rallies the whole team by itself.
     */
    RALLY_CHOICE?: boolean;
    /**
     * The points every Hold Out wave's budget grows by for each wave landed
     * before it (realm-arena.md §39.6), for a faction whose waves are themed
     * (`Faction.waves`). Absent before version 12.
     */
    WAVE_GROWTH_POINTS?: number;
    /** The most characters a themed wave buys, and the most a warband stands at after one (§39.6). Absent before version 12. */
    WAVE_CAP?: number;
    /**
     * The points each nest of a warband destroyed since its last wave took off
     * that warband's next wave's budget, never below half of it (realm-arena.md
     * §39.7). Absent before version 12, and for a faction without nests.
     */
    NEST_POINTS?: number;
    /**
     * The most minions (`Character.minion`) a horde warband (`Faction.horde`)
     * stands at once, survivors and hatchlings counted, beside at most
     * `HORDE_REAL_CAP` of its other characters and elites
     * (realm-arena-hold-out.md §4.4). Absent before version 13.
     */
    HORDE_CAP?: number;
    /** The most characters that aren't minions, elites among them, a horde warband stands at once (§4.4). Absent before version 13. */
    HORDE_REAL_CAP?: number;
    /**
     * Where set, a horde warband's minion cap is this many for each nest it has
     * standing, in place of `HORDE_CAP`: a nest destroyed takes its share of the
     * cap with it, so the warband stops refilling until it's under the new one.
     * An experiment for the balance harness's `--set`; no catalogue sets it.
     */
    HORDE_CAP_PER_NEST?: number;
    /**
     * The threat each standing nest adds to its warband at the start of each of
     * its turns, to spend at once (realm-arena-hold-out.md §5.1), in Hold Out
     * against a horde: its nests produce the enemy every round, and no wave
     * lands. Absent before version 13, where waves do.
     */
    SPAWN_THREAT?: number;
    /** Every this many rounds `SPAWN_THREAT` rises by 1 and the horde's theme moves on to the next (§5.1). Absent before version 13. */
    SPAWN_STEP_ROUNDS?: number;
    /** The threat each horde warband's starting horde is bought with at the first muster (§5.1). Absent before version 13. */
    STARTING_HORDE?: number;
    /** How many rounds Hold Out lasts where nests produce the enemy, whatever the team's size (§5.4). Absent before version 13. */
    HOLD_OUT_ROUNDS?: number;
    /** The rounds a rally is earned as they begin, on a schedule (§5.3). Absent before version 13. */
    RALLY_ROUNDS?: readonly number[];
    /**
     * The points the team scores for each round left before the cap when it
     * breaks the Brood, shared evenly among its players (§5.4). Held above the
     * most a round of fighting can score (`rulesets.test.ts`). Absent before
     * version 13.
     */
    ROUND_BONUS?: number;
    /** The Shrine's HP (§5.2): this, and `SHRINE_HP_PER_PLAYER` more for each player. Absent before version 13, which has no Shrine. */
    SHRINE_HP?: number;
    SHRINE_HP_PER_PLAYER?: number;
    /** The one faction Hold Out is fought against, with no choice of enemy (§5). Absent before version 13, where the host chooses. */
    HOLD_OUT_ENEMY?: FactionId;
    /**
     * Where each Hold Out map stands the nests and the Shrine (§5.1), by map id:
     * the ruleset's, not the map's (`BattlefieldMap.nests`), so moving one is a
     * new rules version rather than an edit to a map in play. Absent before
     * version 13, where the map's own nests stand.
     */
    HOLD_OUT_SITES?: Readonly<Record<string, HoldOutSites>>;
    /** How each difficulty moves the spawn, the nests and the Shrine (§6). Absent before version 13, where the difficulty moves the warbands' budget. */
    HOLD_OUT_DIFFICULTY?: Readonly<Record<Difficulty, HoldOutDifficulty>>;
    BATTLE_ROUNDS: Readonly<Record<PlayerCount, number>>;
}
