import mongoose from 'mongoose';
import { GameDataModel } from './GameData';
import { DiceCitiesGameDataModel, DiceCitiesInvitationModel } from '@/games/DiceCities/DiceCitiesModels';
import { InvitationModel } from './InvitationData';
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
  const Invitation = InvitationModel;
  const DiceCitiesInvitation = DiceCitiesInvitationModel;
  const GameData = GameDataModel;
  const DiceCitiesGameData = DiceCitiesGameDataModel;
}
