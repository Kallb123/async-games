import type { GameGuide } from "@/utils/ui/gameGuides";
import { ABILITIES, CHARACTERS, COOP_PLAYERS, EFFECTS, FACTIONS, ITEMS, THROW_RANGE } from "./characters";
import { RANK_XP } from "./mastery";
import { ruleValuesOf, rulesetOf, type RulesContext } from "./rulesets";
import type { HoldOutDifficulty } from "./ruleValues";
import { hatchClause, HOLD_OUT_STAR_INFO, nestsProduce, ACTION_POINTS, ARMOUR, ASSIST_DIVISOR, ATTACK_AP, CENTRE_POINTS, CENTRE_SCORES_FROM_ROUND, COVER_PENALTY, FLANK_BONUS, GRAZE_BAND, HIGH_GROUND_BONUS, HUNKER_AP, KNOCKOUT_DIVISOR, FAR_SHOT_DISTANCE, MELEE_ACCURACY, OVERWATCH_PENALTY, REACTION_COST, SIGHT_RANGE, TEAM_HP_FACTOR } from "./rules";

// The how-to-play primer shown from the game-options menu, and the reference
// text behind the guided tour (tutorial.ts), which takes the guide's place on
// a player's first match (see useGameIntro). Five sections, as
// docs/games/realm-arena.md §17.3 PR 9 lists them: the goal and the muster
// (and mastery's options, §23), a turn (and fog of war, §27), what AP buy (and the effects and
// items, §20, §21), cover and flanking, and overwatch and guard — and a sixth
// for co-op against the computer (§29.9), which changes who is on whose side
// but not how a turn is played, and names the factions it can be fought against (§31).
//
// The options the goal names — an ability that joins a character's pool, or
// the Mage's bolt swapped in — are the rank-1 ones of characters.ts's OPTIONS
// as rules version 12 reads them: a new option of another kind needs that
// sentence widening. The guide describes the released rules, so the older
// battles' swaps are not told here.
//
// Map-agnostic: the battlefield is picked by the number of players, so no
// section names a gate or a tower of one fort. The tunable numbers — costs,
// penalties, scores, speeds — come from the rules themselves, so a rebalance
// can't leave the guide behind.

// The optional values of the current ruleset the Hold Out text states: present from version 12.
const { WAVE_GROWTH_POINTS = 0, WAVE_CAP = 0, NEST_POINTS = 0 } = ruleValuesOf();

const lowerFirst = (text: string): string => text.charAt(0).toLowerCase() + text.slice(1);

/**
 * Hold Out where the nests produce the enemy (rules version 13, realm-arena-hold-out.md §5, §6),
 * told from that ruleset's own values. `context` is the rules it is told at: none is the current
 * ruleset, which is what the guide reads.
 */
