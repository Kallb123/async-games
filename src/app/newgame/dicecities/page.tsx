'use client'
import { useUser } from "@clerk/nextjs";
import FcmTokenComp from "@/components/FirebaseForeground";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Button } from "react-bootstrap";
import CurrentUserInfo from "@/components/CurrentUserInfo";

export default function Home() {
  const { user, isLoaded } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (isLoaded) {
        if (!user) {
            router.push('/login');
        }

        // Use `user` to render user details or create UI elements
        const unlocked = user?.publicMetadata.unlocked;
      
        if (unlocked !== true) {
          console.log(user, unlocked);
          router.push('/unlockaccess');
        }
    }
  }, [isLoaded]);

  return (
    <main>
      <h1>New Game: Dice Cities</h1>
        <Button disabled>Settlements and Cities</Button>
        <Button href="/newgame/dicecities">Dice Cities</Button>
        <Button disabled>Chess</Button>
        <CurrentUserInfo />
        <FcmTokenComp />
    </main>
  );
}
