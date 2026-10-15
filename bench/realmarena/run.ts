// The Realm Arena rendering bench (docs/realm-arena-rendering.md §2): draws a
// frozen Hold Out battle with `RealmArenaBoard` on a throttled phone in headless
// Chromium, plays scripted scenarios over it, and reports what each cost —
// frames, long tasks, React commits, and the browser's own trace of script,
// style, layout, paint and raster. Needs nothing but this checkout: no Next
// build, no Clerk, no database.
//
//   npm run ra-bench                          every scenario, three runs, this checkout
//   npm run ra-bench -- --against main        and the same against `main`, interleaved
//   npm run ra-bench -- --scenarios enemy-turn,idle --runs 5 --label fewer-filters
//   npm run ra-bench -- --renderers svg,three  the isometric board beside the 3D one (docs/realm-arena-3d.md)
//   npm run ra-bench -- --renderers three,outlined  the 3D board beside the 3D board with an outline round each figure
//
// Options:
//   --against <ref>    also measure <ref>'s src/ (a git worktree outside the repo),
//                      interleaving the two so drift on the machine hits both alike
//   --renderers <a,b>  which boards to draw this checkout with: svg (the isometric board, the
//                      default), three (the 3D experiment) and outlined (the 3D board with a dark
//                      outline round every figure); --against draws its ref with the first
//                      (a ref from before `outlined` existed fails to bundle it: name `three` first)
//   --scenarios <a,b>  any of load, idle, wave, pan, turn, select, enemy-turn (default: all)
//   --runs <n>         runs of each scenario per checkout (default 3); medians are reported
//   --fixture <name>   holdout (default), holdout-fog, or holdout-8k / holdout-16k (the same
//                      battle on a Sacked Fort grown to 8,464 / 16,384 tiles), from fixtures/
//   --cpu <n>          CPU slowdown (default 4, as perf:journeys uses)
//   --parts <n>        play only the enemy turn's first <n> parts
//   --label <name>     names the report (default: the time)
//   --trace            keep each scenario's first Chrome trace, for DevTools' Performance panel
//   --screenshot       save a picture of each variant's board as it opens, to see what was measured
//   --headed           a visible browser, which draws WebGL on the machine's GPU where it has one: the
//                      3D board's GPU cost is only real this way (headless, without a GPU, it's software)
//
// What it measures is the bench page, BenchApp.tsx, bundled with esbuild against
// each checkout's src/ — so the same harness measures the board before and
// after a change to how it's drawn. Reports land in bench-results/realmarena/:
// a Markdown summary (also printed) and the JSON of every run.

import { build, type Plugin } from "esbuild";
import { chromium, devices, type Browser } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { createServer, type Server } from "node:http";
import { cpus, tmpdir } from "node:os";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import type { LoadResult, ScenarioResult } from "./BenchApp";
import { percentile } from "@/utils/performance";
import { formatMetric, scenarioSummary } from "./summary";

const REPO = fileURLToPath(new URL("../..", import.meta.url));
const BENCH = join(REPO, "bench/realmarena");
const OUT = join(REPO, "bench-results/realmarena");
const SCENARIOS = ["load", "idle", "wave", "pan", "turn", "select", "enemy-turn"] as const;
type Scenario = typeof SCENARIOS[number];

const { values: options } = parseArgs({
    options: {
        against: { type: "string" },
        renderers: { type: "string", default: "svg" },
        scenarios: { type: "string" },
        runs: { type: "string", default: "3" },
        fixture: { type: "string", default: "holdout" },
        cpu: { type: "string", default: "4" },
        parts: { type: "string" },
        label: { type: "string" },
        trace: { type: "boolean", default: false },
        screenshot: { type: "boolean", default: false },
        headed: { type: "boolean", default: false },
    },
});
const runs = Number(options.runs);
const cpu = Number(options.cpu);
const scenarios = (options.scenarios?.split(",") ?? [...SCENARIOS]) as Scenario[];
for (const scenario of scenarios) if (!SCENARIOS.includes(scenario)) throw new Error(`no scenario "${scenario}": ${SCENARIOS.join(", ")}`);
const RENDERERS = ["svg", "three", "outlined"] as const;
type Renderer = typeof RENDERERS[number];
const renderers = options.renderers!.split(",") as Renderer[];
for (const renderer of renderers) if (!RENDERERS.includes(renderer)) throw new Error(`no renderer "${renderer}": ${RENDERERS.join(", ")}`);
if (!existsSync(join(BENCH, "fixtures", `${options.fixture}.json`))) throw new Error(`no fixture "${options.fixture}" in bench/realmarena/fixtures`);

