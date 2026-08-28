// Barrel for the game engine's rules layer.
//
// Each game's rules module is colocated with the rest of that game under
// src/games/<Game>/ (models, apiModels, static data, components, and the
// rules module all live in one folder). This file re-exports the shared
// command/game-type contracts plus every game's rules module, so existing
// importers keep using "@/utils/apiModels/GameLogic" unchanged.
//
// Re-exporting each game module here is also what registers its @serializable
// classes (the decorator runs on module load). Any file importing from this
// barrel therefore gets a fully-populated deserialisation registry. When you
// add a new game, add its rules module's export line below AND give it an
// entry in COMMANDS_BY_GAME_TYPE in src/utils/games/gameCommands.ts — the
// command route only runs a command against the game that claims it. The
// serializable-registry test (games/__tests__) guards both.
export * from "./gameCommand";
export * from "@/games/DiceCities/DiceCitiesLogic";
export * from "@/games/Smartthink/SmartthinkLogic";
export * from "@/games/SnakesAndLadders/SnakesAndLaddersLogic";
export * from "@/games/SettlementsAndCities/SettlementsAndCitiesLogic";
export * from "@/games/WorldDomination/WorldDominationLogic";
export * from "@/games/Solitaire/SolitaireLogic";
export * from "@/games/TrainTime/TrainTimeLogic";
export * from "@/games/Outbreak/OutbreakLogic";
