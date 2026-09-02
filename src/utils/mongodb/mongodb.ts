import mongoose, { Model } from 'mongoose';
import { GameDataModel, IGameDataDocument } from './GameData';
import { IInvitationDataDocument } from './InvitationData';
import { DiceCitiesGameDataModel, DiceCitiesInvitationModel } from '@/games/DiceCities/DiceCitiesModels';
import { SnakesAndLaddersGameDataModel, SnakesAndLaddersInvitationModel } from '@/games/SnakesAndLadders/SnakesAndLaddersModels';
import { SettlementsAndCitiesGameDataModel, SettlementsAndCitiesInvitationModel } from '@/games/SettlementsAndCities/SettlementsAndCitiesModels';
import { SmartthinkGameDataModel, SmartthinkInvitationModel } from '@/games/Smartthink/SmartthinkModels';
import { WorldDominationGameDataModel, WorldDominationInvitationModel } from '@/games/WorldDomination/WorldDominationModels';
import { SolitaireGameDataModel, SolitaireInvitationModel } from '@/games/Solitaire/SolitaireModels';
import { TrainTimeGameDataModel, TrainTimeInvitationModel } from '@/games/TrainTime/TrainTimeModels';
import { OutbreakGameDataModel, OutbreakInvitationModel } from '@/games/Outbreak/OutbreakModels';
import { FiresOutGameDataModel, FiresOutInvitationModel } from '@/games/FiresOut/FiresOutModels';
import { InvitationModel } from './InvitationData';

// Add new game discriminator keys here whenever a new game is introduced.
// TypeScript will produce a compile error if a key is listed but its model is
// not present in GAME_DATA_MODELS / INVITATION_MODELS.
type GameDataDiscriminatorKey = 'DiceCitiesGameData' | 'SnakesAndLaddersGameData' | 'SettlementsAndCitiesGameData' | 'SmartthinkGameData' | 'WorldDominationGameData' | 'SolitaireGameData' | 'TrainTimeGameData' | 'OutbreakGameData' | 'FiresOutGameData';
type InvitationDiscriminatorKey = 'DiceCitiesInvitation' | 'SnakesAndLaddersInvitation' | 'SettlementsAndCitiesInvitation' | 'SmartthinkInvitation' | 'WorldDominationInvitation' | 'SolitaireInvitation' | 'TrainTimeInvitation' | 'OutbreakInvitation' | 'FiresOutInvitation';

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

  return cached.conn;
}

// Every game's GameData discriminator model, keyed by discriminator name.
// This is the one gameType -> model map — see gameDataModelFor() below — and
// the typed Record is a compile-time exhaustiveness check: adding a key to
// GameDataDiscriminatorKey but omitting its model here is a TypeScript error.
// It lives at module scope so importing this file registers the game-data
// discriminators.
const GAME_DATA_MODELS: Record<GameDataDiscriminatorKey, Model<IGameDataDocument>> = {
  DiceCitiesGameData: DiceCitiesGameDataModel,
  SnakesAndLaddersGameData: SnakesAndLaddersGameDataModel,
  SettlementsAndCitiesGameData: SettlementsAndCitiesGameDataModel,
  SmartthinkGameData: SmartthinkGameDataModel,
  WorldDominationGameData: WorldDominationGameDataModel,
  SolitaireGameData: SolitaireGameDataModel,
  TrainTimeGameData: TrainTimeGameDataModel,
  OutbreakGameData: OutbreakGameDataModel,
  FiresOutGameData: FiresOutGameDataModel,
};

// The model that persists a game of `gameType` — one lookup in place of a
// branch per game. Undefined for a gameType with no registered discriminator,
// which callers should treat as an unsupported game rather than a crash.
export function gameDataModelFor(gameType: string): Model<IGameDataDocument> | undefined {
  const models: Record<string, Model<IGameDataDocument> | undefined> = GAME_DATA_MODELS;
  return models[`${gameType}GameData`];
}

// Every game's Invitation discriminator model, keyed by discriminator name —
// the invitation-side counterpart of GAME_DATA_MODELS above, in exactly the
// same shape. It lives at module scope so importing this file registers the
// invitation discriminators.
const INVITATION_MODELS: Record<InvitationDiscriminatorKey, Model<IInvitationDataDocument>> = {
  DiceCitiesInvitation: DiceCitiesInvitationModel,
  SnakesAndLaddersInvitation: SnakesAndLaddersInvitationModel,
  SettlementsAndCitiesInvitation: SettlementsAndCitiesInvitationModel,
  SmartthinkInvitation: SmartthinkInvitationModel,
  WorldDominationInvitation: WorldDominationInvitationModel,
  SolitaireInvitation: SolitaireInvitationModel,
  TrainTimeInvitation: TrainTimeInvitationModel,
  OutbreakInvitation: OutbreakInvitationModel,
  FiresOutInvitation: FiresOutInvitationModel,
};

// The model that persists an invitation of `gameType` — the invitation-side
// counterpart of gameDataModelFor() above. Undefined for a gameType with no
// registered discriminator, which callers should treat as an unsupported
// game rather than a crash.
export function invitationModelFor(gameType: string): Model<IInvitationDataDocument> | undefined {
  const models: Record<string, Model<IInvitationDataDocument> | undefined> = INVITATION_MODELS;
  return models[`${gameType}Invitation`];
}
