import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Everything about a game lives in its src/games/<Game>/ folder (see
// ARCHITECTURE.md §3, §12), but a handful of shared files outside that folder
// still need a one-line addition per game: the GameLogic barrel, the GAME_META
// aggregator, the Mongoose discriminator registration, and the invite-accept
// branch that creates the game document. Unlike the rules/command wiring
// guarded by serializableRegistry.test.ts (which rides on the @serializable
// decorator and a compiler-checked Record), these are plain string references
// with nothing forcing them to be added, so this test scans source for each
// game folder's expected artifacts and asserts every shared file mentions it.
// A game whose folder exists but isn't wired into one of these would
// otherwise fail silently at runtime (missing from the library, its game type
// never persisted, etc.) instead of failing CI.

const gamesRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(gamesRoot, "../..");

function read(relPath: string): string {
    return readFileSync(path.join(repoRoot, relPath), "utf8");
}

// Discover every game by its folder under src/games/, using the presence of
// meta.ts (every real game has one) so this list can never drift out of date.
const gameNames = readdirSync(gamesRoot).filter((name) => {
    const dir = path.join(gamesRoot, name);
    return statSync(dir).isDirectory() && existsSync(path.join(dir, "meta.ts"));
});

describe("game registry completeness", () => {
    it("finds at least one game folder", () => {
        // Sanity check the scanner itself: if this hits zero, the meta.ts
        // detection has drifted and the rest of the suite would pass vacuously.
        expect(gameNames.length).toBeGreaterThan(0);
    });

    it("wires every game's rules module into the GameLogic barrel", () => {
        const barrel = read("src/utils/apiModels/GameLogic.ts");
        const missing = gameNames.filter((name) => !barrel.includes(`@/games/${name}/${name}Logic`));
        expect(
            missing,
            `These games have no rules-module export in src/utils/apiModels/GameLogic.ts. Add:\n` +
                missing.map((n) => `  export * from "@/games/${n}/${n}Logic";`).join("\n"),
        ).toEqual([]);
    });

    it("wires every game's metadata into GAME_META", () => {
        const games = read("src/utils/ui/games.ts");
        const missing = gameNames.filter((name) => !games.includes(`@/games/${name}/meta`));
        expect(
            missing,
            `These games have no meta.ts import wired into GAME_META in ` +
                `src/utils/ui/games.ts:\n` +
                missing.map((n) => `  - ${n} (import its meta.ts and add it to GAME_META)`).join("\n"),
        ).toEqual([]);
    });

    it("registers every game's Mongoose discriminator models in mongodb.ts", () => {
        const mongodbSource = read("src/utils/mongodb/mongodb.ts");
        const missing = gameNames.filter(
            (name) =>
                !mongodbSource.includes(`${name}GameDataModel`) ||
                !mongodbSource.includes(`${name}InvitationModel`),
        );
        expect(
            missing,
            `These games are missing their discriminator models in ` +
                `src/utils/mongodb/mongodb.ts (the GameDataDiscriminatorKey/` +
                `InvitationDiscriminatorKey unions and the initialiseDiscriminators() records):\n` +
                missing.map((n) => `  - ${n}`).join("\n"),
        ).toEqual([]);
    });

    it("wires every game's recap adapter into the recap engine", () => {
        // Turn recap ("since you were last here") is opt-in per game via a
        // src/games/<Game>/recap.ts that registers an IRecapAdapter. Games
        // without one (e.g. Smartthink, by design) simply have no recap. But a
        // game that ships a recap.ts must be imported by the engine, or its
        // adapter never registers and buildEventFeed silently returns nothing.
        const recapEngine = read("src/utils/games/recap.ts");
        const withRecap = gameNames.filter((name) =>
            existsSync(path.join(gamesRoot, name, "recap.ts")),
        );
        const missing = withRecap.filter((name) => !recapEngine.includes(`@/games/${name}/recap`));
        expect(
            missing,
            `These games have a recap.ts that isn't imported by ` +
                `src/utils/games/recap.ts, so their recap adapter never registers. Add:\n` +
                missing.map((n) => `  import "@/games/${n}/recap";`).join("\n"),
        ).toEqual([]);
    });

    it("wires every game's result-stats calculator into the GameResult dispatch table", () => {
        // Per-game GameResult stats (AGENTS.md: "GameResult storage should include
        // some game specific statistics") are opt-in per game via a
        // compute<Game>ResultStats export from that game's <Game>Models.ts - same
        // opt-in shape as recap.ts above. A game that ships one must be wired into
        // GAME_RESULT_STATS in src/utils/mongodb/GameResultData.ts, or its stats
        // compile fine but are silently never recorded.
        const gameResultData = read("src/utils/mongodb/GameResultData.ts");
        const withResultStats = gameNames.filter((name) => {
            const modelsPath = path.join(gamesRoot, name, `${name}Models.ts`);
            return existsSync(modelsPath) && readFileSync(modelsPath, "utf8").includes(`compute${name}ResultStats`);
        });
        const missing = withResultStats.filter((name) => !gameResultData.includes(`compute${name}ResultStats`));
        expect(
            missing,
            `These games export a compute<Game>ResultStats() but it isn't wired into ` +
                `GAME_RESULT_STATS in src/utils/mongodb/GameResultData.ts:\n` +
                missing.map((n) => `  - ${n}`).join("\n"),
        ).toEqual([]);
    });

    it("handles every game's game-start branch in the invite accept route", () => {
        const acceptRoute = read("src/app/api/invite/accept/route.ts");
        const missing = gameNames.filter((name) => !acceptRoute.includes(`${name}GameDataModel`));
        expect(
            missing,
            `These games have no branch in src/app/api/invite/accept/route.ts to ` +
                `create their game document once every invitee has accepted:\n` +
                missing.map((n) => `  - ${n}`).join("\n"),
        ).toEqual([]);
    });
});
