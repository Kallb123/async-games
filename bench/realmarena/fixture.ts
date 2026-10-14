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

import { mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { endTurnBy, makeGame, musterAll, play } from "@/games/RealmArena/testFixtures";
import { isStanding, isWarband, lastWaveRound } from "@/games/RealmArena/rules";
import { battleRoundsOf } from "@/games/RealmArena/RealmArenaLogic";
import { gameStateToModel, stepOutcomeToModel } from "@/games/RealmArena/RealmArenaModels";
import { seedRolls } from "../../scripts/lib/realmArenaBalance";

const SEED = 7;
const VIEWER = "a";
const PLAYERS = ["a", "b", "c"];
const COOP = { enemy: "realm", mission: "holdOut", difficulty: "hard", map: "sackedFort" } as const;
const FIXTURES = { "holdout": { size: "large", coop: COOP }, "holdout-fog": { fog: true, size: "large", coop: COOP } } as const;
/** The time the clock stands at while the battle is played. */
const CLOCK = Date.UTC(2026, 9, 14);
/** How many rounds short of the last wave the battle is set, so the End turns played land it. */
const ROUNDS_SHORT = 2;
const OUT = new URL("./fixtures/", import.meta.url);

async function write(name: keyof typeof FIXTURES) {
    const settings = FIXTURES[name];
    seedRolls(SEED);
    // The clock stood still, so the warbands' planning guard (`WARBAND_DEADLINE_MS`)
    // never cuts a turn short on a busy machine: the fixture is the seed's alone.
    Date.now = () => CLOCK;

    const game = makeGame(PLAYERS, {}, settings);
    await musterAll(game);
    const gs = game.specificGameState;
    gs.roundsPlayed = lastWaveRound(battleRoundsOf(gs)) - ROUNDS_SHORT;
    const warbands = () => gs.fighters.filter(fighter => isWarband(fighter.owner) && isStanding(fighter)).length;

    // The team ends its turns, untouched by anything but the warbands, until the wave has landed and it's the viewer's turn again.
    let landed = false;
    for (let turn = 0; turn < 12 && !(landed && game.currentTurn === VIEWER); turn++) {
        const before = warbands();
        const { outcome } = await play(game, endTurnBy(game.currentTurn));
        if (!outcome.validMove) throw new Error(`${game.currentTurn}'s End turn was refused`);
        if (warbands() > before + 5) landed = true;
    }
    if (!landed || game.complete) throw new Error("the last wave never landed");

    const before = gameStateToModel(structuredClone(gs), VIEWER, null);
    const { outcome } = await play(game, endTurnBy(VIEWER));
    if (!outcome.validMove) throw new Error("the viewer's End turn was refused");
    const after = gameStateToModel(gs, VIEWER, null);
    const step = stepOutcomeToModel(outcome, VIEWER, gs);
    if (!step?.parts || step.parts.length < 5) throw new Error(`the End turn played only ${step?.parts?.length ?? 0} parts`);

    const fixture = {
        about: "Realm Arena rendering bench fixture: written by bench/realmarena/fixture.ts, drawn by bench/realmarena/BenchApp.tsx. Don't edit by hand.",
        name,
        recipe: { seed: SEED, players: PLAYERS, settings, roundsShort: ROUNDS_SHORT },
        viewer: VIEWER,
        seats: PLAYERS,
        before,
        after,
        step,
    };
    const json = `${JSON.stringify(fixture)}\n`;
    const file = new URL(`${name}.json`, OUT);
    writeFileSync(file, json);
    const counts = `${after.fighters.length} figures (${after.fighters.filter(fighter => isWarband(fighter.owner)).length} warband), ${step.parts.length} parts`;
    console.log(`Wrote ${file.pathname}: ${counts}, ${(json.length / 1024).toFixed(0)} KB, sha256 ${createHash("sha256").update(json).digest("hex").slice(0, 12)}`);
}

async function main() {
    mkdirSync(OUT, { recursive: true });
    for (const name of Object.keys(FIXTURES) as (keyof typeof FIXTURES)[]) await write(name);
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
