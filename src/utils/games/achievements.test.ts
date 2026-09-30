import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
    ACHIEVEMENT_CATALOGUE,
    PLATFORM_ACHIEVEMENTS,
    achievementById,
    careerMet,
    careerRecord,
    gameRecord,
    unlockedIds,
    withoutThisGame,
} from "./achievements";
import type { Achievement, AchievementCatalogue, CareerRecord, GameAchievement, PlatformAchievement } from "./achievements";
import { getReplayAdapter } from "./replay";
import type { IGameStats } from "@/utils/mongodb/GameResultData";
import { GAME_META } from "@/utils/ui/games";
import { reachableFrom, runtimeImports, SRC_ROOT } from "@/utils/testing/moduleGraph";

// ─── Test 1: the catalogue's integrity ───────────────────────────────────────
//
// docs/achievements.md §12, test 1. The catalogue is data that nothing else
// checks: a typo'd slug still compiles, a `notify` on the wrong kind of
// achievement just never fires, a missing icon file is an empty square on
// somebody's profile. So the rules live here, and they run over every entry
// the catalogue will ever have.
//
// While the catalogue is empty, though, every one of them passes for want of
// anything to look at — a rule that can't fail and a rule that was deleted look
// identical. So the rules are one pure function over a catalogue, run on the
// real one (the first test below) and on a small broken catalogue per rule (the
// table after it), each of which has to be flagged for exactly that rule.

/**
 * The games whose response is pinned for a viewer who holds no seat, in
 * src/utils/apiModels/games/hiddenHands.test.ts.
 *
 * A match achievement is judged on the table's view, which is the game's own
 * response builder asked for the `null` viewer (§9). A game can't have one
 * until a test says what that view holds — a sentinel for a game with hidden
 * state, an exact key set for one that hides nothing — or a loosened `null`
 * turns into a sentence on somebody's lock screen. Explicit, the way
 * RESPONSE_BUILDERS is in publicGameState.test.ts, so adding a game's first
 * match achievement without pinning its view is a failure here, not a silent
 * pass. Add a game to this list in the same commit as its pin.
 *
 * Every entry is a game with a `viewerId === null` assertion in that file today.
 * Banned Islet and Outbreak pass `null` in their undo and replay tests, but
 * that is about `canUndo` and replay parity, not about what the table can see,
 * so they're not here until their pin is written.
 */
const NULL_VIEW_PINNED = ["traintime", "worlddomination", "settlementsandcities", "firesout", "racecars"];

const GAMES_ROOT = path.join(SRC_ROOT, "games");

/** The folder under src/games/ whose meta.ts declares this slug. */
function folderOfSlug(slug: string): string | undefined {
    return readdirSync(GAMES_ROOT, { withFileTypes: true }).find(entry => {
        const metaFile = path.join(GAMES_ROOT, entry.name, "meta.ts");
        if (!entry.isDirectory() || !existsSync(metaFile)) return false;
        return new RegExp(`^\\s*url:\\s*["']${slug}["']`, "m").test(readFileSync(metaFile, "utf8"));
    })?.name;
}

/**
 * Whether the game has a replay adapter. Adapters register under the game
 * type's `className`, which is `<Folder>GameType` for every game, where the
 * folder is the one whose meta.ts holds the slug.
 */
function hasReplayAdapter(slug: string): boolean {
    const folder = folderOfSlug(slug);
    return folder !== undefined && getReplayAdapter(`${folder}GameType`) !== undefined;
}

/** What the catalogue is checked against, apart from itself: injectable so a fixture can say what's true. */
interface World {
    /** Every GAME_META slug. */
    slugs: ReadonlySet<string>;
    /** The slugs of the `engine: "standalone"` games. */
    standalone: ReadonlySet<string>;
    hasReplayAdapter: (slug: string) => boolean;
    nullViewPinned: ReadonlySet<string>;
    /** Whether a path, as written on an achievement (`/art/…`), is a file under public/. */
    artExists: (art: string) => boolean;
}

const REAL_WORLD: World = {
    slugs: new Set(Object.keys(GAME_META)),
    standalone: new Set(Object.values(GAME_META).filter(meta => meta.engine === "standalone").map(meta => meta.url)),
    hasReplayAdapter,
    nullViewPinned: new Set(NULL_VIEW_PINNED),
    artExists: art => existsSync(path.join(process.cwd(), "public", art)),
};

const ART_ROOT = "/art/achievements/";

/**
 * Everything wrong with a catalogue, one line each and each led by the rule it
 * breaks (`"notify: …"`). Empty means sound.
 */
