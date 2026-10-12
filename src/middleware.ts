import { clerkMiddleware } from "@clerk/nextjs/server";

export default clerkMiddleware();

// The API only. Pages are left out on purpose: they authorise on the client
// (`useAuthGuard`), and nothing here protects a route, so running Clerk in
// front of them bought nothing but a cost. A document request carrying an
// expired session token (a minute idle is enough) is answered with a handshake
// — a redirect out to Clerk's Frontend API and back, and one more to tidy the
// URL — before the page is served at all. API requests are never documents, so
// Clerk answers an expired token there with signed-out state and the route's
// own 401, which `fetchWithSessionRetry` renews and retries.
//
// The cost of leaving a page out is that `auth()` and `currentUser()` throw
// there, since the middleware is what hands them the request. A guard test
// (`middleware.test.ts`) fails if a page can reach either; a page that really
// needs server-side auth has to be added to this matcher.
export const config = {
  matcher: ["/(api|trpc)(.*)"],
};
