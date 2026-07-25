import { IGameData } from "../mongodb/GameData";
import { IGameCommand, ICommandOutcome } from "../apiModels/GameLogic";
import { buildTimeline, ITimeline, ITurnSnapshot, IReplayStep } from "./replay";
import { snakesAndLaddersRecapAdapter } from "@/games/SnakesAndLadders/recap";
import { diceCitiesRecapAdapter } from "@/games/DiceCities/recap";
import { settlementsAndCitiesRecapAdapter } from "@/games/SettlementsAndCities/recap";
import { worldDominationRecapAdapter } from "@/games/WorldDomination/recap";

// A single "here's what happened" entry in a since-you-were-last-here recap.
// Games synthesise these from replayed turns via an IRecapAdapter; the generic
// engine slices them to the viewer's window and the API attaches presentation
// (the actor's player colour) before sending them to the client.
export interface IGameEvent {
    id: string;
    timestamp: string; // ISO — from the command that produced it
    commandId: string; // links back to the command in commandHistory
    actorId: string; // who did it (Clerk userId); also picks the dot colour
    actorUsername: string;
    // Game-defined semantic key (e.g. "sl_ladder"). Not shown to the user, but
    // lets the summary reason about what happened.
    type: string;
    glyph?: string; // "🪜", "🐍"
    title: string; // "Priya rolled 3, climbed a ladder"
    detail?: string; // "51 → 55 → up to 68"
    affectedIds?: string[]; // players this event touched — drives "…from you"
}

export interface IRecapSummary {
    headline: string; // "Your roll again 👋"
    subline: string; // "3 rolls happened while you were away — one big climb…"
}

export interface IRecapTip {
    glyph: string;
    text: string;
}

// Per-game recap logic, registered by gameType.className (mirrors IReplayAdapter).
// Games that don't register one (e.g. Smartthink) simply have no recap.
export interface IRecapAdapter {
    className: string;

    // Turn one replayed turn — the diff between two consecutive snapshots plus
    // the command/outcome that produced it — into zero or more display events.
    toEvents(
        prev: ITurnSnapshot,
        next: ITurnSnapshot,
        command: IGameCommand,
        outcome: ICommandOutcome
    ): IGameEvent[];

    // The headline + subline at the top of the recap, from the viewer's POV.
    summarize(events: IGameEvent[], forUserId: string): IRecapSummary;

    // Optional strategic tip (the green box). Receives the live, response-shaped
    // specificGameState. Return null to omit the box.
    tip?(liveState: unknown, forUserId: string): IRecapTip | null;

    // Optional pass over the full, unwindowed event list after every command has
    // been replayed. Lets a game fold two adjacent events from a single logical
    // action (e.g. a conquest immediately followed by its occupation) into one
    // display row — toEvents only sees one command at a time, so cross-command
    // merges belong here instead.
    postProcess?(events: IGameEvent[]): IGameEvent[];
}

const adapters: Record<string, IRecapAdapter> = {};
export function registerRecapAdapter(adapter: IRecapAdapter) {
    adapters[adapter.className] = adapter;
}
export function getRecapAdapter(className: string): IRecapAdapter | undefined {
    return adapters[className];
}
export function hasRecapAdapter(className: string): boolean {
    return className in adapters;
}

export interface IEventFeed {
    hasRecap: boolean;
    events: IGameEvent[];
    summary: IRecapSummary | null;
    tip: IRecapTip | null;
}

