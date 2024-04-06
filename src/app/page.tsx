'use client'
import { useUser } from "@clerk/nextjs";
import { FcmTokenComp } from "@/components/FirebaseForeground";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { Button } from "react-bootstrap";
import CurrentUserInfo from "@/components/CurrentUserInfo";
import IncomingInviteList from "@/components/IncomingInvitesList";
import OutgoingInviteList from "@/components/OutgoingInviteList";
import MyTurnList from "@/components/MyTurnList";
import TheirTurnList from "@/components/TheirTurnList";
import DevTools from "@/components/DevTools";

export default function Home() {
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
          router.push('/unlockaccess');
        }
    }
  }, [isLoaded]);

  return (
    <main>
      <FcmTokenComp />
      <h1>Async Gaming</h1>
      <Button href="/newgame">New Game</Button>
      <MyTurnList />
      <hr />
      <IncomingInviteList />
      <hr />
      <TheirTurnList />
      <hr />
      <OutgoingInviteList />
      <hr />
      <CurrentUserInfo />
    </main>
  );
}