// The phone every run is on: the perf journeys' Pixel 7, with motion allowed, since the motion is what's measured.
const { defaultBrowserType: _browser, ...PHONE } = devices["Pixel 7"];
// Enough of the trace to split the main thread's time and find the raster, and no more: a scenario's trace is tens of MB as it is.
const TRACE_CATEGORIES = ["toplevel", "devtools.timeline", "disabled-by-default-devtools.timeline", "v8", "blink.user_timing"];

// ---- Building the bench page against a checkout ----

interface Variant {
    name: string;
    /** Which board it draws: the bench's entry for it (entry-<renderer>.tsx). */
    renderer: Renderer;
    /** The checkout whose src/ and public/ the page is built and served from. */
    root: string;
    /** The commit it's at, and whether this checkout had uncommitted changes. */
    commit: string;
    dirty: boolean;
    /** A worktree made for the run, removed after it. */
    temporary?: boolean;
    out: string;
    url?: string;
    server?: Server;
}

const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

/**
 * `@/…` from the variant's own src/; React DOM's profiling build, so the page's
 * `<Profiler>` reports its commits; and a stylesheet's site-absolute `url(/…)`
 * left to the server, as Next leaves it.
 */
function resolving(root: string): Plugin {
    return {
        name: "bench-resolve",
        setup(builder) {
            builder.onResolve({ filter: /^@\// }, args => builder.resolve(`./${args.path.slice(2)}`, { resolveDir: join(root, "src"), kind: args.kind }));
            builder.onResolve({ filter: /^\// }, args => args.kind === "url-token" ? { path: args.path, external: true } : undefined);
            builder.onResolve({ filter: /^react-dom\/client$/ }, args => builder.resolve("react-dom/profiling", { resolveDir: args.resolveDir, kind: args.kind }));
        },
    };
}

async function bundle(variant: Variant) {
    rmSync(variant.out, { recursive: true, force: true });
    await build({
        entryPoints: { bench: join(BENCH, `entry-${variant.renderer}.tsx`) },
        outdir: variant.out,
        bundle: true,
        minify: true,
        format: "esm",
        platform: "browser",
        target: "es2022",
        jsx: "automatic",
        // A worktree outside the repo finds the packages in this one's.
        nodePaths: [join(REPO, "node_modules")],
        define: { "process.env.NODE_ENV": '"production"' },
        // Anything else the app reads from the environment reads nothing, as on a client with nothing set.
        banner: { js: "var process = globalThis.process || { env: {} };" },
        plugins: [resolving(variant.root)],
        logLevel: "error",
    });
}

const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Realm Arena bench</title>
<link rel="stylesheet" href="bench.css">
<style>
@font-face { font-family: "Bricolage Grotesque"; src: url(fonts/BricolageGrotesque-Regular.ttf); font-weight: 200 700; }
@font-face { font-family: "Bricolage Grotesque"; src: url(fonts/BricolageGrotesque-ExtraBold.ttf); font-weight: 800; }
:root { --ag-font-bricolage: "Bricolage Grotesque"; }
</style>
</head>
<body><div id="root"></div><script type="module" src="bench.js"></script></body>
</html>`;

const TYPES: Record<string, string> = {
    ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png",
    ".svg": "image/svg+xml", ".webp": "image/webp", ".ttf": "font/ttf", ".html": "text/html",
};

/** Serves the page, its bundle, the fixtures and fonts from this checkout, and the art from the variant's own public/. */
function serve(variant: Variant): Promise<void> {
    const file = (path: string): string | undefined => {
        if (path === "/" || path === "/index.html") return undefined;
        if (path === "/bench.js" || path === "/bench.css") return join(variant.out, path);
        if (path.startsWith("/fixtures/")) return join(BENCH, path);
        if (path.startsWith("/fonts/")) return join(REPO, "scripts", path);
        return join(variant.root, "public", path);
    };
    variant.server = createServer((request, response) => {
        const path = normalize(decodeURIComponent(new URL(request.url ?? "/", "http://bench").pathname));
        if (path.includes("..")) return void response.writeHead(400).end();
        const target = file(path);
        if (target === undefined) return void response.writeHead(200, { "content-type": "text/html" }).end(PAGE);
        if (!existsSync(target)) return void response.writeHead(404).end();
        response.writeHead(200, { "content-type": TYPES[extname(target)] ?? "application/octet-stream" }).end(readFileSync(target));
    });
    return new Promise(done => variant.server!.listen(0, "127.0.0.1", () => {
        const address = variant.server!.address();
        if (address && typeof address === "object") variant.url = `http://127.0.0.1:${address.port}/`;
        done();
    }));
}

