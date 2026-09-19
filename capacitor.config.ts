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
        // Every host the WebView is allowed to navigate to itself. Anything
        // not listed here Capacitor hands to the system browser, which has no
        // way back into the app — a black screen, then a stranded tab.
        //
        // `clerk.asyncgames.com` is Clerk's production Frontend API: it does a
        // top-level redirect through its own domain on first load (and back) to
        // set a first-party session cookie. Add the dev instance's own Frontend
        // API host here too if building a preview APK against
        // CAPACITOR_SERVER_URL with pk_test_ keys.
        //
        // The Microsoft hosts are the sign-in hop for Clerk's Microsoft social
        // connection — `login.microsoftonline.com` for the authorize request,
        // `login.live.com` for the personal-account screens it hands off to.
        // They have to stay in the WebView for the same reason the whole flow
        // does: Clerk binds the sign-in attempt to the Client that started it,
        // so a round trip that finishes in another cookie jar comes back as an
        // auth error rather than a session. Microsoft, unlike Google, renders
        // happily in a WebView, so keeping it here is all it needs — the cost
        // is that the phone's own Microsoft session isn't shared, so the player
        // types their password.
        //
        // Google is *not* here, and can't be: its consent screen refuses to
        // load in an embedded WebView at all. That hop doesn't happen in the
        // WebView — `useNativeGoogleSignIn` gets an ID token from the phone's
        // own account picker and hands it straight to Clerk, with no navigation
        // anywhere. See that hook for the full story.
        allowNavigation: [
            'clerk.asyncgames.com',
            'login.microsoftonline.com',
            'login.live.com',
        ],
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
        // Capacitor 8 handles the status and gesture bars from core — there is
        // no plugin to install for this. Its default style follows the
        // *device's* light/dark setting, which is the wrong question here: the
        // app is cream in both, so a phone in dark mode was getting white
        // icons on it. LIGHT means "light background, dark icons" and holds
        // whatever the device is set to.
        //
        // Insets are core's too (`insetsHandling` defaults to 'css'): it pads
        // the WebView clear of the bars and publishes the measurements as
        // `--safe-area-inset-*` custom properties on <html>. Read those rather
        // than `env(safe-area-inset-*)`, which only resolves under a
        // `viewport-fit=cover` this app doesn't set.
        SystemBars: {
            style: 'LIGHT',
        },
        // Draws the notification a push arriving in the foreground gets shown
        // as (`ensureNotificationChannel`/`showForegroundNotification` in
        // `src/utils/firebase/nativePush.ts`) with the same mark and tint
        // Android itself uses for a backgrounded/killed app's own tray
        // notification (`AndroidManifest.xml`'s `default_notification_icon`/
        // `_color`), so a player can't tell which path drew theirs.
        LocalNotifications: {
            smallIcon: 'ic_stat_notify',
            iconColor: '#b74b21', // ag_notification (android/app/.../ag_colors.xml)
        },
        // Google sign-in in the app doesn't go through the WebView at all —
        // `useNativeGoogleSignIn` asks the phone for an ID token and hands it
        // to Clerk. This plugin is the native half of that. It ships providers
        // for Facebook, Apple and Twitter too; `providers` keeps their SDKs
        // out of the APK, since the app offers none of them and a Facebook SDK
        // nobody calls is still a Facebook SDK in the bundle.
        SocialLogin: {
            providers: {
                google: true,
                facebook: false,
                apple: false,
                twitter: false,
            },
        },
    },
};

export default config;
