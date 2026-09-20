import type { useSignIn } from "@clerk/nextjs/legacy";

type SignInHook = ReturnType<typeof useSignIn>;

/**
 * Turns a Clerk sign-in ticket into a session on this device: the three-line
 * Clerk dance every ticket flow in the app needs, and the other half of
 * `mintSignInToken` (users/signInTokens.ts).
 *
 * Three screens redeem one — a guest's own join, a returning guest's resume
 * link (docs/account-less-play.md §2/§15) and the Android app's Google button
 * (`useNativeGoogleSignIn`) — and each keeps its own follow-up and its own
 * error handling. This is only the part that is identical.
 *
 * Takes the hook's pieces rather than calling the hook, so it stays a plain
 * function that a component or another hook can both use.
 */
export async function completeTicketSignIn(
  signIn: NonNullable<SignInHook['signIn']>,
  setActive: NonNullable<SignInHook['setActive']>,
  ticket: string,
): Promise<boolean> {
  const attempt = await signIn.create({ strategy: 'ticket', ticket });
  if (attempt.status !== 'complete' || !attempt.createdSessionId) {
    return false;
  }
  await setActive({ session: attempt.createdSessionId });
  return true;
}
