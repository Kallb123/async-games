import { describe, expect, it } from "vitest";
import { diceCitiesRecapAdapter } from "./recap";
import { BANK_TOTAL_COINS, DiceCitiesCardIds, DiceCitiesCards } from "./cards";
import { DEFAULT_DICE_CITIES_THEME } from "./themes";
import {
    DiceCitiesRequestBusinessCenterOpponentSelection,
    DiceCitiesRequestBusinessCenterOwnSelection,
    DiceCitiesRequestTvStationSelection,
} from "./DiceCitiesLogic";
import { buyCommand, passCommand, replayableGame, rollCommand, saveUpTo, sentBy } from "./testHarness";
import { buildEventFeed } from "@/utils/games/recap";
import type { ITurnSnapshot } from "@/utils/games/replay";
import type { IGameCommand, ICommandOutcome } from "@/utils/apiModels/GameLogic";
import type { IDiceCitiesGameStateResponse, IDiceCitiesPlayerStateResponse } from "./apiModels";

function player(overrides: Partial<IDiceCitiesPlayerStateResponse> & { userId: string; username: string }): IDiceCitiesPlayerStateResponse {
    return {
        cards: [],
        money: 0,
        totalCoinsEarned: 0,
        doubleUnlocked: false,
        bonusDiningAndStore: false,
        rerollDoubles: false,
        oneReroll: false,
        harbourUnlocked: false,
        lastDiceSelection: 1,
        ...overrides,
    };
}

function state(players: IDiceCitiesPlayerStateResponse[], theme = DEFAULT_DICE_CITIES_THEME.id): IDiceCitiesGameStateResponse {
    const playerStates: { [key: string]: IDiceCitiesPlayerStateResponse } = {};
    for (const p of players) playerStates[p.userId] = p;
    return {
        bankCards: [],
        bankMoney: BANK_TOTAL_COINS,
        playerStates,
        hasRolled: false,
        awaitingTSSelection: false,
        awaitingBCSelectionOwn: false,
        awaitingBCSelectionOpponent: false,
        bcSelectedOwnCard: null,
        bcSelectedOpponent: null,
        bcSelectedOpponentCard: null,
        awaitingDoubleReroll: false,
        hasReRolled: false,
        awaitingHarbourChoice: false,
        harbourRoll1: null,
        harbourRoll2: null,
        enabledDocks: false,
        theme,
    };
}

function snap(gs: IDiceCitiesGameStateResponse): ITurnSnapshot {
    return { index: 0, specificGameState: gs, currentTurn: "", complete: false, winner: "", history: [], command: null, planned: false };
}

function cmd(overrides: Partial<IGameCommand> & { className: string }): IGameCommand {
    return {
        id: "c1",
        timestamp: "2026-07-21T09:00:00.000Z",
        senderId: "u1",
        senderUsername: "Alice",
        ...overrides,
    } as unknown as IGameCommand;
}