function variants(): Variant[] {
    const commit = git(REPO, "rev-parse", "--short", "HEAD");
    const dirty = git(REPO, "status", "--porcelain", "--", "src", "public").length > 0;
    // Named by the renderer only where there's more than one to tell apart.
    const named = (base: string, renderer: Renderer) => renderers.length > 1 || renderer !== "svg" ? `${base} ${renderer}` : base;
    const current = renderers.map((renderer): Variant => ({
        name: named("current", renderer), renderer, root: REPO, commit, dirty, out: join(OUT, `.build/current-${renderer}`),
    }));
    if (!options.against) return current;
    const against = git(REPO, "rev-parse", "--short", `${options.against}^{commit}`);
    // Outside the repo, so nothing that sweeps it (tsc, eslint, vitest) finds a second copy of src/.
    const root = join(tmpdir(), "ra-bench-worktrees", against);
    rmSync(root, { recursive: true, force: true });
    execFileSync("git", ["worktree", "prune"], { cwd: REPO });
    execFileSync("git", ["worktree", "add", "--detach", root, against], { cwd: REPO, stdio: "ignore" });
    const renderer = renderers[0];
    return [{ name: named(options.against, renderer), renderer, root, commit: against, dirty: false, temporary: true, out: join(OUT, `.build/${against}-${renderer}`) }, ...current];
}

function removeWorktrees(list: Variant[]) {
    for (const variant of list.filter(one => one.temporary && existsSync(one.root))) {
        execFileSync("git", ["worktree", "remove", "--force", variant.root], { cwd: REPO });
    }
}

// ---- Running a scenario ----

interface Run {
    variant: string;
    scenario: Scenario;
    run: number;
    load: LoadResult;
    result?: ScenarioResult;
    trace: TraceSummary;
    heapMb: number;
    errors: string[];
}

/**
 * WebGL in software, where there's no GPU — as in a cloud container — so the 3D
 * board can draw at all: Chromium otherwise refuses it the software renderer.
 * It changes nothing for the isometric board, which uses no WebGL.
 */
const ARGS = ["--enable-unsafe-swiftshader"];

async function launch(): Promise<Browser> {
    try {
        return await chromium.launch({ args: ARGS, headless: !options.headed });
    } catch (error) {
        // This Playwright's own Chromium isn't installed: the container's (see the environment's notes) or one named.
        const executablePath = process.env.RA_BENCH_CHROMIUM ?? "/opt/pw-browsers/chromium";
        if (!existsSync(executablePath)) throw error;
        return chromium.launch({ executablePath, args: ARGS, headless: !options.headed });
    }
}

