import { clerkSetup } from '@clerk/testing/playwright';

// Runs once before any project. Fetches a Clerk Testing Token with
// CLERK_SECRET_KEY (dev-instance key only — clerkSetup refuses a production
// one) so the sign-ins in e2e/auth.setup.ts aren't blocked by Clerk's bot
// detection, which a headless browser would otherwise trip.
export default async function globalSetup() {
  await clerkSetup();
}