// Replays a game's real command history through its recap adapter, turning
// every turn into display events. Shared by buildEventFeed (which additionally
// windows the result to the viewer's "since last here" recap) and
// buildAllEvents (which returns everything, for looking up one past event
// regardless of whose turn it currently is).
async function replayEvents(
    gameData: IGameData,
    userIdNameMap: { [key: string]: string },
    adapter: IRecapAdapter
): Promise<{ events: IGameEvent[]; timeline: ITimeline }> {
    const steps: IReplayStep[] = [];
    const timeline = await buildTimeline(gameData, userIdNameMap, [], (step) => {
        if (!step.planned) {
            steps.push(step);
        }
    });

    const events: IGameEvent[] = [];
    for (const step of steps) {
        events.push(...adapter.toEvents(step.prev, step.next, step.command, step.outcome));
    }
    return { events: adapter.postProcess ? adapter.postProcess(events) : events, timeline };
}

// Builds a viewer's "since you were last here" feed by replaying the game and
// keeping only the events that happened after the viewer's own last turn. Returns
// hasRecap === false (and empty payload) when the game has no recap adapter, when
// it isn't the viewer's turn, or when nothing happened while they were away.
export async function buildEventFeed(
    gameData: IGameData,
    userIdNameMap: { [key: string]: string },
    forUserId: string
): Promise<IEventFeed> {
    const empty: IEventFeed = { hasRecap: false, events: [], summary: null, tip: null };

    const adapter = getRecapAdapter(gameData.gameType.className);
    if (!adapter) {
        return empty;
    }

    // The recap is the "you're back, and it's your move" screen, so it only
    // applies when it's actually the viewer's live turn.
    if (gameData.complete || gameData.currentTurn !== forUserId) {
        return empty;
    }

    let allEvents: IGameEvent[];
    let timeline: ITimeline;
    try {
        ({ events: allEvents, timeline } = await replayEvents(gameData, userIdNameMap, adapter));
    } catch {
        // Some games can't be replayed for every historical game (e.g. Settlements
        // & Cities games created before recap support lack the stored initial-state
        // snapshot and throw). Treat an un-replayable game as simply having no
        // recap rather than surfacing an error — the same graceful no-op the
        // client already handles for adapter-less games.
        return empty;
    }

    // The window is everything after the viewer's own last event. If they've
    // never moved (first turn), that's the whole game so far.
    let lastOwn = -1;
    allEvents.forEach((event, i) => {
        if (event.actorId === forUserId) {
            lastOwn = i;
        }
    });
    const events = allEvents.slice(lastOwn + 1);

    if (events.length === 0) {
        return empty;
    }

    const liveState = timeline.snapshots[timeline.currentIndex]?.specificGameState;
    return {
        hasRecap: true,
        events,
        summary: adapter.summarize(events, forUserId),
        tip: adapter.tip ? adapter.tip(liveState, forUserId) : null,
    };
}

// Replays a game's full history into every real-turn display event, with no
// windowing to a particular viewer or turn. Unlike buildEventFeed this works
// for completed games and for turns that are no longer the "current" one —
// used to look up a specific past event's title (e.g. what a reaction landed
// on), which can be well behind the game's live state by the time it's read
// back. Returns an empty list rather than throwing when the game has no
// adapter or can't be replayed (e.g. older Settlements & Cities games).
export async function buildAllEvents(
    gameData: IGameData,
    userIdNameMap: { [key: string]: string }
): Promise<IGameEvent[]> {
    const adapter = getRecapAdapter(gameData.gameType.className);
    if (!adapter) {
        return [];
    }
    try {
        const { events } = await replayEvents(gameData, userIdNameMap, adapter);
        return events;
    } catch {
        return [];
    }
}

// Registration of each game's recap adapter, mirroring how replay.ts registers
// its replay adapters (the engine imports each game's adapter and registers it,
// so games depend only on engine *types* — no import cycle). A game opts into
// recap by adding a recap.ts and one line here; games without one (Smartthink)
// intentionally have no recap. Guarded by src/games/gameRegistry.test.ts.
registerRecapAdapter(snakesAndLaddersRecapAdapter);
registerRecapAdapter(diceCitiesRecapAdapter);
registerRecapAdapter(settlementsAndCitiesRecapAdapter);
registerRecapAdapter(worldDominationRecapAdapter);
