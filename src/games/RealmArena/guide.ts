import type { GameGuide } from "@/utils/ui/gameGuides";
import { CHARACTERS, COOP_PLAYERS, EFFECTS, ITEMS, THROW_RANGE } from "./characters";
import { RANK_XP } from "./mastery";
import { ACTION_POINTS, ASSIST_DIVISOR, ATTACK_AP, CENTRE_POINTS, CENTRE_SCORES_FROM_ROUND, COVER_PENALTY, FLANK_BONUS, GRAZE_BAND, HIGH_GROUND_BONUS, HUNKER_AP, KNOCKOUT_DIVISOR, OVERWATCH_PENALTY, REACTION_COST, SIGHT_RANGE } from "./rules";

// The how-to-play primer shown from the game-options menu, and the reference
// text behind the guided tour (tutorial.ts), which takes the guide's place on
// a player's first match (see useGameIntro). Five sections, as
// docs/games/realm-arena.md §17.3 PR 9 lists them: the goal and the muster
// (and mastery's options, §23), a turn (and fog of war, §27), what AP buy (and the effects and
// items, §20, §21), cover and flanking, and overwatch and guard — and a sixth
// for co-op against the computer (§29.9), which changes who is on whose side
// but not how a turn is played, and names the factions it can be fought against (§31).
//
// The options the goal names — an ability swapped, or the Mage's bolt — are
// the rank-1 ones of characters.ts's OPTIONS: a new option of another kind
// needs that sentence widening.
//
// Map-agnostic: the battlefield is picked by the number of players, so no
// section names a gate or a tower of one fort. The tunable numbers — costs,
// penalties, scores, speeds — come from the rules themselves, so a rebalance
// can't leave the guide behind.