function catalogueProblems(catalogue: AchievementCatalogue, overrides: Partial<World> = {}): string[] {
    const world = { ...REAL_WORLD, ...overrides };
    const problems: string[] = [];
    const seen = new Set<string>();

    // `prefix` is the registry key a game's ids must start with, or `platform.`.
    const checkOne = (prefix: string, achievement: Achievement) => {
        const { id, criteria } = achievement;
        if (seen.has(id)) problems.push(`duplicate id: ${id} is used more than once`);
        seen.add(id);
        if (!id.startsWith(prefix)) problems.push(`id prefix: ${id} should start with "${prefix}"`);
        if (achievement.notify !== undefined && !(criteria.kind === "match" && criteria.at === "turnEnd")) {
            problems.push(`notify: ${id} can only notify on a match achievement at "turnEnd", the only ones that unlock mid-game`);
        }
        if (achievement.art !== undefined) {
            if (!path.posix.normalize(achievement.art).startsWith(ART_ROOT)) {
                problems.push(`art: ${id}'s art ${achievement.art} is not under ${ART_ROOT}`);
            } else if (!world.artExists(achievement.art)) {
                problems.push(`art: ${id}'s art ${achievement.art} is not a file under public/`);
            }
        }
        if (criteria.kind === "career" && !(criteria.target >= 1)) {
            problems.push(`target: ${id} has a target of ${criteria.target}, which is met before anyone has played`);
        }
        for (const field of ["title", "icon", "description"] as const) {
            if (achievement[field].trim() === "") problems.push(`empty field: ${id} has an empty ${field}`);
        }
    };

    for (const [slug, achievements] of Object.entries(catalogue.games)) {
        if (!world.slugs.has(slug)) problems.push(`unknown game: "${slug}" is not a GAME_META slug`);
        if (world.standalone.has(slug)) {
            problems.push(`standalone game: ${slug} is a standalone game, which has no checkpoints to judge at`);
        }
        if (achievements.some(({ criteria }) => criteria.kind === "match")) {
            if (!world.hasReplayAdapter(slug)) {
                problems.push(`replay adapter: ${slug} has a match achievement but no replay adapter to build its view through`);
            }
            if (!world.nullViewPinned.has(slug)) {
                problems.push(`null view: ${slug} has a match achievement but its null view isn't pinned in hiddenHands.test.ts`);
            }
        }
        for (const achievement of achievements) checkOne(`${slug}.`, achievement);
    }
    for (const achievement of catalogue.platform) checkOne("platform.", achievement);

    return problems;
}

// One sound achievement to break one thing on. The broken ones below each differ
// from these by exactly the fault their rule is about.
const soundCareer = (id: string, extra: Partial<GameAchievement<unknown>> = {}): GameAchievement<unknown> => ({
    id,
    title: "Mayor",
    icon: "🏙️",
    description: "Win 5 games of Dice Cities.",
    criteria: { kind: "career", progress: record => record.won, target: 5 },
    ...extra,
});
const soundMatch = (id: string, extra: Partial<GameAchievement<unknown>> = {}): GameAchievement<unknown> => ({
    ...soundCareer(id),
    description: "Own all six Mines at the end of a turn.",
    criteria: { kind: "match", at: "turnEnd", check: () => true },
    ...extra,
});
const platformOf = (id: string, extra: Partial<PlatformAchievement> = {}): PlatformAchievement => ({
    id, title: "First win", icon: "🏆", description: "Win a game.",
    criteria: { kind: "career", progress: career => career.won, target: 1 },
    ...extra,
});
const gamesOnly = (games: Record<string, GameAchievement<unknown>[]>): AchievementCatalogue => ({ games, platform: [] });

