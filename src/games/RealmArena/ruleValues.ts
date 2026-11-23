import type { Cover } from "@/utils/games/battlefield/terrain";
import type { FactionId, PlayerCount } from "./characters";

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
     * How many of a warband's points buy one threat, for a horde bought in waves
     * (realm-arena-hold-out.md §4.2): its muster's and each wave's points budget,
     * as the Swarm's were, spent in threat. Absent before version 13.
     */
    POINTS_PER_THREAT?: number;
    BATTLE_ROUNDS: Readonly<Record<PlayerCount, number>>;
}