async function measure(browser: Browser, variant: Variant, scenario: Scenario, run: number): Promise<Run> {
    const context = await browser.newContext({ ...PHONE, reducedMotion: "no-preference" });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    const cdp = await context.newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu });
    const query = new URLSearchParams({ fixture: options.fixture!, ...options.parts ? { parts: options.parts } : {} });
    try {
        if (scenario === "load") await browser.startTracing(page, { categories: TRACE_CATEGORIES });
        await page.goto(`${variant.url}?${query}`);
        const load = await page.evaluate(() => window.bench!.ready);
        if (options.screenshot && run === 0) {
            // The warm-up load, settled into its opening view, and then close on the first character selected.
            const shot = (what: string) => page.locator(".ag-realmarena-frame").screenshot({ path: join(OUT, `board-${options.fixture}-${variant.name.replace(/\W+/g, "-")}-${what}.png`) });
            await page.waitForTimeout(1500);
            await shot("open");
            const selecting = page.evaluate(() => window.bench!.run("select"));
            await page.waitForTimeout(1200);
            await shot("selected");
            await selecting;
        }
        let result: ScenarioResult | undefined;
        if (scenario !== "load") {
            // Settled: the board's opening glide home, and anything the art arriving set off.
            await page.waitForTimeout(1500);
            await browser.startTracing(page, { categories: TRACE_CATEGORIES });
            result = await page.evaluate(name => window.bench!.run(name), scenario);
        }
        const raw = await browser.stopTracing();
        if (options.trace && run === 1) writeFileSync(join(OUT, `trace-${options.fixture}-${scenario}-${variant.commit}-${variant.renderer}.json`), raw);
        const { usedSize } = await cdp.send("Runtime.getHeapUsage");
        return { variant: variant.name, scenario, run, load, result, trace: summariseTrace(raw), heapMb: usedSize / 2 ** 20, errors };
    } finally {
        await context.close();
    }
}

// ---- Reading a trace ----

interface TraceEvent { name: string; ph: string; ts: number; dur?: number; pid: number; tid: number; args?: { name?: string } }

/** The main thread's busy time split by what it was doing (each event's self time, under the nearest kind it is or is inside), and the raster and image decoding off it. */
interface TraceSummary { mainMs: number; scriptMs: number; gcMs: number; styleMs: number; layoutMs: number; paintMs: number; commitMs: number; otherMs: number; rasterMs: number; decodeMs: number; gpuMs: number; frames: number; paints: number }

const KINDS: Record<string, keyof TraceSummary> = {
    FunctionCall: "scriptMs", EvaluateScript: "scriptMs", "v8.compile": "scriptMs", "v8.compileModule": "scriptMs", "v8.evaluateModule": "scriptMs",
    TimerFire: "scriptMs", FireAnimationFrame: "scriptMs", EventDispatch: "scriptMs", RunMicrotasks: "scriptMs", "v8.callFunction": "scriptMs", "v8.run": "scriptMs",
    MajorGC: "gcMs", MinorGC: "gcMs", "V8.GCScavenger": "gcMs", "V8.GCCompactor": "gcMs", "V8.GCFinalizeMC": "gcMs", "V8.GCIncrementalMarking": "gcMs",
    UpdateLayoutTree: "styleMs", RecalculateStyles: "styleMs", ParseAuthorStyleSheet: "styleMs",
    Layout: "layoutMs",
    PrePaint: "paintMs", Paint: "paintMs", Layerize: "paintMs", UpdateLayerTree: "paintMs", PaintImage: "paintMs",
    // Handing the frame to the compositor — which, for a WebGL canvas, waits on the GPU drawing it.
    Commit: "commitMs",
};

function summariseTrace(raw: Buffer): TraceSummary {
    const parsed = JSON.parse(raw.toString("utf8")) as { traceEvents?: TraceEvent[] } | TraceEvent[];
    const events = Array.isArray(parsed) ? parsed : parsed.traceEvents ?? [];
    const summary: TraceSummary = { mainMs: 0, scriptMs: 0, gcMs: 0, styleMs: 0, layoutMs: 0, paintMs: 0, commitMs: 0, otherMs: 0, rasterMs: 0, decodeMs: 0, gpuMs: 0, frames: 0, paints: 0 };
    // The renderer's main thread that did the most: the page's, rather than a spare renderer's.
    const threadsNamed = (name: string) => new Set(events.filter(event => event.ph === "M" && event.name === "thread_name" && event.args?.name === name).map(event => `${event.pid}:${event.tid}`));
    const mains = threadsNamed("CrRendererMain");
    // The GPU process's main thread: where WebGL is drawn — in software, where there's no GPU.
    const gpus = threadsNamed("CrGpuMain");
    const byThread = new Map<string, TraceEvent[]>();
    for (const event of events) {
        if (event.ph !== "X" || event.dur === undefined) continue;
        if (event.name === "RasterTask") summary.rasterMs += event.dur / 1000;
        if (event.name === "ImageDecodeTask" || event.name === "Decode Image") summary.decodeMs += event.dur / 1000;
        if (event.name === "GPUTask" && gpus.has(`${event.pid}:${event.tid}`)) summary.gpuMs += event.dur / 1000;
        const thread = `${event.pid}:${event.tid}`;
        if (!mains.has(thread)) continue;
        const list = byThread.get(thread) ?? [];
        list.push(event);
        byThread.set(thread, list);
    }
    const busiest = [...byThread.values()].sort((a, b) => total(b) - total(a))[0] ?? [];
    busiest.sort((a, b) => a.ts - b.ts || b.dur! - a.dur!);
    const stack: { end: number; kind: keyof TraceSummary; self: number }[] = [];
    const close = (until: number) => {
        while (stack.length > 0 && stack.at(-1)!.end <= until) {
            const done = stack.pop()!;
            summary[done.kind] += done.self / 1000;
        }
    };
    for (const event of busiest) {
        close(event.ts);
        const parent = stack.at(-1);
        if (parent) parent.self -= event.dur!;
        else summary.mainMs += event.dur! / 1000;
        if (event.name === "Paint") summary.paints++;
        if (event.name === "Commit") summary.frames++;
        stack.push({ end: event.ts + event.dur!, kind: KINDS[event.name] ?? parent?.kind ?? "otherMs", self: event.dur! });
    }
    close(Infinity);
    return summary;
}

