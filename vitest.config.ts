import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// A test that holds code to a time budget lives in a `*.pace.test.ts` file:
// those run once every other file has finished, one at a time, so a budget is
// read against the code's own work rather than how busy the runner is with
// the files beside it.
const PACE = ["src/**/*.pace.test.ts"];

export default defineConfig({
    resolve: {
        alias: {
            "@": fileURLToPath(new URL("./src", import.meta.url)),
        },
    },
    test: {
        environment: "node",
        projects: [
            {
                extends: true,
                test: { name: "unit", include: ["src/**/*.test.ts", "scripts/**/*.test.ts"], exclude: PACE },
            },
            {
                extends: true,
                test: { name: "pace", include: PACE, fileParallelism: false, sequence: { groupOrder: 1 } },
            },
        ],
    },
});