describe("the catalogue's integrity", () => {
    it("holds for every achievement in the real catalogue", () => {
        // Vacuously, while the catalogue is empty. The table below is what
        // shows each rule can fail.
        expect(catalogueProblems(ACHIEVEMENT_CATALOGUE)).toEqual([]);
    });

    it("has a sound fixture to break: the rules flag nothing wrong with it", () => {
        // Without this, a fixture below could be flagged for some other reason
        // than the rule it stands for.
        const catalogue: AchievementCatalogue = {
            games: {
                dicecities: [soundCareer("dicecities.mayor"), soundMatch("dicecities.mine-baron", { notify: true })],
            },
            platform: [platformOf("platform.first-win")],
        };
        expect(catalogueProblems(catalogue, { nullViewPinned: new Set(["dicecities"]) })).toEqual([]);
    });

    const pinned = (...slugs: string[]) => ({ nullViewPinned: new Set(slugs) });

    // [rule, what's broken, a catalogue that breaks it, what the world says]
    it.each<[string, string, AchievementCatalogue, Partial<World>]>([
        [
            "duplicate id", "the same id twice in one game",
            gamesOnly({ dicecities: [soundCareer("dicecities.mayor"), soundCareer("dicecities.mayor")] }),
            {},
        ],
        [
            "duplicate id", "the same platform id twice",
            { games: {}, platform: [platformOf("platform.first-win"), platformOf("platform.first-win")] },
            {},
        ],
        [
            "unknown game", "a key that is no GAME_META slug",
            gamesOnly({ dicecitys: [soundCareer("dicecitys.mayor")] }),
            {},
        ],
        [
            "id prefix", "a game's id under another game's slug",
            gamesOnly({ dicecities: [soundCareer("settlementsandcities.mayor")] }),
            {},
        ],
        [
            "id prefix", "a game's id with no slug at all",
            gamesOnly({ dicecities: [soundCareer("mayor")] }),
            {},
        ],
        [
            "id prefix", "a platform id that isn't platform.",
            { games: {}, platform: [platformOf("dicecities.first-win")] },
            {},
        ],
        [
            "notify", "notify on a career achievement",
            gamesOnly({ dicecities: [soundCareer("dicecities.mayor", { notify: true })] }),
            {},
        ],
        [
            "notify", "notify on a match achievement judged only at the end",
            gamesOnly({
                dicecities: [soundMatch("dicecities.winner", { notify: true, criteria: { kind: "match", at: "end", check: () => true } })],
            }),
            pinned("dicecities"),
        ],
        [
            "notify", "notify on a platform achievement",
            { games: {}, platform: [platformOf("platform.first-win", { notify: true })] },
            {},
        ],
        [
            "art", "art outside /art/achievements/",
            gamesOnly({ dicecities: [soundCareer("dicecities.mayor", { art: "/art/dicecities/icon.png" })] }),
            {},
        ],
        [
            "art", "art that climbs out of /art/achievements/",
            gamesOnly({ dicecities: [soundCareer("dicecities.mayor", { art: "/art/achievements/../dicecities/icon.png" })] }),
            {},
        ],
        [
            "art", "art under /art/achievements/ that isn't there",
            gamesOnly({ dicecities: [soundCareer("dicecities.mayor", { art: "/art/achievements/mayor.png" })] }),
            { artExists: () => false },
        ],
        [
            "standalone game", "an entry for a standalone game",
            gamesOnly({ kingdombuilder: [soundCareer("kingdombuilder.founder")] }),
            {},
        ],
        [
            "replay adapter", "a match achievement in a game with no replay adapter",
            gamesOnly({ dicecities: [soundMatch("dicecities.mine-baron")] }),
            { hasReplayAdapter: () => false, ...pinned("dicecities") },
        ],
        [
            "null view", "a match achievement in a game whose null view isn't pinned",
            gamesOnly({ dicecities: [soundMatch("dicecities.mine-baron")] }),
            pinned(),
        ],
        [
            "target", "a career target of zero",
            gamesOnly({ dicecities: [soundCareer("dicecities.mayor", { criteria: { kind: "career", progress: record => record.won, target: 0 } })] }),
            {},
        ],
        [
            "target", "a career target that isn't a number",
            gamesOnly({ dicecities: [soundCareer("dicecities.mayor", { criteria: { kind: "career", progress: record => record.won, target: NaN } })] }),
            {},
        ],
        [
            "empty field", "an empty title",
            gamesOnly({ dicecities: [soundCareer("dicecities.mayor", { title: "" })] }),
            {},
        ],
        [
            "empty field", "a blank icon",
            gamesOnly({ dicecities: [soundCareer("dicecities.mayor", { icon: "  " })] }),
            {},
        ],
        [
            "empty field", "an empty description",
            gamesOnly({ dicecities: [soundCareer("dicecities.mayor", { description: "" })] }),
            {},
        ],
    ])("flags %s: %s", (rule, _broken, catalogue, world) => {
        const problems = catalogueProblems(catalogue, world);
        expect(problems.length).toBeGreaterThan(0);
        // Every problem is the rule's own: nothing else about the fixture is wrong.
        expect(problems.filter(problem => !problem.startsWith(`${rule}: `))).toEqual([]);
    });

    it("keeps a game's match achievements and its career ones apart: a career-only game needs no pin", () => {
        // The adapter and pin rules are about the table's view, which a career
        // achievement never reads — so Solitaire, which has no adapter, can
        // still have a "win 5 games" of its own.
        const catalogue = gamesOnly({ solitaire: [soundCareer("solitaire.patient")] });
        expect(catalogueProblems(catalogue, { hasReplayAdapter: () => false })).toEqual([]);
    });

    describe("the lists it checks against", () => {
        it("pins only games that exist", () => {
            for (const slug of NULL_VIEW_PINNED) expect(GAME_META[slug], `${slug} is not in GAME_META`).toBeDefined();
        });

        it("finds a replay adapter by the game's folder, and only where there is one", () => {
            // The convention the rule leans on: className is `<Folder>GameType`.
            // One game each way, so a broken lookup can't answer true (or false)
            // for everything and pass.
            expect(hasReplayAdapter("dicecities")).toBe(true);
            expect(hasReplayAdapter("settlementsandcities")).toBe(true);
            // Solitaire is engine-backed but has no adapter (docs/achievements.md §11).
            expect(hasReplayAdapter("solitaire")).toBe(false);
            expect(hasReplayAdapter("no-such-game")).toBe(false);
        });

        it("knows which game is standalone", () => {
            expect(REAL_WORLD.standalone.has("kingdombuilder")).toBe(true);
            expect(REAL_WORLD.standalone.has("dicecities")).toBe(false);
        });
    });
});

// ─── Test 1, cont.: nothing the browser loads is server-only ─────────────────
//
// achievements.ts ships to the client (it draws a locked row's "3 / 5"), and so
// does every game's achievements.ts it imports. The server SDKs — Mongoose and
// the MongoDB driver beneath it, Clerk's server entry, Firebase's Admin SDK —
// and the models that wrap them can't go there, and "can't" means "builds fine,
// throws in the browser". So walk what the catalogue reaches at runtime — which
// catches the indirect case, `achievements.ts -> ./rules.ts -> ./XModels.ts`,
// that a look at the file's own imports would not.
//
// Each is matched as the package or any path under it (`firebase-admin/app`,
// `mongodb/lib/…`), because that is how they are usually imported. Nothing
// matches on a folder: `utils/firebase/` holds the *client* Firebase app too,
// which the browser is meant to load, so the admin SDK is caught by its package
// name, wherever the file that imports it sits.

