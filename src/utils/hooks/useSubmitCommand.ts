import { useCallback, useRef, useState } from "react";
import type { IGameCommand } from "@/utils/apiModels/GameLogic";
import type { ICommandResponse } from "@/app/api/game/command/route";
import type { IGameDataResponse, uuidString } from "@/utils/apiModels/GameDataApi";
import { gameCommandVersion, gameHasOutOfTurnPlays } from "@/utils/ui/games";
import { isGuest, type NamedUser } from "@/utils/ui/players";
import { recordGuestMoved } from "@/utils/hooks/useGuestMoved";
import { isDataUnconfirmed } from "@/utils/hooks/dataCache";
import { gameDataUrl } from "@/utils/hooks/prefetchGameData";
import { untilSessionRenewed } from "@/utils/hooks/fetchWithSessionRetry";

// A command is a write, so it gets longer than a read before being given up
// on — but it still gets one. See the `signal` below.
const COMMAND_TIMEOUT_MS = 30000;

interface SubmittingUser extends NamedUser {
    id: string;
}

/**
 * The shape every game screen passes down to its actions/board components.
 * `target` names the control or board spot the command came from so exactly
 * that thing can wear the pending skin while the command is in flight.
 */
export type SubmitCommand = (
    command: IGameCommand,
    callback?: (r: ICommandResponse) => void,
    target?: string,
) => Promise<void>;

/**
 * The `expectedCommandCount` a command sent from this board carries: the
 * board's `commandCount` in a game with out-of-turn plays, and — in any game —
 * while the board is `unconfirmed`, a cached paint that no request has answered
 * yet (`useRefreshableData`'s `cacheFor`). Nothing otherwise, or before the
 * board has loaded. See `useSubmitCommand`.
 */
export function expectedCommandCountFor(board: IGameDataResponse | null, unconfirmed = false): number | undefined {
    return board && (unconfirmed || gameHasOutOfTurnPlays(board.gameType)) ? board.gameState.commandCount : undefined;
}

/**
 * The `version` a command sent from this board carries: the version of its
 * game's rules this bundle was built with (docs/command-versions.md), which the
 * route refuses unless it is the server's current one. Undefined before the
 * board has loaded, when there is no game to name and nothing is sent.
 */
export function commandVersionFor(board: IGameDataResponse | null): number | undefined {
    return board ? gameCommandVersion(board.gameType) : undefined;
}

/**
 * Where a tab records the rules it has already reloaded to escape, as
 * `<game url>@<version>` — `sessionStorage`, like `reloadForStaleSession`'s
 * marker, because it is a fact about this tab's page and nothing else.
 */
const RULES_RELOAD_MARKER_KEY = 'ag-rules-reload';

/**
 * Reloads the page onto the current release after the route refused a command
 * built for `sent` (docs/command-versions.md) — and reports whether it did.
 *
 * Once per version: a reload that comes back on the same bundle (a cached page,
 * a deploy still reaching every instance) sends the same `sent`, finds the
 * marker, and answers false, leaving the caller to resync rather than reload on
 * every tap. The release it reloads onto sends a newer version, which the
 * marker doesn't name. No storage to remember the attempt with means no reload,
 * for the same reason.
 */
function reloadForNewRules(sent: string): boolean {
    try {
        if (window.sessionStorage.getItem(RULES_RELOAD_MARKER_KEY) === sent) {
            return false;
        }
        window.sessionStorage.setItem(RULES_RELOAD_MARKER_KEY, sent);
    } catch {
        return false;
    }
    window.location.reload();
    return true;
}

/**
 * Submits a game command to /api/game/command, shared by every game screen.
 * Guards against a double-tap or slow-network double-submit firing two
 * commands for the same turn before the first response lands — without this,
 * two in-flight requests can each read the same pre-move game state and race
 * to save, desyncing turn bookkeeping from what actually got applied (see
 * optimisticConcurrency in GameData.ts, which turns the losing save into a
 * 409 instead of a silent overwrite). While a command is in flight, further
 * submitCommand calls are ignored. On any rejected/failed command, resyncs
 * with the server via getGameData() instead of invoking the callback with
 * stale or placeholder data.
 *
 * `pendingTarget` is the `target` of the in-flight command (null when idle),
 * which is how ActionButton and the boards know which single control or spot
 * to show as processing rather than lighting up the whole screen.
 *
 * `board` is the game as the player is looking at it — `useGameData`'s
 * `gameData`. In a game where a teammate may play out of turn
 * (`GameMeta.hasOutOfTurnPlays`), the board can move under the active player
 * between rendering a move and sending it, and a move built against the old
 * board may still be legal on the new one while meaning something they never
 * chose — "Drive to Lagos" from the city a teammate just airlifted them out
 * of. So every command from such a board carries the `commandCount` it was
 * rendered from as `expectedCommandCount`, and the route refuses it with a 409
 * if the game has moved on since (docs/out-of-turn-actions.md §5.7) — which
 * the resync below turns into the new board. In every other game nothing moves
 * on your own turn but you, so nothing is sent — except while the board is a
 * cached paint no request has answered yet (`useGameData` paints a recently
 * fetched board straight away and revalidates beneath it, see `dataCache.ts`):
 * then it is sent in every game, so a move built on a board that has since
 * moved on (a turn timer ran out, a seat was dropped) is refused the same way
 * rather than trusted. The route's check is the same for every game; only
 * whether the client asks for it differs. Once the entry fetch answers, the
 * board is confirmed and nothing is sent again.
 */
