import { isDevDeployment } from "@/utils/devEnvironment";

/**
 * The origin this deployment is reached at. Override with the `APP_URL` env
 * var per deployment (docs/environments.md); falls back to production so
 * nothing breaks where it isn't set.
 *
 * Anything that has to name the app from the server — the absolute links push
 * notifications open, and the `metadataBase` every share-card URL in a page's
 * `<head>` is resolved against — reads it from here, so a preview deployment's
 * links point at the preview rather than at production.
 */
export const APP_BASE_URL = process.env.APP_URL ?? 'https://asyncgames.com';

/**
 * Off the production deployment every title is flagged, so a tab, a bookmark
 * or a screenshot says which build it came from at a glance. The root layout's
 * `title.template` carries the prefix onto the pages that set a title of their
 * own without either of them having to know about it; in production both
 * halves collapse to the plain name.
 */
export const DEV_TITLE_PREFIX = isDevDeployment ? "DEV — " : "";
export const APP_NAME = `${DEV_TITLE_PREFIX}Async Games`;

/**
 * The share card every link that isn't a lobby unfurls to, drawn by
 * `scripts/generate-icons.mjs`. Relative to `APP_BASE_URL`, which the root
 * layout sets as the `metadataBase` those URLs resolve against.
 */
export const OG_IMAGE = "/icons/og-image.png";

/**
 * The phrase the whole product is named after — on the site's share card, on
 * every game's card ("2-4 players · one turn at a time"), and in the landing
 * hero. Written once so all three say it the same way.
 */
export const APP_CADENCE = "one turn at a time";

/**
 * What the app is, in one line. It is set as two lines of display type across
 * the share card (`scripts/generate-icons.mjs` draws it from here), and read as
 * one sentence everywhere else, so the break lives here rather than being
 * eyeballed in two places.
 */
export const APP_TAGLINE_LINES = ["Board games,", `${APP_CADENCE}.`] as const;
export const APP_TAGLINE = APP_TAGLINE_LINES.join(" ");

/** The line under it on the card: what a player actually does here. */
export const APP_STRAPLINE = "Play with friends across timezones. Take your turn when you have five minutes.";

/**
 * The one description of the app — the same words the share card is printed
 * with, so the picture and the text beside it say the same thing.
 *
 * Every *metadata* field that describes the whole app reads this: the page
 * `<meta>` description a search result quotes, the Open Graph and Twitter
 * descriptions a shared link unfurls with, and the manifest description an
 * install prompt and an app listing show. None of them gets its own wording.
 *
 * Body copy on a screen is not one of those and doesn't read it: the landing
 * hero says the same thing at more length, to someone who has already arrived,
 * and is edited as prose. It shares `APP_CADENCE` and nothing more.
 */
export const APP_DESCRIPTION = `${APP_TAGLINE} ${APP_STRAPLINE}`;

/**
 * The size every share card is drawn at, in pixels — the 1.91:1 box every
 * unfurl expects. The script draws to it and the metadata declares it, so a
 * crawler is told the real dimensions of the image it is about to fetch.
 */
export const SHARE_CARD_SIZE = { width: 1200, height: 630 } as const;

/** A share card as an Open Graph image entry, at the size it was drawn. */
export function shareImage(url: string, alt: string) {
    return { url, ...SHARE_CARD_SIZE, alt };
}
