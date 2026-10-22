// The warm-up ping is an unauthenticated HEAD on two routes whose GET is
// private. What is held here is that the ping reveals and reads nothing: the
// handlers on those routes never ask Clerk who is calling, never touch a model
// or the id in the path, answer 204 with no body, and survive a database that
// is down or slow — while GET on both still refuses an anonymous caller.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { auth, dbConnect, buildDashboard } = vi.hoisted(() => ({
    auth: vi.fn(async () => ({ userId: null as string | null })),
    dbConnect: vi.fn(async (): Promise<unknown> => ({})),
    buildDashboard: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({ auth, currentUser: vi.fn(), clerkClient: vi.fn() }));
vi.mock('@/utils/mongodb/mongodb', async importOriginal => ({ ...(await importOriginal<typeof import('@/utils/mongodb/mongodb')>()), dbConnect }));
vi.mock('@/utils/dashboard', () => ({ buildDashboard }));

import * as dashboardRoute from '@/app/api/dashboard/route';
import * as gameRoute from '@/app/api/game/[gameid]/route';
import { warmUpResponse } from '@/utils/api/warmUp';
import { GameDataModel } from '@/utils/mongodb/GameData';

// The one read a game route makes: a ping that touched it would be asking the database about an id.
const findOne = vi.spyOn(GameDataModel, 'findOne');

const ID = '2b62c738-58dc-4f2d-9d45-91bc7f1bb790';

// Each test starts on an instance that has served nothing. The instance's state
// lives on `globalThis` and is read once, when serverTiming loads, so it is
// emptied in place rather than replaced.
beforeEach(() => {
    Object.assign(globalThis.agServerTiming!, { lastRequestAt: undefined, warmed: undefined, bootedAt: Date.now() });
});

afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
});

describe('the warm-up ping', () => {
    it('is the HEAD of /api/dashboard and /api/game/[gameid], the routes the page calls next', () => {
        expect(dashboardRoute.HEAD).toBe(warmUpResponse);
        expect(gameRoute.HEAD).toBe(warmUpResponse);
    });

    it('answers 204 with no body, uncacheable, and a Server-Timing', async () => {
        const response = await warmUpResponse();
        expect(response.status).toBe(204);
        expect(await response.text()).toBe('');
        expect(response.headers.get('cache-control')).toBe('no-store');
        expect(response.headers.get('server-timing')).toMatch(/^instance_new;dur=[\d.]+, mongo_connect;dur=[\d.]+, total;dur=[\d.]+$/);
    });

    it('asks nothing of the caller and reads nothing', async () => {
        await dashboardRoute.HEAD();
        await gameRoute.HEAD();
        expect(auth).not.toHaveBeenCalled();
        expect(findOne).not.toHaveBeenCalled();
        expect(buildDashboard).not.toHaveBeenCalled();
        // It opens the connection, which is the point, and does nothing with it.
        expect(dbConnect).toHaveBeenCalledTimes(2);
    });

    it('gives the same answer whatever game id was asked about', async () => {
        const ping = (gameid: string) => gameRoute.HEAD().then(response => [response.status, response.headers.get('cache-control')]);
        expect(await ping(ID)).toEqual(await ping('no-such-game'));
        expect(findOne).not.toHaveBeenCalled();
    });

    it('calls only the first ping of an instance new, and leaves that to the signed-in request after it', async () => {
        expect((await warmUpResponse()).headers.get('server-timing')).toContain('instance_new');
        expect((await warmUpResponse()).headers.get('server-timing')).not.toContain('instance_new');
        auth.mockResolvedValueOnce({ userId: 'user_1' });
        buildDashboard.mockResolvedValueOnce({ games: [] });
        const entry = await dashboardRoute.GET(new NextRequest('http://localhost/api/dashboard'));
        expect(entry.headers.get('server-timing')).toContain('instance_new');
    });

    it('still answers 204 when the database fails', async () => {
        dbConnect.mockRejectedValueOnce(new Error('ECONNREFUSED'));
        const response = await warmUpResponse();
        expect(response.status).toBe(204);
        expect(response.headers.get('server-timing')).toContain('mongo_connect');
    });

    it('stops waiting on a database that is slow, and a late failure of it is not left unhandled', async () => {
        vi.useFakeTimers();
        let fail: (error: Error) => void = () => {};
        dbConnect.mockReturnValueOnce(new Promise((_resolve, reject) => { fail = reject; }));
        const pending = warmUpResponse();
        await vi.advanceTimersByTimeAsync(4000);
        const response = await pending;
        expect(response.status).toBe(204);
        fail(new Error('late'));
        await vi.advanceTimersByTimeAsync(0);
    });

    it('leaves GET on both routes as private as it was', async () => {
        const dashboard = await dashboardRoute.GET(new NextRequest('http://localhost/api/dashboard'));
        expect(dashboard.status).toBe(401);
        const game = await gameRoute.GET(new NextRequest(`http://localhost/api/game/${ID}`), { params: Promise.resolve({ gameid: ID }) });
        expect(game.status).toBe(401);
        expect(findOne).not.toHaveBeenCalled();
    });
});
