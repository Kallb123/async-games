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
        // Clerk's production instance does a top-level redirect through its
        // Frontend API domain on first load (and back) to set a first-party
        // session cookie. Without this, Capacitor's WebViewClient treats that
        // navigation as an external link and hands it to the system browser,
        // which then has no way back into the app — a black screen followed
        // by getting stranded on clerk.asyncgames.com. Add the dev instance's
        // own Frontend API host here too if building a preview APK against
        // CAPACITOR_SERVER_URL with pk_test_ keys.
        allowNavigation: ['clerk.asyncgames.com'],
    },
};

export default config;
