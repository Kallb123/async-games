import { describe, expect, it } from "vitest";
import {
    DiceCitiesGameType,
    DiceCitiesRequestCardPurchase,
    DiceCitiesRequestDiceRoll,
    DiceCitiesRequestHarbourBonus,
    DiceCitiesRequestPassTurn,
    DiceCitiesRequestRadioTowerReroll,
    DiceCitiesRequestTvStationSelection,
    DiceCitiesRequestUnlockAmusementPark,
    DiceCitiesRequestUnlockHarbour,
    DiceCitiesRequestUnlockRadioTower,
    DiceCitiesRequestUnlockTrainStation,
} from "./DiceCitiesLogic";
import { LANDMARKS } from "./ui";
import type { IDiceCitiesDiceRollOutcome } from "./DiceCitiesLogic";
import { BANK_TOTAL_COINS, DiceCitiesCardIds, DiceCitiesCards, DOCKS_ESTABLISHMENT_IDS, STARTING_PLAYER_COINS } from "./cards";
import { buildInitialDiceCitiesState } from "./DiceCitiesModels";
import type { IDiceCitiesGameData, IDiceCitiesGameState, IDiceCitiesPlayerState } from "./DiceCitiesModels";
import type { IDiceCitiesGameStateResponse } from "./apiModels";
import type { IGameData } from "@/utils/mongodb/GameData";
import { buildTimeline } from "@/utils/games/replay";

// ─── Minimal in-memory game harness ────────────────────────────────────────
// The bank only cares about coins moving, so these states carry just the cards
// and balances each test needs rather than a full opening setup.

