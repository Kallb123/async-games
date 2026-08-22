import { sendPushToUsers, gameNotificationLink } from '@/utils/firebase/pushNotification';
import { buildYourTurnNotification } from '@/utils/firebase/notificationContent';
import { userListToUserIdNameMap } from '@/utils/users/clerk';
import { dbConnect } from '@/utils/mongodb/mongodb';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { IInvitationDataDocument, InvitationModel } from '@/utils/mongodb/InvitationData';
import { DiceCitiesGameDataModel } from '@/games/DiceCities/DiceCitiesModels';
import { SnakesAndLaddersGameDataModel } from '@/games/SnakesAndLadders/SnakesAndLaddersModels';
import { SettlementsAndCitiesGameDataModel } from '@/games/SettlementsAndCities/SettlementsAndCitiesModels';
import { SmartthinkGameDataModel } from '@/games/Smartthink/SmartthinkModels';
import { WorldDominationGameDataModel } from '@/games/WorldDomination/WorldDominationModels';
import { SolitaireGameDataModel } from '@/games/Solitaire/SolitaireModels';
import { TrainTimeGameDataModel } from '@/games/TrainTime/TrainTimeModels';
import { uuidString } from '@/utils/apiModels/GameDataApi';
import { IGameDataDocument } from '@/utils/mongodb/GameData';

export async function POST(request: NextRequest) {
  console.log(`POST ${request.nextUrl.pathname}`);

  const authResponse = await auth();
  if (!authResponse.userId) {
    return NextResponse.json({}, {status: 400, statusText: "Not signed in"});
  }
  
  const { inviteId } = await request.json();

  await dbConnect();
  const inviteData: IInvitationDataDocument = await InvitationModel.findOne({inviteId}).exec();
  if (!inviteData) {
    return NextResponse.json({}, {status: 404, statusText: "Invite not found"});
  }

  const acceptance = inviteData.userIdList.find((uil) => uil.userId === authResponse.userId);
  if (acceptance) {
    acceptance.inviteAccepted = true;
  }

  const userIdList = inviteData.userIdList.map(uid => uid.userId);
  // Notify every invitee *and* the original sender: the sender's outgoing-invite
  // list / home dashboard needs to react live when their invite is accepted and
  // when the game finally starts. `userIdList` (invitees only) is what CreateGame
  // expects, so keep it separate from this notification list.
  const { data: userList } = await (await clerkClient()).users.getUserList({
    userId: [...userIdList, inviteData.senderId]
  });

  // If not everyone has accepted
  const allAccepted = inviteData.userIdList.every((uil) => uil.inviteAccepted === true);
  if (!allAccepted) {
    await inviteData.save();
  }

  await sendPushToUsers(userList, {
    event: 'InviteAccepted',
    inviteId: inviteId
  });

  if (!allAccepted) {
    return NextResponse.json({success: true, gameStarted: false});
  }

  // Create game
  const gameData = await inviteData.CreateGame(inviteData, userIdList.concat(inviteData.senderId));
  let gameDataM: IGameDataDocument;
  if (inviteData.gameType === 'SnakesAndLadders') {
    gameDataM = new SnakesAndLaddersGameDataModel(gameData);
  } else if (inviteData.gameType === 'SettlementsAndCities') {
    gameDataM = new SettlementsAndCitiesGameDataModel(gameData);
  } else if (inviteData.gameType === 'DiceCities') {
    gameDataM = new DiceCitiesGameDataModel(gameData);
  } else if (inviteData.gameType === 'Smartthink') {
    gameDataM = new SmartthinkGameDataModel(gameData);
  } else if (inviteData.gameType === 'WorldDomination') {
    gameDataM = new WorldDominationGameDataModel(gameData);
  } else if (inviteData.gameType === 'Solitaire') {
    gameDataM = new SolitaireGameDataModel(gameData);
  } else if (inviteData.gameType === 'TrainTime') {
    gameDataM = new TrainTimeGameDataModel(gameData);
  } else {
    throw new Error(`Unsupported game type: ${inviteData.gameType}`);
  }

  await gameDataM.save();
  
  await inviteData.deleteOne();

  await sendPushToUsers(userList, {
    event: 'GameStart',
    inviteId: inviteId,
    gameId: gameData.gameId.toString() as uuidString
  });

  // Whoever won the roll for turn order is up immediately, and until now nothing
  // told them so — the first "your move" push only went out once someone had
  // played. Skip it for the player who triggered the game starting: they're
  // looking at the app right now (and for solo games they're the only player).
  const firstUser = userList.find(u => u.id === gameData.currentTurn);
  if (firstUser && firstUser.id !== authResponse.userId) {
    await sendPushToUsers([firstUser], {
      event: 'YourTurn',
      gameId: gameData.gameId.toString() as uuidString,
      link: gameNotificationLink(gameData.gameType.url, gameData.gameId.toString())
    }, await buildYourTurnNotification(gameData, firstUser.id, userListToUserIdNameMap(userList), {
      gameJustStarted: true
    }), {
      channel: 'yourTurn'
    });
  }

  return NextResponse.json({success: true, gameStarted: true, gameId: gameData.gameId, gameUrl: gameData.gameType.url});
}