export function brokenBroodText(context?: RulesContext): string {
    const rules = ruleValuesOf(context);
    const { SPAWN_STEP_ROUNDS = 0, HOLD_OUT_ROUNDS = 0, ROUND_BONUS = 0, SHRINE_HP = 0, SHRINE_HP_PER_PLAYER = 0, RALLY_ROUNDS = [], HOLD_OUT_DIFFICULTY } = rules;
    const { CHARACTERS: characters } = rulesetOf(context);
    const [first = 0, second = 0, third = 0] = RALLY_ROUNDS;
    const easy = HOLD_OUT_DIFFICULTY?.easy;
    const hard = HOLD_OUT_DIFFICULTY?.hard;
    const stout = Math.round((rules.TEAM_HP_FACTOR - 1) * 100);
    return `In Hold Out you fight the Brood alone, and defend a Shrine. Each warband has two nests, ${characters.nest.hp} HP each, and every round they hatch more of the Brood — the more nests standing, the more — with a little more each ${SPAWN_STEP_ROUNDS} rounds. Break the Brood by destroying every nest, and you win on the spot; otherwise hold the Shrine to round ${HOLD_OUT_ROUNDS}, whatever the size of your team. You lose if the Shrine falls or everyone is down. The Shrine has ${SHRINE_HP} HP and ${SHRINE_HP_PER_PLAYER} more for each of you, and anything hurts it, your own fireballs and flasks too. A nest destroyed never regrows, anything that hurts a character hurts it, and it never moves or fights. The Brood's minions — Skitterlings, Spitters and Bloaters — have 1 HP and fall to any damage, but a Bloater downed by anything but its own burst bursts where it falls. The Brood has a theme, each ${SPAWN_STEP_ROUNDS} rounds: the Rush, the Bile, the Brutes, then the Queen. In round ${first} come Bile Lobbers, one for each warband with a nest standing; in round ${second}, a ${characters.carapaceBrute.name} for every two; in round ${third}, the ${characters.broodQueen.name}, who hatches Skitterlings beside her — down her first. Your characters have ${stout}% more HP than usual in Hold Out. A rally is earned as rounds ${first}, ${second} and ${third} begin, and whenever a warband's last nest falls: as your next round begins you choose one, never two rounds running, and none is lost. Rally gives every standing character of yours half its HP back, Reinforce stands up one downed character at half its HP, Resupply hands back each used item, and Mend gives the Shrine half its HP back; nothing else heals it. Break the Brood early and the team scores ${ROUND_BONUS} points for each round left, shared. A win earns stars: ${HOLD_OUT_STAR_INFO.held.name} (${lowerFirst(HOLD_OUT_STAR_INFO.held.reason)}), ${HOLD_OUT_STAR_INFO.broke.name} (${lowerFirst(HOLD_OUT_STAR_INFO.broke.reason)}), and ${HOLD_OUT_STAR_INFO.unscathed.name} (${lowerFirst(HOLD_OUT_STAR_INFO.unscathed.reason)}). The difficulty the host chose moves the nests and the Shrine: on Easy ${difficultyWords(easy)}; on Hard ${difficultyWords(hard)}. ${holdOutGround("the Brood closes in", "the Brood")}`;
}

/** How a difficulty step reads in a sentence, in the player's words: what the nests hatch, their HP and the Shrine's, each as a change. */
function difficultyWords(step: Readonly<HoldOutDifficulty> | undefined): string {
    if (!step) return "nothing changes";
    const hp = (n: number) => `${Math.abs(n)} HP ${n > 0 ? "more" : "fewer"}`;
    const hatch = hatchClause(step.spawnThreat);
    return `${hatch ? `${hatch} and have` : "the nests have"} ${hp(step.nestHp)}, and the Shrine has ${hp(step.shrineHp)}`;
}

/** The ground Hold Out is fought on, told by what closes in on the team and by what comes at it through the village: the same sentences in every ruleset but for the foe's name. */
function holdOutGround(closesIn: string, foe: string): string {
    return `Hold Out can also be fought on the Sacked Fort, where your team starts in the ruined keep in the middle and ${closesIn} from every edge — or, for three or four of you, on the Sunken Village, where you start on a green sunk below the village and ${foe} comes at you through lanes, hedges and roofless cottages. A hedge stands a full height, like a wall, so nobody climbs or sees through it from the same ground, but a fireball or a flask burns it away. A team of four plays only Hold Out, on the Sacked Fort or the Sunken Village; Hold the Centre and the gate forts seat up to three.`;
}

/** What a co-op team can be fighting: the same in every ruleset, after the sentence that opens it. */
const ENEMIES_TAIL = ` the Renegades — deserters from the Realm, fielding characters like yours — or the Swarm: more of them, each cheaper and weaker, whose acid corrodes whoever it hits, +${EFFECTS.corroded.hitBonus}% to hit them until a heal washes it off, and whose Bloaters burst among your squad, and burst again if you down them — or the Miners: fewer of them, each tougher, whose Sappers throw dynamite. If the host chose a random enemy, you won't know whom you're fighting until one of its characters is seen.`;

