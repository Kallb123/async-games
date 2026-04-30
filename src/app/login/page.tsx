'use client'

import { SignIn } from "@clerk/nextjs";

export default function Login() {
  return (
    <main>
      <SignIn />
    </main>
  );
}
