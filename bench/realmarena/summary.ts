// What a scenario's run comes to, in the numbers the rendering bench reports:
// its frames, long tasks, React commits, what a WebGL board handed the GPU and
// how the enemy turn's parts kept time. Shared by the runner's report (run.ts),
// which adds the browser's trace to it, and the admin renderer lab
// (`RealmArenaRendererLab`), which shows it on whatever phone it runs on. Lower
// is better for every number but fps.

import { percentile } from "@/utils/performance";
import type { ScenarioResult } from "./harness";

const sum = (values: readonly number[]) => values.reduce((a, b) => a + b, 0);

export function scenarioSummary(result: ScenarioResult): Record<string, number> {
    const gaps = [...result.frameGaps].sort((a, b) => a - b);
    const tasks = result.longTasks.map(task => task.duration);
    const row: Record<string, number> = { "wall (ms)": result.wallMs };
    if (gaps.length > 0) {
        Object.assign(row, {
            "fps": gaps.length / (sum(gaps) / 1000),
            "frame gap p95 (ms)": percentile(gaps, 0.95),
            "frame gap max (ms)": gaps[gaps.length - 1],
            "frames over 50ms": gaps.filter(gap => gap > 50).length,
        });
    }
    Object.assign(row, {
        "long tasks": tasks.length,
        "blocking (ms)": sum(tasks.map(duration => Math.max(0, duration - 50))),
        "longest task (ms)": tasks.length ? Math.max(...tasks) : 0,
        "react commits": result.commits.length,
        "react render (ms)": sum(result.commits.map(commit => commit.actualMs)),
        "board elements": result.domNodes,
    });
    if (result.gl) {
        const frames = Math.max(1, result.gl.frames);
        Object.assign(row, {
            "WebGL frames drawn": result.gl.frames,
            "draw calls per frame": result.gl.calls / frames,
            "triangles per frame": result.gl.triangles / frames,
        });
    }
    if (result.parts.length > 0) {
        Object.assign(row, {
            "parts played": result.parts.length,
            "part overrun mean (ms)": sum(result.parts.map(part => part.wallMs - part.cueMs)) / result.parts.length,
            "parts timed out": result.parts.filter(part => part.timedOut).length,
        });
    }
    return row;
}
