import { auth } from "@clerk/nextjs/server";
import HomeScreen from "@/components/HomeScreen";

/**
 * Home is two screens — the dashboard for a player, the public landing page
 * for everyone else — and the browser can't tell which it is until Clerk has
 * loaded. Reading the session cookie the middleware has already seen means
 * neither screen flashes the other first: a visitor with no account used to
 * watch the dashboard's skeletons load and then get replaced by the landing
 * page.
 *
 * `HomeScreen` owns the choice from here, because the cookie can be wrong in
 * both directions — see the note there. This decides the first paint; Clerk
 * gets the final say.
 *
 * `auth()` makes this route dynamic, which is what lets the first paint be the
 * right screen — including its server-rendered content, rather than an empty
 * shell waiting on JavaScript.
 */
export default async function Home() {
  const { userId } = await auth();

  return <HomeScreen signedInOnServer={!!userId} />;
}
