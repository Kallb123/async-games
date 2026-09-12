import { describe, expect, it, vi } from "vitest";
import { buildTimeline } from "@/utils/games/replay";
import { runCommand } from "@/utils/games/commandPipeline";
import { BannedIsletAction, BannedIsletDiscard, BannedIsletEndTurn, BannedIsletGameType, BannedIsletPlayCard } from "./BannedIsletLogic";
import {
    IBannedIsletGameData,
    buildInitialBannedIsletState,
    cloneBannedIsletState,
    gameStateToModel,
} from "./BannedIsletModels";
import { HAND_LIMIT, isPlayableCard, isTreasureCard, roleDef, BannedIsletCardId, BannedIsletDifficulty, BannedIsletRoleId } from "./board";
import {
    forcedDiscard,
    giveCardTargets,
    positionOfTile,
    moveTargets,
    navigatorMoveTargets,
    pilotFlightAvailable,
    flightTargets,
    sandbagsTargets,
    shoreUpTargets,
} from "./rules";

// docs/games/banned-islet.md §21.7, "Replay equality": run a game, rebuild it
// through buildTimeline(), and assert the final state matches. With two decks
// and a mid-game shuffle, that single assertion is worth more than any
// individual rules test — it is the only thing that proves
// `recordedFloodShuffles` and `recordedTreasureShuffles` are actually consumed
// on the way back rather than rolled again. Mirrors
// src/games/FiresOut/replay.test.ts, which is the model
// docs/turn-recap-and-planning.md points at for a snapshot-replay game.

const PLAYERS = ["u1", "u2", "u3"];
const NAMES = { u1: "Alice", u2: "Bob", u3: "Cara" };

function noRandomness<T>(run: () => T): T {
    // Both sources: the rules draw through crypto.getRandomValues
    // (src/utils/games/random.ts), but a command reaching for Math.random
    // directly would replay non-deterministically just the same, and this
    // guard is worthless if it can pass without noticing.
    const consumed = () => { throw new Error("replay consumed randomness"); };
    const entropy = vi.spyOn(globalThis.crypto, "getRandomValues").mockImplementation(consumed);
    const random = vi.spyOn(Math, "random").mockImplementation(consumed);
    try {
        return run();
    } finally {
        entropy.mockRestore();
        random.mockRestore();
    }
}

/**
 * `roles` pins §12's deal, which is otherwise three of six at random — so a
 * role-ability run exercises the abilities it means to rather than whichever
 * three came up. The pawn moves to the pinned role's own start tile too (§6
 * step 4), so the board stays the one that deal would really have produced.
 *
 * It also makes each pinned ability legal on that seat's first turn, because
 * two of the six otherwise depend on the deal: the Engineer needs a flooded
 * tile within reach and the Messenger a treasure card in hand. Without that the
 * run is a lottery — and a game where the ability was never legal replays
 * perfectly while proving nothing about it.
 */
function makeGame(roles?: BannedIsletRoleId[], difficulty: BannedIsletDifficulty = 'legendary'): IBannedIsletGameData {
    const specificGameState = buildInitialBannedIsletState([...PLAYERS], difficulty);
    roles?.forEach((role, seat) => {
        const ps = specificGameState.players.get(PLAYERS[seat]);
        if (!ps) return;
        ps.role = role;
        ps.position = positionOfTile(specificGameState.positions, roleDef(role).startTile);

        // Something to pump: §9.1's flooded is a state, not a card location, so
        // this leaves the flood deck and discard exactly as setup left them.
        if (role === 'engineer') specificGameState.positions[ps.position].state = 'flooded';

        // Something to hand over — moved out of the deck rather than conjured,
        // so §10's 28 cards still add up.
        if (role === 'messenger') {
            const index = specificGameState.treasureDeck.findIndex(isTreasureCard);
            if (index >= 0) ps.hand.push(...specificGameState.treasureDeck.splice(index, 1));
        }
    });
    return {
        gameId: "g",
        gameType: new BannedIsletGameType(),
        currentTurn: PLAYERS[0],
        userIdList: [...PLAYERS],
        turnTimer: 0,
        gameState: { turnOrder: [...PLAYERS], history: [], commandHistory: [] },
        specificGameState,
        initialSpecificGameState: cloneBannedIsletState(specificGameState, [...PLAYERS]),
        complete: false,
        winner: "",
    } as unknown as IBannedIsletGameData;
}

