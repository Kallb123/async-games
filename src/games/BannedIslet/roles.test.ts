import { describe, expect, it } from "vitest";
import {
    BannedIsletAction,
    BannedIsletActionKind,
    BannedIsletGameType,
} from "./BannedIsletLogic";
import type { IBannedIsletGameData, IBannedIsletSpecificGameState } from "./BannedIsletModels";
import {
    forcedDiscard,
    giveCardTargets,
    isDrowningLoss,
    moveTargets,
    navigatorMoveTargets,
    pilotFlightAvailable,
    pilotFlightTargets,
    resolveSwim,
    shoreUpTargets,
    shoreUpsPerAction,
    swimReach,
} from "./rules";
import {
    ACTIONS_PER_TURN,
    HAND_LIMIT,
    POSITION_COUNT,
    ROLE_IDS,
} from "./board";
import {
    EAST_OF_MIDDLE,
    FAR_EAST,
    FAR_WEST,
    MIDDLE,
    NORTH_EAST,
    NORTH_OF_MIDDLE,
    NORTH_WEST,
    SOUTH_EAST,
    SOUTH_OF_MIDDLE,
    SOUTH_WEST,
    TOP_TIP,
    TOP_TIP_EAST,
    WEST_OF_MIDDLE,
    baseState,
    island,
} from "./testFixtures";

// docs/games/banned-islet.md §12 and §21.6 PR 7: the six roles, each bending
// exactly one spatial rule. Every ability is a pure predicate in rules.ts
// rather than a branch inside a command, so most of what follows tests the
// predicate and then proves the command actually asks it.
//
// Two of the six reach *outside* their own command, and §21.6 PR 7 singles them
// out for that reason: the Diver's and Explorer's widened `resolveSwim` fires
// during somebody else's turn, in the flood phase, with no action spent; and
// the Navigator moves a pawn that isn't theirs. Those two have the longest
// sections here.

/** The role to ask a base rule with: §12's Messenger is the only one of the six whose ability isn't spatial. */
const BASE = 'messenger' as const;

function makeGame(state: IBannedIsletSpecificGameState, turnOrder: string[] = ["u1", "u2"]): IBannedIsletGameData {
    return {
        gameId: "g",
        currentTurn: turnOrder[0],
        userIdList: turnOrder,
        gameState: { turnOrder, history: [], commandHistory: [] },
        specificGameState: state,
        complete: false,
        winner: "",
    } as unknown as IBannedIsletGameData;
}

function cmd(kind: BannedIsletActionKind, fields: Partial<BannedIsletAction> = {}, senderId = "u1"): BannedIsletAction {
    const action = new BannedIsletAction();
    action.senderId = senderId;
    action.senderUsername = senderId;
    action.kind = kind;
    return Object.assign(action, fields);
}

const REFUSED = { validMove: false, turnOver: false };
const ACCEPTED = { validMove: true, turnOver: false };

// ═══════════════════════════════════════════════════════════════════════════
//  EXPLORER (§12) — the island grows corners
// ═══════════════════════════════════════════════════════════════════════════

