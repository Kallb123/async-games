import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import { describe, expect, it } from "vitest";
import { registeredModels } from "./models";

// The app builds no index of its own (connectionOptions.ts); the deploy-time
// sync (scripts/sync-indexes.ts) builds them for the models in ./models.ts. A
// model that file doesn't import is a collection that never gets its indexes —
// silently, until a query on it is slow, or a unique index it was counting on
// isn't there. So this finds every source file that makes a Mongoose model and
// checks that loading ./models.ts already registered everything it makes.

const srcRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function sourceFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return sourceFiles(full);
        return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : [];
    });
}

// A file that imports Mongoose and calls `model(` / `.discriminator(`.
const modelFiles = sourceFiles(srcRoot).filter(file => {
    const text = readFileSync(file, "utf8");
    return /from ["']mongoose["']/.test(text) && /(?<![\w.])model\s*[<(]|\.discriminator\s*[<(]/.test(text);
});

describe("the model registry", () => {
    it("finds the model files, so the checks below can't pass for lack of looking", () => {
        expect(modelFiles.length).toBeGreaterThan(20);
        expect(registeredModels().length).toBeGreaterThan(20);
    });

    it("registers every model that every model file makes", async () => {
        const unlisted: string[] = [];
        for (const file of modelFiles) {
            const before = new Set(mongoose.modelNames());
            await import(/* @vite-ignore */ file);
            const added = mongoose.modelNames().filter(name => !before.has(name));
            if (added.length > 0) unlisted.push(`${path.relative(srcRoot, file)} (${added.join(", ")})`);
        }
        expect(
            unlisted,
            "These files register Mongoose models that src/utils/mongodb/models.ts does not import, so the " +
                "deploy-time index sync would never build their indexes. Add `import './<file>'` for each:\n" +
                unlisted.map(entry => `  - ${entry}`).join("\n"),
        ).toEqual([]);
    });

    it("hands the sync every registered model, base models and discriminators", () => {
        const names = registeredModels().map(model => model.modelName);
        expect(names.sort()).toEqual(mongoose.modelNames().sort());
        // Spot checks, one of each kind.
        expect(names).toContain("AchievementUnlock");
        expect(names).toContain("RealmArenaGameData");
        expect(names).toContain("RealmArenaGameResult");
        expect(names).toContain("KingdomBuilderWorld");
        expect(names).toContain("KingdomBuilderInvitation");
    });
});
