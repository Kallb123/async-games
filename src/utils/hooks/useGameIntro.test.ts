// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const auth = { userId: '' as string | null, authorised: true };
const refreshSession = vi.fn(async () => {});
vi.mock('./useAuthGuard', () => ({
    useIsAuthorised: () => ({ user: auth.userId ? { id: auth.userId } : null, isAuthorised: auth.authorised }),
    useSessionRefresh: () => refreshSession,
}));

import { useGameIntro, type GameIntro } from './useGameIntro';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let roots: Root[];
let account = 0;
let server: { seen: string[]; seenTutorials: string[] };
let getStatus: number;
let postStatus: number;
let postRejects: boolean;
let getBody: unknown;
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
    auth.userId = `intro_user_${++account}`;
    auth.authorised = true;
    roots = [];
    server = { seen: [], seenTutorials: [] };
    getStatus = postStatus = 200;
    postRejects = false;
    getBody = undefined;
    window.localStorage.clear();
    refreshSession.mockClear();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    fetchMock.mockReset().mockImplementation(async (_url, options) => {
        if (options?.method === 'POST') {
            if (postRejects) throw new Error('Offline');
            return new Response('{}', { status: postStatus });
        }
        return new Response(JSON.stringify(getBody === undefined ? server : getBody), { status: getStatus });
    });
    vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
    for (const root of roots) act(() => root.unmount());
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

function mount(game = 'realmarena') {
    let current: GameIntro;
    function Harness({ slug }: { slug: string }) {
        current = useGameIntro(slug);
        return null;
    }
    const root = createRoot(document.createElement('div'));
    roots.push(root);
    return {
        get current() { return current!; },
        render: (slug = game) => act(async () => { root.render(createElement(Harness, { slug })); }),
        unmount: () => act(async () => {
            root.unmount();
            roots.splice(roots.indexOf(root), 1);
        }),
    };
}

const posts = () => fetchMock.mock.calls.filter(([, options]) => options?.method === 'POST');