describe("Dice Cities recap adapter", () => {
    it("turns a dice roll into a single roll event naming every player it paid, and the affected players", () => {
        const events = diceCitiesRecapAdapter.toEvents(
            snap(state([])),
            snap(state([player({ userId: "u1", username: "Alice" }), player({ userId: "u2", username: "Bob" })])),
            cmd({ className: "DiceCitiesRequestDiceRoll" }),
            { validMove: true, turnOver: false, roll1: 3, roll2: null, moneyChanges: new Map([["u1", 2], ["u2", -2]]) } as ICommandOutcome,
        );
        expect(events).toHaveLength(1);
        expect(events[0].type).toBe("dc_roll");
        expect(events[0].title).toBe("Alice rolled 3");
        expect(events[0].detail).toBe("Alice +2🪙, Bob -2🪙");
        expect(events[0].affectedIds).toEqual(["u1", "u2"]);
    });

    it("still reports an opponent's swing even when the roller's own net is zero", () => {
        // Before this, only the roller's own net was reported, so a roll that
        // steals from one opponent and hands it to another - netting the
        // roller nothing - read as "no coins" even though two purses moved.
        const events = diceCitiesRecapAdapter.toEvents(
            snap(state([])),
            snap(state([player({ userId: "u2", username: "Bob" }), player({ userId: "u3", username: "Carol" })])),
            cmd({ className: "DiceCitiesRequestDiceRoll" }),
            { validMove: true, turnOver: false, roll1: 6, roll2: null, moneyChanges: new Map([["u1", 0], ["u2", 2], ["u3", -2]]) } as ICommandOutcome,
        );
        expect(events[0].detail).toBe("Bob +2🪙, Carol -2🪙");
    });

    it("shows both dice for a double roll", () => {
        const events = diceCitiesRecapAdapter.toEvents(
            snap(state([])),
            snap(state([])),
            cmd({ className: "DiceCitiesRequestDiceRoll" }),
            { validMove: true, turnOver: false, roll1: 4, roll2: 5, moneyChanges: new Map() } as ICommandOutcome,
        );
        expect(events[0].title).toBe("Alice rolled 9 (4+5)");
        expect(events[0].detail).toBe("no coins");
    });

    it("reports landmark progress, and a win on the fourth", () => {
        const oneBuilt = diceCitiesRecapAdapter.toEvents(
            snap(state([])),
            snap(state([player({ userId: "u1", username: "Alice", doubleUnlocked: true })])),
            cmd({ className: "DiceCitiesRequestUnlockTrainStation" }),
            { validMove: true, turnOver: true } as ICommandOutcome,
        );
        expect(oneBuilt[0].type).toBe("dc_landmark");
        expect(oneBuilt[0].title).toContain("Train Station");
        expect(oneBuilt[0].detail).toBe("1/4 landmarks");

        const allFour = diceCitiesRecapAdapter.toEvents(
            snap(state([])),
            snap(state([player({ userId: "u1", username: "Alice", doubleUnlocked: true, bonusDiningAndStore: true, oneReroll: true, rerollDoubles: true })])),
            cmd({ className: "DiceCitiesRequestUnlockRadioTower" }),
            { validMove: true, turnOver: true } as ICommandOutcome,
        );
        expect(allFour[0].detail).toBe("winner!");
        expect(allFour[0].glyph).toBe("🏆");
    });

    it("names the establishment bought", () => {
        const events = diceCitiesRecapAdapter.toEvents(
            snap(state([])),
            snap(state([])),
            cmd({ className: "DiceCitiesRequestCardPurchase", cardId: DiceCitiesCardIds.CAFE } as Partial<IGameCommand> & { className: string }),
            { validMove: true, turnOver: true } as ICommandOutcome,
        );
        expect(events[0].type).toBe("dc_buy");
        expect(events[0].title).toBe("Alice bought a Cafe");
        expect(events[0].detail).toBe("2🪙");
    });

    it("stays silent for passes and unfinished mid-roll selections", () => {
        // The Business Center needs both sides to pick before it moves anything, and
        // the TV Station's victim isn't chosen until this command runs - so an
        // outcome with no steal/trade fields yet means nothing happened to report.
        for (const className of ["DiceCitiesRequestPassTurn", "DiceCitiesRequestTvStationSelection", "DiceCitiesRequestBusinessCenterOwnSelection", "DiceCitiesRequestBusinessCenterOpponentSelection"]) {
            expect(
                diceCitiesRecapAdapter.toEvents(snap(state([])), snap(state([])), cmd({ className }), { validMove: true, turnOver: false } as ICommandOutcome),
            ).toEqual([]);
        }
    });

    it("reports a TV Station steal once the victim is chosen", () => {
        const events = diceCitiesRecapAdapter.toEvents(
            snap(state([])),
            snap(state([player({ userId: "u2", username: "Bob" })])),
            cmd({ className: "DiceCitiesRequestTvStationSelection" }),
            { validMove: true, turnOver: true, stolenFromId: "u2", stolenAmount: 5 } as ICommandOutcome,
        );
        expect(events).toHaveLength(1);
        expect(events[0].type).toBe("dc_tvsteal");
        expect(events[0].title).toBe("Alice used the TV Station to steal from Bob");
        expect(events[0].detail).toBe("5🪙");
        expect(events[0].affectedIds).toEqual(["u1", "u2"]);
    });

    it("reports a Business Center trade, whichever selection command completes it", () => {
        const nextState = snap(state([player({ userId: "u2", username: "Bob" })]));
        for (const className of ["DiceCitiesRequestBusinessCenterOwnSelection", "DiceCitiesRequestBusinessCenterOpponentSelection"]) {
            const events = diceCitiesRecapAdapter.toEvents(
                snap(state([])),
                nextState,
                cmd({ className }),
                {
                    validMove: true,
                    turnOver: true,
                    tradedWithId: "u2",
                    gaveCardId: DiceCitiesCardIds.CAFE,
                    receivedCardId: DiceCitiesCardIds.BAKERY,
                } as ICommandOutcome,
            );
            expect(events).toHaveLength(1);
            expect(events[0].type).toBe("dc_bctrade");
            expect(events[0].title).toContain("Bob's");
            expect(events[0].title).toContain("Business Center");
            expect(events[0].detail).toContain("Cafe");
            expect(events[0].affectedIds).toEqual(["u1", "u2"]);
        }
    });

    it("calls out stolen property in the summary before a generic dice swing", () => {
        const stolen = diceCitiesRecapAdapter.summarize(
            [
                { id: "1", commandId: "1", timestamp: "", actorId: "u2", actorUsername: "Bob", type: "dc_roll", title: "", affectedIds: ["u1"] },
                { id: "2", commandId: "2", timestamp: "", actorId: "u2", actorUsername: "Bob", type: "dc_bctrade", title: "", affectedIds: ["u2", "u1"] },
            ],
            "u1",
        );
        expect(stolen.subline).toContain("made off with your property");
    });

    it("holds the roll's beat back while the Harbour's offer is unanswered", () => {
        // The roll has paid nobody yet, so reporting it would show a payout of
        // nothing. The command that settles the total carries the beat instead.
        const parked = { ...state([player({ userId: "u1", username: "Alice", harbourUnlocked: true })]), awaitingHarbourChoice: true };
        for (const className of ["DiceCitiesRequestDiceRoll", "DiceCitiesRequestRadioTowerReroll"]) {
            expect(
                diceCitiesRecapAdapter.toEvents(
                    snap(state([])),
                    snap(parked),
                    cmd({ className }),
                    { validMove: true, turnOver: false, roll1: 5, roll2: 6, moneyChanges: new Map() } as ICommandOutcome,
                ),
            ).toEqual([]);
        }
    });

    it("tells the whole story on the roll the Harbour's bonus settles", () => {
        const events = diceCitiesRecapAdapter.toEvents(
            snap(state([])),
            snap(state([player({ userId: "u1", username: "Alice" })])),
            cmd({ className: "DiceCitiesRequestHarbourBonus", addBonus: true } as Partial<IGameCommand> & { className: string }),
            { validMove: true, turnOver: false, roll1: 5, roll2: 6, moneyChanges: new Map([["u1", 4]]) } as ICommandOutcome,
        );
        expect(events).toHaveLength(1);
        expect(events[0].title).toBe("Alice rolled 11 (5+6), Harbour +2 → 13");
        expect(events[0].glyph).toBe("⚓");
        expect(events[0].detail).toBe("Alice +4🪙");
    });

    it("reports a declined bonus as the plain roll it stayed", () => {
        const events = diceCitiesRecapAdapter.toEvents(
            snap(state([])),
            snap(state([])),
            cmd({ className: "DiceCitiesRequestHarbourBonus", addBonus: false } as Partial<IGameCommand> & { className: string }),
            { validMove: true, turnOver: false, roll1: 5, roll2: 6, moneyChanges: new Map() } as ICommandOutcome,
        );
        expect(events[0].title).toBe("Alice rolled 11 (5+6)");
        expect(events[0].glyph).toBe("🎲");
    });

    it("gives the Harbour its own build event, outside the landmark race", () => {
        const events = diceCitiesRecapAdapter.toEvents(
            snap(state([])),
            snap(state([player({ userId: "u1", username: "Alice", harbourUnlocked: true })])),
            cmd({ className: "DiceCitiesRequestUnlockHarbour" }),
            { validMove: true, turnOver: true } as ICommandOutcome,
        );
        expect(events).toHaveLength(1);
        expect(events[0].type).toBe("dc_harbour");
        expect(events[0].title).toBe("Alice built the Harbour");
        // Not "1/4 landmarks": the Harbour never counts toward the win.
        expect(events[0].detail).toBe("+2 on a 10 or better");
    });

    // The recap is rebuilt from a replayed game, so it is the one screen that
    // could name a card from the base table and never be noticed - the board it
    // is describing has long since gone. Every name in a row comes from the
    // theme the game was actually played in.
    it("names a wasteland game's cards the way its board did", () => {
        const wasteland = state([player({ userId: "u2", username: "Bob" })], "wasteland");
        const events = diceCitiesRecapAdapter.toEvents(
            snap(state([], "wasteland")),
            snap(wasteland),
            cmd({ className: "DiceCitiesRequestBusinessCenterOwnSelection" }),
            {
                validMove: true,
                turnOver: true,
                tradedWithId: "u2",
                gaveCardId: DiceCitiesCardIds.CAFE,
                receivedCardId: DiceCitiesCardIds.BAKERY,
            } as ICommandOutcome,
        );
        expect(events[0].title).toContain("Barter Exchange");
        expect(events[0].title).toContain("Snackcake Bakery");
        expect(events[0].detail).toContain("Roadside Diner");

        // And the nouns around them: a roll that paid nobody says so in caps.
        const quiet = diceCitiesRecapAdapter.toEvents(
            snap(state([], "wasteland")),
            snap(wasteland),
            cmd({ className: "DiceCitiesRequestDiceRoll" }),
            { validMove: true, turnOver: false, roll1: 3, roll2: null, moneyChanges: new Map() } as ICommandOutcome,
        );
        expect(quiet[0].detail).toBe("no caps");

        // The tip is handed the live state, so it reads the theme from there.
        const tip = diceCitiesRecapAdapter.tip!(state([player({ userId: "u1", username: "Alice", money: 5 })], "wasteland"), "u1");
        expect(tip?.text).toContain("Vault Door");
    });

    it("tips the viewer toward the cheapest landmark they can afford", () => {
        const canAfford = diceCitiesRecapAdapter.tip!(state([player({ userId: "u1", username: "Alice", money: 5 })]), "u1");
        expect(canAfford?.text).toContain("Train Station");
        expect(canAfford?.text).toContain("enough");

        const cannotAfford = diceCitiesRecapAdapter.tip!(state([player({ userId: "u1", username: "Alice", money: 1 })]), "u1");
        expect(cannotAfford?.text).toContain("save 3 more");
    });
});

