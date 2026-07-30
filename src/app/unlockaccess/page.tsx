'use client'

import PasswordForm from "@/components/PasswordForm";
import { useUser } from "@clerk/nextjs";
import { usePathname, useRouter } from "next/navigation";
import CurrentUserInfo from "@/components/CurrentUserInfo";
import { useEffect } from "react";

export default function UnlockAccess() {
  const pathName = usePathname();
  console.log(`GET ${pathName}`);
  const router = useRouter();
  
  const { user, isLoaded } = useUser();

  useEffect(() => {
    if (isLoaded && !user) {
        router.push('/login');
    }
  }, [isLoaded, user, router]);

  if (!isLoaded || !user) {
    return null;
  }

  return (
    <main>
      <div className="ag-topbar">
        <span className="ag-wordmark">Async Games</span>
      </div>
      <div className="ag-hero">
        <h1 className="ag-hero-title">One more step</h1>
        <p className="ag-hero-sub">Enter the access password to unlock your games.</p>
      </div>
      <div className="ag-section">
        <PasswordForm></PasswordForm>
      </div>
      <div className="ag-footer"><CurrentUserInfo /></div>
    </main>
  );
}
