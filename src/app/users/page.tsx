'use client'
import FcmTokenComp from "@/components/FirebaseForeground";
import { useUser } from "@clerk/nextjs";
import { User } from "@clerk/nextjs/server";
import { useRouter } from 'next/navigation';
import { useEffect, useState } from "react";

export default function Home() {
  const { user, isLoaded } = useUser();
  const router = useRouter();

  const [users, setUsers] = useState([] as User[]);

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
    fetch('/api/users')
    .then(response => response.json())
    .then(data => setUsers(data.users));
  }, [isLoaded]);
    
  const handleNotify = async (userId: string, e: React.MouseEvent<HTMLLIElement>) => {
    e.preventDefault();

    try {
      const response = await fetch('/api/notifyuser', {
        method: "POST",
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({userId})
      });

      if (!response.ok) {
          console.error(response);
      }

      console.log("User notified");
    } catch (error) {
      console.error(error);
    }
  }

  return (
    <main>
      <div>
        <p>
          Hello {user?.firstName} {user?.lastName}. Unlocked: {user?.publicMetadata.unlocked === true ? "Yes" : "No"}
        </p>
      </div>
      <div>
        <ul>
            {users.map((userMap) => (
                <li key={userMap.id} onClick={(e) => handleNotify(userMap.id, e)}>{userMap.firstName} {userMap.lastName} ({userMap.username})</li>
            ))}
        </ul>
      </div>
      <FcmTokenComp /> 
    </main>
  );
}