const total = (events: TraceEvent[]) => events.reduce((sum, event) => sum + (event.dur ?? 0), 0);

// ---- Reporting ----

/** Nearest rank, as every other percentile in the repo is; NaN for nothing to rank. */
const median = (values: number[]): number => {
    const ranked = values.filter(Number.isFinite);
    return ranked.length === 0 ? Number.NaN : percentile(ranked.sort((a, b) => a - b), 0.5);
};

/** One run's numbers, by metric. Lower is better for every one but fps. */
function metrics({ load, result, trace, heapMb }: Run, scenario: Scenario): Record<string, number> {
    const row: Record<string, number> = {};
    if (scenario === "load") {
        Object.assign(row, {
            "board committed (ms)": load.commitMs, "first frame (ms)": load.firstFrameMs, "art decoded (ms)": load.artMs, "board drawn (ms)": load.drawnMs,
            "mount render (ms)": load.mountActualMs, "board elements": load.domNodes, "tiles": load.tiles,
        });
    }
    if (result) Object.assign(row, scenarioSummary(result));
    Object.assign(row, {
        "main thread busy (ms)": trace.mainMs, "· script": trace.scriptMs, "· gc": trace.gcMs, "· style": trace.styleMs,
        "· layout": trace.layoutMs, "· paint": trace.paintMs, "· commit (waits on the GPU for WebGL)": trace.commitMs, "· other": trace.otherMs,
        "frames committed": trace.frames, "paints": trace.paints,
        "raster, all threads (ms)": trace.rasterMs, "image decode (ms)": trace.decodeMs, "GPU process (ms)": trace.gpuMs, "JS heap (MB)": heapMb,
    });
    return row;
}

