import mongoose from 'mongoose';
import { GameDataModel } from './GameData';
import { DiceCitiesGameDataModel, DiceCitiesInvitationModel } from '@/games/DiceCities/DiceCitiesModels';
import { SnakesAndLaddersGameDataModel, SnakesAndLaddersInvitationModel } from '@/games/SnakesAndLadders/SnakesAndLaddersModels';
import { SettlementsAndCitiesGameDataModel, SettlementsAndCitiesInvitationModel } from '@/games/SettlementsAndCities/SettlementsAndCitiesModels';
import { InvitationModel } from './InvitationData';

// Add new game discriminator keys here whenever a new game is introduced.
// TypeScript will produce a compile error if a key is listed but its model is
// not present in the records inside initialiseDiscriminators().
type GameDataDiscriminatorKey = 'DiceCitiesGameData' | 'SnakesAndLaddersGameData' | 'SettlementsAndCitiesGameData';
type InvitationDiscriminatorKey = 'DiceCitiesInvitation' | 'SnakesAndLaddersInvitation' | 'SettlementsAndCitiesInvitation';

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
  // These Records act as a compile-time exhaustiveness check: every key in the
  // union types above must map to a model here.  A missing entry is a TypeScript
  // error, so forgetting to register a new game's discriminators is caught at
  // build time rather than at runtime.
  const gameDataModels: Record<GameDataDiscriminatorKey, unknown> = {
    DiceCitiesGameData: DiceCitiesGameDataModel,
    SnakesAndLaddersGameData: SnakesAndLaddersGameDataModel,
    SettlementsAndCitiesGameData: SettlementsAndCitiesGameDataModel,
  };
  const invitationModels: Record<InvitationDiscriminatorKey, unknown> = {
    DiceCitiesInvitation: DiceCitiesInvitationModel,
    SnakesAndLaddersInvitation: SnakesAndLaddersInvitationModel,
    SettlementsAndCitiesInvitation: SettlementsAndCitiesInvitationModel,
  };
  // Reference base models so they are also initialised in the module cache.
  void InvitationModel;
  void GameDataModel;
  // Prevent "assigned but never read" warnings on the registry objects.
  void gameDataModels;
  void invitationModels;
}
