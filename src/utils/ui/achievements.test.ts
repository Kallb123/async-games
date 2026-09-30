import { describe, expect, it, vi } from "vitest";
import { celebrate, gameAchievementRows, parseCelebrated, profileAchievements } from "./achievements";
import type { AchievementCatalogue } from "@/utils/games/achievements";
import type { IGameStats } from "@/utils/mongodb/GameResultData";
import { ending, ownCareer, platform } from "@/utils/testing/achievementFixtures";

const stats = (url: string, played: number, wins: number): IGameStats =>
    ({ url, wins, losses: played - wins, draws: 0, total: played, played });

const CATALOGUE: AchievementCatalogue = {
    games: {
        dicecities: [ownCareer("dicecities.mayor", record => record.won, 5), ending("dicecities.winner", () => true)],
        snakesandladders: [ownCareer("snakesandladders.regular", record => record.played, 3)],
        racecars: [ownCareer("racecars.driver", record => record.played, 1)],
    },
    platform: [platform("platform.first-win", career => career.won, 1), platform("platform.regular", career => career.played, 25)],
};

describe("profileAchievements", () => {
    it("puts the platform's first, then each game played, most-played first, and folds the rest away", () => {
        const { groups, unplayed } = profileAchievements([], [stats("snakesandladders", 4, 0), stats("dicecities", 2, 1)], CATALOGUE);

        expect(groups.map(group => group.key)).toEqual(["platform", "snakesandladders", "dicecities"]);
        expect(groups[0].label).toBe("Achievements");
        expect(groups[2].label).toBe("Dice Cities");
        expect(unplayed.map(group => group.key)).toEqual(["racecars"]);
    });

    it("counts what is unlocked out of everything there is", () => {
        const result = profileAchievements([{ id: "dicecities.winner", unlockedAt: "2026-03-01" }], [stats("dicecities", 2, 1)], CATALOGUE);

        // The stored match one, and First win, which the record already meets.
        expect(result.unlocked).toBe(2);
        expect(result.total).toBe(6);
    });

    it("shows a met career achievement as unlocked with no date until it is stored", () => {
        const { groups } = profileAchievements([], [stats("dicecities", 1, 1)], CATALOGUE);

        expect(groups[0].rows[0]).toEqual({ achievement: CATALOGUE.platform[0], unlocked: true });
    });

    it("links a stored unlock to its game's results only where that page exists", () => {
        const { groups } = profileAchievements([
            { id: "platform.first-win", unlockedAt: "2026-03-01", gameId: "g1", url: "dicecities", hasResult: true },
            { id: "dicecities.winner", unlockedAt: "2026-03-02", url: "dicecities", hasResult: false },
        ], [stats("dicecities", 1, 1)], CATALOGUE);

        expect(groups[0].rows[0]).toMatchObject({ unlocked: true, unlockedAt: "2026-03-01", href: "/games/result/g1" });
        expect(groups[1].rows[1]).toEqual({ achievement: CATALOGUE.games.dicecities[1], unlocked: true, unlockedAt: "2026-03-02" });
    });

    it("gives a locked career row its progress, from the game's own record or the whole career, never past the target", () => {
        const { groups } = profileAchievements([], [stats("dicecities", 30, 3), stats("snakesandladders", 2, 0)], CATALOGUE);

        const row = (key: string, index: number) => groups.find(group => group.key === key)!.rows[index];
        expect(row("dicecities", 0).progress).toBe("3 / 5");
        expect(row("snakesandladders", 0).progress).toBe("2 / 3");
        // 32 played across both games: capped at the target, and so unlocked.
        expect(row("platform", 1)).toMatchObject({ unlocked: true });
        // A locked match achievement has no progress to show.
        expect(row("dicecities", 1)).toEqual({ achievement: CATALOGUE.games.dicecities[1], unlocked: false });
    });

    it("drops a stored id the catalogue no longer knows", () => {
        const result = profileAchievements([{ id: "dicecities.withdrawn", unlockedAt: "2026-03-01" }], [], CATALOGUE);

        expect(result.unlocked).toBe(0);
    });

    it("shows no progress for a progress function that throws", () => {
        const broken: AchievementCatalogue = { games: {}, platform: [platform("platform.broken", () => { throw new Error("boom"); }, 5)] };
        const warn = vi.spyOn(console, "warn").mockImplementation(() => { });

        expect(profileAchievements([], [], broken).groups[0].rows[0]).toEqual({ achievement: broken.platform[0], unlocked: false });
        warn.mockRestore();
    });

    it("is empty for an empty catalogue", () => {
        expect(profileAchievements([], [stats("dicecities", 2, 1)], { games: {}, platform: [] })).toEqual({ unlocked: 0, total: 0, groups: [], unplayed: [] });
    });
});

