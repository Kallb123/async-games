import mongoose, { type Model } from 'mongoose';
// Importing a model file is what registers it with Mongoose, so this file is
// the one list of them: the deploy-time index sync (scripts/sync-indexes.ts)
// builds indexes for exactly what is registered once these have loaded, and
// models.test.ts fails if a file that makes a model is missing from here. A new
// model file gets one line below.
//
// mongodb.ts carries GameData, Invitation and every game's two discriminators.
import './mongodb';
import './ReactionData';
import './RateLimitData';
import './PerformanceMetricData';
import './GifCatalogueData';
import './ChatMessageData';
import './ChatReadData';
import './FriendshipData';
import './AchievementUnlockData';
// GameResult and its per-game discriminators.
import './GameResultData';
// Kingdom Builder's models are not part of mongodb.ts's per-game registries:
// its world, its pieces and its world invitation load with the game.
import '@/games/KingdomBuilder/KingdomBuilderWorldModel';
import '@/games/KingdomBuilder/KingdomBuilderSettlementModel';
import '@/games/KingdomBuilder/KingdomBuilderArmyModel';
import '@/games/KingdomBuilder/KingdomBuilderTradeOfferModel';
import '@/games/KingdomBuilder/KingdomBuilderBattleModel';
import '@/games/KingdomBuilder/KingdomBuilderInvitation';

/**
 * Every model the app registers with Mongoose — base models and discriminators
 * alike — in registration order, which puts a base model ahead of its
 * discriminators.
 */
export function registeredModels(): Model<any>[] {
  return mongoose.modelNames().map(name => mongoose.model(name));
}
