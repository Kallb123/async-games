'use client'

import AuthScreen from "@/components/ui/AuthScreen";
import { SignUp } from "@clerk/nextjs";

// Catch-all route, for the same reason as `/login`: sign-up's later steps
// (email verification, extra fields, SSO callback) render at `/signup/<step>`.
export default function Signup() {
  return (
    <AuthScreen title="Start playing" subtitle="Create an account to join a game.">
      <SignUp />
    </AuthScreen>
  );
}
