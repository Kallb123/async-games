import { NextRequest, NextResponse } from 'next/server';
import { adminBoostWorld, adminEndWorld, KingdomBuilderPersistenceError } from '@/games/KingdomBuilder';
import { listAdminWorlds, type AdminKingdomBuilderWorldRequest } from '@/games/KingdomBuilder/adminWorlds';
import { requireAdmin } from '@/utils/api/adminRequest';
import { readJsonBody } from '@/utils/api/requestBody';
import { dbConnect } from '@/utils/mongodb/mongodb';

/**
 * Every Kingdom Builder world, for clearing out the abandoned test worlds
 * nobody will come back to end themselves (docs/admin-tools.md, GDD §9.1).
 */
export async function GET(request: NextRequest) {
    console.log(`GET ${request.nextUrl.pathname}`);

    const caller = await requireAdmin();
    if ('error' in caller) {
        return caller.error;
    }

    await dbConnect();
    return NextResponse.json(await listAdminWorlds());
}

const ACTIONS: readonly unknown[] = ['end', 'delete', 'boost'] satisfies AdminKingdomBuilderWorldRequest['action'][];

/**
 * Ends any world, ends and removes it there and then, or boosts a live one —
 * every settlement in it gets 100 of each resource. Each changes the world for
 * every player in it, so each is logged with the admin who asked.
 */
export async function POST(request: NextRequest) {
    console.log(`POST ${request.nextUrl.pathname}`);

    const caller = await requireAdmin();
    if ('error' in caller) {
        return caller.error;
    }

    const { worldId, action } = await readJsonBody<AdminKingdomBuilderWorldRequest>(request);
    if (typeof worldId !== 'string' || !ACTIONS.includes(action)) {
        return NextResponse.json({}, { status: 400, statusText: "A world and an action are required" });
    }

    await dbConnect();
    try {
        if (action === 'boost') {
            const settlements = await adminBoostWorld(worldId);
            console.log(`Admin ${caller.admin.id} boosted ${settlements} settlement(s) in Kingdom Builder world ${worldId}`);
        } else {
            await adminEndWorld(worldId, { deleteNow: action === 'delete' });
            console.log(`Admin ${caller.admin.id} ${action === 'delete' ? 'deleted' : 'ended'} Kingdom Builder world ${worldId}`);
        }
    } catch (error) {
        if (!(error instanceof KingdomBuilderPersistenceError)) throw error;
        return NextResponse.json({}, { status: error.code === 'WORLD_NOT_FOUND' ? 404 : 400, statusText: error.message });
    }
    return NextResponse.json(await listAdminWorlds());
}
