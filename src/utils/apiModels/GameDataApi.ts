import type { IGameType } from "./gameCommand";
import type { IHistoryEntry } from "@/utils/games/history";
import type { IInvitationResponse } from "@/utils/mongodb/InvitationData";
import type { IReactionSummary } from "@/utils/reactions";

export type uuidString = `${string}-${string}-${string}-${string}-${string}`;

// Why a complete game has no winner (or does), beyond the bare `winner`
// string: a win is unambiguous, but "" is shared by a manual surrender
// (`POST /api/game/end`) and a game the turntimer cron abandoned because a
// player stopped taking their turns. Optional so older records (written
// before this field existed) fall back to inferring from `winner`.
//
// 'teamwin' and 'teamloss' are the co-op pair: the whole table wins or the
// whole table loses, which a single `winner` id cannot say. A co-op result
// records an empty `winner` plus one of these two, so nothing downstream has
// to guess — read together, `winner` and `endReason` answer "how did this end?"
// for every player at once (see finishGame and outcomeFor).
export type GameEndReason = 'win' | 'ended' | 'abandoned' | 'teamwin' | 'teamloss';

// One line of match history as sent to a client: the game-agnostic entry plus
// the reactions (if any) dropped on the action it records — one per player who
// reacted — attached by withHistoryReactions, the same { gameId, commandId }
// join the recap route makes by { gameId, eventId } (IRecapEventResponse). A
// reaction is public information about a public history line, so it's sent to
// every player, not scoped to a viewer the way a hand or a hidden card would be.
export interface IHistoryEntryResponse extends IHistoryEntry {
    // Optional only so publicGameState's pre-attachment output (which doesn't
    // know about reactions at all) still type-checks as this shape — every
    // route that actually sends IGameDataResponse to a client fills it in via
    // attachHistoryReactions/attachHistoryReactionsToEach before responding.
    reactions?: IReactionSummary[];
}


export interface IGameResponse {
    gameId: uuidString,
    gameType: string,
    friendlyName: string,
    usernameList: string[],
    // Parallel to usernameList (same order): the stable Clerk userId for each
    // player. usernameList is for display; userIdList is what the client
    // compares identity and keys per-player state by, so a rename can't shift
    // a key or misalign a lookup.
    userIdList: string[],
    turnTimer: string,
    currentTurn: string,
    currentTurnUsername: string,
    lastTurnTimestamp: string,
    url: string,
    complete: boolean,
    winner: string,
    endReason?: GameEndReason,
    forfeitedBy?: string,
    // How many chat messages this viewer hasn't read in this game yet. Only
    // ever present on a dashboard response — buildDashboard maps it on after
    // CreateResponse, because the schema method knows nothing about chat and
    // no board screen's own game response carries it (docs/in-game-chat.md
    // §13.5). Absent (not zero) anywhere else.
    unreadChatCount?: number,
}

// One line (or a few) of formatted, human-readable GameResult stats. Groups
// with a `username` are per-player (e.g. "coins earned"); groups without one
// are game-wide (e.g. "solved in 5 guesses"). Shared shape so any game's
// GameResult stats can be rendered by the same UI (popup + full result page).
export interface GameResultStatGroup {
    username?: string;
    lines: string[];
}

// One line on a GameResultChart whose lines aren't the players: the key each
// turn's Record is keyed by, the name to label it with, and the colour to draw
// it in. Outbreak's cube supplies are the first of these — four lines that
// belong to the board rather than to anybody at the table.
export interface GameResultChartSeries {
    key: string;
    name: string;
    color: string;
}