function send(command: BannedIsletAction | BannedIsletEndTurn | BannedIsletDiscard | BannedIsletPlayCard, senderId: string) {
    command.senderId = senderId;
    command.senderUsername = NAMES[senderId as keyof typeof NAMES] ?? senderId;
    return command;
}

/**
 * A table that passes every turn, played through the real command pipeline —
 * discarding when the draw demands it, and playing one of §10's specials
 * instead whenever the hand holds one.
 */
async function playOut(game: IBannedIsletGameData): Promise<IBannedIsletGameData> {
    const gameType = new BannedIsletGameType();

    for (let turn = 0; turn < 200 && !game.complete; turn++) {
        const userId = game.currentTurn;
        const ps = game.specificGameState.players.get(userId)!;

        if (game.specificGameState.phase === 'discard') {
            // §10: a special is played rather than discarded to get under the
            // limit wherever one is held — which is the path that lets
            // BannedIsletPlayCard close a turn and run Phase 3 itself,
            // recorded flood shuffles and all. Anything else is discarded.
            const special = specialPlay(game.specificGameState, userId, ps);
            if (special && (await runCommand(game, gameType, send(special, userId))).outcome.validMove) continue;

            const command = new BannedIsletDiscard();
            command.cardIds = ps.hand.slice(0, ps.hand.length - HAND_LIMIT);
            await runCommand(game, gameType, send(command, userId));
            continue;
        }

        const pass = new BannedIsletAction();
        pass.kind = 'pass';
        await runCommand(game, gameType, send(pass, userId));
        if (game.complete) break;
        await runCommand(game, gameType, send(new BannedIsletEndTurn(), userId));
    }
    return game;
}

/**
 * Nothing here is good play — the point is that Legendary's rate of four
 * drowns the table in a handful of turns while drawing the whole treasure
 * deck, which is what puts a Waters Rise! shuffle, a flood-deck reshuffle and
 * a treasure-deck reshuffle into one command log.
 */
function playPassiveGame(): Promise<IBannedIsletGameData> {
    return playOut(makeGame());
}

/**
 * The same table, with the opening deal stacked so that the first seat is
 * certain to end its turn one card over the hand limit holding Sandbags — and
 * so certain to duck the limit by playing it (§10). That is the one path on
 * which BannedIsletPlayCard runs Phase 3 itself rather than ending nothing,
 * and the passive run above only reaches it when the shuffle happens to oblige.
 *
 * Every card is moved rather than conjured, so §10's 28 still add up, and the
 * starting snapshot is taken after the stacking rather than before — it is the
 * state replay rebuilds from.
 */
function playSpecialGame(): Promise<IBannedIsletGameData> {
    const game = makeGame(undefined, 'novice');
    const gs = game.specificGameState;
    const ps = gs.players.get(PLAYERS[0])!;

    const take = (matches: (card: BannedIsletCardId) => boolean): BannedIsletCardId[] => {
        const index = gs.treasureDeck.findIndex(matches);
        return index < 0 ? [] : gs.treasureDeck.splice(index, 1);
    };

    gs.treasureDeck.push(...ps.hand);
    ps.hand = [...take(card => card === 'sandbags')];
    while (ps.hand.length < HAND_LIMIT - 1) ps.hand.push(...take(isTreasureCard));
    // Two ordinary cards on top, so the draw of §7's Phase 2 really does add
    // two to that hand — a Waters Rise! would resolve instead of joining it.
    gs.treasureDeck.unshift(...take(isTreasureCard), ...take(isTreasureCard));
    game.initialSpecificGameState = cloneBannedIsletState(gs, [...PLAYERS]);

    return playOut(game);
}

