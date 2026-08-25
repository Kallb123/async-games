import type { MetadataRoute } from "next";
import { APP_DESCRIPTION, APP_NAME } from "@/utils/app";
import { SRGB } from "@/utils/ui/colours";

/**
 * The web app manifest — what a browser reads to decide the app is
 * installable, and what an installed app is called, coloured and launched as.
 *
 * Generated rather than kept as a static `public/manifest.json` so it reads
 * the app's name, description and background from the same place the `<head>`
 * does (`utils/app.ts`, `ui/colours.ts`): a static copy said "Async Games /
 * Board games, one turn at a time. / #F0EEE9" while the page said three other
 * things, and nothing made them agree. Next serves this at
 * `/manifest.webmanifest` and links it from every page itself, with the
 * credentials a Clerk-protected preview deployment needs to fetch it — which
 * the hand-written `<link rel="manifest">` it replaces did not send, so a
 * preview build could never be installed.
 *
 * `id` is what a browser identifies an already-installed app by, so it stays
 * "/" whatever the manifest's own URL is: existing installs update rather than
 * appearing alongside a second copy of the app.
 */
export default function manifest(): MetadataRoute.Manifest {
    return {
        id: "/",
        name: APP_NAME,
        short_name: APP_NAME,
        description: APP_DESCRIPTION,
        start_url: "/",
        display: "standalone",
        orientation: "portrait",
        // The cream the app is painted on: the browser tints its own chrome
        // with `theme_color` and holds the splash screen on `background_color`,
        // so both are `--ag-bg` and the launch doesn't flash a different colour
        // than the screen it lands on.
        theme_color: SRGB.bg,
        background_color: SRGB.bg,
        // Written by `npm run icons`. 192 and 512 are the pair a browser
        // requires before it will offer to install at all; `maskable` is the
        // one Android crops its own shape out of.
        icons: [
            { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
            { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
            { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
            { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
        // What Android shows in the richer install prompt — without at least
        // one narrow screenshot it falls back to the plain one-line banner.
        screenshots: [
            {
                src: "/art/sac.png",
                sizes: "1080x1710",
                type: "image/png",
                form_factor: "narrow",
                label: "Playing Settlements & Cities on a shared board",
            },
            {
                src: "/art/trains.png",
                sizes: "1080x1720",
                type: "image/png",
                form_factor: "narrow",
                label: "Claiming a route in Train Time",
            },
            {
                src: "/art/profile.png",
                sizes: "1080x1876",
                type: "image/png",
                form_factor: "narrow",
                label: "Player profile with stats by game",
            },
        ],
    };
}
