import HomeScreen from "@/components/HomeScreen";
import { signedInHint } from "@/utils/users/signedInHint";

/**
 * Home is two screens — the dashboard for a player, the public landing page
 * for everyone else — and the browser can't tell which it is until Clerk has
 * loaded. Guessing from Clerk's "signed in on this browser" cookie means
 * neither screen flashes the other first: a visitor with no account used to
 * watch the dashboard's skeletons load and then get replaced by the landing
 * page.
 *
 * It is a guess, and a safe one. `HomeScreen` owns the choice from here,
 * because the cookie can be wrong in both directions — see the note there.
 * This decides the first paint; Clerk gets the final say, and everything the
 * dashboard shows still comes from API routes that authenticate the request.
 *
 * It is a cookie read rather than `auth()` so that Clerk's middleware stays off
 * page requests (`src/middleware.ts`): on a document request with an expired
 * session token that middleware sends the browser out to Clerk and back before
 * a byte of the page is served.
 *
 * Reading the cookie makes this route dynamic, which is what lets the first
 * paint be the right screen — including its server-rendered content, rather
 * than an empty shell waiting on JavaScript.
 */
export default async function Home() {
  return <HomeScreen signedInOnServer={await signedInHint()} />;
}
