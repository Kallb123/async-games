import HomeScreen from "@/components/HomeScreen";

/**
 * Home is two screens — the dashboard for a player, the public landing page
 * for everyone else — and this route is built once and served as a static page
 * (`○` in the `next build` table): the same HTML for every visitor, straight
 * from the CDN.
 *
 * It used to read Clerk's signed-in cookie here (`cookies()`) to render the
 * right screen on the server. That made the route dynamic, so every cold open of
 * the app waited on a serverless render before the dashboard's own request even
 * started, and every navigation back home waited on one too. Nothing on the page
 * needs the request, only the choice of screen does — so the choice moved to the
 * browser. `HomeScreen` owns it: the static HTML holds both screens, a tiny
 * inline script and the stylesheet show the right one before first paint, and
 * React settles on it after hydrating. Clerk still gets the final say, and
 * everything the dashboard shows still comes from API routes that authenticate
 * the request.
 *
 * Do not read the request here (`cookies()`, `headers()`, `auth()`,
 * `searchParams`): any of them turns the route dynamic again. Clerk's
 * middleware stays off page requests for the reason in `src/middleware.ts`.
 */
export default function Home() {
  return <HomeScreen />;
}