describe("Explorer (§12)", () => {
    it("moves and shores up diagonally, which nobody else can", () => {
        const board = island({ flooded: [NORTH_WEST] });

        expect(moveTargets(board, MIDDLE, 'explorer')).toContain(NORTH_WEST);
        expect(moveTargets(board, MIDDLE, BASE)).not.toContain(NORTH_WEST);

        // §12 gives the Explorer both verbs, not just the move.
        expect(shoreUpTargets(board, MIDDLE, 'explorer')).toContain(NORTH_WEST);
        expect(shoreUpTargets(board, MIDDLE, BASE)).not.toContain(NORTH_WEST);
    });

    it("still never steps onto a hole, diagonal or not (§9.1)", () => {
        const board = island({ sunk: [NORTH_WEST] });
        expect(moveTargets(board, MIDDLE, 'explorer')).not.toContain(NORTH_WEST);
    });

    it("swims to a corner when every orthogonal neighbour has gone — §9.2, and no action spent", () => {
        // The tile sinks under the pawn during somebody else's turn, so this is
        // the widening that matters most: it decides whether the Explorer lives.
        const sinking = island({
            sunk: [MIDDLE, NORTH_OF_MIDDLE, WEST_OF_MIDDLE, EAST_OF_MIDDLE, SOUTH_OF_MIDDLE],
        });

        expect(swimReach(sinking, MIDDLE, 'explorer')).toEqual(
            expect.arrayContaining([NORTH_WEST, NORTH_EAST, SOUTH_WEST, SOUTH_EAST]),
        );
        expect(resolveSwim(sinking, MIDDLE, 'explorer')).not.toBeNull();
        expect(isDrowningLoss(sinking, MIDDLE, 'explorer')).toBe(false);

        // Anybody else on that tile drowns, and that is §4.2's loss.
        expect(resolveSwim(sinking, MIDDLE, BASE)).toBeNull();
        expect(isDrowningLoss(sinking, MIDDLE, BASE)).toBe(true);
    });

    it("ranks its corners by the same §21.3 preference as any other swim", () => {
        // Three corners flooded and one dry: dry wins, exactly as it does for an
        // orthogonal swim — the role widens the shortlist, never the ordering.
        const sinking = island({
            sunk: [MIDDLE, NORTH_OF_MIDDLE, WEST_OF_MIDDLE, EAST_OF_MIDDLE, SOUTH_OF_MIDDLE],
            flooded: [NORTH_WEST, NORTH_EAST, SOUTH_WEST],
        });
        expect(resolveSwim(sinking, MIDDLE, 'explorer')).toBe(SOUTH_EAST);
    });
});

// ═══════════════════════════════════════════════════════════════════════════
//  DIVER (§12) — the pawn a collapsing island cannot strand
// ═══════════════════════════════════════════════════════════════════════════

describe("Diver (§12)", () => {
    it("moves through a run of flooded or sunken tiles to the land beyond", () => {
        // MIDDLE → WEST_OF_MIDDLE (ruined) → FAR_WEST (land).
        for (const ruin of ['flooded', 'sunk'] as const) {
            const board = island({ [ruin]: [WEST_OF_MIDDLE] });
            expect(moveTargets(board, MIDDLE, 'diver')).toContain(FAR_WEST);
            expect(moveTargets(board, MIDDLE, BASE)).not.toContain(FAR_WEST);
        }
    });

    it("stops at dry land rather than swimming through it", () => {
        // Everything dry: the Diver's reach is an ordinary step, because there is
        // no run of ruined tiles to swim along.
        expect(moveTargets(island(), MIDDLE, 'diver')).toEqual(moveTargets(island(), MIDDLE, BASE));
    });

    it("may stop on a flooded tile along the way, since flooded is standable (§9.1)", () => {
        const board = island({ flooded: [WEST_OF_MIDDLE] });
        const reach = moveTargets(board, MIDDLE, 'diver');
        expect(reach).toContain(WEST_OF_MIDDLE);
        expect(reach).toContain(FAR_WEST);
    });

    it("never surfaces on the tile it started from", () => {
        const board = island({ flooded: [WEST_OF_MIDDLE, EAST_OF_MIDDLE] });
        expect(moveTargets(board, MIDDLE, 'diver')).not.toContain(MIDDLE);
    });

    it("swims clear of a tile whose every neighbour has sunk — §9.2, the rescue the role is for", () => {
        // §12: "the only pawn a collapsing island cannot strand". The ring of
        // holes that drowns everybody else is the run the Diver swims along.
        const sinking = island({
            sunk: [MIDDLE, NORTH_OF_MIDDLE, WEST_OF_MIDDLE, EAST_OF_MIDDLE, SOUTH_OF_MIDDLE],
        });

        expect(resolveSwim(sinking, MIDDLE, BASE)).toBeNull();

        const landing = resolveSwim(sinking, MIDDLE, 'diver');
        expect(landing).not.toBeNull();
        // Wherever it put them, it is real standing ground beyond the holes.
        expect(sinking[landing!].state).toBe('dry');
        expect(isDrowningLoss(sinking, MIDDLE, 'diver')).toBe(false);
    });

    it("drowns only once there is no land left to reach at all (§4.2)", () => {
        // Every tile gone: there is no run of ruined tiles that ends in land,
        // so even the Diver has nowhere to surface and §4.2 still fires. This is
        // the difference between "cannot be stranded" and "cannot drown".
        const drowned = island({ sunk: island().map((_, index) => index) });

        expect(drowned.every(p => p.state === 'sunk')).toBe(true);
        expect(resolveSwim(drowned, TOP_TIP, 'diver')).toBeNull();
        expect(isDrowningLoss(drowned, TOP_TIP, 'diver')).toBe(true);
    });
});