/**
 * The co-op section: the Hold the Centre half is the same either way, and Hold Out's paragraph is
 * version 13's once that is the current ruleset, version 12's until then (PR 5 deletes the older).
 */
export function coopText(context?: RulesContext): string {
    const produce = nestsProduce("holdOut", context);
    const intro = `If the host chose co-op, 2 to ${COOP_PLAYERS.max} of you fight as one team against warbands the game plays, one for each of you. On the gate forts, which seat up to three, each warband deploys opposite one of you, with the team along one edge and the enemy along the other. Solo is the same on your own: one warband opposite you on the Ruined Fort, which takes its turn straight after each of yours, and no turn timer. ${produce ? "In Hold the Centre each warband" : "Each warband"} musters by the difficulty the host chose: fewer points than each of you on Easy, as many on Normal, and more on Hard. You still take your own turns, and straight after each one a warband takes its turn, by the same rules as yours — unless the host chose to take turns in blocks, when each of you goes in turn and then every warband does, before the next round begins. Teammates are allies: you share what you see in fog, heal and raise each other's characters, and nobody's overwatch fires at a teammate — but a fireball or a flask still hits whoever is under it. In Hold the Centre, each of you scores as usual, and the team wins if all your points added together beat the enemy's; ties go first to the side with more left standing, then to the enemy holding the field. `;
    return produce
        ? `${intro}${brokenBroodText(context)} Hold the Centre is fought against${ENEMIES_TAIL}`
        : `${intro}In Hold Out, a fresh wave lands at the start of rounds 4, 7, 10 and 13 (a team of two, three or four lasts 13 rounds in Hold Out, and Solo 15), wherever the warbands' deployment zones have room: against the Renegades and the Miners it replaces every fallen warband character and brings one more besides, so each wave leaves a warband a character stronger than the last. Against the Swarm the waves have a theme, each bought with points rather than a head count: the Rush's swarm of Skitterlings and Ravagers, the Bile's Spitters and Bloaters, the Brutes' Ravagers, and the Queen's mixed brood. Each wave has ${WAVE_GROWTH_POINTS} more points than the last, and never leaves a warband with more than ${WAVE_CAP} standing. The last three also bring an elite, bought first: the ${CHARACTERS.bileLobber.name}, which lobs corroding bile over its own side's heads; the ${CHARACTERS.carapaceBrute.name}, which takes 1 less from every blow; and the ${CHARACTERS.broodQueen.name}, which hatches Skitterlings beside her — down her first. Each Swarm warband also has nests near the edge of the map, from the start: ${CHARACTERS.nest.hp} HP each, anything that hurts a character hurts them, and they never move or fight. Every nest you destroy before a wave lands takes ${NEST_POINTS} points off that warband's next wave, and the scoreboard says how many it cost. The nests regrow, whole, as the wave lands, so burning them out is a decision before every wave. A Bloater downed by anything but its own burst bursts where it falls, so down them from a distance or leave them be. Your characters have ${Math.round((TEAM_HP_FACTOR - 1) * 100)}% more HP than usual in Hold Out, and its warbands muster a step smaller than the difficulty says. Against ${FACTIONS.realm.enemyName}, every hit on your characters does ${ARMOUR} less (never under 1), except burning — but not on a Miner of yours, which is tough enough without it. A wave heals nobody, but each one you survive earns your team a rally: as your next turn begins after one lands, before anything else, you choose one. Rally gives every standing character of yours half its HP back. Reinforce stands one downed character of yours up at half its HP on a free square of your deployment zone, ready to act at once — even a player whose whole squad is down gets this turn. Resupply hands every standing character of yours the item it mustered with, if it has used it. A choice with nothing to do is greyed out, and a turn that runs out of time takes Rally. The scoreboard says how many the next wave brings, and the round before it lands, the warbands' zones light up. ${holdOutGround("the warbands close in, and land their waves,", "the enemy")} Your team wins by having anyone still standing after the last round, and loses as soon as everyone is down. The enemy is${ENEMIES_TAIL}`;
}