function report(all: Run[], list: Variant[], environment: Record<string, string>): string {
    const lines = [`# Realm Arena rendering bench — ${options.label ?? environment.date}`, ""];
    for (const [key, value] of Object.entries(environment)) lines.push(`- **${key}:** ${value}`);
    for (const variant of list) lines.push(`- **${variant.name}:** \`${variant.commit}\`${variant.dirty ? " with uncommitted changes" : ""}`);
    lines.push("", `Medians of ${runs} run${runs === 1 ? "" : "s"}, ± half the range the runs spanned. Lower is better, but for fps.`, "");
    for (const scenario of scenarios) {
        const rows = list.map(variant => all.filter(run => run.scenario === scenario && run.variant === variant.name).map(run => metrics(run, scenario)));
        // Every metric any variant reported, in the order they were first met: a WebGL board reports some an SVG one doesn't.
        const names = [...new Set(rows.flat().flatMap(row => Object.keys(row)))];
        const medians = rows.map(byRun => Object.fromEntries(names.map(name => [name, median(byRun.map(row => row[name]))])));
        // How far the runs strayed either side of the median: a change smaller than this is noise.
        const spreads = rows.map(byRun => Object.fromEntries(names.map(name => {
            const values = byRun.map(row => row[name]).filter(Number.isFinite);
            const middle = median(values);
            return [name, values.length > 1 && middle ? (Math.max(...values) - Math.min(...values)) / 2 / Math.abs(middle) : Number.NaN];
        })));
        lines.push(`## ${scenario}`, "");
        // Every variant after the first, against the first.
        const others = list.slice(1);
        const head = ["", ...list.map(variant => variant.name), ...others.map(variant => list.length === 2 ? "change" : `${variant.name} vs ${list[0].name}`)];
        lines.push(`| ${head.join(" | ")} |`, `|${head.map((_, index) => index === 0 ? "---" : "---:").join("|")}|`);
        for (const name of names) {
            const cells = medians.map((row, index) => {
                const spread = spreads[index][name];
                return Number.isFinite(spread) && spread >= 0.005 ? `${formatMetric(row[name])} ±${(spread * 100).toFixed(0)}%` : formatMetric(row[name]);
            });
            for (const index of others.keys()) {
                const [base, now] = [medians[0][name], medians[index + 1][name]];
                cells.push(base ? `${now >= base ? "+" : ""}${(((now - base) / base) * 100).toFixed(0)}%` : "–");
            }
            lines.push(`| ${name} | ${cells.join(" | ")} |`);
        }
        lines.push("");
    }
    const errors = [...new Set(all.flatMap(run => run.errors.map(error => `${run.variant}: ${error}`)))];
    if (errors.length > 0) lines.push("## Page errors", "", ...errors.map(error => `- ${error}`), "");
    return lines.join("\n");
}

// ---- The run ----

async function main() {
    mkdirSync(OUT, { recursive: true });
    const list = variants();
    let browser: Browser | undefined;
    // Stopped part way, it still takes its worktree away with it.
    for (const signal of ["SIGINT", "SIGTERM"] as const) {
        process.once(signal, () => {
            removeWorktrees(list);
            process.exit(130);
        });
    }
    const all: Run[] = [];
    let environment: Record<string, string>;
    try {
        for (const variant of list) {
            await bundle(variant);
            await serve(variant);
        }
        browser = await launch();
        environment = {
            date: new Date().toISOString(),
            fixture: options.fixture!,
            browser: `Chromium ${browser.version()}, ${options.headed ? "headed" : "headless"}`,
            phone: `Pixel 7 (${PHONE.viewport.width}×${PHONE.viewport.height} at ${PHONE.deviceScaleFactor}×), CPU slowed ${cpu}×`,
            machine: `${cpus().length} × ${cpus()[0]?.model ?? "unknown CPU"}, Node ${process.version}`,
        };
        // One load each, unmeasured, so neither checkout pays for a cold disk or a cold browser.
        for (const variant of list) await measure(browser, variant, "load", 0);
        for (let run = 1; run <= runs; run++) {
            for (const scenario of scenarios) {
                // Interleaved, alternating which goes first, so whatever the machine is doing hits both alike.
                const order = run % 2 ? list : [...list].reverse();
                for (const variant of order) {
                    const measured = await measure(browser, variant, scenario, run);
                    all.push(measured);
                    const wall = measured.result ? `${(measured.result.wallMs / 1000).toFixed(1)}s` : `${(measured.load.firstFrameMs / 1000).toFixed(1)}s to first frame`;
                    console.error(`run ${run}/${runs} · ${scenario} · ${variant.name}: ${wall}, main thread ${(measured.trace.mainMs / 1000).toFixed(1)}s${measured.errors.length ? ` · ${measured.errors.length} page error(s)` : ""}`);
                }
            }
        }
    } finally {
        await browser?.close();
        for (const variant of list) variant.server?.close();
        removeWorktrees(list);
    }
    const markdown = report(all, list, environment);
    const name = (options.label ?? environment.date).replace(/[^\w.-]+/g, "-");
    writeFileSync(join(OUT, `${name}.md`), markdown);
    writeFileSync(join(OUT, `${name}.json`), JSON.stringify({ environment, variants: list.map(({ name, commit, dirty }) => ({ name, commit, dirty })), runs: all }, null, 1));
    console.log(markdown);
    console.error(`Wrote bench-results/realmarena/${name}.md and .json`);
    if (all.some(run => run.errors.length > 0)) process.exitCode = 1;
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
