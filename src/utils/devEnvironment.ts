/**
 * True everywhere except the production deployment: Vercel preview and
 * development deployments, and `npm run dev` locally.
 *
 * Vercel sets `VERCEL_ENV` to `production` | `preview` | `development`, and
 * mirrors it into the build as `NEXT_PUBLIC_VERCEL_ENV` so client components
 * can read it too — both are inlined at build time, so this is a constant, not
 * a runtime lookup. Off Vercel (local `npm run dev`, a self-hosted build)
 * neither is set and `NODE_ENV` decides, and only an explicit `development`
 * counts — anywhere the environment can't be identified stays locked down
 * rather than wide open.
 */
export const isDevDeployment: boolean = (() => {
    const vercelEnv = process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.VERCEL_ENV;
    return vercelEnv ? vercelEnv !== 'production' : process.env.NODE_ENV === 'development';
})();