describe("gameAchievementRows", () => {
    it("groups a game's unlocks by player in seat order, each in the order earned, and drops an unknown id", () => {
        const rows = gameAchievementRows([
            { userId: "user_ann", id: "dicecities.winner", unlockedAt: "2026-03-01T00:00:03Z" },
            { userId: "user_bob", id: "platform.first-win", unlockedAt: "2026-03-01T00:00:01Z" },
            { userId: "user_ann", id: "dicecities.withdrawn", unlockedAt: "2026-03-01T00:00:00Z" },
            { userId: "user_ann", id: "platform.first-win", unlockedAt: "2026-03-01T00:00:02Z" },
        ], ["user_ann", "user_bob"], CATALOGUE);

        expect(rows.map(row => [row.userId, row.achievement.id])).toEqual([
            ["user_ann", "platform.first-win"],
            ["user_ann", "dicecities.winner"],
            ["user_bob", "platform.first-win"],
        ]);
    });
});

describe("celebrate", () => {
    const NOW = Date.parse("2026-03-10T12:00:00Z");
    const DAY = 24 * 60 * 60 * 1000;
    const at = (daysAgo: number) => new Date(NOW - daysAgo * DAY).toISOString();
    const keys = (result: ReturnType<typeof celebrate>) => result.fresh.map(({ key }) => key);

    it("toasts a new unlock, and remembers it", () => {
        const result = celebrate([{ id: "dicecities.winner", unlockedAt: at(1), gameId: "g1" }], {}, NOW, CATALOGUE);

        expect(keys(result)).toEqual(["g1:dicecities.winner"]);
        expect(result.fresh[0].achievement).toBe(CATALOGUE.games.dicecities[1]);
        expect(result.celebrated).toEqual({ "g1:dicecities.winner": at(1) });
    });

    it("doesn't toast one already celebrated in this browser", () => {
        const result = celebrate([{ id: "dicecities.winner", unlockedAt: at(1), gameId: "g1" }], { "g1:dicecities.winner": at(1) }, NOW, CATALOGUE);

        expect(result.fresh).toEqual([]);
    });

    it("prunes what it remembers once it's no longer news, and doesn't toast it again for having forgotten", () => {
        const result = celebrate([{ id: "dicecities.winner", unlockedAt: at(8), gameId: "g1" }], { "g1:dicecities.winner": at(8), "g2:platform.first-win": at(2) }, NOW, CATALOGUE);

        expect(result.fresh).toEqual([]);
        expect(result.celebrated).toEqual({ "g2:platform.first-win": at(2) });
    });

    it("doesn't toast one older than a week, however new to this browser", () => {
        expect(celebrate([{ id: "dicecities.winner", unlockedAt: at(7.5), gameId: "g1" }], {}, NOW, CATALOGUE).fresh).toEqual([]);
    });

    it("doesn't toast a backfilled unlock, which no game earned, or an achievement the catalogue has withdrawn", () => {
        const result = celebrate([
            { id: "platform.first-win", unlockedAt: at(0) },
            { id: "dicecities.withdrawn", unlockedAt: at(0), gameId: "g1" },
        ], {}, NOW, CATALOGUE);

        expect(result.fresh).toEqual([]);
    });

    it("toasts an unlock offered twice at once only once", () => {
        const unlock = { id: "dicecities.winner", unlockedAt: at(0), gameId: "g1" };

        expect(keys(celebrate([unlock, unlock], {}, NOW, CATALOGUE))).toEqual(["g1:dicecities.winner"]);
    });
});

describe("parseCelebrated", () => {
    it("reads what the toaster stored, and anything else as nothing celebrated yet", () => {
        expect(parseCelebrated(JSON.stringify({ "g1:a": "2026-03-01" }))).toEqual({ "g1:a": "2026-03-01" });
        expect(parseCelebrated(null)).toEqual({});
        expect(parseCelebrated("not json")).toEqual({});
        expect(parseCelebrated("[1,2]")).toEqual({});
        expect(parseCelebrated(JSON.stringify({ "g1:a": 3 }))).toEqual({});
    });
});
