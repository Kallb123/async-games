import { describe, expect, it, afterEach, vi } from 'vitest';

const ENV_KEYS = ['NEXT_PUBLIC_VERCEL_ENV', 'VERCEL_ENV', 'NODE_ENV'] as const;
const originalEnv = { ...process.env };

/** The module reads the environment once, at import time (the values are
 *  build-time constants in the app), so each case needs a fresh import. */
async function loadWith(env: Partial<Record<(typeof ENV_KEYS)[number], string>>) {
    for (const key of ENV_KEYS) {
        delete process.env[key];
    }
    Object.assign(process.env, env);
    vi.resetModules();
    return import('./devEnvironment');
}

afterEach(() => {
    for (const key of ENV_KEYS) {
        delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
});

describe('isDevDeployment', () => {
    it.each([
        ['a Vercel preview deployment', { NEXT_PUBLIC_VERCEL_ENV: 'preview', VERCEL_ENV: 'preview' }],
        ['a Vercel development deployment', { NEXT_PUBLIC_VERCEL_ENV: 'development', VERCEL_ENV: 'development' }],
        ['the server half of a preview deployment', { VERCEL_ENV: 'preview' }],
        ['npm run dev off Vercel', { NODE_ENV: 'development' }],
    ])('is true on %s', async (_name, env) => {
        const { isDevDeployment } = await loadWith(env);
        expect(isDevDeployment).toBe(true);
    });

    it.each([
        ['the Vercel production deployment', { NEXT_PUBLIC_VERCEL_ENV: 'production', VERCEL_ENV: 'production' }],
        ['the server half of the production deployment', { VERCEL_ENV: 'production' }],
        ['a production build off Vercel', { NODE_ENV: 'production' }],
        ['an unidentifiable host', {}],
    ])('is false on %s', async (_name, env) => {
        const { isDevDeployment } = await loadWith(env);
        expect(isDevDeployment).toBe(false);
    });
});

describe('blockOutsideDevDeployment', () => {
    it('lets a dev deployment through', async () => {
        const { blockOutsideDevDeployment } = await loadWith({ VERCEL_ENV: 'preview' });
        expect(blockOutsideDevDeployment()).toBeNull();
    });

    it('answers 404 in production, as though the endpoint were not deployed', async () => {
        const { blockOutsideDevDeployment } = await loadWith({ VERCEL_ENV: 'production' });
        expect(blockOutsideDevDeployment()?.status).toBe(404);
    });
});
