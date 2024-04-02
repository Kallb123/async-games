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
      <h1>Async Gaming</h1>
      <Button href="/newgame">New Game</Button>
      <h2>Your Turn</h2>
      <hr />
      <h2>Incoming Invites</h2>
      <hr />
      <h2>Their Turn</h2>
      <hr />
      <h2>Awaiting Response</h2>
      <hr />
      <CurrentUserInfo />
      <FcmTokenComp />
    </main>
  );
}