const SERVER_ONLY_PACKAGES = ["mongoose", "mongodb", "@clerk/nextjs/server", "firebase-admin"];

const fromSrc = (file: string) => path.relative(SRC_ROOT, file).split(path.sep).join("/");

/** Every way `entry` reaches something server-only at runtime, each as the chain that got there. */
function serverOnlyOffenders(entry: string): string[] {
    const offenders: string[] = [];
    for (const [file, chain] of reachableFrom(entry)) {
        const shown = chain.map(fromSrc).join(" -> ");
        if (fromSrc(file).startsWith("utils/mongodb/")) offenders.push(`${shown} (under src/utils/mongodb/)`);
        if (/Models\.tsx?$/.test(file)) offenders.push(`${shown} (a *Models.ts)`);
        for (const specifier of runtimeImports(file)) {
            if (SERVER_ONLY_PACKAGES.some(pkg => specifier === pkg || specifier.startsWith(`${pkg}/`))) {
                offenders.push(`${shown} (imports ${specifier})`);
            }
        }
    }
    return offenders;
}

describe("what the catalogue reaches at runtime", () => {
    it("is nothing server-only", () => {
        expect(serverOnlyOffenders(path.join(SRC_ROOT, "utils/games/achievements.ts"))).toEqual([]);
    });

    describe("the check that says so", () => {
        const scratch = mkdtempSync(path.join(tmpdir(), "achievements-graph-"));
        const at = (file: string) => path.join(scratch, file);
        // A package by its own name and by a path under it, for each SDK added
        // beside Mongoose and Clerk.
        const SDK_SPECIFIERS = ["mongodb", "mongodb/lib/utils", "firebase-admin", "firebase-admin/app"];
        const scratchName = (specifier: string) => `via-${specifier.replace(/\W/g, "-")}.ts`;

        beforeAll(() => {
            mkdirSync(at("rules"), { recursive: true });
            writeFileSync(at("clean.ts"), `import type { IGameStats } from "@/utils/mongodb/GameResultData";\nimport { rule } from "./rules/rule";\nexport const x = rule;\n`);
            writeFileSync(at("rules/rule.ts"), `export const rule = 1;\n`);
            writeFileSync(at("reachesThing.ts"), `import { rule } from "./rules/rule";\nimport { model } from "./rules/ThingModels";\nexport const x = [rule, model];\n`);
            writeFileSync(at("rules/ThingModels.ts"), `export const model = 1;\n`);
            writeFileSync(at("viaClerk.ts"), `import { rule } from "./indirect";\nexport const x = rule;\n`);
            writeFileSync(at("indirect.ts"), `import { auth } from "@clerk/nextjs/server";\nexport const rule = auth;\n`);
            writeFileSync(at("viaMongoose.ts"), `import mongoose from "mongoose";\nexport const x = mongoose;\n`);
            writeFileSync(at("viaClientFirebase.ts"), `import { initializeApp } from "firebase/app";\nexport const x = initializeApp;\n`);
            for (const specifier of SDK_SPECIFIERS) {
                writeFileSync(at(scratchName(specifier)), `import * as sdk from "${specifier}";\nexport const x = sdk;\n`);
            }
        });
        afterAll(() => rmSync(scratch, { recursive: true, force: true }));

        it("passes a module whose only database import is a type", () => {
            expect(serverOnlyOffenders(at("clean.ts"))).toEqual([]);
        });

        it("fails a module that reaches a *Models.ts", () => {
            expect(serverOnlyOffenders(at("reachesThing.ts"))).toEqual([expect.stringContaining("(a *Models.ts)")]);
        });

        it("fails a module that imports Clerk's server SDK, however far down", () => {
            expect(serverOnlyOffenders(at("viaClerk.ts"))).toEqual([expect.stringContaining("(imports @clerk/nextjs/server)")]);
        });

        it("fails a module that imports Mongoose", () => {
            expect(serverOnlyOffenders(at("viaMongoose.ts"))).toEqual([expect.stringContaining("(imports mongoose)")]);
        });

        it.each(SDK_SPECIFIERS)("fails a module that imports %s", (specifier) => {
            expect(serverOnlyOffenders(at(scratchName(specifier)))).toEqual([expect.stringContaining(`(imports ${specifier})`)]);
        });

        it("passes a module that imports the client Firebase SDK, which is not the admin one", () => {
            expect(serverOnlyOffenders(at("viaClientFirebase.ts"))).toEqual([]);
        });

        it("tells the admin Firebase module from the client one, though they share a folder", () => {
            // adminFirebase.ts imports firebase-admin/app; firebase.ts is the
            // browser's own app. Both sit in utils/firebase/, so only the package
            // can tell them apart.
            expect(serverOnlyOffenders(path.join(SRC_ROOT, "utils/firebase/adminFirebase.ts"))).toContainEqual(expect.stringContaining("(imports firebase-admin/app)"));
            expect(serverOnlyOffenders(path.join(SRC_ROOT, "utils/firebase/firebase.ts"))).toEqual([]);
        });

        it("fails a real module that reaches the database, for all three reasons", () => {
            // recap.ts is server code: it imports GameData, which brings
            // Mongoose, and replay.ts, which brings every game's models.
            const offenders = serverOnlyOffenders(path.join(SRC_ROOT, "utils/games/recap.ts"));
            expect(offenders).toContainEqual(expect.stringContaining("(under src/utils/mongodb/)"));
            expect(offenders).toContainEqual(expect.stringContaining("(a *Models.ts)"));
            expect(offenders).toContainEqual(expect.stringContaining("(imports mongoose)"));
        });
    });
});

