'use client'

import { useSyncExternalStore } from "react";
import { useUser } from "@clerk/nextjs";
import Dashboard from "@/components/Dashboard";
import Landing from "@/components/Landing";
import { SIGNED_IN_PRE_PAINT_SCRIPT, signedInHintFromCookieString } from "@/utils/users/clientUat";

// The cookie never changes under a mounted page in a way worth reacting to —
// Clerk takes over the moment it loads — so there is nothing to subscribe to.
const subscribeToNothing = () => () => {};
const guessInBrowser = (): boolean | null => signedInHintFromCookieString(document.cookie);
// The server has no cookie to read: the page is static, the same bytes for
// everyone. `null` is "not known yet".
const guessOnServer = (): boolean | null => null;

/**
 * Which home screen a visitor gets — the player's dashboard or the public
 * landing page.
 *
 * The page is prerendered once and served from the CDN to everyone, so the
 * server can't pick: the HTML carries *both* screens, and which one is shown
 * before React has run is decided in the browser. A tiny inline script (below)
 * reads Clerk's signed-in cookie and, when it says someone is signed in, sets
 * `data-ag-signed-in` on `<html>`; `ag-theme.css` shows the dashboard for that
 * and the landing page for everything else, with JavaScript off included. That
 * makes the right screen the first paint rather than one replaced by the other
 * once Clerk has loaded — a visitor with no account would otherwise watch the
 * dashboard's skeletons load and then get swapped for the landing page.
 *
 * Hydration renders the same two screens, so it matches the HTML. Straight
 * after, the cookie is read for real (`useSyncExternalStore`, whose server
 * snapshot is "unknown") and only the chosen screen is kept. It keeps its place
 * in the tree, so it is not remounted — it just stops sharing the page. A
 * navigation back to `/` never sees the unknown state: it renders on the client
 * and goes straight to the cookie.
 *
 * But the cookie is not the last word in either direction, and the screen has
 * to survive both:
 *
 * - The cookie says signed out and Clerk disagrees: a sign-in the cookie hasn't
 *   caught up with, or a browser that blocked it. (It is the cookie, not the
 *   short-lived session token, so a soft navigation back to `/` — a tapped
 *   logo, the back button, an app resumed from the background — doesn't read as
 *   signed out just because the token has expired.) Leaving them on the landing
 *   page would be the giveaway that they were signed in the whole time: "Sign
 *   in" there recognises them without asking for anything.
 * - The cookie says signed in and Clerk disagrees: a session the browser has
 *   since rejected (signed out elsewhere, expired, revoked). Showing them the
 *   public page beats bouncing them to /login from their own home.
 *
 * So once Clerk has loaded, Clerk decides; until then the cookie's read stands.
 * Nothing else rests on it: the dashboard fetches only once Clerk says the
 * viewer is signed in (`useIsAuthorised`) and every API route authenticates the
 * request itself, so mounting a screen for the wrong visitor for a moment
 * shows them nothing and asks the server for nothing.
 */
export default function HomeScreen() {
  const { isLoaded, isSignedIn } = useUser();
  const guess = useSyncExternalStore(subscribeToNothing, guessInBrowser, guessOnServer);

  const signedIn = isLoaded ? !!isSignedIn : guess;
  // Both screens, each in a wrapper CSS can hide, until something has decided.
  const undecided = signedIn === null;
  const wrapper = (screen: "dashboard" | "landing") =>
    `ag-home-screen ag-home-${screen}${undecided ? ' ag-home-screen--guess' : ''}`;

  return (
    <>
      {/* Only where the HTML came from the server: a client-side render has no
          use for it, and React warns about a script it can't run. */}
      {undecided && <script dangerouslySetInnerHTML={{ __html: SIGNED_IN_PRE_PAINT_SCRIPT }} />}
      {signedIn !== false && <div key="dashboard" className={wrapper("dashboard")}><Dashboard /></div>}
      {signedIn !== true && <div key="landing" className={wrapper("landing")}><Landing /></div>}
    </>
  );
}
