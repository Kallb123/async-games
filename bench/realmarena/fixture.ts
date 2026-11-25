// Writes the Realm Arena rendering bench's fixtures (bench/realmarena/fixtures/):
// a Hold Out battle at its busiest, frozen, so every run of the bench draws
// exactly the same board and plays exactly the same enemy turn, whatever the
// rules have done since. Rerun it (`npm run ra-bench:fixture`) only on purpose —
// a new fixture makes numbers taken before it incomparable with numbers after.
//
// The battle: three players in co-op against the Realm's warbands on the Sacked
// Fort, large and hard, played by the engine's own command pipeline
// (testFixtures.ts) with every roll drawn from a seed. Its rounds are moved on
// to just before the last wave, the team ends its turns until that wave lands
// (27 warband characters on the board, 42 in all), and the fixture is the End
// turn after that: the board before and after, as the first player is sent it,
// and the step their client plays (one part per warband action). Two of them:
// `holdout`, in the open, where every figure is drawn, and `holdout-fog`, the
// same battle in fog of war (§27), where fewer are drawn but the board dims
// what the squad can't see and the page sweeps its sight lines every part.
//
// And two for scale, in the open: `holdout-8k` and `holdout-16k`, the same
// battle on a Sacked Fort grown to 92 and 128 squares across (8,464 and 16,384
// tiles, scaledMap.ts), standing in for a bigger game's map. Same seed, same
// team, same warbands; more ground.
//
// And one for the Brood's full horde, `holdout-brood` (rules version 13): every warband at
// HORDE_CAP minions, and a round of the warbands' turns (docs/realm-arena-rendering.md §2.5).

import { mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { addFighter, actBy, battleOf, endTurnBy, makeGame, musterAll, play, playOne, type RealmArenaTestGame } from "@/games/RealmArena/testFixtures";
import { freeSquares, hatchSquares, isMinion, isStanding, isStructure, maxHpOf, isWarband, lastWaveRound, spawnThemeOf, storedFighter } from "@/games/RealmArena/rules";
import { battleRoundsOf, ENEMY_TURN_COMMAND_VERSION, hordeCountOf, owesRally, standingNestsOf } from "@/games/RealmArena/RealmArenaLogic";
import { defaultRally } from "@/games/RealmArena/rally";
import { gameStateToModel, partStateOf, stepOutcomeToModel } from "@/games/RealmArena/RealmArenaModels";
import type { IRealmArenaStepOutcome, IRealmArenaStepPart } from "@/games/RealmArena/apiModels";
import type { RealmArenaSettings } from "@/games/RealmArena/RealmArenaModels";
import { factionById } from "@/games/RealmArena/characters";
import { ruleValuesOf, rulesetOf } from "@/games/RealmArena/rulesets";
import { getComputerTurnAdapter, isComputerTurn } from "@/utils/games/computerTurns";
import { gameCommandVersion } from "@/utils/ui/games";
import { meta } from "@/games/RealmArena/meta";
import { seedRolls } from "../../scripts/lib/realmArenaBalance";
import { registerScaledSackedFort } from "./scaledMap";

const SEED = 7;
const VIEWER = "a";
const PLAYERS = ["a", "b", "c"];
const COOP = { enemy: "realm", mission: "holdOut", difficulty: "hard", map: "sackedFort" } as const;
/**
 * `rules` is the ruleset release a fixture is played under, pinned here so a new
 * current version never changes what a name builds. It is kept out of the `recipe`
 * written into the JSON (the battle's own `rulesVersion` is in it), so the recipe
 * of the first four reads as it always did. They are rules 7: the version the
 * committed JSON says it was drawn under. Rebuilding them today is NOT byte-for-byte:
 * the response has grown fields since (`maxAp`, `maxHp`, `enemiesDefeated`) and the
 * planner has moved, so don't rewrite the committed files; rebuild only to make a new one.
 *
 * `horde` is a fixture of the Brood's full horde (rules 13): there is no wave to
 * land, so the team plays rounds until every warband stands at `HORDE_CAP` minions,
 * and the warbands' turns are commands of their own (the others play inside the End turn).
 */
const FIXTURES: Record<string, { settings: RealmArenaSettings; rules: number; across?: number; horde?: boolean }> = {
    "holdout": { settings: { size: "large", coop: COOP }, rules: 7 },
    "holdout-fog": { settings: { fog: true, size: "large", coop: COOP }, rules: 7 },
    "holdout-8k": { settings: { size: "large", coop: COOP }, rules: 7, across: 92 },
    "holdout-16k": { settings: { size: "large", coop: COOP }, rules: 7, across: 128 },
    "holdout-brood": { settings: { size: "large", coop: COOP }, rules: 13, horde: true },
};
/** The time the clock stands at while the battle is played. */
const CLOCK = Date.UTC(2026, 9, 14);
/** How many rounds short of the last wave the battle is set, so the End turns played land it. */
const ROUNDS_SHORT = 2;
/** The rounds the Brood fixture's team lets pass before the horde is made up to its cap: the elites' rounds 5 and 9 are in, and the Queen's 13. */
const FILL_ROUNDS = 13;
// `--only <name>` writes one fixture; `--out <dir>` writes somewhere else (to check a rebuild against the committed one).
const { values: options } = parseArgs({ options: { only: { type: "string" }, out: { type: "string" } } });
const OUT = options.out ? pathToFileURL(`${resolve(options.out)}/`) : new URL("./fixtures/", import.meta.url);

/** A rally owed (§39.4, rules 12) is chosen by default, as the End turn is refused until it is. */
async function rallyIfOwed(game: RealmArenaTestGame, seat: string) {
    if (!owesRally(game.specificGameState, seat)) return;
    const choice = defaultRally(battleOf(game), game.specificGameState.seats, seat);
    if (!(await play(game, actBy(seat, choice))).outcome.validMove) throw new Error(`${seat}'s rally was refused`);
}

/** A seat's End turn, then the warbands' turns it hands on to. `inline` plays it as command version 12 did, with the warbands' turn inside it. */
async function endTurn(game: RealmArenaTestGame, seat: string, inline: boolean) {
    await rallyIfOwed(game, seat);
    const end = endTurnBy(seat);
    if (inline) (end as { version?: number }).version = ENEMY_TURN_COMMAND_VERSION - 1;
    return play(game, end);
}

type Count = { minions: number; others: number };

/** What each warband has standing: its minions, and its real characters and elites (its nests are structures, counted in neither). */
function hordesOf(game: RealmArenaTestGame): [string, Count][] {
    const gs = game.specificGameState;
    const owners = [...new Set(gs.fighters.filter(fighter => isWarband(fighter.owner)).map(fighter => fighter.owner))].sort();
    return owners.map(owner => [owner, hordeCountOf(gs, owner)]);
}

/**
 * The nests' own output, made up to the cap. A team that only ends its turns still
 * strikes the odd minion down (a hazard, a reaction), and the nests make three threat
 * a turn, so no warband is ever at `HORDE_CAP` at the moment the fixture is taken. What is
 * short stands now beside its warband's nests, the minions of the theme's own buy list,
 * as `standByNest` stands what the nests buy.
 */
function topUp(game: RealmArenaTestGame) {
    const gs = game.specificGameState;
    const { HORDE_CAP = Infinity } = ruleValuesOf(gs);
    const faction = factionById(gs.coop?.enemy, gs);
    const theme = spawnThemeOf(faction, gs.roundsPlayed + 1, gs);
    const minions = theme?.buys.filter(character => rulesetOf(gs).CHARACTERS[character].minion) ?? [];
    if (minions.length === 0) throw new Error("the Brood's theme buys no minion");
    for (const [owner, count] of hordesOf(game)) {
        const nests = standingNestsOf(gs, owner);
        for (let next = count.minions; next < HORDE_CAP; next++) {
            const battle = battleOf(game);
            const square = nests.flatMap(nest => hatchSquares(battle, nest)).find(one => freeSquares(battle, [one]).length > 0);
            if (square === undefined) throw new Error(`${owner} has no room by its nests for minion ${next + 1}`);
            addFighter(game, owner, minions[next % minions.length], square);
        }
    }
}

/**
 * A round of the team's End turns, each followed by the warband turn it hands on to,
 * as one step: every warband plays once. Since command version 13 each warband's turn is
 * a command of its own (`RealmArenaWarbandTurn`) and the End turn's outcome holds none of
 * it, so each is told as the viewer is sent it, from the board it left, and their parts
 * are laid end to end. A turn's last part (the hand-off) carries no board; where another
 * turn follows it gets the board this one left, so the next plays on from there. (A real
 * client plays each of these as a step of its own, as the turns come; the bench plays the
 * round in one so that every warband's swarm is on the board.)
 */
async function roundWithWarbands(game: RealmArenaTestGame, viewer: string): Promise<{ step: IRealmArenaStepOutcome; commands: number }> {
    const gs = game.specificGameState;
    const events: IRealmArenaStepOutcome["events"] = [];
    const parts: IRealmArenaStepPart[] = [];
    let commands = 0;
    for (const seat of PLAYERS) {
        if (game.currentTurn !== seat) throw new Error(`it is ${game.currentTurn}'s turn, not ${seat}'s`);
        await rallyIfOwed(game, seat);
        const end = await playOne(game, endTurnBy(seat));
        if (!end.outcome.validMove) throw new Error(`${seat}'s End turn was refused`);
        events.push(...stepOutcomeToModel(end.outcome, viewer, gs)?.events ?? []);
        for (; isComputerTurn(game); commands++) {
            if (commands > 20) throw new Error("the warbands never handed the turn back");
            const warband = getComputerTurnAdapter(game.gameType.className)?.buildCommand(game);
            if (!warband) throw new Error(`no warband turn to play for ${game.currentTurn}`);
            warband.version = gameCommandVersion(meta);
            const played = await playOne(game, warband);
            if (!played.outcome.validMove) throw new Error(`${game.currentTurn}'s turn was refused`);
            const told = stepOutcomeToModel(played.outcome, viewer, gs);
            if (!told) continue;
            events.push(...told.events);
            const own = told.parts ?? [];
            // The turn after it is another warband's, or the next seat's End turn that this loop plays: either way the board goes on from here.
            const left = seat !== PLAYERS[PLAYERS.length - 1] || isComputerTurn(game) ? gameStateToModel(structuredClone(gs), viewer, null) : undefined;
            parts.push(...own.map((part, index) => left && index === own.length - 1 && !part.state
                ? { ...part, state: partStateOf(left) }
                : part));
        }
    }
    return { step: { events, parts }, commands };
}

async function write(name: string) {
    const { settings, rules, across, horde } = FIXTURES[name];
    // Put back once written (an error ends the run anyway).
    const restore = across ? registerScaledSackedFort(across) : undefined;
    seedRolls(SEED);
    // The clock stood still, so the warbands' planning guard (`WARBAND_DEADLINE_MS`)
    // never cuts a turn short on a busy machine: the fixture is the seed's alone.
    Date.now = () => CLOCK;

    const game = makeGame(PLAYERS, {}, { ...settings, rulesVersion: rules });
    await musterAll(game);
    const gs = game.specificGameState;
    const warbands = () => gs.fighters.filter(fighter => isWarband(fighter.owner) && isStanding(fighter)).length;

    let step: IRealmArenaStepOutcome | undefined;
    let before: ReturnType<typeof gameStateToModel>;
    let after: ReturnType<typeof gameStateToModel>;
    let note = "";
    if (!horde) {
        gs.roundsPlayed = lastWaveRound(battleRoundsOf(gs)) - ROUNDS_SHORT;
        // The team ends its turns, untouched by anything but the warbands, until the wave has landed and it's the viewer's turn again.
        let landed = false;
        for (let turn = 0; turn < 12 && !(landed && game.currentTurn === VIEWER); turn++) {
            const were = warbands();
            const { outcome } = await endTurn(game, game.currentTurn, true);
            if (!outcome.validMove) throw new Error(`${game.currentTurn}'s End turn was refused`);
            if (warbands() > were + 5) landed = true;
        }
        if (!landed || game.complete) throw new Error("the last wave never landed");

        before = gameStateToModel(structuredClone(gs), VIEWER, null);
        const { outcome } = await endTurn(game, VIEWER, true);
        if (!outcome.validMove) throw new Error("the viewer's End turn was refused");
        after = gameStateToModel(gs, VIEWER, null);
        step = stepOutcomeToModel(outcome, VIEWER, gs);
    } else {
        // The Brood's nests spawn every warband turn, up to the caps. The team ends its turns, untouched, until every warband stands at them.
        const { HORDE_CAP, HORDE_REAL_CAP } = ruleValuesOf(gs);
        if (HORDE_CAP === undefined || HORDE_REAL_CAP === undefined) throw new Error(`rules ${rules} has no horde caps`);
        // The team only ends its turns, which no battle survives for long: the warbands would have won before the nests had
        // filled them. So while they fill, the team and the Shrine stand ten times as tough, and are put back as they were
        // (full health at their own maximum) before the board is taken.
        const own = gs.fighters.filter(fighter => !isWarband(fighter.owner));
        const natural = new Map(own.map(fighter => [fighter.id, fighter.maxHp]));
        for (const fighter of own) fighter.hp = fighter.maxHp = maxHpOf(fighter, gs) * 10;
        const heal = () => { for (const fighter of own) if (isStanding(fighter)) fighter.hp = fighter.maxHp!; };
        for (let turn = 0; turn < 60 && !(gs.roundsPlayed >= FILL_ROUNDS && game.currentTurn === VIEWER); turn++) {
            heal();
            const { outcome } = await endTurn(game, game.currentTurn, false);
            if (!outcome.validMove) throw new Error(`${game.currentTurn}'s End turn was refused`);
            if (game.complete) throw new Error("the battle ended before the hordes filled");
        }
        for (const fighter of own) {
            const was = natural.get(fighter.id);
            if (was === undefined) delete fighter.maxHp;
            else fighter.maxHp = was;
            if (isStanding(fighter)) fighter.hp = maxHpOf(fighter, gs);
        }
        topUp(game);
        const hordes = hordesOf(game);
        if (game.complete || hordes.length < 3) throw new Error(`the hordes never filled: ${JSON.stringify(hordes)}`);
        for (const [owner, count] of hordes) {
            if (count.minions !== HORDE_CAP) throw new Error(`${owner} stands at ${count.minions} minions, not ${HORDE_CAP}`);
        }
        const round = gs.roundsPlayed;
        before = gameStateToModel(structuredClone(gs), VIEWER, null);
        const played = await roundWithWarbands(game, VIEWER);
        step = played.step;
        after = gameStateToModel(gs, VIEWER, null);
        note = `, ${played.commands} warband turns, from round ${round}; before the step ${hordes.map(([owner, count]) => `${owner} ${count.minions} minions + ${count.others} others`).join(", ")} (HORDE_CAP ${HORDE_CAP}, HORDE_REAL_CAP ${HORDE_REAL_CAP})`;
    }
    if (!step?.parts || step.parts.length < 5) throw new Error(`the End turn played only ${step?.parts?.length ?? 0} parts`);

    const fixture = {
        about: "Realm Arena rendering bench fixture: written by bench/realmarena/fixture.ts, drawn by bench/realmarena/BenchApp.tsx. Don't edit by hand.",
        name,
        recipe: { seed: SEED, players: PLAYERS, settings, ...horde ? { horde: true, rulesVersion: rules } : { roundsShort: ROUNDS_SHORT }, ...across ? { across } : {} },
        viewer: VIEWER,
        seats: PLAYERS,
        before,
        after,
        step,
    };
    const json = `${JSON.stringify(fixture)}\n`;
    const file = new URL(`${name}.json`, OUT);
    writeFileSync(file, json);
    const counts = `${after.fighters.length} figures (${after.fighters.filter(fighter => isWarband(fighter.owner)).length} warband), ${step.parts.length} parts${note}`;
    console.log(`Wrote ${file.pathname}: ${counts}, ${(json.length / 1024).toFixed(0)} KB, sha256 ${createHash("sha256").update(json).digest("hex").slice(0, 12)}`);
    restore?.();
}

async function main() {
    mkdirSync(OUT, { recursive: true });
    const names = options.only ? [options.only] : Object.keys(FIXTURES);
    for (const name of names) if (!FIXTURES[name]) throw new Error(`no fixture "${name}": ${Object.keys(FIXTURES).join(", ")}`);
    for (const name of names) await write(name);
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
