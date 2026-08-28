// Shared, isomorphic text for the two screens that narrate an Outbreak infect
// phase: the end-of-turn screen the acting player sees (OutbreakEndTurnScreen)
// and the "since your last turn" away recap (recap.ts). Both describe the same
// events, so the phrasing — which cities an outbreak overflowed onto, and how a
// cascade spread from one city to the next — lives here rather than being
// written twice and drifting apart. Pure presentation: names only, no rules.
import { CITIES } from "@/games/Outbreak/board";
import type { IOutbreakOutbreakStep } from "@/games/Outbreak/rules";

/** "Chicago", "Chicago and Tokyo", "Chicago, Tokyo and Paris". */
export function cityList(cityIds: number[]): string {
    const names = cityIds.map(id => CITIES[id].name);
    if (names.length <= 1) return names.join("");
    if (names.length === 2) return `${names[0]} and ${names[1]}`;
    return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * The spine of every cascade description: each city that overflowed followed by
 * the neighbours it pushed a cube onto, in order —
 * "Lagos → Kinshasa, Khartoum; Kinshasa → Johannesburg". Callers wrap it with
 * their own framing (the recap and the end-of-turn screen word the lead-in
 * differently), but the burst-by-burst walk itself is written once, here.
 */
export function outbreakCascadeSteps(chain: IOutbreakOutbreakStep[]): string {
    return chain
        .map(step =>
            step.infected.length > 0
                ? `${CITIES[step.city].name} → ${cityList(step.infected)}`
                : `${CITIES[step.city].name} spreads no further`,
        )
        .join("; ");
}

/**
 * A standalone sentence describing where an outbreak (and any chain reaction it
 * set off) put cubes, framed to sit under a title that already names the origin
 * city ("Outbreak in Lagos!"). A single burst reads "Spreads to …"; a cascade
 * walks the chain city by city so a reader sees each one infecting its
 * neighbours in turn.
 */
export function describeOutbreakChain(chain: IOutbreakOutbreakStep[] | undefined): string {
    if (!chain || chain.length === 0) return "";

    if (chain.length === 1) {
        const [only] = chain;
        return only.infected.length > 0
            ? `Spreads to ${cityList(only.infected)}.`
            : "Contained before it could spread.";
    }

    return `A chain reaction — ${outbreakCascadeSteps(chain)}.`;
}
