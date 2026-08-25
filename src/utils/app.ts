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