describe('remembering game intros', () => {
    it.each(['http', 'network'])('keeps Realm Arena dismissed after a %s save failure and retries on the next visit', async failure => {
        postStatus = failure === 'http' ? 503 : 200;
        postRejects = failure === 'network';
        const first = mount();
        await first.render();
        expect(first.current.tutorialOpen).toBe(true);
        await act(async () => first.current.close());
        expect(first.current.tutorialOpen).toBe(false);
        expect(posts()).toHaveLength(1);
        expect(posts()[0][1]).toMatchObject({ keepalive: true, body: JSON.stringify({ game: 'realmarena', kind: 'tutorial' }) });
        await first.unmount();

        // The account still says unseen; the local dismissal wins and syncs again.
        postStatus = 200;
        postRejects = false;
        const next = mount();
        await next.render();
        expect(next.current.loaded).toBe(true);
        expect(next.current.tutorialOpen).toBe(false);
        expect(posts()).toHaveLength(2);
        await act(async () => next.current.startTutorial());
        expect(next.current.tutorialOpen).toBe(true);
    });

    it('remembers guides too, independently of tutorials', async () => {
        const guide = mount('outbreak');
        await guide.render();
        expect(guide.current.guideOpen).toBe(true);
        await act(async () => guide.current.close());
        await guide.unmount();
        const next = mount('outbreak');
        await next.render();
        expect(next.current.guideOpen).toBe(false);
        expect(posts().map(([, options]) => JSON.parse(options!.body as string).kind)).toEqual(['guide', 'guide']);
    });

    it('keeps a seen guide separate from a newly introduced tutorial', async () => {
        server.seen = ['realmarena'];
        const screen = mount();
        await screen.render();
        expect(screen.current.tutorialOpen).toBe(true);
        expect(screen.current.guideOpen).toBe(false);
        await act(async () => screen.current.openGuide());
        expect(screen.current.tutorialOpen).toBe(false);
        expect(screen.current.guideOpen).toBe(true);
        await act(async () => screen.current.close());
        expect(posts()).toHaveLength(0);
        await screen.unmount();
        const next = mount();
        await next.render();
        expect(next.current.tutorialOpen).toBe(true);
    });

    it('honours account progress on another device without writing it again', async () => {
        server.seenTutorials = ['realmarena'];
        const screen = mount();
        await screen.render();
        expect(screen.current.tutorialOpen).toBe(false);
        await act(async () => screen.current.startTutorial());
        expect(screen.current.tutorialOpen).toBe(true);
        await act(async () => screen.current.close());
        expect(posts()).toHaveLength(0);
        expect(window.localStorage.getItem(`game-intro:tutorial:${auth.userId}:realmarena`)).toBe('1');
    });

    it.each([400, 500])('does not treat a failed GET (%s) as empty progress, but permits manual replay', async status => {
        getStatus = status;
        const screen = mount();
        await screen.render();
        expect(screen.current.loaded).toBe(true);
        expect(screen.current.tutorialOpen).toBe(false);
        expect(screen.current.guideOpen).toBe(false);
        await act(async () => screen.current.startTutorial());
        expect(screen.current.tutorialOpen).toBe(true);
        await act(async () => screen.current.close());
        expect(posts()).toHaveLength(1);
    });

    it.each([null, [], 'invalid'])('does not auto-open from malformed progress: %j', async body => {
        getBody = body;
        const screen = mount();
        await screen.render();
        expect(screen.current.loaded).toBe(true);
        expect(screen.current.tutorialOpen).toBe(false);
    });

    it.each([
        { game: 'realmarena', body: { seenTutorials: ['realmarena'] }, open: false },
        { game: 'outbreak', body: { seen: ['outbreak'] }, open: false },
        { game: 'realmarena', body: { seen: ['realmarena'] }, open: true },
        { game: 'outbreak', body: { seenTutorials: [] }, open: true },
        { game: 'realmarena', body: {}, open: true },
        { game: 'realmarena', body: { seen: 'invalid', seenTutorials: ['realmarena'] }, open: false },
        { game: 'outbreak', body: { seen: ['outbreak'], seenTutorials: null }, open: false },
        { game: 'realmarena', body: { seen: ['realmarena'], seenTutorials: 'invalid' }, open: true },
    ])('keeps valid progress fields and defaults only missing/malformed fields: $game $body', async ({ game, body, open }) => {
        getBody = body;
        const screen = mount(game);
        await screen.render();
        expect(screen.current.loaded).toBe(true);
        expect(screen.current.tutorialOpen || screen.current.guideOpen).toBe(open);
    });

    it.each([
        ['guide', 200, 200], ['tutorial', 200, 200],
        ['guide', 500, 200], ['tutorial', 500, 200],
        ['guide', 200, 503], ['tutorial', 200, 503],
        ['guide', 500, 503], ['tutorial', 500, 503],
    ] as const)('saves %s once per visit across replays (GET %s, POST %s)', async (kind, readStatus, saveStatus) => {
        const game = kind === 'guide' ? 'outbreak' : 'realmarena';
        getStatus = readStatus;
        postStatus = saveStatus;
        const screen = mount(game);
        await screen.render();
        for (let replay = 0; replay < 3; replay++) {
            await act(async () => kind === 'guide' ? screen.current.openGuide() : screen.current.startTutorial());
            await act(async () => screen.current.close());
        }
        expect(posts()).toHaveLength(1);
        expect(fetchMock.mock.calls.filter(([, options]) => options?.method !== 'POST')).toHaveLength(1);
        expect(window.localStorage.getItem(`game-intro:${kind}:${auth.userId}:${game}`)).toBe('1');
    });

    it.each(['guide', 'tutorial'] as const)('does not duplicate a pending %s save or resend it after success', async kind => {
        const screen = mount(kind === 'guide' ? 'outbreak' : 'realmarena');
        await screen.render();
        let finishSave!: (response: Response) => void;
        fetchMock.mockImplementationOnce(() => new Promise<Response>(resolve => { finishSave = resolve; }));
        await act(async () => screen.current.close());
        await act(async () => kind === 'guide' ? screen.current.openGuide() : screen.current.startTutorial());
        await act(async () => screen.current.close());
        expect(posts()).toHaveLength(1);
        await act(async () => finishSave(new Response('{}')));
        await act(async () => kind === 'guide' ? screen.current.openGuide() : screen.current.startTutorial());
        await act(async () => screen.current.close());
        expect(posts()).toHaveLength(1);
    });

    it('keeps save attempts separate for each account', async () => {
        const screen = mount();
        await screen.render();
        await act(async () => screen.current.close());
        auth.userId = `other_${account}`;
        await screen.render();
        await act(async () => screen.current.close());
        expect(posts()).toHaveLength(2);
    });

    it('never accesses anonymous storage or saves before an account exists', async () => {
        auth.userId = null;
        auth.authorised = false;
        const read = vi.spyOn(Storage.prototype, 'getItem');
        const write = vi.spyOn(Storage.prototype, 'setItem');
        const screen = mount();
        await screen.render();
        await act(async () => screen.current.openGuide());
        await act(async () => screen.current.close());
        await act(async () => screen.current.startTutorial());
        await act(async () => screen.current.close());
        expect(screen.current.tutorialOpen).toBe(false);
        expect(screen.current.guideOpen).toBe(false);
        expect(read).not.toHaveBeenCalled();
        expect(write).not.toHaveBeenCalled();
        expect(fetchMock).not.toHaveBeenCalled();
        auth.userId = `known_${account}`;
        auth.authorised = true;
        await screen.render();
        expect(screen.current.tutorialOpen).toBe(true);
        expect(read.mock.calls.every(([key]) => key.includes(auth.userId!))).toBe(true);
    });

    it('waits for auth readiness and keeps dismissals separate for each account and game', async () => {
        auth.authorised = false;
        const screen = mount();
        await screen.render();
        expect(fetchMock).not.toHaveBeenCalled();
        expect(screen.current.loaded).toBe(false);
        auth.authorised = true;
        await screen.render();
        await act(async () => screen.current.close());
        await screen.render('dicecities');
        expect(screen.current.tutorialOpen).toBe(true);
        auth.userId = `other_${account}`;
        await screen.render();
        expect(screen.current.tutorialOpen).toBe(true);
        expect(window.localStorage.getItem(`game-intro:tutorial:${auth.userId}:realmarena`)).toBeNull();
    });

    it.each(['guide', 'tutorial'] as const)('opens the %s immediately and keeps the menu choice through session confirmation', async kind => {
        auth.authorised = false;
        server = { seen: ['realmarena'], seenTutorials: ['realmarena'] };
        const screen = mount();
        await screen.render();
        await act(async () => kind === 'guide' ? screen.current.openGuide() : screen.current.startTutorial());
        expect(screen.current.guideOpen).toBe(kind === 'guide');
        expect(screen.current.tutorialOpen).toBe(kind === 'tutorial');
        expect(fetchMock).not.toHaveBeenCalled();
        auth.authorised = true;
        await screen.render();
        expect(screen.current.guideOpen).toBe(kind === 'guide');
        expect(screen.current.tutorialOpen).toBe(kind === 'tutorial');
    });

    it('remembers a dismissal made before session confirmation and saves only after it is ready', async () => {
        auth.authorised = false;
        const screen = mount();
        await screen.render();
        await act(async () => screen.current.startTutorial());
        await act(async () => screen.current.close());
        expect(screen.current.tutorialOpen).toBe(false);
        expect(fetchMock).not.toHaveBeenCalled();
        expect(window.localStorage.getItem(`game-intro:tutorial:${auth.userId}:realmarena`)).toBe('1');
        auth.authorised = true;
        await screen.render();
        expect(screen.current.tutorialOpen).toBe(false);
        expect(posts()).toHaveLength(1);
    });

    it('renews an expired session and still auto-shows the first-match tutorial', async () => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        fetchMock.mockImplementationOnce(async () => new Response('{}', { status: 401 }));
        const screen = mount();
        await screen.render();
        expect(screen.current.loaded).toBe(false);
        expect(refreshSession).toHaveBeenCalledOnce();
        await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(screen.current.loaded).toBe(true);
        expect(screen.current.tutorialOpen).toBe(true);
    });

    it('allows a tutorial dismissal while an earlier guide save is still pending', async () => {
        window.localStorage.setItem(`game-intro:guide:${auth.userId}:realmarena`, '1');
        let finishGuide!: (response: Response) => void;
        fetchMock.mockImplementation(async (_url, options) => {
            if (options?.method === 'POST' && JSON.parse(options.body as string).kind === 'guide') {
                return new Promise<Response>(resolve => { finishGuide = resolve; });
            }
            return new Response(JSON.stringify(server));
        });
        const screen = mount();
        await screen.render();
        expect(screen.current.tutorialOpen).toBe(true);
        await act(async () => screen.current.close());
        // Concurrent POSTs are safe: the route merges per-game flags, covered
        // by its tests, instead of relying on this effect's ordering.
        expect(posts()).toHaveLength(2);
        expect(JSON.parse(posts()[1][1]!.body as string).kind).toBe('tutorial');
        expect(screen.current.tutorialOpen).toBe(false);
        await act(async () => finishGuide(new Response('{}')));
        expect(screen.current.tutorialOpen).toBe(false);
    });

    it('does not reopen when a stale GET arrives after a manual tour was dismissed', async () => {
        let resolve!: (response: Response) => void;
        fetchMock.mockImplementationOnce(() => new Promise<Response>(answer => { resolve = answer; }));
        const screen = mount();
        await screen.render();
        await act(async () => screen.current.startTutorial());
        await act(async () => screen.current.close());
        await act(async () => resolve(new Response(JSON.stringify(server))));
        expect(screen.current.loaded).toBe(true);
        expect(screen.current.tutorialOpen).toBe(false);
        expect(posts()).toHaveLength(1);
    });

    it('ignores an old account response after the signed-in player changes', async () => {
        let resolve!: (response: Response) => void;
        fetchMock.mockImplementationOnce(() => new Promise<Response>(answer => { resolve = answer; }));
        const screen = mount();
        await screen.render();
        auth.userId = `other_${account}`;
        await screen.render();
        expect(screen.current.tutorialOpen).toBe(true);
        await act(async () => resolve(new Response(JSON.stringify({ seen: [], seenTutorials: ['realmarena'] }))));
        expect(screen.current.tutorialOpen).toBe(true);
    });

    it('reconciles guide and tutorial dismissals sequentially', async () => {
        window.localStorage.setItem(`game-intro:guide:${auth.userId}:realmarena`, '1');
        window.localStorage.setItem(`game-intro:tutorial:${auth.userId}:realmarena`, '1');
        let finishGuide!: (response: Response) => void;
        fetchMock.mockImplementation(async (_url, options) => {
            if (options?.method === 'POST' && JSON.parse(options.body as string).kind === 'guide') {
                return new Promise<Response>(resolve => { finishGuide = resolve; });
            }
            return new Response(JSON.stringify(server));
        });
        const screen = mount();
        await screen.render();
        expect(screen.current.tutorialOpen).toBe(false);
        expect(posts()).toHaveLength(1);
        await act(async () => finishGuide(new Response('{}')));
        expect(posts()).toHaveLength(2);
        expect(JSON.parse(posts()[1][1]!.body as string).kind).toBe('tutorial');
    });

    it('stops reconciliation if the account changes during its first save', async () => {
        window.localStorage.setItem(`game-intro:guide:${auth.userId}:realmarena`, '1');
        window.localStorage.setItem(`game-intro:tutorial:${auth.userId}:realmarena`, '1');
        let finishGuide!: (response: Response) => void;
        fetchMock.mockImplementation(async (_url, options) => {
            if (options?.method === 'POST') {
                return new Promise<Response>(resolve => { finishGuide = resolve; });
            }
            return new Response(JSON.stringify(server));
        });
        const screen = mount();
        await screen.render();
        auth.userId = `other_${account}`;
        await screen.render();
        await act(async () => finishGuide(new Response('{}')));
        expect(posts()).toHaveLength(1);
        expect(screen.current.tutorialOpen).toBe(true);
    });

    it('keeps a dismissal for the tab session when browser storage is blocked', async () => {
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Blocked'); });
        const first = mount();
        await first.render();
        await act(async () => first.current.close());
        await first.unmount();
        const next = mount();
        await next.render();
        expect(next.current.tutorialOpen).toBe(false);
    });
});
