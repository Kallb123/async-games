import type { IGameType } from "./gameCommand";
import type { IHistoryEntry } from "@/utils/games/history";
import type { IInvitationResponse } from "@/utils/mongodb/InvitationData";

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

// The one player-facing clause that says *which* ending it was, when the
// reason above has more than one shape. A co-op game is the case that needs
// it: 'teamloss' covers every way Outbreak's table can go under — a colour's
// cube supply exhausted, the outbreak marker maxed out, the player deck run
// dry — and "the team lost" alone leaves everyone asking which. Written as a
// lowercase clause so it can follow a dash ("The team lost — the player deck
// ran out of cards") or stand as its own sentence.
//
// Set by the game's own logic as it ends the game (Outbreak's endInTeamLoss);
// absent for every ending that only happens one way, and for every game that
// never writes one.
export type GameEndDetail = string;

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

// A turn-by-turn line chart for the GameResult page: turn number on the
// x-axis, one line per series (typically per player). What's plotted varies
// by game (coins, score, territory...), so this shape only fixes the
// structure - one entry per turn, keyed by the player's stable userId - letting
// any game's GameResult stats power the same chart component. The chart renderer
// pairs each userId with a display name and colour through the players list.
export interface GameResultChart {
    title: string;
    yLabel: string;
    turns: Record<string, number>[];
    // Absent on a per-player chart, which is most of them: the renderer draws
    // one line per player from the result's own roster. Present when the lines
    // are something else entirely (Outbreak's four cube supplies), naming each
    // one instead — same component, same shape, no second chart to maintain.
    series?: GameResultChartSeries[];
}

// Turns a per-turn Map<userId, number> series (as produced by a replay-based
// computeXPerTurn helper) into a GameResultChart, keying each turn's entries by
// userId. A shared display name can't collapse two players onto one line, and a
// rename can't shift a key. Shared by every game that plots a cumulative
// per-player stat (coins, resources, ...) so only the series/labels differ per
// game.
//
// `series` names the lines for a chart that isn't per player — the same
// per-turn Map, keyed by something the game names itself (see
// GameResultChartSeries) — so a non-player chart reuses this rather than
// growing its own formatter.
export function formatPerTurnChart(
    perTurn: Map<string, number>[],
    title: string,
    yLabel: string,
    series?: GameResultChartSeries[],
): GameResultChart | undefined {
    if (perTurn.length === 0) return undefined;
    return {
        title,
        yLabel,
        turns: perTurn.map(turn => {
            const entry: Record<string, number> = {};
            for (const [key, value] of turn) {
                entry[key] = value;
            }
            return entry;
        }),
        ...(series ? { series } : {}),
    };
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
        history: IHistoryEntry[]
    },
    complete: boolean,
    winner: string,
    endReason?: GameEndReason,
    endDetail?: GameEndDetail,
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