// One in-game moment worth calling out on a GameResultChart — Outbreak's
// epidemic draws, Dice Cities' landmark buys, Fires Out's explosions.
// `turnIndex` is 0-based in the same per-turn indexing computePerTurnStat's
// perTurn arrays use (see computePerTurnEvents in replay.ts), so
// mapEventsToRounds can place it on the same round axis as a per-turn series
// computed from the same replay pass. `seriesKey` pins the marker to one
// chart line (a buyer's own userId on a per-player chart); absent for an
// event that isn't any one line's story (Outbreak's epidemic touches the
// whole board, not one disease colour), which the renderer places above the
// plot instead. A plain emoji, not an image — the same convention
// IGameEvent.glyph (utils/games/recap.ts) already uses.
export interface GameResultEvent {
    turnIndex: number;
    glyph: string;
    title?: string;
    seriesKey?: string;
}

// A GameResultEvent once mapEventsToRounds has placed it on a chart's round
// axis.
export interface GameResultChartEvent {
    round: number;
    glyph: string;
    title?: string;
    seriesKey?: string;
}

// The Mongoose sub-schema for a stored GameResultEvent — shared so every
// game's *GameResultStatsSchemaDef writes the same field list instead of
// three copies drifting apart the first time one of them gains a field.
export const gameResultEventSchemaDef = { turnIndex: Number, glyph: String, title: String, seriesKey: String };

// A round-by-round line chart for the GameResult page: round number on the
// x-axis, one line per series (typically per player). What's plotted varies
// by game (coins, score, territory...), so this shape only fixes the
// structure - one entry per round, keyed by the player's stable userId - letting
// any game's GameResult stats power the same chart component. The chart renderer
// pairs each userId with a display name and colour through the players list.
export interface GameResultChart {
    title: string;
    yLabel: string;
    rounds: Record<string, number>[];
    // Absent on a per-player chart, which is most of them: the renderer draws
    // one line per player from the result's own roster. Present when the lines
    // are something else entirely (Outbreak's four cube supplies), naming each
    // one instead — same component, same shape, no second chart to maintain.
    series?: GameResultChartSeries[];
    // Markers for in-game moments worth calling out on this chart — see
    // mapEventsToRounds. Absent on a chart with nothing to mark.
    events?: GameResultChartEvent[];
}

// Collapses a per-turn series (one entry per real turn - see countTurns() in
// turnCount.ts and computePerTurnStat() in replay.ts) down to one entry per
// round, where a round is every player having taken one turn. A multiplayer
// game's per-turn chart would otherwise plot N points before anyone's second
// action - a lot of visual noise for what a player thinks of as "everyone's
// gone once" - so the chart groups by round while the "N turns" summary line
// elsewhere on the result page keeps counting turns precisely.
//
// Keeps the entry at the end of every complete round (every playerCount-th
// turn) plus the final entry, so a round the game ended partway through still
// shows its own most recent state rather than being dropped for being
// incomplete.
export function collapseToRounds<T>(perTurn: readonly T[], playerCount: number): T[] {
    const rounds = perTurn.filter((_, i) => (i + 1) % playerCount === 0);
    if (perTurn.length % playerCount !== 0) {
        rounds.push(perTurn[perTurn.length - 1]);
    }
    return rounds;
}

// Turns a per-turn Map<userId, number> series (as produced by a replay-based
// computeXPerTurn helper) into a round-by-round GameResultChart, keying each
// round's entries by userId. A shared display name can't collapse two players
// onto one line, and a rename can't shift a key. Shared by every game that
// plots a cumulative per-player stat (coins, resources, ...) so only the
// series/labels differ per game.
//
// `series` names the lines for a chart that isn't per player — the same
// per-turn Map, keyed by something the game names itself (see
// GameResultChartSeries) — so a non-player chart reuses this rather than
// growing its own formatter.
//
// `events` are this chart's turn-indexed GameResultEvents (computed by
// computePerTurnEvents alongside `perTurn`, from the same replay pass) —
// mapped onto the round axis this call is already building, so an event and
// the point it marks always agree on which round they're in.
export function formatPerTurnChart(
    perTurn: Map<string, number>[] | undefined,
    title: string,
    yLabel: string,
    playerCount: number,
    series?: GameResultChartSeries[],
    events?: GameResultEvent[],
): GameResultChart | undefined {
    // Undefined as well as empty: a series added to a game's stats after some
    // results were already recorded reads back missing on those records, and a
    // chart of nothing is worse than no chart. Tolerated here so no game has
    // to remember a `?? []` of its own.
    if (!perTurn?.length) return undefined;
    const rounds = collapseToRounds(perTurn, playerCount).map(turn => {
        const entry: Record<string, number> = {};
        for (const [key, value] of turn) {
            entry[key] = value;
        }
        return entry;
    });
    return {
        title,
        yLabel,
        rounds,
        ...(series ? { series } : {}),
        ...(events?.length ? { events: mapEventsToRounds(events, playerCount, rounds.length) } : {}),
    };
}

