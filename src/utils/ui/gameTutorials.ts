// The shared shapes and registry for a game's interactive tutorial — a
// spotlight-and-card tour of the game's real board, shown once per account
// per game in place of the game guide's auto-show (see docs/game-tutorials.md
// for the full design).
//
// Same aggregation idiom as GameGuide in gameGuides.ts: a game owns its own
// steps as a `tutorial` export next to its meta.ts, and this file only
// declares the shared shape, the anchor names every game can point at for
// free, and the pure step-filtering `useTutorialRun` is built on top of.
// Adding a new game's tour means one import + one line in GAME_TUTORIALS,
// not editing a shared object literal.

import { tutorial as diceCitiesTutorial } from "@/games/DiceCities/tutorial";
import { tutorial as raceCarsTutorial } from "@/games/RaceCars/tutorial";
import { tutorial as settlementsAndCitiesTutorial } from "@/games/SettlementsAndCities/tutorial";

/**
 * A single step of a tour: a spotlight on `anchor` plus one message, or —
 * with no anchor at all — a centred card with no spotlight, for the opening
 * welcome and the closing "that's it" step.
 */
export interface TutorialStep<S extends string = string> {
    /** Where the spotlight lands: a `TOUR_ANCHORS` name, or a game's own
     *  `data-tour` value (see `anchorSelector`). Omitted for a centred card. */
    anchor?: string;
    title: string;
    body: string;
    /** Include this step only while the signal holds. Evaluated once, when
     *  the run starts — the step list for a run is fixed at that moment, so
     *  a live signal change can't renumber the steps under the player. */
    when?: S;
    /** The step advances itself the moment this signal flips true, and is
     *  dropped outright if the signal is already true when the run starts —
     *  "tap Roll the dice" is the wrong thing to show a player who already
     *  rolled. */
    advanceOn?: S;
    /** Same job as `advanceOn`, for a do-it step whose "did it happen" is a
     *  game element appearing on screen — a card's own detail popup, say —
     *  rather than app state the board page already tracks. Names an anchor;
     *  the step advances the instant it's found in the DOM, waiting
     *  indefinitely like `advanceOn` does. Not tied to `S`, since it never
     *  reads `signals`. */
    advanceOnVisible?: string;
    /** An anchor to click when the player leaves this step (`Next`/`Back`),
     *  so a popup the step opened doesn't outlive it. */
    closeAnchor?: string;
    /** Rings and reads above a same-page Bootstrap modal instead of under it
     *  — the one deliberate exception to the rule the tour normally sits
     *  under one (`.ag-tour-spot`/`.ag-tour-card` in ag-theme.css), for a
     *  step whose anchor is inside a modal the player just opened. */
    aboveModal?: boolean;
    /** Shown in place of "Next ›" while a do-it step (one with `advanceOn`
     *  or `advanceOnVisible`) is waiting on the player to act. */
    hint?: string;
}

/** A game's whole tour: an ordered list of steps, keyed to its own signal
 *  type `S` so a step naming a signal the board page doesn't supply is a
 *  build error rather than a step that silently never fires. */
export interface GameTutorial<S extends string = string> {
    steps: TutorialStep<S>[];
}

// Keyed by the same url slug as GAME_META / GAME_GUIDES. A game adds a
// tutorial.ts and registers it here — /api/gameguides validates a "seen"
// write against this allowlist by kind, the same way GAME_GUIDES already
// guards the "seen guide" list.
export const GAME_TUTORIALS: Record<string, GameTutorial> = {
    dicecities: diceCitiesTutorial,
    racecars: raceCarsTutorial,
    settlementsandcities: settlementsAndCitiesTutorial,
};

/** Whether this game has a tour at all. */
export function hasTutorial(gameUrl: string): boolean {
    return gameUrl in GAME_TUTORIALS;
}

// Shared chrome a step can point at for free: each of these is a class the
// design system already puts on the element, so every game gets it with no
// new prop and no new attribute. A game's own bits — the market, the
// landmark track — are not shared concepts and are not here: they get
// `data-tour="<initials>-<name>"` on markup that already exists instead, and
// `anchorSelector` falls back to that. Only an anchor a shipped step actually
// uses belongs in this table (docs/game-tutorials.md §4) — one nobody points
// at is a line the test below would have to keep honest forever — so it
// grows one line at a time, alongside the step that first needs it.
export const TOUR_ANCHORS = {
    scoreboard: '.ag-scorestrip',
    board: '.ag-board-area',
    menu: '.ag-gom',
} as const;

export type TourAnchor = keyof typeof TOUR_ANCHORS;

/** A step's anchor as a selector: a shared name, or a game's own data-tour. */
export function anchorSelector(anchor: string): string {
    return TOUR_ANCHORS[anchor as TourAnchor] ?? `[data-tour="${anchor}"]`;
}

/**
 * What a board page hands `GameShell`'s `tutorial` prop: a type-erased pair,
 * so the shell stays exactly as generic as it is today while the page's own
 * call to `tutorialRun` still gets checked against its game's own signal
 * type.
 */
export interface TutorialRun {
    tutorial: GameTutorial<string>;
    signals: Record<string, boolean>;
    /** False on a finished, abandoned or turn-by-turn-reviewed board — the
     *  tour doesn't auto-run at all there. */
    active: boolean;
}

export function tutorialRun<S extends string>(
    tutorial: GameTutorial<S>,
    signals: Record<S, boolean>,
    opts: { active: boolean },
): TutorialRun {
    return { tutorial, signals, active: opts.active };
}

/**
 * The steps a run actually shows, in order. `when` filters the list once —
 * it is not re-checked as signals change later — and a step whose
 * `advanceOn` signal is already true is dropped outright rather than shown
 * and immediately auto-advanced past.
 */
export function applicableSteps<S extends string>(
    tutorial: GameTutorial<S>,
    signals: Record<S, boolean>,
): TutorialStep<S>[] {
    return tutorial.steps.filter((step) => {
        if (step.when && !signals[step.when]) return false;
        if (step.advanceOn && signals[step.advanceOn]) return false;
        return true;
    });
}