// ═══════════════════════════════════════════════════════════════════════════
//  PILOT (§12) — the whole island, once a turn
// ═══════════════════════════════════════════════════════════════════════════

describe("Pilot (§12)", () => {
    it("can fly until the flight is spent, and not after", () => {
        expect(pilotFlightAvailable('pilot', false)).toBe(true);
        expect(pilotFlightAvailable('pilot', true)).toBe(false);
        // Nobody else ever gets it, spent or not.
        expect(ROLE_IDS.filter(role => pilotFlightAvailable(role, false))).toEqual(['pilot']);
    });

    it("reaches every surviving tile but the one under the pawn", () => {
        const board = island({ sunk: [EAST_OF_MIDDLE] });
        const reach = pilotFlightTargets(board, MIDDLE);

        expect(reach).toHaveLength(POSITION_COUNT - 2); // less the hole, less its own tile
        expect(reach).not.toContain(MIDDLE);
        expect(reach).not.toContain(EAST_OF_MIDDLE);
        expect(reach).toContain(FAR_EAST);
    });

    it("flies for one action and only once a turn", async () => {
        const state = baseState({ u1: { position: MIDDLE, role: 'pilot' }, u2: {} });
        const game = makeGame(state);

        expect(await cmd('pilotFlight', { target: FAR_EAST }).Execute(game)).toEqual(ACCEPTED);
        expect(state.players.get("u1")!.position).toBe(FAR_EAST);
        expect(state.players.get("u1")!.actionsLeft).toBe(ACTIONS_PER_TURN - 1);
        expect(state.players.get("u1")!.pilotFlightUsed).toBe(true);

        // §12's one once-per-turn ability: the second flight is refused even
        // though there are actions left to pay for it.
        expect(await cmd('pilotFlight', { target: TOP_TIP }).Execute(game)).toEqual(REFUSED);
        expect(state.players.get("u1")!.position).toBe(FAR_EAST);
    });

    it("refuses the flight to everybody else", async () => {
        const state = baseState({ u1: { position: MIDDLE, role: 'engineer' }, u2: {} });
        const game = makeGame(state);

        expect(await cmd('pilotFlight', { target: FAR_EAST }).Execute(game)).toEqual(REFUSED);
        expect(state.players.get("u1")!.position).toBe(MIDDLE);
    });

    it("refuels at the start of its own next turn, not the end of somebody else's", async () => {
        const state = baseState({ u1: { position: MIDDLE, role: 'pilot' }, u2: {} });
        const game = makeGame(state);
        await cmd('pilotFlight', { target: FAR_EAST }).Execute(game);

        // Turn passes to u2: the Pilot's flag is still spent, because it is
        // cleared for whoever is *starting* a turn (§21.4).
        new BannedIsletGameType().CheckEndTurn(game, { validMove: true, turnOver: true });
        expect(game.currentTurn).toBe("u2");
        expect(state.players.get("u1")!.pilotFlightUsed).toBe(true);

        // And back round to u1, where it refills alongside the actions.
        new BannedIsletGameType().CheckEndTurn(game, { validMove: true, turnOver: true });
        expect(game.currentTurn).toBe("u1");
        expect(state.players.get("u1")!.pilotFlightUsed).toBe(false);
        expect(state.players.get("u1")!.actionsLeft).toBe(ACTIONS_PER_TURN);
    });

    it("swims anywhere on the island, with the flight unspent — §9.2 waives the fare", () => {
        const sinking = island({
            sunk: [MIDDLE, NORTH_OF_MIDDLE, WEST_OF_MIDDLE, EAST_OF_MIDDLE, SOUTH_OF_MIDDLE],
        });
        expect(resolveSwim(sinking, MIDDLE, BASE)).toBeNull();
        expect(swimReach(sinking, MIDDLE, 'pilot')).toEqual(pilotFlightTargets(sinking, MIDDLE));
        expect(resolveSwim(sinking, MIDDLE, 'pilot')).not.toBeNull();
    });
});

