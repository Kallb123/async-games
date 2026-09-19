'use client'

import AuthScreen from "@/components/ui/AuthScreen";
import AuthCardStack from "@/components/ui/AuthCardStack";
import { SignIn } from "@clerk/nextjs";

// Catch-all route: Clerk's components use path routing under Next.js, so the
// steps after the first one (2FA, password reset, SSO callback) render at
// `/login/<step>` and need to resolve to this same page.
export default function Login() {
  return (
    <AuthScreen title="Your turn awaits" subtitle="Sign in to pick up your games.">
      <AuthCardStack>
        <SignIn />
      </AuthCardStack>
    </AuthScreen>
  );
}
