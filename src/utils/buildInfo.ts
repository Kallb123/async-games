/**
 * When this build was made, as an ISO timestamp — or null off a Next build.
 *
 * `next.config.mjs` stamps the clock into `NEXT_PUBLIC_BUILD_TIME` as the build
 * starts, and Next inlines it, so this is a constant in the bundle rather than
 * a runtime lookup (the same trick `devEnvironment.ts` relies on). Anything
 * that renders it is expected to cope with the null: a test run or any other
 * entry point that never went through the config has no build to name.
 */
export const BUILD_TIME: string | null = process.env.NEXT_PUBLIC_BUILD_TIME ?? null;