// ═══════════════════════════════════════════════════════════════════════════
//  ENGINEER (§12) — two tiles for one action
// ═══════════════════════════════════════════════════════════════════════════

describe("Engineer (§12)", () => {
    it("is the only role that gets two shore ups for an action", () => {
        expect(shoreUpsPerAction('engineer')).toBe(2);
        expect(ROLE_IDS.filter(role => shoreUpsPerAction(role) > 1)).toEqual(['engineer']);
    });

    it("changes the price, not the targets", () => {
        const board = island({ flooded: [MIDDLE, NORTH_WEST] });
        // No diagonals: that is the Explorer's change, not this one.
        expect(shoreUpTargets(board, MIDDLE, 'engineer')).toEqual([MIDDLE]);
    });

    it("dries two tiles for one action", async () => {
        const state = baseState(
            { u1: { position: MIDDLE, role: 'engineer' }, u2: {} },
            { flooded: [MIDDLE, NORTH_OF_MIDDLE] },
        );
        const game = makeGame(state);

        expect(await cmd('shoreUp', { target: MIDDLE, secondTarget: NORTH_OF_MIDDLE }).Execute(game)).toEqual(ACCEPTED);
        expect(state.positions[MIDDLE].state).toBe('dry');
        expect(state.positions[NORTH_OF_MIDDLE].state).toBe('dry');
        expect(state.players.get("u1")!.actionsLeft).toBe(ACTIONS_PER_TURN - 1);
        expect(game.gameState.history[0].text).toContain(' and ');
    });

    it("may dry only one — the ability is 'up to two' (§12)", async () => {
        const state = baseState(
            { u1: { position: MIDDLE, role: 'engineer' }, u2: {} },
            { flooded: [MIDDLE] },
        );
        const game = makeGame(state);

        expect(await cmd('shoreUp', { target: MIDDLE }).Execute(game)).toEqual(ACCEPTED);
        expect(state.positions[MIDDLE].state).toBe('dry');
        expect(state.players.get("u1")!.actionsLeft).toBe(ACTIONS_PER_TURN - 1);
    });

    it("refuses a second tile to everybody else, rather than quietly drying one", async () => {
        const state = baseState(
            { u1: { position: MIDDLE, role: 'explorer' }, u2: {} },
            { flooded: [MIDDLE, NORTH_OF_MIDDLE] },
        );
        const game = makeGame(state);

        expect(await cmd('shoreUp', { target: MIDDLE, secondTarget: NORTH_OF_MIDDLE }).Execute(game)).toEqual(REFUSED);
        // Both targets are checked before either is dried, so a refused command
        // leaves the island exactly as it found it.
        expect(state.positions[MIDDLE].state).toBe('flooded');
        expect(state.positions[NORTH_OF_MIDDLE].state).toBe('flooded');
    });

    it("refuses an illegal or repeated second tile without drying the first", async () => {
        const state = baseState(
            { u1: { position: MIDDLE, role: 'engineer' }, u2: {} },
            { flooded: [MIDDLE, NORTH_OF_MIDDLE], sunk: [EAST_OF_MIDDLE] },
        );
        const game = makeGame(state);

        // A dry tile (§16), a hole (§9.1), one out of reach, and the same tile twice.
        for (const secondTarget of [SOUTH_OF_MIDDLE, EAST_OF_MIDDLE, FAR_EAST, MIDDLE]) {
            expect(await cmd('shoreUp', { target: MIDDLE, secondTarget }).Execute(game)).toEqual(REFUSED);
            expect(state.positions[MIDDLE].state).toBe('flooded');
        }
        expect(state.players.get("u1")!.actionsLeft).toBe(ACTIONS_PER_TURN);
    });
});