// Locates each GameResultEvent on the round axis a chart's `rounds` uses, via
// the identical collapseToRounds grouping applied to the per-turn series next
// to it, so an event and the point it marks always agree on which round
// they're in.
export function mapEventsToRounds(
    events: GameResultEvent[],
    playerCount: number,
    roundCount: number,
): GameResultChartEvent[] {
    return events.map(({ turnIndex, glyph, title, seriesKey }) => ({
        round: Math.min(Math.floor(turnIndex / playerCount), roundCount - 1),
        glyph,
        ...(title ? { title } : {}),
        ...(seriesKey ? { seriesKey } : {}),
    }));
}

// Compacts one or more formatPerTurnChart() results (each undefined when its
// underlying per-turn series was empty) into the GameResultChart[] a game's
// GAME_RESULT_STATS.charts entry returns. Shared so every game's chart
// formatter filters the same way instead of reinventing it per game.
export function compactCharts(...charts: (GameResultChart | undefined)[]): GameResultChart[] {
    return charts.filter((c): c is GameResultChart => !!c);
}

// Look a player up in a response-shaped game state by their Clerk userId —
// what commands and replay carry, and what playerStates is keyed by. Scans
// the values rather than indexing, so it stays right for any game whose
// apiModels key that record some other way. Shared by every game.
export function playerByUserId<P extends { userId: string }>(
    state: { playerStates?: Record<string, P> } | undefined,
    userId: string
): P | undefined {
    if (!state?.playerStates) return undefined;
    return Object.values(state.playerStates).find(p => p.userId === userId);
}

export interface IGameDataResponse {
    gameType: IGameType,
    usernameList: string[],
    // Parallel to usernameList (same order): the stable Clerk userId for each
    // player. See IGameResponse.userIdList — the client keys per-player board
    // state by these ids rather than by the display name.
    userIdList: string[],
    turnTimer: string,
    currentTurn: string,
    gameState: {
        turnOrder: string[],
        // Newest first, with every {{userId}} token already resolved to a name
        // — ready to render. `actorId` says whose line it is.
        history: IHistoryEntryResponse[]
    },
    complete: boolean,
    winner: string,
    endReason?: GameEndReason,
    // Which shape of that ending it was — see IGameData.endDetail.
    endDetail?: string,
    forfeitedBy?: string
}

// A game in a player's history. Built from a GameResult rather than a live
// game, so it carries the outcome and nothing about how it was played.
export interface ICompletedGame {
    gameId: string;
    url: string;
    friendlyName: string;
    winner: string;
    // The winner's stable Clerk userId (absent for a no-winner finish), so the
    // dashboard can tell whether *you* won by id rather than by comparing your
    // display name — which a namesake would answer wrongly.
    winnerId?: string;
    endReason?: GameEndReason;
    // Which shape of that ending it was — see IGameData.endDetail.
    endDetail?: string;
    forfeitedBy?: string;
    endedAt: string;
}

// The whole home screen in one response — see `buildDashboard` for why its five
// lists are served together rather than fetched one per component.
export interface IDashboardResponse {
    myTurn: IGameResponse[];
    theirTurn: IGameResponse[];
    incoming: IInvitationResponse[];
    outgoing: IInvitationResponse[];
    completed: ICompletedGame[];
}
