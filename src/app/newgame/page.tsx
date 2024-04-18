'use client'
import { useUser } from "@clerk/nextjs";
import { FcmTokenComp } from "@/components/FirebaseForeground";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { Button } from "react-bootstrap";
import CurrentUserInfo from "@/components/CurrentUserInfo";

export default function NewGame() {
  const pathName = usePathname();
  console.log(`GET ${pathName}`);
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
        <h1>New Game</h1>
        <h2><a href="/">Home</a></h2>
        <h2>Select a Game</h2>
        <Button disabled>Snakes and Ladders</Button><br />
        <Button disabled>Ludo</Button><br />
        <Button disabled>Chess</Button><br />
        <Button href="/newgame/dicecities">Dice Cities</Button><br />
        <Button disabled>Settlements and Cities</Button><br />
        <Button disabled>Haunted Campground</Button>
        <CurrentUserInfo />
        <FcmTokenComp />
    </main>
  );
}
