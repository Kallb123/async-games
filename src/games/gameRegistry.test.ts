import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Everything about a game lives in its src/games/<Game>/ folder (see
// ARCHITECTURE.md §3, §12), but a handful of shared files outside that folder
// still need a one-line addition per game: the GameLogic barrel, the GAME_META
// aggregator, and the Mongoose discriminator registration. Unlike the
// rules/command wiring guarded by serializableRegistry.test.ts (which rides on the @serializable
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

    it("registers every engine-backed game's Mongoose discriminator models in mongodb.ts", () => {
        // This also covers game creation: startGameFromInvitation picks a game's
        // model straight out of GAME_DATA_MODELS in this same file, so there is
        // no per-game branch in the invite-accept route left to check (the one
        // exception, Kingdom Builder's world invitations, is a standalone game
        // this test skips — see acceptSeat) — and the
        // record's typed keys make it a compile-time check on top of this one.
        const mongodbSource = read("src/utils/mongodb/mongodb.ts");
        const engineBackedGames = gameNames.filter((name) =>
            !read(`src/games/${name}/meta.ts`).includes('engine: "standalone"'),
        );
        const missing = engineBackedGames.filter(
            (name) =>
                !mongodbSource.includes(`${name}GameDataModel`) ||
                !mongodbSource.includes(`${name}InvitationModel`),
        );
        expect(
            missing,
            `These games are missing their discriminator models in ` +
                `src/utils/mongodb/mongodb.ts (the GameDataDiscriminatorKey/` +
                `InvitationDiscriminatorKey unions and the GAME_DATA_MODELS/INVITATION_MODELS records):\n` +
                missing.map((n) => `  - ${n}`).join("\n"),
        ).toEqual([]);
    });

    it("declares valid numeric player bounds in every game's meta.ts", async () => {
        for (const name of gameNames) {
            const { meta } = await import(`./${name}/meta.ts`);
            expect(Number.isInteger(meta.minPlayers), `${name}: meta.minPlayers must be an integer`).toBe(true);
            expect(Number.isInteger(meta.maxPlayers), `${name}: meta.maxPlayers must be an integer`).toBe(true);
            expect(meta.minPlayers, `${name}: meta.minPlayers must be at least 1`).toBeGreaterThanOrEqual(1);
            expect(meta.maxPlayers, `${name}: meta.maxPlayers must be >= minPlayers`).toBeGreaterThanOrEqual(meta.minPlayers);
        }
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

    it("wires every game's how-to-play guide into GAME_GUIDES", () => {
        // The how-to-play popup is opt-in per game via a
        // src/games/<Game>/guide.ts exporting a GameGuide. Games without one
        // (e.g. Solitaire, Snakes & Ladders) simply have no guide, and
        // guideForGame handles the miss. But a game that ships a guide.ts must
        // be added to GAME_GUIDES, or two things fail silently: the board can
        // still import the guide directly and show it, while /api/gameguides
        // validates with `body.game in GAME_GUIDES` and so rejects the "seen"
        // write — leaving the popup auto-showing on every single visit.
        const guides = read("src/utils/ui/gameGuides.ts");
        const withGuide = gameNames.filter((name) =>
            existsSync(path.join(gamesRoot, name, "guide.ts")),
        );
        const missing = withGuide.filter((name) => !guides.includes(`@/games/${name}/guide`));
        expect(
            missing,
            `These games have a guide.ts that isn't imported by ` +
                `src/utils/ui/gameGuides.ts, so their guide is missing from GAME_GUIDES. Add:\n` +
                missing.map((n) => `  import { guide as ${n[0].toLowerCase()}${n.slice(1)}Guide } from "@/games/${n}/guide";`).join("\n"),
        ).toEqual([]);
    });

    it("wires every game's interactive tutorial into GAME_TUTORIALS", () => {
        // Same opt-in shape as guide.ts above: a src/games/<Game>/tutorial.ts
        // exporting a GameTutorial. A game that ships one but isn't added to
        // GAME_TUTORIALS fails silently in the same two ways a missing guide
        // does — the board can still import it and pass it to GameShell
        // directly, while /api/gameguides validates with
        // `body.game in GAME_TUTORIALS` and so rejects the "seen" write,
        // leaving the tour auto-showing on every single visit.
        const tutorials = read("src/utils/ui/gameTutorials.ts");
        const withTutorial = gameNames.filter((name) =>
            existsSync(path.join(gamesRoot, name, "tutorial.ts")),
        );
        const missing = withTutorial.filter((name) => !tutorials.includes(`@/games/${name}/tutorial`));
        expect(
            missing,
            `These games have a tutorial.ts that isn't imported by ` +
                `src/utils/ui/gameTutorials.ts, so their tour is missing from GAME_TUTORIALS. Add:\n` +
                missing.map((n) => `  import { tutorial as ${n[0].toLowerCase()}${n.slice(1)}Tutorial } from "@/games/${n}/tutorial";`).join("\n"),
        ).toEqual([]);
    });

    it("wires every themed game's themes into GAME_THEMES", () => {
        // Themes are opt-in per game via a src/games/<Game>/themes.ts exporting
        // the game's list — same opt-in shape as guide.ts above. A game that
        // ships one but isn't in GAME_THEMES compiles and plays fine in its
        // default theme, and silently offers no picker on its setup screen, so
        // the alternative dressing is unreachable rather than broken.
        const themes = read("src/utils/ui/gameThemes.ts");
        const withThemes = gameNames.filter((name) =>
            existsSync(path.join(gamesRoot, name, "themes.ts")),
        );
        const missing = withThemes.filter((name) => !themes.includes(`@/games/${name}/themes`));
        expect(
            missing,
            `These games have a themes.ts that isn't imported by ` +
                `src/utils/ui/gameThemes.ts, so their themes are missing from GAME_THEMES:\n` +
                missing.map((n) => `  - ${n} (import its theme list and add it to GAME_THEMES)`).join("\n"),
        ).toEqual([]);
    });

    it("wires every game's achievements into GAME_ACHIEVEMENTS", () => {
        // Achievements are opt-in per game via a src/games/<Game>/achievements.ts
        // exporting `achievements` — same opt-in shape as guide.ts above. A game
        // that ships one but isn't in GAME_ACHIEVEMENTS compiles and plays fine,
        // and fails silently: the judge and every screen that lists achievements
        // read the registry and never a game's folder, so the game's achievements
        // are never judged, never stored and never shown. Nothing errors; they
        // just don't exist. (docs/achievements.md §3.5.)
        const registry = read("src/utils/games/achievements.ts");
        const withAchievements = gameNames.filter((name) =>
            existsSync(path.join(gamesRoot, name, "achievements.ts")),
        );
        const missing = withAchievements.filter((name) => !registry.includes(`@/games/${name}/achievements`));
        expect(
            missing,
            `These games have an achievements.ts that isn't imported by ` +
                `src/utils/games/achievements.ts, so their achievements are missing from GAME_ACHIEVEMENTS. Add:\n` +
                missing.map((n) => `  import { achievements as ${n[0].toLowerCase()}${n.slice(1)}Achievements } from "@/games/${n}/achievements";\n` +
                    `  …and a line for it in GAME_ACHIEVEMENTS, keyed by the game's meta.ts url`).join("\n"),
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
});
