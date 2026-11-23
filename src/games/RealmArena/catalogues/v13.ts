// Rules version 13 (realm-arena-hold-out.md §4–§6): Hold Out rethought, against
// the Brood. Registered but not yet `CURRENT_RULESET_VERSION` (§8): nobody can
// create a battle under it until the last of its PRs, so it isn't shipped and
// each PR may still edit it; tests and the harness fight at it through
// `rulesVersion`. See ../rulesets.ts.
import type { Ability, AbilityId, Character, CharacterId, Faction, FactionId } from "../characters";
import { catalogueV12 } from "./v12";
import { HOLD_OUT_SITES_V13 } from "./holdOutSitesV13";

const ABILITIES = {
    ...catalogueV12.ABILITIES,
    // §4.3: the Brood Queen's hatchlings are the Brood's minion Skitterlings.
    hatch: { ...catalogueV12.ABILITIES.hatch, hatches: "broodSkitterling", description: "A minion Skitterling stands on a free square next to it, nearest an enemy in sight. It acts from its owner's next turn; at most 3 of its hatchlings stand at once" },
} satisfies Partial<Record<AbilityId, Ability>>;

const SWARM = catalogueV12.CHARACTERS;

const CHARACTERS = {
    ...catalogueV12.CHARACTERS,
    // §4.3: the Brood, the computer's own Swarm, drawn as the Swarm's characters it
    // names (`drawnAs`), with its own statlines and prices. `points` is what its
    // knock-out scores and what the planner values it at; `threat` what producing
    // it costs (§4.2). All *Proposed*.
    broodSkitterling: {
        name: "Skitterling", plural: "Skitterlings", role: "One of the horde: fast, and downed by anything", movement: 8, climb: SWARM.skitterling.climb, hp: 1,
        weapon: { name: "Claws", kind: "melee", damage: 2 }, abilities: [], points: 2, threat: 1, minion: true, drawnAs: "skitterling",
    },
    broodSpitter: {
        name: "Spitter", plural: "Spitters", role: "One of the horde: spits acid, and is downed by anything", movement: 5, hp: 1,
        weapon: { name: "Acid spit", kind: "ranged", damage: 2, accuracy: 70, range: 12, effect: "corroded" }, abilities: [], points: 3, threat: 2, minion: true, drawnAs: "spitter",
    },
    broodBloater: {
        name: "Bloater", plural: "Bloaters", role: "One of the horde: bursts among the enemy, and as it falls", movement: 4, hp: 1,
        weapon: { name: "Barbs", kind: "melee", damage: 1 }, abilities: ["burst"], points: 3, threat: 2, minion: true, burstsWhenDowned: true, drawnAs: "bloater",
    },
    broodRavager: {
        name: "Ravager", plural: "Ravagers", role: "Bulky brawler; hits hard", movement: 5, hp: 9,
        weapon: { name: "Scything talons", kind: "melee", damage: 4 }, abilities: ["rend"], points: 10, threat: 5, drawnAs: "ravager",
    },
    broodBroodmother: {
        name: "Broodmother", plural: "Broodmothers", role: "Leads the brood; mends its nests and its real ones", movement: 5, sight: SWARM.broodmother.sight, hp: 8,
        weapon: { name: "Talons", kind: "melee", damage: 3 }, abilities: ["regrowth"], points: 10, threat: 5, drawnAs: "broodmother",
    },
    // §4.3: the elites as in version 12, priced in threat for the Brood that fields them now.
    broodQueen: { ...catalogueV12.CHARACTERS.broodQueen, threat: 15 },
    carapaceBrute: { ...catalogueV12.CHARACTERS.carapaceBrute, threat: 12 },
    bileLobber: { ...catalogueV12.CHARACTERS.bileLobber, threat: 10 },
    // §5.1: the nests produce the Brood now, and are destroyed for good. *Proposed* 15 HP.
    nest: { ...catalogueV12.CHARACTERS.nest, hp: 15, role: "Where the Brood spawns every round; destroy every nest to break it" },
    // §5.2: the team's Shrine, which the team defends and loses with. Its HP is the
    // battle's (`SHRINE_HP`, set on the fighter as `maxHp`); this is a team of
    // one's. To the planner every HP of it is worth 3 points (*Proposed*).
    shrine: {
        name: "Shrine", plural: "Shrines", role: "What the team defends: if it falls, the battle is lost", movement: 0, hp: 30,
        weapon: { name: "None", kind: "melee", damage: 0 }, abilities: [], points: 0, structure: true, hpWorth: 3,
    },
} satisfies Partial<Record<CharacterId, Character>>;

