import { GameDataModel } from '@/utils/mongodb/GameData';
import { InvitationModel } from '@/utils/mongodb/InvitationData';
import { devWipeRoute } from '../wipeRoute';

export const GET = devWipeRoute('live games and invites', async () => {
    await InvitationModel.deleteMany({}).exec();
    await GameDataModel.deleteMany({}).exec();
});

export const dynamic = 'force-dynamic';