// ═══════════════════════════════════════════════════════════════════════════
//  MESSENGER (§12) — no meeting needed
// ═══════════════════════════════════════════════════════════════════════════

describe("Messenger (§12)", () => {
    const pawns = [
        { userId: "u1", position: MIDDLE },
        { userId: "u2", position: FAR_EAST },
        { userId: "u3", position: MIDDLE },
    ];

    it("gives to anybody anywhere, where everybody else needs the same tile (§8)", () => {
        expect(giveCardTargets(pawns, "u1", 'messenger').sort()).toEqual(["u2", "u3"]);
        expect(giveCardTargets(pawns, "u1", 'engineer')).toEqual(["u3"]);
    });

    it("never offers the sender their own seat", () => {
        for (const role of ROLE_IDS) {
            expect(giveCardTargets(pawns, "u1", role)).not.toContain("u1");
        }
    });

    it("answers nothing for a seat the game doesn't hold", () => {
        expect(giveCardTargets(pawns, "ghost", 'messenger')).toEqual([]);
    });

    it("hands a card across the island for one action", async () => {
        const state = baseState({
            u1: { position: MIDDLE, role: 'messenger', hand: ['emberCrown'] },
            u2: { position: FAR_EAST, hand: [] },
        });
        const game = makeGame(state);

        expect(await cmd('giveCard', { targetUserId: "u2", cardId: 'emberCrown' }).Execute(game)).toEqual(ACCEPTED);
        expect(state.players.get("u1")!.hand).toEqual([]);
        expect(state.players.get("u2")!.hand).toEqual(['emberCrown']);
        expect(state.players.get("u1")!.actionsLeft).toBe(ACTIONS_PER_TURN - 1);
    });

    it("still only ever hands over a treasure card (§10)", async () => {
        const state = baseState({
            u1: { position: MIDDLE, role: 'messenger', hand: ['helicopterLift'] },
            u2: { position: FAR_EAST, hand: [] },
        });
        const game = makeGame(state);

        expect(await cmd('giveCard', { targetUserId: "u2", cardId: 'helicopterLift' }).Execute(game)).toEqual(REFUSED);
        expect(state.players.get("u1")!.hand).toEqual(['helicopterLift']);
    });
});

// ═══════════════════════════════════════════════════════════════════════════
//  NAVIGATOR (§12, §21.3) — somebody else's pawn, two tiles
// ═══════════════════════════════════════════════════════════════════════════