export function useSubmitCommand<T>(
    gameId: uuidString,
    user: SubmittingUser | null | undefined,
    setGameData: (data: T) => void,
    getGameData: () => Promise<void>,
    board: IGameDataResponse | null,
) {
    const [submitting, setSubmitting] = useState(false);
    const [pendingTarget, setPendingTarget] = useState<string | null>(null);
    // The guard is a ref, not the state flag beside it. `setSubmitting(true)`
    // doesn't take effect until React re-renders, so two calls dispatched in
    // the same tick — a double-tap the browser delivers as one batch, a board
    // that fires from both a click and a key handler — both read `submitting`
    // as false and both send. That is precisely the race the rest of this hook
    // exists to prevent. The state flag stays, because that is what the UI
    // renders from; the ref is what decides.
    const inFlightRef = useRef(false);
    // A number rather than the board, so a poll that brings back the same
    // board doesn't rebuild `submitCommand` for every screen holding it.
    const expectedCommandCount = expectedCommandCountFor(board);
    // What a command carries instead while the board is a cached paint that
    // hasn't been answered yet: read when the command is sent, not rendered
    // from, because the board doesn't change when the answer lands unchanged.
    const boardCommandCount = board?.gameState.commandCount;
    const version = commandVersionFor(board);
    const gameUrl = board?.gameType.url;

    const submitCommand = useCallback<SubmitCommand>(async (
        command: IGameCommand,
        callback?: (r: ICommandResponse) => void,
        target?: string,
    ) => {
        if (inFlightRef.current) return;
        if (!user) {
            console.error("Unable to send command whilst not logged in");
            return;
        }
        if (version === undefined) {
            console.error("Unable to send command before the game has loaded");
            return;
        }
        inFlightRef.current = true;
        command.gameId = gameId;
        command.senderId = user.id;
        command.version = version;
        // Assigned even when undefined, which JSON.stringify leaves out — so a
        // command object a board sends twice can't carry the first count along.
        command.expectedCommandCount = expectedCommandCount
            ?? (isDataUnconfirmed(user.id, gameDataUrl(gameId)) ? boardCommandCount : undefined);
        // No `senderUsername`: the route resolves the sender's name from the
        // authenticated caller before Execute runs, so naming ourselves here
        // would only be a value the server throws away.
        setSubmitting(true);
        setPendingTarget(target ?? null);
        try {
            // A move made the moment the app comes back would otherwise go
            // with the token that expired while it was away, and be refused.
            await untilSessionRenewed();
            const res = await fetch('/api/game/command', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(command),
                // Without a deadline a stalled connection never settles, and
                // the `finally` below never runs — the board would stay locked
                // behind its own in-flight guard until the player reloaded.
                signal: AbortSignal.timeout(COMMAND_TIMEOUT_MS),
            });
            // Built for rules the server has since changed: resyncing would
            // leave this tab on the old bundle, refusing every move it sends,
            // so load the current release instead — once per version, and
            // otherwise resync like any other refusal.
            if (res.status === 426 && reloadForNewRules(`${gameUrl}@${version}`)) {
                return;
            }
            const data: ICommandResponse | null = res.ok ? await res.json() : null;
            if (!data?.gameData) {
                await getGameData();
                return;
            }
            setGameData(data.gameData as T);
            callback?.(data);
            // The claim-account offer's whole trigger (docs/account-less-play.md
            // step 16) — shared by every game through this one hook rather than
            // each board page marking it separately.
            if (isGuest(user)) {
                recordGuestMoved();
            }
        } catch (err) {
            console.error('submitCommand failed', err);
            await getGameData();
        } finally {
            inFlightRef.current = false;
            setSubmitting(false);
            setPendingTarget(null);
        }
    }, [user, gameId, setGameData, getGameData, expectedCommandCount, boardCommandCount, version, gameUrl]);

    return { submitCommand, submitting, pendingTarget };
}