function player(overrides: Partial<IDiceCitiesPlayerState> = {}): IDiceCitiesPlayerState {
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

function makeState(overrides: Partial<IDiceCitiesGameState> = {}): IDiceCitiesGameState {
    return {
        bankCards: [{ card: DiceCitiesCardIds.CAFE, amount: 6 }],
        bankMoney: BANK_TOTAL_COINS,
        bankTotal: BANK_TOTAL_COINS,
        playerStates: new Map([["u1", player()], ["u2", player()]]),
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
        ...overrides,
    };
}

function makeGame(gs: IDiceCitiesGameState, currentTurn = "u1"): IDiceCitiesGameData {
    return {
        currentTurn,
        userIdList: ["u1", "u2"],
        gameState: { turnOrder: ["u1", "u2"], history: [], commandHistory: [] },
        specificGameState: gs,
        complete: false,
        winner: "",
    } as unknown as IDiceCitiesGameData;
}

// The bank plus every player's purse: with a fixed coin supply this must hold
// steady no matter what the dice do.
function coinsInPlay(gs: IDiceCitiesGameState): number {
    let total = gs.bankMoney;
    gs.playerStates.forEach(ps => { total += ps.money; });
    return total;
}

// A roll with its dice pre-recorded, so payouts are deterministic. Passing a
// second die rolls two, which the Docks' higher numbers need.
function rollCommand(roll1: number, sender = "u1", roll2?: number): DiceCitiesRequestDiceRoll {
    const command = new DiceCitiesRequestDiceRoll();
    command.senderId = sender;
    command.senderUsername = sender;
    command.recordedRoll1 = roll1;
    if (roll2 !== undefined) {
        command.doubleDice = true;
        command.recordedRoll2 = roll2;
    }
    return command;
}

// Answers the Harbour's offer on a parked roll, with the shared tuna die
// pre-recorded so a Tuna Boat payout is deterministic too.
function harbourCommand(addBonus: boolean, tunaRoll?: number): DiceCitiesRequestHarbourBonus {
    const command = new DiceCitiesRequestHarbourBonus();
    command.senderId = "u1";
    command.senderUsername = "u1";
    command.addBonus = addBonus;
    command.recordedTunaRoll = tunaRoll ?? null;
    return command;
}

function cards(cardId: string, amount = 1) {
    return [{ card: cardId, amount }];
}

describe("Dice Cities bank supply", () => {
    it("deals the players' starting coins out of the bank's fixed supply", () => {
        for (const playerCount of [2, 3, 4]) {
            const userIdList = Array.from({ length: playerCount }, (_, i) => `u${i}`);
            const gs = buildInitialDiceCitiesState(userIdList);
            expect(gs.bankMoney).toBe(BANK_TOTAL_COINS - (STARTING_PLAYER_COINS * playerCount));
            expect(coinsInPlay(gs)).toBe(BANK_TOTAL_COINS);
        }
    });

    it("brings the Docks' own coins to the supply, and records the total", () => {
        // The boxed figures, written out rather than referred back to the
        // constants: the base box holds 262 (42 ones, 24 fives, 10 tens) and
        // the Docks adds 240 (12 twenties), for 502. Asserting the constants
        // against themselves would pass whatever they were changed to.
        const base = buildInitialDiceCitiesState(["u1", "u2"], false);
        const docks = buildInitialDiceCitiesState(["u1", "u2"], true);

        expect(base.bankTotal).toBe(262);
        expect(docks.bankTotal).toBe(502);
        expect(coinsInPlay(base)).toBe(262);
        expect(coinsInPlay(docks)).toBe(502);
    });

    it("deals from the supply it is handed, so a replay rebuilds the old bank", () => {
        // Games created before the supply matched the boxed game were played
        // with 60. Replay passes that back in rather than today's constant.
        const legacy = buildInitialDiceCitiesState(["u1", "u2"], false, 60);
        expect(legacy.bankTotal).toBe(60);
        expect(legacy.bankMoney).toBe(60 - (STARTING_PLAYER_COINS * 2));
        expect(coinsInPlay(legacy)).toBe(60);
    });

    it("pays dice-roll income out of the bank", async () => {
        // Wheat Field pays 1 on a roll of 1, on anyone's turn.
        const gs = makeState({ playerStates: new Map([["u1", player({ cards: cards(DiceCitiesCardIds.WHEAT_FIELD) })], ["u2", player()]]) });
        const game = makeGame(gs);

        await rollCommand(1).Execute(game);

        expect(gs.playerStates.get("u1")!.money).toBe(1);
        expect(gs.bankMoney).toBe(BANK_TOTAL_COINS - 1);
        expect(coinsInPlay(gs)).toBe(BANK_TOTAL_COINS);
    });

    it("pays what's left rather than coins that don't exist, and says so", async () => {
        // The Mine pays 5 on a roll of 9, but the bank only holds 2.
        const gs = makeState({
            bankMoney: 2,
            playerStates: new Map([["u1", player({ cards: cards(DiceCitiesCardIds.MINE) })], ["u2", player()]]),
        });
        const game = makeGame(gs);

        await rollCommand(9).Execute(game);

        const roller = gs.playerStates.get("u1")!;
        expect(roller.money).toBe(2);
        expect(roller.totalCoinsEarned).toBe(2);
        expect(gs.bankMoney).toBe(0);
        expect(game.gameState.history.some(h => h.text.includes("The bank ran out of coins - 3 coins"))).toBe(true);
    });

    it("pays nothing at all once the bank is empty", async () => {
        const gs = makeState({
            bankMoney: 0,
            playerStates: new Map([["u1", player({ cards: cards(DiceCitiesCardIds.MINE) })], ["u2", player()]]),
        });
        const game = makeGame(gs);

        await rollCommand(9).Execute(game);

        expect(gs.playerStates.get("u1")!.money).toBe(0);
        expect(gs.bankMoney).toBe(0);
    });

    it("leaves the bank alone when coins only move between players", async () => {
        // The opponent's Cafe takes 1 coin from whoever rolled a 3.
        const gs = makeState({
            bankMoney: 10,
            playerStates: new Map([
                ["u1", player({ money: 4 })],
                ["u2", player({ money: 0, cards: cards(DiceCitiesCardIds.CAFE) })],
            ]),
        });
        const game = makeGame(gs);

        await rollCommand(3).Execute(game);

        expect(gs.playerStates.get("u1")!.money).toBe(3);
        expect(gs.playerStates.get("u2")!.money).toBe(1);
        expect(gs.bankMoney).toBe(10);
    });

    it("never lets a steal hand over coins the target doesn't have", async () => {
        const gs = makeState({
            bankMoney: 10,
            awaitingTSSelection: true,
            playerStates: new Map([["u1", player()], ["u2", player({ money: 2 })]]),
        });
        const game = makeGame(gs);
        const command = new DiceCitiesRequestTvStationSelection();
        command.senderId = "u1";
        command.senderUsername = "u1";
        command.selectedUser = "u2";

        await command.Execute(game);

        // TV Station takes 5, but the target only has 2 to give.
        expect(gs.playerStates.get("u1")!.money).toBe(2);
        expect(gs.playerStates.get("u2")!.money).toBe(0);
        expect(coinsInPlay(gs)).toBe(12);
    });

    it("returns the coins spent on an establishment to the bank", async () => {
        const gs = makeState({
            bankMoney: 0,
            hasRolled: true,
            playerStates: new Map([["u1", player({ money: 5 })], ["u2", player()]]),
        });
        const game = makeGame(gs);
        const command = new DiceCitiesRequestCardPurchase();
        command.senderId = "u1";
        command.senderUsername = "u1";
        command.cardId = DiceCitiesCardIds.CAFE;

        await command.Execute(game);

        const cost = DiceCitiesCards[DiceCitiesCardIds.CAFE].cost;
        expect(gs.playerStates.get("u1")!.money).toBe(5 - cost);
        expect(gs.bankMoney).toBe(cost);
        expect(coinsInPlay(gs)).toBe(5);
    });

    it("returns the coins spent on a landmark to the bank", async () => {
        const gs = makeState({
            bankMoney: 0,
            hasRolled: true,
            playerStates: new Map([["u1", player({ money: 6 })], ["u2", player()]]),
        });
        const game = makeGame(gs);
        const command = new DiceCitiesRequestUnlockTrainStation();
        command.senderId = "u1";
        command.senderUsername = "u1";

        await command.Execute(game);

        const cost = DiceCitiesCards[DiceCitiesCardIds.TRAIN_STATION].cost;
        expect(gs.playerStates.get("u1")!.doubleUnlocked).toBe(true);
        expect(gs.playerStates.get("u1")!.money).toBe(6 - cost);
        expect(gs.bankMoney).toBe(cost);
        expect(coinsInPlay(gs)).toBe(6);
    });

    it("hands a discarded roll's coins back to the bank on a Radio Tower re-roll", async () => {
        const gs = makeState({
            bankMoney: 10,
            playerStates: new Map([
                ["u1", player({ oneReroll: true, cards: cards(DiceCitiesCardIds.APPLE_ORCHARD) })],
                ["u2", player()],
            ]),
        });
        const game = makeGame(gs);

        // Apple Orchard pays 3 on a 10; the re-roll lands on a 1 and pays nothing.
        const roll = rollCommand(10);
        await roll.Execute(game);
        game.gameState.commandHistory.push(roll);
        expect(gs.playerStates.get("u1")!.money).toBe(3);
        expect(gs.bankMoney).toBe(7);

        const reroll = new DiceCitiesRequestRadioTowerReroll();
        reroll.senderId = "u1";
        reroll.senderUsername = "u1";
        reroll.recordedRoll1 = 1;
        await reroll.Execute(game);

        const roller = gs.playerStates.get("u1")!;
        expect(roller.money).toBe(0);
        expect(roller.totalCoinsEarned).toBe(0);
        expect(gs.bankMoney).toBe(10);
        expect(coinsInPlay(gs)).toBe(10);
    });

    it("reverses a roll recorded the way Mongo stores it", async () => {
        const gs = makeState({
            bankMoney: 10,
            playerStates: new Map([["u1", player({ cards: cards(DiceCitiesCardIds.APPLE_ORCHARD) })], ["u2", player()]]),
        });
        const game = makeGame(gs);
        const roll = rollCommand(10);
        await roll.Execute(game);

        // Persisted commands come back with their Maps flattened to plain objects.
        const stored = Object.assign(new DiceCitiesRequestDiceRoll(), {
            ...roll,
            moneyChanges: Object.fromEntries(roll.moneyChanges),
            coinsEarnedChanges: Object.fromEntries(roll.coinsEarnedChanges),
        });
        stored.Undo(game);

        expect(gs.playerStates.get("u1")!.money).toBe(0);
        expect(gs.bankMoney).toBe(10);
    });
});

// A card's rollNumber is the list of totals it activates on. Writing a range as
// one number ("11.12") reads fine but matches nothing, so the card silently
// never pays - which is exactly what the Fruit and Vegetable Market did.
describe("Dice Cities landmarks", () => {
    // The market draws a buy row per LANDMARKS entry, prices it from `cardId`
    // and dispatches the command keyed by `flag`. If the table pairs a card
    // with the flag some *other* landmark's command lights, that row charges
    // one price and builds the other thing - which is how the Amusement Park
    // came to send the Radio Tower's command and be refused for costing 22.
    it.each([
        ["Amusement Park", DiceCitiesCardIds.AMUSEMENT_PARK, DiceCitiesRequestUnlockAmusementPark],
        ["Radio Tower", DiceCitiesCardIds.RADIO_TOWER, DiceCitiesRequestUnlockRadioTower],
        ["Train Station", DiceCitiesCardIds.TRAIN_STATION, DiceCitiesRequestUnlockTrainStation],
    ])("%s lights the flag LANDMARKS pairs it with", async (_name, cardId, Command) => {
        const entry = LANDMARKS.find(l => l.cardId === cardId)!;
        const gs = makeState({
            hasRolled: true,
            playerStates: new Map([["u1", player({ money: 40 })], ["u2", player()]]),
        });
        const game = makeGame(gs);

        const command = new Command();
        command.senderId = "u1";
        command.senderUsername = "u1";
        const outcome = await command.Execute(game);

        expect(outcome.validMove).toBe(true);
        expect(gs.playerStates.get("u1")![entry.flag]).toBe(true);
        // Charged the price its own buy row advertises, not another card's.
        expect(gs.playerStates.get("u1")!.money).toBe(40 - DiceCitiesCards[cardId].cost);
    });

    it("gives the Amusement Park's owner another turn on doubles", async () => {
        const gs = makeState({
            playerStates: new Map([
                ["u1", player({ doubleUnlocked: true, rerollDoubles: true })],
                ["u2", player()],
            ]),
        });
        const game = makeGame(gs);
        const gameType = new DiceCitiesGameType();

        const roll = rollCommand(3, "u1", 3);
        const outcome = await roll.Execute(game);
        expect(gs.awaitingDoubleReroll).toBe(true);

        gameType.CheckEndTurn(game, { ...outcome, turnOver: true });
        expect(game.currentTurn).toBe("u1");
        expect(gs.hasRolled).toBe(false);
    });

    it("does not give the Radio Tower's owner an extra turn on doubles", async () => {
        const gs = makeState({
            playerStates: new Map([
                ["u1", player({ doubleUnlocked: true, oneReroll: true })],
                ["u2", player()],
            ]),
        });
        const game = makeGame(gs);
        const gameType = new DiceCitiesGameType();

        const roll = rollCommand(3, "u1", 3);
        const outcome = await roll.Execute(game);
        expect(gs.awaitingDoubleReroll).toBe(false);

        gameType.CheckEndTurn(game, { ...outcome, turnOver: true });
        expect(game.currentTurn).toBe("u2");
    });
});

describe("Dice Cities activation numbers", () => {
    it("pays the Fruit and Vegetable Market on both of its numbers", async () => {
        for (const [die1, die2] of [[5, 6], [6, 6]]) {
            const gs = makeState({
                playerStates: new Map([
                    ["u1", player({
                        doubleUnlocked: true,
                        cards: [
                            { card: DiceCitiesCardIds.FRUIT_MARKET, amount: 1 },
                            { card: DiceCitiesCardIds.WHEAT_FIELD, amount: 1 },
                            { card: DiceCitiesCardIds.APPLE_ORCHARD, amount: 1 },
                        ],
                    })],
                    ["u2", player()],
                ]),
            });

            await rollCommand(die1, "u1", die2).Execute(makeGame(gs));

            // 2 coins for each of the two Farm establishments owned.
            expect(gs.playerStates.get("u1")!.money).toBe(4);
        }
    });

    it("gives every card a whole number to activate on", () => {
        for (const card of Object.values(DiceCitiesCards)) {
            expect(card.rollNumber.every(Number.isInteger)).toBe(true);
        }
    });
});

describe("Dice Cities: the Docks", () => {
    it("stocks the expansion's establishments only when it is switched on", () => {
        const withDocks = buildInitialDiceCitiesState(["u1", "u2"], true).bankCards.map(cc => cc.card);
        const withoutDocks = buildInitialDiceCitiesState(["u1", "u2"], false).bankCards.map(cc => cc.card);

        for (const cardId of DOCKS_ESTABLISHMENT_IDS) {
            expect(withDocks).toContain(cardId);
            expect(withoutDocks).not.toContain(cardId);
        }
        // The Harbour is built like a landmark, never bought off the market.
        expect(withDocks).not.toContain(DiceCitiesCardIds.HARBOUR);
    });

    it("leaves the sea cards idle until their owner has built the Harbour", async () => {
        // The Sushi Bar takes 3 coins from whoever rolls a 1 - but only for an
        // owner with a Harbour to land the catch at.
        const dry = makeState({
            playerStates: new Map([
                ["u1", player({ money: 5 })],
                ["u2", player({ cards: cards(DiceCitiesCardIds.SUSHI_BAR) })],
            ]),
            enabledDocks: true,
        });
        await rollCommand(1).Execute(makeGame(dry, "u1"));
        expect(dry.playerStates.get("u2")!.money).toBe(0);

        const withHarbour = makeState({
            playerStates: new Map([
                ["u1", player({ money: 5 })],
                ["u2", player({ cards: cards(DiceCitiesCardIds.SUSHI_BAR), harbourUnlocked: true })],
            ]),
            enabledDocks: true,
        });
        await rollCommand(1).Execute(makeGame(withHarbour, "u1"));
        expect(withHarbour.playerStates.get("u2")!.money).toBe(3);
        expect(withHarbour.playerStates.get("u1")!.money).toBe(2);
    });

    it("parks a 10-or-better roll until the Harbour's owner answers, paying nobody yet", async () => {
        const gs = makeState({
            playerStates: new Map([
                ["u1", player({ harbourUnlocked: true, doubleUnlocked: true, cards: cards(DiceCitiesCardIds.APPLE_ORCHARD) })],
                ["u2", player()],
            ]),
            enabledDocks: true,
        });
        const game = makeGame(gs, "u1");

        await rollCommand(4, "u1", 6).Execute(game);

        expect(gs.awaitingHarbourChoice).toBe(true);
        expect(gs.hasRolled).toBe(false);
        expect(gs.harbourRoll1).toBe(4);
        expect(gs.harbourRoll2).toBe(6);
        // harbourRoll1/2 go to every player unredacted, which is only safe
        // because the log already carries the same dice. Deferring this line
        // until the choice settles - the way the recap defers its event - would
        // quietly make the parked state the only thing holding an unsettled
        // roll, still sent to opponents and drawn on nobody's screen but the
        // roller's. Assert the two stay coupled.
        expect(game.gameState.history.some(h => h.text.includes("rolled a 10 (4 and 6)"))).toBe(true);
        // The Apple Orchard's 10 hasn't paid yet - the total isn't settled.
        expect(gs.playerStates.get("u1")!.money).toBe(0);

        await harbourCommand(false).Execute(game);

        expect(gs.awaitingHarbourChoice).toBe(false);
        expect(gs.harbourRoll1).toBeNull();
        expect(gs.hasRolled).toBe(true);
        expect(gs.playerStates.get("u1")!.money).toBe(3);
    });

    it("adds the Harbour's bonus to reach the numbers two dice can't", async () => {
        // A Food Warehouse pays 2 per Dining establishment on a 12 or 13, and 13
        // is only reachable by nudging an 11 up.
        const gs = makeState({
            playerStates: new Map([
                ["u1", player({
                    harbourUnlocked: true,
                    doubleUnlocked: true,
                    cards: [
                        { card: DiceCitiesCardIds.FOOD_WAREHOUSE, amount: 1 },
                        { card: DiceCitiesCardIds.CAFE, amount: 2 },
                    ],
                })],
                ["u2", player()],
            ]),
            enabledDocks: true,
        });
        const game = makeGame(gs, "u1");

        await rollCommand(5, "u1", 6).Execute(game);
        await harbourCommand(true).Execute(game);

        expect(gs.playerStates.get("u1")!.money).toBe(4);
        expect(game.gameState.history.some(h => h.text.includes("turn a 11 into a 13"))).toBe(true);
    });

    it("pays every Tuna Boat owner the same shared haul", async () => {
        const gs = makeState({
            bankMoney: 20,
            playerStates: new Map([
                ["u1", player({ harbourUnlocked: true, doubleUnlocked: true, cards: cards(DiceCitiesCardIds.TUNA_BOAT) })],
                ["u2", player({ harbourUnlocked: true, cards: cards(DiceCitiesCardIds.TUNA_BOAT) })],
            ]),
            enabledDocks: true,
        });
        const game = makeGame(gs, "u1");

        await rollCommand(6, "u1", 6).Execute(game);
        // The haul is a single shared die: 4 for the roller and 4 for the
        // opponent, out of one throw.
        await harbourCommand(false, 4).Execute(game);

        expect(gs.playerStates.get("u1")!.money).toBe(4);
        expect(gs.playerStates.get("u2")!.money).toBe(4);
        expect(gs.bankMoney).toBe(12);
        expect(game.gameState.history.some(h => h.text.includes("The tuna haul was 4"))).toBe(true);
    });

    it("throws the tuna haul on two dice, not one", async () => {
        // 2-12 with a peak at 7, as in the boxed game. A single die could never
        // pay more than 6, so a haul above that falsifies the old rule outright.
        // The roller has no Harbour, so a 12 is not parked and pays out at once.
        const hauls = new Set<number>();
        for (let i = 0; i < 200; i++) {
            const gs = makeState({
                bankMoney: 40,
                playerStates: new Map([
                    ["u1", player({ doubleUnlocked: true })],
                    ["u2", player({ harbourUnlocked: true, cards: cards(DiceCitiesCardIds.TUNA_BOAT) })],
                ]),
                enabledDocks: true,
            });
            const outcome = await rollCommand(6, "u1", 6).Execute(makeGame(gs, "u1")) as IDiceCitiesDiceRollOutcome;
            hauls.add(outcome.tunaRoll!);
        }

        expect(Math.min(...hauls)).toBeGreaterThanOrEqual(2);
        expect(Math.max(...hauls)).toBeLessThanOrEqual(12);
        // Over 200 throws this is certain for 2d6 and impossible for 1d6.
        expect(Math.max(...hauls)).toBeGreaterThan(6);
    });

    it("only offers the Harbour's bonus to a Harbour owner", async () => {
        const gs = makeState({
            playerStates: new Map([
                ["u1", player({ doubleUnlocked: true, cards: cards(DiceCitiesCardIds.APPLE_ORCHARD) })],
                ["u2", player()],
            ]),
            enabledDocks: true,
        });
        const game = makeGame(gs, "u1");

        await rollCommand(4, "u1", 6).Execute(game);

        expect(gs.awaitingHarbourChoice).toBe(false);
        expect(gs.hasRolled).toBe(true);
        expect(gs.playerStates.get("u1")!.money).toBe(3);
    });

    it("sells the Harbour only in a game that has the Docks", async () => {
        const build = async (enabledDocks: boolean) => {
            const gs = makeState({
                bankMoney: 0,
                hasRolled: true,
                playerStates: new Map([["u1", player({ money: 5 })], ["u2", player()]]),
                enabledDocks,
            });
            const command = new DiceCitiesRequestUnlockHarbour();
            command.senderId = "u1";
            command.senderUsername = "u1";
            const outcome = await command.Execute(makeGame(gs, "u1"));
            return { gs, outcome };
        };

        const off = await build(false);
        expect(off.outcome.validMove).toBe(false);
        expect(off.gs.playerStates.get("u1")!.harbourUnlocked).toBe(false);

        const on = await build(true);
        const cost = DiceCitiesCards[DiceCitiesCardIds.HARBOUR].cost;
        expect(on.outcome.validMove).toBe(true);
        expect(on.gs.playerStates.get("u1")!.harbourUnlocked).toBe(true);
        expect(on.gs.playerStates.get("u1")!.money).toBe(5 - cost);
        expect(on.gs.bankMoney).toBe(cost);
    });

    it("hands a Harbour-settled roll's coins back on a Radio Tower re-roll", async () => {
        const gs = makeState({
            bankMoney: 10,
            playerStates: new Map([
                ["u1", player({ harbourUnlocked: true, doubleUnlocked: true, cards: cards(DiceCitiesCardIds.APPLE_ORCHARD) })],
                ["u2", player()],
            ]),
            enabledDocks: true,
        });
        const game = makeGame(gs, "u1");

        const roll = rollCommand(4, "u1", 6);
        await roll.Execute(game);
        game.gameState.commandHistory.push(roll);
        const harbour = harbourCommand(false);
        await harbour.Execute(game);
        game.gameState.commandHistory.push(harbour);
        expect(gs.playerStates.get("u1")!.money).toBe(3);

        // The re-roll reverses the Harbour bonus command, since that's what paid.
        const reroll = new DiceCitiesRequestRadioTowerReroll();
        reroll.senderId = "u1";
        reroll.senderUsername = "u1";
        reroll.recordedRoll1 = 1;
        reroll.recordedRoll2 = 2;
        await reroll.Execute(game);

        expect(gs.playerStates.get("u1")!.money).toBe(0);
        expect(gs.playerStates.get("u1")!.totalCoinsEarned).toBe(0);
        expect(gs.bankMoney).toBe(10);
        expect(coinsInPlay(gs)).toBe(10);
    });

    it("pays the Flower Shop a coin for each Flower Orchard its owner holds", async () => {
        // The Shop's whole rule is the multiplier: three Orchards, three coins.
        // It names the Flower Orchard by cardId, so it never counts itself and
        // never counts the other farms.
        const gs = makeState({
            bankMoney: 20,
            playerStates: new Map([
                ["u1", player({
                    cards: [
                        { card: DiceCitiesCardIds.FLOWER_SHOP, amount: 1 },
                        { card: DiceCitiesCardIds.FLOWER_ORCHARD, amount: 3 },
                    ],
                })],
                ["u2", player()],
            ]),
            enabledDocks: true,
        });
        const game = makeGame(gs, "u1");

        await rollCommand(6).Execute(game);

        expect(gs.playerStates.get("u1")!.money).toBe(3);
        expect(gs.bankMoney).toBe(17);
    });

    it("counts a Flower Orchard as a farm for the Fruit and Vegetable Market", async () => {
        // The Orchard carries the grain icon in the boxed game, so the Market
        // pays for it like any other farm - 2 each for the Wheat Field and the
        // Orchard. Neither of those activates on 11, so the Market is the only
        // card paying here.
        const gs = makeState({
            bankMoney: 20,
            playerStates: new Map([
                ["u1", player({
                    doubleUnlocked: true,
                    cards: [
                        { card: DiceCitiesCardIds.FRUIT_MARKET, amount: 1 },
                        { card: DiceCitiesCardIds.WHEAT_FIELD, amount: 1 },
                        { card: DiceCitiesCardIds.FLOWER_ORCHARD, amount: 1 },
                    ],
                })],
                ["u2", player()],
            ]),
            enabledDocks: true,
        });
        const game = makeGame(gs, "u1");

        await rollCommand(5, "u1", 6).Execute(game);

        expect(gs.playerStates.get("u1")!.money).toBe(4);
    });

    it("lets the Shopping Mall reach a card paid by a multiplier", async () => {
        // The Mall adds a coin to a store card every time it activates. The
        // Flower Shop is a store, so two Orchards pay 2, and 3 with the Mall.
        const build = async (bonusDiningAndStore: boolean) => {
            const gs = makeState({
                bankMoney: 20,
                playerStates: new Map([
                    ["u1", player({
                        bonusDiningAndStore,
                        cards: [
                            { card: DiceCitiesCardIds.FLOWER_SHOP, amount: 1 },
                            { card: DiceCitiesCardIds.FLOWER_ORCHARD, amount: 2 },
                        ],
                    })],
                    ["u2", player()],
                ]),
                enabledDocks: true,
            });
            await rollCommand(6).Execute(makeGame(gs, "u1"));
            return gs;
        };

        expect((await build(false)).playerStates.get("u1")!.money).toBe(2);
        expect((await build(true)).playerStates.get("u1")!.money).toBe(3);
    });

    it("pays the Flower Shop nothing on an opponent's roll", async () => {
        // Green: it only ever pays on its owner's own turn.
        const gs = makeState({
            bankMoney: 20,
            playerStates: new Map([
                ["u1", player()],
                ["u2", player({
                    cards: [
                        { card: DiceCitiesCardIds.FLOWER_SHOP, amount: 1 },
                        { card: DiceCitiesCardIds.FLOWER_ORCHARD, amount: 2 },
                    ],
                })],
            ]),
            enabledDocks: true,
        });
        const game = makeGame(gs, "u1");

        await rollCommand(6).Execute(game);

        // Only the two Orchards pay - they are blue, so they pay on anyone's
        // roll - and the Shop adds nothing.
        expect(gs.playerStates.get("u2")!.money).toBe(0);
    });

    it("pays the Flower Orchard on anyone's roll of 4", async () => {
        const gs = makeState({
            bankMoney: 20,
            playerStates: new Map([
                ["u1", player()],
                ["u2", player({ cards: cards(DiceCitiesCardIds.FLOWER_ORCHARD) })],
            ]),
            enabledDocks: true,
        });
        const game = makeGame(gs, "u1");

        await rollCommand(4).Execute(game);

        expect(gs.playerStates.get("u2")!.money).toBe(1);
        expect(gs.bankMoney).toBe(19);
    });

    it("keeps the Mackerel Boat dry until its owner has the Harbour", async () => {
        const build = async (harbourUnlocked: boolean) => {
            const gs = makeState({
                bankMoney: 20,
                playerStates: new Map([
                    ["u1", player({ doubleUnlocked: true })],
                    ["u2", player({ cards: cards(DiceCitiesCardIds.MACKEREL_BOAT), harbourUnlocked })],
                ]),
                enabledDocks: true,
            });
            // 3 + 5 rather than 4 + 4: doubles would hand u1 another turn.
            await rollCommand(3, "u1", 5).Execute(makeGame(gs, "u1"));
            return gs;
        };

        const dry = await build(false);
        expect(dry.playerStates.get("u2")!.money).toBe(0);
        expect(dry.bankMoney).toBe(20);

        const withHarbour = await build(true);
        expect(withHarbour.playerStates.get("u2")!.money).toBe(3);
        expect(withHarbour.bankMoney).toBe(17);
    });

    it("still wins on the original four landmarks, with no Harbour needed", () => {
        const gs = makeState({
            playerStates: new Map([
                ["u1", player({ doubleUnlocked: true, bonusDiningAndStore: true, oneReroll: true, rerollDoubles: true })],
                ["u2", player({ harbourUnlocked: true })],
            ]),
            enabledDocks: true,
        });
        const game = makeGame(gs, "u1");

        expect(new DiceCitiesGameType().CheckGameOver(game)).toBe(true);
        expect(game.winner).toBe("u1");
    });
});

// The replay engine rebuilds a game from its recorded commands alone, so the
// Docks has to survive that trip: an expansion flag it can't see would leave the
// Harbour's parked roll paying out at the wrong total.
describe("Dice Cities: replaying a Docks game", () => {
    it("replays the Harbour's bonus from the command history", async () => {
        const pass = () => {
            const command = new DiceCitiesRequestPassTurn();
            command.senderId = "u1";
            command.senderUsername = "u1";
            return command;
        };
        const unlock = <T extends { senderId: string; senderUsername: string }>(command: T): T => {
            command.senderId = "u1";
            command.senderUsername = "u1";
            return command;
        };

        // Every roll of 1 pays the starting Wheat Field, which is how u1 saves up
        // for the Train Station (two dice) and then the Harbour.
        const commandHistory = [
            rollCommand(1),
            unlock(new DiceCitiesRequestUnlockTrainStation()),
            rollCommand(1),
            pass(),
            rollCommand(1),
            unlock(new DiceCitiesRequestUnlockHarbour()),
            rollCommand(5, "u1", 6),
            harbourCommand(true),
        ];

        const gameData = {
            gameId: "g1",
            gameType: new DiceCitiesGameType(),
            userIdList: ["u1", "u2"],
            turnTimer: "1d",
            currentTurn: "u1",
            lastTurnTimestamp: "2026-07-21T09:00:00.000Z",
            timerWarningNotificationSent: false,
            gameState: { turnOrder: ["u1", "u2"], history: [], commandHistory },
            complete: false,
            winner: "",
            enabledBillionaireRow: false,
            // The Docks flag rides in specificGameState — the replay adapter
            // reads it from there to restock the same market.
            specificGameState: buildInitialDiceCitiesState(["u1", "u2"], true),
        } as unknown as IGameData;

        const timeline = await buildTimeline(gameData, { u1: "u1", u2: "u2" });
        const final = timeline.snapshots[timeline.snapshots.length - 1];
        const finalState = final.specificGameState as IDiceCitiesGameStateResponse;

        expect(finalState.playerStates["u1"].harbourUnlocked).toBe(true);
        expect(final.history.some(h => h.text.includes("turn a 11 into a 13"))).toBe(true);
        expect(finalState.awaitingHarbourChoice).toBe(false);
    });

    it("rebuilds a game against the bank it was played with, not today's", async () => {
        // A game created before the supply matched the boxed game was dealt
        // from 60, and its stored state says so. Replaying it against today's
        // 262 would pay out coins that game never had - a roll its real bank
        // could only cover in part would come out in full.
        const gameData = {
            gameId: "g1",
            gameType: new DiceCitiesGameType(),
            userIdList: ["u1", "u2"],
            turnTimer: "1d",
            currentTurn: "u1",
            lastTurnTimestamp: "2026-07-21T09:00:00.000Z",
            timerWarningNotificationSent: false,
            gameState: { turnOrder: ["u1", "u2"], history: [], commandHistory: [rollCommand(1)] },
            complete: false,
            winner: "",
            enabledBillionaireRow: false,
            specificGameState: buildInitialDiceCitiesState(["u1", "u2"], false, 60),
        } as unknown as IGameData;

        const timeline = await buildTimeline(gameData, { u1: "u1", u2: "u2" });
        const final = timeline.snapshots[timeline.snapshots.length - 1];
        const finalState = final.specificGameState as IDiceCitiesGameStateResponse;

        // 60 less 3 each at the deal is 54; the roll of 1 pays both Wheat
        // Fields, leaving 52. Against a 262 bank it would read 254.
        expect(finalState.bankMoney).toBe(52);
    });
});
