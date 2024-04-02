'use client'
import styles from "./page.module.css";
import { useUser } from "@clerk/nextjs";
import FcmTokenComp from "@/components/FirebaseForeground";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Button } from "react-bootstrap";

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
    <main className={styles.main}>
      <Button>New Game</Button>
      <h2>Your Turn</h2>
      <hr />
      <h2>Incoming Invites</h2>
      <hr />
      <h2>Their Turn</h2>
      <hr />
      <h2>Awaiting Response</h2>
      <hr />
      <div className={styles.description}>
        <p>
          Hello {user?.firstName} {user?.lastName}. Unlocked: {user?.publicMetadata.unlocked === true ? "Yes" : "No"}
        </p>
      </div>
      <FcmTokenComp />
    </main>
  );
}
