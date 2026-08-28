/**
 * Which commands belong to which game.
 *
 * `/api/game/command` deserialises a request body straight into a command
 * instance and calls `Execute(gameData)` on it. Every `Execute` opens by
 * casting the game to its own shape — `gameData as ISnakesAndLaddersGameData`,
 * then straight into `specificGameState.playerPositions` — because until now
 * the only thing standing between a command and the wrong game was that no
 * honest client would send one. Nothing checked. A `SolitaireAutoSolve` aimed
 * at a Train Time game passed the "is it your turn?" check and landed in
 * Solitaire's rules holding Train Time's state: at best a 500 halfway through,
 * at worst a half-applied mutation saved over a real game.
 *
 * So a game names its commands, and the route runs a command only against the
 * game that claims it. Keyed by the game type's `className` — what
 * `gameData.gameType.className` holds — and listing command `className`s, the
 * same identifiers the serialisation registry is keyed by.
 *
 * This replaces the `registration` array the command route used to build on
 * every request. That array was written to force the `@serializable`
 * decorators to run, but the decorator runs when its *module* loads, not when
 * an instance is constructed — importing the GameLogic barrel (which the route
 * does, for the types) had already registered all fifty classes before the
 * array was allocated. It named every command without saying which game each
 * belonged to, which is the one thing worth recording, so it says that now.
 *
 * Adding a game means adding its entry here. `serializableRegistry.test.ts`
 * fails if a `@serializable` class is missing from this map or listed twice.
 */
const COMMANDS_BY_GAME_TYPE: Record<string, readonly string[]> = {
    DiceCitiesGameType: [
        "DiceCitiesRequestDiceRoll",
        "DiceCitiesRequestCardPurchase",
        "DiceCitiesRequestPassTurn",
        "DiceCitiesRequestUnlockTrainStation",
        "DiceCitiesRequestUnlockShoppingMall",
        "DiceCitiesRequestUnlockAmusementPark",
        "DiceCitiesRequestUnlockRadioTower",
        "DiceCitiesRequestTvStationSelection",
        "DiceCitiesRequestBusinessCenterOwnSelection",
        "DiceCitiesRequestBusinessCenterOpponentSelection",
        "DiceCitiesRequestRadioTowerReroll",
    ],
    SmartthinkGameType: [
        "SmartthinkSetSecretCode",
        "SmartthinkSubmitGuess",
    ],
    SnakesAndLaddersGameType: [
        "SnakesAndLaddersRequestDiceRoll",
    ],
    SettlementsAndCitiesGameType: [
        "SACPlaceSettlementSetup",
        "SACPlaceRoadSetup",
        "SACPlayKnight",
        "SACRollDice",
        "SACMoveRobber",
        "SACBuildRoad",
        "SACBuildSettlement",
        "SACBuildCity",
        "SACBuyDevCard",
        "SACPlayRoadBuilding",
        "SACPlayYearOfPlenty",
        "SACPlayMonopoly",
        "SACMaritimeTrade",
        "SACEndTurn",
    ],
    WorldDominationGameType: [
        "WorldDominationDeployArmies",
        "WorldDominationCashInCards",
        "WorldDominationAttack",
        "WorldDominationOccupyTerritory",
        "WorldDominationEndAttackPhase",
        "WorldDominationFortify",
        "WorldDominationSkipFortify",
    ],
    SolitaireGameType: [
        "SolitaireDraw",
        "SolitaireMoveCard",
        "SolitaireUndo",
        "SolitaireAutoSolve",
    ],
    TrainTimeGameType: [
        "TrainTimeDrawCarriageCard",
        "TrainTimeClaimRoute",
        "TrainTimeDrawTickets",
        "TrainTimeKeepTickets",
        "TrainTimePassTurn",
    ],
    // docs/games/outbreak-gdd.md §21.6 step 4 added OutbreakAction; step 6
    // added OutbreakEndTurn and OutbreakDiscard; step 10 added OutbreakPlayEvent.
    OutbreakGameType: [
        "OutbreakAction",
        "OutbreakEndTurn",
        "OutbreakDiscard",
        "OutbreakPlayEvent",
    ],
};

/** The game types this map knows, for the test that guards it. */
export function registeredGameTypeClassNames(): string[] {
    return Object.keys(COMMANDS_BY_GAME_TYPE);
}

/** Every command className, across every game — for the same test. */
export function allRegisteredCommandClassNames(): string[] {
    return Object.values(COMMANDS_BY_GAME_TYPE).flat();
}

/**
 * Whether `commandClassName` is one of `gameTypeClassName`'s own commands.
 *
 * False for an unknown game type as well as an unknown command: a game whose
 * commands nobody has listed can't have any of them run, which is the failure
 * that leaves a game unplayable until someone adds the entry rather than the
 * one that runs another game's rules over its state.
 */
export function isCommandForGameType(gameTypeClassName: string, commandClassName: string): boolean {
    return COMMANDS_BY_GAME_TYPE[gameTypeClassName]?.includes(commandClassName) ?? false;
}
