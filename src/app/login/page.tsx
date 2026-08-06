'use client'

import { SignIn } from "@clerk/nextjs";

export default function Login() {
  return (
    <main>
      <div className="ag-topbar">
        <span className="ag-wordmark">Async Games</span>
      </div>
      <div className="ag-hero">
        <h1 className="ag-hero-title">Your turn awaits</h1>
        <p className="ag-hero-sub">Sign in to pick up your games.</p>
      </div>
      <div className="ag-section" style={{ display: "flex", justifyContent: "center" }}>
        <SignIn />
      </div>
    </main>
  );
}
