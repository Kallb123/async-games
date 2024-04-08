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
    if (isLoaded) {
        if (!user) {
            router.push('/login');
        }

        // Use `user` to render user details or create UI elements
        const unlocked = user?.publicMetadata.unlocked;
      
        if (unlocked !== true) {
          router.push('/unlockaccess');
        }
    }
  }, [isLoaded]);

  // Use `user` to render user details or create UI elements
  const unlocked = user?.publicMetadata.unlocked;

  return (
    <main>
      <CurrentUserInfo />
      <PasswordForm></PasswordForm>
    </main>
  );
}