// ─── Test 3: the pure helpers ────────────────────────────────────────────────

/**
 * A byGame row, as the profile's aggregation builds it: `total` is every outcome
 * added up. `played` is the same unless a row says otherwise: the games in it a
 * surrender or an abandonment ended too early to count (§8) are in `total` and
 * not in `played`.
 */
const stats = (url: string, wins: number, losses = 0, draws = 0, played = wins + losses + draws): IGameStats => ({
    url, wins, losses, draws, total: wins + losses + draws, played,
});

// A small catalogue with one of each shape of `progress` the plan names (§3.2),
// judged against records built by hand.
const TEST_CATALOGUE: AchievementCatalogue = {
    games: {
        dicecities: [
            { id: "dicecities.mayor", title: "Mayor", icon: "🏙️", description: "Win 5 games of Dice Cities.",
              criteria: { kind: "career", progress: record => record.won, target: 5 } },
            { id: "dicecities.regular", title: "Regular", icon: "🎲", description: "Play 3 games of Dice Cities.",
              criteria: { kind: "career", progress: record => record.played, target: 3 } },
            { id: "dicecities.mine-baron", title: "Mine Baron", icon: "⛏️", description: "Own all six Mines at the end of a turn.",
              criteria: { kind: "match", at: "turnEnd", check: () => true } },
        ],
        settlementsandcities: [
            { id: "settlementsandcities.builder", title: "Builder", icon: "🏘️", description: "Win a game of Settlements & Cities.",
              criteria: { kind: "career", progress: record => record.won, target: 1 } },
        ],
    },
    platform: [
        { id: "platform.first-win", title: "First win", icon: "🏆", description: "Win a game.",
          criteria: { kind: "career", progress: career => career.won, target: 1 } },
        { id: "platform.explorer", title: "Explorer", icon: "🧭", description: "Play 3 different games.",
          criteria: { kind: "career", progress: career => Object.values(career.games).filter(game => game.played > 0).length, target: 3 } },
        { id: "platform.double-champion", title: "Double champion", icon: "🥇", description: "Win 2 games of each of Dice Cities and Settlements & Cities.",
          criteria: { kind: "career",
                      progress: career => Math.min(career.games.dicecities?.won ?? 0, career.games.settlementsandcities?.won ?? 0),
                      target: 2 } },
    ],
};

const idsOf = (achievements: Achievement[]) => achievements.map(achievement => achievement.id).sort();

describe("careerRecord", () => {
    it("is all zeroes for a player with no history", () => {
        expect(careerRecord([])).toEqual({ played: 0, won: 0, games: {} });
    });

    it("counts one game's record at the top and under its slug", () => {
        // Losses and draws were played too; only the wins are won.
        expect(careerRecord([stats("dicecities", 3, 2, 1)])).toEqual({
            played: 6,
            won: 3,
            games: { dicecities: { played: 6, won: 3 } },
        });
    });

    it("sums several games at the top and keeps each one's own", () => {
        expect(careerRecord([stats("dicecities", 3, 2), stats("settlementsandcities", 1, 0, 4), stats("traintime", 2)])).toEqual({
            played: 12,
            won: 6,
            games: {
                dicecities: { played: 5, won: 3 },
                settlementsandcities: { played: 5, won: 1 },
                traintime: { played: 2, won: 2 },
            },
        });
    });

    it("counts a game's `played`, not the `total` the profile shows", () => {
        // Six finished games, two of them surrendered in the first turn: the
        // profile says six, the record says four.
        expect(careerRecord([stats("dicecities", 3, 1, 2, 4)])).toEqual({
            played: 4,
            won: 3,
            games: { dicecities: { played: 4, won: 3 } },
        });
    });

    it("keeps a game with no wins: played, and won nothing", () => {
        const career = careerRecord([stats("dicecities", 0, 4)]);
        expect(career.games.dicecities).toEqual({ played: 4, won: 0 });
        expect(career.won).toBe(0);
    });

    it("adds a url that comes up twice rather than keeping the last", () => {
        // Not something the aggregation does (one row per url), but the top
        // level and the game's own must agree whatever it's handed.
        const career = careerRecord([stats("dicecities", 1, 1), stats("dicecities", 2, 0)]);
        expect(career).toEqual({ played: 4, won: 3, games: { dicecities: { played: 4, won: 3 } } });
    });

    it("leaves the rows it's given alone", () => {
        const rows = [stats("dicecities", 3, 2)];
        const copy = structuredClone(rows);
        careerRecord(rows);
        expect(rows).toEqual(copy);
    });
});

describe("gameRecord", () => {
    const career = careerRecord([stats("dicecities", 3, 2)]);

    it("reads the game's own record", () => {
        expect(gameRecord(career, "dicecities")).toEqual({ played: 5, won: 3 });
    });

    it("is zeroes for a game they've never played, so a progress never has to guard", () => {
        expect(gameRecord(career, "settlementsandcities")).toEqual({ played: 0, won: 0 });
        expect(gameRecord(careerRecord([]), "dicecities")).toEqual({ played: 0, won: 0 });
    });
});