describe("Navigator (§12)", () => {
    it("reaches exactly two ordinary steps, and no further", () => {
        const reach = navigatorMoveTargets(island(), MIDDLE, BASE);

        expect(reach).toContain(NORTH_OF_MIDDLE);   // one step
        expect(reach).toContain(FAR_WEST);          // two, straight
        expect(reach).toContain(NORTH_EAST);        // two, round a corner
        expect(reach).toContain(SOUTH_EAST);        // ditto
        expect(reach).toContain(NORTH_WEST);        // ditto — two orthogonal steps already turn a corner
        expect(reach).not.toContain(MIDDLE);        // the pawn's own tile is not a destination
        expect(reach).not.toContain(TOP_TIP_EAST);  // three steps away
    });

    it("never hops a hole — each of the two steps has to be legal on its own", () => {
        // FAR_WEST is two steps west, and the only route runs through
        // WEST_OF_MIDDLE. Sink it and the destination goes with it, even though
        // it is still standing itself.
        const board = island({ sunk: [WEST_OF_MIDDLE] });
        const reach = navigatorMoveTargets(board, MIDDLE, BASE);

        expect(board[FAR_WEST].state).toBe('dry');
        expect(reach).not.toContain(FAR_WEST);
        expect(reach).not.toContain(WEST_OF_MIDDLE);
    });

    it("sends an Explorer where only a diagonal reaches, because that is how that pawn reads the island", () => {
        // Two orthogonal steps already turn a corner, so the Explorer's
        // difference only shows where the orthogonal route is *gone*:
        // NORTH_WEST's only two orthogonal neighbours are both holes here, and
        // one diagonal step still gets there.
        const board = island({ sunk: [WEST_OF_MIDDLE, NORTH_OF_MIDDLE] });

        expect(board[NORTH_WEST].state).toBe('dry');
        expect(navigatorMoveTargets(board, MIDDLE, 'explorer')).toContain(NORTH_WEST);
        expect(navigatorMoveTargets(board, MIDDLE, BASE)).not.toContain(NORTH_WEST);
    });

    it("does not lend a Diver their swim — that is an action the Diver spends", () => {
        const board = island({ sunk: [WEST_OF_MIDDLE] });
        // The Diver could swim here on their own turn (see above), but the
        // Navigator is spending the Navigator's action, not the Diver's.
        expect(moveTargets(board, MIDDLE, 'diver')).toContain(FAR_WEST);
        expect(navigatorMoveTargets(board, MIDDLE, 'diver')).not.toContain(FAR_WEST);
    });

    it("moves another player's pawn two tiles for one of its own actions", async () => {
        const state = baseState({
            u1: { position: TOP_TIP, role: 'navigator' },
            u2: { position: MIDDLE },
        });
        const game = makeGame(state);

        expect(await cmd('navigatorMove', { targetUserId: "u2", target: FAR_WEST }).Execute(game)).toEqual(ACCEPTED);

        expect(state.players.get("u2")!.position).toBe(FAR_WEST);
        expect(state.players.get("u1")!.position).toBe(TOP_TIP);
        // The Navigator pays; the moved player's own three are untouched, which
        // is §12's "buys actions for whoever is furthest from where they need
        // to be".
        expect(state.players.get("u1")!.actionsLeft).toBe(ACTIONS_PER_TURN - 1);
        expect(state.players.get("u2")!.actionsLeft).toBe(ACTIONS_PER_TURN);
    });

    it("logs where it put them, which is what §21.3 trades for not asking", async () => {
        const state = baseState({
            u1: { position: TOP_TIP, role: 'navigator' },
            u2: { position: MIDDLE },
        });
        const game = makeGame(state);

        await cmd('navigatorMove', { targetUserId: "u2", target: NORTH_OF_MIDDLE }).Execute(game);

        // Both seats named by token, so a rename doesn't rewrite the log and the
        // moved player can see where they were put without being asked first.
        expect(game.gameState.history[0].text).toContain('{{u1}}');
        expect(game.gameState.history[0].text).toContain('{{u2}}');
    });

    it("refuses to move a pawn further than two tiles, or onto a hole", async () => {
        const state = baseState({
            u1: { position: TOP_TIP, role: 'navigator' },
            u2: { position: MIDDLE },
        }, { sunk: [EAST_OF_MIDDLE] });
        const game = makeGame(state);

        for (const target of [FAR_EAST, EAST_OF_MIDDLE, MIDDLE]) {
            expect(await cmd('navigatorMove', { targetUserId: "u2", target }).Execute(game)).toEqual(REFUSED);
            expect(state.players.get("u2")!.position).toBe(MIDDLE);
        }
        expect(state.players.get("u1")!.actionsLeft).toBe(ACTIONS_PER_TURN);
    });

    it("refuses the whole ability to everybody else, and refuses moving yourself", async () => {
        const notNavigator = baseState({
            u1: { position: TOP_TIP, role: 'pilot' },
            u2: { position: MIDDLE },
        });
        expect(await cmd('navigatorMove', { targetUserId: "u2", target: NORTH_OF_MIDDLE })
            .Execute(makeGame(notNavigator))).toEqual(REFUSED);
        expect(notNavigator.players.get("u2")!.position).toBe(MIDDLE);

        // Their own pawn moves with Move like anybody's (§8) — never with this.
        const self = baseState({
            u1: { position: MIDDLE, role: 'navigator' },
            u2: { position: TOP_TIP },
        });
        expect(await cmd('navigatorMove', { targetUserId: "u1", target: NORTH_OF_MIDDLE })
            .Execute(makeGame(self))).toEqual(REFUSED);
        expect(self.players.get("u1")!.position).toBe(MIDDLE);
    });

    it("refuses a seat the game doesn't hold", async () => {
        const state = baseState({ u1: { position: TOP_TIP, role: 'navigator' }, u2: { position: MIDDLE } });
        expect(await cmd('navigatorMove', { targetUserId: "ghost", target: NORTH_OF_MIDDLE })
            .Execute(makeGame(state))).toEqual(REFUSED);
    });
});

