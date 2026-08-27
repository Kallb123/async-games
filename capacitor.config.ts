import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Wraps the live Next.js deployment in a native WebView rather than bundling
 * a static export — the app relies on SSR, Clerk middleware and dynamic API
 * routes that `next export` can't produce (see AGENTS.md / ARCHITECTURE.md).
 * `webDir` still has to point at a real directory (Capacitor copies it into
 * the native project at `cap sync`), but its contents are never shown because
 * `server.url` takes priority at runtime.
 */
const config: CapacitorConfig = {
    appId: 'com.asyncgames.app',
    appName: 'Async Games',
    webDir: 'www',
    server: {
        // Override for a preview/staging build: CAPACITOR_SERVER_URL=https://<preview>.vercel.app npx cap sync android
        url: process.env.CAPACITOR_SERVER_URL ?? 'https://asyncgames.com',
        androidScheme: 'https',
    },
};

export default config;
