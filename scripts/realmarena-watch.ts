// Follows one battle of the balance harness (scripts/lib/realmArenaBalance.ts)
// a turn at a time, for reading why a scenario wins or loses rather than how
// often: after each player's turn, where the team stands (each raider marked
// "R", its HP and how far it is from the nearest standing nest), what each
// warband has standing, the nests and the Shrine, and the turn's history.
// It ends with every team character that fell: when, whether it raided, and
// how far it was from the Shrine and the nearest nest.
//
//   npm run ra-balance:watch -- --players 3 --seed 4
//   npm run ra-balance:watch -- --players 1 --layout sackedFortTwo --seed 1
//   npm run ra-balance:watch -- --players 2 --map gate --raiders 4 --set RULES.STARTING_HORDE=6
//
// Distances are in squares, the larger of the column and row gap: as the crow
// flies, not as anyone walks.
import { parseArgs } from "node:util";
import { applyOverrides, parseOverrides, RAIDERS, scenarioKey, simulateBattle, type BalanceScenario, type CoopMapChoice } from "./lib/realmArenaBalance";
import { battlefieldById, REALM_ARENA_MAPS, type RealmArenaMapId } from "../src/games/RealmArena/maps";
import { battleOf, type RealmArenaTestGame } from "../src/games/RealmArena/testFixtures";
import { isMinion, isStanding, isStructure, isWarband, shrineOf, warbandNests, type Fighter } from "../src/games/RealmArena/rules";
import { CURRENT_RULESET_VERSION } from "../src/games/RealmArena/rulesets";

const { values: args } = parseArgs({
    options: {
        players: { type: "string", default: "3" },
        seed: { type: "string", default: "1" },
        map: { type: "string", default: "sackedFort" },
        layout: { type: "string" },
        raiders: { type: "string" },
        rules: { type: "string" },
        set: { type: "string" },
    },
});

const rules = args.rules === undefined ? CURRENT_RULESET_VERSION : Number(args.rules);
if (args.layout !== undefined && !Object.hasOwn(REALM_ARENA_MAPS, args.layout)) throw new Error(`--layout ${args.layout} is no battlefield`);
const set = args.set ? parseOverrides(args.set, rules) : {};
const raiders = args.raiders === undefined ? undefined : Number(args.raiders);
const scenario: BalanceScenario = {
    players: Number(args.players), team: "realm", enemy: "brood", mission: "holdOut", map: args.map as CoopMapChoice,
    difficulty: "normal", size: "normal", fog: false, rules,
    ...(raiders !== undefined && raiders !== RAIDERS ? { raiders } : {}),
    ...(args.layout ? { layout: args.layout as RealmArenaMapId } : {}),
    ...(Object.keys(set).length > 0 ? { set } : {}),
};
applyOverrides(scenario);

/** Where a fighter stands, as a column and row. */
function placeOf(game: RealmArenaTestGame, fighter: Fighter): { col: number; row: number } {
    const { width } = battlefieldById(game.specificGameState.map);
    return { col: fighter.square % width, row: Math.floor(fighter.square / width) };
}
function gap(game: RealmArenaTestGame, a: Fighter, b: Fighter): number {
    const from = placeOf(game, a), to = placeOf(game, b);
    return Math.max(Math.abs(from.col - to.col), Math.abs(from.row - to.row));
}
function nearest(game: RealmArenaTestGame, fighter: Fighter, among: readonly Fighter[]): number | undefined {
    return among.length > 0 ? Math.min(...among.map(one => gap(game, fighter, one))) : undefined;
}

const everRaided = new Set<number>();
const fell: string[] = [];
const downed = new Set<number>();
let seen = 0;

function watch(game: RealmArenaTestGame, player: string, turnRaiders: readonly number[]) {
    const gs = game.specificGameState;
    const battle = battleOf(game);
    turnRaiders.forEach(id => everRaided.add(id));
    const nests = warbandNests(battle.fighters, gs).filter(isStanding);
    const shrine = shrineOf(battle);
    const round = gs.roundsPlayed + (game.complete ? 1 : 0);
    console.log(`\n── after ${player}'s turn · ${gs.roundsPlayed} round${gs.roundsPlayed === 1 ? "" : "s"} played`);

    const team = battle.fighters.filter(fighter => !isWarband(fighter.owner) && !isStructure(fighter, gs));
    for (const seat of [...new Set(team.map(fighter => fighter.owner))]) {
        const own = team.filter(fighter => fighter.owner === seat && isStanding(fighter));
        const line = own.map(fighter => `${everRaided.has(fighter.id) ? "R " : ""}${fighter.character} ${fighter.hp}hp${nests.length ? ` ·${nearest(game, fighter, nests)}` : ""}`).join(", ");
        console.log(`  team ${seat}: ${own.length} standing${own.length ? `: ${line}` : ""}`);
    }
    for (const owner of [...new Set(battle.fighters.filter(fighter => isWarband(fighter.owner)).map(fighter => fighter.owner))].sort()) {
        const standing = battle.fighters.filter(fighter => fighter.owner === owner && isStanding(fighter) && !isStructure(fighter, gs));
        const minions = standing.filter(fighter => isMinion(fighter, gs)).length;
        const own = nests.filter(nest => nest.owner === owner).map(nest => `${nest.hp}hp`).join(", ");
        console.log(`  ${owner}: ${minions} minions + ${standing.length - minions} others, nests ${own || "none"}`);
    }
    if (shrine) console.log(`  Shrine ${shrine.hp}/${shrine.maxHp}`);

    // History is newest first: what this turn added, in the order it happened.
    const history = game.gameState.history;
    const added = history.slice(0, history.length - seen).reverse();
    seen = history.length;
    for (const entry of added) console.log(`    · ${entry.text}`);

    for (const fighter of team) {
        if (isStanding(fighter) || downed.has(fighter.id)) continue;
        downed.add(fighter.id);
        fell.push(`  round ${round}: ${fighter.owner}'s ${fighter.character}${everRaided.has(fighter.id) ? " (raider)" : " (guard)"}, ${shrine ? `${gap(game, fighter, shrine)} from the Shrine, ` : ""}${nearest(game, fighter, nests) ?? "–"} from the nearest nest`);
    }
}

async function main() {
    console.log(`${scenarioKey(scenario)} · seed ${args.seed}`);
    const sample = await simulateBattle(scenario, Number(args.seed), undefined, watch);
    console.log(`\n${sample.won ? "Won" : "Lost"}: ${sample.detail}, in round ${sample.endedRound}.`);
    console.log(fell.length ? `The team's fallen:\n${fell.join("\n")}` : "Nobody on the team fell.");
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