describe("achievementById", () => {
    it("finds a game's own achievement and a platform one", () => {
        expect(achievementById("dicecities.mayor", TEST_CATALOGUE)?.title).toBe("Mayor");
        expect(achievementById("platform.explorer", TEST_CATALOGUE)?.title).toBe("Explorer");
    });

    it("answers undefined for an id the catalogue doesn't know, and never throws", () => {
        for (const id of ["dicecities.withdrawn", "", "constructor", "__proto__", "platform."]) {
            expect(achievementById(id, TEST_CATALOGUE), id).toBeUndefined();
        }
        expect(achievementById("dicecities.mayor", { games: {}, platform: [] })).toBeUndefined();
    });

    it("reads the real registries when no catalogue is passed", () => {
        // The real catalogue is empty, so put something in it for a moment.
        const added: PlatformAchievement = {
            id: "platform.test-only", title: "Test", icon: "🧪", description: "Only in a test.",
            criteria: { kind: "career", progress: career => career.won, target: 1 },
        };
        PLATFORM_ACHIEVEMENTS.push(added);
        try {
            expect(achievementById("platform.test-only")).toBe(added);
        } finally {
            PLATFORM_ACHIEVEMENTS.pop();
        }
        expect(achievementById("platform.test-only")).toBeUndefined();
    });
});

describe("careerMet", () => {
    const met = (byGame: IGameStats[]) => idsOf(careerMet(careerRecord(byGame), TEST_CATALOGUE));

    it("is nothing for a player with no history", () => {
        expect(met([])).toEqual([]);
    });

    it("is nothing from an empty catalogue, whatever the history", () => {
        expect(careerMet(careerRecord([stats("dicecities", 9)]), { games: {}, platform: [] })).toEqual([]);
    });

    it("judges a game's own achievement on that game's record and the platform's on the whole", () => {
        expect(met([stats("dicecities", 5)])).toEqual([
            "dicecities.mayor", "dicecities.regular", "platform.first-win",
        ]);
    });

    it("never lets another game's record advance a game's own achievement", () => {
        // Nine wins at Settlements & Cities is not a win at Dice Cities.
        expect(met([stats("settlementsandcities", 9)])).toEqual([
            "platform.first-win", "settlementsandcities.builder",
        ]);
    });

    it("counts played, not just won, for a played achievement", () => {
        expect(met([stats("dicecities", 0, 2, 1)])).toEqual(["dicecities.regular"]);
    });

    it("leaves a played achievement unmet by games that only count toward the profile's total", () => {
        // Three finished games, but one was surrendered in its first turn.
        expect(met([stats("dicecities", 0, 1, 2, 2)])).toEqual([]);
        expect(met([stats("dicecities", 0, 1, 2, 3)])).toEqual(["dicecities.regular"]);
    });

    it("leaves a platform win achievement unmet for a game with no wins", () => {
        expect(met([stats("dicecities", 0, 4)])).toEqual(["dicecities.regular"]);
    });

    it("meets a cross-game achievement only when every game it names is met", () => {
        expect(met([stats("dicecities", 2), stats("settlementsandcities", 1)])).not.toContain("platform.double-champion");
        expect(met([stats("dicecities", 2), stats("settlementsandcities", 2)])).toContain("platform.double-champion");
    });

    it("counts different games played, with a no-win game among them", () => {
        expect(met([stats("dicecities", 1), stats("settlementsandcities", 0, 1), stats("traintime", 0, 0, 1)]))
            .toContain("platform.explorer");
        expect(met([stats("dicecities", 1), stats("settlementsandcities", 0, 1)])).not.toContain("platform.explorer");
    });

    it("never offers a match achievement, which no record can decide", () => {
        expect(met([stats("dicecities", 50)])).not.toContain("dicecities.mine-baron");
    });

    describe("a progress that throws", () => {
        const catalogue: AchievementCatalogue = {
            games: {
                dicecities: [
                    { id: "dicecities.broken", title: "Broken", icon: "💥", description: "Throws.",
                      criteria: { kind: "career", progress: () => { throw new Error("boom"); }, target: 1 } },
                    { id: "dicecities.nan", title: "Not a number", icon: "❓", description: "Answers NaN.",
                      criteria: { kind: "career", progress: () => NaN, target: 1 } },
                    { id: "dicecities.fine", title: "Fine", icon: "👍", description: "Play a game.",
                      criteria: { kind: "career", progress: record => record.played, target: 1 } },
                ],
            },
            platform: [
                { id: "platform.broken", title: "Broken", icon: "💥", description: "Throws.",
                  criteria: { kind: "career", progress: () => { throw new Error("boom"); }, target: 1 } },
                { id: "platform.fine", title: "Fine", icon: "👍", description: "Play a game.",
                  criteria: { kind: "career", progress: career => career.played, target: 1 } },
            ],
        };

        it("costs only itself, with a warning that names it", () => {
            const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
            try {
                const result = careerMet(careerRecord([stats("dicecities", 1)]), catalogue);
                expect(idsOf(result)).toEqual(["dicecities.fine", "platform.fine"]);
                expect(warn).toHaveBeenCalledTimes(2);
                const warned = warn.mock.calls.map(([message]) => message).join("\n");
                expect(warned).toContain("dicecities.broken");
                expect(warned).toContain("platform.broken");
            } finally {
                warn.mockRestore();
            }
        });

        it("doesn't stop unlockedIds either", () => {
            const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
            try {
                expect([...unlockedIds([], [stats("dicecities", 1)], catalogue)].sort()).toEqual(["dicecities.fine", "platform.fine"]);
            } finally {
                warn.mockRestore();
            }
        });
    });
});

