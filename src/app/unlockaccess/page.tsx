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
  }, [isLoaded, user]);

  if (!isLoaded || !user) {
    return null;
  }

  return (
    <main>
      <CurrentUserInfo />
      <PasswordForm></PasswordForm>
    </main>
  );
}