export const guide: GameGuide = {
    title: "How to play Realm Arena",
    sections: [
        {
            heading: "Goal",
            body: `Score the most points by the last battle round. End your own turn with your squad holding the centre — someone of yours in the marked square in the middle, and no enemy — for ${CENTRE_POINTS} points, from round ${CENTRE_SCORES_FROM_ROUND}. Knocking an enemy out scores what they cost to muster ÷ ${KNOCKOUT_DIVISOR}. In a free-for-all, everyone else who hurt them since they last stood up scores an assist: the knock-out's points ÷ ${ASSIST_DIVISOR}, rounded up. First you muster: pick your faction, if the host allowed more than one — the Realm, or the Swarm, whose characters are cheaper and weaker, so you field more of them — then spend your points — how many depends on the number of players and the battle size the host chose — on a squad, as many of any one character as they buy, and on items for it to carry, one each, then place it in your deployment zone. While you place it, tap a character to choose which of your items it carries. Every battle a character fights in earns it experience, and each attack, ability and item it uses earns more: at ${RANK_XP[0]} XP you reach rank 1 with it, which unlocks an option — swap one of its abilities, or the Mage's bolt, for another at the same cost — and your profile shows how far each is from its next rank. Nobody sees anyone's squad until every player has mustered.`,
        },
        {
            heading: "Your turn",
            body: `Every character of yours has ${ACTION_POINTS} action points (AP) to spend, in any order, and you can switch between them whenever you like. Tap one to select it: the board shades where it can get to for 1, 2, 3 or 4 AP. Tap a square or an enemy once to see what would happen — the path, the odds, who would react — and again to do it. Each result comes back before you choose the next. Undo takes back a move that rolled nothing and hurt nobody, and showed you nobody new. When you're done, tap End turn. If the battle is fought in fog of war, you see only the enemies your squad can: up to ${SIGHT_RANGE} squares from any of yours — ${CHARACTERS.archer.sight} from an Archer or a Scout, ${CHARACTERS.knight.sight} from a Knight — wherever nothing blocks the view, and the rest of the map is shaded. A faint enemy marks where your squad last saw it enter the fog; revealing that square removes the marker and shows the real unit there, or an empty tile. An enemy you can't see still reacts to your moves. One standing in your path is found, and your character goes round it to where you sent it, or as near as it can get — paying for the way it went, which can cost more AP than the move you lined up. The match history, the recap and the review tell you only what your squad saw, too: a shot at you from the fog says you were hit, not who fired. The fog lifts when the battle ends.`,
        },
        {
            heading: "Action points",
            body: `Moving costs 1 AP for each stretch of the character's movement — a Knight goes ${CHARACTERS.knight.movement} squares on open ground, a Scout ${CHARACTERS.scout.movement}, everyone else ${CHARACTERS.manAtArms.movement} — and rubble, low walls and climbs cost more of it. An attack is ${ATTACK_AP} AP, so a character can move and attack, attack twice, or move, attack and move again. Hunkering down costs ${HUNKER_AP} AP and ends that character's turn, doubling its cover until your next. Each character also has its own abilities, shown when it's selected, with their cost and how long until they're ready again. A fireball sets everyone it hits burning: ${EFFECTS.burning.damage} damage at the start of each of their next ${EFFECTS.burning.count} turns, and a knock-out by it scores for whoever threw it. A Cleric's heal puts it out. A fireball also blasts away the rubble and low walls it lands on, after it's done its damage: scorched ground is open ground, so whoever was behind it has lost that cover. Each character carries one item at most, used once: a fire flask (${ITEMS.fireFlask.damage} damage and burning to one square, and it blasts the low cover on and next to it), a thunder flask (stuns a 3×3, so those in it lose what they banked and start their next turn with ${EFFECTS.stunned.ap} AP), a smoke pot (a 3×3 cloud until your next turn: −${ITEMS.smokePot.hitPenalty}% to hit anyone in it, and no overwatch at anyone stepping in) or a healing draught (${ITEMS.healingDraught.hp} HP back and the burning put out, for it or an ally next to it). Throws reach ${THROW_RANGE} squares, need sight and never miss, and hit friend and foe alike. Anything affecting a character — burning, stunned, hunkered down, a shield wall — shows as a mark beside its figure, and so does its item; its box spells them out.`,
        },
        {
            heading: "Cover and flanking",
            body: `A shot has a chance to hit, shown before you take it, which starts from the weapon's own accuracy. Cover comes from the square next to the target on your side: something half a height or more above the target is half cover, −${COVER_PENALTY.half}%; a full height or more, or trees, is full cover, −${COVER_PENALTY.full}%. With nothing there, the target is flanked: no cover at all, and the shot does ${FLANK_BONUS} more damage. Shooting down from half a height or more above is +${HIGH_GROUND_BONUS}%. A miss by ${GRAZE_BAND} or less still grazes for half damage. A strike with a blade or a mace needs you right next to the target and always hits.`,
        },
        {
            heading: "Overwatch and guard",
            body: `When your turn ends, anyone with ${REACTION_COST} AP or more left goes on watch: overwatch for a bow or a bolt, guard for a blade. During the next player's turn they react to an enemy that moves where they can see — overwatch shoots, at −${OVERWATCH_PENALTY}%, and guard strikes anyone who steps next to them. Each reaction spends ${REACTION_COST} of the AP they kept, and a character reacts once to each move. Turn a character's switch off at End turn to keep them still instead. A Scout can sneak past without setting anyone off.`,
        },
        {
            heading: "Co-op against the computer",
            body: `If the host chose co-op, ${COOP_PLAYERS.min} or ${COOP_PLAYERS.max} of you fight as one team against warbands the game plays, one for each of you — on the gate forts, one opposite each of you, with the team along one edge and the enemy along the other. Each warband musters by the difficulty the host chose: fewer points than each of you on Easy, as many on Normal, and more on Hard. You still take your own turns, and straight after each one a warband takes its turn, by the same rules as yours. Teammates are allies: you share what you see in fog, heal and raise each other's characters, and nobody's overwatch fires at a teammate — but a fireball or a flask still hits whoever is under it. In Hold the Centre, each of you scores as usual, and the team wins if all your points added together beat the enemy's; ties go first to the side with more left standing, then to the enemy holding the field. In Hold Out, a fresh wave lands at the start of rounds 4, 7, 10 and 13, wherever the warbands' deployment zones have room: it replaces every fallen warband character and brings one more besides, so each wave leaves a warband a character stronger than the last. Hold Out can also be fought on the Sacked Fort, where your team starts in the ruined keep in the middle and the warbands close in, and land their waves, from every edge. Your team wins by having anyone still standing after the last round, and loses as soon as everyone is down. The enemy is the Renegades — deserters from the Realm, fielding characters like yours — or the Swarm: more of them, each cheaper and weaker, whose acid corrodes whoever it hits, +${EFFECTS.corroded.hitBonus}% to hit them until a heal washes it off, and whose Bloaters burst among your squad. If the host chose a random enemy, you won't know whom you're fighting until one of its characters is seen.`,
        },
    ],
};
