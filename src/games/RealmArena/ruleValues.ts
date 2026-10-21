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
    BATTLE_ROUNDS: Readonly<Record<PlayerCount, number>>;
}