export const guide: GameGuide = {
    title: "How to play Realm Arena",
    sections: [
        {
            heading: "Goal",
            body: `Score the most points by the last battle round. End your own turn with your squad holding the centre — someone of yours in the marked square in the middle, and no enemy — for ${CENTRE_POINTS} points, from round ${CENTRE_SCORES_FROM_ROUND}. Knocking an enemy out scores what they cost to muster ÷ ${KNOCKOUT_DIVISOR}. In a free-for-all, everyone else who hurt them since they last stood up scores an assist: the knock-out's points ÷ ${ASSIST_DIVISOR}, rounded up. First you muster: pick your faction, if the host allowed more than one — the Realm; the Swarm, whose characters are cheaper and weaker, so you field more of them; or the Miners, dwarves each tougher and dearer than the Realm's, so you field fewer — then spend your points — how many depends on the number of players and the battle size the host chose — on a squad, as many of any one character as they buy, and on items for it to carry, one each, then place it in your deployment zone. While you place it, tap a character to choose which of your items it carries and, for a Realm character, which two of its abilities it fights with. A Knight always has Bulwark and a Cleric always has Heal, and takes its two picks beside it; the rest take two from everything their character can do. Pick a third and the one you took first drops. A character you leave alone takes its usual pair, two Archers can carry different arrows, and a pick costs nothing. Every battle a character fights in earns it experience, and each attack, ability and item it uses earns more: at ${RANK_XP[0]} XP you reach rank 1 with it, which unlocks an option — Shield bash, Demolish, Crippling shot or Purify joins its character's abilities to pick from, and the Mage's Frost bolt swaps its weapon at the same cost — and your profile shows how far each is from its next rank. Nobody sees anyone's squad until every player has mustered.`,
        },
        {
            heading: "Your turn",
            body: `Every character of yours has ${ACTION_POINTS} action points (AP) to spend, in any order, and you can switch between them whenever you like. Tap one to select it: the board shades where it can get to with the AP it has left, including bonus AP. Tap a square or an enemy once to see what would happen — the path, the odds, who would react — and again to do it. Each result comes back before you choose the next. Undo takes back a move that rolled nothing and hurt nobody, and showed you nobody new. When you're done, tap End turn. If the battle is fought in fog of war, you see only the enemies your squad can: up to ${SIGHT_RANGE} squares from any of yours — ${CHARACTERS.archer.sight} from an Archer, ${CHARACTERS.knight.sight} from a Knight — wherever nothing blocks the view, and the rest of the map is shaded. A faint enemy marks where your squad last saw it enter the fog; revealing that square removes the marker and shows the real unit there, or an empty tile. An enemy you can't see still reacts to your moves. One standing in your path is found, and your character goes round it to where you sent it, or as near as it can get — paying for the way it went, which can cost more AP than the move you lined up. The match history, the recap and the review tell you only what your squad saw, too: a shot at you from the fog says you were hit, not who fired. The fog lifts when the battle ends.`,
        },
        {
            heading: "Action points",
            body: `Moving costs 1 AP for each stretch of the character's movement — a Knight goes ${CHARACTERS.knight.movement} squares on open ground, most of the Realm ${CHARACTERS.manAtArms.movement} and most of the Miners ${CHARACTERS.miner.movement} — and rubble, low walls and climbs cost more of it. An attack is ${ATTACK_AP} AP, with at most two ordinary weapon attacks per turn, so a character can move and attack, attack twice, or move, attack and move again. Hunkering down costs ${HUNKER_AP} AP and ends that character's turn, doubling its cover until your next. Each character also has its own abilities, shown when it's selected, with their cost and how long until they're ready again. Men-at-arms can Leap or gain bonus AP with Slash and Dash; Knights passively cover anyone beside them with Bulwark, brace allies within ${ABILITIES.taunt?.radius} squares with Taunt and push enemies with Shove. Archers can poison, bounce or split arrows, or Shoot + Dodge. Mages can slow with Ice Ball, stun with Thunder, or Focus to strengthen their abilities. Clerics can Beckon allies closer, Bless their damage or Ward them with full cover; a raised ally on its owner's turn gets 2 AP to act at once. A fireball sets everyone it hits burning: ${EFFECTS.burning.damage} damage at the start of each of their next ${EFFECTS.burning.count} turns, and a knock-out by it scores for whoever threw it. A Cleric's heal puts it out: it can heal once a turn, and can raise a downed ally again ${ABILITIES.raise.cooldown} turns after the last time. A Sapper's dynamite hits a 3×3 as a fireball does, for ${ABILITIES.dynamite.damage}, and leaves nothing burning. Both also blast away the rubble and low walls they land on, after they've done their damage: scorched ground is open ground, so whoever was behind it has lost that cover. Each character carries one item at most, used once: a fire flask (${ITEMS.fireFlask.damage} damage and burning to one square, and it blasts the low cover on and next to it), a thunder flask (stuns a 3×3, so those in it lose what they banked and start their next turn with ${EFFECTS.stunned.ap} AP), a smoke pot (a 3×3 cloud until your next turn: −${ITEMS.smokePot.hitPenalty}% to hit anyone in it, and no overwatch at anyone stepping in) or a healing draught (${ITEMS.healingDraught.hp} HP back and the burning put out, for it or an ally next to it). Throws reach ${THROW_RANGE} squares, need sight and never miss, and hit friend and foe alike. Anything affecting a character — burning, stunned, hunkered down, a shield wall — shows as a mark beside its figure, and so does its item; its box spells them out.`,
        },
        {
            heading: "Cover and flanking",
            body: `A shot has a chance to hit, shown before you take it, which starts from the weapon's own accuracy. Cover comes from the square next to the target on your side: something half a height or more above the target is half cover, −${COVER_PENALTY.half}%; a full height or more, or trees, is full cover, −${COVER_PENALTY.full}%. With nothing there, the target is flanked: no cover at all, and the shot does ${FLANK_BONUS} more damage. The odds badge on a target you would flank says Flank, and the damage it takes says Flanked. Shooting down from half a height or more above is +${HIGH_GROUND_BONUS}%. A shot also needs sight, which depends on the angle: a wall hides two characters on the same ground from each other, but from higher up you see over it to anyone standing far enough back from it — not to someone pressed close behind it. The edge of a rise and a tower's parapet hide the ground just below them the same way. A miss by ${GRAZE_BAND} or less still grazes for half damage. A shot from further than ${FAR_SHOT_DISTANCE} squares away counts the target's cover double, −${COVER_PENALTY.half * 2}% for half cover and −${COVER_PENALTY.full * 2}% for full, so a target in the open is no safer at a distance and one behind cover is much safer. A strike with a blade or a mace needs you right next to the target and hits ${MELEE_ACCURACY}% of the time: it lands for full damage or misses, with no graze.`,
        },
        {
            heading: "Overwatch and guard",
            body: `When your turn ends, anyone with ${REACTION_COST} AP or more left goes on watch: overwatch for a bow or a bolt, guard for a blade. During the next player's turn they react to an enemy that moves where they can see — overwatch shoots, at −${OVERWATCH_PENALTY}%, and guard strikes anyone who steps next to them. Each reaction spends ${REACTION_COST} of the AP they kept, and a character reacts once to each move. Turn a character's switch off at End turn to keep them still instead. Leap, Shove, Beckon and the dodge after Shoot + Dodge set off no reactions. Bonus AP can be spent this turn, but at most 4 AP can be banked. Older battles retain their original roster and rules, including the Scout and Sneak.`,
        },
        {
            heading: "Co-op against the computer",
            body: coopText(),
        },
    ],
};