/**
 * The same, but every seat spends an action on its own §12 ability first. The
 * passive game above never sends a `pilotFlight`, a `navigatorMove` or an
 * Engineer's two-tile shore up, and never asks a Diver or an Explorer to swim —
 * so on its own it would let PR 7 break replay in four ways without noticing.
 *
 * It matters more than an ordinary rules test because the role abilities reach
 * into the flood phase: `resolveSwim` now takes the swimmer's role, and a
 * replay that rebuilt the island with the wrong one would put pawns somewhere
 * the live game didn't.
 */
async function playRoleGame(roles: BannedIsletRoleId[]): Promise<IBannedIsletGameData> {
    // Novice rather than the passive game's Legendary: at a rate of four the
    // island can drown the table inside two turns, before the third seat has
    // ever played — and a run where a role never got a turn proves nothing
    // about replaying it. The reshuffles Legendary is there to force are the
    // other run's job.
    const game = makeGame(roles, 'novice');
    const gameType = new BannedIsletGameType();
    const used = new Set<string>();

    for (let turn = 0; turn < 200 && !game.complete; turn++) {
        const userId = game.currentTurn;
        const gs = game.specificGameState;
        const ps = gs.players.get(userId)!;

        if (gs.phase === 'discard') {
            const command = new BannedIsletDiscard();
            command.cardIds = forcedDiscard(ps.hand, HAND_LIMIT);
            await runCommand(game, gameType, send(command, userId));
            continue;
        }

        const ability = roleAction(gs, userId, ps);
        if (ability) {
            const { outcome } = await runCommand(game, gameType, send(ability, userId));
            if (outcome.validMove) used.add(ps.role);
            if (game.complete) break;
        }

        const pass = new BannedIsletAction();
        pass.kind = 'pass';
        await runCommand(game, gameType, send(pass, userId));
        if (game.complete) break;
        await runCommand(game, gameType, send(new BannedIsletEndTurn(), userId));
    }
    (game as unknown as { rolesUsed: Set<string> }).rolesUsed = used;
    return game;
}

/**
 * One of §10's specials out of this hand, aimed at the first legal target — or
 * null when the hand holds none or the island offers nowhere to put it. Never
 * the escape call, which would end the game rather than replay a card.
 */
function specialPlay(
    gs: IBannedIsletGameData['specificGameState'],
    userId: string,
    ps: { position: number; hand: BannedIsletCardId[] },
): BannedIsletPlayCard | null {
    const card = ps.hand.find(isPlayableCard);
    if (!card) return null;

    const command = new BannedIsletPlayCard();
    command.cardId = card;
    if (card === 'sandbags') {
        const targets = sandbagsTargets(gs.positions);
        if (targets.length === 0) return null;
        command.target = targets[0];
        return command;
    }

    const reach = flightTargets(gs.positions, ps.position);
    if (reach.length === 0) return null;
    command.userIds = [userId];
    command.target = reach[0];
    return command;
}

/** The one action this seat's role gives it, aimed at the first legal target — or null when the island offers none this turn. */
function roleAction(
    gs: IBannedIsletGameData['specificGameState'],
    userId: string,
    ps: { role: string; position: number; pilotFlightUsed: boolean; hand: unknown[] },
): BannedIsletAction | null {
    const action = new BannedIsletAction();
    const others = [...gs.players.keys()].filter(id => id !== userId);

    switch (ps.role) {
        case 'pilot': {
            const reach = flightTargets(gs.positions, ps.position);
            if (!pilotFlightAvailable('pilot', ps.pilotFlightUsed) || reach.length === 0) return null;
            action.kind = 'pilotFlight';
            action.target = reach[0];
            return action;
        }
        case 'engineer': {
            const reach = shoreUpTargets(gs.positions, ps.position, 'engineer');
            if (reach.length === 0) return null;
            action.kind = 'shoreUp';
            action.target = reach[0];
            // The two-tile shore up when the island offers a second, so the
            // `secondTarget` field itself makes it into the command log.
            if (reach.length > 1) action.secondTarget = reach[1];
            return action;
        }
        case 'navigator': {
            for (const other of others) {
                const moved = gs.players.get(other)!;
                const reach = navigatorMoveTargets(gs.positions, moved.position, moved.role);
                if (reach.length === 0) continue;
                action.kind = 'navigatorMove';
                action.targetUserId = other;
                action.target = reach[0];
                return action;
            }
            return null;
        }
        case 'messenger': {
            const card = (ps.hand as BannedIsletCardId[]).find(isTreasureCard);
            const mates = giveCardTargets(
                [...gs.players].map(([id, p]) => ({ userId: id, position: p.position })),
                userId,
                'messenger',
            );
            if (!card || mates.length === 0) return null;
            action.kind = 'giveCard';
            action.targetUserId = mates[0];
            action.cardId = card;
            return action;
        }
        default: {
            // Diver and Explorer: an ordinary Move, through the reach their own
            // role widened.
            const reach = moveTargets(gs.positions, ps.position, ps.role as 'diver');
            if (reach.length === 0) return null;
            action.kind = 'move';
            action.target = reach[reach.length - 1];
            return action;
        }
    }
}