describe("unlockedIds", () => {
    it("is empty for nothing stored and no history", () => {
        expect(unlockedIds([], [], TEST_CATALOGUE)).toEqual(new Set());
    });

    it("is the stored ids alone when no history meets anything", () => {
        // A match achievement, which a record can't derive: only a stored row says it.
        expect(unlockedIds(["dicecities.mine-baron"], [], TEST_CATALOGUE)).toEqual(new Set(["dicecities.mine-baron"]));
    });

    it("adds every career achievement the history already meets, with nothing stored", () => {
        // A veteran's first look (§5.3).
        expect(unlockedIds([], [stats("dicecities", 5)], TEST_CATALOGUE))
            .toEqual(new Set(["dicecities.mayor", "dicecities.regular", "platform.first-win"]));
    });

    it("drops a stored id the catalogue no longer knows, quietly", () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        try {
            expect(unlockedIds(["dicecities.withdrawn", "platform.first-win", ""], [], TEST_CATALOGUE))
                .toEqual(new Set(["platform.first-win"]));
            expect(warn).not.toHaveBeenCalled();
        } finally {
            warn.mockRestore();
        }
    });

    it("lists an achievement once when it is both stored and met", () => {
        const ids = unlockedIds(["platform.first-win", "dicecities.mine-baron"], [stats("dicecities", 1)], TEST_CATALOGUE);
        expect([...ids].sort()).toEqual(["dicecities.mine-baron", "platform.first-win"]);
    });

    it("does not mutate what it is given", () => {
        const stored = ["platform.first-win"];
        unlockedIds(stored, [stats("dicecities", 5)], TEST_CATALOGUE);
        expect(stored).toEqual(["platform.first-win"]);
    });
});

describe("withoutThisGame", () => {
    const career = careerRecord([stats("dicecities", 3, 2), stats("settlementsandcities", 1)]);
    const aWin = { played: true, won: true };

    it("takes a win back out at the top level and under its game", () => {
        expect(withoutThisGame(career, "dicecities", aWin)).toEqual({
            played: 5,
            won: 3,
            games: { dicecities: { played: 4, won: 2 }, settlementsandcities: { played: 1, won: 1 } },
        });
    });

    it("takes a loss out of played alone", () => {
        expect(withoutThisGame(career, "dicecities", { played: true, won: false })).toEqual({
            played: 5,
            won: 4,
            games: { dicecities: { played: 4, won: 3 }, settlementsandcities: { played: 1, won: 1 } },
        });
    });

    it("takes nothing out of a game that never counted as played", () => {
        // A surrender that ended too early to count, which is also no win.
        expect(withoutThisGame(career, "dicecities", { played: false, won: false })).toEqual(career);
    });

    it("leaves every other game's record alone", () => {
        const before = withoutThisGame(career, "settlementsandcities", aWin);
        expect(before.games.dicecities).toEqual({ played: 5, won: 3 });
        expect(before.games.settlementsandcities).toEqual({ played: 0, won: 0 });
    });

    it("never goes below zero", () => {
        const empty: CareerRecord = { played: 0, won: 0, games: { dicecities: { played: 0, won: 0 } } };
        expect(withoutThisGame(empty, "dicecities", aWin)).toEqual(empty);
        // Top and game disagreeing can't be made worse by it, either.
        const lopsided: CareerRecord = { played: 1, won: 0, games: { dicecities: { played: 0, won: 0 } } };
        expect(withoutThisGame(lopsided, "dicecities", aWin)).toEqual({
            played: 0, won: 0, games: { dicecities: { played: 0, won: 0 } },
        });
    });

    it("doesn't invent an entry for a game that has none", () => {
        const result = withoutThisGame(career, "traintime", aWin);
        expect(result.games).toEqual(career.games);
        expect(result.played).toBe(5);
    });

    it("doesn't touch its input", () => {
        const snapshot = structuredClone(career);
        const frozen = Object.freeze({
            ...career,
            games: Object.freeze(Object.fromEntries(Object.entries(career.games).map(([slug, record]) => [slug, Object.freeze({ ...record })]))),
        });
        const result = withoutThisGame(frozen, "dicecities", aWin);
        expect(career).toEqual(snapshot);
        expect(result).not.toBe(frozen);
        expect(result.games).not.toBe(frozen.games);
    });
});

// Tipped, or backfilled? (§4.3) An achievement that's met now is *tipped* by
// the game that just finished if it wasn't met before that game, and
// *backfilled* if it was — as happens to every veteran at launch. The test
// reads the same way the judge will: build the record, take this game back out
// of it, and see what is still met.
function tippedAndBackfilled(byGame: IGameStats[], slug: string, thisGame: { played: boolean; won: boolean }, catalogue: AchievementCatalogue) {
    const career = careerRecord(byGame);
    const before = new Set(careerMet(withoutThisGame(career, slug, thisGame), catalogue).map(achievement => achievement.id));
    const nowMet = careerMet(career, catalogue);
    return {
        tipped: idsOf(nowMet.filter(achievement => !before.has(achievement.id))),
        backfilled: idsOf(nowMet.filter(achievement => before.has(achievement.id))),
    };
}

