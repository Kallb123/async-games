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
    plugins: {
        // Without this plugin the native cold-start theme (see
        // android/.../styles.xml, AppTheme.NoActionBarLaunch) dismisses itself the
        // moment the WebView is attached — before it has actually fetched and
        // painted the remote page — leaving a blank/black gap until the network
        // load finishes. The plugin keeps a branded overlay up through that gap;
        // `launchAutoHide: false` means it stays until useCapacitorSplashScreen
        // calls `SplashScreen.hide()` once the page has painted.
        SplashScreen: {
            launchAutoHide: false,
            // Keep in sync with `SRGB.bg` (src/utils/ui/colours.ts) — this file
            // is consumed by native Gradle/Capacitor tooling outside the Next
            // bundle, so it can't import that module, but it's the same field
            // colour the icon/splash generator paints `drawable*/splash.png` on.
            backgroundColor: '#f6e8de',
            androidSplashResourceName: 'splash',
            androidScaleType: 'CENTER_CROP',
            showSpinner: false,
        },
    },
};

export default config;
