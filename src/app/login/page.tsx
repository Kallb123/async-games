'use client'

import { SignIn } from "@clerk/nextjs";

export default function Login() {
  return (
    <main style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "48px 20px" }}>
      <div className="ag-wordmark" style={{ marginBottom: 24, fontSize: 26 }}>Async Games</div>
      <SignIn />
    </main>
  );
}