/** A catalogue of one achievement. */
const only = (achievement: PlatformAchievement): AchievementCatalogue => ({ games: {}, platform: [achievement] });
const platformRule = (progress: (career: CareerRecord) => number, target: number): PlatformAchievement => ({
    id: "platform.rule", title: "Rule", icon: "📏", description: "A rule.", criteria: { kind: "career", progress, target },
});

describe("tipped by this game, or backfilled", () => {
    const aWin = { played: true, won: true };
    const aLoss = { played: true, won: false };

    describe("a win count (record => record.won)", () => {
        const catalogue = only(platformRule(career => career.won, 5));

        it("is tipped by the fifth win", () => {
            expect(tippedAndBackfilled([stats("dicecities", 5)], "dicecities", aWin, catalogue))
                .toEqual({ tipped: ["platform.rule"], backfilled: [] });
        });

        it("is backfilled when the win was the sixth", () => {
            expect(tippedAndBackfilled([stats("dicecities", 6)], "dicecities", aWin, catalogue))
                .toEqual({ tipped: [], backfilled: ["platform.rule"] });
        });

        it("is backfilled when this game was a loss, which can't have moved a win count", () => {
            expect(tippedAndBackfilled([stats("dicecities", 5, 1)], "dicecities", aLoss, catalogue))
                .toEqual({ tipped: [], backfilled: ["platform.rule"] });
        });
    });

    describe("a played count (record => record.played)", () => {
        const catalogue = only(platformRule(career => career.played, 3));

        it("is tipped by a loss that was the third game", () => {
            expect(tippedAndBackfilled([stats("dicecities", 2, 1)], "dicecities", aLoss, catalogue))
                .toEqual({ tipped: ["platform.rule"], backfilled: [] });
        });

        it("is backfilled when the game was the fourth", () => {
            expect(tippedAndBackfilled([stats("dicecities", 2, 2)], "dicecities", aLoss, catalogue))
                .toEqual({ tipped: [], backfilled: ["platform.rule"] });
        });

        it("isn't advanced by a game that didn't count as played", () => {
            // Already met at 3 without it: the early surrender didn't tip it.
            expect(tippedAndBackfilled([stats("dicecities", 2, 1)], "dicecities", { played: false, won: false }, catalogue))
                .toEqual({ tipped: [], backfilled: ["platform.rule"] });
        });
    });

    describe("a count of different games (Object.values(career.games).filter(played > 0))", () => {
        const catalogue = only(platformRule(career => Object.values(career.games).filter(game => game.played > 0).length, 3));

        it("is tipped by the first game at a third game", () => {
            // Without it the third game's record is zero, so it isn't one of the three.
            expect(tippedAndBackfilled([stats("dicecities", 1), stats("settlementsandcities", 0, 1), stats("traintime", 1)], "traintime", aWin, catalogue))
                .toEqual({ tipped: ["platform.rule"], backfilled: [] });
        });

        it("is backfilled by another game at one already counted", () => {
            expect(tippedAndBackfilled([stats("dicecities", 1), stats("settlementsandcities", 0, 1), stats("traintime", 2)], "traintime", aWin, catalogue))
                .toEqual({ tipped: [], backfilled: ["platform.rule"] });
        });
    });

    describe("a minimum across games (Math.min of two games' wins)", () => {
        const catalogue = only(platformRule(
            career => Math.min(career.games.dicecities?.won ?? 0, career.games.settlementsandcities?.won ?? 0),
            2,
        ));

        it("is tipped by the win that brings the lesser game up", () => {
            expect(tippedAndBackfilled([stats("dicecities", 2), stats("settlementsandcities", 2)], "settlementsandcities", aWin, catalogue))
                .toEqual({ tipped: ["platform.rule"], backfilled: [] });
        });

        it("is backfilled by a win in the game that was already ahead", () => {
            expect(tippedAndBackfilled([stats("dicecities", 3), stats("settlementsandcities", 2)], "dicecities", aWin, catalogue))
                .toEqual({ tipped: [], backfilled: ["platform.rule"] });
        });

        it("is backfilled by a loss in either game", () => {
            expect(tippedAndBackfilled([stats("dicecities", 2), stats("settlementsandcities", 2, 1)], "settlementsandcities", aLoss, catalogue))
                .toEqual({ tipped: [], backfilled: ["platform.rule"] });
        });
    });

    describe("a game's own career achievement", () => {
        it("is tipped by a game of that game, and backfilled by a game of another", () => {
            // Both Mayor (wins, 5) and Builder (wins, 1) are met; the finished game decides which it tipped.
            const byGame = [stats("dicecities", 5), stats("settlementsandcities", 1)];
            expect(tippedAndBackfilled(byGame, "dicecities", aWin, TEST_CATALOGUE).tipped).toContain("dicecities.mayor");
            expect(tippedAndBackfilled(byGame, "settlementsandcities", aWin, TEST_CATALOGUE).backfilled).toContain("dicecities.mayor");
            expect(tippedAndBackfilled(byGame, "settlementsandcities", aWin, TEST_CATALOGUE).tipped).toContain("settlementsandcities.builder");
        });
    });
});
