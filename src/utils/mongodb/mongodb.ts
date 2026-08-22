import mongoose from 'mongoose';
import { GameDataModel } from './GameData';
import { DiceCitiesGameDataModel, DiceCitiesInvitationModel } from '@/games/DiceCities/DiceCitiesModels';
import { SnakesAndLaddersGameDataModel, SnakesAndLaddersInvitationModel } from '@/games/SnakesAndLadders/SnakesAndLaddersModels';
import { SettlementsAndCitiesGameDataModel, SettlementsAndCitiesInvitationModel } from '@/games/SettlementsAndCities/SettlementsAndCitiesModels';
import { SmartthinkGameDataModel, SmartthinkInvitationModel } from '@/games/Smartthink/SmartthinkModels';
import { WorldDominationGameDataModel, WorldDominationInvitationModel } from '@/games/WorldDomination/WorldDominationModels';
import { SolitaireGameDataModel, SolitaireInvitationModel } from '@/games/Solitaire/SolitaireModels';
import { TrainTimeGameDataModel, TrainTimeInvitationModel } from '@/games/TrainTime/TrainTimeModels';
import { InvitationModel } from './InvitationData';

// Add new game discriminator keys here whenever a new game is introduced.
// TypeScript will produce a compile error if a key is listed but its model is
// not present in the records inside initialiseDiscriminators().
type GameDataDiscriminatorKey = 'DiceCitiesGameData' | 'SnakesAndLaddersGameData' | 'SettlementsAndCitiesGameData' | 'SmartthinkGameData' | 'WorldDominationGameData' | 'SolitaireGameData' | 'TrainTimeGameData';
type InvitationDiscriminatorKey = 'DiceCitiesInvitation' | 'SnakesAndLaddersInvitation' | 'SettlementsAndCitiesInvitation' | 'SmartthinkInvitation' | 'WorldDominationInvitation' | 'SolitaireInvitation' | 'TrainTimeInvitation';

declare global {
  var mongoose: any; // This must be a `var` and not a `let / const`
}

let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

export async function dbConnect() {
  const MONGODB_URI = process.env.MONGODB_URI!;

  if (!MONGODB_URI) {
    throw new Error(
      "Please define the MONGODB_URI environment variable inside .env.local",
    );
  }

  if (cached.conn) {
    initialiseDiscriminators();
    return cached.conn;
  }
  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
    };
    cached.promise = mongoose.connect(MONGODB_URI, opts).then((mongoose) => {
      return mongoose;
    });
  }
  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    throw e;
  }

  initialiseDiscriminators();
  return cached.conn;
}

function initialiseDiscriminators() {
  // Evaluating these model variables ensures Mongoose has registered every
  // discriminator before the connection is used.  The typed Record also acts
  // as a compile-time exhaustiveness check: adding a key to the union types
  // above but omitting the corresponding model here is a TypeScript error.
  const _gameData: Record<GameDataDiscriminatorKey, unknown> = {
    DiceCitiesGameData: DiceCitiesGameDataModel,
    SnakesAndLaddersGameData: SnakesAndLaddersGameDataModel,
    SettlementsAndCitiesGameData: SettlementsAndCitiesGameDataModel,
    SmartthinkGameData: SmartthinkGameDataModel,
    WorldDominationGameData: WorldDominationGameDataModel,
    SolitaireGameData: SolitaireGameDataModel,
    TrainTimeGameData: TrainTimeGameDataModel,
  };
  const _invitations: Record<InvitationDiscriminatorKey, unknown> = {
    DiceCitiesInvitation: DiceCitiesInvitationModel,
    SnakesAndLaddersInvitation: SnakesAndLaddersInvitationModel,
    SettlementsAndCitiesInvitation: SettlementsAndCitiesInvitationModel,
    SmartthinkInvitation: SmartthinkInvitationModel,
    WorldDominationInvitation: WorldDominationInvitationModel,
    SolitaireInvitation: SolitaireInvitationModel,
    TrainTimeInvitation: TrainTimeInvitationModel,
  };
  void _gameData, _invitations;
}
