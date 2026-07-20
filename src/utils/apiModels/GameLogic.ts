// Barrel for the game engine's rules layer.
//
// Rules are split per game under ./games/*. This file re-exports the shared
// command/game-type contracts plus every game's module, so existing importers
// keep using "@/utils/apiModels/GameLogic" unchanged.
//
// Re-exporting each game module here is also what registers its @serializable
// classes (the decorator runs on module load). Any file importing from this
// barrel therefore gets a fully-populated deserialisation registry. When you
// add a new game module, add its export line below AND wire its command/
// game-type classes into the `registration` array in
// src/app/api/game/command/route.ts. The serializable-registry test
// (games/__tests__) guards both.
export * from "./gameCommand";
export * from "./games/DiceCitiesLogic";
export * from "./games/SmartthinkLogic";
export * from "./games/SnakesAndLaddersLogic";
export * from "./games/SettlementsAndCitiesLogic";
