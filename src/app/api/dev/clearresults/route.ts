import { GameResultModel } from '@/utils/mongodb/GameResultData';
import { devWipeRoute } from '../wipeRoute';

export const GET = devWipeRoute('result data', async () => {
    await GameResultModel.deleteMany({}).exec();
});

export const dynamic = 'force-dynamic';