// ═══════════════════════════════════════════════════════════════════════════
//  THE FORCED DISCARD (§10, §21.3)
// ═══════════════════════════════════════════════════════════════════════════
// Not a role, but the same kind of rule: a decision the app makes for a player
// who isn't there, and the one the turn-timer cron leans on
// (utils/games/turnTimeout.ts).

describe("forcedDiscard (§10, §21.3)", () => {
    it("keeps §10's specials back and lets a treasure card go instead", () => {
        // Six cards, one over the limit. "The first N in the array" — what this
        // replaced — would have thrown away the team's only Helicopter Lift,
        // which is the card §4.1's win is actually taken with.
        const hand = ['helicopterLift', 'sandbags', 'emberCrown', 'emberCrown', 'stormIdol', 'tideChalice'] as const;
        expect(forcedDiscard(hand, HAND_LIMIT)).toEqual(['stormIdol']);
    });

    it("lets go of the treasure it holds fewest of, keeping a near-capture together (§8)", () => {
        // Four Ember Crowns are one capture; the two Storm Idols are the spares.
        const hand = ['emberCrown', 'emberCrown', 'emberCrown', 'emberCrown', 'stormIdol', 'stormIdol'] as const;
        expect(forcedDiscard(hand, HAND_LIMIT)).toEqual(['stormIdol']);
    });

    it("gives up a special only when there is nothing else to give up", () => {
        const hand = ['helicopterLift', 'helicopterLift', 'sandbags', 'sandbags', 'helicopterLift', 'sandbags'] as const;
        expect(forcedDiscard(hand, HAND_LIMIT)).toHaveLength(1);
    });

    it("takes exactly the excess, and nothing at or under the limit", () => {
        const hand = ['emberCrown', 'stormIdol', 'tideChalice', 'rootStone', 'emberCrown', 'stormIdol', 'tideChalice'] as const;
        expect(forcedDiscard(hand, HAND_LIMIT)).toHaveLength(hand.length - HAND_LIMIT);
        expect(forcedDiscard(hand.slice(0, HAND_LIMIT), HAND_LIMIT)).toEqual([]);
        expect(forcedDiscard([], HAND_LIMIT)).toEqual([]);
    });

    it("reaches the same answer every time, so a replay discards the same hand", () => {
        const hand = ['stormIdol', 'emberCrown', 'helicopterLift', 'emberCrown', 'tideChalice', 'sandbags', 'rootStone'] as const;
        const once = forcedDiscard(hand, HAND_LIMIT);
        expect(forcedDiscard(hand, HAND_LIMIT)).toEqual(once);
        expect(once.every(card => card !== 'helicopterLift' && card !== 'sandbags')).toBe(true);
    });
});