// The tests above hand the adapter an outcome directly. These replay a real
// command log instead, because that is the only thing that proves a steal
// survives the round trip the live recap actually makes: a game is rebuilt
// from its opening and every command re-executed, so a robbery only reaches
// the victim if the command that did it still replays as a valid move and
// still reports who it took from. Nothing about it is stored on the game, so
// an existing game picks these rows up on its next recap — there is no
// "played before this shipped" version of a Dice Cities game to miss out.
describe("Dice Cities recap, replayed from a real command log", () => {
    it("tells the victim the TV Station took their coins while they were away", async () => {
        const steal = sentBy(new DiceCitiesRequestTvStationSelection(), "u2");
        steal.selectedUser = "u1";
        steal.selectedUserName = "u1";

        const game = replayableGame([
            ...saveUpTo(DiceCitiesCards[DiceCitiesCardIds.TV_STATION].cost, "u2", "u1"),
            rollCommand(1, "u2"), buyCommand(DiceCitiesCardIds.TV_STATION, "u2"),
            rollCommand(1, "u1"), passCommand("u1"),
            // The TV Station pays out on a 6, on its owner's own turn.
            rollCommand(6, "u2"), steal, passCommand("u2"),
        ]);

        const feed = await buildEventFeed(game, { u1: "Alice", u2: "Bob" }, "u1");
        const stolen = feed.events.find(e => e.type === "dc_tvsteal");
        expect(stolen?.title).toBe("Bob used the TV Station to steal from Alice");
        expect(stolen?.detail).toBe("5🪙");
        expect(stolen?.affectedIds).toContain("u1");
        expect(feed.summary?.subline).toContain("made off with your property");
    });

    it("tells the victim which card the Business Center took, and what it left", async () => {
        const own = sentBy(new DiceCitiesRequestBusinessCenterOwnSelection(), "u2");
        own.selectedCard = DiceCitiesCardIds.WHEAT_FIELD;
        const opponent = sentBy(new DiceCitiesRequestBusinessCenterOpponentSelection(), "u2");
        opponent.selectedUser = "u1";
        opponent.selectedCard = DiceCitiesCardIds.BAKERY;

        const game = replayableGame([
            ...saveUpTo(DiceCitiesCards[DiceCitiesCardIds.BUSINESS_CENTER].cost, "u2", "u1"),
            rollCommand(1, "u2"), buyCommand(DiceCitiesCardIds.BUSINESS_CENTER, "u2"),
            rollCommand(1, "u1"), passCommand("u1"),
            rollCommand(6, "u2"), own, opponent, passCommand("u2"),
        ]);

        const feed = await buildEventFeed(game, { u1: "Alice", u2: "Bob" }, "u1");
        const traded = feed.events.find(e => e.type === "dc_bctrade");
        expect(traded?.title).toBe("Bob used the Business Center to steal Alice's Bakery");
        expect(traded?.detail).toBe("gave a Wheat Field for it");
        expect(traded?.affectedIds).toContain("u1");
    });
});