describe("Banned Islet replay", () => {
    it("replays a whole game to exactly the live state without consuming randomness", async () => {
        const game = await playPassiveGame();
        expect(game.complete).toBe(true);
        expect(game.gameState.commandHistory.length).toBeGreaterThan(0);
        // The run has to have exercised the thing being guarded, or the
        // assertion below proves nothing: at least one command re-ordered a
        // deck mid-game, which is the only randomness replay has to reproduce.
        const shuffled = game.gameState.commandHistory.filter(
            c => (c as BannedIsletEndTurn).recordedFloodShuffles?.length
                || (c as BannedIsletEndTurn).recordedTreasureShuffles?.length,
        );
        expect(shuffled.length).toBeGreaterThan(0);

        const userIdNameMap = { ...NAMES };
        const timeline = await noRandomness(() => buildTimeline(game, userIdNameMap));

        // One snapshot for the opening island, then one per accepted command.
        expect(timeline.snapshots.length).toBe(game.gameState.commandHistory.length + 1);
        expect(timeline.snapshots[timeline.currentIndex].specificGameState)
            .toEqual(gameStateToModel(game.specificGameState, userIdNameMap, null));
    });

    it("replays a turn closed by a special card played to duck the hand limit (§10)", async () => {
        const game = await playSpecialGame();

        const played = game.gameState.commandHistory.filter(c => c.className === 'BannedIsletPlayCard');
        expect(played.length).toBeGreaterThan(0);

        const userIdNameMap = { ...NAMES };
        const timeline = await noRandomness(() => buildTimeline(game, userIdNameMap));

        expect(timeline.snapshots.length).toBe(game.gameState.commandHistory.length + 1);
        expect(timeline.snapshots[timeline.currentIndex].specificGameState)
            .toEqual(gameStateToModel(game.specificGameState, userIdNameMap, null));
    });

    // Two runs, the six roles split between them, because a table only seats
    // three (§1) — so one game can never deal all six.
    //
    // `makeGame` makes all three legal on turn one, so every seat that gets a
    // turn spends its ability — and the first seat always does, however fast the
    // island collapses.
    it.each([
        { roles: ['pilot', 'engineer', 'explorer'] },
        { roles: ['diver', 'messenger', 'navigator'] },
    ] as const)("replays a game played with $roles (§12)", async ({ roles }) => {
        const game = await playRoleGame([...roles]);
        const rolesUsed = (game as unknown as { rolesUsed: Set<string> }).rolesUsed;

        // The run is only worth anything if it really spent the abilities: the
        // first seat's at the very least, and in practice all three.
        expect([...rolesUsed]).toContain(roles[0]);
        expect(game.gameState.commandHistory.length).toBeGreaterThan(0);

        const userIdNameMap = { ...NAMES };
        const timeline = await noRandomness(() => buildTimeline(game, userIdNameMap));

        expect(timeline.snapshots.length).toBe(game.gameState.commandHistory.length + 1);
        expect(timeline.snapshots[timeline.currentIndex].specificGameState)
            .toEqual(gameStateToModel(game.specificGameState, userIdNameMap, null));
    });

    it("has no timeline for a game created before the starting snapshot existed", async () => {
        const game = makeGame();
        delete (game as { initialSpecificGameState?: unknown }).initialSpecificGameState;
        await expect(buildTimeline(game, { ...NAMES })).rejects.toThrow();
    });
});
