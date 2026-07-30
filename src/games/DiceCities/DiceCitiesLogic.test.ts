import { describe, expect, it } from "vitest";
import {
    DiceCitiesRequestCardPurchase,
    DiceCitiesRequestDiceRoll,
    DiceCitiesRequestRadioTowerReroll,
    DiceCitiesRequestTvStationSelection,
    DiceCitiesRequestUnlockTrainStation,
} from "./DiceCitiesLogic";
import { BANK_TOTAL_COINS, DiceCitiesCardIds, DiceCitiesCards, STARTING_PLAYER_COINS } from "./cards";
import { buildInitialDiceCitiesState } from "./DiceCitiesModels";
import type { IDiceCitiesGameData, IDiceCitiesGameState, IDiceCitiesPlayerState } from "./DiceCitiesModels";

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
        lastDiceSelection: 1,
        ...overrides,
    };
}

function makeState(overrides: Partial<IDiceCitiesGameState> = {}): IDiceCitiesGameState {
    return {
        bankCards: [{ card: DiceCitiesCardIds.CAFE, amount: 6 }],
        bankMoney: BANK_TOTAL_COINS,
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

// A roll with its dice pre-recorded, so payouts are deterministic.
function rollCommand(roll1: number, sender = "u1"): DiceCitiesRequestDiceRoll {
    const command = new DiceCitiesRequestDiceRoll();
    command.senderId = sender;
    command.senderUsername = sender;
    command.recordedRoll1 = roll1;
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
        expect(game.gameState.history.some(h => h.includes("The bank ran out of coins - 3 coins"))).toBe(true);
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
