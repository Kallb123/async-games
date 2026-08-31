'use client'

import { useEffect, useRef } from "react";
import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import Dashboard from "@/components/Dashboard";
import Landing from "@/components/Landing";

/**
 * Which home screen a visitor gets — the player's dashboard or the public
 * landing page.
 *
 * `page.tsx` makes the call on the server, from the session cookie, so the
 * first paint is the right screen rather than one replaced by the other once
 * Clerk has loaded. But the cookie is not the last word in either direction,
 * and the screen has to survive both:
 *
 * - The server said signed out and Clerk disagrees. A Clerk session token is
 *   short-lived and refreshed in the browser; a *soft* navigation back to `/`
 *   (a tapped logo, the back button, an app resumed from the background) is an
 *   RSC request, which the middleware can't answer with a handshake redirect
 *   the way it does a document load, so an expired token reads as no session
 *   at all. That kicked a signed-in player to the landing page, where "Sign
 *   in" then recognised them immediately without asking for anything — the
 *   giveaway that they had been signed in the whole time.
 * - The server said signed in and Clerk disagrees: a session it saw and the
 *   browser then rejected (signed out elsewhere, expired, revoked). Showing
 *   them the public page beats bouncing them to /login from their own home.
 *
 * So once Clerk has loaded, Clerk decides; until then the server's read
 * stands. Where the two disagree we also refresh the route, so the RSC payload
 * this navigation cached — and the next one the server renders, now that Clerk
 * has minted a fresh cookie — agrees with the screen the player is looking at.
 */
export default function HomeScreen({ signedInOnServer }: { signedInOnServer: boolean }) {
  const { isLoaded, isSignedIn } = useUser();
  const router = useRouter();
  const refreshed = useRef(false);

  const signedIn = isLoaded ? isSignedIn : signedInOnServer;

  useEffect(() => {
    // Once per mount: a disagreement the refresh doesn't settle must not turn
    // into a refresh loop.
    if (!isLoaded || isSignedIn === signedInOnServer || refreshed.current) {
      return;
    }
    refreshed.current = true;
    router.refresh();
  }, [isLoaded, isSignedIn, signedInOnServer, router]);

  return signedIn ? <Dashboard /> : <Landing />;
}