/** Version 12's Swarm without what the Brood fields in its place: the elites, the themed waves and the nests are the Brood's now (§4.1). */
const { elites: _elites, waves: _waves, nest: _nest, ...swarm } = catalogueV12.FACTIONS.swarm;

const FACTIONS = {
    ...catalogueV12.FACTIONS,
    swarm,
    // §4.1: the Brood, which only the computer fields, bought in threat (§4.2) and
    // never past the horde's cap (§4.4). Its themes are version 12's buy lists,
    // with the Brood's characters in the Swarm's places.
    brood: {
        name: "The Brood",
        characters: ["broodSkitterling", "broodSpitter", "broodBloater", "broodRavager", "broodBroodmother"],
        elites: ["broodQueen", "carapaceBrute", "bileLobber"],
        nest: "nest",
        // §5.1: its themes by round, one every SPAWN_STEP_ROUNDS from round 1: the
        // buy lists each standing nest's threat is spent on. The elites come apart,
        // on their schedule.
        waves: [
            { name: "The Rush", buys: ["broodSkitterling", "broodSkitterling", "broodRavager"] },
            { name: "The Bile", buys: ["broodSpitter", "broodBloater", "broodSpitter"] },
            { name: "The Brutes", buys: ["broodRavager", "broodSkitterling", "broodBloater"] },
            { name: "The Queen", buys: ["broodRavager", "broodSpitter", "broodSkitterling", "broodBloater"] },
        ],
        // §5.1: a Lobber for each warband with a nest standing, a Brute for every two, one Queen. *Proposed*.
        eliteSchedule: [
            { round: 5, elite: "bileLobber", count: { perWarbands: 1 } },
            { round: 9, elite: "carapaceBrute", count: { perWarbands: 2 } },
            { round: 13, elite: "broodQueen", count: 1 },
        ],
        // Nobody musters the Brood: each warband is bought in threat (`horde`).
        readyMade: { 50: [], 60: [], 70: [], 80: [], 90: [], 100: [], 110: [], 120: [] },
        enemyName: "the Brood",
        computerOnly: true,
        horde: true,
    },
} satisfies Partial<Record<FactionId, Faction>>;

// §4.4: a horde warband stands at most 16 minions, beside at most four others.
// §5: Hold Out is fought against the Brood alone, whose nests produce it every
// round: 3 threat a standing nest each warband turn, 1 more every four rounds,
// after a starting horde of 10. 15 rounds for every team; a rally earned as
// rounds 5, 9 and 13 begin; 60 points for each round left when the Brood breaks;
// a Shrine of 20 HP and 10 more a player. All *Proposed*.
const RULES = {
    ...catalogueV12.RULES, HORDE_CAP: 16, HORDE_REAL_CAP: 4,
    SPAWN_THREAT: 3, SPAWN_STEP_ROUNDS: 4, STARTING_HORDE: 10, HOLD_OUT_ROUNDS: 15, RALLY_ROUNDS: [5, 9, 13], ROUND_BONUS: 60,
    SHRINE_HP: 20, SHRINE_HP_PER_PLAYER: 10, HOLD_OUT_ENEMY: "brood" as const, HOLD_OUT_SITES: HOLD_OUT_SITES_V13,
};

export const catalogueV13 = {
    ...catalogueV12,
    RULES,
    CHARACTERS,
    ABILITIES,
    FACTIONS,
};
